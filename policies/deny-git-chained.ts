import { deny, next, type Policy } from "../src";
import { parseShell, Op } from "./parse-bash-ast";

/**
 * Deny git commands chained with &&, ||, or ;.
 * Each git operation should be a separate Bash call so it gets
 * its own policy evaluation and clearer error handling.
 * Pipes (git log | head) are fine — they're a single logical operation.
 */
const denyGitChained: Policy = {
  name: "Deny git chained with other commands",
  description:
    "Rejects git && ..., git; ..., or git || ... chains — run each git command separately",
  handler: async (call) => {
    if (call.tool !== "Bash") return next();
    const cmd = call.args.command;
    if (typeof cmd !== "string") return next();
    if (!cmd.includes("git")) return next();

    const ast = await parseShell(cmd);
    if (!ast) return next();

    // Multiple statements means ; chaining
    if (ast.Stmts.length > 1) {
      const hasGit = ast.Stmts.some((stmt) => {
        if (!stmt.Cmd || stmt.Cmd.Type !== "CallExpr") return false;
        const firstArg = stmt.Cmd.Args?.[0]?.Parts?.[0];
        return firstArg?.Type === "Lit" && firstArg.Value === "git";
      });
      if (hasGit) {
        return deny(
          "Don't chain git commands. Run each git command as its own Bash call for independent policy evaluation and error handling.",
        );
      }
    }

    // Single statement with BinaryCmd (&&, ||)
    if (ast.Stmts.length === 1 && ast.Stmts[0].Cmd?.Type === "BinaryCmd") {
      if (containsGitBinary(ast.Stmts[0].Cmd)) {
        return deny(
          "Don't chain git commands. Run each git command as its own Bash call for independent policy evaluation and error handling.",
        );
      }
    }

    return next();
  },
};

function containsGitBinary(cmd: any): boolean {
  if (!cmd) return false;
  if (cmd.Type === "CallExpr") {
    const firstArg = cmd.Args?.[0]?.Parts?.[0];
    return firstArg?.Type === "Lit" && firstArg.Value === "git";
  }
  if (cmd.Type === "BinaryCmd") {
    // Pipes are a single logical operation, not chaining — skip them
    if (cmd.Op === Op.Pipe || cmd.Op === Op.PipeAll) return false;
    return containsGitBinary(cmd.X?.Cmd) || containsGitBinary(cmd.Y?.Cmd);
  }
  return false;
}

export default denyGitChained;
