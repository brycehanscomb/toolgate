# Recommendation: Prefer xh/xhs Over curl for Agent HTTP Access

**Date:** 2026-04-13
**Status:** Recommendation

## Context

Policies need to make allow/deny decisions about HTTP requests issued from agent Bash calls. `curl` is the default tool most agents reach for, but its command grammar is hostile to programmatic analysis:

- **Method** can be set via `-X`, `--request`, `-G`, or implied by `-d`/`--data` (POST), `-T` (PUT), `-I` (HEAD), etc.
- **URL** can appear anywhere in the argv — before flags, after flags, repeated.
- **Headers, body, auth** are all flags with many aliases (`-H`/`--header`, `-d`/`--data`/`--data-raw`/`--data-binary`/`--data-urlencode`, `-u`/`--user`).
- **Behavior-changing flags** are trivial to miss (`-k`/`--insecure`, `-L`/`--location`, `--resolve`, `--unix-socket`).

Writing a policy that reliably extracts "what host is this request going to, with what method, what body?" from arbitrary curl invocations is brittle. The safe fallback is to prompt on every curl, which is noisy.

## Recommendation

Deny `curl` at the policy layer and steer agents to [`xh`](https://github.com/ducaale/xh) (a Rust clone of HTTPie). Install via `brew install xh`, which provides two binaries:

- `xh` — general HTTP client
- `xhs` — shortcut for HTTPS (equivalent to `xh --https`)

### Why xh/xhs is easier to analyze

The grammar is positional and regular:

```
xh  [METHOD]  URL  [ITEM ...]
xhs [METHOD]  URL  [ITEM ...]
```

- `METHOD` is an optional positional (`GET`, `POST`, `PUT`, ...), defaulting to `GET` (or `POST` if items are present).
- `URL` is a positional — easy to locate and match against allowlists.
- Everything after the URL is an **item**, and each item's separator tells you its kind:

| Separator | Meaning               | Example                      |
|-----------|-----------------------|------------------------------|
| `:`       | Header                | `Authorization:Bearer\ xxx`  |
| `=`       | JSON string field     | `name=alice`                 |
| `:=`      | JSON raw field        | `count:=3`                   |
| `==`      | Query parameter       | `page==2`                    |
| `@`       | File upload           | `file@./photo.png`           |
| `=@`      | JSON field from file  | `config=@./config.json`      |
| `:=@`     | JSON raw from file    | `data:=@./data.json`         |

A policy can decompose the argv with near-zero ambiguity: URL is one specific positional, method is another, and item kinds are identifiable by literal substring.

### Behavior-changing flags are scoped

The flags agents actually need (`--verify=no`, `--follow`, `--session`, `--print`, `--ignore-stdin`) are fewer and more self-describing than curl's equivalents, and the binary split (`xh` vs `xhs`) means an HTTPS-only allowlist can simply gate on the command name.

## Policies

Two policies live in the global `~/Dev/toolgate.config.ts` today:

1. **Deny curl** — blocks `curl` with a message: *"curl is not allowed. Use xh (or xhs for HTTPS) instead — e.g. `xh GET https://example.com` or `xhs POST localhost/api key=value`"*.
2. **Allow xh/xhs to localhost** — permits read-only traffic to `localhost`, `*.localhost`, and `127.0.0.1`.

These are candidates for promotion to built-in policies under `policies/` once the shape is stable. Future built-ins worth considering:

- Allow `GET`/`HEAD`/`OPTIONS` to an allowlist of documentation hosts.
- Deny requests carrying `Authorization:` headers unless the host is explicitly trusted.
- Deny `--verify=no` / `-k` against non-localhost URLs.

## Alternatives Considered

### HTTPie (`http`/`https`)

Same grammar as xh — xh is explicitly an HTTPie clone. Chose xh for startup speed (single Rust binary vs. Python import cost on every Bash hook) and because `xhs` ships as a separate binary, giving policies a clean HTTPS-only gate.

### Teaching policies to parse curl

Attempted mentally — too many equivalent spellings for the same request, and silent behavior toggles (`-k`, `-L`, `--resolve`) make a "safe curl" allowlist approximate at best. Rejected in favor of a hard deny.

### Allow curl, prompt on every use

What toolgate does today for unknown tools. Works, but the volume of HTTP calls made by review/debug agents makes this noisy enough that agents start avoiding network checks entirely.

## Consequences

- Agents must learn xh/xhs syntax. The deny message includes example invocations, so the correction loop is one turn.
- Projects that genuinely need curl (e.g., shell scripts being edited, not executed as tool calls) are unaffected — the policy only fires on Bash tool calls.
- xh is an extra dependency (`brew install xh`). Acceptable given that toolgate already assumes bun, shfmt, and Claude Code itself.
