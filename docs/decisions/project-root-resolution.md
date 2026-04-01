# Decision: Project Root Resolution in Hook Runner

**Date:** 2026-04-01
**Status:** Accepted

## Context

Toolgate's policy engine needs to know the project root to make permission decisions (e.g., "is this file within the project?"). The Claude Code PreToolUse hook input includes a `cwd` field, but `cwd` reflects the *current* working directory — which can drift after `cd` commands (e.g., `cwd=/Users/x/project/cli` instead of `/Users/x/project`).

This caused false prompts: reading `project/config/services.php` from `cwd=project/cli` failed the `isWithin` check because the file isn't within the `cli/` subdirectory.

## Decision

Use `CLAUDE_PROJECT_DIR` environment variable as `projectRoot`, falling back to `input.cwd` when unset.

```ts
const projectRoot = process.env.CLAUDE_PROJECT_DIR || input.cwd
```

## Alternatives Considered

### `git rev-parse --show-toplevel`

Walk up to the git repository root. Rejected because:

- **Monorepos:** Returns the repo root, not the project root. A monorepo at `/code/mono` with projects `frontend/` and `backend/` would set `projectRoot` to `/code/mono`, allowing reads/writes across all projects. This breaks `deny-writes-outside-project` and defeats project-scoped policies.
- **Performance:** Spawns a child process on every hook invocation.
- **Non-git projects:** Fails entirely, requiring a fallback anyway.

### Decode `transcript_path`

The transcript path encodes the project directory (e.g., `~/.claude/projects/-Users-x-Dev-myproject/session.jsonl`). Rejected because it relies on an internal Claude Code convention that could change without notice.

### Walk up from `cwd` looking for markers (`.git/`, `.claude/`, `package.json`)

Heuristic-based root detection. Rejected because it duplicates logic Claude Code already performs, and any divergence between the two would cause subtle policy mismatches.

## Consequences

- Toolgate correctly identifies the project root even after `cd` commands change `cwd`.
- When `CLAUDE_PROJECT_DIR` is unset (e.g., manual `toolgate run` testing outside hooks), behavior falls back to the previous `cwd`-based approach.
- If Claude Code ever stops setting `CLAUDE_PROJECT_DIR`, policies degrade to the old `cwd` behavior rather than failing.
