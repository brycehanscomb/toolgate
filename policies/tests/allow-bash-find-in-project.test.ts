import { describe, expect, it } from "bun:test";
import { ALLOW, NEXT, type ToolCall } from "toolgate";
import allowBashFindInProject from "../allow-bash-find-in-project";

const PROJECT = "/home/user/project";

function bash(command: string, cwd = PROJECT, projectRoot: string | null = PROJECT): ToolCall {
  return {
    tool: "Bash",
    args: { command },
    context: { cwd, env: {}, projectRoot },
  };
}

describe("allow-bash-find-in-project", () => {
  describe("allows find within project", () => {
    const allowed = [
      "find",
      "find .",
      "find ./src",
      "find src",
      "find src -name '*.ts'",
      "find . -type f -name '*.ts'",
      "find . -maxdepth 2 -name '*.json'",
      `find ${PROJECT}/src`,
      `find ${PROJECT}`,
      `find ${PROJECT} -name '*.ts'`,
    ];

    for (const cmd of allowed) {
      it(`allows: ${cmd}`, async () => {
        const result = await allowBashFindInProject.handler(bash(cmd));
        expect(result.verdict).toBe(ALLOW);
      });
    }
  });

  describe("rejects find outside project", () => {
    const rejected = [
      "find /etc",
      "find /home/user/other-project",
      "find /tmp",
      `find ${PROJECT}-evil`,
    ];

    for (const cmd of rejected) {
      it(`rejects: ${cmd}`, async () => {
        const result = await allowBashFindInProject.handler(bash(cmd));
        expect(result.verdict).toBe(NEXT);
      });
    }
  });

  describe("rejects bare find when cwd is outside project", () => {
    it("rejects find in /tmp", async () => {
      const result = await allowBashFindInProject.handler(bash("find", "/tmp"));
      expect(result.verdict).toBe(NEXT);
    });

    it("rejects find . in /tmp", async () => {
      const result = await allowBashFindInProject.handler(bash("find .", "/tmp"));
      expect(result.verdict).toBe(NEXT);
    });
  });

  describe("rejects compound commands", () => {
    const rejected = [
      "find . && rm -rf /",
      "find . | xargs rm",
      "find .\necho pwned",
    ];

    for (const cmd of rejected) {
      it(`rejects: ${JSON.stringify(cmd)}`, async () => {
        const result = await allowBashFindInProject.handler(bash(cmd));
        expect(result.verdict).toBe(NEXT);
      });
    }
  });

  it("passes through when no project root", async () => {
    const result = await allowBashFindInProject.handler(bash("find .", PROJECT, null));
    expect(result.verdict).toBe(NEXT);
  });

  it("passes through non-find commands", async () => {
    const result = await allowBashFindInProject.handler(bash("ls -la"));
    expect(result.verdict).toBe(NEXT);
  });
});
