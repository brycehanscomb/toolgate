import { allow, next, type Policy } from "../src";
import { safeBashTokensOrPipeline } from "./parse-bash";

/**
 * Allow simple `git rev-parse` commands, optionally piped through safe filters.
 */
const allowGitRevParse: Policy = {
  name: "Allow git rev-parse",
  description:
    "Permits git rev-parse commands, optionally piped through safe filters",
  handler: async (call) => {
    const tokens = safeBashTokensOrPipeline(call);
    if (!tokens) return next();

    if (tokens[0] === "git" && tokens[1] === "rev-parse") {
      return allow();
    }

    return next();
  },
};
export default allowGitRevParse;
