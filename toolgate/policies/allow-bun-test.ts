import { allow, next, type ToolCall } from "../../src";
import { safeBashTokens } from "./parse-bash";

/**
 * Allow simple `bun test` commands. Rejects compound commands,
 * shell substitutions, and multiline inputs.
 */
export default async function allowBunTest(call: ToolCall) {
  const tokens = safeBashTokens(call);
  if (!tokens) return next();

  if (tokens[0] === "bun" && tokens[1] === "test") {
    return allow();
  }

  return next();
}
