# toolgate

A policy engine for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) tool permissions. Define policies that automatically allow, deny, or prompt for each tool call.

## Why

Claude Code asks permission before running tools like Bash commands, file writes, etc. Toolgate lets you codify your permission preferences as composable policies — so `git status` is always allowed, destructive commands are always denied, and everything else prompts as normal.

## Install

```bash
bun install -g toolgate
```

## Setup

```bash
# Register the PreToolUse hook globally
toolgate init

# Optionally, create a project-specific config
toolgate init --project
```

This registers a `PreToolUse` hook in `~/.claude/settings.json`. Toolgate ships with built-in policies that are always active.

## Configuration

Optionally add project-specific policies in `toolgate.config.ts` (project root or `.claude/`). These run **before** built-in policies:

```ts
import { definePolicy, deny, next } from "toolgate";

export default definePolicy([
  {
    name: "Deny dangerous commands",
    description: "Blocks rm -rf",
    handler: async (call) => {
      if (call.tool === "Bash" && call.args.command?.includes("rm -rf")) {
        return deny("Destructive command blocked");
      }
      return next();
    },
  },
]);
```

Project policies run first, then built-in. The first non-`next()` verdict wins.

## Writing Policies

A policy is an object with `name`, `description`, and an async `handler` function:

```ts
import { allow, deny, next, type Policy } from "toolgate";

const denyRmRf: Policy = {
  name: "Deny rm -rf",
  description: "Blocks destructive rm -rf commands",
  handler: async (call) => {
    if (call.tool !== "Bash") return next();
    if (call.args.command?.includes("rm -rf")) {
      return deny("Destructive command blocked");
    }
    return next();
  },
};
export default denyRmRf;
```

### Verdicts

| Verdict | Effect |
|---------|--------|
| `allow()` | Permit the tool call silently |
| `deny(reason?)` | Block the tool call |
| `next()` | No opinion — pass to next policy (or prompt user if none remain) |

### ToolCall

Each policy handler receives a `ToolCall` with:

- `tool` — tool name (`"Bash"`, `"Read"`, `"Write"`, `"Edit"`, etc.)
- `args` — tool arguments (e.g. `{ command: "git status" }` for Bash)
- `context.cwd` — working directory
- `context.projectRoot` — git repository root (or `null`)
- `context.env` — environment variables

### Bash Policy Safety

When writing policies for Bash commands, don't parse raw strings with regex — use the utilities from `toolgate/utils` instead. They handle shell quoting, operator detection, and metacharacter rejection for you.

```ts
import { safeBashTokens } from "toolgate/utils";
import { allow, next, type Policy } from "toolgate";

const allowMake: Policy = {
  name: "Allow make",
  description: "Permits simple make commands",
  handler: async (call) => {
    const tokens = safeBashTokens(call);
    if (!tokens) return next();
    if (tokens[0] === "make") return allow();
    return next();
  },
};
```

#### `safeBashTokens(call)`

Parses a Bash tool call into a flat `string[]` of tokens. Returns `null` if the command contains newlines, shell operators (`&&`, `||`, `;`, `|`, `&`), redirects, or metacharacters (`$`, `` ` ``, `{`, `}`, etc.). Use this for simple, single-command policies.

#### `safeBashPipeline(call)`

Like `safeBashTokens`, but allows pipes. Returns `string[][]` — one token array per pipe segment. Returns `null` for non-pipe operators or unsafe patterns. Use this when you need to allow commands like `git log | head`.

```ts
import { safeBashPipeline, isSafeFilter } from "toolgate/utils";

const tokens = safeBashPipeline(call);
if (!tokens) return next();

// First segment is the main command, rest must be safe filters
const [main, ...filters] = tokens;
if (main[0] === "git" && filters.every(isSafeFilter)) {
  return allow();
}
```

#### `isSafeFilter(tokens)`

Returns `true` if a token array is a safe pipe filter — a command that only reads stdin and writes stdout. Safe filters: `grep`, `egrep`, `fgrep`, `head`, `tail`, `wc`, `cat`, `tr`, `cut`, `sort` (without `-o`), `uniq`.

#### `findGitRoot(cwd)`

Returns the git repository root for the given directory, or `null` if not in a repo.

See [`policies/allow-git-add.ts`](policies/allow-git-add.ts) for a full hardened example.

## CLI

```bash
# Dry-run a tool call against your policies
toolgate test Bash '{"command": "git add ."}'
# → ALLOW

# Show which policy matched and why
toolgate test --why Bash '{"command": "git add ."}'
# → ALLOW
#   why: Allow git add (index 4)
#   description: Permits simple git add commands without chaining or substitution

# List all loaded policies
toolgate list
```

## Example Policies

| Policy | Description |
|--------|-------------|
| `allow-git-add` | Permits `git add` with safe arguments |
| `allow-bun-test` | Permits `bun test` with safe arguments |
| `allow-read-in-project` | Permits `Read` tool for files within project root |
| `allow-explore-in-project` | Permits `Explore` agent within project root |
| `deny-writes-outside-project` | Blocks writes targeting paths outside the project |
| `deny-git-add-and-commit` | Forces `git add` and `git commit` into separate steps |
| `allow-task-create` | Permits `TaskCreate` tool calls for task tracking |

## License

MIT
