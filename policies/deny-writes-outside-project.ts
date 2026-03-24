import { homedir } from "os";
import { resolve } from "path";
import { parse } from "shell-quote";
import { allow, deny, next, type Policy } from "../src";

const SAFE_WRITE_TARGETS = new Set(["/dev/null", "/dev/stderr", "/dev/stdout"]);

/**
* Deny Write/Edit tool calls and Bash redirects that target files outside the project root.
*/
const denyWritesOutsideProject: Policy = {
name: "Deny writes outside project",
description: "Blocks file writes and Bash redirects targeting paths outside the project root",
handler: async (call) => {
    if (!call.context.projectRoot) {
    return next();
    }

    const projectRoot = call.context.projectRoot;

    // Write and Edit: check file_path argument
    if (call.tool === "Write" || call.tool === "Edit") {
    const filePath = call.args.file_path;
    if (typeof filePath !== "string") {
        return next();
    }
    if (!isInsideProject(filePath, projectRoot)) {
        return deny(`Write blocked: ${filePath} is outside project root`);
    }
    return next();
    }

    // Bash: check for redirects writing outside project
    if (call.tool === "Bash") {
    const command = call.args.command;
    if (typeof command !== "string") {
        return next();
    }
    const result = findBashWriteOutsideProject(command, projectRoot, call.context.cwd);
    if (result === "outside") {
        return deny(`Write blocked: redirect target is outside project root`);
    }
    if (result === "safe") {
        return allow();
    }
    }

    return next();
},
};
export default denyWritesOutsideProject;

function isInsideProject(filePath: string, projectRoot: string): boolean {
return SAFE_WRITE_TARGETS.has(filePath) || filePath === projectRoot || filePath.startsWith(projectRoot + "/");
}

/**
* Resolve a path that may use ~ or be relative, returning an absolute path.
* Returns null if the path can't be meaningfully resolved.
*/
function resolvePath(p: string, cwd: string): string | null {
if (p.startsWith("~/")) {
    return homedir() + p.slice(1);
}
if (p === "~") {
    return homedir();
}
if (p.startsWith("/")) {
    return p;
}
// Relative path — resolve against cwd
if (!p.startsWith("-")) {
    return resolve(cwd, p);
}
return null;
}

/**
* Parse a Bash command and check redirect targets.
* Returns "outside" if any redirect targets a path outside the project,
* "safe" if all redirects target safe destinations (like /dev/null),
* or null if no redirects are detected.
*/
function findBashWriteOutsideProject(
command: string,
projectRoot: string,
cwd: string,
): "outside" | "safe" | null {
let hasSafeRedirect = false;

for (const line of command.split("\n")) {
    const tokens = parse(line);

    for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    // Check redirect operators: > and >>
    if (
        typeof token === "object" &&
        token !== null &&
        "op" in token &&
        (token.op === ">" || token.op === ">>")
    ) {
        const target = tokens[i + 1];
        if (typeof target === "string") {
        if (SAFE_WRITE_TARGETS.has(target)) {
            hasSafeRedirect = true;
            continue;
        }
        const resolved = resolvePath(target, cwd);
        if (resolved && !isInsideProject(resolved, projectRoot)) {
            return "outside";
        }
        }
    }
    }

    // Check for tee writing outside project (can appear after pipe)
    for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token !== "tee") continue;

    // Check args after tee until next operator
    for (let j = i + 1; j < tokens.length; j++) {
        const arg = tokens[j];
        if (typeof arg !== "string") break;
        if (arg.startsWith("-")) continue;
        if (SAFE_WRITE_TARGETS.has(arg)) {
        hasSafeRedirect = true;
        continue;
        }
        const resolved = resolvePath(arg, cwd);
        if (resolved && !isInsideProject(resolved, projectRoot)) {
        return "outside";
        }
    }
    }
}

return hasSafeRedirect ? "safe" : null;
}
