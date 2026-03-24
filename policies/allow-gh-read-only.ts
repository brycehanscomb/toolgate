import { allow, next, type Policy } from "../src";
import { safeBashTokensOrPipeline } from "./parse-bash";

/**
 * Read-only gh CLI subcommands that never mutate remote state.
 * Mapped as `command -> Set of safe subcommands`.
 */
const readOnlySubcommands: Record<string, Set<string>> = {
  issue: new Set(["view", "list"]),
  pr: new Set(["view", "list", "diff", "checks"]),
  run: new Set(["view", "list"]),
  search: new Set(["issues", "prs", "repos", "code", "commits"]),
  repo: new Set(["view"]),
  release: new Set(["view", "list"]),
};

/**
 * Allow read-only `gh` commands. Rejects compound commands,
 * shell substitutions, and multiline inputs.
 */
const allowGhReadOnly: Policy = {
  name: "Allow gh read-only",
  description:
    "Permits read-only gh CLI commands (view, list, diff, checks, search)",
  handler: async (call) => {
    const tokens = safeBashTokensOrPipeline(call);
    if (!tokens) return next();

    if (tokens[0] !== "gh") return next();

    const command = tokens[1];
    const subcommand = tokens[2];
    const allowed = readOnlySubcommands[command];

    if (allowed && subcommand && allowed.has(subcommand)) {
      return allow();
    }

    // gh api is GET (read-only) by default.
    // Block if any flag implies a mutating request.
    if (command === "api") {
      const mutatingFlags = new Set([
        "-X", "--method",
        "-f", "-F", "--field", "--raw-field",
        "--input",
      ]);

      for (let i = 2; i < tokens.length; i++) {
        const t = tokens[i];
        if (mutatingFlags.has(t)) return next();
        // Combined short form like -XPOST
        if (t.startsWith("-X") && t.length > 2) return next();
      }

      return allow();
    }

    return next();
  },
};
export default allowGhReadOnly;
