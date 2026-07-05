# Tasks: Persist Oracle Plan Review Results

<!-- traceability: true (tasks.traceability) — every task carries [USN], Priority, Spec, Independent Test, Verification -->

## Phase 1: Test-First Guardrails

- [x] 1.1 Add SDD phase contract assertions for `plan-review` artifact production and persistence ownership before edits
  **[USN-1]** | Priority: P1
  **Spec:** `sdd-plan-review-persistence/Canonical Plan-Review Artifact`, `sdd-plan-review-persistence/Deterministic Memory Artifact for Memory-Including Modes`
  **Independent Test:** `pnpm test -- src/harness/core/sdd.test.ts` includes a new test that `plan-review` has `producesArtifact: true`, `artifactMeaning: 'oracle-plan-review-result'`, `artifactSkill: 'plan-reviewer'`, and `persistenceAgentRole: 'quick'`.
  **Verification**:
  - Run: `pnpm test -- src/harness/core/sdd.test.ts`
  - Expected: new assertions pass and fail before `sdd.ts` is updated.

- [x] 1.2 Add recovery semantics tests for canonical `plan-review.md` and stale/legacy handling in `src/sdd/artifact-governance/artifact-loader.test.ts`
  **[USN-4]** | Priority: P1
  **Spec:** `sdd-plan-review-persistence/Fresh Approval Satisfies Plan-Review Gate`, `sdd-plan-review-persistence/Stale Approval Requires Rerun`, `sdd-plan-review-persistence/Legacy Changes Are Not Approved By Default`
  **Independent Test:** Focused artifact-governance tests verify fresh `[OKAY]`, stale digest mismatch, missing legacy artifact, rejected status, and unparsable artifact behavior before implementation.
  **Verification**:
  - Run: `pnpm test -- src/sdd/artifact-governance/artifact-loader.test.ts`
  - Expected: New recovery tests fail until `artifact-loader.ts` can parse `plan-review.md`, compare reviewed artifact hashes, and fail closed for stale/missing/non-approval evidence.

- [x] 1.3 Add deterministic topic-key, OpenSpec path, and SHA-256 digest expectations in artifact loader tests
  **[USN-2]** | Priority: P1
  **Spec:** `sdd-plan-review-persistence/Deterministic Memory Artifact for Memory-Including Modes`, `sdd-plan-review-persistence/Canonical Plan-Review Artifact`, `sdd-plan-review-persistence/Reviewed Artifact Freshness`
  **Independent Test:** Extend `src/sdd/artifact-governance/artifact-loader.test.ts` with assertions for `getArtifactTopicKey`, `getArtifactOpenSpecPath`, and stable `sha256:` digest output for reviewed artifact content.
  **Verification**:
  - Run: `pnpm test -- src/sdd/artifact-governance/artifact-loader.test.ts`
  - Expected: `plan-review` resolves to `openspec/changes/{change-name}/plan-review.md` and `sdd/{change-name}/plan-review`; reviewed artifact digests are stable `sha256:` strings.

## Phase 2: Recovery Artifact and Convention Updates

- [x] 2.1 Update `src/harness/core/sdd.ts` to mark `plan-review` as producing a persisted artifact and preserve oracle read-only boundary
  **[USN-1]** | Priority: P1
  **Spec:** `sdd-plan-review-persistence/Canonical Plan-Review Artifact`, `sdd-plan-review-persistence/Deterministic Memory Artifact for Memory-Including Modes`
  **Independent Test:** Targeted verification against `sdd.ts` expectations via `src/harness/core/sdd.test.ts` before runtime behavior tests.
  **Verification**:
  - Run: `pnpm test -- src/harness/core/sdd.test.ts`
  - Expected: `plan-review` includes `producesArtifact: true`, `artifactSkill: 'plan-reviewer'`, `artifactMeaning: 'oracle-plan-review-result'`, and `persistenceAgentRole: 'quick'`, while preserving owner/handoff that implementation confirmation remains separate.

- [x] 2.2 Extend `src/sdd/artifact-governance/artifact-loader.ts` with concrete `plan-review` materialization, parsing, SHA-256 freshness, and fail-closed recovery helpers
  **[USN-3]** | Priority: P1
  **Spec:** `sdd-plan-review-persistence/Canonical Plan-Review Artifact`, `sdd-plan-review-persistence/Reviewed Artifact Freshness`, `sdd-plan-review-persistence/Fresh Approval Satisfies Plan-Review Gate`, `sdd-plan-review-persistence/Stale Approval Requires Rerun`, `sdd-plan-review-persistence/Legacy Changes Are Not Approved By Default`
  **Independent Test:** Run the artifact-loader tests from tasks 1.2 and 1.3 against only `src/sdd/artifact-governance/`.
  **Verification**:
  - Run: `pnpm test -- src/sdd/artifact-governance/artifact-loader.test.ts`
  - Expected: Helpers create/read `plan-review.md`, compute `sha256:` digests for reviewed artifacts, return a fresh approval decision only for matching `[OKAY]`, and fail closed for stale, missing, rejected, or unparsable evidence.

- [x] 2.3 Add persistence convention entries for canonical `plan-review.md` and topic-key parity in `openspec-convention`, `thoth-mem-convention`, and `persistence-contract`
  **[USN-1]** | Priority: P1
  **Spec:** `sdd-plan-review-persistence/Canonical Plan-Review Artifact`, `sdd-plan-review-persistence/Deterministic Memory Artifact for Memory-Including Modes`
  **Independent Test:** Manual schema check by reading each convention file and verifying a new canonical artifact row/topic is documented under plan-reviewer ownership.
  **Verification**:
  - Run: `pnpm test -- src/harness/writers/skill-layout.test.ts`
  - Expected: shared convention references remain consistent and new entries are present for OpenSpec path and topic key behavior.

- [x] 2.4 Update `src/skills/plan-reviewer/SKILL.md` output contract for durable review payload and boundaries
  **[USN-3]** | Priority: P1
  **Spec:** `sdd-plan-review-persistence/Reviewed Artifact Freshness`, `sdd-plan-review-persistence/Fresh Approval Satisfies Plan-Review Gate`
  **Independent Test:** Parse the SKILL file and confirm required sections for reviewed artifact set, output fields, and explicit “Oracle is read-only; persistence done by write-capable owner” language.
  **Verification**:
  - Run: `pnpm test -- src/harness/writers/skill-layout.test.ts`
  - Expected: packaged skill content includes updated plan-reviewer guidance for full vs accelerated reviewed artifacts, `[OKAY]/[REJECT]`, blocker/non-blocking notes, and override context requirements.

## Phase 3: Prompt and Documentation Wiring

- [x] 3.1 Update `src/agents/prompt-sections.ts` to surface recovery checks, deterministic fresh-vs-stale behavior, and user-override distinction
  **[USN-4]** | Priority: P1
  **Spec:** `sdd-plan-review-persistence/Fresh Approval Satisfies Plan-Review Gate`, `sdd-plan-review-persistence/Stale Approval Requires Rerun`, `sdd-plan-review-persistence/Canonical Plan-Review Artifact`
  **Independent Test:** A focused prompt-rendering test update in `src/agents/prompt-rendering.test.ts` before implementation changes asserts the updated guidance text.
  **Verification**:
  - Run: `pnpm test -- src/agents/prompt-rendering.test.ts`
  - Expected: Prompt guidance requires fresh artifact reuse and stale/legacy re-review behavior without replacing user implementation confirmation.

- [x] 3.2 Update oracle and delegation guidance in `src/agents/index.test.ts` and `src/hooks/phase-reminder/index.test.ts` snapshots for the same semantics
  **[USN-5]** | Priority: P1
  **Spec:** `sdd-plan-review-persistence/Reviewed Artifact Freshness`, `sdd-plan-review-persistence/Stale Approval Requires Rerun`
  **Independent Test:** Tests assert that prompt/hook text requires recomputation or rerun when artifact hashes change and still asks user confirmation after a fresh `[OKAY]`.
  **Verification**:
  - Run: `pnpm test -- src/agents/index.test.ts src/hooks/phase-reminder/index.test.ts`
  - Expected: Both rendered outputs mention fresh-plan-review reuse and explicit separation from user confirmation.

- [x] 3.3 Update `docs/sdd-pipeline.md` with canonical location and stale-recovery flow under plan-review
  **[USN-4]** | Priority: P2
  **Spec:** `sdd-plan-review-persistence/Fresh Approval Satisfies Plan-Review Gate`, `sdd-plan-review-persistence/Stale Approval Requires Rerun`
  **Independent Test:** Validate updated pipeline narrative via focused doc review and matching assertions in existing rendered prompts.
  **Verification**:
  - Run: `pnpm test -- src/agents/index.test.ts`
  - Expected: prompt guidance remains aligned with `docs/sdd-pipeline.md` plan-review lifecycle text.

- [x] 3.4 Update `docs/quick-reference.md` with artifact + topic-key lookup entries
  **[USN-2]** | Priority: P2
  **Spec:** `sdd-plan-review-persistence/Deterministic Memory Artifact for Memory-Including Modes`
  **Independent Test:** Confirm quick-reference includes both `openspec/changes/{change-name}/plan-review.md` and `sdd/{change-name}/plan-review` in its SDD artifact table.
  **Verification**:
  - Run: `pnpm run lint`
  - Expected: quick-reference includes the two new entries and lint passes.

## Phase 4: Parser/Recovery Verification and Focused Freshness Checks

- [x] 4.1 Run focused parser/digest/recovery tests for `src/sdd/artifact-governance/artifact-loader.ts`
  **[USN-3]** | Priority: P1
  **Spec:** `sdd-plan-review-persistence/Reviewed Artifact Freshness`, `sdd-plan-review-persistence/Stale Approval Requires Rerun`, `sdd-plan-review-persistence/Legacy Changes Are Not Approved By Default`
  **Independent Test:** Run the focused helper test file without prompt/doc tests.
  **Verification**:
  - Run: `pnpm test -- src/sdd/artifact-governance/artifact-loader.test.ts`
  - Expected: Freshness manifest, parsing, fresh approval, stale mismatch, rejected status, unparsable artifact, and missing legacy-artifact tests pass.

## Phase 5: Final Verification

- [x] 5.1 Run full prompt/contract/doc regression pass
  **[USN-4]** | Priority: P1
  **Spec:** `sdd-plan-review-persistence/Canonical Plan-Review Artifact`, `sdd-plan-review-persistence/Deterministic Memory Artifact for Memory-Including Modes`, `sdd-plan-review-persistence/Fresh Approval Satisfies Plan-Review Gate`
  **Independent Test:** Run the full contract set after all phase-targeted changes.
  **Verification**:
  - Run: `pnpm test -- src/harness/core/sdd.test.ts src/agents/index.test.ts src/agents/prompt-rendering.test.ts src/hooks/phase-reminder/index.test.ts src/harness/writers/skill-layout.test.ts src/sdd/artifact-governance/artifact-loader.test.ts`
  - Expected: targeted tests all pass and recover/review semantics are consistent in prompts and contracts.

- [x] 5.2 Run repository quality gates
  **[USN-1]** | Priority: P1
  **Spec:** `sdd-plan-review-persistence/Canonical Plan-Review Artifact`
  **Independent Test:** Run standard checks after all modifications.
  **Verification**:
  - Run: `pnpm run lint && pnpm run typecheck`
  - Expected: zero lint/type issues from updated TypeScript and Markdown-facing content.

- [x] 5.3 Run build and suite as final closeout
  **[USN-1]** | Priority: P1
  **Spec:** `sdd-plan-review-persistence/Legacy Changes Are Not Approved By Default`
  **Independent Test:** Final pipeline verification sequence used for production readiness.
  **Verification**:
  - Run: `pnpm run build && pnpm test`
  - Expected: build completes and all tests pass (legacy and new workflows remain regression-safe).
