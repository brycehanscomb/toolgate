import { resolve } from "node:path";
import { allow, next, type Policy } from "../src";
import { safeBashTokens } from "./parse-bash";

/**
 * Allow simple `find` commands when all path arguments are within the project root.
 * Also allows bare `find` or `find .` when cwd is within the project.
 */
const allowBashFindInProject: Policy = {
  name: "Allow bash find in project",
  description: "Permits find commands when all paths are within the project root",
  handler: async (call) => {
    const tokens = safeBashTokens(call);
    if (!tokens) return next();

    if (tokens[0] !== "find") return next();
    if (!call.context.projectRoot) return next();

    const root = call.context.projectRoot;
    const args = tokens.slice(1);

    // Extract path arguments: everything before the first flag/expression token
    const paths: string[] = [];
    for (const arg of args) {
      if (arg.startsWith("-") || arg === "!" || arg === "(") break;
      paths.push(arg);
    }

    // Bare `find` with no paths — check cwd
    if (paths.length === 0) {
      if (call.context.cwd.startsWith(root + "/") || call.context.cwd === root) {
        return allow();
      }
      return next();
    }

    // All paths must be within project root
    const allInProject = paths.every((p) => {
      const resolved = resolve(call.context.cwd, p);
      return resolved.startsWith(root + "/") || resolved === root;
    });

    if (allInProject) {
      return allow();
    }

    return next();
  },
};
export default allowBashFindInProject;
