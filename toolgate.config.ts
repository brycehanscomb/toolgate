import { homedir } from "os";
import { definePolicy } from "./src/index";
import { allow, next } from "./src/verdicts";

const CLAUDE_SETTINGS = `${homedir()}/.claude/settings.json`;

export default definePolicy([
  {
    name: "Allow Claude settings CRUD",
    description: "Permits Read/Write/Edit on ~/.claude/settings.json",
    handler: async (call) => {
      if (call.tool !== "Read" && call.tool !== "Write" && call.tool !== "Edit") {
        return next();
      }
      if (call.args.file_path === CLAUDE_SETTINGS) {
        return allow();
      }
      return next();
    },
  },
]);
