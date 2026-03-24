import { resolve } from "node:path";
import { allow, next, type Policy } from "../src";
import { safeBashPipeline, isSafeFilter } from "./parse-bash";

/**
 * Allow simple `find` commands when all path arguments are within the project root.
 * Also allows bare `find` or `find .` when cwd is within the project.
 * Supports piping to safe filter commands (grep, head, tail, etc.)
 */
const allowBashFindInProject: Policy = {
  name: "Allow bash find in project",
  description: "Permits find commands when all paths are within the project root",
  handler: async (call) => {
    const pipeline = safeBashPipeline(call);
    if (!pipeline) return next();

    const tokens = pipeline[0];
    if (tokens[0] !== "find") return next();
    if (!call.context.projectRoot) return next();

    // All pipe segments after the first must be safe filters
    for (let i = 1; i < pipeline.length; i++) {
      if (!isSafeFilter(pipeline[i])) return next();
    }

    // Whitelist of safe find predicates and options (read-only, no side effects)
    const SAFE_FLAGS = new Set([
      // Output format
      "-print", "-print0", "-ls",
      // Filtering predicates
      "-name", "-iname", "-path", "-ipath", "-regex", "-iregex",
      "-type", "-size", "-empty", "-newer", "-perm", "-user", "-group",
      "-mtime", "-atime", "-ctime", "-mmin", "-amin", "-cmin",
      "-readable", "-writable", "-executable",
      // Depth control
      "-maxdepth", "-mindepth",
      // Logical operators (no parens — too hard to reason about)
      "-not", "-and", "-or", "!",
      // Misc safe options
      "-follow", "-xdev", "-mount", "-daystart",
      "-true", "-false", "-prune",
    ]);

    // Every flag-like token must be in the whitelist
    for (const t of tokens.slice(1)) {
      if (t.startsWith("-") && !SAFE_FLAGS.has(t)) return next();
      // Block grouping parens
      if (t === "(" || t === ")") return next();
    }

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
