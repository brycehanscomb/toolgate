import { homedir } from "os";
import { allow, next, type Policy } from "../src";

const SITES_DIR = `${homedir()}/Sites`;

const FILE_TOOLS = new Set(["Read", "Write", "Edit"]);
const PATH_TOOLS = new Set(["Glob", "Grep"]);

function getPath(tool: string, args: Record<string, any>): string | null {
  if (FILE_TOOLS.has(tool))
    return typeof args.file_path === "string" ? args.file_path : null;
  if (PATH_TOOLS.has(tool))
    return typeof args.path === "string" ? args.path : null;
  return null;
}

const allowFileOpsInSites: Policy = {
  name: "Allow file ops in ~/Sites",
  description: "Permits Read/Write/Edit/Glob/Grep on paths within ~/Sites",
  handler: async (call) => {
    if (!FILE_TOOLS.has(call.tool) && !PATH_TOOLS.has(call.tool))
      return next();

    const path = getPath(call.tool, call.args);
    if (!path) return next();

    if (path === SITES_DIR || path.startsWith(SITES_DIR + "/")) {
      return allow();
    }
    return next();
  },
};
export default allowFileOpsInSites;
