# Change: pi-provider-status

**Classification**: substantial
**Scope**: cross-cutting
**Uncertainty**: medium
**Risk**: medium

## Exploration

- Claude bridge (`pi-packages/pi-claude-bridge`): handles SDK `rate_limit_event` (`src/index.ts:1548-1579`; status allowed/allowed_warning/rejected, optional reset, utilization, window type, overage fields per installed SDK `sdk.d.ts:5606-5626`); notifies through `piUI` and keeps query-local state only. Runs in root sessions and, through default `lifecycle_passthrough` (`pi-subagents/src/config.ts:28-33`), in subagent children. Usage cost is already API-equivalent via `calculateCost` (`src/usage.ts:38-49`, `src/models.ts:47-55`). No production `registerCommand` exists. Queries use streaming input (`src/index.ts:2073-2119`); the SDK spawns the CLI with `windowsHide` (`sdk.mjs:136`), control requests need initialization but not a user message (`sdk.mjs:139-140`), an exhausted empty iterable closes stdin (`sdk.mjs:140-141`), and `close()` terminates the subprocess (`sdk.d.ts:3233-3241`).
- Claude quota on demand exists only as the experimental `usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({skipBehaviors})` control request (`get_usage`, SDK 0.3.169+; `sdk.d.ts:3038-3056,4206-4312`; utilization 0-100, ISO resets; limits may be null for API-key/Bedrock/Vertex). Official docs: no stable getter; events are stable.
- Antigravity bridge (`pi-packages/pi-antigravity-bridge`): provider id `antigravity` (`extensions/index.ts:531`); registered models price at zero (`src/models.ts:395`), cost initialized to zero and only input/output/cache-read tokens mapped (`src/provider.ts:64-73`, `src/stream-events.ts:107-124`); ACP may synthesize token estimates (`src/acp/usage-estimate.ts:14-59`). `/agy quota` (`extensions/index.ts:1195,1201,1617-1640`) spawns `agy --print /usage --output-format json` through a helper that already sets `windowsHide: true`, `shell: false` (`src/models.ts:132-137`, `src/usage.ts:118-124`); the reported Windows window flash has no established cause.
- pi-ai catalog prices (installed `providers/data/*.json`): `google/gemini-3.6-flash`, `gemini-3.7-flash`, `gemini-3.1-pro-preview`, `anthropic/claude-sonnet-4-6`, `groq/openai/gpt-oss-120b`; Antigravity ids differ (`gemini-3.1-pro`, effort-qualified GPT-OSS slugs; `src/models.ts:305-355`).
- Theme `(sub)`: `statusLine.subscriptionProviders` default `['claude-bridge']` (`pi-thoth-theme/src/status-line/index.ts:46-48`, `src/shared/config.ts:17,36-45`), applied by current provider to the displayed total.
- Subagent children run in-process (`pi-subagents/src/runner/sdk-runner.ts:478-534`) and share `globalThis`; a `Symbol.for` interaction registry maps child session-manager id to task id (`sdk-runner.ts:355-371,718-722`, `runner/interaction-session-registry.ts:1-8`). Child EventBuses are isolated (`resource-loader.js:243,506`).
- pi-openai-fast holds no status worth publishing; Codex quota headers are not mapped.
- Installer (`src/cli/pi-install.ts:58-109`) does not manage the bridges or pi-openai-fast.

## Intent

Make provider rate-limit state visible across sessions and give subscription providers an API-equivalent cost: Claude rate-limit events from root or subagent sessions land in a process-wide pi-core provider-limits registry that consumers (a future sidebar) can list and subscribe to; affected subagent cards show the warning; Antigravity reports what its usage would have cost via API; a `/claude quota` command shows Claude plan usage on demand; the `/agy quota` window flash is fixed if caused by this repository.

## Non-goals

- Periodic or automatic quota fetching; showing quota in the sidebar (quota stays on-demand commands).
- pi-openai-fast status; Codex quota.
- Installer management of the bridges or pi-openai-fast (documented manual install only).
- Changing the theme `(sub)` logic beyond adding `antigravity` to the default list.
- Sidebar UI; package version bumps.

## Acceptance

- AC-1: pi-core exports a process-wide, version-tolerant provider-limits registry (`Symbol.for` key with contract version) with `reportProviderLimit`, `listProviderLimits` and `subscribeProviderLimits`; entries are keyed by provider and window and carry only status, utilization as a 0..1 fraction, reset time and observation time in Unix ms, window type, overage flags and the observing session id; validators reject extra or malformed fields; covered by tests including two pi-core copies sharing one registry.
- AC-2: the Claude bridge reports every `rate_limit_event` it receives, in root or subagent sessions, to the registry with the session id of the observing session, normalizing units; its existing notifications are unchanged.
- AC-3: subagent cards (work panel row and `/subagents` detail) show a rate-limit warning with the reset time while a limit observed by that task's child session is warning or rejected and not yet reset, without changing the task status.
- AC-4: the Antigravity bridge sets each message's cost to the API-equivalent `calculateCost` result through an explicit, tested model-to-catalog mapping (unmapped models keep cost 0 and are logged once as unpriced); session totals and subagent costs include it; the theme's default `subscriptionProviders` includes `antigravity`.
- AC-5: `/claude quota` shows the plan windows (5 hour, weekly, Opus/Sonnet, extra usage) with utilization and reset times on demand through the experimental SDK usage request without sending a prompt, closes its CLI process, times out, and reports a clear message when the API or plan data is unavailable.
- AC-6: the `/agy quota` window flash is diagnosed with live evidence: either it is caused by this repository's spawn and no longer shows a window, or a live desktop capture shows `/agy quota` produces no visible window and the README documents the evidence and the unattributed earlier flash.
- AC-7: READMEs document the new registry and commands and that the bridges and pi-openai-fast are installed manually; spec updated; the local closeout gate (touched package tests and typechecks, `pnpm run check:ci`, `pnpm run typecheck`, `pnpm run build`, `pnpm run test:pi-extensions`) passes, followed by a live user check.

## Clarifications

- Payload/quota (user, 2026-10-09): cost per session/subagent plus provider quota; quota only on demand through commands like `/agy quota`, kept out of the sidebar; no periodic fetches.
- Child rate limits (user, 2026-10-09): rate-limit warnings observed in subagents must reach the parent and show on the subagent card and detail.
- Claude quota source (user, 2026-10-09): events only for shared state; an on-demand `/claude quota` command similar to `/agy quota` if feasible.
- Antigravity cost (user, 2026-10-09): API-equivalent estimate through an explicit catalog mapping; `(sub)` keeps its current logic, meaning part of the cost is subscription, with `antigravity` added to the default list.
- Installer (user, 2026-10-09): bridges and pi-openai-fast stay out of the installer; README documents manual installation.
- `/agy quota` flash (user, 2026-10-09): a live capture during repeated `/agy quota` runs showed no visible window and the user saw none; the user attributes the earlier flash to the terminal host (Orca). AC-6 closes on that evidence.

## Decisions

- D-1: Shared state is a process-wide registry, not a bus channel: children share `globalThis` but not the EventBus, and limits are account-wide. The sidebar reads it in-process like the work-panel discovery API.
- D-2: Registry key `Symbol.for('thoth.pi-core.provider-limits.v1')`; entries replace the previous value per provider+window; listeners synchronous and isolated; expired entries (reset passed) are reported as `allowed` with no utilization on read.
- D-3: Mapping table (Antigravity id -> pi-ai catalog id): Gemini Flash versions to the same Google id, `gemini-3.1-pro` to `google/gemini-3.1-pro-preview`, Claude Sonnet 4.6 to `anthropic/claude-sonnet-4-6`, GPT-OSS 120B variants to `groq/openai/gpt-oss-120b`; extended only by explicit entries with tests.
- D-4: `/claude quota` keeps a streaming input iterable open until the usage response arrives, then calls `close()`; 30-second timeout; output units normalized (0-100 shown as percent).
- D-5: Subagent warning attribution is captured while the child is live: pi-subagents subscribes to the provider-limits registry and, when a report's session id maps to a running task through the interaction session registry, stores the observation in a bounded UI-side per-task cache (keyed by task id and provider+window) that survives task teardown and is independent of later registry replacement by other sessions; row and detail read the same cache; the provider notifies work-panel changes on each report and schedules a refresh at the reset time so warnings clear without further task activity. The warning is a data segment with the warning role in the v2 row and a field in the detail.
- D-6: The Claude bridge attributes each event to the session of the query that produced it (`queryCtx.piSessionId` / provider options), not module-level session state, and covers every SDK query-consumer path. Antigravity cost is computed in the shared usage/stream mapping before terminal emission, preserving ACP estimate labeling and exact-usage supersession, keyed by normalized Pi model ids.

## Durable deltas

- `ADDED pi-ecosystem` **Provider rate-limit registry** — pi-core MUST provide a process-wide, version-tolerant registry of provider rate-limit windows that bridges in root or subagent sessions report to and consumers can list and subscribe to, containing only status, utilization fraction, reset and observation times, window type, overage flags and the observing session id; the Claude bridge MUST report every rate-limit event to it, and subagent cards MUST show an active warning observed by their own session.
  - GIVEN a subagent running on the Claude bridge; WHEN its query receives a warning rate-limit event; THEN the registry lists that window with the child session id, a consumer subscribed in the root session is notified, and the subagent's card shows the warning with its reset time.
- `ADDED pi-ecosystem` **Subscription provider cost and on-demand quota** — the Antigravity bridge MUST report API-equivalent message cost through an explicit model-to-catalog price mapping, the theme MUST treat `antigravity` as a default subscription provider, and provider quota MUST only be fetched on demand through `/agy quota` and `/claude quota`, never periodically.
  - GIVEN an Antigravity session using a mapped Gemini model; WHEN a turn completes and the user runs `/claude quota`; THEN the message cost equals the catalog price for its tokens, the status line includes it marked `(sub)`, and the quota command prints the plan windows without sending a prompt.

## Plan

Units:

1. pi-core registry (D-1, D-2) with tests. Blocks 2 and 5.
2. Claude bridge: report events to the registry; `/claude quota` (D-4).
3. Antigravity bridge: price mapping and cost (D-3); `/agy quota` flash diagnosis (AC-6). Independent of 1.
4. Theme default `subscriptionProviders` adds `antigravity`. Independent.
5. pi-subagents: card/detail warning (D-5). After 1.
6. Docs + gate; live check.

Units 3 and 4 start immediately with 1; 2 and 5 after 1. Disjoint package writes.

Risks: experimental Claude usage API may change (isolated to the command with clear failure); price mapping drift; registry noise from repeated 429 events (replace per window); window-flash cause may be inside `agy`.

## Tasks

- [x] AC-1: pi-core provider-limits registry
  - Outcome: exported registry API with tests
  - Known entrypoints and skill paths: pi-packages/pi-core/src/{index.ts,work-panel-state.ts (pattern),tool-registry.ts (pattern)}, pi-packages/pi-core/test/registry-copies.test.ts; skills tdd, simplify
  - Inputs: Exploration; Decisions D-1, D-2
  - Dependencies: none
  - Output: new module, exports, tests, README section
  - Owner: thoth-worker
  - Writes: pi-packages/pi-core/src/provider-limits.ts (new), pi-packages/pi-core/src/index.ts, pi-packages/pi-core/test/provider-limits*.test.ts (new), pi-packages/pi-core/README.md
  - Interface boundaries: existing exports unchanged
  - Focused check and PASS evidence: pi-core vitest and typecheck pass
  - Return milestone: API summary with passing tests
  - Stop / reassessment: registry needs a pi-tui dependency
- [x] AC-2: Claude bridge reports rate-limit events to the registry
  - Outcome: event reporting
  - Known entrypoints and skill paths: pi-packages/pi-claude-bridge/src/{index.ts,query-state.ts,usage.ts}, installed SDK sdk.d.ts; skills tdd, simplify
  - Inputs: accepted AC-1 registry; Decision D-4
  - Dependencies: AC-1 unit accepted
  - Output: reporting, command, tests
  - Owner: thoth-worker
  - Writes: pi-packages/pi-claude-bridge/src/** and tests/**, pi-packages/pi-claude-bridge/README.md
  - Interface boundaries: existing notifications, provider streaming and tool publication unchanged
  - Focused check and PASS evidence: Claude bridge unit tests and typecheck pass; tests cover event normalization, per-query session attribution (two concurrent sessions) and every query-consumer path
  - Return milestone: bridge changes with passing tests
  - Stop / reassessment: session id unavailable in child bridge context
- [x] AC-5: `/claude quota` on-demand command
  - Outcome: quota command via the experimental usage request
  - Known entrypoints and skill paths: pi-packages/pi-claude-bridge/src/index.ts, installed SDK sdk.d.ts:3038-3056,4206-4312, sdk.mjs:136-141; skills tdd, simplify
  - Inputs: Decision D-4
  - Dependencies: AC-2 unit (same writer, same package)
  - Output: command and tests
  - Owner: thoth-worker
  - Writes: same as AC-2 unit
  - Interface boundaries: provider queries unaffected
  - Focused check and PASS evidence: tests for success, timeout, unavailable API/limits, CLI process closed
  - Return milestone: command with passing tests
  - Stop / reassessment: usage cannot be obtained without a prompt
- [x] AC-4: Antigravity API-equivalent cost
  - Outcome: mapped catalog pricing for messages
  - Known entrypoints and skill paths: pi-packages/pi-antigravity-bridge/src/{models.ts,provider.ts,stream-events.ts,acp/*}; skills tdd, simplify
  - Inputs: Decision D-3
  - Dependencies: none
  - Output: mapping, cost computation, tests
  - Owner: thoth-worker
  - Writes: pi-packages/pi-antigravity-bridge/src/** and tests/**, pi-packages/pi-antigravity-bridge/README.md
  - Interface boundaries: token mapping and stream guarantees unchanged
  - Focused check and PASS evidence: bridge tests and typecheck pass; per-model cost tests, unmapped model logs once and stays 0
  - Return milestone: cost reporting with passing tests
  - Stop / reassessment: catalog entries missing for mapped ids
- [x] AC-6: `/agy quota` window flash diagnosed
  - Outcome: cause established; fix if in this repository
  - Known entrypoints and skill paths: pi-packages/pi-antigravity-bridge/src/{models.ts,usage.ts,agy-version.ts}, extensions/index.ts:1617-1640
  - Inputs: Exploration (windowsHide already set)
  - Dependencies: AC-4 unit (same writer, same package)
  - Output: diagnosis and fix or documented upstream cause
  - Owner: thoth-worker
  - Writes: same as AC-4 unit
  - Interface boundaries: quota output unchanged
  - Focused check and PASS evidence: Windows process trace or reproduction evidence retained in the result (existing `windowsHide: true` alone does not establish an upstream cause); test for spawn options if changed
  - Return milestone: diagnosis reported
  - Stop / reassessment: flash originates inside the agy executable
- [x] AC-4: theme default subscription providers include antigravity
  - Outcome: default list `['claude-bridge','antigravity']`
  - Known entrypoints and skill paths: pi-packages/pi-thoth-theme/src/status-line/index.ts:46-48, src/shared/config.ts:17,36-45
  - Inputs: Clarification on `(sub)`
  - Dependencies: none
  - Output: default change and tests
  - Owner: thoth-worker
  - Writes: pi-packages/pi-thoth-theme/src/status-line/index.ts, src/shared/config.ts, related tests, README line
  - Interface boundaries: explicit user configuration unchanged
  - Focused check and PASS evidence: theme tests and typecheck pass
  - Return milestone: change with passing tests
  - Stop / reassessment: none
- [x] AC-3: subagent card and detail show rate-limit warnings
  - Outcome: warning on affected task's row and detail
  - Known entrypoints and skill paths: pi-packages/pi-subagents/src/{ui/work-panel-provider.ts,runner/interaction-session-registry.ts,runner/sdk-runner.ts,ui/subagents-history-panel.ts}; skills tdd, simplify
  - Inputs: accepted AC-1 registry; Decision D-5
  - Dependencies: AC-1 unit accepted
  - Output: provider/detail changes and tests
  - Owner: thoth-worker
  - Writes: pi-packages/pi-subagents/src/ui/**, pi-packages/pi-subagents/test/ui/** (new/updated), pi-packages/pi-subagents/README.md
  - Interface boundaries: task status, channels and v2 row contract unchanged
  - Focused check and PASS evidence: pi-subagents vitest and typecheck pass; tests for warning shown on running, finished and failed tasks, another child replacing the same registry window without clearing the first task's warning, detail opened after task teardown, reset clearing without further task activity, other tasks unaffected
  - Return milestone: changes with passing tests
  - Stop / reassessment: child session id unavailable for a running task
- [x] AC-7: docs and closeout gate
  - Outcome: docs and gate
  - Known entrypoints and skill paths: docs/agent routed Pi docs, docs/installation.md, package READMEs
  - Inputs: accepted units
  - Dependencies: all implementation units accepted
  - Output: docs and gate results
  - Owner: thoth-worker
  - Writes: docs and READMEs only
  - Interface boundaries: none
  - Focused check and PASS evidence: check:ci, typecheck, build, test:pi-extensions and touched suites pass
  - Return milestone: gate results
  - Stop / reassessment: unrelated environment failures reported

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW

First reviewer failed on provider auth without a verdict; round 1 REJECT (AC-3 attribution lifecycle) repaired; round 2 fresh Oracle [OKAY] 2026-10-09. Cautions: install capture before child queries start and test the final-report to teardown boundary; immutable per-iterator attribution incl. summary/takeover paths; verify cost recomputation on ACP exact-usage replacement and normalized ids; AC-6 needs real Windows reproduction or trace evidence.
**Implementation**: AUTHORIZED

User selected Implement on 2026-10-09 after [OKAY].

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 75bbc44306e44ca7322c35d950f3c0bf6dfa807c4a8f971013981ba17a6d9c39

Round 1 fresh Oracle passed AC-1..AC-5 and AC-7 and failed AC-6 (flash cause not established). A live desktop capture followed, AC-6 was revised with the user's input, and a round 2 fresh Oracle returned PASS on 2026-10-09. The AC-6 task row keeps its original outcome wording; acceptance is judged on the revised AC-6 and does not claim the earlier flash's cause.

- AC-1: PASS | pi-core registry tests (938) | strict validation, synchronous isolated listeners, expiry projection, cross-copy sharing
- AC-2: PASS | Claude bridge test:unit (440) | per-query session attribution on provider, AskClaude, summary, takeover and quota consumers; notifications preserved
- AC-3: PASS | pi-subagents suite (1402/1 skipped) | capture before child launch; warnings survive teardown and replacement; clear at reset; status unchanged
- AC-4: PASS | Antigravity suite (881/9 skipped), theme suite (1079) | mapped catalog prices, ACP exact recompute, unmapped logged once, resolvable imports, antigravity in default (sub)
- AC-5: PASS | quota tests | held-open input, no prompt, provider options, 30 s timeout, close on all paths, collision warning
- AC-6: PASS | live desktop capture %TEMP%/agy-flash-capture-20261009-154734-432 | two agy launches with four MCP children each; 29 new windows all hidden; no visible window from agy ancestry; README documents evidence and unattributed earlier flash
- AC-7: PASS | check:ci, typecheck, build, test:pi-extensions (12), package suites | all pass; docs document registry, quota commands, pricing and manual installs
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:7da019f35b4578c4f861c74f6d20ca1aa0351f8b1fe0da7d0725bda2abd5ad76

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: PENDING
