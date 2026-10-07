# Tasks: Add Brainstorming Skill and Clarification Gate

## Phase 1: Brainstorming Skill

- [x] 1.1 Create `src/skills/brainstorming/SKILL.md` with the simplified 6-phase workflow
  **Files:** Create: `src/skills/brainstorming/SKILL.md`
  **Description:** Author the bundled `brainstorming` skill as a simple understanding flow only: (1) Context Gathering with `explorer` and `librarian`, (2) Interview with one question at a time and at most 5 questions, (3) Scope Assessment using the 7 scope signals, (4) Approach Proposal with 2-3 options plus recommendation, (5) User Approval, and (6) Handoff to trivial/direct, medium/accelerated SDD, or complex/full SDD. In the handoff phase, present the artifact store choice (`thoth-mem`, `openspec`, `hybrid`) with brief pros/cons and a default of `hybrid` before SDD generation starts. Explicitly forbid implementation, formal design-brief output, and oracle review during brainstorming.
  **Verification:**
  - Run: `grep -n "User Approval\|Handoff\|artifact store\|hybrid\|at most 5" src/skills/brainstorming/SKILL.md`
  - Expected: The skill documents the simplified phases, the artifact store choice, and the no-implementation rule.

## Phase 2: Configuration

- [x] 2.1 Add `ClarificationGateConfig` to `schema.ts`
  **Files:** Modify: `src/config/schema.ts`
  **Description:** Define the `ClarificationGateConfigSchema` and exported `ClarificationGateConfig` type with the approved modes: `off`, `explicit-only`, `auto`, and `auto-for-planning`. Wire `clarificationGate` into `PluginConfigSchema` using existing schema conventions.
  **Verification:**
  - Run: `grep -n "ClarificationGateConfigSchema\|clarificationGate" src/config/schema.ts`
  - Expected: The schema file defines the config and includes it in plugin validation.

- [x] 2.2 Deep-merge in `loader.ts`
  **Files:** Modify: `src/config/loader.ts`
  **Description:** Add `clarificationGate` to the nested config sections that are deep-merged between user and project config so future nested settings layer correctly.
  **Verification:**
  - Run: `grep -n "clarificationGate" src/config/loader.ts`
  - Expected: The loader deep-merges the `clarificationGate` section.

- [x] 2.3 Add `ArtifactStoreConfig` to `schema.ts`
  **Files:** Modify: `src/config/schema.ts`
  **Description:** Define `ArtifactStoreModeSchema`, `ArtifactStoreConfigSchema`, and the exported `ArtifactStoreConfig` type with `mode: thoth-mem | openspec | hybrid`, defaulting to `hybrid`. Wire `artifactStore` into `PluginConfigSchema` using the existing schema conventions.
  **Verification:**
  - Run: `grep -n "ArtifactStoreModeSchema\|ArtifactStoreConfigSchema\|artifactStore\|hybrid" src/config/schema.ts`
  - Expected: The schema file defines the artifact store config and includes it in plugin validation.

- [x] 2.4 Deep-merge `artifactStore` in `loader.ts`
  **Files:** Modify: `src/config/loader.ts`
  **Description:** Add `artifactStore` to the nested config sections that are deep-merged between user and project config so the selected persistence mode layers correctly across config sources.
  **Verification:**
  - Run: `grep -n "artifactStore" src/config/loader.ts`
  - Expected: The loader deep-merges the `artifactStore` section.

## Phase 3: Hook Implementation

- [x] 3.1 Create `src/hooks/clarification-gate/index.ts`
  **Files:** Create: `src/hooks/clarification-gate/index.ts`
  **Description:** Implement the clarification gate hook to inspect the last user text message, apply ambiguity and scope-signal heuristics, respect configured modes, and inject a hidden `<clarification-gate>` nudge without replacing visible user text.
  **Verification:**
  - Run: `grep -n "clarification-gate\|experimental.chat.messages.transform" src/hooks/clarification-gate/index.ts`
  - Expected: The hook emits the hidden block and exposes the message-transform integration.

- [x] 3.2 Export from `src/hooks/index.ts`
  **Files:** Modify: `src/hooks/index.ts`
  **Description:** Export the clarification gate hook factory from the hooks barrel using the repository's existing export style.
  **Verification:**
  - Run: `grep -n "createClarificationGateHook" src/hooks/index.ts`
  - Expected: The hooks barrel exports `createClarificationGateHook`.

- [x] 3.3 Compose with phase reminder in `src/index.ts`
  **Files:** Modify: `src/index.ts`
  **Description:** Compose the clarification gate hook with the existing phase reminder in `experimental.chat.messages.transform` so both behaviors remain active in the plugin root.
  **Verification:**
  - Run: `grep -n "createClarificationGateHook\|experimental.chat.messages.transform" src/index.ts`
  - Expected: The plugin root initializes and composes both transforms.

## Phase 4: SDD Pipeline Enhancements

- [x] 4.1 Enhance `sdd-tasks` skill or orchestrator prompt to offer oracle plan review after task generation
  **Files:** Modify: `src/skills/sdd-tasks/SKILL.md` and/or orchestrator-facing workflow docs/prompts that govern post-task-generation behavior
  **Description:** Document that after generating `openspec/changes/{change-name}/tasks.md`, the orchestrator should ask whether the user wants a precise oracle plan review before execution. If yes, run the bundled `plan-reviewer` loop until `[OKAY]`, fixing only blocking issues and limiting each rejection to at most 3 issues.
  **Verification:**
  - Run: `grep -n "plan review\|\[OKAY\]\|\[REJECT\]\|max 3" src/skills/sdd-tasks/SKILL.md`
  - Expected: The task-planning guidance documents the optional oracle review loop.

- [x] 4.2 Bundle `plan-reviewer` skill
  **Files:**
  - Create: `src/skills/plan-reviewer/SKILL.md`
  - Modify: `src/cli/custom-skills.ts` (add plan-reviewer to CUSTOM_SKILLS)
  **Description:** Create the plan-reviewer skill asset by adapting the plan-reviewer from the old repo (the content is already known — it follows the [OKAY]/[REJECT] pattern with max 3 issues, focuses on blocker-finding only). Register it in the bundled skill registry alongside other skills.
  **Verification:**
  - Run: `grep -n "plan-reviewer" src/cli/custom-skills.ts && test -f src/skills/plan-reviewer/SKILL.md`
  - Expected: The skill is registered in CUSTOM_SKILLS and the SKILL.md file exists.

- [x] 4.3 Update SDD skills to honor `artifactStore.mode`
  **Files:**
  - Modify: `src/skills/sdd-propose/SKILL.md`
  - Modify: `src/skills/sdd-spec/SKILL.md`
  - Modify: `src/skills/sdd-design/SKILL.md`
  - Modify: `src/skills/sdd-tasks/SKILL.md`
  - Modify: `src/skills/sdd-apply/SKILL.md`
  - Modify: `src/skills/sdd-verify/SKILL.md`
  - Modify: `src/skills/sdd-archive/SKILL.md`
  - Modify: `src/skills/_shared/persistence-contract.md`
  **Description:** Add artifact-store mode awareness to each SDD skill. Each skill should read the persistence mode and behave accordingly: thoth-mem only, openspec only, or hybrid. Update persistence-contract.md to be the authoritative reference for all three modes.
  **Verification:**
  - Run: `grep -n "artifactStore.mode\|thoth-mem\|openspec\|hybrid" src/skills/sdd-propose/SKILL.md src/skills/sdd-spec/SKILL.md src/skills/sdd-design/SKILL.md src/skills/sdd-tasks/SKILL.md src/skills/sdd-apply/SKILL.md src/skills/sdd-verify/SKILL.md src/skills/sdd-archive/SKILL.md src/skills/_shared/persistence-contract.md`
  - Expected: All SDD skills reference the artifact store mode and persistence-contract.md documents all three modes.

## Phase 5: Task Execution Progress Tracking and Persistence Contracts

- [x] 5.1 Update `src/skills/sdd-apply/SKILL.md` to support `[~]` in-progress and `[-]` skipped states
  **Files:** Modify: `src/skills/sdd-apply/SKILL.md`
  **Description:** Update the execution workflow so each assigned task is marked `- [~]` before work begins, then changed to `- [x]` on completion or `- [-]` when skipped with a reason. Make `tasks.md` the single source of truth for resumable progress and preserve the thoth-mem re-save requirement.
  **Verification:**
  - Run: `grep -n "\[~\]\|\[-\]\|single source of truth\|before work begins" src/skills/sdd-apply/SKILL.md`
  - Expected: The apply skill documents real-time progress tracking and skip handling.

- [x] 5.2 Update `tasks.md` format documentation in `plan-reviewer` and `sdd-tasks` skills to recognize the new states
  **Files:** Modify: `src/skills/sdd-tasks/SKILL.md`; modify bundled `plan-reviewer` skill asset if present
  **Description:** Extend task format guidance so task artifacts recognize `- [ ]` pending, `- [~]` in progress, `- [x]` completed, and `- [-]` skipped with reason. Keep the checkbox convention aligned across planning, review, and execution guidance.
  **Verification:**
  - Run: `grep -n "\[~\]\|\[-\]" src/skills/sdd-tasks/SKILL.md && grep -R -n "\[~\]\|\[-\]" src | grep "plan-reviewer"`
  - Expected: Planning and review guidance recognize all four checkbox states.

- [x] 5.3 Update `src/skills/_shared/persistence-contract.md` to document all three modes
  **Files:** Modify: `src/skills/_shared/persistence-contract.md`
  **Description:** Expand the shared persistence contract to document `thoth-mem`, `openspec`, and `hybrid`, including read order, write targets, retrieval behavior, and repair rules. Make it explicit that SDD skills obey the selected artifact store mode rather than always requiring dual persistence.
  **Verification:**
  - Run: `grep -n "thoth-mem\|openspec\|hybrid\|Write targets\|Read order" src/skills/_shared/persistence-contract.md`
  - Expected: The contract documents all three persistence modes and their behavior.

- [x] 5.4 Update `src/skills/_shared/thoth-mem-convention.md`
  **Files:** Modify: `src/skills/_shared/thoth-mem-convention.md`
  **Description:** Clarify that the thoth-mem convention applies only when the artifact store mode includes thoth-mem (`thoth-mem` and `hybrid`). Document that `openspec`-only runs skip thoth-mem saves and thoth-mem recovery steps.
  **Verification:**
  - Run: `grep -n "artifact store\|thoth-mem\|hybrid\|openspec" src/skills/_shared/thoth-mem-convention.md`
  - Expected: The convention limits its requirements to modes that include thoth-mem.

- [x] 5.5 Update `src/skills/_shared/openspec-convention.md`
  **Files:** Modify: `src/skills/_shared/openspec-convention.md`
  **Description:** Clarify that the OpenSpec convention applies only when the artifact store mode includes OpenSpec (`openspec` and `hybrid`). Document that `thoth-mem`-only runs skip filesystem artifact writes.
  **Verification:**
  - Run: `grep -n "artifact store\|OpenSpec\|hybrid\|thoth-mem" src/skills/_shared/openspec-convention.md`
  - Expected: The convention limits filesystem requirements to modes that include OpenSpec.

## Phase 6: Skill Registration and Docs

- [x] 6.1 Register brainstorming in `custom-skills.ts`
  **Files:** Modify: `src/cli/custom-skills.ts`
  **Description:** Add `brainstorming` to the bundled custom skill registry with the approved description, supported agents, and source path.
  **Verification:**
  - Run: `grep -n "brainstorming" src/cli/custom-skills.ts`
  - Expected: The bundled skill registry includes the new brainstorming entry.

- [x] 6.2 Update `AGENTS.md`
  **Files:** Modify: `AGENTS.md`
  **Description:** Document the simplified brainstorming capability, clarification gate behavior, optional oracle review after SDD task generation, and resumable task execution progress tracking.
  **Verification:**
  - Run: `grep -n "brainstorm\|clarification gate\|plan review\|\[~\]" AGENTS.md`
  - Expected: `AGENTS.md` reflects the simplified flow and progress tracking states.

## Phase 7: Verification

- [-] 7.1 `bun run typecheck && bun run check:ci && bun test` — Verification passed in prior session
   **Files:** Verify: workspace
   **Description:** Run the full verification suite after implementing the brainstorming skill, clarification gate, SDD plan-review loop guidance, and task-progress tracking updates.
   **Verification:**
   - Run: `bun run typecheck && bun run check:ci && bun test`
   - Expected: Type checking, Biome checks, and tests all pass.
