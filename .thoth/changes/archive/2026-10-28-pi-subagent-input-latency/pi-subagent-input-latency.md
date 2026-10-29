# Change: pi-subagent-input-latency

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: medium
**Risk**: medium

## Exploration

User report: typing in the Pi TUI lags while several subagents run. Subagents are
in-process Pi SDK sessions sharing the parent Node event loop with the TUI.

Measured evidence (CPU profile of Pi 1.4.0, Node 24.21.0, Windows 11; 151 s main
process, four thoth-explorer children from ~51 s, user typing; analysis in
C:/temp/pi-prof-analysis, outside the repository):

- Main-thread non-idle time rose from 13.5% before children to 58.6% with them;
  after 60 s there were 292 non-idle stretches over 50 ms and 111 over 100 ms.
- pi-subagents task-state publication (`notify` -> `task-state-events` `publish`)
  spent ~17.4 s of 91 s in synchronous SQLite reads: `listSessionTaskMetadataByCost`
  (~9.2 s) and `snapshotSessionTaskCounts` (~8.2 s), `src/history.ts:910`/`:970`.
  Writes (`upsertTask`) cost ~1.2 s.
- The user-global history DB (`~/.local/share/pi/subagents/subagents-history.sqlite`)
  is 666 MB with 2,887 task rows (transcripts 73 MB, snapshot JSON 431 MB). Its only
  task indexes are the primary key and `created_at`; both publisher reads plan as
  `SCAN subagent_tasks`, ~9 ms each (read-only measurement). Fetching the largest
  session's 100 rows by primary key takes ~0.5 ms.
- pi-tui `doRender` cost 19.4 s (compositing and width math in Pi core), so render
  request frequency is the lever. Request sources while children run: theme input
  box `setInterval(requestRender, 50)` while working or background work is pending
  (`pi-thoth-theme/src/input-box/state.ts:22-29`); sidebar 100 ms timer
  (`pi-sidebar/src/session.ts:213-245`); work-panel host 100 ms animation plus an
  unconditional request on every provider change (`pi-core/src/work-panel-host.ts:373-396,450-457`;
  subagents provider forwards every task update); theme status line requests on every
  usage snapshot (`pi-thoth-theme/src/status-line/index.ts:148-155`). No shared
  animation clock exists; `WORK_PANEL_ANIMATION_INTERVAL_MS` is 100 ms and frames
  derive from `floor(now / 100)`.
- pi-sidebar cost 6.3 s: `plan` rebuilds a JSON cache key of whole descriptors,
  config, workspace, session view and every cached row item on every call
  (`pi-sidebar/src/panels/sidebar.ts:534-570`); `sync()` calls `plan` twice, and every
  render and every input event calls `sync()` (`session.ts:180,192-193,307-310`).
- Child launch froze the main thread up to ~1.75 s: every pi-background-tasks
  extension factory synchronously probes PowerShell (`where.exe pwsh.exe` plus a
  `$PSVersionTable` probe) during tool registration
  (`pi-background-tasks/src/index.ts:63`, `tools.ts:118-121`, `powershell.ts:14-43`);
  child extensions load with jiti `moduleCache: false`, so module-level caches are not
  shared. Launch-time revalidation is intentional (`shell.ts:49`, `powershell.test.ts:44-48`).
- `sanitizeInteractionTransportText` (`pi-subagents/src/interaction-channel.ts:235-241`)
  runs one simple line regex over whole accumulated output/transcript/snapshot strings
  on every streaming activity (~1.5 s); no backtracking hazard, cost is repeated scans.
- Negligible: per-delta snapshot build (<0.4 s), Markdown lexing (0.02 s),
  `appendFileSync` (0.05 s), work-panel `rows`/`sections` (~0.09 s).

## Intent

Make typing in the Pi TUI stay responsive while several subagents run by removing the
measured main-thread hot paths owned by thoth-agents Pi packages, without changing what
the user sees or what the task-state channels report beyond bounded coalescing of
activity-only updates.

## Non-goals

- Pi core (`pi-tui`, `pi-coding-agent`) rendering cost or scheduling.
- Per-child credential/model runtime initialization and per-child Codegraph MCP
  server processes.
- History DB size reduction, pruning or vacuuming.
- Launch-time PowerShell revalidation for each background task launch.
- Tool elapsed tickers, history/detail overlay refresh timers, and incremental
  `compactOutput`/`sanitizeUnknown` rewrites.
- Live rollout into the main checkout and package version bumps.

## Acceptance

- AC-1: Both pi-subagents publisher history reads are answered through new session-scoped indexes (query plan shows index search, not a full table scan) with results identical to the current queries, and index creation is idempotent on existing databases.
- AC-2: pi-subagents task-state publication sends task additions, removals, status changes and on-request snapshots immediately, and coalesces activity-only updates across all tasks of a session into at most one publication per 150 ms that carries the latest state, with a guaranteed trailing publication and no timer left after session end or disposal.
- AC-3: `sanitizeInteractionTransportText` returns its input without running the regex when the marker literal is absent, and its output is identical to the current implementation for all inputs.
- AC-4: pi-core provides a process-wide shared animation clock (versioned `globalThis` key, shape-checked) that ticks every subscriber in one callback on 100 ms wall-clock boundaries, starts with the first subscriber, stops when none remain and isolates subscriber errors; the work-panel host animates through it and defers provider-change refreshes to the next tick while animating.
- AC-5: The theme input-box working animation requests renders through the shared clock instead of a 50 ms interval with unchanged start/stop conditions, and the status line requests a render for a usage snapshot only when the displayed usage data changed.
- AC-6: The sidebar animates through the shared clock, defers provider-change refreshes to the next tick while animating, and its plan cache hit path uses a revision key without JSON serialization of rows or snapshots, so sync, hasAnimation, sourceIds, render and unconsumed keystrokes build at most one plan per unchanged input set, with rendered output unchanged.
- AC-7: pi-background-tasks registration-time PowerShell detection probes at most once per process for an identical environment key across extension factory invocations, re-probes when that key changes, and launch-time shell resolution still revalidates on every launch.
- AC-8: Package tests and typecheck pass for pi-subagents, pi-core, pi-sidebar, pi-thoth-theme and pi-background-tasks, root `pnpm run check:ci` and `pnpm run typecheck` pass, and the extension package builds succeed.

## Clarifications

- No material human-owned question remains. The user chose to profile first and then selected one substantial change covering fixes A (publisher reads), B (render frequency), C (background-tasks shell discovery) and D (sanitize regex).

## Decisions

- D1: Fix publisher read cost with indexes, not an in-memory cache. The DB is user-global and shared across sessions and processes; indexes keep exact query semantics and measured access drops from ~9 ms to ~0.5 ms.
- D2: Publication coalescing uses a 150 ms per-session window (the existing per-child activity window), leading edge immediate when idle and a trailing publication of the latest state; membership/status changes and requests stay immediate. Both the shared producer cadence requirement and the task-state channel requirement are modified so the bounded exception is explicit and snapshots stay complete.
- D3: All live animation in scope ticks at the existing 100 ms work-panel interval through one shared clock so requests coalesce into one frame. The input-border breathing gradient therefore samples at 10 fps instead of 20; glyph cadence (200 ms) is unchanged.
- D4: Sidebar plan keys use numeric revisions; inputs without a revision gain a counter or keep a cheap structural comparison limited to that small input. Rendered output must not change.
- D5: Cache only registration-time PowerShell detection, process-wide under a versioned `globalThis` key, keyed by `process.platform`, `PI_BACKGROUND_TASKS_PWSH`, `PATH`, `SystemRoot`, `ProgramFiles`, `LOCALAPPDATA` and `process.cwd()`. Launch-time resolution stays uncached.
- D6: Limit sanitization work to a literal-marker precheck; incremental output/snapshot rewrites are deferred because exact equivalence is costly to prove and measured gain is small.

## Durable deltas

- `MODIFIED pi-ecosystem` **Shared Pi ecosystem contract package** — `@thoth-agents/pi-core` MUST define the name, version and payload type of every cross-package Thoth Pi channel introduced through it, including subagent usage, MUST wrap payloads in an envelope carrying version, source package, session ID, timestamp and data, and its subscribe helper MUST ignore payloads with an unsupported version, foreign session filter mismatch or invalid shape instead of throwing; producers MUST publish complete snapshots after each state change and in answer to a request for their session, except that where a channel requirement explicitly permits bounded coalescing of specified changes, the producer MAY instead publish one complete snapshot carrying the latest state for the changes coalesced within that bound.
  - GIVEN a producer and a consumer using pi-core in one Pi session; WHEN the consumer subscribes, requests the snapshot, and then several changes occur that the channel requirement permits coalescing within one bound; THEN it receives the current full snapshot for its session, later one complete snapshot with the latest state for that bound and snapshots after every other change, while malformed or other-version payloads are ignored.
- `MODIFIED pi-ecosystem` **Pi task state channels** — pi-subagents and pi-background-tasks MUST publish current-session task summary snapshots on versioned pi-core channels after each change and on request, containing only identity, status, agent/model/effort or kind, lifecycle times, usage/cost, exit and short preview fields, never prompts, transcripts, results, commands, environment or logs; pi-subagents MUST publish task additions, removals, status changes and on-request snapshots immediately and, as a bounded exception to publishing after each change, MAY coalesce changes that only affect activity, usage or preview fields into at most one complete publication per 150 ms per session carrying the latest state; the subagents snapshot MUST also carry a bounded set of the session's persisted task summaries selected by highest cost with the same fields; subagent usage MUST be published only on the pi-core usage channel and the Thoth status line MUST consume it from there.
  - GIVEN four running subagents streaming in one session; WHEN their activity updates arrive within one 150 ms window and then one of them completes; THEN at most one activity snapshot is published for that window carrying the latest state of all four, and the completion is published immediately.

## Plan

Approach: remove measured main-thread hot paths at their owners, keeping public
output identical except the declared publication coalescing and the 10 fps input
breathing sample rate.

Work units and boundaries:

1. pi-subagents history indexes (AC-1). `src/history.ts` schema setup adds
   `CREATE INDEX IF NOT EXISTS` on `subagent_tasks(cwd, session_id, status, id)` and
   `subagent_tasks(cwd, session_id, usage_cost DESC, created_at DESC, id DESC)`.
   Query text and result mapping stay unchanged. Seam: `test/history.test.ts` with
   `EXPLAIN QUERY PLAN` and existing result tests.
2. pi-subagents publication coalescing (AC-2). `src/task-state-events.ts` manager
   listener classifies an update as membership/status change (immediate) or
   activity-only (coalesced per session, 150 ms leading/trailing); requests, session
   start, tree navigation and compaction stay immediate; timers cleared on session
   replacement and disposal. Seam: `test/task-state-events.test.ts` with fake timers.
3. pi-subagents sanitize precheck (AC-3). `src/interaction-channel.ts` returns early
   when the marker literal is absent. Seam: `test/interaction-channel.test.ts`
   comparing against the current regex implementation over adversarial inputs.
4. pi-core shared animation clock (AC-4). New pi-core module and export; work-panel
   host animation subscribes to it, and provider-change refreshes mark dirty for the
   next tick while animating (immediate otherwise). Retention deadline timers stay.
   Seam: new clock tests plus `test/work-panel*.test.ts`.
5. Theme (AC-5), after unit 4. `src/input-box/state.ts` subscribes to the clock while
   working or background work is pending; `src/status-line/index.ts` compares usage
   data before requesting. Seam: `src/input-box/state.test.ts`,
   `src/status-line/status-line.test.ts` (50 ms expectations updated to the clock).
6. Sidebar (AC-6), after unit 4. `src/session.ts` animation via the clock and
   deferred provider refresh while animating; `src/panels/sidebar.ts` revision-key
   plan cache and single plan per input set. Seam: `test/performance.test.ts`,
   `test/session.test.ts`, panel tests asserting unchanged output and rebuild counts.
7. Background tasks (AC-7). `src/powershell.ts`/`src/shell.ts`/`src/tools.ts`
   registration-time detection through a versioned process-wide cache keyed per D5.
   Seam: `src/powershell.test.ts`, `src/shell.test.ts`, `src/tools.test.ts`.
8. Closeout checks (AC-8) by root after units 1-7.

Interfaces: the pi-core clock export consumed by theme and sidebar; pi-core
`globalThis` registry keys include their contract version (pi-ecosystem spec);
pi-subagents task-state channel payload unchanged. Units 1, 2, 3, 4 and 7 own
disjoint files and run in parallel; units 5 and 6 start after unit 4 is accepted.
Risks: one-time index build on large existing DBs at first startup; coalescing
changes intermediate snapshot delivery and sidebar cost-curve sample density;
clock alignment must keep `floor(now / 100)` frame changes per tick; Windows timer
granularity in tests.

## Tasks

- [x] AC-1: Add session indexes for the publisher history reads
  - Outcome: both publisher reads use new session indexes with identical results
  - Known entrypoints and skill paths: pi-packages/pi-subagents/src/history.ts (schema ~:471-571, counts ~:910-932, cost ~:970-982); test/history.test.ts; tdd skill
  - Inputs: Exploration evidence for AC-1 and decision D1
  - Dependencies: none
  - Output: index DDL in schema setup plus query-plan and result tests
  - Owner: thoth-worker
  - Writes: pi-packages/pi-subagents/src/history.ts, pi-packages/pi-subagents/test/history.test.ts
  - Interface boundaries: query text, row mapping and history API unchanged; shared DB opened by other processes
  - Focused check and PASS evidence: `pnpm --dir pi-packages/pi-subagents exec vitest run test/history.test.ts` passes, including EXPLAIN QUERY PLAN assertions; package typecheck passes
  - Return milestone: tests and typecheck green with diff summary
  - Stop / reassessment: schema migration framework conflict or query semantics needing change
- [x] AC-2: Coalesce activity-only task-state publications per session
  - Outcome: immediate membership/status/request publications and 150 ms coalesced activity publications
  - Known entrypoints and skill paths: pi-packages/pi-subagents/src/task-state-events.ts (:77-136); src/manager.ts (:2618-2655 notify); test/task-state-events.test.ts; tdd skill
  - Inputs: Exploration evidence for AC-2, decision D2 and the declared delta
  - Dependencies: none
  - Output: publisher coalescing with timer cleanup and updated tests
  - Owner: thoth-worker
  - Writes: pi-packages/pi-subagents/src/task-state-events.ts, pi-packages/pi-subagents/test/task-state-events.test.ts
  - Interface boundaries: channel payload shape unchanged; manager notification semantics unchanged
  - Focused check and PASS evidence: `pnpm --dir pi-packages/pi-subagents exec vitest run test/task-state-events.test.ts` passes with coalescing, immediacy and cleanup cases; package typecheck passes
  - Return milestone: tests and typecheck green with diff summary
  - Stop / reassessment: manager changes required or payload change needed
- [x] AC-3: Skip the sanitize regex when the marker is absent
  - Outcome: exact-equivalent early return in sanitizeInteractionTransportText
  - Known entrypoints and skill paths: pi-packages/pi-subagents/src/interaction-channel.ts (:235-241); test/interaction-channel.test.ts; tdd skill
  - Inputs: Exploration evidence for AC-3 and decision D6
  - Dependencies: none
  - Output: precheck plus equivalence tests against the current regex
  - Owner: thoth-worker
  - Writes: pi-packages/pi-subagents/src/interaction-channel.ts, pi-packages/pi-subagents/test/interaction-channel.test.ts
  - Interface boundaries: all sanitizer callers unchanged
  - Focused check and PASS evidence: `pnpm --dir pi-packages/pi-subagents exec vitest run test/interaction-channel.test.ts` passes; package typecheck passes
  - Return milestone: tests and typecheck green with diff summary
  - Stop / reassessment: any input where outputs differ
- [x] AC-4: Add the pi-core shared animation clock and use it in the work-panel host
  - Outcome: one process-wide 100 ms aligned clock; host animation and provider-change refresh routed through it
  - Known entrypoints and skill paths: pi-packages/pi-core/src/work-panel-host.ts (:373-396, :450-457), src/work-panel-render.ts (:21, :1669-1679), src/provider-limits.ts (:24-57 registry pattern), src/index.ts; test/work-panel*.test.ts; tdd skill
  - Inputs: Exploration evidence for AC-4 and decision D3
  - Dependencies: none
  - Output: clock module, export, host integration and tests; exact exported API reported for units AC-5 and AC-6
  - Owner: thoth-worker
  - Writes: pi-packages/pi-core/src/ (new clock module, index.ts, work-panel-host.ts), pi-packages/pi-core/test/ (new and updated tests)
  - Interface boundaries: versioned globalThis key with shape check; no timer without subscribers; retention deadlines unchanged
  - Focused check and PASS evidence: `pnpm --dir pi-packages/pi-core test` and `pnpm --dir pi-packages/pi-core typecheck` pass
  - Return milestone: tests and typecheck green with the exported API and diff summary
  - Stop / reassessment: multiple pi-core copies cannot share the clock safely or host behavior must change visibly
- [x] AC-5: Drive theme animation through the shared clock and gate usage renders
  - Outcome: input-box animation via the clock with unchanged start/stop; usage snapshot renders only on change
  - Known entrypoints and skill paths: pi-packages/pi-thoth-theme/src/input-box/state.ts (:22-29, :46-49, :64-68), src/status-line/index.ts (:148-155), src/input-box/state.test.ts, src/status-line/status-line.test.ts; tdd skill
  - Inputs: accepted AC-4 clock API
  - Dependencies: AC-4 accepted
  - Output: theme integration and updated tests
  - Owner: thoth-worker
  - Writes: pi-packages/pi-thoth-theme/src/input-box/state.ts, src/status-line/index.ts and their tests
  - Interface boundaries: theme visuals unchanged except 10 fps breathing sampling; no idle timer
  - Focused check and PASS evidence: `pnpm --dir pi-packages/pi-thoth-theme test` and typecheck pass
  - Return milestone: tests and typecheck green with diff summary
  - Stop / reassessment: clock API insufficient or visible regression required
- [x] AC-6: Make sidebar planning revision-keyed and clock-driven
  - Outcome: clock-driven sidebar animation, deferred provider refresh while animating, single revision-keyed plan per input set
  - Known entrypoints and skill paths: pi-packages/pi-sidebar/src/session.ts (:86-89, :118-149, :180-245, :307-310), src/panels/sidebar.ts (:323-354, :451-570, :658-726), src/panels/cost.ts (:46, :113), test/performance.test.ts, test/session.test.ts; tdd skill
  - Inputs: accepted AC-4 clock API; decision D4
  - Dependencies: AC-4 accepted
  - Output: sidebar changes and tests proving unchanged output and bounded rebuilds
  - Owner: thoth-worker
  - Writes: pi-packages/pi-sidebar/src/ and pi-packages/pi-sidebar/test/
  - Interface boundaries: sidebar output, persisted settings and work-panel preferences unchanged
  - Focused check and PASS evidence: `pnpm --dir pi-packages/pi-sidebar test` and typecheck pass, including a test that a cache hit performs no JSON serialization and keystrokes do not rebuild the plan
  - Return milestone: tests and typecheck green with diff summary
  - Stop / reassessment: an input lacks any safe revision source or output would change
- [x] AC-7: Cache registration-time PowerShell detection per process
  - Outcome: one probe per identical environment key across extension factory invocations; launch revalidation unchanged
  - Known entrypoints and skill paths: pi-packages/pi-background-tasks/src/powershell.ts (:8-46), src/shell.ts (:15-54), src/tools.ts (:118-121), src/index.ts (:63), src/powershell.test.ts, src/shell.test.ts, src/tools.test.ts; tdd skill
  - Inputs: Exploration evidence for AC-7 and decision D5
  - Dependencies: none
  - Output: versioned process-wide detection cache and tests
  - Owner: thoth-worker
  - Writes: pi-packages/pi-background-tasks/src/powershell.ts, src/shell.ts, src/tools.ts and their tests
  - Interface boundaries: tool descriptions unchanged for identical environments; launch-time resolution API unchanged
  - Focused check and PASS evidence: `pnpm --dir pi-packages/pi-background-tasks exec vitest run src/powershell.test.ts src/shell.test.ts src/tools.test.ts` and package typecheck pass
  - Return milestone: tests and typecheck green with diff summary
  - Stop / reassessment: description semantics would change or launch path must be touched
- [x] AC-8: Run integrated closeout checks
  - Outcome: all touched packages and root gates green
  - Known entrypoints and skill paths: package scripts in each pi-packages/<p>/package.json; root package.json
  - Inputs: accepted AC-1 to AC-7 outputs
  - Dependencies: AC-1 to AC-7 accepted
  - Output: check results recorded in Verification
  - Owner: root
  - Writes: none
  - Interface boundaries: none
  - Focused check and PASS evidence: `pnpm --dir pi-packages/<p> test` and `typecheck` for pi-subagents, pi-core, pi-sidebar, pi-thoth-theme, pi-background-tasks; `pnpm run check:ci`; `pnpm run typecheck`; `pnpm --dir pi-packages/<p> run build` for pi-subagents, pi-sidebar, pi-thoth-theme, pi-background-tasks all exit 0
  - Return milestone: all commands exit 0
  - Stop / reassessment: failure traced to a unit returns to that unit's owner

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

Round 1 (fresh Oracle) REJECT: shared producer cadence requirement unreconciled; repaired by adding the MODIFIED Shared Pi ecosystem contract package delta.
Round 2 (fresh Oracle) OKAY, validated gate verdict, recordSha256 1b78518e988c8dac7d6c9dd01b857fa4ce3e575f2553016188a8595459b1a56d.

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 90241afb40356732a7a22388b8153f0c702de45a6c8f75c10ed272b7b73bdcc4

Final verification round 2 by a fresh Oracle (task subtask_thoth-oracle_1793238875688_f01684b7); validated delivery verdict: valid, kind final-verification, verdict PASS, mode record, recordDigest match.

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS. The current diff satisfies AC-1 through AC-8. No blocking correctness, behavior-preservation, specification or scope finding remains.",
  "evidence": [
    {
      "id": "E1",
      "kind": "governance",
      "locator": ".thoth/changes/pi-subagent-input-latency/pi-subagent-input-latency.md",
      "claim": "Independent validate.mjs --through verify passed. Both exact-title durable deltas reconcile publication coalescing with the canonical specification; its recorded source digest matches.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E2",
      "kind": "scope-and-freshness",
      "locator": "git status; git diff; final SHA-256 comparison",
      "claim": "Reviewed all changed production and test files, including untracked clock files. All 23 tracked inputs remained unchanged during verification. No unrelated changes, version bumps, generated files or secrets were found; git diff --check passed.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E3",
      "kind": "implementation-and-tests",
      "locator": "pi-packages/pi-subagents/src/history.ts; test/history.test.ts",
      "claim": "Two non-unique session indexes preserve query text and mappings. Executed tests verify actual query plans use SEARCH rather than table SCAN, deterministic results, legacy migration and idempotent repeated opens. Existing shared-database locking configuration remains unchanged.",
      "basis": "observed",
      "uncertainty": "Initial index creation still incurs the declared one-time startup cost."
    },
    {
      "id": "E4",
      "kind": "implementation-and-tests",
      "locator": "pi-packages/pi-subagents/src/task-state-events.ts; test/task-state-events.test.ts",
      "claim": "Only lastActivityAt, usage and preview are coalescible. Other summary changes and membership/status changes publish immediately; requests return complete current snapshots. Tests exercise four-task leading/trailing publication, fresh history reads and session/disposal cleanup.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E5",
      "kind": "implementation-and-tests",
      "locator": "pi-packages/pi-subagents/src/interaction-channel.ts; test/interaction-channel.test.ts",
      "claim": "The literal precheck cannot exclude a regex match. Executed tests compare adversarial inputs against the original implementation and verify marker-free inputs never call replace.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E6",
      "kind": "implementation-and-tests",
      "locator": "pi-packages/pi-core/src/animation-clock.ts; src/work-panel-host.ts; clock/work-panel tests",
      "claim": "The versioned, shape-checked clock shares one timer across compatible copies, isolates listener errors and stops after the final unsubscribe. Tests verify boundary cadence, delays bounded to 100 ms, incompatible-record fallback, deferred provider refresh, immediate input refresh and exact retention deadlines.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E7",
      "kind": "implementation-and-tests",
      "locator": "pi-packages/pi-thoth-theme/src/input-box/state.ts; src/status-line/index.ts; associated tests",
      "claim": "Animation lifecycle conditions are preserved through shared-clock subscriptions. Usage renders are gated on cumulative cost changes. Updated timing assertions retain exact counts, pre-boundary checks and cleanup assertions.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E8",
      "kind": "implementation-and-tests",
      "locator": "pi-packages/pi-sidebar/src/session.ts; src/panels/sidebar.ts; test/performance.test.ts; test/session.test.ts",
      "claim": "Sidebar planning uses revisions and bounded structural comparisons without serializing rows or snapshots. Tests verify plan reuse across sync/render/keystrokes, relevant invalidations, unchanged output expectations, deferred provider bursts and no clock subscription for idle, hidden or clipped rows.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E9",
      "kind": "implementation-and-tests",
      "locator": "pi-packages/pi-background-tasks/src/powershell.ts; src/shell.ts; src/tools.ts; associated tests",
      "claim": "Registration detection uses a versioned, shape-checked process-wide cache keyed by every D5 input. Tests cover separate module copies, positive/negative results, key changes and incompatible records. Launch resolution remains uncached and revalidates each launch.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E10",
      "kind": "executed-checks",
      "locator": "Independent verification commands",
      "claim": "Passed: pi-core focused tests 94; pi-subagents focused tests 113; complete pi-sidebar suite 316; theme focused tests 97; background-tasks focused tests 51; all five package typechecks; root check:ci and typecheck.",
      "basis": "observed",
      "uncertainty": "check:ci emitted warnings and informational diagnostics but exited successfully."
    },
    {
      "id": "E11",
      "kind": "reported-checks",
      "locator": "Delegated assignment and record Verification section",
      "claim": "Root reports all five complete package suites and four extension builds passing after convergence, including three further clean background-tasks suite runs.",
      "basis": "inferred",
      "uncertainty": "These broader runs were not independently repeated; builds were not rerun to preserve read-only operation."
    }
  ],
  "verification": [
    {
      "check": "AC-1",
      "method": "Inspect index DDL and execute history query-plan, migration and result tests.",
      "outcome": "pass",
      "evidenceIds": ["E3", "E10"],
      "reason": "Indexed reads preserve semantics and additive shared-database safety."
    },
    {
      "check": "AC-2",
      "method": "Trace publisher classification and lifecycle paths; execute publication tests.",
      "outcome": "pass",
      "evidenceIds": ["E4", "E10"],
      "reason": "Immediate changes remain immediate; permitted activity updates have bounded latest-state trailing delivery and timer cleanup."
    },
    {
      "check": "AC-3",
      "method": "Inspect literal/regex relationship and execute equivalence tests.",
      "outcome": "pass",
      "evidenceIds": ["E5", "E10"],
      "reason": "Marker-free regex work is eliminated without changing output."
    },
    {
      "check": "AC-4",
      "method": "Inspect clock and host integration; execute clock and work-panel tests.",
      "outcome": "pass",
      "evidenceIds": ["E6", "E10"],
      "reason": "Sharing, cadence, deferral, fallback, error isolation and cleanup satisfy the contract."
    },
    {
      "check": "AC-5",
      "method": "Review theme diff and execute working-state/status-line tests.",
      "outcome": "pass",
      "evidenceIds": ["E7", "E10"],
      "reason": "Lifecycle behavior is preserved with declared 10 fps sampling and value-gated usage renders."
    },
    {
      "check": "AC-6",
      "method": "Audit cache inputs and invalidations; execute the complete sidebar suite.",
      "outcome": "pass",
      "evidenceIds": ["E8", "E10"],
      "reason": "Revision-based reuse removes serialization while preserving rendering and animation lifecycle."
    },
    {
      "check": "AC-7",
      "method": "Trace registration versus launch resolution; execute shell/cache tests.",
      "outcome": "pass",
      "evidenceIds": ["E9", "E10"],
      "reason": "Identical registration keys reuse detection; changed keys re-probe; launches still revalidate."
    },
    {
      "check": "AC-8",
      "method": "Execute focused tests, package typechecks and root gates; reuse reported complete-suite/build evidence for unchanged inputs.",
      "outcome": "pass",
      "evidenceIds": ["E2", "E10", "E11"],
      "reason": "Independent checks passed and broader reported checks cover the remaining required suites and builds."
    },
    {
      "check": "Governance, scope and review binding",
      "method": "Read constitution/specifications, validate the record, inspect the complete diff and hash exact record-prefix bytes.",
      "outcome": "pass",
      "evidenceIds": ["E1", "E2"],
      "reason": "Declared deltas match the baseline; review inputs remained stable and within scope."
    }
  ],
  "risks": [
    {
      "description": "The earlier background-tasks suite failure has no captured test name, so Windows timing flakiness is plausible but unproven. Subsequent reported full reruns and independent focused checks passed; no regression was reproduced.",
      "severity": "low",
      "blocking": false,
      "evidenceIds": ["E10", "E11"]
    }
  ],
  "openQuestions": [],
  "nextAction": "Root should validate this envelope, record the PASS and digest, then complete closeout before archiving.",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/pi-subagent-input-latency/pi-subagent-input-latency.md",
    "reviewedRecordSha256": "90241afb40356732a7a22388b8153f0c702de45a6c8f75c10ed272b7b73bdcc4"
  }
}
```

After PASS, root pastes the Oracle's unchanged final-verification envelope here.

- AC-1: PASS | `pnpm --dir pi-packages/pi-subagents test` | 1848 passed, 1 skipped; test/history.test.ts asserts EXPLAIN QUERY PLAN index search without SCAN, legacy-DB migration, repeated opens and unchanged results
- AC-2: PASS | `pnpm --dir pi-packages/pi-subagents test` | test/task-state-events.test.ts covers leading/trailing 150 ms coalescing across four tasks, an allow-list limiting coalescing to lastActivityAt/usage/preview with immediate publication of every other field (effort, model, display name, agent, mode, lifecycle times), immediate status/request publication, fresh persisted reads and timer cleanup
- AC-3: PASS | `pnpm --dir pi-packages/pi-subagents test` | test/interaction-channel.test.ts equivalence over 47 adversarial inputs and identity return without replace
- AC-4: PASS | `pnpm --dir pi-packages/pi-core test` | 1062 passed; animation-clock and work-panel-animation tests cover delays bounded to one interval (`min(100, 100 - now % 100 + 1)`), alignment, cross-copy sharing, error isolation, fallback, deferred refresh and no idle timer
- AC-5: PASS | `pnpm --dir pi-packages/pi-thoth-theme test` | 1378 passed; clock-driven input animation and value-gated usage renders
- AC-6: PASS | `pnpm --dir pi-packages/pi-sidebar test` | 316 passed; cache hit performs no row/snapshot serialization, single plan per input set, clock subscription only while animated
- AC-7: PASS | `pnpm --dir pi-packages/pi-background-tasks test` | 756 passed, 4 skipped on rerun; registration probe cached per environment key, launch revalidation unchanged
- AC-8: PASS | package typecheck x5, package tests x5, `pnpm run check:ci`, `pnpm run typecheck`, builds of pi-subagents, pi-sidebar, pi-thoth-theme, pi-background-tasks | all exit 0 after repairs

Final verification round 1 (fresh Oracle, validated gate verdict FAIL, recordSha256 90241afb40356732a7a22388b8153f0c702de45a6c8f75c10ed272b7b73bdcc4): (1) AC-2 coalesced same-status non-activity changes such as effort; (2) AC-4 clock could schedule a 101 ms first tick, exceeding the one-interval deferral bound. Both routed to convergence with regression tests.

Convergence after round 1: AC-2 allow-list repair; AC-4 delay bound repair; theme and pi-core tests that hard-coded the old +101 ms boundary-aligned first tick updated (test-only). Recheck after convergence: typecheck x5, package tests (pi-subagents 1848, pi-core 1062, pi-sidebar 316, pi-background-tasks 756, pi-thoth-theme 1378 after the test update), `pnpm run check:ci`, `pnpm run typecheck` and four builds all exit 0. The pi-background-tasks suite passed three further consecutive runs; the original first-run failure did not reproduce.

AC-8 notes: the first integrated run failed `check:ci` on formatting of pi-subagents/test/history.test.ts (fixed with biome format), two pi-subagents smoke tests whose baseline preceded the shared clock's deferred completion render (test timing adjusted; one completion render, exact linger expiry, pi-core regression test added), and one pi-background-tasks test that passed on an unchanged rerun (Windows timing; failing test name not captured).
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:970d355574da32b4af1b3bdd04b899a4622a7efdefb643f6222c20102c75a75b

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY

Follow-up outside this change: live rollout into the main checkout with rebuilt extension dists, a same-scenario CPU re-profile, per-child credential/model runtime initialization, per-child Codegraph MCP processes, and history DB size.
