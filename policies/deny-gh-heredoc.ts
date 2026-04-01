import { deny, next, type Policy } from "../src";
import { parseShell, hasUnsafeNodes } from "./parse-bash-ast";

/**
 * Deny gh/git commands that use command substitution (typically heredocs for
 * multi-line bodies or commit messages). Instructs Claude to write content to
 * a tmp/ file in the project first, then use --body-file / --input / -F,
 * which is safer (no shell escaping issues) and reviewable via the Write tool.
 */
const denyGhHeredoc: Policy = {
  name: "Deny gh/git heredoc/command substitution",
  description:
    "Rejects gh/git commands containing $(…) — use Write tool + --body-file, --input, or -F instead",
  handler: async (call) => {
    if (call.tool !== "Bash") return next();
    const command = call.args.command;
    if (typeof command !== "string") return next();

    // Quick check: must involve gh or git, and command substitution syntax
    if (!command.includes("gh ") && !command.includes("git ")) return next();
    if (!command.includes("$(") && !command.includes("`")) return next();

    const ast = await parseShell(command);
    if (!ast) return next();

    // Only deny if the AST actually contains unsafe nodes (CmdSubst, ParamExp, etc.)
    if (!hasUnsafeNodes(ast)) return next();

    if (command.includes("git ")) {
      return deny(
        "Do not use command substitution or heredocs in git commands. " +
          "Instead, write the message to a file in the project's tmp/ directory with the Write tool, " +
          "then use `git commit -F tmp/<file>` or `git tag -F tmp/<file>`. " +
          "Clean up with `rm tmp/<file>` afterwards. " +
          "This avoids shell escaping issues and lets the user review the content first.",
      );
    }

    return deny(
      "Do not use command substitution or heredocs in gh commands. " +
        "Instead, write the body to a file in the project's tmp/ directory with the Write tool, " +
        "then use `gh pr comment --body-file tmp/<file>`, `gh issue comment --body-file tmp/<file>`, " +
        "or `gh api --input tmp/<file>`. Clean up with `rm tmp/<file>` afterwards. " +
        "This avoids shell escaping issues and lets the user review the content first.",
    );
  },
};
export default denyGhHeredoc;
