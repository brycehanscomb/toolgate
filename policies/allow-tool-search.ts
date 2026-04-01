import { allow, next, type Policy } from "../src";

/**
 * Allow all ToolSearch tool calls unconditionally.
 * ToolSearch only fetches tool schemas — it has no side effects.
 */
const allowToolSearch: Policy = {
  name: "Allow ToolSearch",
  description: "Permits all ToolSearch tool calls",
  handler: async (call) => {
    if (call.tool !== "ToolSearch") return next();
    return allow();
  },
};
export default allowToolSearch;
