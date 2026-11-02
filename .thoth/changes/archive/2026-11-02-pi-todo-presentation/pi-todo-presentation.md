# Change: pi-todo-presentation

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: medium
**Risk**: medium

## Exploration

Explorer map (2026-11-02, paths relative to `pi-packages/`):

- Model: `pi-todo/tool/types.ts:43-53` — numeric `id`, `subject`, optional `description`, `activeForm`, `blockedBy`, `owner`, `metadata`, status `pending|in_progress|completed|deleted`. No group key, no timestamps. State `{tasks, nextId}` per session, branch replay (`state/store.ts`, `state/replay.ts`).
- Order: creation order (`state/state-reducer.ts:198-211`). Widget provider (`pi-todo/todo-work-panel.ts:52-70`) emits all non-deleted tasks in stored order, completed rows `dropFirst`; host prioritizes unfinished rows but restores provider order on display (`pi-core/src/work-panel-render.ts:1532-1548,1592-1624,1863-1867`). Panel budget min(12, rows/2) shared by providers (`work-panel-host.ts:100-107`). Overflow `+N done` / `+N more`.
- Sidebar (`pi-sidebar/src/panels/sidebar.ts:75-112,468-473,507-526,690-735`): keeps all unfinished plus the last three completed in input order; height pressure hides completed then the oldest unfinished; `+N more` ignores completed rows removed by the last-three rule.
- Styling: pending and in_progress subjects both `primary` (bold `toolTitle`); glyphs ○ / taskInProgress / ✓; completed dim + strikethrough; `activeForm` shown in parentheses; owner/blockers/ID never shown in compact rows (`todo-work-panel.ts:54-85`). Tree connectors are row chrome, not hierarchy.
- Counts: `completed/total` non-deleted (`state/selectors.ts:35-45`, `pi-core/src/work-panel-counts.ts:31-35`).
- `/todos` (`todo-panel.ts`, `todo.ts:138-188`): grouped In progress → Not started → Completed, no filters.
- Lifecycle: no archival; fully completed lists are presentation-hidden after the next prompt epoch (`todo-visibility.ts:8-39`); `clear` wipes all. User screenshots show sessions at 204/215 with stale plans visible, completed rows interleaved with pending, in-progress rows indistinguishable from pending, and repeated subject prefixes (`pi-1.4`, `narration:`, `3a T21`, `pyramid-rise`) consuming width.
- `selectOverlayLayout` (`state/selectors.ts:83-112`) is unused.
- Tests: pi-todo `todo-work-panel*.test.ts`, `todo-panel*.test.ts`, `todo.command.test.ts`, `todo.frame-regression.test.ts`, `todo.render-kit.test.ts`, `todo.session-isolation.test.ts`; pi-core `test/work-panel-retention.test.ts`, `work-panel-counts.test.ts`, `work-panel-heading-counts.test.ts`; pi-sidebar `test/work-panel-order.test.ts`, `work-panel-priority.test.ts`, `panels.test.ts`.

## Intent

Make the task list readable in the above-editor work panel and the sidebar during long sessions: show live work first and distinguishably, report truthful counts and hidden rows, keep previously completed work out of compact views, and group related tasks so prefixes stop repeating.

## Non-goals

- No change to `/todos` command arguments or filters (P6 deferred).
- No change to Agents/Background panel ordering or counts.
- No package version bumps; no backward-compatibility shims beyond tolerating snapshots without the new fields.
- No deletion of task state by archival; `clear` and `delete` semantics unchanged.

## Acceptance

- AC-1: Compact Todos views (work panel and sidebar) order top-level entries (groups and ungrouped tasks) by the most active member status in_progress → unblocked pending → blocked pending → current-epoch completed, ties by lowest task id; each group stays contiguous under one heading with its members in the same status order; tasks of one status follow id order except completed, most recently completed first; under height pressure they keep in_progress tasks and hide completed tasks first, then the latest-created pending tasks, keeping a group heading while any member is shown.
- AC-2: In compact rows, in_progress subjects use the accent emphasis plus `activeForm`, pending subjects use plain text style, blocked pending rows are dim with a blocked marker and the blocking ids, completed rows stay dim and struck through.
- AC-3: The Todos heading and summary line render through the shared compact count formatter as running/queued/completed glyph counts (in_progress, pending, completed), and both surfaces report tasks hidden for lack of room as `+N pending` and/or `+N done`, counting tasks rather than rows (a collapsed group counts its members as shown) and excluding archived tasks, which remain counted in the heading.
- AC-4: Tasks carry `createdAt` and `completedAt`; when a new prompt epoch is recognized, pi-todo persists one snapshot that marks every completed, not yet archived task with `archivedAt` without changing its status; archived tasks are excluded from compact views and kept in `/todos` under Completed; the marker survives restart, tree navigation and compaction through branch replay; snapshots without the new fields load, show their completed tasks until the next recognized epoch, and the sidebar and work panel refresh on the archiving snapshot.
- AC-5: The todo tool accepts an optional `group` on create, update and batch ops; tasks without one get an inferred group from the first token of the subject text before its first `: ` when at least two non-deleted tasks share it; compact views render each group as a heading with its rows nested and the redundant prefix stripped, collapse a fully completed group to one `✓ <group> (N)` line, and `/todos` shows the group on each row; grouping travels through a data-only pi-core work-panel row contract (group key and label, depth, represented task counts by status) honored by the host and the sidebar, leaving Agents and Background rows unchanged.
- AC-6: The unused `selectOverlayLayout` selector is removed, tool definitions stay within the package size budget, and the pi-todo, pi-core and pi-sidebar typecheck and focused tests pass together with `pnpm run check:ci` and `pnpm run typecheck`.

## Clarifications

- Scope: user selected P1-P5 (P6 filters excluded) on 2026-11-02.
- Archival: user chose automatic — completed tasks from previous prompt epochs leave compact views and remain in `/todos`.
- Grouping: user chose an explicit `group` field with fallback inference from the subject prefix.
- Fully completed groups: user chose one collapsed `✓ <group> (N)` line.
- Mixed-status groups (after Oracle plan review REJECT, 2026-11-02): user chose contiguous groups ordered by their most active member, members sorted by status inside the group, over global status order with repeated headings.

## Decisions

- Counts reuse the existing pi-core compact formatter (running/queued/completed roles) instead of a todo-specific format; the formatter's narrow-width rules (queued dropped below 36 columns) apply unchanged.
- Widget ordering is achieved by the provider emitting rows in the AC-1 order; the host's "restore provider order" behavior stays.
- The pi-core prompt epoch is volatile (`work-panel-lifecycle.ts`: epoch zero at init, disposal drops state), so archival is persisted as an `archivedAt` marker written by a pi-todo snapshot when an epoch is recognized, never computed from timestamps at render time; replay restores it and the provider revision bump invalidates sidebar caches.
- Overflow lines count tasks hidden for lack of room only; archived tasks are excluded from them because the heading `✓` count and `/todos` already expose them (avoids a permanent `+N done` in long sessions).
- Group headings are carried by an additive, data-only row field in `pi-core/src/work-panel.ts`; sources that do not set it render exactly as today.
- Inferred groups use the first whitespace token before `: ` so `pi-1.4 AC-1:` and `pi-1.4:` share `pi-1.4`; a single-member inferred group is not a group.
- Model context (open tasks injected before agent start) is unchanged.

## Durable deltas

- `MODIFIED pi-ecosystem` **Thoth Pi task-list extension** — The Thoth Pi task-list package (published under the `@thoth-agents` scope as a fork of the juicesharp rpiv 2.12.0 task-list package) MUST register the session task-list tool with the upstream 2.12.0 schema and transition rules extended by an atomic `batch` action whose ordered create/update/delete ops may reference tasks created earlier in the same call through call-scoped refs, by a create-time status of the initial status, in_progress or completed, without limiting how many tasks are in progress, and by an optional `group` on create, update and batch ops; tasks MUST record creation and completion times, and when a new prompt epoch is recognized the package MUST persist one snapshot marking every completed task not yet archived as archived without changing its status, restored by branch replay; it MUST reconstruct the session list from the branch on session start, tree navigation and compaction, MUST publish its full session snapshot on the pi-core task-list state channel after each change and in answer to a request, MUST add the open tasks to the model context before each agent start when any exist using an API detected at runtime that degrades without failing on the minimum supported Pi, and MUST show only the current session's list through its pi-core work-panel section and the sidebar Todos panel; those compact views MUST exclude archived tasks, MUST group tasks by explicit group or by the first subject token before `: ` shared by at least two tasks with the prefix stripped, keeping each group contiguous under one heading and collapsing a fully completed group to one `✓ <group> (N)` line, MUST order groups and ungrouped tasks by their most active status in_progress, unblocked pending, blocked pending, then completed, with members of a group in the same order and completed tasks most recent first, MUST style in_progress, pending, blocked and completed rows distinctly, and on overflow MUST hide completed tasks first and then the latest-created pending tasks while keeping in_progress tasks, reporting the hidden non-archived tasks with exact `+N pending` and `+N done` lines; Enter on any Todos row, heading or summary line and the `/todos` command when custom UI is available MUST open one panel built on the pi-core history panel shell with the full current list including archived tasks grouped by status, while `/todos` without custom UI keeps its text output; once every task is completed the list MUST remain shown until the next recognized prompt epoch and then disappear from the section and panel without altering task state.
  - GIVEN a session with two archived completed tasks, a `pi-1.4` group of three tasks (one in_progress, one pending, one completed this epoch) and an ungrouped pending task blocked by another; WHEN the work panel and sidebar render with room for every row; THEN both show the `pi-1.4` heading first with its in_progress row and activeForm, then its pending row, then its completed row, all without the `pi-1.4` prefix, followed by the blocked ungrouped row with its blocker id, omit the archived tasks, and after a restart the same two tasks stay archived while `/todos` lists all tasks including the archived ones grouped by status .
- `MODIFIED pi-ecosystem` **Shared compact work counts** — `@thoth-agents/pi-core` MUST provide one compact count formatter used by the sidebar panel headers, the work-panel section headings and the editor-replaced work-panel summary line: every work source with numeric counts, including the task list with in_progress as running, pending as queued and completed as completed, MUST render only positive counts as a status glyph immediately followed by its number, in the order running, queued, completed, failed, cancelled, colored with the accent, dim, success, error and muted roles; the queued count MUST be omitted below 36 columns of available width, and when the counts exceed the available room the cancelled and then the queued count MUST be dropped before any other; a source without numeric counts MUST render its summary text; work-panel headings MUST take counts from provider numeric summaries and otherwise classify rows by semantic status rather than retention state, and a collapsed prompt-retention section MUST stay visible while any of its completed, failed or cancelled counts is non-zero.
  - GIVEN subagents with 1 running, 2 queued, 30 completed, 1 failed and 1 cancelled, a task list with 1 in_progress, 2 pending and 12 completed tasks and background tasks with 1 running and 2 completed on a wide terminal with the sidebar hidden; WHEN the work panel renders normally and then while an `ask_user_question` panel is expanded; THEN the Agents heading shows `◐1 ○2 ✓30 ✗1 ■1`, the Todos heading shows `◐1 ○2 ✓12`, the Background heading shows `◐1 ✓2`, and the summary line reads `Agents ◐1 ○2 ✓30 ✗1 ■1 · Todos ◐1 ○2 ✓12 · Background ◐1 ✓2` .

## Plan

Three units, one writer per surface:

1. **Model (pi-todo state/tool/lifecycle)** — add optional `group`, `createdAt`, `completedAt`, `archivedAt` to the task type; `group` in the create/update/batch schema; stamping in the reducer (not in `todo.ts`); an `archive` reducer transition applied when pi-todo observes a newly recognized prompt epoch (wired in `index.ts` from the existing lifecycle source used by `todo-visibility.ts`), persisted as a normal snapshot so replay restores it and the provider revision bumps; tolerate snapshots lacking the fields; pure selectors for group resolution (explicit or inferred), the AC-1 compact layout (ordered groups/tasks with represented counts) and status counts; remove `selectOverlayLayout`; keep the tool-definition size budget test green. Test-first, including restart/tree/compaction replay of `archivedAt` and a recognized-epoch archiving test.
2. **Compact presentation (pi-core row contract + host, pi-todo provider, pi-sidebar Todos)** — add an additive data-only row field in `pi-core/src/work-panel.ts` (group key/label, depth, represented task counts by status) that the host (`work-panel-render.ts`) and the sidebar honor: group headings render in place (not as trailing summary rows) and survive sidebar retention while any member is shown; overflow lines total represented tasks, not rows. The provider consumes unit 1 selectors: AC-1 order, archived excluded, nested and collapsed groups, AC-2 styling, numeric summary for the shared formatter (AC-3). Sidebar uses a Todos-specific retention branch (Agents/Background branch untouched) replacing "last three completed" with the provider's set. Update heading/summary tests to the new scenario.
3. **`/todos` panel (pi-todo `todo-panel.ts`, `/todos` handler and text fallback in `todo.ts`)** — include archived tasks in Completed and show each row's group; depends on unit 1 only, parallel with unit 2.

Risks: shared row renderer and host planning used by Agents/Background (unit 2 must not change their output — existing pi-core/sidebar tests are the guard); width regressions on narrow terminals (frame-regression tests); tool schema budget; epoch archiving writing extra session entries (only when unarchived completed tasks exist).

## Tasks

- [x] AC-4: Task model gains `group`, `createdAt`, `completedAt`, persisted `archivedAt` on recognized epochs, and legacy-snapshot tolerance
  - Outcome: pi-todo state, tool schema, epoch wiring and selectors expose timestamps, persisted archival, group resolution, AC-1 layout with represented counts and status counts; `selectOverlayLayout` removed
  - Known entrypoints and skill paths: pi-packages/pi-todo/tool/types.ts, state/state-reducer.ts, state/selectors.ts, state/replay.ts, state/store.ts, todo-visibility.ts, index.ts, pi-packages/pi-core/src/work-panel-lifecycle.ts (read-only); skill tdd
  - Inputs: Exploration section; Decisions section
  - Dependencies: none
  - Output: pure, tested selectors and extended model
  - Owner: thoth-worker
  - Writes: pi-packages/pi-todo/tool/**, pi-packages/pi-todo/state/**, pi-packages/pi-todo/todo-visibility.ts, pi-packages/pi-todo/index.ts and their tests
  - Interface boundaries: pi-core task-list state channel snapshot shape (additive fields only); pi-core lifecycle read-only; model-context injection unchanged
  - Focused check and PASS evidence: pi-todo typecheck and vitest for state/selectors/replay (restart, tree, compaction keep `archivedAt`), epoch-archiving and tool-definition budget green
  - Return milestone: selectors and model merged with green focused tests
  - Stop / reassessment: no recognized-epoch signal reachable from pi-todo without changing pi-core, or schema budget cannot fit `group`
- [x] AC-5: Group resolution covers explicit and inferred groups
  - Outcome: selector returns group per task per AC-5 rules, with tests for `pi-1.4`, `narration:`, single-member and explicit cases
  - Known entrypoints and skill paths: pi-packages/pi-todo/state/selectors.ts; skill tdd
  - Inputs: AC-5 text
  - Dependencies: none (same worker and session as the AC-4 unit)
  - Output: tested group selector
  - Owner: thoth-worker
  - Writes: pi-packages/pi-todo/state/selectors.ts and tests
  - Interface boundaries: none
  - Focused check and PASS evidence: selector tests green
  - Return milestone: with the AC-4 unit
  - Stop / reassessment: ambiguity in prefix rules not covered by Decisions
- [x] AC-1: Compact views order and retain rows per AC-1
  - Outcome: work-panel provider and sidebar todos emit AC-1 order, exclude archived, hide completed then latest pending under pressure
  - Known entrypoints and skill paths: pi-packages/pi-todo/todo-work-panel.ts, pi-packages/pi-core/src/work-panel-render.ts, pi-packages/pi-sidebar/src/panels/sidebar.ts; skill tdd
  - Inputs: accepted AC-4/AC-5 selectors
  - Dependencies: AC-4 and AC-5 units accepted
  - Output: provider and sidebar changes with tests
  - Owner: thoth-worker
  - Writes: pi-packages/pi-todo/todo-work-panel.ts, pi-packages/pi-core/src/work-panel.ts, pi-packages/pi-core/src/work-panel-*.ts, pi-packages/pi-sidebar/src/panels/sidebar.ts and their tests
  - Interface boundaries: additive data-only row field; shared row renderer, host planning and Agents/Background retention output must not change
  - Focused check and PASS evidence: pi-todo work-panel tests, pi-core work-panel tests, pi-sidebar work-panel tests green, including a sidebar epoch-transition refresh test
  - Return milestone: compact ordering green
  - Stop / reassessment: host retention cannot honor provider ordering without changing Agents/Background behavior
- [x] AC-2: Compact rows styled distinctly by status
  - Outcome: in_progress accent + activeForm, pending plain, blocked dim with blocker ids, completed dim struck
  - Known entrypoints and skill paths: pi-packages/pi-todo/todo-work-panel.ts, pi-packages/pi-core/src/work-panel-render.ts
  - Inputs: AC-1 unit output
  - Dependencies: same worker session as AC-1 unit
  - Output: styled rows with render tests
  - Owner: thoth-worker
  - Writes: same as AC-1 unit
  - Interface boundaries: render-kit roles only
  - Focused check and PASS evidence: todo.render-kit and frame-regression tests green
  - Return milestone: with AC-1 unit
  - Stop / reassessment: theme role missing for a status
- [x] AC-3: Shared counts and exact overflow lines
  - Outcome: Todos heading/summary via shared formatter with glyph counts; `+N pending` / `+N done` exact on both surfaces
  - Known entrypoints and skill paths: pi-packages/pi-core/src/work-panel-counts.ts, pi-packages/pi-todo/todo-work-panel.ts, pi-packages/pi-sidebar/src/panels/sidebar.ts
  - Inputs: AC-4 counts selector
  - Dependencies: same worker session as AC-1 unit
  - Output: updated counts and overflow with tests
  - Owner: thoth-worker
  - Writes: same as AC-1 unit
  - Interface boundaries: Agents/Background counts unchanged
  - Focused check and PASS evidence: work-panel-counts, heading-counts, sidebar panels tests green with new Todos expectations
  - Return milestone: with AC-1 unit
  - Stop / reassessment: formatter change would alter other sources
- [x] AC-5: Compact views render groups and collapsed completed groups
  - Outcome: group headings, nested rows with prefix stripped, `✓ <group> (N)` collapse in work panel and sidebar
  - Known entrypoints and skill paths: pi-packages/pi-todo/todo-work-panel.ts, pi-packages/pi-sidebar/src/panels/sidebar.ts
  - Inputs: AC-5 selector
  - Dependencies: same worker session as AC-1 unit
  - Output: grouped rendering with tests
  - Owner: thoth-worker
  - Writes: same as AC-1 unit
  - Interface boundaries: row-height stability requirement
  - Focused check and PASS evidence: grouped-render tests green in pi-todo, pi-core host and pi-sidebar covering in-place headings, heading retention, collapsed-group and height-dropped task accounting
  - Return milestone: with AC-1 unit
  - Stop / reassessment: work-panel row model cannot express group headings
- [x] AC-4: `/todos` shows archived tasks and groups
  - Outcome: `/todos` panel and text fallback include archived completed tasks in Completed and show each row's group
  - Known entrypoints and skill paths: pi-packages/pi-todo/todo-panel.ts, pi-packages/pi-todo/todo.ts
  - Inputs: AC-4/AC-5 selectors
  - Dependencies: AC-4 and AC-5 model units accepted
  - Output: panel changes with tests
  - Owner: thoth-worker
  - Writes: pi-packages/pi-todo/todo-panel.ts, pi-packages/pi-todo/todo.ts and their tests
  - Interface boundaries: pi-core history panel shell
  - Focused check and PASS evidence: todo-panel, todo-panel-focus, todo.command tests green
  - Return milestone: panel tests green
  - Stop / reassessment: shell cannot show group labels
- [x] AC-6: Repository closeout checks
  - Outcome: touched-package typechecks/tests plus `pnpm run check:ci` and `pnpm run typecheck` pass
  - Known entrypoints and skill paths: repository root
  - Inputs: all units accepted
  - Dependencies: all prior units
  - Output: green check evidence
  - Owner: root
  - Writes: none
  - Interface boundaries: none
  - Focused check and PASS evidence: commands exit 0
  - Return milestone: before final Oracle
  - Stop / reassessment: unrelated environment failure reported with evidence

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
First review REJECT (3 blockers) repaired; fresh Oracle OKAY on record sha256 99a2046948b0ac5f4fbf937d2f2c95044563f6230731694cf7e9880dc1348b86.
**Implementation**: AUTHORIZED
User selected Implement on 2026-11-02 after plan review OKAY.

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 41320f4bb6c51ff72a6f33a2bc4c7f38ee259b21630ac18df9f66cf48deae209

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS: the working-tree changes satisfy AC-1 through AC-6 and both declared pi-ecosystem deltas. No blocking findings.",
  "evidence": [
    {
      "id": "E1",
      "kind": "governance",
      "locator": ".thoth/changes/pi-todo-presentation/pi-todo-presentation.md",
      "claim": "Bundled validation through verify passes; the canonical baseline matches the declared SHA-256.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E2",
      "kind": "behavior",
      "locator": "pi-packages/pi-todo/state/; todo-visibility.test.ts",
      "claim": "Tests verify timestamps, explicit/inferred groups, ordering, one persisted archival snapshot per applicable epoch, legacy tolerance, and restart/tree/compaction replay.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E3",
      "kind": "presentation",
      "locator": "pi-packages/pi-todo/todo-work-panel*.test.ts; pi-core/test/work-panel-compact.test.ts; pi-sidebar/test/todo-compact.test.ts",
      "claim": "Tests verify contiguous groups, stripped prefixes, collapsed completed groups, distinct styles, task-based overflow excluding archived tasks, heading retention and sidebar refresh.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E4",
      "kind": "regression",
      "locator": "pi-packages/pi-core/src/work-panel*.ts; pi-sidebar/src/panels/sidebar.ts",
      "claim": "Shared glyph-count formatting is used for Todos; task-layout changes are opt-in. Existing Agents/Background ordering, retention and summary tests pass without changed expectations for their output.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E5",
      "kind": "history",
      "locator": "pi-packages/pi-todo/todo-panel*.test.ts; todo.command.test.ts",
      "claim": "Panel and text-output tests verify archived Completed tasks and per-row group labels.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E6",
      "kind": "checks",
      "locator": "Independent focused commands across pi-todo, pi-core and pi-sidebar",
      "claim": "24 test files / 282 tests pass, including the unchanged tool-definition budget test; all three package typechecks pass. No selectOverlayLayout references remain.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E7",
      "kind": "reported-checks",
      "locator": "Root-provided verification evidence",
      "claim": "Root reports check:ci, root typecheck and all three package suites passing.",
      "basis": "observed",
      "uncertainty": "Broad checks were supplied by root, not independently rerun."
    },
    {
      "id": "E8",
      "kind": "diff-integrity",
      "locator": "git status; tracked diff; all untracked files",
      "claim": "All 40 changed/untracked files were reviewed and remain unchanged across final checks. Changes are scoped; no unrelated, secret or generated changes found. git diff --check passes.",
      "basis": "observed",
      "uncertainty": ""
    }
  ],
  "verification": [
    {
      "check": "Record validity and baseline binding",
      "method": "Bundled verify validator and independent SHA-256 calculation",
      "outcome": "pass",
      "evidenceIds": ["E1", "E8"],
      "reason": "Record prefix and canonical source are bound to the reviewed inputs."
    },
    {
      "check": "AC-1 through AC-5 and task-list delta",
      "method": "Source/diff inspection and focused state, lifecycle, rendering and command tests",
      "outcome": "pass",
      "evidenceIds": ["E2", "E3", "E5"],
      "reason": "Ordering, styling, grouping, overflow, persisted archival and history behavior satisfy the contracts."
    },
    {
      "check": "Shared-count delta and Agents/Background preservation",
      "method": "Inspect opt-in branches; run count, summary, retention and sidebar regression tests",
      "outcome": "pass",
      "evidenceIds": ["E3", "E4"],
      "reason": "Todos uses the shared formatter; unrelated source behavior remains unchanged."
    },
    {
      "check": "AC-6 and change hygiene",
      "method": "Independent package typechecks, focused tests, selector search and diff audit; reuse root broad-check evidence",
      "outcome": "pass",
      "evidenceIds": ["E6", "E7", "E8"],
      "reason": "Required checks pass and reviewed inputs remain unchanged."
    }
  ],
  "risks": [],
  "openQuestions": [],
  "nextAction": "Root should validate this result, populate Verification evidence, and run closeout before archiving.",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/pi-todo-presentation/pi-todo-presentation.md",
    "reviewedRecordSha256": "41320f4bb6c51ff72a6f33a2bc4c7f38ee259b21630ac18df9f66cf48deae209"
  }
}
```

- AC-1: PASS | pi-todo selectors tests; pi-core work-panel-compact.test.ts; pi-sidebar todo-compact.test.ts | Oracle E2/E3; suites 339/1223/537 green
- AC-2: PASS | todo-work-panel*.test.ts, todo.render-kit/frame-regression tests | Oracle E3
- AC-3: PASS | work-panel-counts/heading-counts tests, sidebar todo-compact overflow tests | Oracle E3/E4
- AC-4: PASS | replay, todo-visibility epoch-archiving, todo-panel/todo.command tests | Oracle E2/E5
- AC-5: PASS | selectors group tests, todo-work-panel-groups.test.ts, todo-panel tests | Oracle E2/E3/E5
- AC-6: PASS | pnpm run check:ci, pnpm run typecheck, package typechecks + vitest, budget test | Oracle E6/E7
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:2154ba95b30fd82deca8aca16f46fec4c02450da8e0d4b94f54fc2d21882047c

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
