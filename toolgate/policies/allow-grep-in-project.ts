import { allow, next, type ToolCall } from "../../src";

/**
 * Allow Grep tool calls when the search path is within the project root.
 * Also allows when no path is specified (defaults to cwd, which is in-project).
 */
export default async function allowGrepInProject(call: ToolCall) {
  if (call.tool !== "Grep") {
    return next();
  }

  if (!call.context.projectRoot) {
    return next();
  }

  const searchPath = call.args.path;

  // No path specified — Grep defaults to cwd
  if (searchPath === undefined) {
    if (call.context.cwd.startsWith(call.context.projectRoot)) {
      return allow();
    }
    return next();
  }

  if (typeof searchPath !== "string") {
    return next();
  }

  if (searchPath.startsWith(call.context.projectRoot + "/") || searchPath === call.context.projectRoot) {
    return allow();
  }

  return next();
}
