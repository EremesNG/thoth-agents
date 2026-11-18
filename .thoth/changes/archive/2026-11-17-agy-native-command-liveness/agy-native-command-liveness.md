# Change: agy-native-command-liveness

**Classification**: substantial
**Scope**: cross-cutting
**Uncertainty**: medium
**Risk**: medium

## Exploration

Explorers `subtask_thoth-explorer_1794890670482_a3437171` and `subtask_thoth-explorer_1794891745436_92933bcb`:

- A long agy-native command (`run_command`/`exec_command`) inside a pi-subagents child is killed by two independent guards:
  1. The antigravity bridge idle guard (`inactivityMin`, default 3 min; `pi-packages/pi-antigravity-bridge/src/config.ts:175-206`), refreshed only by recognized frames (stream-json `src/driver.ts:598`; ACP any `session/update` `src/acp/driver.ts:454`), firing in `src/driver.ts:783-810` / `src/acp/driver.ts:785-791`. Bridge parks already suspend it (stream-json `pushExternal`/`kickIdle` `driver.ts:117-141,216-241`; ACP `acp/driver.ts:168-216`).
  2. The pi-subagents watchdog applies generic `stall_timeout_ms` (4 min) when `activeToolCalls.size === 0` (`pi-packages/pi-subagents/src/runner/event-processing.ts:519-529,663-671,719`); native tools never create Pi tool calls (`pi-antigravity-bridge/src/provider.ts:1349-1355`).
- Native tool lifecycle is observable on both carriers: ACP `tool_call`→`tool_start`, `tool_call_update` completed/failed→`tool_done`/`tool_error` (`src/acp/events.ts:56-99`), in-flight map `turn.toolCalls` (`acp/driver.ts:490-515`, adoption path `:494-505`); stream-json steps `ACTIVE`/`DONE`/`ERROR` keyed by `stepId` (`src/driver.ts:648-675`). The provider's `consumeActivity` sees both engines' `tool_start`/`tool_done`. Turn settle/cancel clears timers (`driver.ts:742-747`, `acp/driver.ts:801-817`).
- Declared native command timeouts are not available (`src/approval-gate.ts:99-103`).
- Session identity matches: bridge `StreamOptions.sessionId` = Pi `sessionManager.getSessionId()` (`pi-coding-agent dist/core/sdk.js:262-285`); pi-subagents reads `session.sessionManager.getSessionId() ?? session.sessionId` (`sdk-runner.ts:369-370`) and passes the session to `promptWithInactivity` (`sdk-runner.ts:860-879`). Children are in-process; both packages depend on pi-core. Established `Symbol.for` registry pattern: `pi-core/src/session-liveness.ts`, `pi-core/src/provider-limits.ts`.
- Bridge overall turn cap: TTY-aware, 0 interactive, 20 min headless (`src/config.ts:217-222`, doc `:160-179`); pi-subagents default `timeout_ms` is now 30 min (commit 43bb2248).
- Tests: bridge `tests/acp-driver.test.ts` (park/kickIdle/stall), `tests/driver-park-timeout.test.ts`, `tests/driver.test.ts:323-345`, `tests/acp-events.test.ts`; pi-subagents `test/runner/orchestrator-inactivity.test.ts`, `test/runner/tool-stall-budget.test.ts`, `test/runner/structured-errors.test.ts:183-210`; pi-core registry tests (`pi-core/test/session-liveness.test.ts` pattern).

## Intent

A long agy-native command run by a subagent child (e.g. a 10-25 minute test suite, possibly silent) must not be killed by the bridge idle guard or by pi-subagents' generic stall watchdog; it stays bounded by the tool stall budget, the bridge turn cap (raised to 30 minutes headless) and the subagent execution deadline.

## Non-goals

- Heartbeat stream events or any model-visible liveness text.
- Reading native command timeouts.
- Changing interactive (TUI) bridge turn caps, Pi tool behavior, or pi-subagents stall defaults.
- Wake-up paths for agy background tasks.

## Acceptance

- AC-1: In both antigravity carriers, while at least one native tool of the current turn is in flight (started and not done/errored), the bridge idle guard is suspended; it re-arms with a full budget when the in-flight set becomes empty; leaked entries die with the turn; the overall turn cap is unchanged in behavior.
- AC-2: The default headless bridge turn cap becomes 30 minutes (interactive stays uncapped; explicit configuration still wins), and docs reflect it.
- AC-3: A pi-core `Symbol.for` registry records native tools in flight per Pi session id (name, start time), version-tolerant like the existing registries; the antigravity provider publishes start/finish for both carriers keyed by `options.sessionId` and clears all entries for a session/turn on settle, error or abort.
- AC-4: The pi-subagents watchdog treats a registered in-flight native tool for its child session id as an active tool: it applies the tool budget (`tool_stall_timeout_ms`, capped at `max_total_timeout_ms`) instead of `stall_timeout_ms`, and stall diagnostics list it among active tools with its idle time; absent registry entries leave behavior unchanged.
- AC-5: Tests cover AC-1..AC-4 on both carriers (fake timers), registry lifecycle including leak cleanup, and watchdog budget selection; existing bridge, pi-core and pi-subagents suites pass.

## Clarifications

- Liveness mechanism (user, 2026-11-17): shared pi-core registry keyed by session id.
- Bridge headless turn cap (user, 2026-11-17): raise to 30 minutes, aligned with pi-subagents `timeout_ms`.

## Decisions

- In-flight tracking is a per-turn set independent of the park counter (native tools have no provider-side release call).
- The registry is process-global via `Symbol.for`, entries keyed by session id plus native tool key; consumers read only.
- A native tool's idle time is measured from its start (no progress signal available); its budget is `tool_stall_timeout_ms`.

## Durable deltas

- `MODIFIED pi-ecosystem` **Tool-aware subagent stall budgets** — For ordinary inactivity, the pi-subagents inactivity watchdog MUST apply `stall_timeout_ms` only when no tool is active, where active tools include Pi tool executions and provider-native tools registered as in flight for the child's session id in the shared pi-core registry; while tools are active its ordinary inactivity check MUST fire only when an active tool exceeds its own budget, defaulting to `tool_stall_timeout_ms` (default 900000, never below `stall_timeout_ms`) and extended to the declared seconds timeout plus 30 seconds for `bash`/`powershell` `timeout` or any `timeout_seconds` argument, capped at `max_total_timeout_ms`; maintenance suspension ceilings and execution deadlines are unaffected; the final stall error MUST identify the applied budget.
  - GIVEN a child running a silent `bash` command with `timeout: 1000`, default config, and a deadline beyond 20 minutes, or a child whose antigravity provider registered a silent native command in flight; WHEN 16 minutes pass without tool updates for the `bash` case, or 10 minutes pass for the native case; THEN no stall fires, a stall fires once 1030 seconds pass for `bash`, and a native command is bounded by the 900000 ms tool budget, with the final error naming the applied tool budget.
- `ADDED pi-ecosystem` **Antigravity bridge native commands suspend its idle guard** — `@thoth-agents/pi-antigravity-bridge` MUST suspend its turn idle guard on both carriers while any native tool of the current turn is in flight, re-arm it with a full budget when none remain, publish in-flight native tools per Pi session id to the shared pi-core registry and clear them on finish, settle, error or abort, and MUST default its headless turn cap to 30 minutes while keeping interactive turns uncapped.
  - GIVEN a headless subagent child on an antigravity model whose native `run_command` stays silent for 12 minutes; WHEN the command finishes; THEN neither the 3-minute idle guard nor the pi-subagents generic stall fired, the registry entry was present during the command and removed after it, and the turn remains bounded by the 30-minute headless cap.

## Plan

Units (writes disjoint except the pi-core contract, which lands first):

1. pi-core registry: new `pi-packages/pi-core/src/native-tool-activity.ts` (name tbd by implementer, following `session-liveness.ts`/`provider-limits.ts` conventions), export from `pi-core/src/index.ts`, tests in `pi-core/test/`. API: `beginNativeTool(sessionId, key, name) → release`, `clearNativeTools(sessionId)`, `listNativeTools(sessionId) → [{key,name,since}]`; version-tolerant global slot.
2. Bridge: per-turn native in-flight set in `src/driver.ts` and `src/acp/driver.ts` suspending/re-arming idle timers; provider publishes to the registry from `consumeActivity` with `options.sessionId` and clears on settle/error/abort; headless turn cap default 30 min in `src/config.ts` + docs/README. Tests per Exploration list.
3. pi-subagents: consult the registry in `src/runner/event-processing.ts` budget selection (`:663-671`) and stall diagnostics (`active_tools`), session id from `sdk-runner.ts:369-370` threaded into `promptWithInactivity`; tests in `test/runner/orchestrator-inactivity.test.ts`, `structured-errors.test.ts`.
4. Closeout checks: package suites (pi-core, bridge, pi-subagents), typechecks, `pnpm run check:ci`, `pnpm run typecheck`, `pnpm run build`.

Risks: in-flight leak if agy never reports done (bounded by turn lifetime and explicit clear on settle); ACP adoption path clearing the map; registry slot version conflicts; bridge full-suite timing flakes (pre-existing).

## Tasks

- [x] AC-3: Add the pi-core native tool activity registry
  - Outcome: version-tolerant registry with begin/release/clear/list and tests
  - Known entrypoints and skill paths: pi-packages/pi-core/src/session-liveness.ts, src/provider-limits.ts, src/index.ts, test/session-liveness.test.ts; tdd skill
  - Inputs: this record
  - Dependencies: none
  - Output: registry module, export, tests
  - Owner: thoth-worker
  - Writes: pi-packages/pi-core/{src,test}
  - Interface boundaries: consumed by bridge and pi-subagents
  - Focused check and PASS evidence: pi-core tests and typecheck pass
  - Return milestone: API stable and green
  - Stop / reassessment: incompatible existing global slot pattern
- [x] AC-1: Suspend the bridge idle guard while native tools are in flight on both carriers
  - Outcome: per-turn in-flight set controls idle timers; overall cap untouched
  - Known entrypoints and skill paths: pi-packages/pi-antigravity-bridge/src/driver.ts:117-241,411-435,598,648-675,742-810; src/acp/driver.ts:168-216,454,490-515,745-817; src/acp/events.ts:56-99; tdd skill
  - Inputs: this record
  - Dependencies: none
  - Output: code plus fake-timer tests for both carriers
  - Owner: thoth-worker
  - Writes: pi-packages/pi-antigravity-bridge/{src,tests}
  - Interface boundaries: park suspension, terminal stream guarantee
  - Focused check and PASS evidence: driver/acp-driver tests pass
  - Return milestone: suspension green
  - Stop / reassessment: carrier cannot pair start/done reliably
- [x] AC-2: Raise the bridge headless turn cap default to 30 minutes
  - Outcome: headless default 30 min, interactive uncapped, docs updated
  - Known entrypoints and skill paths: pi-packages/pi-antigravity-bridge/src/config.ts:160-222, README
  - Inputs: this record
  - Dependencies: none
  - Output: config change, doc update, config test
  - Owner: thoth-worker
  - Writes: pi-packages/pi-antigravity-bridge/{src/config.ts,README.md,tests}
  - Interface boundaries: AGY turn timeout env/config
  - Focused check and PASS evidence: config tests pass
  - Return milestone: green
  - Stop / reassessment: none
- [x] AC-3: Publish native tools in flight from the antigravity provider
  - Outcome: provider registers/releases per sessionId for both carriers and clears on settle/error/abort
  - Known entrypoints and skill paths: pi-packages/pi-antigravity-bridge/src/provider.ts (consumeActivity, 368-380, 1349-1440)
  - Inputs: accepted pi-core registry API
  - Dependencies: pi-core registry task
  - Output: code plus provider tests
  - Owner: thoth-worker
  - Writes: pi-packages/pi-antigravity-bridge/{src,tests}
  - Interface boundaries: pi-core registry
  - Focused check and PASS evidence: provider tests show entries during native tool and none after settle/abort
  - Return milestone: green
  - Stop / reassessment: sessionId unavailable on a path
- [x] AC-4: Treat registered native tools as active in the pi-subagents watchdog and diagnostics
  - Outcome: tool budget applied and diagnostics list native tools
  - Known entrypoints and skill paths: pi-packages/pi-subagents/src/runner/event-processing.ts:440-530,640-721; src/runner/sdk-runner.ts:369-370,860-879; src/error-metadata.ts; tdd skill
  - Inputs: accepted pi-core registry API
  - Dependencies: pi-core registry task
  - Output: code plus watchdog/diagnostics tests
  - Owner: thoth-worker
  - Writes: pi-packages/pi-subagents/{src,test}
  - Interface boundaries: stall diagnostics contract
  - Focused check and PASS evidence: orchestrator-inactivity and structured-errors tests pass
  - Return milestone: green
  - Stop / reassessment: session id not available in promptWithInactivity
- [x] AC-5: Run closeout checks across affected packages
  - Outcome: suites, typechecks, check:ci and build green (pre-existing flakes reported)
  - Known entrypoints and skill paths: package scripts
  - Inputs: all unit outputs
  - Dependencies: all previous tasks
  - Output: check evidence
  - Owner: thoth-worker
  - Writes: none
  - Interface boundaries: none
  - Focused check and PASS evidence: pi-core, bridge, pi-subagents suites; `pnpm run typecheck`; `pnpm run check:ci`; `pnpm run build`
  - Return milestone: all green
  - Stop / reassessment: unrelated failures reported with evidence

## Repair round 1 (Oracle FAIL subtask_thoth-oracle_1794935534883_33303d61)

- [x] R1 (AC-1): stream-json driver collapses concurrent ID-less ACTIVE steps under one undefined key; first DONE re-arms idle while another runs. Retain ambiguous unidentified activity until settlement (consistent with provider); driver regression test.
- [x] R2 (AC-4): provider registers bridge-delegated Pi tool calls (mcpServer pi-bridge / bridge_call park) as native tools, so the native default budget truncates the Pi tool's longer declared budget and diagnostics list it twice. Exclude Pi-bridge executions from native publication without suppressing genuine native activity; both-carrier regression tests.

## Repair round 2 (Oracle FAIL subtask_thoth-oracle_1794936478493_11d16cc6)

- [x] R3 (AC-3/AC-4): provider native tracking keyed by handle wrapper identity; bridge park reentry returns a fresh wrapper, so a native completed after continuation stays registered until turn settlement. Key by stable turn-lifetime identity; real ToolRoundTrips continuation regression, both carriers.
- [x] R4 (AC-3/AC-4): ACP adoption counts only published natives; with one native and one excluded Pi-bridge call pending, an unmatched completion unregisters the running native. Match adoption against all pending calls (or consume an authoritative adopted identity from the driver); mixed native/bridge regression.

## Repair round 3 (Oracle FAIL subtask_thoth-oracle_1794937398188_894dae14)

- [x] R5 (AC-4/R2): unlabelled stream-json MCP reconciliation requires a turn-lifetime target count of exactly one, so a second sequential same-target Pi bridge call (call_mcp_tool→bash across continuation) stays registered as native. Reconcile against currently pending invocations instead of lifetime counts; sequential-continuation regression.
- Note: pi-subagents full suite showed 4 history-compaction timing failures under load; the unchanged file passed 10/10 in isolation (unrelated flake, reported).

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED
User authorized implementation on 2026-11-17 ("Dale implementalo").

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 96fdd9ed4e591230dd8d52fd75a43ce9f82d89b9485be89c64a9a2577a61840d
Fresh Oracle subtask_thoth-oracle_1794938626844_914697ef after three FAIL/repair rounds (R1-R5).

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS: R1–R5 regressions pass; acceptance and durable deltas are satisfied, with the documented inference limitation and unrelated suite flake noted.",
  "evidence": [
    {
      "id": "E1",
      "kind": "inspection",
      "locator": "Scoped git diff, untracked implementation/tests, and assigned record",
      "claim": "Reviewed all three packages against AC-1..AC-5, durable deltas and non-goals. Record verify gate passes; canonical baseline matches.",
      "basis": "observed",
      "uncertainty": "No live Antigravity session exercised."
    },
    {
      "id": "E2",
      "kind": "test",
      "locator": "pi-antigravity-bridge: vitest run --maxWorkers=2",
      "claim": "100 files passed; 1419 tests passed, 5 skipped. Both-carrier idle suspension, rearming, cleanup, overall caps and configuration regressions pass.",
      "basis": "observed",
      "uncertainty": "Five existing skips remain."
    },
    {
      "id": "E3",
      "kind": "regression-test",
      "locator": "pi-antigravity-bridge/tests/provider-native-liveness.test.ts",
      "claim": "31/31 pass. Reproduced R5 sequential same-target continuation: registry empty after both bridge parks. R2–R4, ambiguity, explicit foreign identity and leak-cleanup regressions pass; R1 passes in driver tests.",
      "basis": "observed",
      "uncertainty": "Carrier activities use deterministic test drivers."
    },
    {
      "id": "E4",
      "kind": "test",
      "locator": "pi-core suite; pi-subagents runner inactivity, structured-errors and tool-stall-budget tests",
      "claim": "Core: 1336/1336 pass. Focused watchdog tests: 54/54 pass, covering session identity, tool budgets, caps, diagnostics and unchanged Pi-tool behavior.",
      "basis": "observed",
      "uncertainty": "None identified within tested paths."
    },
    {
      "id": "E5",
      "kind": "test",
      "locator": "pi-subagents full suite and isolated test/history-compaction.test.ts",
      "claim": "Full suite: 2770 passed, 4 failed, 1 skipped; failures confined to unchanged history-compaction tests. Isolated rerun: 10/10 pass.",
      "basis": "observed",
      "uncertainty": "Consistent with reported load-sensitive flake; root cause not independently established."
    },
    {
      "id": "E6",
      "kind": "validation",
      "locator": "Root/package typechecks, check:ci, git diff --check and final input hashes",
      "claim": "All commands exit 0; check:ci reports warnings. Package inputs and record prefix unchanged during final checks. Built bridge contains repaired reconciliation.",
      "basis": "observed",
      "uncertainty": "Build not rerun in read-only review."
    }
  ],
  "verification": [
    {
      "check": "AC-1 and AC-2",
      "method": "Diff inspection and both-carrier timer/config tests",
      "outcome": "pass",
      "evidenceIds": ["E1", "E2"],
      "reason": "Idle guards suspend/rearm correctly; native work does not pause overall caps; headless default is 30 minutes."
    },
    {
      "check": "AC-3, AC-4 and R1–R5",
      "method": "Registry, provider continuation and watchdog regressions",
      "outcome": "pass",
      "evidenceIds": ["E2", "E3", "E4"],
      "reason": "Lifecycle cleanup, stable turn identity, mixed-call adoption and sequential same-target reconciliation hold."
    },
    {
      "check": "AC-5 coverage and package suites",
      "method": "Full bridge/core/subagents suites plus isolated failure rerun",
      "outcome": "fail",
      "evidenceIds": ["E2", "E3", "E4", "E5"],
      "reason": "Required coverage passes; literal all-suite green is prevented only by the reported unrelated history-compaction flake."
    },
    {
      "check": "Durable deltas, non-goals and static gates",
      "method": "Scoped inspection, record validation and typechecks",
      "outcome": "pass",
      "evidenceIds": ["E1", "E6"],
      "reason": "No unaccepted behavioral expansion found."
    }
  ],
  "risks": [
    {
      "description": "provider.ts reconciliation and CHANGELOG document the accepted indistinguishability of a sole unlabelled foreign MCP wrapper matching a bridge park.",
      "severity": "low",
      "blocking": false,
      "evidenceIds": ["E1", "E3"]
    },
    {
      "description": "Unchanged history-compaction tests remain load-sensitive; this review does not establish an entirely green subagents full-suite run.",
      "severity": "low",
      "blocking": false,
      "evidenceIds": ["E5"]
    }
  ],
  "openQuestions": [],
  "nextAction": "root / record verification and closeout",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/agy-native-command-liveness/agy-native-command-liveness.md",
    "reviewedRecordSha256": "96fdd9ed4e591230dd8d52fd75a43ce9f82d89b9485be89c64a9a2577a61840d"
  }
}
```

After PASS, root pastes the Oracle's unchanged final-verification envelope here.

- AC-1: PASS | both-carrier fake-timer idle tests (driver-park-timeout, acp-native-idle) | Oracle E2/E3; bridge suite 1419 passed
- AC-2: PASS | config tests + README/config diff | Oracle E1/E2
- AC-3: PASS | pi-core native-tool-activity tests + provider-native-liveness 31/31 | Oracle E3/E4; core 1336 passed
- AC-4: PASS | orchestrator-inactivity, structured-errors, tool-stall-budget 54/54 | Oracle E4
- AC-5: PASS | package suites + root typecheck/check:ci/build exit 0 | Oracle E2/E4/E6; pi-subagents full suite: 4 unrelated history-compaction load flakes (unchanged file, 10/10 isolated)
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:645fc2d2e4876f17fbe67658b83e6140be08d6b72c8f19e151543ea7ddcc7864

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
