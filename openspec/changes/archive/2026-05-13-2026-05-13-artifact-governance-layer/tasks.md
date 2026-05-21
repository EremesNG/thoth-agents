# Tasks: Add Artifact Governance Layer for SDD Artifacts

## Phase 1: Governance Contract Foundations
- [x] 1.1 Define the artifact governance domain contract, including the `error` / `warning` / `info` severity model checkpoint and normalized result types — `src/sdd/artifact-governance/types.ts`, `src/sdd/artifact-governance/types.test.ts`
  **Verification**:
  - Run: `bun test src/sdd/artifact-governance/types.test.ts`
  - Expected: Severity classification, report-only defaults, and validator result shape assertions pass

- [x] 1.2 Implement mode-aware artifact snapshot loading and comparison, including the source-of-truth-by-mode checkpoint for `none`, `thoth-mem`, `openspec`, and `hybrid` — `src/sdd/artifact-governance/artifact-loader.ts`, `src/sdd/artifact-governance/artifact-loader.test.ts`
  **Verification**:
  - Run: `bun test src/sdd/artifact-governance/artifact-loader.test.ts`
  - Expected: Loader tests confirm mode-specific reads, hybrid comparison metadata, and warning-first handling for recoverable divergence

## Phase 2: Tasks Validation MVP
- [x] 2.1 Implement the read-only `tasks.md` validator for execution-critical structure: phase headers, allowed task states, numbered checklist items, and required `Verification` blocks with `Run` / `Expected` — `src/sdd/artifact-governance/tasks-validator.ts`, `src/sdd/artifact-governance/tasks-validator.test.ts`
  **Verification**:
  - Run: `bun test src/sdd/artifact-governance/tasks-validator.test.ts`
  - Expected: Validator tests pass for valid task plans and fail with the expected findings for missing states, malformed numbering, or incomplete verification blocks

- [x] 2.2 Extend the validator with persistence findings so unrecoverable source gaps become `error` while repairable hybrid divergence and non-blocking contract drift stay `warning` / `info`, preserving the initial non-enforcement checkpoint — `src/sdd/artifact-governance/tasks-validator.ts`, `src/sdd/artifact-governance/tasks-validator.test.ts`
  **Verification**:
  - Run: `bun test src/sdd/artifact-governance/tasks-validator.test.ts`
  - Expected: Tests prove execution-blocking conditions are raised as errors and recoverable hybrid divergence remains warning-first in report-only mode

## Phase 3: Delegate-First Integration Boundaries
- [x] 3.1 Add the validator placement checkpoint by documenting the post-`sdd-tasks` handoff, future pre-`sdd-apply` entrypoint, and non-overlap with `plan-reviewer` / `executing-plans` — `src/skills/_shared/persistence-contract.md`, `src/skills/sdd-tasks/SKILL.md`, `src/skills/executing-plans/SKILL.md`, `src/skills/plan-reviewer/SKILL.md`
  **Verification**:
  - Run: `bun run check:ci`
  - Expected: Markdown and repository-wide Biome checks pass with the new governance guidance and no conflicting workflow language

- [x] 3.2 Wire report-only orchestration guidance so validation findings can be surfaced after task generation and before execution preparation without breaking delegate-first ownership or root thoth-mem boundaries — `src/agents/orchestrator.ts`, `src/agents/index.test.ts`
  **Verification**:
  - Run: `bun test src/agents/index.test.ts`
  - Expected: Orchestrator prompt tests confirm validator placement, report-only behavior, and preserved ownership / plan-reviewer boundaries

## Phase 4: Integration Proof and Regression Safety
- [x] 4.1 Export the governance layer for later reuse and add focused regression coverage across the new validator surface — `src/sdd/artifact-governance/index.ts`, `src/sdd/artifact-governance/tasks-validator.test.ts`, `src/sdd/artifact-governance/artifact-loader.test.ts`, `src/sdd/artifact-governance/types.test.ts`
  **Verification**:
  - Run: `bun test src/sdd/artifact-governance/types.test.ts src/sdd/artifact-governance/artifact-loader.test.ts src/sdd/artifact-governance/tasks-validator.test.ts`
  - Expected: All artifact-governance focused tests pass without relying on build-time execution

- [x] 4.2 Run the smallest sufficient final verification for the MVP implementation without building — `src/sdd/artifact-governance/`, `src/agents/orchestrator.ts`, `src/skills/_shared/persistence-contract.md`, `src/skills/sdd-tasks/SKILL.md`, `src/skills/executing-plans/SKILL.md`, `src/skills/plan-reviewer/SKILL.md`
  **Verification**:
  - Run: `bun run typecheck && bun test src/sdd/artifact-governance/types.test.ts src/sdd/artifact-governance/artifact-loader.test.ts src/sdd/artifact-governance/tasks-validator.test.ts src/agents/index.test.ts && bun run check:ci`
  - Expected: TypeScript, focused tests, and Biome checks all pass with no build step required
