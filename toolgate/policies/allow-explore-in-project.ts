import { allow, next, type ToolCall } from "../../src";

/**
 * Allow the Explore agent, but only when invoked within the project directory.
 */
export default async function allowExploreInProject(call: ToolCall) {
  if (call.tool !== "Agent") {
    return next();
  }

  if (call.args.subagent_type !== "Explore") {
    return next();
  }

  if (!call.context.projectRoot || !call.context.cwd.startsWith(call.context.projectRoot)) {
    return next();
  }

  return allow();
}
