import { parse } from "shell-quote";
import type { ToolCall } from "../src";

/**
 * Parse a Bash tool call into a safe list of string tokens.
 *
 * Returns `null` if:
 * - The tool is not Bash
 * - The command is not a string
 * - The command contains newlines (command separators)
 * - The command contains shell operators (&&, ||, ;, |, &)
 * - The command contains file redirects (>, >>)
 * - The command contains shell metacharacters ($, `, {, }, etc.)
 *
 * Fd-to-fd redirects like `2>&1` are stripped (harmless stream merging).
 *
 * Returns `string[]` if the command is a single, simple command.
 */
export function safeBashTokens(call: ToolCall): string[] | null {
  if (call.tool !== "Bash") {
    return null;
  }

  if (typeof call.args.command !== "string") {
    return null;
  }

  if (call.args.command.includes("\n")) {
    return null;
  }

  const tokens = parse(call.args.command);
  const filtered = stripFdRedirects(tokens);
  if (!filtered) return null;

  if (filtered.some((t) => typeof t !== "string")) {
    return null;
  }

  if (filtered.some((t) => typeof t === "string" && /[`$|;&(){}]/.test(t))) {
    return null;
  }

  return filtered as string[];
}

/**
 * Strip fd-to-fd redirects (e.g. `2>&1`, `1>&2`) from a token array.
 * shell-quote parses `2>&1` as three tokens: "2", {op: ">&"}, "1".
 *
 * Returns the filtered token array, or null if a `>&` operator appears
 * without valid numeric fd references on both sides.
 */
function stripFdRedirects(tokens: ReturnType<typeof parse>): ReturnType<typeof parse> | null {
  const result: ReturnType<typeof parse> = [];
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    if (typeof token === "object" && token !== null && "op" in token && (token.op === ">&" || token.op === "<&")) {
      // Expect: prev token is numeric fd, next token is numeric fd
      const prev = result[result.length - 1];
      const next = tokens[i + 1];
      if (
        typeof prev === "string" && /^\d+$/.test(prev) &&
        typeof next === "string" && /^\d+$/.test(next)
      ) {
        result.pop(); // remove the fd number before the operator
        i += 2; // skip operator and fd number after
        continue;
      }
      // Invalid fd redirect pattern — reject
      return null;
    }
    result.push(token);
    i++;
  }
  return result;
}

/**
 * Parse a Bash tool call into a pipeline of safe token segments.
 *
 * Returns `null` if:
 * - The tool is not Bash
 * - The command is not a string
 * - The command contains newlines
 * - The command contains non-pipe operators (&&, ||, ;, &)
 * - Any segment contains shell metacharacters or substitution
 * - Any segment is empty
 *
 * Returns `string[][]` — one string[] per pipe segment.
 * A command with no pipes returns a single-element array.
 */
export function safeBashPipeline(call: ToolCall): string[][] | null {
  if (call.tool !== "Bash") return null;
  if (typeof call.args.command !== "string") return null;
  if (call.args.command.includes("\n")) return null;

  // Pre-parse check: reject shell expansion patterns that shell-quote silently resolves
  if (/\$[({]|`/.test(call.args.command)) return null;

  const rawTokens = parse(call.args.command);
  const tokens = stripFdRedirects(rawTokens);
  if (!tokens) return null;

  // Split tokens on pipe operators, reject any other operator
  const segments: string[][] = [];
  let current: string[] = [];

  for (const token of tokens) {
    if (typeof token === "object" && token !== null && "op" in token) {
      if (token.op === "|") {
        if (current.length === 0) return null;
        segments.push(current);
        current = [];
        continue;
      }
      // Any other operator (&&, ||, ;, &, >, >>) — reject
      return null;
    }
    if (typeof token !== "string") return null;
    if (/[`$;&]/.test(token)) return null;
    current.push(token);
  }

  if (current.length === 0) return null;
  segments.push(current);

  // Commands that accept regex/glob patterns may have |(){} in their args.
  // For all other commands, reject those characters as a defense-in-depth measure.
  for (const seg of segments) {
    if (!REGEX_COMMANDS.has(seg[0])) {
      if (seg.some((t) => /[|(){}]/.test(t))) return null;
    }
  }

  return segments;
}

/**
 * Commands whose arguments commonly contain regex/glob characters (|, (), {}).
 * These get a relaxed metacharacter check — only `$`, `` ` ``, `;`, `&` are
 * rejected in their tokens. All other commands get the full check.
 */
const REGEX_COMMANDS = new Set([
  "grep", "egrep", "fgrep",
  "find",
  "tr",
]);

/**
 * Commands that are safe to use as pipe filters — they only read stdin
 * and write to stdout, with no flags or modes that write to files.
 *
 * Excluded despite being "mostly safe":
 * - tee: writes to files by design
 * - xargs: executes arbitrary commands
 */
const SAFE_FILTERS = new Set([
  "grep", "egrep", "fgrep",
  "head", "tail",
  "wc",
  "cat",
  "tr",
  "cut",
]);

/**
 * Commands that are conditionally safe as filters — safe unless
 * specific flags or argument patterns are used.
 */
const CONDITIONAL_FILTERS: Record<string, (tokens: string[]) => boolean> = {
  sort: (tokens) => !tokens.some((t) => t === "-o" || t.startsWith("--output")),
  uniq: (tokens) => tokens.filter((t) => !t.startsWith("-")).length <= 1,
};

/**
 * Check if a token array represents a safe pipe filter command.
 * Returns true if the command only reads stdin and writes stdout.
 */
export function isSafeFilter(tokens: string[]): boolean {
  if (tokens.length === 0) return false;
  const cmd = tokens[0];

  if (SAFE_FILTERS.has(cmd)) return true;

  const check = CONDITIONAL_FILTERS[cmd];
  if (check) return check(tokens);

  return false;
}

/**
 * Parse a Bash tool call into safe string tokens, allowing pipes to safe filters.
 *
 * Like `safeBashTokens` but also accepts commands piped through safe filter
 * commands (grep, head, tail, wc, sort, etc.). Returns only the tokens from the
 * first segment so callers can match the actual command without caring about
 * the trailing filter.
 *
 * Returns `null` if the pipeline is unsafe or any tail segment isn't a safe filter.
 */
export function safeBashTokensOrPipeline(call: ToolCall): string[] | null {
  const segments = safeBashPipeline(call);
  if (!segments) return null;

  // All segments after the first must be safe filters
  for (let i = 1; i < segments.length; i++) {
    if (!isSafeFilter(segments[i])) return null;
  }

  return segments[0];
}
