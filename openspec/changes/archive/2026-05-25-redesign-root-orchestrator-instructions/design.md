# Design: Redesign Root Orchestrator Instructions

## Technical Approach
Rewrite the root/orchestrator semantic prompt text in `src/agents/prompt-sections.ts` around `createOrchestratorPromptSections()` while preserving the existing section renderer, role roster, memory governance, SDD gates, and dialect placeholder model. The implementation should replace the current absolute "root cannot inspect workspace" stance with a bounded direct-inspection policy and add explicit epistemic rigor, path selection, delegation economics, and evidence-led correction.

The common behavior belongs in shared semantic root sections. Harness-specific wording remains supplied through `HarnessPromptDialect` placeholders and existing Codex runtime overlays. `src/agents/prompt-dialects.ts` should change only if the new semantics need a typed concept that cannot be expressed with current placeholders.

## Architecture Decisions

### Decision: Keep the redesign in semantic root sections
**Choice**: Update `createOrchestratorPromptSections()` as the primary implementation target.
**Alternatives considered**: Add separate OpenCode and Codex root prompt bodies; patch only Codex root overlay; add a new root-prompt builder abstraction.
**Rationale**: The existing architecture already centralizes shared role behavior in semantic sections and renders harness-specific terminology through dialects. Keeping the redesign there preserves multi-harness compatibility and avoids brittle post-hoc prompt replacement.

### Decision: Permit bounded direct inspection without weakening delegation
**Choice**: Add a root policy that allows narrow direct checks but requires delegation for broad discovery, implementation, high-risk review, visual QA, and verification-heavy work.
**Alternatives considered**: Preserve the absolute no-inspection rule; allow unrestricted root inspection.
**Rationale**: The absolute rule adds avoidable overhead for tiny facts, while unrestricted inspection would collapse the delegate-first model. A bounded policy captures the useful reference behavior while preserving thoth-agents role boundaries.

### Decision: Make epistemic rigor part of the root contract
**Choice**: Add root instructions to verify material claims, correct mistaken assumptions with evidence, and offer alternatives with tradeoffs.
**Alternatives considered**: Leave this as tone guidance only; add it to every specialist prompt.
**Rationale**: The root owns synthesis, user-facing guidance, and final decisions, so this requirement is most important at the coordinator layer. Specialist prompts already require evidence in role-specific outputs.

### Decision: Test behavior through rendered prompt contracts
**Choice**: Update focused tests to assert semantic markers rather than full prompt snapshots.
**Alternatives considered**: Snapshot the full root prompt; rely only on manual review.
**Rationale**: Marker tests are stable enough to catch contract regressions without making future wording improvements painful.

## Data Flow
1. `createOrchestratorPromptSections()` builds shared root sections with placeholders such as `{{role.deep}}`, `{{userQuestionTool}}`, `{{progressTool}}`, and delegation labels.
2. `renderRolePrompt()` renders those sections through `OPENCODE_PROMPT_DIALECT` or `CODEX_PROMPT_DIALECT`.
3. `renderCodexRootInstructions()` wraps the rendered Codex root prompt in managed Codex markers and appends Codex runtime guidance.
4. OpenCode agent config generation receives the same semantic root contract through the OpenCode dialect.

## File Changes
- Modify `src/agents/prompt-sections.ts`: rewrite root/orchestrator sections; add calibrated direct-inspection, delegation economics, epistemic rigor, and concise communication language.
- Modify `src/agents/prompt-dialects.ts` only if needed: add typed dialect wording for any new harness concept that cannot be represented with current placeholders.
- Modify `src/agents/prompt-rendering.test.ts`: assert bounded direct checks, broad delegation requirements, claim verification, evidence-led correction, alternatives/tradeoffs, role preservation, no reference leaks, and OpenCode/Codex terminology.
- Modify `src/harness/adapters/codex.test.ts`: assert managed Codex root instructions include the redesigned root contract without OpenCode-only leaks.
- Modify `src/cli/codex-install.test.ts`: update installed root instruction assertions so generated `~/.codex/AGENTS.md` preserves the new root contract.

## Interfaces / Contracts
- No public TypeScript API changes are planned.
- No changes to role names, agent pack contracts, SDD topic keys, OpenSpec paths, Codex managed block markers, or install target resolution.
- Rendered root prompts must continue to avoid reference repository names and role leaks.
- Codex governance limitations remain instruction-level unless the runtime documents stronger enforcement.

## Testing Strategy
- Run focused prompt and Codex install tests:
  `pnpm test -- src/agents/prompt-rendering.test.ts src/harness/adapters/codex.test.ts src/cli/codex-install.test.ts`
- Run `pnpm run typecheck` if shared TypeScript contracts or dialect types change.
- Run `pnpm run build` only if generated artifacts, exports, or package rendering behavior change materially.

## Migration / Rollout
This is a prompt-contract change. Existing generated installations update when users rerun the relevant generation or install flow. No data migration is required.

## Open Questions
- Whether the final wording should keep "delegate-first" as the headline phrase or shift to "delegate-when-it-wins" style language while preserving current product identity.
- Whether root direct checks should explicitly name examples such as known-file reads and script confirmation, or remain abstract to avoid harness-specific tool assumptions.
