import { allow, next, type Policy } from "../src";
import { safeBashTokensOrPipeline } from "./parse-bash";

/**
 * Allow simple `git status` commands, optionally piped through safe filters.
 */
const allowGitStatus: Policy = {
  name: "Allow git status",
  description: "Permits git status commands, optionally piped through safe filters",
  handler: async (call) => {
    const tokens = safeBashTokensOrPipeline(call);
    if (!tokens) return next();

    if (tokens[0] === "git" && tokens[1] === "status") {
      return allow();
    }

    return next();
  },
};
export default allowGitStatus;
