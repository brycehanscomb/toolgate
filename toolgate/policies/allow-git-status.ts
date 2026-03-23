import { allow, next, type ToolCall } from "../../src";
import { safeBashTokens } from "./parse-bash";

/**
 * Allow simple `git status` commands. Rejects compound commands,
 * shell substitutions, and multiline inputs.
 */
export default async function allowGitStatus(call: ToolCall) {
  const tokens = safeBashTokens(call);
  if (!tokens) return next();

  if (tokens[0] === "git" && tokens[1] === "status") {
    return allow();
  }

  return next();
}
