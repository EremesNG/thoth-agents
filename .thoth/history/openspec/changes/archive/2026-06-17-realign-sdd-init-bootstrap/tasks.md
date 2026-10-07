# Tasks: Realign sdd-init for idempotent bootstrap backfill

> **Pipeline**: accelerated | **Traceability**: enabled (`config.yaml rules.tasks.traceability: true`) | **TDD ordering**: disabled (`tdd: false`)
>
> **Open questions (flagged for plan-review gate)**
>
> - **OQ-1 — Condition / guidance wording**: The exact widened string for `sdd.ts:87` `condition` and `prompt-sections.ts:361` dispatch guidance is not fixed. Both fields are asserted by exact-string tests (`sdd.test.ts:85-90` via `toMatchObject`, `index.test.ts:340` via `toContain('dispatch sdd-init first')`). Tasks 3.1, 3.2, and 4.1 must synchronize on the same chosen wording. Recommended approach: widen condition to `"Only when OpenSpec persistence is selected and openspec/ is missing or stale (partial structure or missing mechanism sections)."` and widen guidance to `"If openspec persistence is selected and openspec/ is missing or stale, dispatch sdd-init first."` — but the implementer must confirm the exact string is reflected in all three places together.
> - **OQ-2 — SKILL.md semantic anchor**: The `sdd-init` skill-layout test (`skill-layout.test.ts:28`) asserts anchors `'Bootstrap OpenSpec structure'` and `'Persistence Mode'` only. If the realignment path is written under a new heading that the test does not currently expect, `skill-layout.test.ts` must be updated (task 4.3). If the realignment content is merged under existing headings, `skill-layout.test.ts` needs no change. Implementer must decide while authoring Phase A and flag the result before Phase D begins.

---

## Phase A — Skill backfill mechanics (HOW)

- [x] A.1 Add idempotent realignment path to `src/skills/sdd-init/SKILL.md` — reachable from existing-openspec branch (step 5)
  **[USN-1]** | Priority: P1
  **Spec:** `sdd-init/Additive idempotent backfill`
  **Independent Test:** Read the updated SKILL.md and confirm step 5 no longer dead-ends at "report and ask" but instead describes the backfill computation path. No tooled check needed; this is a prose skill.
  **Details**:
  - Replace step 5's "report what exists and ask; do not overwrite" terminal with a branching step: if all paths and mechanism sections are fully present → report no-op and return; else → proceed to backfill computation (step 5a).
  - Add step 5a: compute per-piece absent set: missing `openspec/specs/`, missing `openspec/changes/`, missing `config.yaml` mechanism sections (`constitution`, `consistency`, `requirements_quality`, `clarification`, `handoffs`), missing `tasks.traceability`/`verify` toggles, missing `openspec/memory/constitution.md`.
  - Add step 5b: for each absent piece, additively create or merge only that piece using the canonical shapes already defined in step 7 / 7a. Never rewrite a value that is already present. Never renumber or recreate an existing `constitution.md`.
  - Add step 5c: report exactly what was added (list each piece); if nothing was absent, report a no-op.
  - Ensure steps 6, 7, 7a remain for the greenfield (missing-openspec) path and are NOT modified.
  **Verification**:
  - Run: `pnpm run typecheck`
  - Expected: No TypeScript errors (SKILL.md is prose; typecheck runs the TS project and confirms no imports reference invalid paths).

- [x] A.2 Update `src/skills/sdd-init/SKILL.md` Rules section to express idempotency contract
  **[USN-1]** | Priority: P1
  **Spec:** `sdd-init/Additive idempotent backfill`
  **Independent Test:** Confirm Rules section states the three invariants: (a) additive-only, never overwrite present values; (b) existing `constitution.md` never renumbered/recreated; (c) fully-aligned re-run is a reported no-op.
  **Verification**:
  - Run: `pnpm run lint`
  - Expected: No lint errors (confirms file is valid Markdown without broken prose patterns the linter catches).

- [x] A.3 Update `src/skills/sdd-init/SKILL.md` "When to Use" section to include existing-but-stale openspec
  **[USN-1]** | Priority: P1
  **Spec:** `sdd-init/Dispatch gate alignment (WHEN)`
  **Independent Test:** Confirm "When to Use" lists `openspec/` is not initialized OR `openspec/` exists but is missing mechanism sections or constitution.
  **Verification**:
  - Run: `pnpm run lint`
  - Expected: No lint errors.

---

## Phase B — Convention docs

- [x] B.1 Document `config.yaml` mechanism-section backfill idempotency in `src/skills/_shared/openspec-convention.md`
  **[USN-2]** | Priority: P1
  **Spec:** `sdd-init/Shared convention documentation`
  **Independent Test:** Confirm the Constitution Governance section (around lines 178-181) is followed by or adjacent to a new paragraph documenting `config.yaml` additive-merge: absent sections are created with canonical defaults; existing values are preserved; re-running on a fully-aligned project is a no-op.
  **Details**:
  - Insert under a subheading such as `### config.yaml mechanism-section backfill` adjacent to Constitution Governance.
  - State: MUST NOT overwrite present values; MUST detect per-section absence; MUST report additions; idempotent on fully-aligned projects.
  **Verification**:
  - Run: `pnpm run lint`
  - Expected: No lint errors in convention file.

- [x] B.2 Update pre-flight rule in `src/skills/_shared/openspec-convention.md` (lines 34-36) to cover partial/stale openspec
  **[USN-2]** | Priority: P1
  **Spec:** `sdd-init/Shared convention documentation`
  **Independent Test:** Confirm the pre-flight block (currently "If any required item is missing → STOP and recommend sdd-init") is updated to also cover stale/partial state (missing mechanism sections or constitution.md) as a second trigger for recommending sdd-init.
  **Verification**:
  - Run: `pnpm run lint`
  - Expected: No lint errors.

---

## Phase C — Dispatch / gate alignment (WHEN)

> **Note**: Tasks C.1, C.2, and C.3 share the wording chosen in OQ-1. Implement all three in the same edit session before running Phase D tests to avoid partial-update test failures.

- [x] C.1 Widen `src/harness/core/sdd.ts` init-phase `condition` (line 87) to include stale/partial openspec
  **[USN-3]** | Priority: P1
  **Spec:** `sdd-init/Dispatch gate alignment (WHEN)`
  **Independent Test:** Read the updated line 87 and confirm it mentions both missing AND stale/partial openspec while retaining the missing-openspec trigger.
  **Details**:
  - Current: `'Only when OpenSpec persistence is selected and openspec/ is missing.'`
  - Target (resolve OQ-1 before committing): must include stale/partial trigger. Candidate: `'Only when OpenSpec persistence is selected and openspec/ is missing or stale (partial structure or missing mechanism sections).'`
  - This string is asserted in `sdd.test.ts:85-90` via `toMatchObject` — must update test in task D.1 first or in the same atomic change.
  **Verification**:
  - Run: `pnpm run typecheck`
  - Expected: No TypeScript errors — confirms the string assignment compiles correctly in its typed context.

- [x] C.2 Widen `src/agents/prompt-sections.ts` dispatch guidance (line 361) to trigger on stale/partial openspec
  **[USN-3]** | Priority: P1
  **Spec:** `sdd-init/Dispatch gate alignment (WHEN)`
  **Independent Test:** Read line 361 and confirm it mentions stale/partial openspec in addition to missing openspec while preserving "dispatch sdd-init first" (substring asserted by `index.test.ts:340`).
  **Details**:
  - Current: `'If openspec persistence is selected and openspec/ is missing, dispatch sdd-init first.'`
  - Target: widen to include stale/partial; `toContain('dispatch sdd-init first')` assertion in `index.test.ts:340` will still pass as long as the substring is preserved.
  **Verification**:
  - Run: `pnpm run typecheck`
  - Expected: No TypeScript errors.

- [x] C.3 Widen `src/skills/requirements-interview/SKILL.md` init-recommendation gate (lines 186-189) to cover stale/partial openspec
  **[USN-3]** | Priority: P1
  **Spec:** `sdd-init/Dispatch gate alignment (WHEN)`
  **Independent Test:** Confirm lines 186-189 now recommend `sdd-init` when `openspec/` is not initialized OR when it is partial/stale, not only when fully absent.
  **Verification**:
  - Run: `pnpm run lint`
  - Expected: No lint errors.

---

## Phase D — Tests

- [x] D.1 Update `src/harness/core/sdd.test.ts` init-phase condition assertion to match widened string from C.1
  **[USN-3]** | Priority: P1
  **Spec:** `sdd-init/Dispatch gate alignment (WHEN)#condition-test`
  **Independent Test:** Run only the sdd.test.ts file; the init-phase condition assertion passes.
  **Details**:
  - The `toMatchObject` at lines 85-90 asserts `condition` field value. Update expected string to exactly match the new condition from C.1. This is a synchronized update — C.1 and D.1 must agree on wording.
  **Verification**:
  - Run: `pnpm test -- src/harness/core/sdd.test.ts`
  - Expected: All tests in sdd.test.ts pass, including the init-phase condition assertion.

- [x] D.2 Verify `src/agents/index.test.ts` dispatch guidance assertion (line 340) still passes after C.2
  **[USN-3]** | Priority: P1
  **Spec:** `sdd-init/Dispatch gate alignment (WHEN)#dispatch-test`
  **Independent Test:** Run only index.test.ts; the `toContain('dispatch sdd-init first')` at line 340 passes.
  **Details**:
  - If C.2's new wording preserves `'dispatch sdd-init first'` as a substring, no test change is needed. If the substring was accidentally broken, fix the wording in C.2 to preserve it. Do NOT weaken the test assertion.
  **Verification**:
  - Run: `pnpm test -- src/agents/index.test.ts`
  - Expected: All tests in index.test.ts pass, including the dispatch sdd-init assertion at line 340.

- [x] D.3 Resolve OQ-2 and conditionally update `src/harness/writers/skill-layout.test.ts`
  **[USN-1]** | Priority: P2
  **Spec:** `sdd-init/Additive idempotent backfill#anchor-decision`
  **Independent Test:** Run skill-layout.test.ts in isolation; the sdd-init anchor assertions pass.
  **Details**:
  - If the realignment path in A.1 was written under a new top-level heading that does NOT match `'Bootstrap OpenSpec structure'` or `'Persistence Mode'` (the existing anchors at `skill-layout.test.ts:28`), add the new heading to the `SDD_SEMANTIC_ANCHORS['sdd-init']` array.
  - If the content was merged under existing headings, no change is needed here. Record the decision as a comment or in the PR.
  - Do NOT remove existing anchors.
  **Verification**:
  - Run: `pnpm test -- src/harness/writers/skill-layout.test.ts`
  - Expected: All tests in skill-layout.test.ts pass.

- [x] D.4 Add idempotency and backfill behavior coverage to `src/harness/core/sdd.test.ts` (or a co-located test file)
  **[USN-1]** | Priority: P2
  **Spec:** `sdd-init/Additive idempotent backfill#idempotency-test`
  **Independent Test:** New tests are red before A.1-A.2 edits are applied; green after.
  **Details**:
  - Add a test asserting the init-phase `condition` contains both the missing-openspec trigger and the stale/partial trigger.
  - If the `getSddPhase('init')` return value carries any field encoding the backfill/idempotency semantics, assert that field as well.
  - Note: skills ship as raw markdown; there is no runtime function to unit-test the backfill algorithm itself. The test coverage here is limited to the typed harness values (condition, artifactSkill, defaultAgentRole) and the string fields that flow from the harness into prompt text.
  **Verification**:
  - Run: `pnpm test -- src/harness/core/sdd.test.ts`
  - Expected: All tests including the new idempotency/backfill assertions pass.

- [x] D.5 Confirm `src/cli/custom-skills.test.ts` and `src/harness/core/skills.test.ts` are unaffected (or update if a skill description changed)
  **[USN-1]** | Priority: P2
  **Spec:** `sdd-init/Additive idempotent backfill#description-test`
  **Independent Test:** Run both test files; no new failures.
  **Details**:
  - The sdd-init SKILL.md frontmatter `description` field is `"Bootstrap OpenSpec structure and SDD context for a project."` If A.3 changes this description, update the corresponding assertion in `skills.test.ts:118-121` and `custom-skills.test.ts:85-92`.
  - If the description is unchanged (most likely), these files need no edit. Confirm by running them.
  **Verification**:
  - Run: `pnpm test -- src/cli/custom-skills.test.ts src/harness/core/skills.test.ts`
  - Expected: All tests pass with no changes, OR changes are minimal and consistent with the updated description.

---

## Phase E — Verification

- [x] E.1 Run lint across all modified files
  **[USN-1]** | Priority: P1
  **Spec:** `sdd-init/Success Criteria#6`
  **Independent Test:** Lint passes on the six modified source paths.
  **Verification**:
  - Run: `pnpm run lint`
  - Expected: Zero lint errors or warnings from `src/skills/sdd-init/SKILL.md`, `src/skills/_shared/openspec-convention.md`, `src/skills/requirements-interview/SKILL.md`, `src/harness/core/sdd.ts`, `src/agents/prompt-sections.ts`, and affected test files.

- [x] E.2 Run typecheck across the full project
  **[USN-1]** | Priority: P1
  **Spec:** `sdd-init/Success Criteria#6`
  **Independent Test:** `tsc --noEmit` exits clean.
  **Verification**:
  - Run: `pnpm run typecheck`
  - Expected: No TypeScript errors — confirms `sdd.ts` and `prompt-sections.ts` string changes do not break surrounding typed contexts.

- [x] E.3 Run focused test suite on all affected test files
  **[USN-1]** | Priority: P1
  **Spec:** `sdd-init/Success Criteria#6`
  **Independent Test:** All four affected test files pass in one combined run.
  **Verification**:
  - Run: `pnpm test -- src/harness/core/sdd.test.ts src/agents/index.test.ts src/harness/writers/skill-layout.test.ts src/cli/custom-skills.test.ts src/harness/core/skills.test.ts`
  - Expected: All tests pass; no regressions on pre-existing assertions.

- [x] E.4 Run full build to confirm no bundle-time errors
  **[USN-1]** | Priority: P2
  **Spec:** `sdd-init/Success Criteria#6`
  **Independent Test:** `pnpm run build` exits 0.
  **Verification**:
  - Run: `pnpm run build`
  - Expected: Build completes without errors; `dist/` is produced. Run only after E.1–E.3 are clean to avoid redundant build cycles.
