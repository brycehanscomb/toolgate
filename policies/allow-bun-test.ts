import { allow, next, type Policy } from "../src";
import { safeBashTokensOrPipeline } from "./parse-bash";

/**
 * Allow simple `bun test` commands, optionally piped through safe filters
 * like grep, head, tail. Rejects compound commands, shell substitutions,
 * and multiline inputs.
 */
const allowBunTest: Policy = {
  name: "Allow bun test",
  description: "Permits bun test commands, optionally piped through safe filters",
  handler: async (call) => {
    const tokens = safeBashTokensOrPipeline(call);
    if (!tokens) return next();

    if (tokens[0] === "bun" && tokens[1] === "test") {
      return allow();
    }

    return next();
  },
};
export default allowBunTest;
