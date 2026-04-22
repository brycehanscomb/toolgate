import { isWithinProject, type Policy } from "../src";
import { parseShell, getPipelineCommands, getArgs, isSafeFilter } from "./parse-bash-ast";

const allowLsInProject: Policy = {
  name: "Allow ls in project",
  description: "Permits ls commands when all paths are within the project root",
  action: "allow",
  handler: async (call) => {
    if (call.tool !== "Bash") return;
    if (typeof call.args.command !== "string") return;
    if (!call.context.projectRoot) return;

    const ast = await parseShell(call.args.command);
    if (!ast || ast.Stmts.length !== 1) return;

    const cmds = getPipelineCommands(ast.Stmts[0]);
    if (!cmds || cmds.length === 0) return;

    const tokens = getArgs(cmds[0]);
    if (!tokens || tokens[0] !== "ls") return;

    // All subsequent pipeline segments must be safe filters
    for (let i = 1; i < cmds.length; i++) {
      const segArgs = getArgs(cmds[i]);
      if (!segArgs || !isSafeFilter(segArgs)) return;
    }

    const root = call.context.projectRoot;
    const paths = tokens.slice(1).filter((t) => !t.startsWith("-"));

    if (paths.length === 0) {
      return isWithinProject(call.context.cwd, call.context) ? true : undefined;
    }

    const allInProject = paths.every((p) => {
      // Relative paths are resolved against cwd which is already in-project
      if (p.startsWith("./") || p === "." || !p.startsWith("/")) return true;
      return isWithinProject(p, call.context);
    });

    return allInProject ? true : undefined;
  },
};
export default allowLsInProject;
