import { allow, next, type ToolCall } from "../../src";

/**
 * Allow file reads (Read tool) when the target is within the project directory.
 */
export default async function allowReadInProject(call: ToolCall) {
  if (call.tool !== "Read") {
    return next();
  }

  if (!call.context.projectRoot) {
    return next();
  }

  const filePath = call.args.file_path;
  if (typeof filePath !== "string" || !filePath.startsWith(call.context.projectRoot)) {
    return next();
  }

  return allow();
}
