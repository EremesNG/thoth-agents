# Change: pi-askcodex

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: medium
**Risk**: medium

## Exploration

- Reference tool: `AskAntigravity` in `pi-packages/pi-antigravity-bridge/src/ask-tool.ts:386-1068` (TypeBox schema `:405-466`; rendering `:467-586`; validation `:616-634`; spawn `:710-815`; progress `:782-791`; watchdog/abort `:839-890`; result shapes `:921-978`; includeContext export `:687-708,1005-1068`) and `src/process-termination.ts:11-71` (Windows `taskkill /PID /T /F`; POSIX group kill). Registration `extensions/index.ts:577`; config `src/config.ts`. Rendering uses pi-core UI helpers and tool-definition publication. `AskClaude` (`pi-packages/pi-claude-bridge/src/index.ts:2316-2500`) is SDK/provider-coupled and not a template.
- Repo wiring: `pnpm-workspace.yaml` wildcard; explicit bundle map `scripts/build-pi-extensions.mjs:8-24` (bundle `dist/index.ts`, externals `@earendil-works/*`, `typebox`); release discovers manifests (`scripts/release-pi.mjs:13-29`); CI enumerates package checks incl. `pi-packages-windows` (`.github/workflows/ci.yml:130,191-195,221-226`); routes `docs/agent/index.md:20-22`, `docs/agent/harness-packaging.md:604-610`.
- External (OpenAI docs, codex repo, 2026): `codex exec --json` is a non-interactive JSONL job API; `codex mcp-server` removed; `codex app-server` is experimental bidirectional JSON-RPC over stdio with client-handled approvals and MCP elicitations; `@openai/codex-sdk` wraps `exec`.
- Live spikes on the user's Windows 11 machine (2026-10-16; client `%TEMP%/codex-appserver-spike/phase3.mjs`, `general.mjs`):
  - `codex exec` auto-declines Computer Use app approvals (`Computer Use was not approved to use notepad`), also with `--approve-for-me`; the CLI ignores `computer_use.windows.always_allowed_app_ids`.
  - Computer Use routing: plugin MCP `cua_repl` is browser-only (`CUA_REPL_ENABLED_SURFACES="browser"`; user's real Edge/Chrome tabs via extension, works with Desktop closed); native Windows apps use MCP `node_repl` + `@oai/sky` through a Codex Desktop named pipe (Desktop must run).
  - PATH `codex-cli 0.162.1` (`%LOCALAPPDATA%/Programs/OpenAI/Codex/bin/codex.exe`): native screenshots blank, typing not delivered, read-only shell fails (`helper_unknown_error: setup refresh had errors`; sandbox log ACL os error 32).
  - Desktop-bundled `%LOCALAPPDATA%/OpenAI/Codex/bin/<hash>/codex.exe` (0.162.0-alpha.17.2) `app-server --stdio`: Notepad launch/click/type verified by screenshot after the client accepted `mcpServer/elicitation/request` with `{action:"accept",content:{persist:"session"},_meta:null}`; read-only shell and reads, workspace-write edits, `thread/resume` after full process restart, `turn/interrupt` (interrupted in 371 ms), web search (`config:{web_search:"live"}`), turn `model`/`effort` all PASS. `codex app-server proxy` unavailable (WSA 10050).
  - Protocol: `initialize`→`initialized`; `thread/start {cwd,sandbox,approvalPolicy,approvalsReviewer,ephemeral,model,baseInstructions,developerInstructions,config}`; `thread/resume {threadId,...}`; `turn/start {threadId,input:[{type:"text",text,text_elements:[]}],model,effort,...}`; `turn/interrupt {threadId,turnId}`; notifications `item/agentMessage/delta`, `item/started`, `item/completed`, `item/commandExecution/outputDelta`, `turn/started`, `turn/completed`, `turn/plan/updated`, `turn/diff/updated`, `thread/tokenUsage/updated`. Usage arrives only via `thread/tokenUsage/updated`; interrupted turns may omit `item/completed`; the model's final prose misreported approvals, so protocol events are authoritative.
- Baseline: `.thoth/specs/pi-ecosystem/spec.md` has no AskCodex requirement. No active change records.

## Intent

A new first-party Pi package `@thoth-agents/pi-askcodex` (`pi-packages/pi-askcodex`) registers an `AskCodex` tool that delegates a self-contained task to the user's local Codex harness through `codex app-server`, so Pi agents can use Codex-native capabilities — code agent with real sandbox, web search, configured MCP/skills, and Computer Use over the user's real browser and native Windows apps — with continuation, cancellation, live progress, and approvals answered by policy or by the user.

## Non-goals

- No Pi model provider, no `codex exec`/SDK fallback path, no `app-server proxy`/daemon use.
- No edits to `~/.codex/config.toml` or Codex Desktop state; no persistent ("always") app approvals.
- No changes to `pi-antigravity-bridge` or `pi-claude-bridge`; no shared runner extraction.
- No automated real-Codex tests in CI; no version bump of other packages.
- No guarantee of compatibility with future Codex app-server protocol changes beyond fail-closed detection.

## Acceptance

- AC-1: `pi-packages/pi-askcodex` exists as a bundled first-party Pi extension (`@thoth-agents/pi-askcodex`, version 0.1.0) wired into the extension bundle map and the CI package checks including `pi-packages-windows`, with typecheck, tests and build passing.
- AC-2: An app-server client spawns the resolved binary with `app-server --stdio`, performs the handshake, starts or resumes threads, starts turns, streams notifications, answers server requests, interrupts turns, and terminates its own process tree; verified against a fake app-server in unit tests (handshake, turn completion, interrupt, unknown/failed process, malformed output, exit mid-turn).
- AC-3: Binary resolution prefers an explicit config/env path, then the newest Desktop-bundled `%LOCALAPPDATA%/OpenAI/Codex/bin/<hash>/codex.exe`, then `codex` on PATH with a returned warning that native Computer Use and read-only shell may not work; the tool reports whether Codex Desktop appears to be running when native Computer Use is relevant.
- AC-4: Server requests are answered by policy: Computer Use app elicitations for apps in a configurable allowlist are accepted with session scope; other elicitations and command/file/permission approvals ask the user through Pi UI when available and are declined without UI; "always" persistence is never granted; every decision is reported in the tool result details.
- AC-5: `AskCodex` is registered (enabled by default, disable via config) with parameters `prompt`, `mode` (`plan`→read-only sandbox, `accept-edits`→workspace-write, default `accept-edits`), `conversationId`, `model`, `thinking`/`effort` synonyms, `cwd`, `digest`, `includeContext`, `webSearch`, `timeoutMinutes`; it returns the final agent message, `conversationId` (threadId) for continuation, token usage, approvals and errors; it renders live progress and cancels via `turn/interrupt` then process-tree termination on abort/timeout.
- AC-6: Developer instructions sent to Codex route Computer Use correctly (browser via `cua_repl`; native apps via `node_repl` + `@oai/sky` with `globalThis` bindings, explicit window ids, and screenshot verification) and tell Codex that Pi delegated the task.
- AC-7: Package README and `docs/agent` routing document the tool, configuration, Desktop requirement, binary resolution and risks; the `pi-ecosystem` spec delta is declared.
- AC-8: A live smoke on the user's machine passes: one general read-only task with shell, one continuation by `conversationId`, and one native Computer Use task (Notepad: launch, type, screenshot-verified) with the Notepad approval handled by the allowlist.

## Clarifications

- Package name: user chose `pi-askcodex` (not `pi-codex-bridge`).
- Approval handling: user chose configurable allowlist (session-scope auto-accept) plus asking the user for anything else; decline without UI.
- Minimum Codex version: the currently installed one; Desktop-bundled 0.162.0-alpha.17.2 is the verified runtime.
- Transport: user has no CLI/SDK preference as long as the goal (Codex harness capabilities incl. Computer Use) is met; spikes showed only app-server meets it.

## Decisions

- Transport is `codex app-server --stdio` JSON-RPC implemented directly in the package (no `@openai/codex-sdk`, which wraps `exec` and cannot answer elicitations).
- Threads are non-ephemeral so `conversationId` continuation survives process restarts; they persist under the user's `~/.codex/sessions` and may appear in Codex Desktop history (documented).
- The user's Codex config (MCP servers, hooks, plugins, skills) is loaded unchanged; that is the point of delegating to the Codex harness.
- `AskCodex` is enabled by default because installing this single-purpose package is the opt-in; a config flag disables it.
- Default allowlist is empty; allowlist entries match Computer Use `tool_params.app` identifiers case-insensitively.
- Protocol method/field names are pinned from `codex app-server generate-ts` of the verified binary; unknown server requests are declined and reported; a failed handshake fails closed with an actionable error.
- Reuse by copying the CLI-neutral pieces of `pi-antigravity-bridge` (rendering shape, progress cadence, process termination, includeContext export, digest prefix) into the new package; no cross-package refactor.
- Config file `~/.pi/agent/askcodex/config.json` with env overrides `ASKCODEX_BIN`, `ASKCODEX_ENABLED`, `ASKCODEX_DEFAULT_MODEL`, `ASKCODEX_DEFAULT_EFFORT`.

## Durable deltas

- `ADDED pi-ecosystem` **AskCodex app-server delegation** — `@thoth-agents/pi-askcodex` MUST register an `AskCodex` tool, unless disabled by configuration, that delegates a task to the local Codex harness through `codex app-server` over stdio, resolving the binary from explicit configuration, then the Codex Desktop-bundled executable, then PATH with a warning; it MUST map `plan` to a read-only sandbox and `accept-edits` to workspace-write, return the final agent message, a continuation id that resumes the same Codex thread, token usage and every approval decision; it MUST answer Computer Use app elicitations by accepting allowlisted apps with session scope only, asking the user through Pi UI for other approvals when UI is available and declining them otherwise, never granting persistent approval; and it MUST interrupt the turn and terminate its own process tree on abort or timeout.
  - GIVEN Codex Desktop running, `notepad.exe` allowlisted and no Pi UI; WHEN `AskCodex` asks Codex to type text into Notepad and Codex requests Computer Use approval for Notepad and later a command approval outside the sandbox; THEN the Notepad request is accepted with session persistence, the command approval is declined, both decisions appear in the result, and the result includes the final message and a continuation id.

## Plan

- **Package** `pi-packages/pi-askcodex`: mirror `pi-antigravity-bridge` manifest/tsconfig/vitest layout; entry `src/index.ts` registers the tool; add to `scripts/build-pi-extensions.mjs` map and CI package checks (Linux + `pi-packages-windows`).
- **Modules** (each with focused Vitest tests, test-first):
  - `src/protocol.ts` (AC-1, frozen before parallel units): minimal typed subset of app-server messages used, `ServerRequest` variants with response shapes, and `ServerRequestHandler` (from generated bindings; no generated dump committed).
  - `src/app-server-client.ts`: spawn (`shell:false`, `windowsHide:true`, POSIX-only detached), newline-delimited JSON-RPC framing, request/response correlation, notification and server-request dispatch, handshake, `thread/start|resume`, `turn/start`, `turn/interrupt`, close; uses copied `process-termination.ts`. Tests use a fake app-server Node script under the package test dir.
  - `src/binary.ts`: resolution order and Desktop-running probe (process list on Windows; best-effort elsewhere).
  - `src/approvals.ts`: pure decision function (allowlist / ask / decline) plus UI adapter.
  - `src/config.ts`: config file + env overrides.
  - `src/instructions.ts`: developer instructions for delegation and Computer Use routing.
  - `src/ask-tool.ts`: schema, validation, rendering, progress (elapsed + last agent delta / current item), turn lifecycle, timeout, abort, result assembly, includeContext/digest.
- **Seams**: fake app-server for client and tool tests; approvals and binary resolution as pure functions; live smoke (AC-8) run by root with the user's consent.
- **Risks**: experimental protocol drift (mitigate: fail-closed handshake, pinned fields, actionable errors); Desktop-bundled path hash changes on update (resolve dynamically); Windows process cleanup (copied tested termination); approval prompts blocking unattended subagents (decline without UI); threads visible in Desktop history (documented).
- **Verification**: per-unit focused tests; `pnpm --filter @thoth-agents/pi-askcodex typecheck/test`, `pnpm run check:ci`, `pnpm run typecheck`, `pnpm run build`; live smoke; fresh Oracle final verification.

## Tasks

- [x] AC-1: Scaffold `pi-packages/pi-askcodex`, wire bundle map and CI, and freeze protocol/handler types
  - Outcome: buildable extension package registered in bundling and CI checks, plus a frozen `src/protocol.ts` defining the used app-server message subset, `ServerRequest` variants (elicitation, command/file/permission approvals, unknown), their response shapes, and the `ServerRequestHandler` signature consumed by AC-2 and implemented by AC-4
  - Known entrypoints and skill paths: `pi-packages/pi-antigravity-bridge/{package.json,tsconfig.json,vitest.config.*,extensions/index.ts}`, `scripts/build-pi-extensions.mjs:8-24`, `.github/workflows/ci.yml:130,191-195,221-226`, `docs/agent/harness-packaging.md:604-610`
  - Inputs: Exploration and Decisions of this record
  - Dependencies: none
  - Output: package skeleton with placeholder entry, wiring diffs, frozen `src/protocol.ts` (types only) taken from the spike's generated bindings `%TEMP%/codex-appserver-spike/protocol/`
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-askcodex/**` (manifest, tsconfig, vitest config, `src/index.ts` stub, `src/protocol.ts`, README stub), `scripts/build-pi-extensions.mjs`, `.github/workflows/ci.yml`, `pnpm-lock.yaml` if install changes it
  - Interface boundaries: pi-core imports and bundle externals as in sibling packages; `src/protocol.ts` is read-only for AC-2/AC-3/AC-4 (changes return to root)
  - Focused check and PASS evidence: `pnpm install`, package typecheck and `node scripts/build-pi-extensions.mjs` (or `pnpm run build`) succeed and emit `pi-packages/pi-askcodex/dist/index.ts`; `src/protocol.ts` exports `ServerRequest`, response types and `ServerRequestHandler`
  - Return milestone: skeleton builds and protocol types accepted by root
  - Stop / reassessment: bundling or CI layout requires changes beyond adding entries
- [x] AC-2: App-server JSON-RPC client with fake-server tests
  - Outcome: tested client for handshake, thread start/resume, turn start/stream/interrupt, server requests, process-tree cleanup
  - Known entrypoints and skill paths: `pi-packages/pi-antigravity-bridge/src/process-termination.ts`, spike `%TEMP%/codex-appserver-spike/{phase3.mjs,general.mjs,protocol/}`; skills `tdd`, `vitest`
  - Inputs: protocol facts in Exploration; AC-1 skeleton and frozen `src/protocol.ts`
  - Dependencies: AC-1 accepted
  - Output: `src/app-server-client.ts`, `src/process-termination.ts`, fake server + tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-askcodex/src/{app-server-client,process-termination}.ts`, `pi-packages/pi-askcodex/tests/{app-server-client.test.ts,fixtures/fake-app-server.*}`
  - Interface boundaries: client API consumed by `ask-tool.ts`; `ServerRequestHandler` from `src/protocol.ts` injected
  - Focused check and PASS evidence: package Vitest suite green covering handshake, completion, interrupt, malformed line, spawn failure, exit mid-turn
  - Return milestone: client tests pass
  - Stop / reassessment: protocol facts contradict bindings
- [x] AC-3: Binary resolution and Desktop-running probe
  - Outcome: tested resolver with config/env, Desktop-bundled newest, PATH fallback warning
  - Known entrypoints and skill paths: Exploration binary paths; skill `tdd`
  - Inputs: AC-1 skeleton
  - Dependencies: AC-1 accepted
  - Output: `src/binary.ts`, `src/config.ts` + tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-askcodex/src/{binary,config}.ts`, `pi-packages/pi-askcodex/tests/{binary,config}.test.ts`
  - Interface boundaries: pure functions with injectable fs/env/process listing
  - Focused check and PASS evidence: Vitest cases for each resolution branch and config/env precedence pass
  - Return milestone: resolver tests pass
  - Stop / reassessment: none expected
- [x] AC-4: Approval policy and UI adapter
  - Outcome: tested decisions for allowlist accept (session), ask with UI, decline without UI, never "always", unknown request decline
  - Known entrypoints and skill paths: spike elicitation shape in Exploration; skill `tdd`
  - Inputs: AC-1 skeleton and frozen `src/protocol.ts`
  - Dependencies: AC-1 accepted
  - Output: `src/approvals.ts` implementing `ServerRequestHandler` + tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-askcodex/src/approvals.ts`, `pi-packages/pi-askcodex/tests/approvals.test.ts`
  - Interface boundaries: implements `ServerRequestHandler` from `src/protocol.ts`; allowlist matches exact identifiers case-insensitively (no substring or prefix broadening)
  - Focused check and PASS evidence: Vitest decision table passes, including exact-match-only allowlist cases
  - Return milestone: approval tests pass
  - Stop / reassessment: `src/protocol.ts` lacks a needed request/response shape (return to root)
- [x] AC-5: AskCodex tool registration, lifecycle and rendering
  - Outcome: registered tool with schema, modes, continuation, progress, timeout/abort, result details, includeContext/digest
  - Known entrypoints and skill paths: `pi-packages/pi-antigravity-bridge/src/ask-tool.ts:386-1068`, `extensions/index.ts:577`; skills `tdd`, `vitest`
  - Inputs: accepted AC-2, AC-3, AC-4 outputs
  - Dependencies: AC-2, AC-3, AC-4 accepted
  - Output: `src/ask-tool.ts`, `src/index.ts` registration + tests using the fake server
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-askcodex/src/{ask-tool,index}.ts`, matching tests
  - Interface boundaries: Pi tool API, pi-core rendering/publication
  - Focused check and PASS evidence: tool tests (success, continuation, timeout, abort, approval details, no-UI decline) pass; package typecheck passes
  - Return milestone: tool tests pass
  - Stop / reassessment: Pi API mismatch with sibling usage
- [x] AC-6: Delegation and Computer Use developer instructions
  - Outcome: instruction text and its wiring into `thread/start`
  - Known entrypoints and skill paths: Exploration routing facts; plugin docs `~/.codex/plugins/cache/openai-bundled/computer-use/26.1007.71326/{skills/computer-use/SKILL.md,docs/guidance.md}`
  - Inputs: AC-5 tool
  - Dependencies: AC-5 accepted
  - Output: `src/instructions.ts` + snapshot/unit test
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-askcodex/src/instructions.ts`, test, call site in `ask-tool.ts`
  - Interface boundaries: `developerInstructions` field
  - Focused check and PASS evidence: unit test asserts routing content and inclusion in thread/start params
  - Return milestone: tests pass
  - Stop / reassessment: none expected
- [x] AC-7: README, docs/agent routing
  - Outcome: user and agent documentation of tool, config, Desktop requirement, binary resolution, risks, and that `plan` (read-only sandbox) does not make MCP tools or Computer Use GUI actions read-only
  - Known entrypoints and skill paths: `docs/agent/index.md`, `docs/agent/harness-packaging.md`, sibling READMEs
  - Inputs: accepted AC-1..AC-6
  - Dependencies: AC-6 accepted
  - Output: `pi-packages/pi-askcodex/README.md`, routing updates
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-askcodex/README.md`, `docs/agent/index.md`, `docs/agent/harness-packaging.md`
  - Interface boundaries: none
  - Focused check and PASS evidence: `pnpm run check:ci` passes; docs name config keys matching `src/config.ts`
  - Return milestone: docs merged
  - Stop / reassessment: none expected
- [x] AC-8: Live smoke on the user's machine
  - Outcome: evidence for general read-only task, continuation, and allowlisted Notepad Computer Use
  - Known entrypoints and skill paths: built `pi-packages/pi-askcodex/dist/index.ts`
  - Inputs: accepted AC-1..AC-7; user consent for GUI action; allowlist containing the exact Notepad identifiers requested (executable and packaged-app id, as observed in the spike)
  - Dependencies: AC-7 accepted
  - Output: recorded results in Verification
  - Owner: root with user
  - Writes: none
  - Interface boundaries: user's Codex Desktop
  - Focused check and PASS evidence: final messages and screenshot show expected results; approvals reported
  - Return milestone: smoke complete
  - Stop / reassessment: Codex runtime update changes behavior

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
Round 1 REJECT (AC-4 consumed AC-2 types in parallel); repaired by freezing `src/protocol.ts` in AC-1. Round 2 fresh Oracle OKAY, envelope validated. Nonblocking caution carried into AC-1 dispatch: add pi-askcodex to the packed-bundle smoke inventory in `scripts/pi-extension-bundles.test.mjs`.
**Implementation**: AUTHORIZED
User explicitly selected Implement after validated plan-review OKAY (2026-10-16).

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 8dbf09fbba8b1d044307c82d0b0ee0be644147afd206facebf9d4fbd072b2f99
Round history: R1 FAIL (Windows descendant cleanup; Desktop status), R2 FAIL (Render kit output reuse), R3 FAIL (codemode model-only exposure; restored success borders), R4 fresh Oracle PASS. Nonblocking: transient Windows pipe-close test failure under concurrent load (reruns passed); README protocol-error wording broader than malformed-line discard behavior (follow-up).

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS. Both round-3 defects are fixed. AC-1 through AC-8, the declared delta and applicable canonical requirements are satisfied; no blocking defects found.",
  "evidence": [
    {
      "id": "E1",
      "kind": "governance",
      "locator": ".thoth/changes/pi-askcodex/pi-askcodex.md; .thoth/specs/pi-ecosystem/spec.md",
      "claim": "Independently recomputed record-prefix SHA-256 matches 8dbf09fbba8b1d044307c82d0b0ee0be644147afd206facebf9d4fbd072b2f99; canonical baseline matches 653f7114ccc34ee0a68480f419b76c6983a3fb7802a726815521b40fa982d34d. Installed SDD verify validator passes.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E2",
      "kind": "diff",
      "locator": "git status --short; git diff; pi-packages/pi-askcodex/**",
      "claim": "Reviewed tracked changes and all untracked package source, tests, manifest and documentation, excluding generated/dependency directories. Package is version 0.1.0, wired into Linux/Windows CI and bundle checks. Build produced no additional tracked drift; git diff --check passes.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E3",
      "kind": "implementation-and-tests",
      "locator": "pi-packages/pi-askcodex/src/{app-server-client,process-termination}.ts; tests/{app-server-client,process-termination}.test.ts",
      "claim": "Client implements stdio handshake, thread continuation, streaming, request correlation, approvals, interruption and bounded cleanup. Windows cleanup avoids EOF grace and snapshots descendant PIDs; persistent-descendant regressions pass.",
      "basis": "observed",
      "uncertainty": "One initial pipe-close timing test failed; focused and full reruns passed."
    },
    {
      "id": "E4",
      "kind": "implementation-and-runtime",
      "locator": "pi-packages/pi-askcodex/src/{binary,config}.ts; tests/{binary,config}.test.ts",
      "claim": "Resolution precedence, warnings, configuration defaults/overrides and tri-state Desktop reporting are implemented and tested. Independent read-only Desktop probe returned true.",
      "basis": "observed",
      "uncertainty": "Desktop detection is a process signal, not a Computer Use capability guarantee."
    },
    {
      "id": "E5",
      "kind": "implementation-and-tests",
      "locator": "pi-packages/pi-askcodex/src/approvals.ts; tests/approvals.test.ts",
      "claim": "Exact case-insensitive app allowlisting grants session scope only; other approvals use UI or decline without it. Unknown requests, cancellation and unsupported choices decline. Decisions are recorded; persistent approval is never returned.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E6",
      "kind": "implementation-and-tests",
      "locator": "pi-packages/pi-askcodex/src/{ask-tool,instructions,index}.ts; tests/{ask-tool,instructions}.test.ts",
      "claim": "AskCodex now declares exposure: 'model-only'. Parameters, sandbox mapping, continuation, result metadata, progress, timeout/abort, context cleanup and delegation instructions are covered. Definitions publish only with UI and withdraw on shutdown.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E7",
      "kind": "canonical-contract",
      "locator": "pi-packages/pi-askcodex/src/render-tool-card.ts:42-113; tests/render-tool-card.test.ts; pi-core/src/{render-kit,tool-registry}.ts",
      "claim": "Completed cards use createKitRenderMemo with invalidation, width and kit-change handling. Restored successful call/result parts receive success borders without an executionStarted veto; failures and running states remain distinct. Render-time kit lookup, native fallback, shared footers/icons and version-tolerant registries are preserved.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E8",
      "kind": "documentation",
      "locator": "pi-packages/pi-askcodex/README.md; docs/agent/{index,harness-packaging}.md",
      "claim": "Documentation covers installation, parameters, config, Desktop requirements, binary precedence, approvals, persistent threads, sandbox limitations and experimental-runtime risks.",
      "basis": "observed",
      "uncertainty": "Protocol-error wording is broader than the implemented malformed-line recovery behavior."
    },
    {
      "id": "E9",
      "kind": "recorded-live-evidence",
      "locator": "C:/Users/EremesNG/AppData/Local/Temp/askcodex-smoke/run{1,2,3}.jsonl; change record Verification",
      "claim": "Recorded tool executions completed: shell/README task returned VERDE-19; continuation reused the same thread and recalled 7731 and VERDE-19; Notepad task reported fresh-screenshot verification and recorded packaged-app allowlist session approval. Record also contains root's independent Notepad-title observation.",
      "basis": "observed",
      "uncertainty": "Existing live evidence was inspected; no GUI actions or new live Codex calls were performed."
    },
    {
      "id": "E10",
      "kind": "executed-checks",
      "locator": "Independent round-4 command results",
      "claim": "Root typecheck, check:ci, package typecheck, build and test:pi-extensions passed; bundle tests passed 13/13. Initial package run passed 155/156; focused cleanup rerun passed 4/4 and subsequent full package run passed 156/156. No remaining fixture-process candidates were observed.",
      "basis": "observed",
      "uncertainty": "check:ci reported warnings/information but no errors."
    }
  ],
  "verification": [
    {
      "check": "AC-1",
      "method": "Manifest, CI/bundle diff, package typecheck, build and packed-bundle tests",
      "outcome": "pass",
      "evidenceIds": ["E2", "E10"],
      "reason": "First-party package registration, version, wiring and published bundle activation verified."
    },
    {
      "check": "AC-2",
      "method": "Client/termination source review and fake-server tests",
      "outcome": "pass",
      "evidenceIds": ["E3", "E10"],
      "reason": "Required protocol lifecycle and failure paths pass, including persistent-descendant cleanup."
    },
    {
      "check": "AC-3",
      "method": "Resolver/config/probe tests and independent Desktop probe",
      "outcome": "pass",
      "evidenceIds": ["E4", "E10"],
      "reason": "Precedence, PATH warning and returned Desktop status verified."
    },
    {
      "check": "AC-4",
      "method": "Approval decision-table review, tests and recorded live approval",
      "outcome": "pass",
      "evidenceIds": ["E5", "E9", "E10"],
      "reason": "Session-only allowlisting, UI/no-UI policy, denial and decision reporting verified."
    },
    {
      "check": "AC-5",
      "method": "Tool lifecycle/schema review, package tests and live records",
      "outcome": "pass",
      "evidenceIds": ["E3", "E6", "E7", "E9", "E10"],
      "reason": "Registration, parameters, continuation, results, progress and cancellation satisfy the contract."
    },
    {
      "check": "AC-6",
      "method": "Instruction content and thread-start/resume wiring review",
      "outcome": "pass",
      "evidenceIds": ["E6", "E10"],
      "reason": "Pi delegation, browser/native routing, persistent bindings, explicit window targeting and screenshot verification are present."
    },
    {
      "check": "AC-7",
      "method": "README/router review and delta inspection",
      "outcome": "pass",
      "evidenceIds": ["E1", "E8"],
      "reason": "Required documentation and exact-title ADDED delta are present."
    },
    {
      "check": "AC-8",
      "method": "Read-only inspection of three live JSONL records and recorded root observation",
      "outcome": "pass",
      "evidenceIds": ["E9"],
      "reason": "General shell task, same-thread continuation and allowlisted native Notepad smoke are evidenced."
    },
    {
      "check": "ADDED AskCodex app-server delegation",
      "method": "Cross-check normative statement/scenario against implementation, policy tests and live results",
      "outcome": "pass",
      "evidenceIds": ["E3", "E4", "E5", "E6", "E9"],
      "reason": "Required transport, resolution, modes, continuation, approvals, output and cancellation behavior are satisfied."
    },
    {
      "check": "Applicable canonical pi-ecosystem requirements",
      "method": "Review render kit, output reuse, definition registry, result borders, standard footer, semantic icons, bundling, version tolerance and codemode delegation boundary",
      "outcome": "pass",
      "evidenceIds": ["E2", "E6", "E7", "E10"],
      "reason": "All applicable first-party producer contracts hold. Other canonical requirements concern unchanged package-specific behavior, channels or panel surfaces not introduced here."
    },
    {
      "check": "Governance, Decisions and Non-goals",
      "method": "Read AGENTS.md, constitution, installed SDD guidance, complete record and actual diff",
      "outcome": "pass",
      "evidenceIds": ["E1", "E2", "E6", "E8"],
      "reason": "Authorization/provenance validates; no forbidden fallback, sibling refactor, governance mutation or unrelated version bump found."
    },
    {
      "check": "Required validation commands",
      "method": "Executed pnpm run typecheck, pnpm run check:ci, package pnpm exec vitest run, pnpm run build and pnpm run test:pi-extensions",
      "outcome": "pass",
      "evidenceIds": ["E10"],
      "reason": "Final executions pass; initial transient Windows failure is retained explicitly rather than concealed."
    }
  ],
  "risks": [
    {
      "description": "Windows pipe-close test transiently failed during concurrent root checks, then passed focused and full reruns. Retain both outcomes; deterministic cleanup regressions were not reproduced.",
      "severity": "low",
      "blocking": false,
      "evidenceIds": ["E3", "E10"]
    },
    {
      "description": "README says protocol errors fail the call, but malformed/oversized stdout lines are deliberately discarded and the tool supplies no diagnostic callback. Clarify this wording; handshake failures and unknown approval requests still fail closed.",
      "severity": "low",
      "blocking": false,
      "evidenceIds": ["E3", "E8"]
    }
  ],
  "openQuestions": [],
  "nextAction": "Root should validate this unchanged envelope, record the passing evidence and transient test outcome, then run closeout before archive.",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/pi-askcodex/pi-askcodex.md",
    "reviewedRecordSha256": "8dbf09fbba8b1d044307c82d0b0ee0be644147afd206facebf9d4fbd072b2f99"
  }
}
```

After PASS, root pastes the Oracle's unchanged final-verification envelope here.

- AC-1: PASS | package typecheck, `pnpm run build`, `pnpm run test:pi-extensions` | pi-askcodex bundle emitted; packed-bundle smoke 13/13 pass incl. pi-askcodex; wired in build map and ci.yml (Linux + pi-packages-windows)
- AC-2: PASS | `vitest run` in pi-askcodex (tests/app-server-client.test.ts, process-termination.test.ts) | fake app-server covers handshake, streaming/framing, server requests, interrupt, malformed lines, spawn failure, exit mid-turn; package 156/156 pass (150 also 3x + concurrent with typecheck/build); round-1 Oracle FAIL (Windows descendants survived leader EOF exit) fixed: Windows skips EOF grace, snapshots descendant PIDs, kills live tree, kills surviving snapshot PIDs; regression `close kills a persistent descendant across leader exit` 3x pass
- AC-3: PASS | tests/binary.test.ts, tests/config.test.ts; live probe | resolution branches and config/env precedence pass; live smoke resolved `desktop` binary after Desktop auto-update (hash e78bad9887fa50cf); Store-package Desktop detection fixed, live probe true; probe result returned as `details.desktop.running` (true|false|unknown) with tests for all three
- AC-4: PASS | tests/approvals.test.ts; live smoke run 3 | exact-match allowlist, UI/no-UI, never persist always, unknown decline; live: Notepad packaged id accepted with source allowlist, decision recorded in details
- AC-5: PASS | tests/ask-tool.test.ts; live smoke runs 1-3 via `pi -p -e dist/index.ts --tools AskCodex` | params/modes/continuation/timeout/abort/approvals tested; live result text + conversationId + usage + approvals returned; abort/timeout descendant-kill regressions pass; round-2 Oracle FAIL (Render kit output reuse) fixed with createKitRenderMemo caching of completed cards, 8 render regressions in tests/render-tool-card.test.ts; round-3 Oracle FAIL fixed: `exposure: 'model-only'` (Codemode delegation boundary) and restored-history success borders (Render kit result borders) with 6 regressions
- AC-6: PASS | tests/instructions.test.ts | routing content (cua_repl browser, node_repl + @oai/sky, globalThis, screenshot verification, denial stop, read-only line) asserted and passed as developerInstructions in thread/start
- AC-7: PASS | `pnpm run check:ci` (no errors) | README (config keys cross-checked with src/config.ts, plan-mode MCP/GUI caveat, approvals, risks), CHANGELOG 0.1.0, docs/agent/index.md and harness-packaging.md updated
- AC-8: PASS | live smoke 2026-10-16 on user machine | run1 plan: shell listing + README codeword VERDE-19; run2 continuation by conversationId recalled 7731 and VERDE-19; run3 Notepad launch/type verified, window title `*Prueba AskCodex desde Pi: Bloc de notas` checked independently by root via Get-Process
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:653f7114ccc34ee0a68480f419b76c6983a3fb7802a726815521b40fa982d34d

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
