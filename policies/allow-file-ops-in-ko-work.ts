import { homedir } from "os";
import { allow, next, type Policy } from "../src";

const KO_WORK_DIR = `${homedir()}/ko-work`;

const FILE_TOOLS = new Set(["Read", "Write", "Edit"]);
const PATH_TOOLS = new Set(["Glob", "Grep"]);

function getPath(tool: string, args: Record<string, any>): string | null {
  if (FILE_TOOLS.has(tool))
    return typeof args.file_path === "string" ? args.file_path : null;
  if (PATH_TOOLS.has(tool))
    return typeof args.path === "string" ? args.path : null;
  return null;
}

const allowFileOpsInKoWork: Policy = {
  name: "Allow file ops in ~/ko-work",
  description: "Permits Read/Write/Edit/Glob/Grep on paths within ~/ko-work",
  handler: async (call) => {
    if (!FILE_TOOLS.has(call.tool) && !PATH_TOOLS.has(call.tool))
      return next();

    const path = getPath(call.tool, call.args);
    if (!path) return next();

    if (path === KO_WORK_DIR || path.startsWith(KO_WORK_DIR + "/")) {
      return allow();
    }
    return next();
  },
};
export default allowFileOpsInKoWork;
