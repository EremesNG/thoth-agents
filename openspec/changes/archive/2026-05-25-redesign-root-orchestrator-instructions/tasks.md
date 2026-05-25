# Tasks: Redesign Root Orchestrator Instructions

## Phase 1: Prompt Contract Foundation
- [x] 1.1 Rewrite root/orchestrator semantic sections — `src/agents/prompt-sections.ts`
  **Verification**:
  - Run: `pnpm test -- src/agents/prompt-rendering.test.ts`
  - Expected: Root prompt tests confirm bounded direct inspection, delegation economics, epistemic rigor, SDD governance, memory ownership, and role roster preservation.

- [x] 1.2 Keep harness dialect boundaries intact — `src/agents/prompt-dialects.ts`
  **Verification**:
  - Run: `pnpm test -- src/agents/prompt-rendering.test.ts`
  - Expected: OpenCode prompts contain OpenCode tool terms, Codex prompts contain Codex tool terms, and shared semantic policy does not leak harness-only wording.

## Phase 2: Codex Root Integration
- [x] 2.1 Validate Codex root overlay still composes the redesigned root contract — `src/harness/adapters/codex.ts`
  **Verification**:
  - Run: `pnpm test -- src/harness/adapters/codex.test.ts`
  - Expected: `renderCodexRootInstructions()` includes the redesigned root guidance inside the managed block and preserves Codex runtime, memory, and capability-gap wording.

- [x] 2.2 Update Codex install expectations for generated root instructions — `src/cli/codex-install.test.ts`
  **Verification**:
  - Run: `pnpm test -- src/cli/codex-install.test.ts`
  - Expected: Codex install tests confirm `~/.codex/AGENTS.md` preserves user content and includes the redesigned root contract without generating an orchestrator TOML.

## Phase 3: Behavioral Coverage
- [x] 3.1 Add focused assertions for epistemic rigor and reference synthesis — `src/agents/prompt-rendering.test.ts`
  **Verification**:
  - Run: `pnpm test -- src/agents/prompt-rendering.test.ts`
  - Expected: Tests fail if prompts stop requiring claim verification, evidence-led correction, alternatives with tradeoffs, or avoidance of reference repo/role leakage.

- [x] 3.2 Add focused assertions for bounded delegation policy — `src/agents/prompt-rendering.test.ts`
  **Verification**:
  - Run: `pnpm test -- src/agents/prompt-rendering.test.ts`
  - Expected: Tests fail if root prompts forbid all direct checks or allow broad root discovery/implementation without delegation.

## Phase 4: Verification
- [x] 4.1 Run focused multi-surface regression tests — prompt and Codex surfaces
  **Verification**:
  - Run: `pnpm test -- src/agents/prompt-rendering.test.ts src/harness/adapters/codex.test.ts src/cli/codex-install.test.ts`
  - Expected: All focused Vitest suites pass.

- [x] 4.2 Run TypeScript contract verification if dialect or exported types changed — TypeScript project
  **Verification**:
  - Run: `pnpm run typecheck`
  - Expected: No TypeScript errors when shared prompt contracts or dialect types are changed; skip with note if only prose/tests changed.

- [x] 4.3 Run build only if rendering outputs or exports changed materially — package build
  **Verification**:
  - Run: `pnpm run build`
  - Expected: Build, declarations, and schema generation complete successfully when generated artifacts, exports, or package rendering behavior changed; skip with note otherwise.
