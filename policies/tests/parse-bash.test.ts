import { describe, expect, it } from "bun:test";
import type { ToolCall } from "toolgate";
import { safeBashTokens } from "../parse-bash";

function bash(command: string): ToolCall {
  return {
    tool: "Bash",
    args: { command },
    context: { cwd: "/tmp", env: {}, projectRoot: null },
  };
}

describe("safeBashTokens", () => {
  describe("returns tokens for simple commands", () => {
    it("single command", () => {
      expect(safeBashTokens(bash("git status"))).toEqual(["git", "status"]);
    });

    it("command with flags", () => {
      expect(safeBashTokens(bash("git log --oneline -5"))).toEqual([
        "git", "log", "--oneline", "-5",
      ]);
    });

    it("command with file paths", () => {
      expect(safeBashTokens(bash("git add src/foo.ts bar/baz.ts"))).toEqual([
        "git", "add", "src/foo.ts", "bar/baz.ts",
      ]);
    });
  });

  describe("returns null for non-Bash tools", () => {
    it("Read tool", () => {
      const call: ToolCall = {
        tool: "Read",
        args: { file_path: "/foo" },
        context: { cwd: "/tmp", env: {}, projectRoot: null },
      };
      expect(safeBashTokens(call)).toBeNull();
    });

    it("Write tool", () => {
      const call: ToolCall = {
        tool: "Write",
        args: {},
        context: { cwd: "/tmp", env: {}, projectRoot: null },
      };
      expect(safeBashTokens(call)).toBeNull();
    });
  });

  describe("returns null for invalid command args", () => {
    it("command is a number", () => {
      const call: ToolCall = {
        tool: "Bash",
        args: { command: 123 },
        context: { cwd: "/tmp", env: {}, projectRoot: null },
      };
      expect(safeBashTokens(call)).toBeNull();
    });

    it("command is missing", () => {
      const call: ToolCall = {
        tool: "Bash",
        args: {},
        context: { cwd: "/tmp", env: {}, projectRoot: null },
      };
      expect(safeBashTokens(call)).toBeNull();
    });
  });

  describe("returns null for multiline commands", () => {
    it("two commands on separate lines", () => {
      expect(safeBashTokens(bash("git add .\nrm -rf /"))).toBeNull();
    });

    it("blank line between commands", () => {
      expect(safeBashTokens(bash("git add .\n\necho pwned"))).toBeNull();
    });
  });

  describe("returns null for shell operators", () => {
    it("&&", () => {
      expect(safeBashTokens(bash("git add . && rm -rf /"))).toBeNull();
    });

    it("||", () => {
      expect(safeBashTokens(bash("git add . || echo fail"))).toBeNull();
    });

    it(";", () => {
      expect(safeBashTokens(bash("git add . ; echo pwned"))).toBeNull();
    });

    it("|", () => {
      expect(safeBashTokens(bash("git log | cat /etc/passwd"))).toBeNull();
    });

    it("&", () => {
      expect(safeBashTokens(bash("git add . & miner"))).toBeNull();
    });
  });

  describe("returns null for shell substitution", () => {
    it("$()", () => {
      expect(safeBashTokens(bash("git add $(whoami)"))).toBeNull();
    });

    it("backticks", () => {
      expect(safeBashTokens(bash("git add `cat /etc/shadow`"))).toBeNull();
    });

    it("quoted $()", () => {
      expect(safeBashTokens(bash('git add "$(whoami)"'))).toBeNull();
    });
  });

  describe("returns null for comments", () => {
    it("comment hiding payload", () => {
      expect(safeBashTokens(bash("git add . # && rm -rf /"))).toBeNull();
    });
  });
});
