import { allow, next, type Policy } from "../src";
import { safeBashTokensOrPipeline } from "./parse-bash";

/**
 * Allow simple `git diff` commands, optionally piped through safe filters.
 */
const allowGitDiff: Policy = {
  name: "Allow git diff",
  description: "Permits git diff commands, optionally piped through safe filters",
  handler: async (call) => {
    const tokens = safeBashTokensOrPipeline(call);
    if (!tokens) return next();

    if (tokens[0] === "git" && tokens[1] === "diff") {
      return allow();
    }

    return next();
  },
};
export default allowGitDiff;
