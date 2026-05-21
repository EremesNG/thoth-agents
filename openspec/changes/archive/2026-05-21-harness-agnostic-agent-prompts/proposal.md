# Proposal: Harness-Agnostic Agent Prompts

## Intent

Replace brittle Codex prompt adaptation based on rewriting OpenCode prompt text
with semantic prompt policies that render through explicit harness dialect and
capability profiles. OpenCode remains the baseline harness, Codex receives
first-class prompt wording, and future harnesses can be added without editing
shared policy text by string replacement.

## Scope

### In Scope

- Introduce semantic prompt contracts for agent roles, delegation, user-question
  protocol, SDD governance, memory governance, verification reporting, and tool
  wording.
- Add harness rendering concepts such as `HarnessPromptDialect`,
  `ToolNomenclature`, `CapabilityProfile`, and prompt section renderers.
- Update orchestrator and specialist prompt generation so shared rules describe
  intent while OpenCode and Codex render harness-specific tool names and
  limitations explicitly.
- Replace or constrain `codexAdaptOpenCodePrompt` so Codex output is produced
  from semantic sections rather than broad OpenCode string substitutions.
- Add tests for OpenCode and Codex renderings, capability-gap language, and
  memory/delegation governance wording.

### Out of Scope

- Adding harness implementations beyond OpenCode and Codex.
- Changing runtime delegation behavior, install targets, or agent roster unless
  needed to keep prompt contracts accurate.
- Replacing thoth-mem or SDD artifact governance.
- Broad UX, marketplace, or plugin packaging changes unrelated to prompt
  generation.

## Approach

Model each agent prompt as ordered semantic sections rendered by a selected
harness dialect. Shared sections define role responsibilities and policies;
dialects provide tool nomenclature, dispatch wording, user-question phrasing,
and capability disclaimers. OpenCode rendering should preserve current explicit
tool guidance. Codex rendering should use Codex-appropriate terms and clearly
identify instruction-only governance where Codex lacks hard enforcement.

## Affected Areas

- `src/agents/orchestrator.ts`
- `src/agents/{explorer,librarian,oracle,designer,quick,deep}.ts`
- `src/agents/prompt-utils.ts`
- `src/harness/adapters/codex.ts`
- Prompt and governance tests, especially Codex adapter and memory-governance
  coverage.

## Risks

- Prompt wording drift could weaken existing OpenCode behavior.
- Over-abstracting prompts could obscure role-specific instructions.
- Codex capability gaps could be under-disclosed if dialect metadata is too
  optimistic.

## Rollback Plan

Restore the existing prompt constants and Codex adapter rewrite path, keeping
tests that prove OpenCode baseline behavior still passes. Remove the new dialect
interfaces if they cannot preserve current prompt contracts.

## Success Criteria

- Shared semantic prompt sections do not contain direct OpenCode-only tool names
  where a harness-neutral policy is intended.
- OpenCode-rendered prompts remain explicit about OpenCode tools and preserve the
  existing agent nature and governance rules.
- Codex-rendered prompts are produced from semantic sections, avoid broad
  OpenCode prompt rewriting, and include Codex-specific tool wording and
  capability-gap disclosures.
- Automated tests cover both harness renderings and guard memory, delegation,
  user-question, and verification wording.
