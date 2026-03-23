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
