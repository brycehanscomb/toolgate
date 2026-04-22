import { resolve } from "node:path";
import { isWithinProject, type Policy } from "../src";
import { parseShell, getPipelineCommands, getArgs, isSafeFilter } from "./parse-bash-ast";

const allowBashFindInProject: Policy = {
  name: "Allow bash find in project",
  description: "Permits find commands when all paths are within the project root",
  action: "allow",
  handler: async (call) => {
    if (call.tool !== "Bash") return;
    if (typeof call.args.command !== "string") return;
    if (!call.context.projectRoot) return;

    const ast = await parseShell(call.args.command);
    if (!ast || ast.Stmts.length !== 1) return;

    const cmds = getPipelineCommands(ast.Stmts[0]);
    if (!cmds) return;

    const tokens = getArgs(cmds[0]);
    if (!tokens || tokens[0] !== "find") return;

    for (let i = 1; i < cmds.length; i++) {
      const args = getArgs(cmds[i]);
      if (!args || !isSafeFilter(args)) return;
    }

    const SAFE_FLAGS = new Set([
      "-print", "-print0", "-ls",
      "-name", "-iname", "-path", "-ipath", "-regex", "-iregex",
      "-type", "-size", "-empty", "-newer", "-perm", "-user", "-group",
      "-mtime", "-atime", "-ctime", "-mmin", "-amin", "-cmin",
      "-readable", "-writable", "-executable",
      "-maxdepth", "-mindepth",
      "-not", "-and", "-or", "-a", "-o", "!",
      "-follow", "-xdev", "-mount", "-daystart",
      "-true", "-false", "-prune",
    ]);

    for (const t of tokens.slice(1)) {
      if (t.startsWith("-") && !SAFE_FLAGS.has(t)) return;
      if (t === "(" || t === ")" || t === "\\(" || t === "\\)") return;
    }

    const root = call.context.projectRoot;
    const args = tokens.slice(1);
    const paths: string[] = [];
    for (const arg of args) {
      if (arg.startsWith("-") || arg === "!" || arg === "(") break;
      paths.push(arg);
    }

    if (paths.length === 0) {
      return isWithinProject(call.context.cwd, call.context) ? true : undefined;
    }

    const allInProject = paths.every((p) => {
      const resolved = resolve(call.context.cwd, p);
      return isWithinProject(resolved, call.context);
    });

    return allInProject ? true : undefined;
  },
};
export default allowBashFindInProject;
