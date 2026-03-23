import { deny, next, type ToolCall } from "../../src";

/**
 * Deny Write and Edit tool calls that target files outside the project root.
 */
export default async function denyWritesOutsideProject(call: ToolCall) {
  if (call.tool !== "Write" && call.tool !== "Edit") {
    return next();
  }

  if (!call.context.projectRoot) {
    return next();
  }

  const filePath = call.args.file_path;
  if (typeof filePath !== "string") {
    return next();
  }

  if (!filePath.startsWith(call.context.projectRoot + "/") && filePath !== call.context.projectRoot) {
    return deny(`Write blocked: ${filePath} is outside project root`);
  }

  return next();
}
