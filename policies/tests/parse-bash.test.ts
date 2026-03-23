import { describe, expect, it } from "bun:test";
import type { ToolCall } from "toolgate";
import { safeBashTokens, safeBashPipeline } from "../parse-bash";

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

  describe("strips fd-to-fd redirects", () => {
    it("2>&1 at end of command", () => {
      expect(safeBashTokens(bash("bun test foo 2>&1"))).toEqual([
        "bun", "test", "foo",
      ]);
    });

    it("1>&2 at end of command", () => {
      expect(safeBashTokens(bash("echo error 1>&2"))).toEqual([
        "echo", "error",
      ]);
    });
  });

  describe("returns null for file redirects", () => {
    it("> file", () => {
      expect(safeBashTokens(bash("echo hi > /tmp/out"))).toBeNull();
    });

    it(">> file", () => {
      expect(safeBashTokens(bash("echo hi >> /tmp/out"))).toBeNull();
    });
  });

  describe("returns null for comments", () => {
    it("comment hiding payload", () => {
      expect(safeBashTokens(bash("git add . # && rm -rf /"))).toBeNull();
    });
  });
});

describe("safeBashPipeline", () => {
  describe("returns segments for simple commands (no pipes)", () => {
    it("single command", () => {
      expect(safeBashPipeline(bash("git status"))).toEqual([["git", "status"]]);
    });

    it("command with flags", () => {
      expect(safeBashPipeline(bash("ls -la src"))).toEqual([["ls", "-la", "src"]]);
    });
  });

  describe("returns segments for piped commands", () => {
    it("two segments", () => {
      expect(safeBashPipeline(bash("ls -la | grep foo"))).toEqual([
        ["ls", "-la"],
        ["grep", "foo"],
      ]);
    });

    it("three segments", () => {
      expect(safeBashPipeline(bash("find . -name '*.ts' | grep src | head -5"))).toEqual([
        ["find", ".", "-name", "*.ts"],
        ["grep", "src"],
        ["head", "-5"],
      ]);
    });
  });

  describe("returns null for non-pipe operators", () => {
    it("&&", () => {
      expect(safeBashPipeline(bash("ls && rm -rf /"))).toBeNull();
    });

    it("||", () => {
      expect(safeBashPipeline(bash("ls || echo fail"))).toBeNull();
    });

    it(";", () => {
      expect(safeBashPipeline(bash("ls ; echo pwned"))).toBeNull();
    });

    it("&", () => {
      expect(safeBashPipeline(bash("ls & miner"))).toBeNull();
    });
  });

  describe("returns null for unsafe tokens within segments", () => {
    it("shell substitution in segment", () => {
      expect(safeBashPipeline(bash("echo $(whoami) | grep root"))).toBeNull();
    });

    it("backticks in segment", () => {
      expect(safeBashPipeline(bash("echo `id` | head"))).toBeNull();
    });

    it("metacharacters in token", () => {
      expect(safeBashPipeline(bash("echo ${HOME} | cat"))).toBeNull();
    });
  });

  describe("returns null for non-Bash tools and invalid input", () => {
    it("non-Bash tool", () => {
      const call: ToolCall = {
        tool: "Read",
        args: { file_path: "/foo" },
        context: { cwd: "/tmp", env: {}, projectRoot: null },
      };
      expect(safeBashPipeline(call)).toBeNull();
    });

    it("multiline command", () => {
      expect(safeBashPipeline(bash("ls\nrm -rf /"))).toBeNull();
    });
  });

  describe("strips fd-to-fd redirects", () => {
    it("2>&1 at end of pipeline", () => {
      expect(safeBashPipeline(bash("ls -la 2>&1 | grep foo"))).toEqual([
        ["ls", "-la"],
        ["grep", "foo"],
      ]);
    });

    it("2>&1 at end of command", () => {
      expect(safeBashPipeline(bash("bun test 2>&1"))).toEqual([
        ["bun", "test"],
      ]);
    });
  });

  describe("returns null for file redirects in pipeline", () => {
    it("> file after pipe", () => {
      expect(safeBashPipeline(bash("ls | grep foo > /tmp/out"))).toBeNull();
    });
  });

  describe("returns null for empty segments", () => {
    it("trailing pipe", () => {
      expect(safeBashPipeline(bash("ls |"))).toBeNull();
    });

    it("leading pipe", () => {
      expect(safeBashPipeline(bash("| ls"))).toBeNull();
    });
  });
});
