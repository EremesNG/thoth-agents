# Change: pi-subagent-boundary-persistence

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: medium
**Risk**: medium

## Exploration

User goal: keep typing in the Pi TUI fluid while several in-process subagents run.
Five optimization rounds are live (publisher indexes, publication coalescing, shared
animation clock, render gating, debug-flag cache, idle-gated pruning, retention
partial indexes). The latest CPU profile (Pi 1.4.0, Windows 11; analysis in
C:/temp/pi-prof-analysis/round6*, outside the repository) still shows three
390-440 ms main-thread stalls inside `upsertTaskRecord` while four children stream,
plus `sanitizeInteractionTransportText` ~0.3-0.6 s/min, `sanitizeUnknown`
~0.25-0.45 s/min and `upsertTaskRecord` ~0.55-0.95 s/min.

Persistence evidence (copy-only experiments, C:/temp/pi-prof-analysis/checkpoint-study):
the parent's single history connection (WAL, synchronous NORMAL, default
autocheckpoint 1000 pages, busy_timeout 2000 ms) rewrites the whole task row on
every persist: thread snapshot JSON (bounded to 200 items, up to ~1.3 MB, ~92% tool
rows), transcript (~72 KB avg) and system prompt (~33 KB avg)
(`pi-packages/pi-subagents/src/history.ts:313-470,741-744`). Ordinary activity
persists are coalesced to 250 ms per task and any snapshot-bearing activity not
named `streaming ...` writes immediately (`src/manager.ts:2227-2236,2554-2604`).
Simulating four tasks at that cadence, persists that trigger a WAL checkpoint reach
~190 ms (others max ~25 ms).

Event-flow evidence (`pi-packages/pi-subagents/`):
- The parent subscribes to every child session event (`src/runner/event-processing.ts:420`).
  Every event refreshes the inactivity timestamp and diagnostics (`:422-447`),
  debug-logs (`:449-469`), observes metrics, updates and bounds the thread snapshot,
  accumulates transcript (`:505-520`), inspects structured interaction carriers
  (`result ?? partialResult ?? event`, `:521-583`) and may emit activity (`:584-596`).
- `message_update` `text_delta`/`thinking_delta` append sanitized text to output,
  transcript and the live snapshot and emit cumulative streaming activity
  (`event-processing.ts:117-142`; `src/runner/snapshot-builder.ts:413-430`).
- Assistant `message_end` handles generation/usage accounting and emits activity but
  does not ingest the completed content into the snapshot or transcript; canonical
  messages are reconstructed only by `finalize(messages)` (`snapshot-builder.ts:541-583`).
- `tool_execution_update` refreshes tool inactivity, replaces the partial result,
  summarizes it into the transcript and emits activity; long `bash` emits
  output-driven throttled cumulative updates and no heartbeat while silent
  (installed Pi `core/tools/bash.js:175-234`).
- The stall watchdog aborts from the per-event timestamp and per-tool `lastUpdate`
  (`event-processing.ts:422,490-494,697-769`); question waits pause it (`:687-715`).
- Manager activity handling updates timestamps, previews, transcript, usage and the
  sanitized snapshot, schedules history writes and notifies listeners
  (`manager.ts:2164-2236`); task-state publication coalesces activity/usage/preview
  at 150 ms per session (`src/task-state-events.ts:15-21,123-151`).
- Other immediate writes: questions, explicit progress, background mode, steering
  outcomes, deadline extension, lifecycle (`manager.ts:779,997,1138,1249,1364,1860-2472`);
  startup orphan reconciliation keeps the last persisted partial detail
  (`:1070-1104`); continuation needs the nested session file (`:1702-1737`).
- SDK boundaries (installed 1.4.0, dependency 1.0.2): `message_end {message}`,
  `tool_execution_end {toolCallId, toolName, result, isError}`, `turn_end {message,
  toolResults}`, `agent_end`, `agent_settled`, compaction and auto-retry start/end.

External comparison (memory topic pi-subagents/external-comparison): gentle-shell
persists parent task history once per finished task and coalesces repaints to
400 ms; tintinweb appends transcripts only at `turn_end`; the official pi-mono
example and amnn ignore token-level updates; none rewrites running snapshots
periodically.

## Intent

The parent stops doing per-token work for its children and writes task history only
at child boundaries: token-level events become liveness signals only, the live
thread snapshot, transcript, preview and usage are built from completed messages
and tool results, and a running task's history record is written only when a tool
finishes, a turn ends, or a lifecycle/interaction event occurs.

## Non-goals

- Moving WAL checkpoints off the main thread or changing SQLite pragmas (separate
  later change).
- Animation intensity and tick-stepped animation frames (change
  `pi-animation-intensity`).
- Schema changes, history retention/pruning, or system-prompt deduplication.
- Running children out of process or reducing the in-process SDK streaming cost
  itself.
- pi-background-tasks, pi-sidebar, pi-core or theme changes beyond consuming the
  existing channels.
- Package version bumps, push or release.

## Acceptance

- AC-1: Child token-level events (assistant text and thinking deltas and any other `message_update` payload) run only the existing watchdog and diagnostic preamble (liveness timestamp, last-event diagnostics including the actual event type, retry-backoff resume that refreshes active-tool budgets, and the existing debug-enabled logging); they cause no snapshot update or bounding, sanitization, transcript change, preview or usage change, activity emission, task-state publication or history write.
- AC-2: Partial tool execution updates run the same preamble, refresh the active tool's stall budget and are inspected for structured orchestrator interaction requests; a newly detected request keeps the existing immediate interaction handling (interaction activity, publication and history write) before the tool ends, while any other partial update causes no snapshot, transcript, preview, activity, publication or history write.
- AC-3: A completed assistant message updates the live thread snapshot (assistant text and thinking) and transcript from the canonical message and emits one activity carrying the updated preview and usage and classified as a non-persisting boundary; the final snapshot and result of a completed run carry the same assistant text, thinking and tool content as today, and its transcript carries the same assistant text and thinking as today with each tool's content summarized from its execution result instead of its partial updates.
- AC-4: A running task's history record is written only at tool execution end, turn end, lifecycle and status transitions, orchestrator questions and answers (including requests detected in partial tool results), explicit progress notifications, steering outcomes, background-mode changes and deadline extensions; assistant-message-completion and tool-start activities update memory and task-state publication without a write; the periodic 250 ms persistence is removed; terminal durability before memory release is unchanged.
- AC-5: Watchdog behavior is unchanged: ordinary stall and tool budgets, question pauses, compaction suspension and abort errors behave as today for children that stream, think or run silent tools.
- AC-6: pi-subagents tests, typecheck, Biome and build pass, and root `pnpm run check:ci` and `pnpm run typecheck` pass.

## Clarifications

- The user decided: persist only when a turn or tool finishes, and ignore token-by-token updates definitively.
- Token-level events still refresh the watchdog's liveness (user choice: keep cheap liveness so long thinking or writing is not aborted as inactive); this includes the existing cheap diagnostic and retry-resume bookkeeping that the watchdog and stall diagnostics rely on.
- Partial tool updates are ignored except for liveness and question detection (user choice: no live partial tool output in the UI); a detected question keeps today's immediate handling.
- Accepted consequences: the live detail of a running child shows assistant text when each message completes, and another Pi process or crash recovery sees detail up to the last completed tool or turn.

## Decisions

- D1: Token-level events run the existing watchdog/diagnostic preamble (`event-processing.ts:422-469`: liveness timestamp, last event type, retry-backoff resume, debug-enabled logging) and then return before metrics, snapshot, transcript, interaction inspection and activity paths.
- D2: Partial tool updates run the same preamble, refresh per-tool liveness and pass through structured interaction inspection; a newly detected request emits the existing interaction-required activity, which keeps its immediate publication and write; nothing else is projected.
- D3: Assistant `message_end` becomes the content boundary for the live snapshot and transcript (built from the canonical message, sanitized once) and updates memory and publications, but is not a persistence boundary; `tool_execution_end` and `turn_end` are persistence boundaries; tool start updates memory only.
- D4: Immediate writes for lifecycle/status, questions and answers, explicit progress, steering outcomes, background mode and deadline extension stay; the 250 ms ordinary persistence schedule is removed.
- D5: The 150 ms task-state publication coalescing stays unchanged; it now coalesces boundary activity.
- D6: Interrupted tasks keep the last boundary detail; continuation keeps relying on the nested session file.
- D7: Final snapshot reconciliation keeps today's policy unchanged (with any projected session assistant, session content wins and live assistant text is dropped; standalone live thinking is kept only when no session assistant has thinking; without projected session assistants all live rows are kept) and never moves content between messages. Completed assistant text and thinking blocks enter the live rows through today's same-kind append rule, so rows, grouping, the 200-item bound and eviction match today for an equivalent event stream. Where today's per-delta sanitization gave delta-boundary-dependent output (for example, a hidden orchestrator interaction request whose payload continues in a later delta), the canonical once-per-message sanitization of D3 applies to the snapshot, transcript and result. Transcript tool entries summarize each tool's execution result once at its end, with today's done/failed marker, instead of today's partial-update summaries, as AC-2 and the ADDED delta require. These are the only permitted content differences from today. The final-result fallback for runs whose session holds no assistant output is unchanged: the in-order concatenation of completed assistant text is used only when no tool ran, otherwise the run fails as empty after tools.

## Durable deltas

- `ADDED pi-ecosystem` **Subagent boundary-driven event processing** — `@thoth-agents/pi-subagents` MUST treat child token-level events (assistant text and thinking deltas and other message update payloads) only as liveness and stall-diagnostic signals for its inactivity watchdog, and partial tool execution updates only as such signals for the active tool and as carriers inspected for orchestrator interaction requests; apart from handling a newly detected interaction request as it handles any other orchestrator question, it MUST NOT build thread snapshots, transcripts, previews or usage, emit activity, publish task state or persist history from them, and MUST build the live thread snapshot and transcript from completed assistant messages and tool execution results.
  - GIVEN a running child streaming a long assistant answer as many text deltas; WHEN the deltas arrive and the message then completes; THEN no activity, task-state publication or history write occurs during the deltas, the watchdog still sees the child alive, and on completion the live snapshot, transcript and preview contain the complete message text.
- `ADDED pi-ecosystem` **Subagent history persistence boundaries** — `@thoth-agents/pi-subagents` MUST write a running task's history record only when a tool execution ends, a turn ends, the task's lifecycle or status changes, an orchestrator question is raised or answered, an explicit progress notification arrives, a steering outcome, background-mode change or deadline extension occurs; it MUST NOT write on a timer, for token-level events, for partial tool updates other than one carrying a newly detected orchestrator question, or for tool execution start or assistant message completion alone, and a task interrupted between boundaries MUST keep its last persisted boundary detail.
  - GIVEN a running child that finishes a tool and then streams a long final answer before its turn ends; WHEN those events occur; THEN history is written when the tool ends and when the turn ends, and nothing is written while the answer streams.

## Plan

Approach: classify child events at the subscriber's entry, move assistant content
ingestion to message completion, and make persistence boundary-driven in the
manager, keeping public payloads, history schema and terminal durability unchanged.

Work units:

1. Event admission and boundary ingestion (AC-1, AC-2, AC-3, AC-5).
   `src/runner/event-processing.ts` adds an admission step right after the existing
   watchdog/diagnostic preamble (liveness timestamp, last event type, retry-backoff
   resume, debug-enabled logging): token-level `message_update` events return
   before metrics, snapshot, transcript, interaction inspection and activity;
   `tool_execution_update` refreshes the active tool's liveness, runs structured
   interaction inspection on its partial result (a newly detected request emits the
   existing interaction-required activity), and returns. `src/runner/snapshot-builder.ts` ingests completed assistant messages
   (text and thinking) at `message_end` instead of accumulating deltas; transcript
   assistant text comes from the completed message. Activities carry a boundary
   classification consumed by unit 2 (for example a `persist` flag or boundary
   kind on the activity payload in `src/types.ts`).
   Seams: `test/runner/thread-snapshots.test.ts`, `test/runner/orchestrator-inactivity.test.ts`,
   event-processing/interaction tests; spies prove no per-delta snapshot,
   sanitization, activity or write.
2. Boundary persistence (AC-4). `src/manager.ts` activity handling updates memory and
   notifies listeners for every admitted activity but writes history only for
   boundary activities (tool end, turn end) and the existing immediate classes;
   the 250 ms ordinary schedule and its timers are removed; terminal
   persist-before-release logic is unchanged.
   Seams: manager/history persistence tests counting writes per event sequence,
   `test/task-state-events.test.ts` for publication, terminal-memory tests.
3. Closeout checks (AC-6) by root.

Interfaces: activity payload boundary classification between units 1 and 2 (unit 1
defines it and reports the exact field); task-state channel payload, history API and
schema unchanged; the foreground `subagent_run` progress card keeps reading manager
state. Units 1 and 2 share one owner sequentially to avoid interface churn inside one
package. Risks: tests asserting streaming previews or delta-built snapshots need
updating; transcript text formatting from completed messages must match today's
content; partial-result interaction detection must keep working; fewer writes reduce
but do not bound WAL checkpoint stalls; the pi-ecosystem spec is also modified by
change `pi-animation-intensity`, so whichever archives second must refresh its
Source digest.

## Tasks

- [x] AC-1: Admit token-level child events as liveness-only
  - Outcome: text/thinking deltas and other message updates run only the watchdog/diagnostic preamble
  - Known entrypoints and skill paths: pi-packages/pi-subagents/src/runner/event-processing.ts (:117-160, :420-596, :697-769); src/runner/snapshot-builder.ts (:65-113, :413-430); test/runner/thread-snapshots.test.ts; test/runner/orchestrator-inactivity.test.ts; C:/Users/EremesNG/.pi/agent/skills/tdd/SKILL.md
  - Inputs: Exploration event-flow evidence; decisions D1, D2
  - Dependencies: none
  - Output: admission step after the preamble with tests proving no snapshot, sanitize, transcript, activity or publication per delta and that last-event diagnostics and retry-resume still update
  - Owner: thoth-worker
  - Writes: pi-packages/pi-subagents/src/runner/event-processing.ts, pi-packages/pi-subagents/src/runner/snapshot-builder.ts, pi-packages/pi-subagents/src/types.ts, pi-packages/pi-subagents/test/runner/
  - Interface boundaries: watchdog semantics; debug-enabled logging; interaction channel API
  - Focused check and PASS evidence: `pnpm --dir pi-packages/pi-subagents exec vitest run test/runner` passes with new delta-admission tests
  - Return milestone: runner tests green with diff summary
  - Stop / reassessment: a consumer needs per-delta data or watchdog semantics must change
- [x] AC-2: Restrict partial tool updates to liveness and question detection
  - Outcome: partial tool results refresh tool liveness and are inspected for interaction requests; a detected request keeps its interaction activity
  - Known entrypoints and skill paths: pi-packages/pi-subagents/src/runner/event-processing.ts (:490-494, :521-583); src/interaction-channel.ts; test/runner/; C:/Users/EremesNG/.pi/agent/skills/tdd/SKILL.md
  - Inputs: decision D2; accepted admission step from the AC-1 unit
  - Dependencies: AC-1 unit (same owner, sequential)
  - Output: partial-update path with tests for question detection and its interaction activity before tool end, and no activity for ordinary partial updates
  - Owner: thoth-worker
  - Writes: pi-packages/pi-subagents/src/runner/event-processing.ts, pi-packages/pi-subagents/test/runner/
  - Interface boundaries: interaction channel and question flow; per-tool stall budgets
  - Focused check and PASS evidence: `pnpm --dir pi-packages/pi-subagents exec vitest run test/runner` passes including a partial-result question test
  - Return milestone: runner tests green with diff summary
  - Stop / reassessment: interaction carriers need content beyond structured inspection
- [x] AC-3: Build live snapshot and transcript from completed assistant messages
  - Outcome: message_end ingests canonical assistant text and thinking and emits one activity with preview and usage, classified as a non-persisting boundary
  - Known entrypoints and skill paths: pi-packages/pi-subagents/src/runner/snapshot-builder.ts (:413-430, :541-583); src/runner/event-processing.ts (:117-142, :603-617); src/manager.ts (:2164-2236); test/runner/thread-snapshots.test.ts; C:/Users/EremesNG/.pi/agent/skills/tdd/SKILL.md
  - Inputs: decision D3; AC-1 admission step
  - Dependencies: AC-1 unit (same owner, sequential)
  - Output: boundary ingestion with equivalence tests for final snapshot and transcript content
  - Owner: thoth-worker
  - Writes: pi-packages/pi-subagents/src/runner/snapshot-builder.ts, pi-packages/pi-subagents/src/runner/event-processing.ts, pi-packages/pi-subagents/test/runner/
  - Interface boundaries: snapshot schema and bounds; transcript format; history panel and detail views
  - Focused check and PASS evidence: `pnpm --dir pi-packages/pi-subagents exec vitest run test/runner` passes with completed-message ingestion and final-content equivalence tests
  - Return milestone: runner tests green with the activity boundary field reported
  - Stop / reassessment: canonical messages lack content the delta path provided
- [x] AC-4: Persist running task history only at boundaries
  - Outcome: writes at tool end, turn end and the immediate classes (including partial-result questions) only; message-completion and tool-start activities publish without writing; 250 ms schedule removed
  - Known entrypoints and skill paths: pi-packages/pi-subagents/src/manager.ts (:446, :2164-2236, :2554-2604, :1058-1067); src/history.ts (:741-744); manager/history persistence tests; test/task-state-events.test.ts; C:/Users/EremesNG/.pi/agent/skills/tdd/SKILL.md
  - Inputs: decisions D3, D4, D5; activity boundary field from the AC-3 unit
  - Dependencies: AC-1, AC-2, AC-3 units accepted
  - Output: boundary persistence with integrated write-count tests per event sequence (deltas, message end, tool start, partial updates, partial-result question, tool end, turn end) and unchanged terminal durability
  - Owner: thoth-worker
  - Writes: pi-packages/pi-subagents/src/manager.ts, pi-packages/pi-subagents/test/
  - Interface boundaries: history API and schema; terminal memory release; task-state publication
  - Focused check and PASS evidence: focused manager/history/task-state tests pass with exact write counts for tool-end and turn-end sequences
  - Return milestone: package tests green with diff summary
  - Stop / reassessment: a reader requires periodic running detail or terminal durability would change
- [x] AC-5: Prove watchdog behavior is unchanged
  - Outcome: stall, tool budget, question pause and compaction suspension behave as before
  - Known entrypoints and skill paths: pi-packages/pi-subagents/test/runner/orchestrator-inactivity.test.ts; src/runner/event-processing.ts (:687-769)
  - Inputs: AC-1 and AC-2 units
  - Dependencies: AC-1, AC-2 units accepted
  - Output: existing and new watchdog tests passing, including long thinking and silent tool cases
  - Owner: thoth-worker
  - Writes: pi-packages/pi-subagents/test/runner/
  - Interface boundaries: stall budget configuration
  - Focused check and PASS evidence: `pnpm --dir pi-packages/pi-subagents exec vitest run test/runner/orchestrator-inactivity.test.ts` passes
  - Return milestone: watchdog tests green
  - Stop / reassessment: any watchdog expectation must change
- [x] AC-6: Run closeout checks
  - Outcome: package and root checks pass on the final diff
  - Known entrypoints and skill paths: pi-packages/pi-subagents; repository root
  - Inputs: accepted AC-1 to AC-5 units
  - Dependencies: AC-1 to AC-5 units accepted
  - Output: check results for verification
  - Owner: root
  - Writes: none
  - Interface boundaries: none
  - Focused check and PASS evidence: `pnpm --dir pi-packages/pi-subagents exec vitest run --maxWorkers=2`, package typecheck, `pnpm exec biome check pi-packages/pi-subagents`, package build, `pnpm run check:ci`, `pnpm run typecheck` all exit 0
  - Return milestone: all checks green
  - Stop / reassessment: unrelated environment failure reported separately

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

Plan review: round 1 REJECT (subtask_thoth-oracle_1793321696536_9fa79130: watchdog preamble, partial-result questions, AC-3/AC-4 dependency), repaired; round 2 OKAY (subtask_thoth-oracle_1793322118467_414497d4), reviewed record SHA-256 8b7b4cfd7c7f2d68f8b840b7a60782b16842d2ef973c83313de18b96ef0b7e3c.

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 0bbd48b2efd975ff7025251caf4cca1ef4be3c11a79ba43503bb2dced5063e9e

Final verification round 3 by a fresh Oracle (task subtask_thoth-oracle_1793332308075_bf55b2be); validated delivery verdict: valid, kind final-verification, verdict PASS, mode record, recordDigest match.

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS. AC-1 through AC-6 are satisfied. The prior reconciliation and eviction repros now match HEAD; no blocking defects found.",
  "evidence": [
    {
      "id": "E1",
      "kind": "freshness",
      "locator": "HEAD 30e052f0; assigned record and implementation files",
      "claim": "Independently recomputed record-prefix SHA-256 0bbd48b2efd975ff7025251caf4cca1ef4be3c11a79ba43503bb2dced5063e9e, baseline SHA-256 254af8785858aa7766c87bb0a0a1af9b096a6ce7854af93346539593c23f7fed, tracked-diff SHA-256 c748b26ce71832e9d3ac7c83c75a28815c5afa432a395aca9affb9f21c20c3f6, and all four supplied untracked-file digests. They remained unchanged through verification.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E2",
      "kind": "source",
      "locator": "pi-packages/pi-subagents/src/runner/event-processing.ts:438-490; test/runner/event-boundaries.test.ts:642-684",
      "claim": "Every message_update returns after the existing liveness, diagnostics, retry-resume and debug preamble, before metrics, snapshot, sanitization, transcript or activity work. Tests spy on the excluded operations.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E3",
      "kind": "source",
      "locator": "pi-packages/pi-subagents/src/runner/event-processing.ts:411-435,482-490; test/runner/event-boundaries.test.ts:548-640; test/manager-persistence.test.ts:217-257",
      "claim": "Partial updates refresh the matching tool budget and inspect structured requests only. Newly detected request IDs emit immediate persist:true interaction activity; repeats and ordinary partials do not project content or write history.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E4",
      "kind": "source",
      "locator": "pi-packages/pi-subagents/src/runner/snapshot-builder.ts:407-428,528-572,606-644,829-850; src/runner/event-processing.ts:119-136,573-624; test/runner/event-boundaries.test.ts:47-99",
      "claim": "Canonical completed assistant content enters synthetic same-kind rows. Message completion emits one non-persisting activity with output, accounting and snapshot. Finalization retains HEAD session precedence without positional content transfer.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E5",
      "kind": "independent-differential",
      "locator": "Read-only node --import tsx comparisons against git show HEAD: snapshot-builder.ts",
      "claim": "671 snapshot assertions passed, excluding timestamps. Both round-2 scenarios match HEAD: r1 remains after 198 tools and consecutive thinking; all 205 thinking completions remain. Multi-message missing-thinking and compaction/tool-call-only repros also match. Tool, steering/user, status and compaction grouping plus six session-omission variants match.",
      "basis": "observed",
      "uncertainty": "Bounded scenarios, not exhaustive equivalence."
    },
    {
      "id": "E6",
      "kind": "independent-differential",
      "locator": "HEAD/current promptWithInactivity comparisons; pi-packages/pi-subagents/src/runner/event-processing.ts:119-136,821-826",
      "claim": "Result formatting, no-tool concatenation fallback, failure without session output after tools, and compaction transcript/result behavior match HEAD. Verified D7's exceptions: canonical sanitization removes the fragmented hidden-request payload leak; tool transcripts summarize final results once with unchanged done/failed markers instead of partial summaries.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E7",
      "kind": "source",
      "locator": "pi-packages/pi-subagents/src/manager.ts:1044-1058,2170-2232,2498-2502,2550-2567; test/manager-persistence.test.ts:186-213,264-339,379-488; test/terminal-release.test.ts:290-323",
      "claim": "The persistence timer is removed. Boundary flags govern runner writes while immediate lifecycle/interaction operations remain. Tests prove exact tool/turn write counts, no delayed message/partial writes, last-boundary orphan recovery, and preservation of execution detail when terminal persistence fails.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E8",
      "kind": "source",
      "locator": "pi-packages/pi-subagents/src/runner/event-processing.ts:628-710; test/runner/orchestrator-inactivity.test.ts:57-128,130-271,416-494,515-557",
      "claim": "Watchdog tests cover thinking liveness, silent-tool independence, retry-resume refresh, compaction ceilings, pending-question pauses, per-tool budgets and diagnostic abort errors without changed expectations.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E9",
      "kind": "consumer-and-contract-review",
      "locator": "Assigned record:89-118; .thoth/specs/pi-ecosystem/spec.md:129-137,539-547; pi-packages/pi-subagents/src/task-state-events.ts:123-151; src/tools/subagent-run.ts:153-180; src/thread-view.ts:1012",
      "claim": "AC-3/D7 amendments agree with Clarifications and both ADDED deltas. The refreshed animation/footer requirements do not conflict: animation has its own clock, publication retains 150 ms coalescing, and viewers still accept legacy partial status. No inspected consumer requires per-delta activity or live partial output.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E10",
      "kind": "execution",
      "locator": "Independent focused checks in pi-packages/pi-subagents",
      "claim": "Runner suite: 22 files, 373 passed, 1 skipped. Manager persistence/startup/manager/task-state suites: 4 files, 181 passed. Terminal-release suite: 10 passed. Package typecheck, focused Biome check and git diff --check exited 0; Biome reported warnings only.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E11",
      "kind": "reported-closeout",
      "locator": "Delegated assignment: fresh Root closeout",
      "claim": "Root reports successful build, full pi-subagents suite, downstream suites, root check:ci and root typecheck. Supplied implementation fingerprints match the independently reviewed inputs.",
      "basis": "inferred",
      "uncertainty": "Build, full suites and root-wide checks were reused from root's supplied execution evidence, not rerun independently."
    },
    {
      "id": "E12",
      "kind": "execution",
      "locator": "thoth-sdd/scripts/validate.mjs --change .thoth/changes/pi-subagent-boundary-persistence --through verify --json",
      "claim": "Validator exited 0 with valid:true, no errors and the matching canonical baseline digest. Its two ADDED-overlap review warnings were addressed by semantic contract review.",
      "basis": "observed",
      "uncertainty": ""
    }
  ],
  "verification": [
    {
      "check": "AC-1",
      "method": "Admission-path inspection and runner spy tests",
      "outcome": "pass",
      "evidenceIds": ["E2", "E8", "E10"],
      "reason": "PASS | event-processing.ts:438-481 preserves the preamble and returns before projection; event-boundaries.test.ts:642-684 proves excluded operations remain untouched."
    },
    {
      "check": "AC-2",
      "method": "Partial-update inspection, interaction tests and integrated write counts",
      "outcome": "pass",
      "evidenceIds": ["E3", "E10"],
      "reason": "PASS | event-processing.ts:411-435,482-490 preserves tool liveness and immediate new-question handling; manager-persistence.test.ts:217-257 proves immediate deduplicated writes."
    },
    {
      "check": "AC-3",
      "method": "Canonical-boundary tests and independent HEAD differentials",
      "outcome": "pass",
      "evidenceIds": ["E4", "E5", "E6", "E10"],
      "reason": "PASS | snapshot-builder.ts:407-428,606-644 preserves same-kind grouping; :528-572,829-850 preserves finalization. All four prior repro patterns pass against HEAD, including both eviction cases. Checked transcript/result differences are limited to D7's two exceptions."
    },
    {
      "check": "AC-4",
      "method": "Persistence-call review, integrated boundary tests and terminal-release suite",
      "outcome": "pass",
      "evidenceIds": ["E7", "E10"],
      "reason": "PASS | manager.ts:2223-2231 admits boundary writes without a persistence timer; manager-persistence.test.ts:379-488 verifies recovery and exact write counts; terminal-release.test.ts:290-323 verifies failed-write retention."
    },
    {
      "check": "AC-5",
      "method": "Watchdog diff inspection and focused runner execution",
      "outcome": "pass",
      "evidenceIds": ["E2", "E3", "E8", "E10"],
      "reason": "PASS | event-processing.ts:628-710 retains watchdog policy; orchestrator-inactivity.test.ts:57-271,416-557 verifies streaming, tool, retry, question and compaction behavior."
    },
    {
      "check": "AC-6",
      "method": "Independent focused checks plus freshness-bound reuse of root closeout",
      "outcome": "pass",
      "evidenceIds": ["E1", "E10", "E11"],
      "reason": "PASS | Independent focused suites, package typecheck, Biome and diff checks passed. Fresh root evidence supplies the build, full-package/downstream suites and root-wide checks."
    },
    {
      "check": "Clarifications, D7 and refreshed baseline consistency",
      "method": "Normative comparison and consumer inspection",
      "outcome": "pass",
      "evidenceIds": ["E6", "E9", "E12"],
      "reason": "The amendments implement the settled boundary-only decisions without conflicting with the two ADDED requirements or archived animation/footer requirements."
    },
    {
      "check": "Record binding and freshness",
      "method": "Independent byte hashing before and after checks; bundled verify validator",
      "outcome": "pass",
      "evidenceIds": ["E1", "E12"],
      "reason": "Record prefix, baseline, tracked diff and all four untracked-file digests match the supplied frozen inputs; verify validation is valid."
    }
  ],
  "risks": [],
  "openQuestions": [],
  "nextAction": "Root may record this PASS and per-AC evidence, validate closeout, then archive through the prescribed workflow.",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/pi-subagent-boundary-persistence/pi-subagent-boundary-persistence.md",
    "reviewedRecordSha256": "0bbd48b2efd975ff7025251caf4cca1ef4be3c11a79ba43503bb2dced5063e9e"
  }
}
```

After PASS, root pastes the Oracle's unchanged final-verification envelope here.

- AC-1: PASS | `pnpm --dir pi-packages/pi-subagents exec vitest run test/runner --maxWorkers=2` | 373 passed, 1 skipped; test/runner/event-boundaries.test.ts spies prove message_update runs only the liveness/diagnostic preamble (event-processing.ts:438-481) with no snapshot, sanitization, transcript, preview, usage, activity, publication or write
- AC-2: PASS | runner tests and test/manager-persistence.test.ts | partial tool updates refresh the active tool budget and are inspected for requests; a newly detected request emits one immediate persisting interaction activity and write, ordinary partials project nothing (event-processing.ts:411-435,482-490; manager-persistence.test.ts:217-257)
- AC-3: PASS | runner tests and independent HEAD differentials | completed messages feed today's same-kind grouping, 200-item bound and eviction, today's finalize policy and result fallback; both round-1 repros and both round-2 eviction scenarios match HEAD; transcript and result differ only by the two D7 exceptions (test/runner/snapshot-reconciliation.test.ts, event-boundaries.test.ts)
- AC-4: PASS | test/manager-persistence.test.ts, test/manager-startup-persistence.test.ts, test/terminal-release.test.ts | exact write counts: deltas, message completion, tool start and ordinary partials write nothing, tool end and turn end write once, immediate classes and lifecycle unchanged, no persistence timer, last-boundary orphan recovery and terminal persist-before-release unchanged (manager.ts:2223-2231)
- AC-5: PASS | test/runner/orchestrator-inactivity.test.ts | streaming, long thinking, silent tools, per-tool budgets, retry resume, question pauses, compaction suspension and abort diagnostics behave as before
- AC-6: PASS | `pnpm run build:pi-extensions`, then `pnpm --dir pi-packages/pi-subagents exec vitest run --maxWorkers=2`, package typecheck, `pnpm exec biome check pi-packages/pi-subagents`, `pnpm run check:ci`, `pnpm run typecheck`, `git diff --check` | all exit 0 (2017 passed, 1 skipped; downstream pi-core 1107, pi-thoth-theme 1432, pi-sidebar 367, pi-askcodex 312 + 4 skipped, pi-antigravity-bridge 1150 + 12 skipped)

Final verification round 1 (fresh Oracle subtask_thoth-oracle_1793325813352_64373622, validated verdict FAIL, recordSha256 8c0c992c297d0409bc2c193ce2c82aefadaf7149e998430afe760b59829e43f5): AC-3, the completed-assistant fallback aligned messages by filtered position and misattributed or lost content in multi-message and compaction cases. Round 2 (fresh Oracle subtask_thoth-oracle_1793328870282_f03c6bc5, validated verdict FAIL, recordSha256 a72a000ff917ef8c0ab5550a429d6fdd8752c641c06f1a529ca906aadcf27722): AC-3, one live row per completed message evicted tool and thinking content that today keeps at the 200-item bound.

Convergence: the positional fill-in fallback was removed and today's finalize policy and final-result fallback restored; tool-call-only messages no longer add hidden assistant rows; completed blocks enter rows through today's same-kind append rule with today's synthetic row IDs, whitespace and raw-JSON handling. Record amendments: AC-3 wording and D7 name the two permitted content differences (canonical once-per-message sanitization instead of delta-boundary-dependent sanitization; transcript tool entries summarize the final execution result instead of partial updates). Scratch HEAD differentials outside the repository: 400 generated sequences (200 whole-block, 200 random sanitizer-neutral chunks, 40 reaching the bound) with no mismatch outside D7.

AC-6 notes: closeouts ran the extension build before package tests; the pi-antigravity-bridge suite had intermittent unrelated real-process and filesystem test failures in earlier runs and passed in the final closeout.
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:254af8785858aa7766c87bb0a0a1af9b096a6ce7854af93346539593c23f7fed

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY

Follow-up outside this change: commit and live rollout into the main checkout with rebuilt extension dists, a same-scenario CPU re-profile, and the separate off-thread WAL checkpoint change.
