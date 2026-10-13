# Change: pi-todo-batch-ops

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: low
**Risk**: medium

**Package root (PKG)**: `pi-packages/pi-todo/` (`@thoth-agents/pi-todo`); tool name `todo`; initial status value `pending`; package tests: `pnpm --filter @thoth-agents/pi-todo run test`.
Tool entry file `todo.ts` is called ENTRY and its registration test `todo.register.test.ts` is ENTRY-TEST.
Sections below say "the task-list package/tool", "PKG" and "initial status" for these names.

## Exploration

- The task-list package lives in PKG; the tool is registered in ENTRY (lines 83–125) with model guidance in ENTRY lines 72–88 and the TypeBox schema in `tool/types.ts:86–149` (one required `action` among create/update/list/get/delete/clear; no batch parameter).
- Dispatch goes through `applyTaskMutation` in `state/state-reducer.ts`; `create` hardcodes the initial status and ignores a supplied `status` (`state-reducer.ts:112–121`); `blockedBy` references are validated before insertion, so a task can only depend on tasks that already existed before the call (`103–119`).
- "Exactly one in_progress" is prompt guidance only; the reducer checks per-task transitions (`state/invariants.ts:10–19`) and never counts in-progress tasks.
- Persistence is the last task-list tool-result `details` (`{action, params, tasks, nextId, error?}`) on the branch (`state/replay.ts:9–45`); publication happens only for real mutations (`state/publish.ts`); TUI rendering lives in `view/format.ts:325–535`; responses in `tool/response-envelope.ts`.
- Consequence: creating 10 tasks with one in progress costs 11 tool calls (ten creates plus one update).
- Canonical requirement `.thoth/specs/pi-ecosystem/spec.md` "Thoth Pi task-list extension" mandates "the upstream 2.12.0 schema and transition rules".
- Tests: package-local Vitest suites (ENTRY-TEST, `state/state-reducer.test.ts`, `tool/response-envelope.test.ts`, `view/format.test.ts`, `test/state-events.test.ts`, `state/replay.test.ts`, …); command in the header.

## Intent

Let an agent that already knows its plan apply it in one task-list tool call: create many tasks (any of them already in progress or completed), wire their dependencies, and update or delete existing tasks, atomically. The package allows any number of tasks in progress at once, because Thoth is designed for parallel work.

## Non-goals

- No limit on, or automatic demotion of, concurrent `in_progress` tasks.
- No batching of read actions (`list`, `get`) or `clear`.
- No changes to the shared root prompts (`src/agents/prompt-sections.ts`, `prompt-dialects.ts`, `agent-pack.ts`) or to `skills/thoth-sdd`; their "keep one in_progress" guidance is a separate product-policy follow-up.
- No changes to replay format, reinjection, pi-core snapshot contract, the work panel or `/todos` beyond what renders batch results.
- No version bumps.

## Acceptance

- AC-1: One task-list tool call with `action: "batch"` and an `ops` array creates 10 tasks where one is `in_progress`, producing the final state, correct `nextId`, a single tool result and exactly one snapshot publication.
- AC-2: A batch is atomic: when any op is invalid, no task or `nextId` changes, nothing is published, and the error identifies the failing op index and reason.
- AC-3: Within a batch, a `create` may declare a unique string `ref`; later ops may use that ref wherever a task id is accepted (`id`, `blockedBy`, `addBlockedBy`, `removeBlockedBy`); duplicate, undeclared or forward refs are rejected.
- AC-4: `create` (single or batched) honors `status` initial, `in_progress` or `completed` (default initial status) and rejects `deleted`; any number of tasks may be `in_progress` simultaneously.
- AC-5: Batch results render in the TUI (call line shows op count; result summarizes per-op outcomes and counts), replay from the branch and reinject open tasks with no format change; existing single-action behavior and tests are unchanged.
- AC-6: Model-facing description, prompt guidelines, field descriptions and README document batch usage and parallel `in_progress`, and no longer say "exactly one in_progress" or "never batch completions".

## Clarifications

- User confirmed (2026-10-13): batching is wanted so a known plan costs one tool call.
- User decided (2026-10-13): the package must NOT enforce a single `in_progress`; several tasks may be in progress in parallel. Invalid batches are rejected as a whole.

## Decisions

- Batch shape: `action: "batch"` plus `ops: Op[]`, keeping `action` required and the existing single-action shape unchanged. Each op is `{ action: "create" | "update" | "delete", …same fields as today }` plus optional `ref` on create.
- Ids in batch ops accept `number | string`; strings resolve only to refs declared by an earlier create in the same batch. Refs are scoped to one call and are not persisted.
- Atomicity: ops are reduced sequentially against a working copy; the first failure aborts the whole batch with `op[<index>] <action>: <reason>`; on success the final state is committed once.
- Bound: at most 50 ops per batch; an empty `ops` array is an error.
- Create-time `status`: allowed initial, `in_progress` or `completed`; `deleted` rejected; same rule for single `create`.
- Result `details` keep `{action, params, tasks, nextId, error?}` (replay-compatible) and add `results: {index, action, id, ref?}[]` for batch calls.
- Root prompt and SDD skill guidance stay unchanged in this change (non-goal), reported as a follow-up.

## Durable deltas

- `MODIFIED pi-ecosystem` **Thoth Pi task-list extension** — The Thoth Pi task-list package (published under the `@thoth-agents` scope as a fork of the juicesharp rpiv 2.12.0 task-list package) MUST register the session task-list tool with the upstream 2.12.0 schema and transition rules extended by an atomic `batch` action whose ordered create/update/delete ops may reference tasks created earlier in the same call through call-scoped refs, and by a create-time status of the initial status, in_progress or completed, without limiting how many tasks are in progress; it MUST reconstruct the session list from the branch on session start, tree navigation and compaction, MUST publish its full session snapshot on the pi-core task-list state channel after each change and in answer to a request, MUST add the open tasks to the model context before each agent start when any exist using an API detected at runtime that degrades without failing on the minimum supported Pi, and MUST show only the current session's list through its pi-core work-panel section; that Todos section MUST list the current list with completed tasks marked and a done/total counter, dropping completed tasks first on overflow with an exact `+N done` line; Enter on any Todos row, heading or summary line and the `/todos` command when custom UI is available MUST open one panel built on the pi-core history panel shell with the full current list grouped by status, while `/todos` without custom UI keeps its text output; once every task is completed the list MUST remain shown until the next recognized prompt epoch and then disappear from the section and panel without altering task state.
  - GIVEN an empty session list; WHEN the agent sends one batch call creating seven tasks, two of them in_progress and one depending on another through a ref, and the list is later compacted; THEN one snapshot is published with seven tasks and both in_progress tasks, the dependency points to the created id, and the reconstructed list, model context and `/todos` panel show the same seven tasks grouped by status .

## Plan

Single writer on PKG (no other mutable surface), test-first:

1. Schema (`tool/types.ts`): add `"batch"` to the action enum and an `ops` array of op objects (`action` create|update|delete, existing mutable fields, `ref?: string`, ids as `number | string`); model-facing descriptions for each.
2. Reducer (`state/state-reducer.ts`, `state/invariants.ts` if needed): extract per-op application usable on a working copy; implement `batch` with ref resolution, 50-op bound, sequential application, first-error abort naming the op index; make `create` honor allowed `status`. Return per-op results for the envelope.
3. Envelope (`tool/response-envelope.ts`): batch content text (one line per op plus counts) and `details.results`; errors in-band as today.
4. Execute/publication (ENTRY): commit and publish once per successful mutating batch; no publication on error.
5. Render (`view/format.ts`): renderCall `batch · N ops`; renderResult summary counts and per-op lines within existing expand behavior.
6. Docs (ENTRY description/guidelines, `README.md`): document batch with a short example, create-time status, refs, parallel in_progress; drop "exactly one in_progress" and "never batch completions" wording (keep "complete as soon as done").

Verification seams: reducer unit tests (batch success, atomic failure, refs, status-at-create, multiple in_progress), envelope/format tests, `test/state-events.test.ts` (single publication; none on error), `state/replay.test.ts` (batch details replay), ENTRY-TEST (schema/description), then the package tests, `pnpm run typecheck`, `pnpm run check:ci`, and the package build if defined (dist is the published entrypoint).

Risks: replay depends on `details.tasks/nextId` staying present (kept); model-facing schema growth (bounded by concise descriptions); Pi host schema validation of `number | string` unions (use TypeBox `Union` already supported by Pi tools).

## Tasks

- [x] AC-1: Batch action with ordered create/update/delete ops committed once
  - Outcome: Batch action with ordered create/update/delete ops committed once
  - Known entrypoints and skill paths: PKG files `tool/types.ts`, `state/state-reducer.ts`, `state/invariants.ts`, `tool/response-envelope.ts`, ENTRY, `view/format.ts`, `state/replay.ts`, `state/publish.ts`, `README.md`; tests beside each; installed `tdd` and `simplify` skills
  - Inputs: this record's Decisions and Plan; Exploration findings
  - Dependencies: none
  - Output: state, nextId and single publication for a 10-create batch
  - Owner: thoth-worker (one writer for all rows, one assignment)
  - Writes: PKG excluding `dist/`
  - Interface boundaries: replay-compatible `details`; pi-core snapshot contract unchanged; single-action behavior unchanged; root prompts and skills untouched
  - Focused check and PASS evidence: reducer and state-events tests for a 10-task batch with one in_progress pass
  - Return milestone: package tests, `pnpm run typecheck` and `pnpm run check:ci` pass
  - Stop / reassessment: Pi host rejects the union id schema, replay/publication contract must change, or edits outside PKG are needed

- [x] AC-2: Atomic rejection of an invalid batch naming the failing op
  - Outcome: Atomic rejection of an invalid batch naming the failing op
  - Known entrypoints and skill paths: PKG files `tool/types.ts`, `state/state-reducer.ts`, `state/invariants.ts`, `tool/response-envelope.ts`, ENTRY, `view/format.ts`, `state/replay.ts`, `state/publish.ts`, `README.md`; tests beside each; installed `tdd` and `simplify` skills
  - Inputs: this record's Decisions and Plan; Exploration findings
  - Dependencies: AC-1 row in the same assignment
  - Output: unchanged state, no publication, indexed error
  - Owner: thoth-worker (one writer for all rows, one assignment)
  - Writes: PKG excluding `dist/`
  - Interface boundaries: replay-compatible `details`; pi-core snapshot contract unchanged; single-action behavior unchanged; root prompts and skills untouched
  - Focused check and PASS evidence: reducer and state-events tests for a failing op leave state/nextId unchanged and publish nothing
  - Return milestone: package tests, `pnpm run typecheck` and `pnpm run check:ci` pass
  - Stop / reassessment: Pi host rejects the union id schema, replay/publication contract must change, or edits outside PKG are needed

- [x] AC-3: Call-scoped refs usable as ids and dependency references
  - Outcome: Call-scoped refs usable as ids and dependency references
  - Known entrypoints and skill paths: PKG files `tool/types.ts`, `state/state-reducer.ts`, `state/invariants.ts`, `tool/response-envelope.ts`, ENTRY, `view/format.ts`, `state/replay.ts`, `state/publish.ts`, `README.md`; tests beside each; installed `tdd` and `simplify` skills
  - Inputs: this record's Decisions and Plan; Exploration findings
  - Dependencies: AC-1 row in the same assignment
  - Output: ref resolution with duplicate/undeclared/forward rejection
  - Owner: thoth-worker (one writer for all rows, one assignment)
  - Writes: PKG excluding `dist/`
  - Interface boundaries: replay-compatible `details`; pi-core snapshot contract unchanged; single-action behavior unchanged; root prompts and skills untouched
  - Focused check and PASS evidence: reducer tests for each ref case pass, including cycle checks with refs
  - Return milestone: package tests, `pnpm run typecheck` and `pnpm run check:ci` pass
  - Stop / reassessment: Pi host rejects the union id schema, replay/publication contract must change, or edits outside PKG are needed

- [x] AC-4: Create-time status for single and batched creates with no in_progress limit
  - Outcome: Create-time status for single and batched creates with no in_progress limit
  - Known entrypoints and skill paths: PKG files `tool/types.ts`, `state/state-reducer.ts`, `state/invariants.ts`, `tool/response-envelope.ts`, ENTRY, `view/format.ts`, `state/replay.ts`, `state/publish.ts`, `README.md`; tests beside each; installed `tdd` and `simplify` skills
  - Inputs: this record's Decisions and Plan; Exploration findings
  - Dependencies: none
  - Output: create honors initial/in_progress/completed and rejects deleted
  - Owner: thoth-worker (one writer for all rows, one assignment)
  - Writes: PKG excluding `dist/`
  - Interface boundaries: replay-compatible `details`; pi-core snapshot contract unchanged; single-action behavior unchanged; root prompts and skills untouched
  - Focused check and PASS evidence: reducer tests for each create status and for several in_progress tasks pass
  - Return milestone: package tests, `pnpm run typecheck` and `pnpm run check:ci` pass
  - Stop / reassessment: Pi host rejects the union id schema, replay/publication contract must change, or edits outside PKG are needed

- [x] AC-5: Batch results render, replay and reinject
  - Outcome: Batch results render, replay and reinject
  - Known entrypoints and skill paths: PKG files `tool/types.ts`, `state/state-reducer.ts`, `state/invariants.ts`, `tool/response-envelope.ts`, ENTRY, `view/format.ts`, `state/replay.ts`, `state/publish.ts`, `README.md`; tests beside each; installed `tdd` and `simplify` skills
  - Inputs: this record's Decisions and Plan; Exploration findings
  - Dependencies: AC-1 row in the same assignment
  - Output: renderCall/renderResult batch output and replay of batch details
  - Owner: thoth-worker (one writer for all rows, one assignment)
  - Writes: PKG excluding `dist/`
  - Interface boundaries: replay-compatible `details`; pi-core snapshot contract unchanged; single-action behavior unchanged; root prompts and skills untouched
  - Focused check and PASS evidence: format, envelope and replay tests for batch results pass; existing suites unchanged
  - Return milestone: package tests, `pnpm run typecheck` and `pnpm run check:ci` pass
  - Stop / reassessment: Pi host rejects the union id schema, replay/publication contract must change, or edits outside PKG are needed

- [x] AC-6: Model-facing guidance and README document batch and parallel in_progress
  - Outcome: Model-facing guidance and README document batch and parallel in_progress
  - Known entrypoints and skill paths: PKG files `tool/types.ts`, `state/state-reducer.ts`, `state/invariants.ts`, `tool/response-envelope.ts`, ENTRY, `view/format.ts`, `state/replay.ts`, `state/publish.ts`, `README.md`; tests beside each; installed `tdd` and `simplify` skills
  - Inputs: this record's Decisions and Plan; Exploration findings
  - Dependencies: AC-1..AC-5 rows
  - Output: updated description, guidelines, field descriptions and README
  - Owner: thoth-worker (one writer for all rows, one assignment)
  - Writes: PKG excluding `dist/`
  - Interface boundaries: replay-compatible `details`; pi-core snapshot contract unchanged; single-action behavior unchanged; root prompts and skills untouched
  - Focused check and PASS evidence: ENTRY-TEST passes; package text no longer says "exactly one" in_progress or "never batch"
  - Return milestone: package tests, `pnpm run typecheck` and `pnpm run check:ci` pass
  - Stop / reassessment: Pi host rejects the union id schema, replay/publication contract must change, or edits outside PKG are needed

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
Fresh Oracle plan review 2026-10-13 returned OKAY (validated); nonblocking cautions: staged-adjacency cycle check for remove/add rewiring with refs, and a real validateToolArguments regression for the batch schema.
**Implementation**: AUTHORIZED
User selected Implement on 2026-10-13 after validated plan-review OKAY.

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: b1fdd606b312d63ba74025481e43aa5cd8ec379b55b8fa73773e8160667321df

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS: AC-1–AC-6, decisions, scope boundaries and both plan-review cautions are satisfied by the reviewed diff and fresh checks.",
  "evidence": [
    {
      "id": "record",
      "kind": "integrity",
      "locator": ".thoth/changes/pi-todo-batch-ops/pi-todo-batch-ops.md",
      "claim": "Independent exact-byte prefix hashing produced b1fdd606b312d63ba74025481e43aa5cd8ec379b55b8fa73773e8160667321df. Installed validate.mjs --through verify passed without warnings or errors.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "baseline",
      "kind": "specification",
      "locator": ".thoth/specs/pi-ecosystem/spec.md:19–27",
      "claim": "The existing requirement title matches the declared MODIFIED delta. SHA-256 is 955698ce381362309186aefabd1c0dd92b218bd5780d3d9ae1f43c13fdf907d2, matching the record. The delta preserves existing lifecycle, snapshot, context and panel requirements.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "mutation",
      "kind": "code-review",
      "locator": "pi-packages/pi-todo/state/state-reducer.ts; state/batch.test.ts; test/state-events.test.ts; todo.ts",
      "claim": "Ordered reduction uses immutable task/dependency/metadata copies, returns original state on failure with indexed reasons, commits once and publishes once on success. Tests cover ten creates, rollback, 1–50 bounds, call-scoped refs in all four id fields, terminal transitions and parallel create-time statuses.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "cautions",
      "kind": "regression-review",
      "locator": "pi-packages/pi-todo/state/task-graph.ts; state/batch.test.ts; tool/batch-schema.test.ts; test/setup.ts",
      "claim": "Cycle detection now evaluates replacement staged adjacency; regression tests cover combined remove/add rewiring and atomic cycle rejection through refs. The unmocked real validateToolArguments regression preserves numeric-looking string refs in batch unions.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "presentation",
      "kind": "code-review",
      "locator": "pi-packages/pi-todo/view/format.ts; tool/response-envelope.ts; state/replay.test.ts; test/reinjection.test.ts; todo.register.test.ts",
      "claim": "Batch call counts, collapsed summaries, expanded sanitized per-op lines and results details are implemented and tested. Replay retains tasks/nextId compatibility; compaction reinjection restores parallel open tasks and resolved numeric dependencies.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "scope",
      "kind": "diff-review",
      "locator": "git diff; git diff --cached; git ls-files --others --exclude-standard",
      "claim": "All changes are confined to pi-todo and the assigned record; root prompts, skills, canonical specs and versions are untouched. No in_progress limit exists. Only the approved description expectations and pending→in_progress sanitization expectation changed among pre-existing assertions; none were otherwise weakened. Repeated fingerprints of all 16 changed/untracked files matched.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "guidance",
      "kind": "documentation-review",
      "locator": "pi-packages/pi-todo/todo.ts; tool/types.ts; README.md",
      "claim": "Model description, snippet, guidelines, field descriptions and README document atomic batches, earlier-create refs, create-time status and parallel in_progress; obsolete exactly-one and never-batch-completions guidance is removed from package guidance.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "tests",
      "kind": "execution",
      "locator": "pnpm --filter @thoth-agents/pi-todo run test",
      "claim": "Fresh independent run passed 25/25 files and 282/282 tests in 5.16 seconds. The unchanged packed-real-sdk test invokes package build, packing and offline Pi SDK 1.0.2 loading.",
      "basis": "observed",
      "uncertainty": "No timing failure occurred in this run; the worker-reported earlier timeout was not independently diagnosed."
    },
    {
      "id": "static",
      "kind": "execution",
      "locator": "pnpm run typecheck; pnpm --filter @thoth-agents/pi-todo run typecheck; pnpm run check:ci",
      "claim": "Root and package typechecks passed. check:ci passed without fixes, reporting 683 warnings and 5 informational diagnostics.",
      "basis": "observed",
      "uncertainty": ""
    }
  ],
  "verification": [
    {
      "check": "Record and canonical source integrity",
      "method": "Independent SHA-256 recomputation, baseline review and installed verify validator",
      "outcome": "pass",
      "evidenceIds": ["record", "baseline"],
      "reason": "Both expected digests match and the structural verify gate passes."
    },
    {
      "check": "AC-1 and AC-2",
      "method": "Reducer/publication review and fresh package tests",
      "outcome": "pass",
      "evidenceIds": ["mutation", "tests"],
      "reason": "Ten-task single-call success publishes once; indexed failures preserve tasks and nextId and publish nothing."
    },
    {
      "check": "AC-3 and plan-review cautions",
      "method": "Ref-resolution and staged-graph review; real host-validator regression",
      "outcome": "pass",
      "evidenceIds": ["mutation", "cautions", "tests"],
      "reason": "All reference fields, duplicate/forward/undeclared rejection, staged rewiring and numeric-looking string preservation are covered."
    },
    {
      "check": "AC-4",
      "method": "Create/status reducer review and regression tests",
      "outcome": "pass",
      "evidenceIds": ["mutation", "tests"],
      "reason": "Single and batched creates honor allowed statuses, reject deleted and allow concurrent in_progress tasks."
    },
    {
      "check": "AC-5",
      "method": "Rendering, envelope, replay and compaction reinjection review and tests",
      "outcome": "pass",
      "evidenceIds": ["presentation", "scope", "tests"],
      "reason": "Batch presentation and persistence work without weakening existing single-action assertions."
    },
    {
      "check": "AC-6 and non-goals",
      "method": "Full tracked diff and both untracked test files examined",
      "outcome": "pass",
      "evidenceIds": ["guidance", "scope"],
      "reason": "Package guidance reflects the new contract; prohibited surfaces remain unchanged."
    },
    {
      "check": "Fresh execution and packaging checks",
      "method": "Independent package suite, root/package typechecks and check:ci",
      "outcome": "pass",
      "evidenceIds": ["tests", "static"],
      "reason": "All commands passed; package build and packed SDK loading also passed within the suite."
    }
  ],
  "risks": [],
  "openQuestions": [],
  "nextAction": "Root should validate this unchanged envelope, record AC evidence and the matching digest, then run closeout before archiving.",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/pi-todo-batch-ops/pi-todo-batch-ops.md",
    "reviewedRecordSha256": "b1fdd606b312d63ba74025481e43aa5cd8ec379b55b8fa73773e8160667321df"
  }
}
```

After PASS, root pastes the Oracle's unchanged final-verification envelope here.

- AC-1: PASS | state/batch.test.ts + test/state-events.test.ts | ten-create batch with one in_progress, correct nextId, one result, one publication; 282/282 package tests
- AC-2: PASS | state/batch.test.ts rollback tests + state-events | indexed failure leaves tasks/nextId unchanged and publishes nothing
- AC-3: PASS | state/batch.test.ts ref tests + tool/batch-schema.test.ts | refs in all id fields; duplicate/undeclared/forward/self rejected; staged-adjacency cycle regression; real validateToolArguments preserves string refs
- AC-4: PASS | state/batch.test.ts create-status tests | create honors initial/in_progress/completed, rejects deleted, several in_progress allowed
- AC-5: PASS | format, replay and reinjection tests | batch call/result rendering, replay and compaction reinjection pass
- AC-6: PASS | ENTRY-TEST + diff review | description, guidelines, field descriptions and README document batch and parallel in_progress; obsolete wording removed
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:955698ce381362309186aefabd1c0dd92b218bd5780d3d9ae1f43c13fdf907d2

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
