# Tasks: Align thoth-mem Tool Surface Guidance

## Phase 1: Governance contract
- [ ] 1.1 Replace the memory governance surface with the six-tool union, operation descriptors, and root-owned operation constants in `src/harness/core/memory-governance.ts`.
  **Verification**:
  - Run: `pnpm run typecheck`
  - Expected: `MemoryToolName`, `MemSaveKind`, `MemSessionAction`, `MemRecallMode`, `MemProjectAction`, `MemoryOperation`, `RootOwnedMemoryOperation`, `ROOT_OWNED_OPERATIONS`, `READ_RECALL_CHAIN`, `PARENT_SCOPED_READ_TOOLS`, `WRITE_CAPABLE_DELEGATED_TOOLS`, and `ALL_MEMORY_TOOLS` compile cleanly.

- [ ] 1.2 Update `roleAllowedTools()`, `roleRules()`, and governance diagnostics in `src/harness/core/memory-governance.ts` to use operation-aware root ownership, parent-scoped reads, and role-specific write limits.
  **Verification**:
  - Run: `pnpm run typecheck`
  - Expected: orchestrator and subagent rules render the new permission split and the file typechecks without stale tool names.

## Phase 2: Rendered prompts
- [ ] 2.1 Rewrite the `<session-bootstrap>`, `<internal-handoff>`, `<progress-memory>`, and `renderSubagentRules()` blocks in `src/agents/prompt-sections.ts` to use the step-0 bootstrap, root-owned compaction, recall funnel, and capability guidance.
  **Verification**:
  - Run: `pnpm run typecheck`
  - Expected: the prompt renderer emits `mem_session(action="start")`, `mem_save(kind="prompt")`, `mem_session(action="summary")` / `mem_save(kind="session_summary")`, the compact/context/get recall funnel, and the bounded `mem_context`/`mem_project` guidance.

- [ ] 2.2 Update `src/harness/adapters/codex.ts` so Codex root instructions and internal handoff guidance carry the same bootstrap, handoff, and recovery wording as the core prompt sections.
  **Verification**:
  - Run: `pnpm run typecheck`
  - Expected: Codex prompt rendering preserves the enforcement-gap caveat while matching the canonical memory bootstrap, handoff, and recovery funnel.

## Phase 3: Hooks
- [ ] 3.1 Update `src/hooks/thoth-mem/protocol.ts` to render the six-tool core list, the compact/context/get recall funnel, `mem_context(recall_query=...)`, and `mem_session(action="summary")` compaction guidance.
  **Verification**:
  - Run: `pnpm run typecheck`
  - Expected: the protocol text only names supported MCP tools and compaction guidance references `mem_session(action="summary")` instead of a separate summary tool name.

- [ ] 3.2 Update `isSessionSummaryTool()` in `src/hooks/thoth-mem/index.ts` to detect `mem_session` and MCP-prefixed variants only when `input.args.action === "summary"`.
  **Verification**:
  - Run: `pnpm run typecheck`
  - Expected: compaction follow-up clearing happens for summary actions only, and missing/non-object args remain conservative.

## Phase 4: Skills + docs consistency
- [ ] 4.1 Tighten the shared skill-memory guidance in `src/skills/plan-reviewer/SKILL.md`, `src/skills/executing-plans/SKILL.md`, `src/skills/_shared/persistence-contract.md`, and `src/skills/_shared/thoth-mem-convention.md` to use the canonical recall funnel plus concise capability guidance.
  **Verification**:
  - Run: `pnpm run lint`
  - Expected: the shared skill markdown keeps the six-tool surface, the recall funnel, the optional timeline note, and bounded project-memory guidance aligned.

- [ ] 4.2 Update `docs/sdd-pipeline.md` and `docs/quick-reference.md` so the memory retrieval sections use the three-step funnel and the same capability sentence.
  **Verification**:
  - Run: `pnpm run lint`
  - Expected: both docs reference `mem_recall(mode="compact")` -> `mem_recall(mode="context")` -> `mem_get(...)` plus the HyDE/filter/project-context guidance.

- [ ] 4.3 Align `README.md` thoth-mem retrieval wording to the same recall funnel and capability guidance for surface consistency.
  **Verification**:
  - Run: `pnpm run lint`
  - Expected: README presents the recall funnel (`mem_recall(mode="compact")` -> `mem_recall(mode="context")` -> `mem_get(...)`) plus capability guidance, and the Phase 6 unsupported-name scan over `README.md` returns no matches.

## Phase 5: Tests
- [ ] 5.1 Update the main prompt, governance, adapter, and hook assertions in `src/agents/index.test.ts`, `src/agents/prompt-rendering.test.ts`, `src/harness/core/memory-governance.test.ts`, `src/harness/adapters/codex.test.ts`, and `src/hooks/thoth-mem/index.test.ts`.
  **Verification**:
  - Run: `pnpm vitest run src/agents/index.test.ts src/agents/prompt-rendering.test.ts src/harness/core/memory-governance.test.ts src/harness/adapters/codex.test.ts src/hooks/thoth-mem/index.test.ts`
  - Expected: assertions pass for the six-tool surface, operation-aware governance, step-0 bootstrap, root-owned compaction, and recall-funnel wording.

- [ ] 5.2 Refresh the shared-skill anchor tests in `src/cli/custom-skills.test.ts` and `src/harness/writers/skill-layout.test.ts` only if the shared markdown wording changes.
  **Verification**:
  - Run: `pnpm vitest run src/cli/custom-skills.test.ts src/harness/writers/skill-layout.test.ts`
  - Expected: anchor assertions still match the tightened capability guidance, or no test updates are required if shared text stays unchanged.

## Phase 6: Verification
- [ ] 6.1 Run the full verification stack for the change: typecheck, lint, targeted Vitest, full test suite, and unsupported callable-name scan.
  **Verification**:
  - Run: `pnpm run typecheck`
  - Run: `pnpm run lint`
  - Run: `pnpm vitest run src/agents/index.test.ts src/agents/prompt-rendering.test.ts src/harness/core/memory-governance.test.ts src/harness/adapters/codex.test.ts src/hooks/thoth-mem/index.test.ts src/cli/custom-skills.test.ts src/harness/writers/skill-layout.test.ts`
  - Run: `pnpm test`
  - Run: `rg -n "\\b(mem_search|mem_timeline|mem_get_observation|mem_session_start|mem_session_summary|mem_save_prompt|mem_capture_passive|mem_project_summary|mem_project_graph|mem_topic_keys|mem_suggest_topic_key|mem_update)\\b" src docs README.md`
  - Expected: no TypeScript errors, no lint errors, all targeted Vitest and full suite tests pass, and the unsupported callable-name scan returns no matches.

- [ ] 6.2 Update the OpenSpec change status for `openspec/changes/align-thoth-mem-tool-surface-guidance/` and prepare the handoff for `sdd-verify`.
  **Verification**:
  - Run: `pnpm run typecheck`
  - Expected: the change is marked ready for `sdd-verify` and the final checklist is complete.
