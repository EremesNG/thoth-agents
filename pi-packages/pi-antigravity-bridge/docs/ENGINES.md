# Engines

`config.engine` defaults to **acp**. Choose with `/agy engine acp|stream-json`, `AGY_ENGINE`, or the first-run interactive picker; restart Pi to apply a switch. Sessions remain engine-scoped, so switching never crosses conversations.

Both engines use the official **agy CLI**, resolved through `AGY_BIN` or PATH, and share its Google credentials. Install or update it yourself using [Google's CLI instructions](https://antigravity.google/product/antigravity-cli), then run `agy` in a terminal and complete Google sign-in. `/agy auth` and `/agy auth-manual` only print these instructions. The bridge never runs an installer or opens a separate ACP login.

- **acp** (default): persistent **`agy acp`**, JSON-RPC 2.0 over stdio; requires agy >= **1.5.3**. Model and `thought_level` are separate session settings. Native cancellation is a notification; a silent peer still triggers bounded owned-process teardown and reload.
- **stream-json**: persistent `agy --input-format stream-json --output-format stream-json`; requires agy >= **1.1.22**.

## Capabilities

| Capability | stream-json | Native ACP |
| --- | --- | --- |
| Resume | `--conversation` | `session/load` |
| User and tool-result images | Staged private files in the prompt | Typed image content blocks |
| Thinking | Token count | Streamed thought text |
| Usage | CLI metrics | Exact prompt billing fields when available; labeled estimates otherwise |
| Context gauge | CLI metrics | Observed `usage_update` occupancy, otherwise input + output + ceil(cacheRead / (toolBatches + 1)) |
| Model / effort change | Recycle process | Per-turn `model` / `thought_level` configuration |
| Pi tool bridge | Private additive `--add-dir` config | Bridge plus enabled isolated-home MCP servers on `session/new` and `session/load` |
| Native tool visibility | Read-only re-exec and display-only replay | Display-only native cards |
| Permissions | CLI skip-permissions policy | Parked `session/request_permission`, fail-closed on timeout/teardown |
| Process ownership | Owned process / Windows Job | Same owned process / Windows Job |

Billing fields are not context occupancy: native prompt totals sum multiple inferences. Tool batches, not individual parallel calls, determine the fallback context divisor. Counts and occupancy reset each turn. API-equivalent costs still use Pi catalog prices, not subscription billing.

Provider plan turns and `readOnly` turns are refused before startup on both engines: agy cannot enforce review-only writes. AskAntigravity remains a CLI delegation; do not treat its plan mode as a sandbox.

## MCP isolation and fallbacks

Unless `AGY_AGENTS_ROOT` selects legacy behavior, both engines stage a per-process MCP home sharing CLI app data/credentials/conversations. It preserves unrelated MCP servers and removes other Pi bridge registrations, including local `pi-agy-<8 hex>` and legacy `pi-bridge[-<pid>[-<uuid>]]`. The acquired instance entry is written enabled. Stream-json uses `--gemini_dir`; ACP uses `--gemini-dir`.

ACP forwards enabled non-Pi-bridge servers from the **staged** `config/mcp_config.json` on both session creation and load, in private and legacy-global discovery modes. Stdio commands/arguments are preserved, environment objects become ACP name/value arrays, and HTTP entries retain their headers. Disabled entries are skipped; malformed entries are skipped with debug diagnostics (no configuration values).

ACP also writes a minimal carrier inside the staged home and starts `agy acp --gemini-dir <home> --agent <carrier>`. Its shared stream-json frontmatter allowlist hides native delegation/interaction tools, including `invoke_subagent`, `swarm` and `ask_question`. The body is short and neutral: the Pi system prompt still arrives inline. The carrier stays fixed until the connection closes and is removed with the home; an inherited global agents link is replaced locally, never written through. Carrier write failure warns and launches without `--agent`. `/agy agent` remains stream-json-only. With `AGY_AGENTS_ROOT`, ACP keeps bridge-only forwarding and does not stage a carrier.

Stream-json probes the flag without starting an agent. Probe or staging failure warns and keeps the additive private config in private discovery mode (**never global registration**); `legacy-global` instead falls back to global registration. ACP staging failure fails the turn visibly. `AGY_AGENTS_ROOT` bypasses isolation and the stream capability probe. The parse probe cannot prove future versions honor the flag; versions newer than the live-verified 1.5.8 warn.

Homes are removed only after process **close**, not leader exit or a bounded termination promise. A timeout/fence retains the home; startup reclaims dead-owner homes while preserving live processes and same-PID siblings. Name collision checks and exact-owner descriptor cleanup remain unchanged. See [bridge lifecycle](BRIDGE-LIFECYCLE.md).

## Migration from the standalone server

The standalone ACP binary and OAuth flow are retired. `/agy acp-bin` is removed; persisted `acp.bin` is stripped on load/save, and `AGY_ACP_BIN` is ignored with one startup warning. `AGY_BIN` selects the CLI for both engines.

Startup removes only old bridge-managed artifacts under `~/.local/opt/agy-acp` carrying installer evidence (recorded archive checksum, harness layout, or interrupted-download marker). Unmarked binaries and symlinked roots/builds are preserved. Credentials under `~/.gemini/antigravity-acp` are reported for **manual** removal, never deleted by the bridge. Missing CLI means installation instructions only.

Upstream sync base: **`cdcfc04`**, with hand-merged native/isolation/usage commits `72d2224`, `32d6d2e`, `e03776a`, `7a4e9b8`, `22364ad`, `e0728f8` and the `01e10ff` home parsing hunk. Local containment, lazy startup, private discovery, images, read-only enforcement and round-trip ownership are retained. Automated checks use fake processes; live native turns remain operator-only opt-in checks.
