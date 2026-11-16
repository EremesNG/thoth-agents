# Architecture

How the provider works internally. For build/test/debug workflow see [DEVELOPMENT.md](./DEVELOPMENT.md).

## Engine

The provider ships two turn engines behind one contract (`TurnDriver`,
`src/driver-types.ts`): the default **ACP engine** (bottom of this doc) and the
**stream-json engine** (below). On stream-json, turns are fed over stdin; agy emits NDJSON events on stdout; the driver parses them and streams text into pi token by token. Conversation binding comes from the `init` event, tool steps arrive as typed events (no protobuf decoding), and token usage is live.

Shared infrastructure: session binding (`sessions.json`), runtime config, the `AskAntigravity` tool, the MCP tool bridge surface, and the G1 context digest (off by default - see below). Discovery defaults to private per-instance names for root and children. Loading uses a fresh cached model catalog or awaits bounded discovery before registering both catalogs (stale cache/static fallback on failure); bridge startup is lazy and model-gated, and shutdown removes only acquired, unique descriptor-cache keys. See [BRIDGE-LIFECYCLE.md](./BRIDGE-LIFECYCLE.md).

## Module map

```
extensions/index.ts   pi extension entry: provider registration, model discovery, /agy command, lifecycle notices
src/provider.ts       streamSimple: pi Context -> agy turn -> pi event stream; owns the G9 round-trip store and the G1 digest
src/driver.ts         stream-json driver: persistent agy process, turn serialization, conversation binding, idle/abort timers
src/stream-events.ts  agy NDJSON event parser (init / step_update / result) + usage mapping onto pi's Usage
src/native-tools.ts   maps agy read-only tool steps to real pi builtins (read/ls/grep/find) for native re-execution
src/skills.ts         activate_skill bridge: exposes the pi Agent Skills catalog to agy, answered by the bridge directly
src/discovery.ts      conversation-id binding for the AskAntigravity one-shot tool (agy -p never prints its conversation id)
src/models.ts         agy models -> pi Model projection (full catalog, per-model effort)
src/sessions.ts       atomic JSON store: pi session -> agy conversation + watermark
src/config.ts         persisted runtime config (engine + acp block, bridgeTools, digest, mode, model/thinking defaults)
src/daily-log.ts      daily NDJSON support log (one file per day, 14-day retention, secret redaction, AGY_DEBUG verbose gate); fed by both drivers, the bridge, round-trips, /agy, and ask-tool
src/redact.ts         redactText(): pattern-based secret scrubbing for free text, word-boundary anchored, applied where stderr tails and error strings leave their holders
src/ask-tool.ts       the AskAntigravity one-shot delegation tool (model/thinking defaults)
src/mcp-server.ts     MCP tool bridge server: ferries tools/list + tools/call; calls park in the provider round-trip. Also the approval park: POST /approval (ticket early-ack) + GET /approval/<id>, fail-closed on timeout/unwired/close
src/mcp-registration.ts legacy-global compatibility: registers/unregisters unique stream-json entries in ~/.gemini/config/mcp_config.json and refcounts AskAntigravity suppression/healing; private mode only sweeps dead entries, never registers/suppresses/heals global bridges
src/approval-gate.ts  shadow tool factory (bash/write/edit): marker calls are ticket-verified approval round-trips, non-marker calls delegate; maps agy native tools onto the shadow surface
src/approval-detect.ts third-party pi permission-extension detection; resolves approvals.gateMode auto (off until a gate extension exists)
src/approval-hook.ts  merge-safe .agents/hooks.json staging (PreToolUse) + generated 0600 early-ack/poll hook script; staged timeout exceeds the park budget (hook timeouts soft-pass)
src/diff-render.ts    stream-json: render agy's file edits as git diffs in pi's thinking stream; formatInlineDiff (no git) renders ACP's native diffs
src/engine-picker.ts  first-run onboarding: engine picker overlay (SelectList + DynamicBorder), first-run gate (no config file + no AGY_ENGINE), agy binary detection (PATH / AGY_BIN), missing-CLI toast copy
src/driver-types.ts   TurnDriver contract shared by both engines (request/handle/snapshot types)
src/frame-guard.ts    stdout frame ceiling + known-noise line filtering shared by both readers (ACP jsonrpc + stream-json driver)
src/acp/jsonrpc.ts    NDJSON JSON-RPC 2.0 framing with line buffering, a 32 MiB frame ceiling, noise filtering, and typed error results
src/acp/connection.ts ACP server process + protocol (initialize, session/new+load, prompt with image/resource blocks, config options, cancel probing, parked permission answering)
src/acp/events.ts     session/update -> DriverActivity mapping (pure; probe-frame regressions pinned)
src/acp/driver.ts     AcpDriver: serialized turns, remaining-budget timer pause, Gate D abort, connection-scoped exit handling, reconnect/agentInfo snapshots
```

No generated protobuf code, no SQLite dependency.

## Stream-json engine

### Process and events

The driver spawns `agy --input-format stream-json --output-format stream-json` once per provider and keeps it alive across turns (`/agy doctor` shows the reuse counter). A turn writes the prompt to stdin and reads NDJSON events until the terminal `result`:

| event | meaning |
| --- | --- |
| `init` | conversation binding (`conversation_id`); the driver remembers it and resumes later turns via `--conversation <id>` |
| `step_update` | `user_input` / `checkpoint` / `agent_response` / `tool` steps; agent text arrives as `text_delta` on live agy (1.1.13+), with `usage` attached |
| `result` | terminal; live builds report status `SUCCESS` (older builds `OK` - both accepted) |

Unknown event kinds parse as `{kind:"unknown"}` so a future agy release degrades instead of crashing the reader loop. Shapes were captured from live output and cross-checked against tianzuo/pi-antigravity `lib/events.ts` (MIT).

Usage maps onto pi's `Usage` (input/output/thinking/cache-read tokens); cost stays zero because agy runs on subscription quota.

### Tool round-trip (G9)

The MCP bridge server executes no tools itself. A `tools/call` parks in the provider's round-trip store; the provider ends the current pi assistant message with a `toolUse` stop reason for the real pi tool; pi executes it in its own loop (native cards, permissions, hooks); the `toolResult` completes the parked MCP response on the next stream call. Public APIs only.

Display follows the same split: agy read-only steps (`view_file`, `list_dir`, `grep_search`, `find_by_name`) re-run as real pi builtins via `native-tools.ts`, so their cards render with pi's own renderers. Mutating and agy-specialty steps replay through a display-only `antigravity` wrapper tool - recorded output only, nothing re-executes. The skills bridge exposes one `activate_skill` tool whose enum is the pi Agent Skills catalog; the bridge answers it directly, no round-trip.

### Context digest (G1)

By default the prompt agy receives is only the latest user message: agy keeps its own history. When `config.digest` is on (`AGY_DIGEST`, `/agy digest on`), the provider prepends a DELTA digest of pi-side context agy was not spawned for - compaction summaries, other-provider turns, pi-tool results. Off by default because the digest changes every turn and defeats agy's server-side prompt cache (~25-30k tokens re-billed per turn). Enable it for mixed-provider sessions where agy must see pi-side context; pure antigravity sessions gain nothing, and bridge round-trips deliver tool results through the bridge, not the digest.

### Removed: the legacy-sqlite engine (1.3.2)

The pre-1.3.0 engine (spawn `agy -p`, poll the SQLite conversation DB, decode protobuf step payloads) was removed in 1.3.2. agy 1.1.18 changed the step-row storage to a two-phase write (a metadata-only placeholder row that grows in place), which the polling decoder read once as an empty placeholder and never re-read: turns completed with the full reply in the database and zero text streamed to pi (issue #1, reported by @imatimba). The engine reverse-engineered an undocumented storage format, so every agy storage change risked repeating that silent failure. The stream-json engine shares none of that code path and is unaffected by storage-format changes. The old sqlite engine value is ignored; current `AGY_ENGINE` / `engine` choices are stream-json and native ACP.

## ACP engine (default, native `agy acp`)

`config.engine: "acp"` (default, or `/agy engine acp`) routes turns through native
`agy acp` (agy >=1.5.3), sharing the CLI's credentials. Stream-json remains
available via `/agy engine stream-json` or `AGY_ENGINE=stream-json`. Both engines launch through the owned-process layer and Windows
Jobs, stage isolated MCP homes unless `AGY_AGENTS_ROOT` selects legacy behavior,
and keep instance-local lifecycle/round-trip ownership. No standalone server,
OAuth capture, download or installer execution remains. See [ENGINES.md](ENGINES.md).

Modules: `src/acp/jsonrpc.ts` (framing/correlation), `src/acp/connection.ts`
(process + protocol methods + parked permission answering),
`src/acp/events.ts` (update mapping, pure), `src/acp/driver.ts`
(`AcpDriver`). Both engines implement `TurnDriver`; `provider.ts` depends on
the interface only and is otherwise unchanged.

Phase-2/3 additions (all ACP-only, verified live):

- **Images**: ACP sends typed content blocks; stream-json stages private image
  files in its prompt. Models advertise text/image input on both engines;
  user and recovered tool-result images retain originating conversations.
- **Digest delivery**: with `config.digest` on, ACP ships the G1 digest as
  a native `embeddedContext` resource block (images → resource → text);
  stream-json keeps it inline. Same cache churn either way.
- **Tool display (Gate C)**: ACP tool steps render as thinking labels -
  native re-exec and wrapper replay are retired on ACP turns (the server
  already executed the tool). Edits render their server-supplied diff
  (`tool_call content[]` → `formatInlineDiff`, no git subprocesses).
- **Diagnostics**: the ACP snapshot reports reconnects (connections beyond
  the first: Gate D kills + stale-exit replacements) and the handshake
  `agentInfo` name/title; `/agy doctor` surfaces both.

Session IDs are engine-scoped (`sid:<x>@acp`). Model and `thought_level`
are separate `session/set_config_option` calls, re-applied each turn;
`session/load` replay is suppressed. `session/cancel` is a notification,
with bounded teardown if the prompt does not settle. Exact usage keeps billing
fields but replaces total tokens with observed context occupancy or
input + output + ceil(cacheRead / (toolBatches + 1)); estimates remain labeled.
Each process's staged home is disposed on close, not leader exit or a fenced
termination promise; dead-owner startup sweeping reclaims retained homes.
Historical captures are in ACP-PROTOCOL-REFERENCE.md; current behavior is
in ENGINES.md and BRIDGE-LIFECYCLE.md.
