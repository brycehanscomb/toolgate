import { allow, next, type Policy } from "../src";
import { safeBashTokensOrPipeline } from "./parse-bash";

/**
 * Allow simple `git add` commands, optionally piped through safe filters.
 */
const allowGitAdd: Policy = {
  name: "Allow git add",
  description: "Permits git add commands, optionally piped through safe filters",
  handler: async (call) => {
    const tokens = safeBashTokensOrPipeline(call);
    if (!tokens) return next();

    if (tokens[0] === "git" && tokens[1] === "add") {
      return allow();
    }

    return next();
  },
};
export default allowGitAdd;
