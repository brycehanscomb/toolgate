import { realpathSync } from "fs";
import { homedir } from "os";
import { resolve } from "path";
import { allow, next, type Policy } from "../src";

function resolvePath(p: string, projectRoot: string): string {
  if (p === "~") return homedir();
  if (p.startsWith("~/")) return homedir() + p.slice(1);
  if (!p.startsWith("/")) return resolve(projectRoot, p);
  return p;
}

function tryRealpath(p: string): string | null {
  try {
    return realpathSync(p);
  } catch {
    return null;
  }
}

function isWithin(child: string, parent: string): boolean {
  return child === parent || child.startsWith(parent + "/");
}

/**
 * Allow file reads (Read tool) when the target is within the project directory.
 * Resolves symlinks to prevent escaping the project via symlinked paths.
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

    const projectRoot = call.context.projectRoot;
    const resolved = resolvePath(filePath, projectRoot);

    // If the file exists, resolve symlinks and check the real path
    const realTarget = tryRealpath(resolved);
    const realRoot = tryRealpath(projectRoot);

    if (realTarget && realRoot) {
      return isWithin(realTarget, realRoot) ? allow() : next();
    }

    // File doesn't exist yet — fall back to string prefix check
    // only if the normalized path (with .. resolved) is within the project
    if (realRoot) {
      return isWithin(resolved, realRoot) ? allow() : next();
    }

    return isWithin(resolved, projectRoot) ? allow() : next();
  },
};
export default allowReadInProject;
