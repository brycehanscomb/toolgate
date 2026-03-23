import { resolve } from "node:path";
import { allow, next, type ToolCall } from "../../src";

/**
 * Allow Search tool calls when the search path is within the project root.
 * Also allows when no path is specified (defaults to cwd, which is in-project).
 */
export default async function allowSearchInProject(call: ToolCall) {
  if (call.tool !== "Search" && call.tool !== "Glob") {
    return next();
  }

  if (!call.context.projectRoot) {
    return next();
  }

  const searchPath = call.args.path;

  // No path specified — Search defaults to cwd
  if (searchPath === undefined) {
    if (call.context.cwd.startsWith(call.context.projectRoot)) {
      return allow();
    }
    return next();
  }

  if (typeof searchPath !== "string") {
    return next();
  }

  // Resolve relative paths against cwd
  const resolved = resolve(call.context.cwd, searchPath);

  if (resolved.startsWith(call.context.projectRoot + "/") || resolved === call.context.projectRoot) {
    return allow();
  }

  return next();
}
