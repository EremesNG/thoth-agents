# Tasks: Expose Subagent Memory Context Tools

## Phase 1: Test-First Guardrails
- [x] 1.1 Add/extend subagent prompt-generation tests for bounded context tools in both read-only and write-capable roles — `src/agents/index.test.ts`, `src/agents/prompt-rendering.test.ts`
  **Verification**:
  - Run: `pnpm test -- src/agents/index.test.ts src/agents/prompt-rendering.test.ts`
  - Expected: Tests fail before implementation and explicitly require `mem_context`, `mem_project_summary`, `mem_project_graph`, and `mem_topic_keys` to be present only under parent-scoped/dispatch-scoped constraints while preserving 3-layer recall primacy.

- [x] 1.2 Add/extend memory-governance model tests for consistent tool matrices and prohibitions — `src/harness/core/memory-governance.test.ts`
  **Verification**:
  - Run: `pnpm test -- src/harness/core/memory-governance.test.ts`
  - Expected: Tests fail before implementation for missing/incorrect modeling of the four context tools; root-owned prohibitions for `mem_session_start`, `mem_session_summary`, and `mem_save_prompt` remain mandatory.

- [x] 1.3 Add/extend skill packaging/install tests to lock updated thoth-mem-agents wording distribution — `src/harness/writers/skill-layout.test.ts`, `src/cli/custom-skills.test.ts`
  **Verification**:
  - Run: `pnpm test -- src/harness/writers/skill-layout.test.ts src/cli/custom-skills.test.ts`
  - Expected: Tests fail before implementation if packaged/installable skill content does not include bounded availability of the four tools with clear parent-session/project constraints.

## Phase 2: Prompt and Governance Implementation
- [x] 2.1 Update subagent prompt rule generation to explicitly include bounded context-tool usage — `src/agents/prompt-sections.ts`
  **Verification**:
  - Run: `pnpm test -- src/agents/index.test.ts src/agents/prompt-rendering.test.ts`
  - Expected: Prompt tests pass with explicit mention of `mem_context`, `mem_project_summary`, `mem_project_graph`, and `mem_topic_keys`; guidance still requires 3-layer recall first and reports missing/stale/contradictory context.

- [x] 2.2 Update memory-governance model/rules to represent the same tool contract consistently — `src/harness/core/memory-governance.ts`
  **Verification**:
  - Run: `pnpm test -- src/harness/core/memory-governance.test.ts`
  - Expected: Governance tests pass with aligned role/tool contracts, bounded project/session context language, and unchanged root-owned session tool boundaries.

## Phase 3: Skill and Spec Alignment
- [x] 3.1 Update `thoth-mem-agents` skill wording to keep 3-layer recall canonical while allowing bounded context-tool use — `src/skills/thoth-mem-agents/SKILL.md`
  **Verification**:
  - Run: `pnpm test -- src/harness/writers/skill-layout.test.ts src/cli/custom-skills.test.ts`
  - Expected: Skill packaging/install tests pass and wording reflects: 3-layer recall as primary, four context tools available only under explicit parent session/project dispatch constraints.

- [x] 3.2 Inspect canonical OpenSpec requirements and align updated governance wording only if drift is confirmed — `openspec/specs/multi-harness-agent-pack/spec.md`, `openspec/specs/skill-instructions/spec.md`
  **Verification**:
  - Run: `pnpm test -- src/harness/core/memory-governance.test.ts src/harness/writers/skill-layout.test.ts`
  - Expected: Specs were explicitly inspected; no spec-to-implementation wording drift remains for bounded context tools, instruction-level enforcement disclosures, and root-owned session-tool prohibitions.

## Phase 4: Focused and Full Validation
- [x] 4.1 Run focused regression set for prompts, governance, and skill packaging — targeted files above
  **Verification**:
  - Run: `pnpm test -- src/agents/index.test.ts src/agents/prompt-rendering.test.ts src/harness/core/memory-governance.test.ts src/harness/writers/skill-layout.test.ts src/cli/custom-skills.test.ts`
  - Expected: All targeted tests pass and cover the new bounded-context-tool contract end-to-end.

- [x] 4.2 Run static/type validation for repository consistency — all TypeScript sources
  **Verification**:
  - Run: `pnpm run typecheck && pnpm run lint`
  - Expected: Zero TypeScript errors and zero lint violations.

- [x] 4.3 Run build and full suite after focused checks pass — repository
  **Verification**:
  - Run: `pnpm run build && pnpm test`
  - Expected: Build succeeds and full Vitest suite passes without regressions.
