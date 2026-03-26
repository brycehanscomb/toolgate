import { homedir } from "os";
import { allow, next, type Policy } from "../src";

function resolveHome(p: string): string {
  if (p === "~") return homedir();
  if (p.startsWith("~/")) return homedir() + p.slice(1);
  return p;
}

/**
 * Allow file reads (Read tool) when the target is within the project directory.
 */
const allowReadInProject: Policy = {
  name: "Allow read in project",
  description: "Permits Read tool calls targeting files within the project root",
  handler: async (call) => {
    if (call.tool !== "Read") {
      return next();
    }

    if (!call.context.projectRoot) {
      return next();
    }

    const filePath = call.args.file_path;
    if (typeof filePath !== "string") return next();

    const resolved = resolveHome(filePath);
    const projectRoot = call.context.projectRoot;
    if (resolved === projectRoot || resolved.startsWith(projectRoot + "/")) {
      return allow();
    }

    return next();
  },
};
export default allowReadInProject;
