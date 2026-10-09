# Change: pi-task-channels

**Classification**: substantial
**Scope**: cross-cutting
**Uncertainty**: low
**Risk**: medium

## Exploration

- pi-core channels (`pi-packages/pi-core/src/channels.ts:16-99`): envelope `{v, source, sessionId, at, data}`; `defineChannel`, `publish`, `request`, `subscribe`, `onRequest`; subscribers ignore wrong version, invalid shape or session mismatch; no replay cache.
- Reference producer: the task-list extension (pi-core module defining `TODO_STATE_CHANNEL`, lines 72-98; its `state/publish.ts:12-73` full snapshots, requests queued until session replay; publishes on `session_start`, `session_tree`, `session_compact` and on each mutation).
- pi-subagents: task model `src/types.ts:456-501` (heavy fields: prompts, context, transcript, result, thread snapshot, questions, progress); manager owns tasks and notifies through local `onTaskUpdate` (`manager.ts:662-666,2207-2237`), coalescing activity per task over 150 ms; work panel binds to active-session in-memory tasks plus persisted counts (`extension/subagents-extension.ts:170-201`). Child sessions get no parent bus (`runner/sdk-runner.ts:490-533`), but the parent manager already holds all task state.
- Raw usage: `pi-subagents/src/usage-events.ts:5-10,129-153,179-232,289-295` emits `{parentSessionId,totalCost,runCount}` on `thoth:subagent-usage` and answers raw requests; only production consumer `pi-thoth-theme/src/status-line/index.ts:120-145`. Spec `pi-ecosystem` "Shared Pi ecosystem contract package" exempts it until an authorized migration.
- pi-background-tasks: metadata `src/types.ts:62-139` (sensitive/large: command, argv, env, result, lastState, conditions, log path); registry is process-wide in OS temp storage (`registry.ts:35-44`), `listMetasForOrigin` filters by cwd+session (`registry.ts:211-265`), process-local `onMetaChanged` (`registry.ts:68-100,196-204`); work panel uses current origin (`navigator-provider.ts:85-135`).
- Installer `src/cli/pi-install.ts` manages pi-subagents (`>=0.3.0`, unreleased), pi-questions-user and the task-list extension; it does not install pi-thoth-theme or pi-background-tasks.
- Tests to mirror: the pi-core `TODO_STATE_CHANNEL` contract tests, the task-list extension `test/state-events.test.ts`, `pi-subagents/test/usage-events.test.ts`, `pi-thoth-theme/src/status-line/status-line.test.ts:630-755`.

## Intent

pi-subagents and pi-background-tasks publish lightweight task-state snapshots for the current session on versioned pi-core channels, and subagent usage moves from the raw `thoth:subagent-usage` event to a pi-core envelope channel consumed by the theme.

## Non-goals

- Panel registry discovery/revisions, bridge/openai-fast status, UI preferences, lineage channel, sidebar.
- Publishing task detail: prompts, context, transcripts, results, thread snapshots, questions, commands, argv, env, stdout/stderr, logs or log paths.
- Changing work-panel providers, history panels or retention.
- Package version bumps.
- Managing the Claude/Antigravity bridges or pi-openai-fast in the installer.

## Acceptance

- AC-1: pi-core exports typed v1 channel definitions, payload types and validators for subagent task state, background task state and subagent usage, each with a request channel, covered by tests that reject malformed payloads and payloads carrying excluded heavy fields' types.
- AC-2: pi-subagents publishes a complete current-session summary snapshot (per task: id, agent, display name, mode, status, model, effort, created/started/ended/last-activity times, usage and cost, short output preview; plus counts and persisted totals) after task changes (reusing the existing coalescing), on session start/switch/tree/compact, and in answer to a request (queued until the session is ready).
- AC-3: pi-background-tasks publishes a complete current-origin summary snapshot (per task: id, name, kind, status, lifecycle times, exit code/signal, progress, dismissed flag; plus counts) built from fresh metadata reads after registry changes for that origin, including changes written by another process, on session start/switch (rebinding to the new origin), and in answer to a request.
- AC-4: subagent usage is published only as a pi-core envelope (cumulative cost and run count for the parent session, with checkpoint restore and replay-duplicate suppression unchanged); the raw `thoth:subagent-usage` event and raw request handling are removed; pi-thoth-theme status line consumes the envelope channel and requests it on session start.
- AC-6: Install and applied Update install and individually verify `@thoth-agents/pi-thoth-theme@>=0.3.0` and `@thoth-agents/pi-background-tasks@>=0.3.0`; an existing user-installed copy of either (any source) at or above the floor is preserved and verified without reinstalling; a copy below the floor is left untouched and blocks completion with manual upgrade guidance; an ambiguous source fails closed; dry-run stays mutation-free; reruns are idempotent; covered by installer tests.
- AC-5: the spec exemption is removed, docs updated, and the local closeout gate (touched package tests and typechecks, `pnpm run check:ci`, `pnpm run typecheck`, `pnpm run build`, `pnpm run test:pi-extensions`) passes.

## Clarifications

- Payload (user, 2026-10-09): lightweight per-task summary; no prompts, results, env or logs.
- Scope (user, 2026-10-09): current-session tasks only (subagents: active session in-memory tasks plus persisted totals; background: current cwd+session origin).
- Usage migration (user, 2026-10-09): hard cut to the envelope channel, no dual publication, with installer minimums raised.
- Installer scope (user, 2026-10-09): the installer also manages `@thoth-agents/pi-thoth-theme` and `@thoth-agents/pi-background-tasks` (floors `>=0.3.0`, together with pi-subagents `>=0.3.0`); the Claude/Antigravity bridges and pi-openai-fast stay unmanaged and are deferred to a separate opt-in change.

## Decisions

- D-1: Channel names: `thoth:subagents:state`, `thoth:subagents:state:request`, `thoth:background:state`, `thoth:background:state:request`, `thoth:subagents:usage`, `thoth:subagents:usage:request`; all v1; sources are the package names.
- D-2: Channel definitions live in pi-core modules beside the `TODO_STATE_CHANNEL` module and are exported from the pi-core root index (no pi-tui dependency).
- D-3: Snapshot entries are explicit projections built by allow-list; output preview truncated to the existing 800-character preview limit or less. Background `progress` is published only as numeric/short-text fields already shown in work-panel rows.
- D-4: Subagent publications reuse `onTaskUpdate` coalescing (150 ms for activity, immediate for lifecycle changes); background publications are triggered by `onMetaChanged` for records matching the current origin.
- D-6: Background cross-process changes: the publisher watches the registry storage for the current origin's records through filesystem change notification (no polling timers), rereads metadata fresh (bypassing the owned-meta cache) before each publication, and disposes/rebinds the watch on session switch and shutdown.
- D-7: Installer preservation policy for the two new entries is a per-spec opt-in (`preserveUserCopy`), so existing managed entries keep their current reinstall behavior.
- D-8: The pi-subagents usage checkpoint custom-entry type `thoth:subagent-usage` stays unchanged as a persistence discriminator; only raw bus events and raw requests are removed. Projection tests assert exact serialized key allow-lists and preview bounds.
- D-5: Request handling follows the task-list extension: requests before readiness are queued and answered once after session readiness; publications carry the current session ID.

## Durable deltas

- `MODIFIED pi-ecosystem` **Shared Pi ecosystem contract package** — `@thoth-agents/pi-core` MUST define the name, version and payload type of every cross-package Thoth Pi channel introduced through it, including subagent usage, MUST wrap payloads in an envelope carrying version, source package, session ID, timestamp and data, and its subscribe helper MUST ignore payloads with an unsupported version, foreign session filter mismatch or invalid shape instead of throwing; producers MUST publish complete snapshots after each state change and in answer to a request for their session.
  - GIVEN a producer and a consumer using pi-core in one Pi session; WHEN the consumer subscribes and then requests the snapshot; THEN it receives the current full snapshot for its session and later snapshots after each change, while malformed or other-version payloads are ignored.
- `ADDED pi-ecosystem` **Pi task state channels** — pi-subagents and pi-background-tasks MUST publish current-session task summary snapshots on versioned pi-core channels after each change and on request, containing only identity, status, agent/model/effort or kind, lifecycle times, usage/cost, exit and short preview fields, never prompts, transcripts, results, commands, environment or logs; subagent usage MUST be published only on the pi-core usage channel and the Thoth status line MUST consume it from there.
  - GIVEN a session running subagents and background tasks; WHEN a task changes state or a consumer requests snapshots; THEN both packages publish envelope snapshots for that session with summary fields only, and the status line shows cumulative subagent cost from the usage channel.

- `ADDED cli-installation` **Install the first-party Pi theme and background-tasks extensions** — Complete Pi installation and applied Update MUST install and individually verify `@thoth-agents/pi-thoth-theme` and `@thoth-agents/pi-background-tasks` at their configured minimum versions as additional selected Pi packages after root-package verification; an existing copy of either at or above the minimum from any source MUST be preserved and verified without reinstalling, a copy below the minimum MUST be left untouched and block completion with manual upgrade guidance, and an ambiguous source MUST fail closed; dry-run MUST remain mutation-free. This requirement extends the selected inventory of "Install selected Pi interaction and web extensions" without changing its other guarantees.
  - GIVEN a Pi profile with a user-installed pi-thoth-theme at the minimum version and no pi-background-tasks; WHEN Install or applied Update runs; THEN the theme copy is preserved and verified, pi-background-tasks is installed and verified, and a dry-run performs no mutation.

## Plan

Units:

1. Contracts (pi-core): `src/subagents.ts`, `src/background.ts` (or one `src/tasks.ts`) with channel definitions, types and validators for state, request and usage channels; exports; tests modeled on the `TODO_STATE_CHANNEL` contract tests. Blocks 2-4.
2. pi-subagents producer: state publisher (projection, session readiness queue, triggers per D-4/D-5) and usage migration in `usage-events.ts` to the envelope channel; remove raw event/request; port usage tests. Owns `pi-packages/pi-subagents/src/**` publisher/usage files, extension wiring and tests.
3. pi-background-tasks producer: state publisher filtered by origin, wiring in `src/index.ts`, tests.
4. pi-thoth-theme consumer: status line subscribes/requests the usage envelope; update status-line tests.
5. Installer: add theme and background-tasks to `PI_PACKAGE_SPECS` with `>=0.3.0` floors and tests (independent of 1-4).
6. Docs + spec exemption removal (deltas applied at archive), gate.

Units 2, 3 and 4 run in parallel after 1 (disjoint packages); unit 5 runs in parallel from the start.

Verification seams: package vitest for pi-core, pi-subagents, pi-background-tasks, pi-thoth-theme; typechecks; `check:ci`; build; `test:pi-extensions`; live check that the status line shows subagent cost.

Risks: users with manually installed theme/background-tasks copies (ownership classification must preserve them); leaking heavy or sensitive fields (allow-list projections + tests); publication storms (coalescing); mixed theme/subagents versions lose the cost display (documented); session switching publishes stale session data (session ID tests).

## Tasks

- [x] AC-1: pi-core task and usage channel contracts with validators and tests
  - Outcome: exported v1 definitions, types, validators
  - Known entrypoints and skill paths: pi-packages/pi-core/src/{channels.ts,index.ts} and the TODO_STATE_CHANNEL module and its tests; skills tdd, simplify
  - Inputs: Exploration; Decisions D-1, D-2, D-3
  - Dependencies: none
  - Output: new pi-core modules, exports, tests
  - Owner: thoth-worker
  - Writes: pi-packages/pi-core/src/{subagents.ts,background.ts} (new), pi-packages/pi-core/src/index.ts, pi-packages/pi-core/test/{subagents,background}.test.ts (new), pi-packages/pi-core/README.md
  - Interface boundaries: existing pi-core exports unchanged
  - Focused check and PASS evidence: pi-core vitest and typecheck pass
  - Return milestone: API summary and passing tests
  - Stop / reassessment: contract needs a pi-tui dependency or changes to channels.ts semantics
- [x] AC-2: pi-subagents publishes task-state snapshots
  - Outcome: current-session summary publication on change, lifecycle events and request
  - Known entrypoints and skill paths: pi-packages/pi-subagents/src/{manager.ts,types.ts,extension/subagents-extension.ts,ui/work-panel-provider.ts}, task-list extension state/publish.ts (reference); skills tdd, simplify
  - Inputs: accepted AC-1 contracts; Decisions D-3, D-4, D-5
  - Dependencies: AC-1 unit accepted
  - Output: publisher module, wiring, tests
  - Owner: thoth-worker
  - Writes: pi-packages/pi-subagents/src/task-state-events.ts (new), pi-packages/pi-subagents/src/extension/subagents-extension.ts, pi-packages/pi-subagents/test/task-state-events.test.ts (new)
  - Interface boundaries: manager onTaskUpdate, work panel provider unchanged
  - Focused check and PASS evidence: pi-subagents vitest and typecheck pass; tests prove no heavy fields and session scoping
  - Return milestone: publisher with passing tests
  - Stop / reassessment: manager lacks a session-scoped listing without behavior changes
- [x] AC-4: subagent usage on the envelope channel and theme consumer
  - Outcome: usage producer migrated, raw event removed, theme consumes envelope
  - Known entrypoints and skill paths: pi-packages/pi-subagents/src/usage-events.ts, pi-packages/pi-subagents/test/usage-events.test.ts, pi-packages/pi-thoth-theme/src/status-line/index.ts, pi-packages/pi-thoth-theme/src/status-line/status-line.test.ts; skills tdd, simplify
  - Inputs: accepted AC-1 contracts; Clarification on hard cut
  - Dependencies: AC-1 unit accepted; shares pi-subagents extension wiring with AC-2 (usage wiring already exists, no extension edit expected)
  - Output: migrated producer and consumer with tests
  - Owner: thoth-worker
  - Writes: pi-packages/pi-subagents/src/usage-events.ts, pi-packages/pi-subagents/test/usage-events.test.ts, pi-packages/pi-thoth-theme/src/status-line/index.ts, pi-packages/pi-thoth-theme/src/status-line/status-line.test.ts
  - Interface boundaries: usage checkpoint persistence unchanged
  - Focused check and PASS evidence: pi-subagents usage tests and pi-thoth-theme vitest and typechecks pass; no raw `thoth:subagent-usage` references remain in production code
  - Return milestone: migrated usage with passing tests
  - Stop / reassessment: extension wiring change required (coordinate with AC-2 owner)
- [x] AC-3: pi-background-tasks publishes task-state snapshots
  - Outcome: current-origin summary publication on change, session start and request
  - Known entrypoints and skill paths: pi-packages/pi-background-tasks/src/{index.ts,registry.ts,types.ts,navigator-provider.ts}; skills tdd, simplify
  - Inputs: accepted AC-1 contracts; Decisions D-3, D-4, D-5, D-6
  - Dependencies: AC-1 unit accepted
  - Output: publisher module, wiring, tests
  - Owner: thoth-worker
  - Writes: pi-packages/pi-background-tasks/src/task-state-events.ts (new), pi-packages/pi-background-tasks/src/index.ts, pi-packages/pi-background-tasks/src/task-state-events.test.ts (new)
  - Interface boundaries: registry and navigator provider unchanged
  - Focused check and PASS evidence: pi-background-tasks vitest and typecheck pass; tests prove exact key allow-list (no command/env/log fields), origin scoping, an external same-ID status change published from fresh reads, and watch disposal/rebinding on session switch
  - Return milestone: publisher with passing tests
  - Stop / reassessment: origin unavailable at publication time
- [x] AC-6: installer manages pi-thoth-theme and pi-background-tasks
  - Outcome: two new managed package specs with floors and tests
  - Known entrypoints and skill paths: src/cli/pi-install.ts (PI_PACKAGE_SPECS ~:51), src/cli/pi-install.test.ts, src/cli/pi-package-receipt.ts; skills tdd, simplify
  - Inputs: Clarification on installer scope; Decision D-7; cli-installation delta
  - Dependencies: none
  - Output: updated specs list, installer tests
  - Owner: thoth-worker
  - Writes: src/cli/pi-install.ts, src/cli/pi-install.test.ts, src/cli/pi-package-receipt.ts and installer status/doctor helpers in src/cli/ only for the preservation policy, and other src/cli installer tests that assert the package list or status output
  - Interface boundaries: receipts/ownership classification, lifecycle_passthrough defaults unchanged
  - Focused check and PASS evidence: root installer vitest and typecheck pass; tests cover fresh install, rerun idempotence, preserved compatible user copy (local and pinned), below-floor block with guidance, ambiguous fail-closed, dry-run no mutation
  - Return milestone: installer change with passing tests
  - Stop / reassessment: ownership classification cannot distinguish user-installed copies
- [x] AC-5: docs and closeout gate
  - Outcome: docs reflect channels and migration; gate green
  - Known entrypoints and skill paths: docs/agent/index.md routed Pi docs, pi-packages/{pi-core,pi-subagents,pi-background-tasks,pi-thoth-theme}/README.md
  - Inputs: accepted AC-1 to AC-4 and AC-6
  - Dependencies: AC-1, AC-2, AC-3, AC-4, AC-6 units accepted
  - Output: updated docs, gate results
  - Owner: thoth-worker
  - Writes: routed docs and package READMEs only
  - Interface boundaries: none
  - Focused check and PASS evidence: pnpm run check:ci, pnpm run typecheck, pnpm run build, pnpm run test:pi-extensions, touched-package tests pass
  - Return milestone: gate results reported
  - Stop / reassessment: unrelated environment failures reported with evidence

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW

Round 1 REJECT (cross-process background changes; installer user-copy policy; missing cli-installation delta) repaired; round 2 fresh Oracle [OKAY] 2026-10-09. Cautions: watch containing directories and atomic replacement, empty registry startup and rebinding; missing/unreadable identity fails closed; keep root receipt unchanged.
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
**Reviewed record SHA-256**: 5f1dbf95f6083166d2c6fa1672d5eafef0aa3babaaf767effa0a6235b9ab296d

Round 1 FAIL (AC-3: cancelable session_before_switch unbound the active session) repaired; round 2 fresh Oracle PASS on 2026-10-09. Build/bundle evidence refreshed on master after merge.

- AC-1: PASS | pi-core contract tests + typecheck | 220 focused tests; strict v1 allow-lists, Unix-ms times, preview <=800, progress <=200
- AC-2: PASS | pi-subagents task-state/usage tests | session scoping, readiness queue, lifecycle publication, coalescing; 1385 passed/1 skipped
- AC-3: PASS | pi-background-tasks suite + Pi 1.0.2 event order | 565 passed/4 skipped; cancelled switch keeps binding; completed switch and shutdown dispose watchers without duplicates
- AC-4: PASS | usage + status-line tests | envelope only; checkpoint discriminator kept; theme rebinds session filter; theme 1074 passed
- AC-5: PASS | check:ci, typecheck, build, test:pi-extensions, diff check | all pass; docs match
- AC-6: PASS | installer/operations tests | 251 passed; compatible copies preserved, below-floor and ambiguous copies block, dry-run unchanged
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:71ad5c74b483c4f83097262c26556ff84ef532c9664b1205367cbf9f08953803
- Source: .thoth/specs/cli-installation/spec.md | sha256:e72cc15385712cd47f929d0b894041da5cdde9e3e47c5764385606082897e8d0

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: PENDING
