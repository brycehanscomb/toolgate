import { allow, next, type Policy } from "../src";
import { safeBashTokens } from "./parse-bash";

/**
 * Allow simple `git rev-parse` commands. Rejects compound commands,
 * shell substitutions, and multiline inputs.
 */
const allowGitRevParse: Policy = {
  name: "Allow git rev-parse",
  description:
    "Permits simple git rev-parse commands without chaining or substitution",
  handler: async (call) => {
    const tokens = safeBashTokens(call);
    if (!tokens) return next();

    if (tokens[0] === "git" && tokens[1] === "rev-parse") {
      return allow();
    }

    return next();
  },
};
export default allowGitRevParse;
