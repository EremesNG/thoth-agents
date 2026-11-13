# Change: pi-junie-bridge

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: medium
**Risk**: medium

## Exploration

- No official public raw-inference API backs a JetBrains AI Pro subscription; community OpenAI proxies (jetbrainsai2api, jetbrains-ai-proxy) depend on captured IDE tokens and are out of bounds (JetBrains AI service terms §§3–4).
- Junie CLI 26.11.1 (installed at `~/.local/bin/junie.bat`, real launcher under `~/.local/share/junie/versions/<build>/`) is official; JetBrains Account login consumes the AI subscription. `junie --acp true --skip-update-check` speaks ACP v1 over stdio (live spike 2026-11-12):
  - initialize advertises `loadSession`, image prompts, `mcpCapabilities {http, sse}`, session `fork/list/resume/delete/close`; authMethods `jetbrains-account`; `_auth/status_update` notifications carry identity only.
  - `session/new` returns `{sessionId, configOptions}`; options `mode` (default/plan), `model` (grouped selects, values like `v1:12:jetbrains-ai:gemini-3.7-flash`, plus `mix.*`), `effort` (low/medium/high, category `thought_level`), `brave_mode` (off/brave-auto/on, defaults **on**). Set via `session/set_config_option {sessionId, configId, value}`.
  - Stdio MCP servers in `session/new.mcpServers` work: a Pi-like `pi_echo` tool round-tripped. MCP tool calls first raise `session/request_permission` (`_meta.is_mcp_tool_call: true`, options allow_once/reject_once/allow_always). ACP `toolCallId` differs from the MCP request id.
  - Updates observed: `agent_message_chunk`, `tool_call`, `tool_call_update`, `usage_update {used,size,cost{amount,currency}}` (context + cumulative session cost, not account balance), `session_info_update`, `config_option_update`. Stop reasons per ACP: end_turn, max_tokens, max_turn_requests, refusal, cancelled.
  - Junie built-in tools cannot be disabled (terminal tools always stay); only permission gating is available.
  - Windows: `stdin: ignore` crashes Junie (`FileInputStream.available0`); piped stdin works.
  - Remaining JetBrains AI balance is documented only through interactive `/stats` (aliases `/usage`, `/quota`, `/balance`, `/credits`, `/cost`), listed for ACP V2; no ACP v1 quota method or field observed. `junie list-models` exists (ids differ from ACP model values).
- Repository: `pi-packages/pi-antigravity-bridge` is the closest template — ACP client (`src/acp/connection.ts`), loopback token-protected Streamable HTTP MCP server with parked Pi-tool dispatch (`src/mcp-server.ts`, `src/provider.ts:447`), ACP permission → `ui.select` under a dialog lock with deny on no UI (`extensions/index.ts:390–413`, UI captured on `session_start` when `ctx.hasUI`, `:725–731`), display-only synthetic backend tool calls (`:636–653`), `/agy quota` (`:1708–1734`, `src/usage.ts`). pi-claude-bridge supplies session-store/resume patterns and `/claude quota`.
- Provider `streamSimple` receives no UI context (`@earendil-works/pi-coding-agent` `types.d.ts:1447–1456`); `ctx.hasUI` is true in TUI and RPC.
- Package registration: explicit in `scripts/build-pi-extensions.mjs`, `scripts/pi-extension-bundles.test.mjs`, `.github/workflows/ci.yml`; workspace/release discovery is automatic; docs in `README.md`, `docs/installation.md`, `docs/agent/harness-packaging.md`, `docs/agent/testing.md`. Canonical requirements live in `.thoth/specs/pi-ecosystem/spec.md` (bundling, Windows job containment, subscription cost and on-demand quota).

## Intent

Ship `@thoth-agents/pi-junie-bridge`, a Pi extension that registers a `junie` model provider backed by the locally installed, already-authenticated Junie CLI over ACP, so the user's JetBrains AI subscription drives Pi turns: Pi tools stay executed by Pi (exposed to Junie via MCP), Junie's own tool permissions are decided in the Pi UI, sessions survive Pi restarts, and `/junie quota` reports remaining balance on demand.

## Non-goals

- No direct Grazie/JetBrains AI API client, captured-token proxy, or Pi `/login` OAuth; authentication stays with the Junie CLI.
- No `AskJunie` delegation tool, BYOK/provider management, or Junie API-key handling.
- No shared library extraction from pi-antigravity-bridge; reuse is by adaptation inside the new package.
- No package version bumps or npm first-publication bootstrap.
- No guarantee that Junie built-in tools are removed; they are gated, not disabled.

## Acceptance

- AC-1: `pi-packages/pi-junie-bridge` is a bundled first-party Pi extension that registers provider `junie` whose models come from a handshake-only discovery of the installed Junie (initialize + session/new + close, no prompt), cached under the Pi agent dir and refreshable, with Junie effort mapped to Pi thinking levels.
- AC-2: A Pi turn on a `junie` model streams Junie text and thoughts, maps ACP stop reasons, reports per-message cost from `usage_update` deltas, is treated by the Thoth theme as a default subscription provider (explicit user-configured lists preserved), ends with exactly one terminal event, and fails explicitly (with actionable guidance) when Junie is missing, unauthenticated, or exceeds startup/inactivity bounds; Pi abort sends `session/cancel`.
- AC-3: Each Pi session maps to a persisted Junie session that is resumed after a Pi restart; when Pi history diverges from what Junie saw (edit, tree navigation, fork, compaction) the bridge starts or forks a Junie session seeded with projected Pi context instead of continuing a stale one.
- AC-4: Pi tools are exposed to Junie through a loopback, token-protected MCP server; Junie's permission request for these tools is auto-allowed once; each MCP call ends the Pi stream with exactly one `toolUse` that Pi executes once, and its result resumes the same Junie turn.
- AC-5: Every Junie native-tool permission request is shown in the Pi UI with Junie's options; no UI, dismissal, or timeout rejects; `brave_mode` is forced `off` on every new, resumed, or forked session; native tool activity is rendered as display-only and never executed by Pi.
- AC-6: On Windows Junie runs inside its own kill-on-close Job Object via the pi-core job launcher with piped stdin, and is terminated only through that job (leader-only fallback with a warning when the launcher is unavailable).
- AC-7: `/junie quota` fetches remaining JetBrains AI balance only on demand, without spending model inference, and prints it; when Junie exposes no balance it prints an explicit unavailable message pointing to JetBrains Account → JetBrains AI settings.
- AC-8: The package is registered in the bundle build table, bundle tests and CI, documented in README and docs, and covered by hermetic unit tests against a fake ACP agent; `pnpm run check:ci`, `pnpm run typecheck`, package tests and `pnpm run build` pass.

## Clarifications

- Native Junie tool permissions: user chose "ask in the Pi UI" (2026-11-12); headless rejects.
- Quota: user requires a quota command (2026-11-12).
- Integration path: user selected the Junie ACP spike and then planning; reverse-engineered proxies excluded on ToS/account risk.

## Decisions

- Package `@thoth-agents/pi-junie-bridge`, provider id `junie`, command `/junie` (subcommands `quota`, `models` refresh); settled assumption following existing bridge naming.
- Use pi-antigravity-bridge's ACP client and HTTP MCP server as adaptation templates; the official `@agentclientprotocol/sdk` (2.6.0) may be used instead only if it bundles cleanly and covers `session/resume`/`session/fork`; the implementer records the choice.
- Pi tool calls are correlated from the MCP request itself, not from ACP `toolCallId`; ACP `tool_call` updates flagged `is_mcp_tool_call` are suppressed from display to avoid duplicates.
- Pi model ids are ACP model config values (including `mix.*`); effort is applied per turn through `session/set_config_option`.
- `/junie quota` mechanism is selected by task AC-7 probe: `/stats` through ACP is adopted only when the probe positively establishes non-inference handling (balance text returned, `usage_update.cost` present before and after and unchanged, no thought/tool activity); absent, ambiguous or inference-backed results select the explicit unavailable message, which is the default.
- Amendment (user decision 2026-11-12, after the first probe): Junie emits no `usage_update` at all for `/stats` (while every inference turn emits cost-bearing `usage_update`), and advertises `stats` in `available_commands_update`; the first probe returned `Balance left: 64.75 credits` with no thought/tool activity. `/stats` is therefore also adopted when two consecutive `/stats` runs on the same throwaway session return an identical numeric balance, with no `usage_update` cost increase and no thought/tool activity; otherwise the unavailable message remains the default. When adopted, `/junie quota` runs `/stats` on a dedicated throwaway ACP session (never the user's Pi session), parses license and balance lines, and falls back to the unavailable message on parse failure or timeout.
- Junie cost is reported as a subscription cost (theme marks `junie` as a default subscription provider).

## Durable deltas

- `ADDED pi-ecosystem` **Junie bridge provider** — `@thoth-agents/pi-junie-bridge` MUST register the `junie` provider from a prompt-free model discovery of the installed Junie CLI over ACP, MUST expose Pi tools to Junie only through a loopback token-protected MCP server whose calls become exactly one Pi-executed `toolUse` resuming the same Junie turn, MUST end every stream with exactly one terminal event, and MUST resume the mapped Junie session across Pi processes unless Pi history diverged.
  - GIVEN an authenticated Junie CLI and a Pi session on a `junie` model; WHEN Junie calls a Pi tool and Pi is later restarted and the session continued; THEN Pi executes the tool once, the same Junie turn receives its result, and the next turn resumes the same Junie session.
- `ADDED pi-ecosystem` **Junie bridge native tool permissions** — The Junie bridge MUST force Junie `brave_mode` off on every new, resumed or forked session, MUST present each Junie native-tool permission request in the Pi UI with Junie's options, MUST reject when no dialog-capable UI exists or the dialog is dismissed or times out, and MUST never execute Junie native tool activity in Pi.
  - GIVEN a headless Pi run on a `junie` model; WHEN Junie requests permission to run a terminal command; THEN the request is rejected and nothing is executed by Pi.
- `ADDED pi-ecosystem` **Junie bridge Windows job containment** — On Windows the Junie bridge MUST launch Junie with piped stdin inside its own kill-on-close Job Object through the pi-core job launcher and MUST end it and its descendants only through that job, falling back to terminating only its leader with a warning when the launcher is unavailable.
  - GIVEN a Windows Pi session whose Junie process spawned a descendant; WHEN the session shuts down; THEN Junie and its descendant end through the job and unrelated processes keep running.
- `MODIFIED pi-ecosystem` **Subscription provider cost and on-demand quota** — the Antigravity bridge MUST report API-equivalent message cost through an explicit model-to-catalog price mapping, the Junie bridge MUST report per-message cost from Junie usage deltas, the theme MUST treat `antigravity` and `junie` as default subscription providers, and provider quota MUST only be fetched on demand through `/agy quota`, `/claude quota` and `/junie quota`, never periodically, and `/junie quota` MUST NOT spend model inference.
  - GIVEN an Antigravity session using a mapped Gemini model and a Junie session; WHEN turns complete and the user runs `/claude quota` and `/junie quota`; THEN the Antigravity message cost equals the catalog price for its tokens, Junie message cost equals its usage delta, the status line marks both `(sub)`, and each quota command prints without sending a model prompt.

## Plan

Package layout mirrors pi-antigravity-bridge (`extensions/index.ts` entry, `src/` modules, `tests/`, `dist/index.ts` bundle), externals `@earendil-works/*` and `typebox`.

Modules:
- `src/junie-process.ts`: resolve Junie launcher (prefer the real launcher behind the `.bat` shim; never `stdin: ignore`), spawn `--acp true --skip-update-check` through pi-core's Windows job launcher, stderr capture, bounded startup.
- `src/acp/`: ACP client (adapted connection or official SDK), initialize, session new/resume/fork/close/cancel, `set_config_option`, update dispatch, permission request callback, auth-required mapping to guidance (`run junie and log in`).
- `src/catalog.ts`: handshake-only model discovery, cache in agent dir, projection to Pi models (context size from `usage_update.size` when known, otherwise conservative default), effort ↔ thinking map.
- `src/provider.ts`: `streamSimple`; prompt projection (latest user message + images; seeded projected context on divergence), event projection (text, thought, display-only native tool calls, usage/cost delta, stop reasons), terminal-event guarantee and bounds, abort → `session/cancel`.
- `src/session-store.ts`: per-Pi-session Junie session id, cwd, model, history digest; atomic writes; divergence detection.
- `src/mcp-server.ts`: loopback Streamable HTTP MCP with shared-secret header, Pi tool catalog, parked call → `toolUse` → continuation; passed as `{type:"http", url, headers}` in session/new/resume/fork.
- `src/permissions.ts`: auto-allow-once for own MCP tools; native requests → serialized `ui.select` with timeout; deny without UI.
- `src/quota.ts`: `/junie quota` per T1 outcome.
- `extensions/index.ts`: registration, `session_start` UI capture, `session_shutdown` cleanup, `/junie` command.

Focused verification seams: fake ACP agent script (tests/fixtures) emulating Junie wire shapes captured in the spike; unit tests per module; optional opt-in live test (`JUNIE_LIVE=1`) not part of CI. Risks: Junie protocol drift (pin captured shapes in fixtures), permission dialog deadlocks (timeouts), quota mechanism may be unavailable (explicit message), duplicated code vs antigravity (accepted).

## Tasks

- [x] AC-7: Determine the prompt-free balance mechanism for `/junie quota`
  - Outcome: evidence whether sending `/stats` (or alias) through ACP on a throwaway session returns remaining balance with zero model inference cost, or that no prompt-free mechanism exists
  - Known entrypoints and skill paths: `~/.local/bin/junie.bat`; spike scratch `%TEMP%/junie-acp-spike-688a742c` (acp-spike.cjs, wire logs)
  - Inputs: Exploration section of this record
  - Dependencies: none
  - Output: redacted wire sample of the response and usage/cost observed; recommended mechanism
  - Owner: thoth-worker
  - Writes: scratch subfolder under the spike dir only
  - Interface boundaries: no repository writes; at most two slash-command prompts; never print tokens or emails
  - Focused check and PASS evidence: either (a) balance text captured with `usage_update.cost` present before and after `/stats` and unchanged and no thought/tool activity, or (a') two consecutive `/stats` runs returning an identical numeric balance with no cost increase and no thought/tool activity (per the amendment), selecting the `/stats` mechanism; or (b) any other result, selecting the unavailable-message mechanism
  - Return milestone: after the probe runs
  - Stop / reassessment: none; every probe outcome selects one of the two mechanisms
- [x] AC-1: Scaffold the package with Junie process launch, ACP client and cached model catalog
  - Outcome: `pi-packages/pi-junie-bridge` builds, registers provider `junie` from a prompt-free discovered and cached catalog, maps effort to thinking levels
  - Known entrypoints and skill paths: `pi-packages/pi-antigravity-bridge/{package.json,extensions/index.ts,src/acp/connection.ts}`; pi-core Windows job launcher; `skills/thoth-sdd` not needed; installed `tdd` skill
  - Inputs: Exploration, Plan, Decisions
  - Dependencies: none
  - Output: package skeleton, `src/junie-process.ts`, `src/acp/*`, `src/catalog.ts`, registration in `extensions/index.ts`, unit tests with fake ACP agent fixture
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-junie-bridge/**`, `pnpm-lock.yaml`
  - Interface boundaries: Pi `registerProvider` contract; pi-core job launcher API; AC-6 containment is implemented here
  - Focused check and PASS evidence: package typecheck and unit tests pass (handshake, catalog cache, Windows launch path, missing/unauthenticated Junie errors)
  - Return milestone: skeleton + catalog tests green
  - Stop / reassessment: pi-core launcher cannot host a `.bat`/JVM launcher, or chosen ACP client cannot bundle
- [x] AC-6: Verify Windows job containment and piped stdin for Junie
  - Outcome: Junie launched inside its own kill-on-close job with piped stdin, leader-only fallback with warning
  - Known entrypoints and skill paths: `pi-packages/pi-junie-bridge/src/junie-process.ts`; antigravity containment tests as template
  - Inputs: AC-1 unit output
  - Dependencies: AC-1 scaffold accepted
  - Output: containment unit tests
  - Owner: thoth-worker (same unit session as AC-1 scaffold)
  - Writes: `pi-packages/pi-junie-bridge/src/junie-process.ts`, its tests
  - Interface boundaries: pi-core Windows job launcher consumer isolation
  - Focused check and PASS evidence: containment tests pass on Windows
  - Return milestone: with AC-1 scaffold return
  - Stop / reassessment: launcher contract mismatch
- [x] AC-2: Implement the provider stream projection and terminal guarantees
  - Outcome: `streamSimple` streams text/thought, maps stop reasons, reports cost deltas, ends with exactly one terminal event, bounded waits, abort → cancel
  - Known entrypoints and skill paths: `pi-packages/pi-antigravity-bridge/src/provider.ts`; `pi-packages/pi-junie-bridge/src/provider.ts`
  - Inputs: AC-1 accepted package
  - Dependencies: AC-1 scaffold accepted
  - Output: `src/provider.ts` and tests against fake agent
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-junie-bridge/src/provider.ts`, `extensions/index.ts`, tests
  - Interface boundaries: Pi `AssistantMessageEventStream`
  - Focused check and PASS evidence: provider tests pass for each stop reason, error paths, abort, cost delta
  - Return milestone: provider tests green
  - Stop / reassessment: Pi stream contract mismatch
- [x] AC-2: Add `junie` to the Thoth theme default subscription providers
  - Outcome: `junie` is a default subscription provider so its cost is marked `(sub)`, while explicitly configured user lists are preserved unchanged
  - Known entrypoints and skill paths: `pi-packages/pi-thoth-theme/src/shared/config.ts:54-64` (`parseSubscriptionProviders`) and its existing tests
  - Inputs: Decisions (provider id `junie`)
  - Dependencies: none
  - Output: theme default list change and focused tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-thoth-theme/src/shared/config.ts`, its colocated tests
  - Interface boundaries: theme config parsing; no other theme behavior
  - Focused check and PASS evidence: pi-thoth-theme typecheck and tests pass, including a test that defaults contain `junie`, `antigravity`, `claude-bridge` and an explicit user list is kept as configured
  - Return milestone: theme tests green
  - Stop / reassessment: default list owned outside `config.ts`
- [x] AC-3: Persist and resume Junie sessions with divergence handling
  - Outcome: session store, resume across processes, fork/new seeded session on divergence
  - Known entrypoints and skill paths: `pi-packages/pi-claude-bridge/src/session-store.ts`; `pi-packages/pi-junie-bridge/src/session-store.ts`
  - Inputs: AC-2 accepted provider
  - Dependencies: AC-2 accepted
  - Output: `src/session-store.ts`, provider integration, tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-junie-bridge/src/{session-store.ts,provider.ts}`, tests
  - Interface boundaries: ACP session/resume/fork/load shapes
  - Focused check and PASS evidence: tests for restart resume, edit/tree/compaction divergence
  - Return milestone: session tests green
  - Stop / reassessment: Junie resume semantics contradict fixtures
- [x] AC-4: Expose Pi tools through the MCP bridge with parked dispatch
  - Outcome: loopback token-protected HTTP MCP server, auto-allow for own tools, MCP call → one Pi `toolUse` → result resumes Junie turn; duplicate ACP display suppressed
  - Known entrypoints and skill paths: `pi-packages/pi-antigravity-bridge/src/mcp-server.ts`, `src/provider.ts:447`
  - Inputs: AC-3 accepted provider/session
  - Dependencies: AC-3 accepted
  - Output: `src/mcp-server.ts`, provider wiring, tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-junie-bridge/src/{mcp-server.ts,provider.ts,permissions.ts}`, tests
  - Interface boundaries: MCP Streamable HTTP; ACP `mcpServers` http shape
  - Focused check and PASS evidence: tests show one execution per call, token rejection, continuation of same turn, concurrent calls handled in order
  - Return milestone: MCP tests green
  - Stop / reassessment: Junie rejects HTTP MCP (fallback to stdio needs reassessment)
- [x] AC-5: Gate Junie native tools through Pi UI permissions and display-only rendering
  - Outcome: `brave_mode` off on every session, native permissions via serialized `ui.select` with timeout, reject headless/dismiss, display-only native tool calls
  - Known entrypoints and skill paths: `pi-packages/pi-antigravity-bridge/extensions/index.ts:390–413,636–653,725–731`
  - Inputs: AC-4 accepted
  - Dependencies: AC-4 accepted
  - Output: `src/permissions.ts`, rendering, tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-junie-bridge/src/permissions.ts`, `extensions/index.ts`, `src/provider.ts`, tests
  - Interface boundaries: Pi `ExtensionUIContext.select`, `ctx.hasUI`
  - Focused check and PASS evidence: tests for allow, reject, headless reject, timeout reject, brave off on new/resume/fork, no Pi execution of native tools
  - Return milestone: permission tests green
  - Stop / reassessment: none expected
- [x] AC-7: Implement `/junie quota` and `/junie models`
  - Outcome: on-demand quota command per AC-7 probe result; models refresh command
  - Known entrypoints and skill paths: `pi-packages/pi-antigravity-bridge/src/usage.ts`, `extensions/index.ts:1708–1734`
  - Inputs: AC-7 probe outcome; AC-1 catalog
  - Dependencies: AC-7 probe accepted, AC-5 accepted
  - Output: `src/quota.ts`, command registration, tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-junie-bridge/src/quota.ts`, `extensions/index.ts`, tests
  - Interface boundaries: `pi.registerCommand`, `ctx.ui.notify`
  - Focused check and PASS evidence: tests for the selected mechanism (balance parsing/output from a throwaway session with parse-failure and timeout fallback, or unavailable message pointing to JetBrains Account), that only the `/stats` command text is ever sent, and that the user's Pi-mapped Junie session is never used
  - Return milestone: command tests green
  - Stop / reassessment: none for probe outcome; the unavailable message is the accepted fallback
- [x] AC-3: Repair per-Pi-session isolation found by final verification FAIL (also AC-4, AC-5)
  - Outcome: provider identity, persistence key, cwd, parked MCP turn, UI capability and cleanup are resolved from the requesting Pi session (options.sessionId), never from a process-global current session; a headless child session's native permission requests are rejected even while a parent has UI
  - Known entrypoints and skill paths: `pi-packages/pi-junie-bridge/extensions/index.ts:13-35,51-59`; `src/provider.ts:374-383,566-571`; subagent reuse of parent modelRuntime `pi-packages/pi-subagents/src/runner/sdk-runner.ts:534-537`
  - Inputs: Oracle final-verification FAIL evidence E4, E6
  - Dependencies: all prior units accepted
  - Output: isolation fix and regressions
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-junie-bridge/{extensions/index.ts,src/**,tests/**}`
  - Interface boundaries: Pi `streamSimple` options.sessionId; session_start/session_shutdown per-session ctx
  - Focused check and PASS evidence: regressions for parent/child persistence keys, parent parked turn surviving a child call, headless child permission rejected while parent has UI, shutdown of one session not disposing another; package tests, typecheck, check:ci, bundle test green
  - Return milestone: regressions green
  - Stop / reassessment: Pi provides no per-call session identity
- [x] AC-6: Repair lean-subagent lifecycle integration found by second final verification FAIL (also AC-3)
  - Outcome: Junie running inside default lean pi-subagents children receives its lifecycle hooks (session_start metadata/cwd, session_shutdown cleanup) like the existing bridges, so it starts in the child's workspace and its Junie process, descendants and MCP endpoint end at child teardown; explicit operator lifecycle_passthrough overrides are preserved; absent session metadata never borrows another session's context
  - Known entrypoints and skill paths: `pi-packages/pi-subagents/src/config.ts:33-38` (default lifecycle passthrough), `pi-packages/pi-subagents/src/runner/sdk-runner.ts:287-343`, `pi-packages/pi-junie-bridge/extensions/index.ts:21-59`, `pi-packages/pi-junie-bridge/src/provider.ts:583-601`
  - Inputs: Oracle second final-verification FAIL evidence E8, E9
  - Dependencies: isolation repair accepted
  - Output: lifecycle passthrough default including the Junie bridge (following the existing bridge entries) plus a real sdkSubagentRunner regression
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-subagents/src/config.ts` and its tests/docs mentioning default passthrough, `pi-packages/pi-junie-bridge/**`, rebuilt bundles
  - Interface boundaries: pi-subagents lifecycle passthrough contract; operator overrides
  - Focused check and PASS evidence: real sdkSubagentRunner regression with a fake Junie launch shows child cwd in session/new and endpoint + descendant closed after teardown; pi-subagents and junie package tests, check:ci, typecheck, bundle tests green
  - Return milestone: regression green
  - Stop / reassessment: passthrough cannot be extended without changing trust semantics for other packages
- [x] AC-8: Register the package in build, bundle tests, CI and documentation
  - Outcome: build table, bundle verification table, CI steps, README, installation and agent docs updated; full local gate passes
  - Known entrypoints and skill paths: `scripts/build-pi-extensions.mjs`, `scripts/pi-extension-bundles.test.mjs`, `.github/workflows/ci.yml`, `README.md`, `docs/installation.md`, `docs/agent/harness-packaging.md`, `docs/agent/testing.md`, `docs/agent/index.md`
  - Inputs: AC-7 command accepted
  - Dependencies: all prior units accepted
  - Output: registration and docs edits; package README/CHANGELOG
  - Owner: thoth-worker
  - Writes: listed paths, `pi-packages/pi-junie-bridge/{README.md,CHANGELOG.md}`
  - Interface boundaries: release discovery remains automatic
  - Focused check and PASS evidence: `pnpm run check:ci`, `pnpm run typecheck`, package tests, `pnpm run build`, bundle test pass
  - Return milestone: gate green
  - Stop / reassessment: unrelated environment failures reported with evidence

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
First review REJECT (theme ownership, quota probe criteria) repaired; fresh Oracle OKAY on record sha256 883af5431355458dd9b92c46367f9e752967fe4bd42561971bd258b288ce84ef.
Quota amendment (user decision) re-opened plan review; fresh Oracle OKAY on amended record sha256 92ca015191ef24998597aa5e150bd64d9c21a52ef4660b661ac3a45a030272b5.
AC-7 probe outcome: stability probe selected `/stats` (criterion a'): two consecutive runs returned `Balance left: 64.75 credits`, no usage_update, no thought/tool activity, stopReason end_turn; `stats` advertised in available_commands_update.
**Implementation**: AUTHORIZED
User selected Implement on 2026-11-12 after plan-review OKAY.

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 2703c7eccef17f3d0fa01d034d3968a68259b9c6e40798c4760dae7429dc4cf9
Third fresh Oracle final verification (task subtask_thoth-oracle_1794540629717_4ee9d94c); two earlier fresh verifications returned FAIL (cross-session ownership; lean-subagent lifecycle) and were repaired by the recorded repair tasks.

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS: AC-1–AC-8 and all four durable deltas are satisfied. Both prior failures are repaired; independent real-runner reproduction found no remaining cross-session or teardown leak.",
  "evidence": [
    {
      "id": "E1",
      "kind": "record-and-baseline",
      "locator": ".thoth/changes/pi-junie-bridge/pi-junie-bridge.md; .thoth/specs/pi-ecosystem/spec.md",
      "claim": "Verify gate passes. Spec baseline matches a601b6a7a3971bad2a531ca0f85fe40f35b167b5de23e3e23802b5a4c59c9b24. The record declares three ADDED requirements and one matching MODIFIED requirement.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E2",
      "kind": "diff-and-freshness",
      "locator": "git status --short; git diff; untracked pi-packages/pi-junie-bridge/**",
      "claim": "Reviewed tracked changes and new package files. git diff --check passes. All 52 relevant source/record inputs remained unchanged across final checks.",
      "basis": "observed",
      "uncertainty": "Existing .junie/ files were outside the assigned implementation scope and left untouched."
    },
    {
      "id": "E3",
      "kind": "executed-tests",
      "locator": "pnpm --filter @thoth-agents/pi-junie-bridge run test --reporter=verbose",
      "claim": "99/99 tests pass, including discovery, streaming, persistence/divergence, MCP dispatch, permissions, quota, session isolation, real SDK child lifecycle and actual Windows containment.",
      "basis": "observed",
      "uncertainty": "Hermetic fake ACP agent, not live Junie inference."
    },
    {
      "id": "E4",
      "kind": "independent-reproduction",
      "locator": "Inline node --import tsx reproduction using sdkSubagentRunner and the built Junie extension",
      "claim": "With a shared parent ModelRuntime and parked parent MCP turn, a default lean headless child rejects native permission without invoking parent UI, uses separate cwd/persistence, and closes its endpoint, leader and descendant on failure teardown. The parent's endpoint/process survive; its parked turn receives exactly one result and persists separately. Parent shutdown subsequently closes its endpoint and process tree.",
      "basis": "observed",
      "uncertainty": "The permission-only fixture intentionally produces the runner's empty_response_no_tools failure; cleanup assertions cover that failure path. Fresh TCP connections confirm ECONNREFUSED."
    },
    {
      "id": "E5",
      "kind": "trust-boundary-review",
      "locator": "pi-packages/pi-subagents/src/config.ts; src/runner/sdk-runner.ts; test/config.test.ts; test/runner/providers-real-sdk.test.ts",
      "claim": "The runtime diff only adds Junie's exact package name to default lifecycle passthrough. Explicit arrays, including [], still replace defaults; package identity, adaptive-root exclusion and other packages' filtering remain unchanged. Focused config/real-SDK tests pass: <REDACTED>",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E6",
      "kind": "theme-verification",
      "locator": "pi-packages/pi-thoth-theme/src/shared/config.ts; src/shared/config.test.ts; test/config.test.ts",
      "claim": "Junie is added to subscription defaults without changing explicit user lists. Both focused test files pass: 82/82.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E7",
      "kind": "static-checks",
      "locator": "pnpm run check:ci; pnpm run typecheck; Junie, subagents and theme package typechecks",
      "claim": "All commands exit successfully. Biome reports warnings/information but no blocking errors or applied fixes.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E8",
      "kind": "artifact-verification",
      "locator": "write:false esbuild comparisons; pnpm run test:pi-extensions",
      "claim": "Fresh in-memory builds exactly match Junie, subagents and theme bundles; Junie's launcher assets match pi-core. Packed offline bundle tests pass 16/16, including Junie provider/command activation.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E9",
      "kind": "implementation-review",
      "locator": "pi-packages/pi-junie-bridge/{extensions/index.ts,src/**,tests/**}; build/CI/docs diff",
      "claim": "Source inspection corroborates session-keyed ownership, bounded stream termination, authenticated loopback dispatch, fail-closed permission routing, job-only contained termination, isolated on-demand /stats and complete packaging/documentation registration. Existing Antigravity pricing paths are unchanged.",
      "basis": "observed",
      "uncertainty": "Upstream ACP and /stats behavior remain version-dependent."
    }
  ],
  "verification": [
    {
      "check": "AC-1",
      "method": "Catalog/extension/command tests and source review",
      "outcome": "pass",
      "evidenceIds": ["E3", "E8", "E9"],
      "reason": "Discovery wire is initialize → session/new → session/close without prompting; cached models, refresh, provider registration and effort mapping are verified."
    },
    {
      "check": "AC-2",
      "method": "Provider regression tests, theme tests and typechecks",
      "outcome": "pass",
      "evidenceIds": ["E3", "E6", "E7"],
      "reason": "Text/thought projection, stop mappings, cumulative cost deltas, exactly one terminal event, actionable failures, bounds and abort cancellation pass."
    },
    {
      "check": "AC-3",
      "method": "Persistence/divergence tests and independent shared-runtime reproduction",
      "outcome": "pass",
      "evidenceIds": ["E3", "E4", "E9"],
      "reason": "Restart restoration and fresh context reseeding on divergence pass; requesting-session identity, cwd and persistence no longer depend on another session."
    },
    {
      "check": "AC-4",
      "method": "MCP security/continuation tests and real-runner reproduction",
      "outcome": "pass",
      "evidenceIds": ["E3", "E4", "E9"],
      "reason": "Loopback/token enforcement, one toolUse per call, ordered concurrent calls and same-turn result delivery pass; child teardown does not destroy a parked parent turn."
    },
    {
      "check": "AC-5",
      "method": "Permission/native-display tests and headless real-runner reproduction",
      "outcome": "pass",
      "evidenceIds": ["E3", "E4", "E9"],
      "reason": "Native requests use the requesting session's UI only; headless/dismissed/timed-out requests reject. Brave mode is disabled on session establishment; native activity remains non-executable Pi display."
    },
    {
      "check": "AC-6",
      "method": "Actual Windows containment tests and real SDK teardown checks",
      "outcome": "pass",
      "evidenceIds": ["E3", "E4", "E5"],
      "reason": "Piped batch-launch ACP works inside the job; leader/descendant termination preserves unrelated processes. Default lean children receive cwd and shutdown hooks; success and failure teardown close owned resources."
    },
    {
      "check": "AC-7",
      "method": "Quota/command tests and isolated-session source review",
      "outcome": "pass",
      "evidenceIds": ["E3", "E9"],
      "reason": "Only advertised /stats is sent, on demand in a throwaway session; balance parsing, unexpected-activity rejection, bounded cleanup and account-settings fallback pass under the accepted probe decision."
    },
    {
      "check": "AC-8",
      "method": "Diff review, static checks, package tests, in-memory rebuild comparisons and packed activation",
      "outcome": "pass",
      "evidenceIds": ["E2", "E3", "E5", "E6", "E7", "E8", "E9"],
      "reason": "Build table, CI, bundle tests and docs include Junie. Changed bundles match current sources and activate offline."
    },
    {
      "check": "Trust semantics and durable deltas",
      "method": "Baseline comparison, verify validator, narrow diff and behavioral checks",
      "outcome": "pass",
      "evidenceIds": ["E1", "E3", "E4", "E5", "E6", "E9"],
      "reason": "All three ADDED requirements and the MODIFIED subscription/quota requirement are supported. No trust-policy change affects other packages."
    },
    {
      "check": "Full pnpm run build rerun",
      "method": "Read-only verification substitution",
      "outcome": "not-run",
      "evidenceIds": ["E7", "E8"],
      "reason": "The root reported a successful build. Its mutating generator pipeline was not rerun; fresh write:false comparisons independently verify every changed extension bundle and launcher asset."
    }
  ],
  "risks": [
    {
      "description": "Live Junie compatibility and non-consuming /stats behavior remain upstream-version-dependent. Documented safe-command execution without permission requests is an accepted limitation, not a failed acceptance outcome.",
      "severity": "medium",
      "blocking": false,
      "evidenceIds": ["E3", "E9"]
    }
  ],
  "openQuestions": [],
  "nextAction": "Root should validate this record-bound PASS, record the acceptance evidence, and run closeout before archiving.",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/pi-junie-bridge/pi-junie-bridge.md",
    "reviewedRecordSha256": "2703c7eccef17f3d0fa01d034d3968a68259b9c6e40798c4760dae7429dc4cf9"
  }
}
```

After PASS, root pastes the Oracle's unchanged final-verification envelope here.

- AC-1: PASS | catalog/extension/command tests, bundle activation | Oracle E3/E8/E9; live smoke discovered 25 models without inference
- AC-2: PASS | provider regressions, theme tests, typechecks | Oracle E3/E6/E7; late-usage cost regression
- AC-3: PASS | persistence/divergence tests, shared-runtime reproduction | Oracle E3/E4/E9
- AC-4: PASS | MCP security/continuation tests, real-runner reproduction | Oracle E3/E4/E9; live smoke one toolUse, same-turn continuation
- AC-5: PASS | permission/native-display tests, headless real-runner reproduction | Oracle E3/E4/E9; live smoke native write rejected headless
- AC-6: PASS | Windows containment tests, real SDK teardown checks | Oracle E3/E4/E5
- AC-7: PASS | quota/command tests | Oracle E3/E9; probes: `/stats` balance stable 64.75 credits over two runs
- AC-8: PASS | check:ci, typecheck, package tests (99), bundle tests 16/16, write:false rebuild match | Oracle E2/E5-E8
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:a601b6a7a3971bad2a531ca0f85fe40f35b167b5de23e3e23802b5a4c59c9b24

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
