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
 * - The command contains shell metacharacters ($, `, {, }, etc.)
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

  if (tokens.some((t) => typeof t !== "string")) {
    return null;
  }

  if (tokens.some((t) => typeof t === "string" && /[`$|;&(){}]/.test(t))) {
    return null;
  }

  return tokens as string[];
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

  const tokens = parse(call.args.command);

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
    if (/[`$|;&(){}]/.test(token)) return null;
    current.push(token);
  }

  if (current.length === 0) return null;
  segments.push(current);

  return segments;
}
