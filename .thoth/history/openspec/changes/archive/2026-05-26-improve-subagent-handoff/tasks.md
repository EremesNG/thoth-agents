# Tasks: Improve Subagent Handoff

## Phase 1: Focused Test Coverage
- [x] 1.1 Add prompt rendering tests for root handoff-as-compaction and subagent parent-scoped recall - `src/agents/prompt-rendering.test.ts`
  **Verification**:
  - Run: `pnpm test -- src/agents/prompt-rendering.test.ts`
  - Expected: New tests cover root-owned summary refresh, prompt-body exclusion, handoff recovery instructions, parent `session_id`/project requirements, 3-layer recall, and prompt/session tool prohibitions; before implementation, failures are limited to the newly specified wording.

- [x] 1.2 Add generated agent prompt tests for OpenCode role configs - `src/agents/index.test.ts`
  **Verification**:
  - Run: `pnpm test -- src/agents/index.test.ts`
  - Expected: New tests assert read-only and write-capable generated agent prompts preserve memory ownership, parent-scoped recall, deterministic SDD artifact save rules, and no subagent prompt-saving ownership.

- [x] 1.3 Add Codex and OpenCode adapter tests for harness-specific delivery semantics - `src/harness/adapters/codex.test.ts`, `src/harness/adapters/opencode.test.ts`
  **Verification**:
  - Run: `pnpm test -- src/harness/adapters/codex.test.ts src/harness/adapters/opencode.test.ts`
  - Expected: Codex tests assert `multi_agent_v1.spawn_agent` `message` contains task instructions plus handoff retrieval instructions, the handoff body is absent from `message` and `items`, no simultaneous `message` and `items` for the same handoff, `items` reserved for required attachments or mentions, omitted/false `fork_context`, and instruction-level enforcement disclosure; OpenCode tests assert shared handoff semantics appear without Codex-only tool names.

- [x] 1.4 Add memory governance and skill packaging coverage where changed text is locked - `src/harness/core/memory-governance.test.ts`, `src/harness/writers/skill-layout.test.ts`
  **Verification**:
  - Run: `pnpm test -- src/harness/core/memory-governance.test.ts src/harness/writers/skill-layout.test.ts`
  - Expected: Tests cover any changed memory-governance diagnostic text and packaged skill layout affected by thoth-mem handoff wording; if no implementation text changes are needed in either area, record that no test change is required for that file.

## Phase 2: Shared Prompt and Governance Implementation
- [x] 2.1 Extend root handoff summary and dispatch guidance - `src/agents/prompt-sections.ts`
  **Verification**:
  - Run: `pnpm test -- src/agents/prompt-rendering.test.ts src/agents/index.test.ts`
  - Expected: Root prompt tests pass for handoff-as-compaction, root-owned `mem_session_summary` refresh, handoff body exclusion from delegation prompts, task instructions, recovery instructions, parent identity, persistence mode, memory permissions, non-goals, escalation conditions, and secret/raw-context redaction guidance.

- [x] 2.2 Strengthen subagent memory rules for parent-scoped recall and delegated writes - `src/agents/prompt-sections.ts`
  **Verification**:
  - Run: `pnpm test -- src/agents/prompt-rendering.test.ts src/agents/index.test.ts`
  - Expected: Read-only and write-capable subagent prompt tests pass for `mem_search` -> `mem_timeline` -> `mem_get_observation`, missing-parent prohibition, stale/contradictory recall reporting, project-scoped read-tool limits, deterministic `sdd/{change}/{artifact}` saves, and no session or prompt tools.

- [x] 2.3 Conditionally refine governance diagnostics if prompt tests expose wording gaps - `src/harness/core/memory-governance.ts`
  **Verification**:
  - Run: `pnpm test -- src/harness/core/memory-governance.test.ts`
  - Expected: Existing role matrix and capability model remain unchanged; any updated diagnostic text accurately describes parent-scoped recall, delegated deterministic SDD writes, project-scoped read-tool permission, and instruction-level enforcement limits.

## Phase 3: Harness Adapter and Skill Documentation
- [x] 3.1 Refine Codex handoff delivery guidance - `src/harness/adapters/codex.ts`
  **Verification**:
  - Run: `pnpm test -- src/harness/adapters/codex.test.ts`
  - Expected: Codex adapter tests pass for passing task instructions plus handoff retrieval instructions in `message`, excluding the handoff body from `message` and `items`, reserving `items` for required structured attachments or mentions, not using both for the same handoff, keeping `fork_context` omitted or false by default, and disclosing instruction-level memory/permission enforcement gaps.

- [x] 3.2 Confirm OpenCode inherits shared semantics without Codex-only wording - `src/harness/adapters/opencode.ts`
  **Verification**:
  - Run: `pnpm test -- src/harness/adapters/opencode.test.ts`
  - Expected: OpenCode adapter tests pass with shared root, subagent, thoth-mem, and SDD governance semantics present; `multi_agent_v1.spawn_agent`, `message`, `items`, and Codex-only dispatch wording are absent from OpenCode output.

- [x] 3.3 Update thoth-mem agent skill documentation for handoff-as-compaction - `src/skills/thoth-mem-agents/SKILL.md`
  **Verification**:
  - Run: `pnpm test -- src/harness/writers/skill-layout.test.ts`
  - Expected: Packaged skill layout remains valid and the skill documents root-owned summary refresh, recovery instructions instead of prompt-embedded handoff bodies, parent-scoped recall, prompt-save prohibition, deterministic SDD artifact saves, and instruction-level enforcement reporting.

- [x] 3.4 Update shared persistence and thoth-mem conventions for delegated SDD handoffs - `src/skills/_shared/persistence-contract.md`, `src/skills/_shared/thoth-mem-convention.md`, `src/skills/_shared/openspec-convention.md`
  **Verification**:
  - Run: `pnpm test -- src/harness/writers/skill-layout.test.ts`
  - Expected: Shared skill references remain packageable; hybrid artifact recovery, parent `session_id`/project requirements, and delegated deterministic SDD `mem_save` rules are documented without changing canonical OpenSpec paths or SDD topic-key formats.

## Phase 4: Integrated Verification
- [x] 4.1 Run the focused prompt, adapter, governance, and packaging test set - prompt and harness areas
  **Verification**:
  - Run: `pnpm test -- src/agents/prompt-rendering.test.ts src/agents/index.test.ts src/harness/adapters/codex.test.ts src/harness/adapters/opencode.test.ts src/harness/core/memory-governance.test.ts src/harness/writers/skill-layout.test.ts`
  - Expected: All focused tests pass and cover every scenario in `openspec/changes/improve-subagent-handoff/specs/multi-harness-agent-pack/spec.md`.

- [x] 4.2 Run TypeScript validation - all TypeScript sources
  **Verification**:
  - Run: `pnpm run typecheck`
  - Expected: TypeScript completes with no errors.

- [x] 4.3 Run CI-style static checks before review - repository
  **Verification**:
  - Run: `pnpm run check:ci`
  - Expected: Biome reports no formatting or lint violations.

- [x] 4.4 Run the full test suite after focused tests pass - repository
  **Verification**:
  - Run: `pnpm test`
  - Expected: The complete Vitest suite passes.
