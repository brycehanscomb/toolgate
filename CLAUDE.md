# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Toolgate is a policy engine for Claude Code's PreToolUse hooks. It intercepts tool calls and makes permission decisions (allow/deny/ask) based on configurable middleware policies.

## Commands

```bash
bun test                              # run all tests
bun test src/                         # run core tests only
bun test toolgate/policies/tests/     # run policy tests only
bun test <path/to/file.test.ts>       # run a single test file
bun install                           # install dependencies
```

Use Bun exclusively — not Node.js, npm, yarn, or pnpm. Bun auto-loads `.env`.

## Architecture

**Data flow:** Claude Code hook (stdin JSON) → `cli.ts run` → `buildToolCall()` → `loadConfigs()` → `runPolicy()` middleware chain → hook response (stdout JSON)

### Core (`src/`)

- **`types.ts`** — `ToolCall`, `CallContext`, `VerdictResult`, `Middleware` type definitions
- **`verdicts.ts`** — Symbol-based verdict system: `ALLOW`, `DENY`, `NEXT` with helpers `allow()`, `deny(reason?)`, `next()`
- **`policy.ts`** — `definePolicy()` and `runPolicy()` — sequential middleware chain, returns first non-NEXT verdict
- **`config.ts`** — Loads project config (`./toolgate.config.ts` or `./.claude/toolgate.config.ts`) then global (`~/.claude/toolgate.config.ts`), concatenates middleware arrays
- **`runner.ts`** — Bridges Claude Code hook stdin/stdout protocol to the policy engine
- **`cli.ts`** — Subcommands: `run` (hook handler), `init` (setup), `test` (dry-run)
- **`testing.ts`** — `testPolicy()` assertion helper for policy test cases

### Policies (`toolgate/policies/`)

Each policy is a single `Middleware` function exported as default. Policies return `next()` to pass through, `allow()` to permit, or `deny(reason)` to block.

Config file (`toolgate.config.ts`) wires policies into the chain via `definePolicy([...])`. Order matters — first non-NEXT verdict wins.

### Key Patterns

- **Whitelist approach**: Policies explicitly allow known-safe patterns; everything else falls through as `next()` (prompts user)
- **Shell command safety**: Use `shell-quote` to parse Bash commands into tokens. Reject if any token is non-string (operators), contains shell metacharacters, or command has newlines
- **Self-imports in tests**: Policy tests import from `"toolgate"` (package self-reference) instead of relative `../../../src` paths
- **Middleware is async**: All middleware returns `Promise<VerdictResult>`

## Writing a Policy

```ts
import { allow, next, type ToolCall } from "../../src";

export default async function myPolicy(call: ToolCall) {
  if (call.tool !== "Bash") return next();
  // ... validation logic ...
  return allow();
}
```

For Bash policies that parse commands, always guard against:
1. Command chaining (`&&`, `||`, `;`, `|`, `&`)
2. Shell substitution (`$()`, backticks)
3. Multiline commands (newlines as command separators)
4. Metacharacters in string tokens that `shell-quote` misses
