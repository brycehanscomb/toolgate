import { allow, next, type Policy } from "../src";
import { safeBashTokensOrPipeline } from "./parse-bash";

/**
 * Allow simple `git log` commands, optionally piped through safe filters.
 */
const allowGitLog: Policy = {
  name: "Allow git log",
  description: "Permits git log commands, optionally piped through safe filters",
  handler: async (call) => {
    const tokens = safeBashTokensOrPipeline(call);
    if (!tokens) return next();

    if (tokens[0] === "git" && tokens[1] === "log") {
      return allow();
    }

    return next();
  },
};
export default allowGitLog;
