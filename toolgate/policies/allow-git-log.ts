import { allow, next, type ToolCall } from "../../src";
import { safeBashTokens } from "./parse-bash";

/**
 * Allow simple `git log` commands. Rejects compound commands,
 * shell substitutions, and multiline inputs.
 */
export default async function allowGitLog(call: ToolCall) {
  const tokens = safeBashTokens(call);
  if (!tokens) return next();

  if (tokens[0] === "git" && tokens[1] === "log") {
    return allow();
  }

  return next();
}
