# Tasks: Multi-Harness Skill Instructions

## Phase 1: Shared References
- [x] 1.1 Add the shared multi-harness vocabulary and binding model - `src/skills/_shared/harness-convention.md`
  **Verification**:
  - Run: `rg -n "harness-neutral|harness binding|blocking user input surface|semantic role|instruction-level|unsupported-capability|plugin-bundled" src/skills/_shared -g "*.md"`
  - Expected: Shared references define portable semantics, harness-bound examples, Codex instruction-level limits, and unsupported-capability diagnostics.

- [x] 1.2 Align persistence semantics with harness-neutral wording - `src/skills/_shared/persistence-contract.md`
  **Verification**:
  - Run: `rg -n "OpenCode|question|task_status|todowrite|@explorer|@deep|~/.config/opencode|engram" src/skills/_shared/persistence-contract.md`
  - Expected: No universal OpenCode-only primitives remain, and any legacy identity reference is limited to a prohibition or historical note.

- [x] 1.3 Clarify OpenSpec artifact semantics as harness-independent - `src/skills/_shared/openspec-convention.md`
  **Verification**:
  - Run: `rg -n "openspec/|canonical|harness|OpenCode|Codex" src/skills/_shared/openspec-convention.md`
  - Expected: Canonical OpenSpec paths remain unchanged and filesystem artifact semantics are not tied to one harness.

- [x] 1.4 Scope thoth-mem tool names and governance to active harness bindings - `src/skills/_shared/thoth-mem-convention.md`
  **Verification**:
  - Run: `rg -n "topic_key|sdd/\\{change-name\\}|mem_search|mem_timeline|mem_get_observation|harness|instruction-level" src/skills/_shared/thoth-mem-convention.md`
  - Expected: Topic keys and recovery protocol remain stable while tool names are framed as active harness/plugin bindings.

## Phase 2: Workflow and Orchestration Skills
- [x] 2.1 Rephrase requirements discovery around semantic blocking input and bounded harness bindings - `src/skills/requirements-interview/SKILL.md`
  **Verification**:
  - Run: `rg -n "question-tool|question tool|@explorer|@librarian|~/.config/opencode|request_user_input|blocking user input surface|harness" src/skills/requirements-interview/SKILL.md`
  - Expected: OpenCode `question` and Codex `request_user_input` are bindings for the same blocking input responsibility, role dispatch syntax is harness-scoped, and the interview limits and SDD route rules remain explicit.

- [x] 2.2 Reframe execution planning dispatch and progress surfaces as harness-bound - `src/skills/executing-plans/SKILL.md`
  **Verification**:
  - Run: `rg -n "@explorer|@librarian|@oracle|@designer|@quick|@deep|task_status|todowrite|Codex progress|harness" src/skills/executing-plans/SKILL.md`
  - Expected: Semantic roles, batching, and progress ownership remain intact, while OpenCode `@role`, `task_status`, and `todowrite` are scoped to OpenCode bindings or examples.

- [x] 2.3 Preserve plan review semantics with portable persistence and role vocabulary - `src/skills/plan-reviewer/SKILL.md`
  **Verification**:
  - Run: `rg -n "\\[OKAY\\]|\\[REJECT\\]|oracle|persistence|harness|~/.config/opencode" src/skills/plan-reviewer/SKILL.md`
  - Expected: `[OKAY]` and `[REJECT]` gate behavior remains unchanged, with shared references and harness-specific paths framed correctly.

- [x] 2.4 Preserve root-owned thoth-mem governance and disclose instruction-only limits - `src/skills/thoth-mem-agents/SKILL.md`
  **Verification**:
  - Run: `rg -n "session_id|project|orchestrator|subagent|mem_session|mem_save_prompt|instruction-level|harness|Codex" src/skills/thoth-mem-agents/SKILL.md`
  - Expected: Parent `session_id` and `project` requirements, prompt/session ownership, and subagent memory limits remain explicit, with unsupported hard-enforcement claims avoided.

## Phase 3: SDD Phase Skills
- [x] 3.1 Update SDD bootstrap, proposal, spec, design, and tasks skills to consume shared harness conventions - `src/skills/sdd-init/SKILL.md`, `src/skills/sdd-propose/SKILL.md`, `src/skills/sdd-spec/SKILL.md`, `src/skills/sdd-design/SKILL.md`, `src/skills/sdd-tasks/SKILL.md`
  **Verification**:
  - Run: `rg -n "harness-convention|persistence-contract|openspec-convention|thoth-mem-convention|~/.config/opencode|question tool|@deep|task_status|todowrite" src/skills/sdd-init/SKILL.md src/skills/sdd-propose/SKILL.md src/skills/sdd-spec/SKILL.md src/skills/sdd-design/SKILL.md src/skills/sdd-tasks/SKILL.md`
  - Expected: Phase ordering, artifact prerequisites, OpenSpec paths, and persistence modes remain intact while shared reference paths and harness-bound primitives are scoped correctly.

- [x] 3.2 Update SDD execution, verification, and archive skills without changing artifact contracts - `src/skills/sdd-apply/SKILL.md`, `src/skills/sdd-verify/SKILL.md`, `src/skills/sdd-archive/SKILL.md`
  **Verification**:
  - Run: `rg -n "sdd/\\{change-name\\}|apply-progress|verify-report|archive-report|harness-convention|~/.config/opencode|@quick|@deep|todowrite|task_status" src/skills/sdd-apply/SKILL.md src/skills/sdd-verify/SKILL.md src/skills/sdd-archive/SKILL.md`
  - Expected: Execution progress, verify report, archive report, and canonical topic keys remain unchanged while role invocation and progress surfaces are harness-bound.

- [x] 3.3 Run focused SDD wording checks across all SDD skills - `src/skills/sdd-*`
  **Verification**:
  - Run: `rg -n "question tool|question-tool|@explorer|@librarian|@oracle|@designer|@quick|@deep|task_status|todowrite|~/.config/opencode|\\.agents/skills" src/skills/sdd-* -g "SKILL.md"`
  - Expected: Every hit is either removed, scoped as a harness binding/example, or retained only where it is an explicit OpenCode binding.

## Phase 4: Cartography
- [x] 4.1 Scope cartography script paths and codemap registration to active harness bindings - `src/skills/cartography/SKILL.md`
  **Verification**:
  - Run: `rg -n "AGENTS\\.md|~/.config/opencode|OpenCode|Codex|autoload|harness|installed skill script path" src/skills/cartography/SKILL.md`
  - Expected: OpenCode script paths and AGENTS.md autoload behavior are explicitly OpenCode-bound, with portable registration guidance for other harnesses and diagnostics for unsupported autoload behavior.

- [x] 4.2 Align cartography user documentation with the same binding model - `src/skills/cartography/README.md`
  **Verification**:
  - Run: `rg -n "AGENTS\\.md|~/.config/opencode|OpenCode|Codex|harness|autoload|thoth-agents" src/skills/cartography/README.md`
  - Expected: Documentation matches the SKILL.md binding model and keeps `thoth-agents` as the canonical active identity.

## Phase 5: Tests, Fixtures, and Consistency
- [x] 5.1 Add or adjust skill packaging/content assertions for multi-harness instructions - `src/harness/writers/skill-layout.test.ts`
  **Verification**:
  - Run: `bun test src/harness/writers/skill-layout.test.ts`
  - Expected: Skill layout tests pass and cover harness-neutral anchors, plugin-bundled Codex skills, fallback `.agents/skills`, and duplicate-scope diagnostics where applicable.

- [x] 5.2 Run focused harness and prompt regression tests - `src/harness/adapters/codex.test.ts`, `src/agents/index.test.ts`, `src/agents/prompt-dialects.test.ts`, `src/harness/core/skills.test.ts`, `src/harness/core/sdd.test.ts`, `src/harness/core/memory-governance.test.ts`
  **Verification**:
  - Run: `bun test src/harness/adapters/codex.test.ts src/agents/index.test.ts src/agents/prompt-dialects.test.ts src/harness/core/skills.test.ts src/harness/core/sdd.test.ts src/harness/core/memory-governance.test.ts`
  - Expected: Codex packaging, prompt dialect, semantic role, SDD, and memory-governance regressions remain green.

- [x] 5.3 Run focused OpenCode-only wording and Codex limitation checks across skill instructions - `src/skills`
  **Verification**:
  - Run: `rg -n "question tool|question-tool|@explorer|@librarian|@oracle|@designer|@quick|@deep|task_status|todowrite|AGENTS\\.md|~/.config/opencode|\\.agents/skills" src/skills -g "*.md"`
  - Expected: Each hit is removed, clearly framed as a harness-specific binding/example, or documented as intentional OpenCode-only guidance.
  - Run: `rg -n "request_user_input|Codex|plugin-bundled|instruction-only|unsupported-capability|harness-provided" src/skills -g "*.md"`
  - Expected: Codex-facing hits prefer plugin-bundled skills and do not claim hard runtime enforcement where behavior is instruction-only.

- [x] 5.4 Run canonical identity and legacy-name checks across skill instructions - `src/skills`
  **Verification**:
  - Run: `rg -n "thoth-agents|thoth-agent|litebrain|engram" src/skills -g "*.md"`
  - Expected: `thoth-agents` remains the canonical active identity; old names only appear in historical, diagnostic, or explicit prohibition contexts.

- [x] 5.5 Run repository-wide quality gates after the content cleanup - all affected files
  **Verification**:
  - Run: `bun run check:ci`
  - Expected: Biome check completes without errors.
  - Run: `bun run typecheck`
  - Expected: TypeScript completes without errors.
  - Run: `bun test`
  - Expected: Full Bun test suite passes.
