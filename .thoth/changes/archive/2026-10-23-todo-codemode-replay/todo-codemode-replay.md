# Change: todo-codemode-replay

**Classification**: substantial
**Scope**: local
**Uncertainty**: low
**Risk**: medium

## Exploration

- `pi-packages/pi-todo` is a fork of juicesharp/rpiv-mono `packages/rpiv-todo` 2.12.0 at `68d9a00` (README:15–22). Local additions to preserve:
  - pi-core state publication and open-task reinjection (`state/publish.ts`, `state/reinjection.ts`).
  - The atomic `batch` action with call-scoped refs and create-time status (`state/state-reducer.ts:101–163`).
  - Theme rendering (`5bda54e`) and single-cell glyph alignment (`94a52b6`).
- Upstream fix `1a10bb0` (#290): Pi codemode-nested `todo` calls emit tool events with `parentToolCallId` but never appear in the transcript as standalone tool results (installed Pi 1.0.2 `dist/core/extensions/types.d.ts:273–280`). Replay reads only `todo` tool results (`state/replay.ts:24–45`), so nested mutations are lost on resume, tree navigation and compaction.
- Upstream persists each state-changing call with `pi.appendEntry("rpiv-todo-state", details)`, where `details` is the full response `{ action, params, tasks, nextId }`. Replay walks the current branch and returns the last valid custom snapshot, else the last valid legacy `todo` tool-result snapshot, else empty state. Custom snapshots are authoritative even when a tool result comes later, because a standalone call's tool result can land after a concurrently nested call's entry (upstream test "state entries are authoritative…").
- Installed Pi 1.0.2 provides `ExtensionAPI.appendEntry<T>(customType, data?)` (`dist/core/extensions/types.d.ts:1234–1235`), wired to `sessionManager.appendCustomEntry` (`dist/core/agent-session.js:2685–2689`). `getBranch()` returns only the current leaf's ancestor path.
- Local seams:
  - Mutation commit point: `todo.ts:92–99`.
  - Publication classifier: `todo.ts:100–107`. It publishes on successful batch, create, delete and clear, and on updates that changed state.
  - Snapshot construction: `tool/response-envelope.ts:125–140`. It includes full tasks, nextId, original params and resolved batch results.
  - Replay entry points: `index.ts:58–75,100–106`.
- Upstream's `changesState(op)` has no `batch` case. A successful batch's full post-batch snapshot reproduces its committed state exactly: numeric ids, resolved dependencies and nextId. Replay replaces whole snapshots, so nothing is applied twice.
- `git apply --check` of the upstream package diff fails: three docs files are missing locally, and runtime and test contexts diverge. Upstream's real-session test imports upstream-only test utilities. The local mock Pi (`test/helpers.ts:77–108`) has no `appendEntry` capture.
- README:112 already promises that tool-result details keep the upstream persistence format so existing sessions replay.
- Baseline: `pnpm --filter @thoth-agents/pi-todo run test --maxWorkers=2` reports 26 files and 286 tests passed. Package typecheck passes.
- Upstream partial clone: `/tmp/rpiv-todo-audit-rainOW`.

## Intent

Port upstream `1a10bb0` so that every successful task-list mutation, standalone or nested inside codemode, survives resume, tree navigation and compaction, extended to the local `batch` action.

## Non-goals

- Other upstream rpiv-todo changes after 2.12.0: configuration, i18n, render-state or test-utility refactors.
- Replaying operations instead of snapshots, or deep validation of persisted tasks beyond upstream's shape guard.
- Migrating existing sessions, bumping the package version, or publishing.

## Acceptance

- AC-1: Each successful `todo` call that the pi-core publisher already treats as a change appends exactly one `rpiv-todo-state` custom session entry through `pi.appendEntry`, holding the call's full response details. Those calls are: create, delete, clear, an update that changed state, and every successful batch. Reads, errors, rolled-back batches and unchanged single updates append nothing. Standalone and codemode-nested calls behave the same.
- AC-2: Replay on session start, tree navigation and compaction reconstructs the list from the latest valid `rpiv-todo-state` entry on the current branch. With none, it falls back to the latest valid legacy `todo` tool-result snapshot, and then to empty state. Custom entries outrank tool results regardless of order. Invalid entries and unrelated custom types are ignored, and replayed tasks are cloned.
- AC-3: Regression tests prove that a branch whose only mutations were nested calls (no `todo` tool result) replays the final list. They also prove that a batch with refs replays exactly, with resolved ids, dependencies and nextId, and that a standalone call writing both an entry and a tool result replays one consistent state. Upstream's replay, reducer, register and codemode-replay tests are ported or adapted. The codemode-replay case uses the installed Pi 1.0.2 session manager when feasible, otherwise a faithful branch fixture, with the choice reported.
- AC-4: Local publication, reinjection, batch atomicity and rendering are unchanged, and the existing "Thoth Pi task-list extension" requirement still holds. Existing tests pass unchanged, except where an adopted fix intentionally changes asserted behavior; each such change is listed with its reason. The README describes the custom-entry persistence and the legacy fallback.
- AC-5: Package `typecheck` and `test --maxWorkers=2` pass. Root `pnpm run build`, `pnpm run test:pi-extensions`, `pnpm run check:ci` and `pnpm run typecheck` pass.

## Clarifications

- No material human-owned question remains. The custom entry type and the batch persistence policy are settled in Decisions from repository evidence.

## Decisions

- Use upstream's entry type `rpiv-todo-state` and payload. The fork already keeps the upstream persistence format (README:112), so sessions written by upstream rpiv-todo with this fix replay locally too.
- Persist exactly when the existing publication classifier (`todo.ts:100–107`) publishes, so persistence and publication share one predicate. This includes every successful batch, even one whose updates changed nothing: re-persisting an identical snapshot is harmless.
- Keep upstream's precedence, with custom snapshots authoritative. Accepted risk: if a newer custom entry precedes legacy-only writes from an older pi-todo on the same branch, the newer custom snapshot wins on replay. This happens only after a downgrade followed by an upgrade; backward compatibility is not a goal.
- Adapt tests to local helpers rather than importing upstream test utilities.

## Durable deltas

- `ADDED pi-ecosystem` **Task-list replay of nested mutations** — `@thoth-agents/pi-todo` MUST persist the full task-list snapshot of each successful state-changing call, including calls nested inside another tool such as codemode, as a session entry. It MUST reconstruct the list from the latest such entry on the current branch, falling back to legacy `todo` tool-result snapshots only when the branch has none.
  - GIVEN a session whose only task-list mutations were `todo` calls nested in codemode; WHEN the session is resumed, navigated or compacted; THEN the reconstructed list equals the list after the last nested mutation.

## Plan

- One cohesive worker unit (AC-1 to AC-3, plus the README part of AC-4), test-first. First port and adapt the upstream tests and add the local batch and nested-only regressions, confirming red. Then add the entry constant and persistence at the commit point, reusing the publication predicate, and the replay precedence. Finish with the README.
- Root then reviews regressions (AC-4) and runs the closeout checks (AC-5).
- Mutable surface: `pi-packages/pi-todo/**` only, with no dependency or lockfile changes. Disjoint from change `bg-callback-availability`, so both may run in parallel. Spec archive sync is serialized between the two changes.
- Interfaces to preserve: the Pi 1.0.2 extension API, the pi-core task-list state channel, the work-panel and render-kit contracts, and the tool schema.
- Risks: double or missing persistence on edge paths such as a rolled-back batch or an unchanged update; ordering between a custom entry and a later tool result; mock fidelity versus a real session.
- Mitigation: test-first regressions and a fresh independent Oracle verification.

## Tasks

- [x] AC-1: Successful state-changing calls persist an rpiv-todo-state entry, ported with tests and README
  - Outcome: `1a10bb0` ported and extended to `batch`; AC-1, AC-2 and AC-3 are met, and the README is updated.
  - Known entrypoints and skill paths: `pi-packages/pi-todo/{todo.ts,tool/types.ts,tool/response-envelope.ts,state/replay.ts,state/state-reducer.ts,index.ts,test/helpers.ts,README.md}`; tests `state/replay.test.ts`, `state/state-reducer.test.ts`, `state/batch.test.ts`, `todo.register.test.ts`; upstream `/tmp/rpiv-todo-audit-rainOW` commit `1a10bb0`. Skills: `tdd`, then `simplify`.
  - Inputs: the accepted Exploration and Decisions.
  - Dependencies: none
  - Output: source, tests and README diff; a list of adapted upstream tests; red → green evidence.
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-todo/**`
  - Interface boundaries: Pi `appendEntry`, `getBranch` and custom entries; pi-core publication; tool schema unchanged.
  - Focused check and PASS evidence: new regressions fail before the change and pass after; package `typecheck` exits 0; `test --maxWorkers=2` passes with no unexplained changes to existing tests.
  - Return milestone: on completion.
  - Stop / reassessment: `appendEntry` unavailable in a supported context, or a conflict with publication or reinjection.
- [x] AC-2: Replay precedence verified against the Pi 1.0.2 session-manager branch semantics
  - Outcome: root confirms that the worker's replay tests cover custom-entry precedence, the legacy fallback and branch scoping.
  - Known entrypoints and skill paths: `pi-packages/pi-todo/state/replay.ts`, `state/replay.test.ts`.
  - Inputs: accepted AC-1 unit output.
  - Dependencies: the AC-1 unit accepted by root.
  - Output: acceptance note.
  - Owner: root
  - Writes: none
  - Interface boundaries: none
  - Focused check and PASS evidence: replay test names and results cover each AC-2 clause.
  - Return milestone: after reviewing the AC-1 unit.
  - Stop / reassessment: a missing clause returns to the worker.
- [x] AC-3: Nested-only, batch-with-refs and dual-write regressions present and passing
  - Outcome: root confirms the AC-3 regressions and the reported codemode-replay fixture choice.
  - Known entrypoints and skill paths: the tests named in the AC-1 unit output.
  - Inputs: accepted AC-1 unit output.
  - Dependencies: the AC-1 unit accepted by root.
  - Output: acceptance note.
  - Owner: root
  - Writes: none
  - Interface boundaries: none
  - Focused check and PASS evidence: the named regressions pass in the package run.
  - Return milestone: after reviewing the AC-1 unit.
  - Stop / reassessment: a missing regression returns to the worker.
- [x] AC-4: Preserved local behavior and changed-test review
  - Outcome: root confirms that publication, reinjection, batch atomicity and rendering are unchanged and that every changed existing test is justified.
  - Known entrypoints and skill paths: the diff of `pi-packages/pi-todo`.
  - Inputs: accepted AC-1 unit output.
  - Dependencies: the AC-1 unit accepted by root.
  - Output: regression note.
  - Owner: root
  - Writes: none
  - Interface boundaries: `.thoth/specs/pi-ecosystem/spec.md`, "Thoth Pi task-list extension".
  - Focused check and PASS evidence: the diff review finds no unjustified behavior change.
  - Return milestone: after the AC-1 unit.
  - Stop / reassessment: an unjustified change returns to the worker.
- [x] AC-5: Package and root closeout checks pass
  - Outcome: package and root gates are green.
  - Known entrypoints and skill paths: package and root `package.json` scripts.
  - Inputs: accepted AC-4.
  - Dependencies: AC-4 accepted by root.
  - Output: check results.
  - Owner: root
  - Writes: none (generated build output only)
  - Interface boundaries: none
  - Focused check and PASS evidence: package `typecheck` and `test --maxWorkers=2`, root `pnpm run build`, `pnpm run test:pi-extensions`, `pnpm run check:ci` and `pnpm run typecheck` all exit 0.
  - Return milestone: after the checks run.
  - Stop / reassessment: failures caused by unrelated workspace changes are reported.

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

The user selected Oracle plan review and authorized implementation once the review returned OKAY. The fresh Oracle returned a validated OKAY with no blocking risks.

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 789e138c1c83b917a5223222e68b04c999e463956d8b90d1a8d57ad16ec7171e

Final verification took two fresh Oracle rounds. Round 1 FAILED on AC-4: a throwing appendEntry after commit skipped pi-core publication, leaving consumers with stale state. Convergence wrapped the append in try/finally so publication always follows the append attempt while the error still propagates, and added red → green regressions. Round 2 PASSED. The Source digest reflects the spec after change bg-callback-availability was archived; that unrelated appended requirement was disclosed to the round-2 reviewer.

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS. The complete scoped change satisfies AC-1 through AC-5. The prior append-failure publication blocker is repaired.",
  "evidence": [
    {
      "id": "E1",
      "kind": "record-validation",
      "locator": ".thoth/changes/todo-codemode-replay/todo-codemode-replay.md",
      "claim": "Independent initial and final hashing confirmed prefix SHA-256 789e138c1c83b917a5223222e68b04c999e463956d8b90d1a8d57ad16ec7171e. Canonical spec SHA-256 remains 83dbb6ce136ca3616226f891435993694a0feee65ac8b6a5085022fb830d96a5. The verify gate passed. The ADDED delta specifies persistence/replay sources without conflicting with the existing task-list requirement or unrelated callback requirement.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E2",
      "kind": "code-and-tests",
      "locator": "pi-packages/pi-todo/todo.ts:93-116; state/state-reducer.ts:37-47; todo.register.test.ts:189-249",
      "claim": "One shared predicate controls persistence and publication. Each qualifying call appends exactly one full response-details snapshot; reads, errors, unchanged single updates and rolled-back batches append nothing. Every successful batch qualifies, including unchanged batches.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E3",
      "kind": "regression-verification",
      "locator": "pi-packages/pi-todo/todo.ts:110-114; todo.register.test.ts:130-187",
      "claim": "The finally block publishes committed state after an append failure. Tests verify rejection with the identical error, exactly one committed publication, retained store state, and normal commit-before-append-before-publish-before-return ordering.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E4",
      "kind": "code-and-tests",
      "locator": "pi-packages/pi-todo/state/replay.ts; state/replay.test.ts; todo.codemode-replay.test.ts:180-201",
      "claim": "Replay selects the latest valid custom snapshot on the active branch, otherwise the latest legacy result, otherwise empty state. Tests cover both cross-source orders, clearing, malformed/unrelated entries, task-object cloning and abandoned sibling branches.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E5",
      "kind": "fixture-verification",
      "locator": "pi-packages/pi-todo/todo.codemode-replay.test.ts:17-201; installed Pi 1.0.2 dist/core/session-manager.js",
      "claim": "The fixture uses the actual SessionManager.inMemory(), appends custom entries to its real branch and resets live state before lifecycle replay. Passing regressions cover nested-only history, tree/compaction replay, resolved batch refs/dependencies/nextId and consistent standalone dual writes. Installed SDK contracts confirm the simulated nested-result omission and branch traversal.",
      "basis": "observed",
      "uncertainty": "Tool dispatch and lifecycle delivery are adapters, not a full codemode execution or disk reopen."
    },
    {
      "id": "E6",
      "kind": "diff-review",
      "locator": "git diff -- pi-packages/pi-todo; pi-packages/pi-todo/README.md:112-122; upstream /tmp/rpiv-todo-audit-rainOW commit 1a10bb0",
      "claim": "The port preserves upstream snapshot semantics while adding the local batch policy and append-failure safeguard. Existing assertions were not weakened. Rendering, reinjection, schema and batch implementation remain unchanged. README persistence/fallback claims are accurate. No dependency, lockfile or unrelated package changes occur in scope; scoped diff --check passed.",
      "basis": "observed",
      "uncertainty": "Separate background-task changes were excluded as instructed."
    },
    {
      "id": "E7",
      "kind": "executed-checks",
      "locator": "pnpm --filter @thoth-agents/pi-todo run typecheck; pnpm --filter @thoth-agents/pi-todo run test --maxWorkers=2",
      "claim": "Both commands exited 0 after unsetting the four specified environment variables; all 27 test files and 318 tests passed, including existing publication, atomicity, reinjection, rendering and lifecycle coverage.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E8",
      "kind": "reported-checks",
      "locator": "Delegated assignment: root evidence on this exact post-fix tree",
      "claim": "Root reports successful build, test:pi-extensions (13/13), check:ci and root typecheck.",
      "basis": "inferred",
      "uncertainty": "Root checks were reused from supplied evidence, not independently rerun."
    }
  ],
  "verification": [
    {
      "check": "AC-1",
      "method": "Inspect commit/persistence paths and execute package regressions.",
      "outcome": "pass",
      "evidenceIds": ["E2", "E5", "E7"],
      "reason": "Exactly-once full snapshots follow the existing publication policy for standalone and nested calls, including batches and all exclusion paths."
    },
    {
      "check": "AC-2",
      "method": "Review replay algorithm, unit cases and real SessionManager branch regression.",
      "outcome": "pass",
      "evidenceIds": ["E4", "E5", "E7"],
      "reason": "Precedence, legacy/empty fallback, clearing, validity filtering, branch scoping and task cloning match the contract."
    },
    {
      "check": "AC-3",
      "method": "Inspect and run adapted upstream regressions and the Pi 1.0.2 in-memory fixture.",
      "outcome": "pass",
      "evidenceIds": ["E5", "E6", "E7"],
      "reason": "Nested-only, resolved batch-ref and standalone dual-write cases assert exact reconstructed state."
    },
    {
      "check": "AC-4",
      "method": "Review the complete scoped diff against the existing requirement and run preserved tests plus append-failure regressions.",
      "outcome": "pass",
      "evidenceIds": ["E1", "E3", "E6", "E7"],
      "reason": "Publication survives append failure; local behavior remains covered without weakened assertions, and README documentation is accurate."
    },
    {
      "check": "AC-5",
      "method": "Independently rerun package checks and reuse supplied exact-tree root gate results.",
      "outcome": "pass",
      "evidenceIds": ["E7", "E8"],
      "reason": "Package checks passed independently; all required root gates are reported passing."
    }
  ],
  "risks": [
    {
      "description": "The real-session fixture verifies branch persistence and lifecycle replay, but does not execute codemode itself or reopen a disk session. This is consistent with the accepted fixture scope.",
      "severity": "low",
      "blocking": false,
      "evidenceIds": ["E5"]
    }
  ],
  "openQuestions": [],
  "nextAction": "Root should validate this unchanged envelope, record acceptance evidence, then run closeout before archive.",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/todo-codemode-replay/todo-codemode-replay.md",
    "reviewedRecordSha256": "789e138c1c83b917a5223222e68b04c999e463956d8b90d1a8d57ad16ec7171e"
  }
}
```

After PASS, root pastes the Oracle's unchanged final-verification envelope here.

- AC-1: PASS | todo.register.test.ts persistence cases; shared changesState predicate | registration 2 failed → green; one full snapshot per state-changing call and per successful batch; nothing appended for reads, errors, rollbacks or unchanged updates
- AC-2: PASS | state/replay.test.ts precedence (both orders), fallback, clearing, malformed and unrelated entries, cloning | replay 11 failed → green
- AC-3: PASS | todo.codemode-replay.test.ts on real Pi 1.0.2 SessionManager.inMemory() | nested-only, batch refs (ids, dependencies, nextId), dual write and sibling-branch cases pass
- AC-4: PASS | append-failure and ordering regressions; diff review | publication runs in finally after a throwing append; publication, reinjection, atomicity, rendering and schema unchanged; no existing assertion changed
- AC-5: PASS | package typecheck and test; root build, test:pi-extensions, check:ci and typecheck | exit 0; 27 files and 318 passed; exit 0; 13/13; exit 0; exit 0
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:83dbb6ce136ca3616226f891435993694a0feee65ac8b6a5085022fb830d96a5

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
