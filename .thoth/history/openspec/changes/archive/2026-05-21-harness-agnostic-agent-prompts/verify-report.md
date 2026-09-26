# Verification Report: Harness-Agnostic Agent Prompts

## Completeness

Result: complete. The implementation added the semantic prompt dialect/rendering
seam, preserved OpenCode as the default prompt contract, converted all seven
agent prompts to semantic sections, moved Codex prompt generation to Codex
dialect rendering, and added focused prompt/governance tests. All tasks in
`tasks.md` are marked complete.

## Build and Test Evidence

- `bun test src/agents/prompt-rendering.test.ts`: passed, 11 pass, 0 fail.
- `bun test src/agents/prompt-dialects.test.ts`: passed, 5 pass, 0 fail.
- `bun test src/harness/adapters/codex.test.ts`: passed, 23 pass, 0 fail.
- `bun test src/harness/core/memory-governance.test.ts`: passed, 6 pass, 0 fail.
- `bun run typecheck`: passed.
- `bun run check:ci`: passed, 173 files checked, no fixes applied.
- `bun test`: passed, 547 pass, 0 fail, 2141 assertions.

## Compliance Matrix

| Spec scenario | Status | Evidence |
| --- | --- | --- |
| Shared policy avoids OpenCode-only tool names | Compliant | `src/agents/prompt-sections.ts` holds semantic section data; `prompt-rendering.test.ts` asserts neutral question/subagent section sources before dialect rendering. |
| Harness terminology remains representable | Compliant | `src/agents/prompt-dialects.ts` defines typed OpenCode/Codex nomenclature; dialect tests assert distinct rendered terminology. |
| All roles retain their semantic responsibilities | Compliant | All seven role files render semantic sections through the OpenCode dialect; prompt rendering tests assert role nature, modes, scopes, safety, and outputs for each role. |
| Harness limitations do not rewrite role identity | Compliant | Codex capability disclosures preserve instruction-only responsibility contracts; Codex role prompt tests assert role identity is retained. |
| OpenCode wording is rendered from the OpenCode dialect | Compliant | `OPENCODE_PROMPT_DIALECT` supplies `task`, `task_status`, `question`, `todowrite`, and `@role`; tests assert OpenCode prompts remain explicit and default. |
| Codex wording is rendered from the Codex dialect | Compliant | `CODEX_PROMPT_DIALECT` supplies Codex tool/status/role wording; Codex adapter renders role sections with that dialect. |
| Codex generation survives OpenCode prose changes | Compliant | `src/harness/adapters/codex.ts` renders from semantic section factories, not OpenCode prompt lookup; Codex tests cover semantic generation rather than exact prose adaptation. |
| OpenCode-only phrases do not leak into Codex shared policy output | Compliant | Codex prompt tests assert no unframed `question`, `task_status`, `todowrite`, or `@role` OpenCode terms leak into Codex role prompts. |
| OpenCode rendering remains explicit and stable | Compliant | Focused OpenCode prompt tests assert required tool, delegation, memory, visual QA, verification, role, and output wording. |
| Codex rendering uses Codex semantics without brittle adaptation | Compliant | Codex adapter tests assert semantic Codex contracts, Codex terminology, capability-gap language, and no internal adaptation wrapper markers. |
| Unsupported harnesses remain out of scope for prompt rendering | Compliant | `HarnessId` remains `opencode | codex`; `getPromptDialect()` and harness registry reject unsupported harness ids. |
| Runtime behavior changes stay constrained to prompt contracts | Compliant | OpenCode adapter and agent roster tests still pass; Codex adapter preserves artifact paths, TOML fields, skill/MCP payloads, diagnostics, hook diagnostics, and unsupported-harness behavior. |

## Design Coherence

- The typed dialect seam exists in `src/agents/prompt-dialects.ts` with
  `HarnessPromptDialect`, `ToolNomenclature`, and `CapabilityProfile`.
- Semantic section creation and rendering live in `src/agents/prompt-sections.ts`.
- `src/agents/prompt-utils.ts` keeps compatibility exports while rendering through
  the OpenCode default, preserving existing `createAgents(config)` behavior.
- Orchestrator plus explorer, librarian, oracle, designer, quick, and deep prompt
  files now compose role-local semantic sections with the OpenCode dialect.
- `src/harness/adapters/codex.ts` renders Codex root/subagent instructions from
  semantic sections with the Codex dialect and does not depend on broad OpenCode
  prompt adaptation.
- Scope stayed within prompt-generation contracts for OpenCode and Codex; no
  third harness or agent-roster change was introduced.

## Issues Found

None.

## Verdict

Pass. The implementation satisfies all 12 full-pipeline spec scenarios and is
ready for archive.
