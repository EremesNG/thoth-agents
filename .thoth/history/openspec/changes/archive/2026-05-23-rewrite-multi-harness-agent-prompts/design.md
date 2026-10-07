# Design: Rewrite Multi-Harness Agent Prompts

## Technical Approach

Rewrite the generated prompt contracts inside the existing semantic prompt
pipeline rather than replacing the system with copied static prompt files. The
implementation should treat `src/agents/prompt-sections.ts` as the canonical
source for shared role semantics, `src/agents/prompt-dialects.ts` as the
boundary for harness-specific wording, and `src/harness/adapters/codex.ts` as
the Codex artifact wrapper that adds Codex runtime disclosures and TOML
instructions.

The current architecture already has the right seam:

```text
role factory / Codex adapter
  -> create*PromptSections(...)
  -> renderRolePrompt(sections, dialect)
  -> composeAgentPrompt(...)
  -> OpenCode agent config or Codex instructions
```

The rewrite should keep that flow intact and improve the contracts carried by
the sections. Prompt changes should be role-first, explicit about ownership, and
stable across OpenCode and Codex. Harness-specific terms such as `task`,
`question`, `todowrite`, `request_user_input`, Codex custom-agent task, and
instruction-only enforcement should continue to come from dialects,
capabilities, or Codex adapter wrappers instead of broad post-render string
replacement.

Reference repositories may influence organization and tone only. Gentle-AI style
ideas that fit this project are strong root-coordinator boundaries, explicit
checkpointing, and safety framing. oh-my-opencode-slim style ideas that fit this
project are modular role definitions, role-first contracts, clear output
schemas, and explicit permission/tool surfaces. thoth-specific decisions remain
the canonical seven-role roster, delegate-first root ownership, thoth-mem
governance, OpenSpec SDD gates, OpenCode/Codex dialect separation, and the
existing override/append mechanics.

## Architecture Decisions

### Decision: Rewrite through semantic prompt sections

**Choice**: Update `createOrchestratorPromptSections`,
`createReadOnlySpecialistPromptSections`, and
`createWriteCapableSpecialistPromptSections` in
`src/agents/prompt-sections.ts` as the primary implementation surface.

**Alternatives considered**: Add external markdown prompt files, fork prompt
trees per harness, or adapt OpenCode prompts into Codex prompts after rendering.

**Rationale**: The spec requires shared semantics with harness-specific wording.
The existing section renderer already converts neutral placeholders and semantic
sections through `HarnessPromptDialect`; using it avoids Codex/OpenCode drift and
keeps prompt behavior testable from one source.

### Decision: Preserve dialects as the harness wording boundary

**Choice**: Keep OpenCode and Codex terminology in
`src/agents/prompt-dialects.ts` and Codex wrapper text in
`src/harness/adapters/codex.ts`. Add new placeholders or typed renderer inputs
only when the prompt needs a reusable harness concept that is currently
hardcoded.

**Alternatives considered**: Put conditionals inside role text, or duplicate
entire role prompts for OpenCode and Codex.

**Rationale**: Dialects already centralize tool nomenclature, role invocation,
dispatch labels, and capability disclosure. Keeping the boundary explicit lets
tests assert that unsupported harness ids fail and that Codex uses
instruction-level language where runtime enforcement is unavailable.

### Decision: Preserve prompt replacement and append semantics

**Choice**: Leave `composeAgentPrompt`, `appendPromptSections`,
`loadAgentPrompt`, and the role factory call pattern intact unless a focused
test exposes a real bug. Replacement prompts still win over generated and append
prompts; append prompts still follow generated base and model-family guidance.

**Alternatives considered**: Merge replacement and append prompts, or move user
prompt extension into the section renderer.

**Rationale**: The spec explicitly protects override behavior, and current tests
already cover placeholder expansion plus replacement precedence. The prompt
rewrite should not change user configuration behavior.

### Decision: Keep the seven-agent roster fixed

**Choice**: Preserve only orchestrator, explorer, librarian, oracle, designer,
quick, and deep in generated prompts, tests, Codex root instructions, and
adapter artifacts.

**Alternatives considered**: Import reference roles or expose reference command
models.

**Rationale**: The proposal and spec make reference repositories inspirational,
not normative. Adding roles would change routing, docs, tests, and user mental
models outside this change's approved scope.

### Decision: Treat memory governance as both prompt contract and diagnostic

**Choice**: Keep thoth-mem ownership rules in generated prompts and
`renderMemoryGovernanceInstructions`, and keep capability-gap diagnostics from
`memoryGovernanceDiagnostics` for Codex.

**Alternatives considered**: Rely only on prompt instructions for all harnesses,
or overclaim Codex runtime enforcement.

**Rationale**: OpenCode can represent more enforcement through agent
configuration, while Codex currently has instruction-level gaps for role
permissions, parent context injection, and memory-governance enforcement. The
design must preserve the rule and disclose the enforcement level.

### Decision: Test durable semantic phrases, not full prose snapshots

**Choice**: Add or update focused assertions for role identity, boundaries,
memory governance, harness terminology, capability disclosures, and prompt
composition rather than snapshotting full prompts.

**Alternatives considered**: Full prompt snapshots, or only typechecking the
renderer.

**Rationale**: Prompt wording will be deliberately edited. Durable phrase tests
catch contract regressions without making every copy edit brittle.

## Data Flow

OpenCode role generation:

```text
createAgents(config)
  -> loadAgentPrompt(role, preset)
  -> create<Role>Agent(...)
  -> renderRolePrompt(create*PromptSections(role), OPENCODE_PROMPT_DIALECT)
  -> append model-family section and user append prompt
  -> composeAgentPrompt(...)
  -> OpenCode SDK agent config
```

Codex artifact generation:

```text
codexAdapter.render(...)
  -> renderCodexRootInstructions(config)
  -> renderCodexRolePrompt(role, config, model)
  -> renderRolePrompt(codexPromptSections(role), CODEX_PROMPT_DIALECT)
  -> composeAgentPrompt(...)
  -> codexRoleInstructions(...)
  -> renderMemoryGovernanceInstructions(role, CODEX_PROMPT_DIALECT)
  -> .codex/agents/*.toml and root AGENTS block
```

Custom prompt flow:

```text
replacement prompt present:
  replacement after placeholder expansion only

append prompt present without replacement:
  dialect-rendered generated prompt
  -> model-family guidance
  -> user append prompt
```

## File Changes

- `src/agents/prompt-sections.ts`
  - Rewrite the orchestrator section to state ambient root ownership, decision
    authority, user-facing synthesis, user input, progress tracking,
    root-session memory, SDD gates, delegation boundaries, raw-dump
    prohibition, and concise communication rules.
  - Rewrite read-only specialist sections so explorer, librarian, and oracle
    share a clear read-only contract while retaining role-specific output:
    local anchors for explorer, sourced external evidence for librarian, and
    findings/risks/recommendations or accept/reject conclusions for oracle.
  - Rewrite write-capable specialist sections so designer owns UI/UX and visual
    QA, quick owns narrow mechanical edits, and deep owns correctness-critical
    implementation with local validation, edge cases, and verification.
  - Keep model-family, question-protocol, response-budget, step-budget, and
    subagent-rule section kinds unless a narrow new section is needed for
    capability disclosure placement.
- `src/agents/prompt-dialects.ts`
  - Preserve `OPENCODE_PROMPT_DIALECT`, `CODEX_PROMPT_DIALECT`, and
    `getPromptDialect`.
  - Add typed terminology only if needed by new prompt placeholders.
  - Keep unsupported dialect behavior as an error.
- `src/harness/core/memory-governance.ts`
  - Adjust instruction text only if prompt wording needs clearer root-only and
    subagent limits.
  - Preserve Codex diagnostics for role permissions, parent context injection,
    and memory write enforcement gaps.
- `src/harness/adapters/codex.ts`
  - Keep Codex root and role instructions generated from semantic sections.
  - Refine wrapper wording only to align with the rewritten prompt contracts and
    capability-gap requirements.
  - Do not change TOML artifact paths, model defaults, reasoning effort,
    bundled MCP config, hook diagnostics, or packaging behavior.
- `src/agents/orchestrator.ts`
  - Keep OpenCode as the default rendered dialect for the root agent.
  - Preserve `composeAgentPrompt` usage and append ordering.
- `src/agents/explorer.ts`, `src/agents/librarian.ts`,
  `src/agents/oracle.ts`, `src/agents/designer.ts`, `src/agents/quick.ts`,
  `src/agents/deep.ts`
  - Keep factory signatures, descriptions, colors, temperatures, model handling,
    and `composeAgentPrompt` calls unless tests show a mismatch with the new
    contract.
- `src/agents/index.ts`
  - No planned behavior change. It remains the OpenCode role assembly path and
    should continue applying model overrides, prompt overrides, step budgets, and
    Gemini defaults.
- `src/config/loader.ts`
  - No planned behavior change. Keep replacement and append discovery as
    `{agent}.md` and `{agent}_append.md`, including preset fallback.
- `src/agents/prompt-rendering.test.ts`
  - Update focused prompt assertions for all seven roles across OpenCode and
    Codex.
  - Add guards for raw-dump prohibition, root-session ownership, read-only
    mutation prohibition, write-capable verification obligations, visual QA
    ownership, Codex capability-gap wording, and absence of reference-role
    imports.
  - Keep custom composition assertions for replacement and append behavior.
- `src/agents/prompt-dialects.test.ts`
  - Keep or expand assertions for dialect terminology, unsupported dialect
    rejection, and Codex capability disclosures.
- `src/harness/adapters/codex.test.ts`
  - Keep or expand assertions that Codex memory governance is instruction-level
    when unsupported by runtime controls and that diagnostics are emitted.
- `src/config/loader.test.ts`
  - Keep existing prompt loading behavior tests; update only if the
    implementation touches prompt extension mechanics.
- Docs or generated guidance files
  - Update only if implementation changes user-facing prompt behavior, role
    contracts, or harness wording that docs quote or summarize.

## Interfaces / Contracts

- `createOrchestratorPromptSections(): RolePromptSection[]`
  - MUST render the active root as delegate-first coordinator, not an optional
    specialist.
  - MUST assign sequencing, synthesis, blocking user input, progress,
    root-session memory, and final outcome reporting to the root role.
  - MUST preserve the six-subagent roster and raw-dump prohibition.
- `createReadOnlySpecialistPromptSections(role): RolePromptSection[]`
  - MUST keep explorer, librarian, and oracle read-only.
  - MUST prohibit implementation, repository mutation, destructive git commands,
    and durable session-memory ownership.
  - MUST emit role-specific evidence output requirements.
- `createWriteCapableSpecialistPromptSections(role): RolePromptSection[]`
  - MUST keep designer, quick, and deep write-capable but bounded by role.
  - MUST require preserving unrelated working-tree changes and reporting focused
    verification.
  - MUST allow deterministic SDD artifact memory writes only when parent
    session/project and dispatch limits are present.
- `renderRolePrompt(sections, dialect): string`
  - MUST remain the single renderer used by OpenCode factories and Codex role
    rendering.
  - MUST not depend on broad exact-fragment adaptation from another harness.
- `composeAgentPrompt(...)`
  - MUST preserve replacement precedence over append.
  - MUST preserve generated prompt plus model-family guidance before user append
    text when no replacement prompt is present.
- `getPromptDialect(harness)`
  - MUST support OpenCode and Codex only for this change.
  - MUST reject unsupported harness ids rather than implying new harness
    support.
- `memoryGovernanceDiagnostics(...)`
  - MUST continue emitting visible Codex enforcement-gap diagnostics where
    runtime controls are instruction-only or unknown.

## Per-Role Design Intent

- Orchestrator/root coordinator
  - Make the ambient root session unmistakably responsible for decisions,
    sequencing, delegation, user questions, progress, root-session memory,
    synthesis, and final reporting.
  - Require bounded subagent prompts in English, internal handoffs before
    write-capable dispatch, SDD gates, and delegated verification.
  - Keep user-facing replies concise and in the user's language.
- Explorer
  - Focus on local repository discovery only.
  - Return anchors, symbols, candidate files, constraints, risks, verification
    targets, and confidence levels.
  - Avoid broad dumps, mutation, implementation, and durable memory ownership.
- Librarian
  - Focus on external docs and public examples where version sensitivity or
    unfamiliar APIs matter.
  - Prefer official docs, cite URLs, distinguish official guidance from
    community examples, and state applicability to thoth-agents.
  - Avoid inventing undocumented APIs or doing implementation work.
- Oracle
  - Remain read-only and advisory.
  - Provide review, diagnosis, security/correctness risk analysis, and SDD
    plan-review conclusions when asked.
  - Never produce SDD artifacts or edit files.
- Designer
  - Own user-facing UI, UX, interaction, responsive behavior, screenshots, and
    visual QA.
  - Require visual verification evidence when screens change.
  - Keep implementation bounded to the user-facing outcome.
- Quick
  - Own clear, narrow, low-risk, mechanical edits.
  - Follow provided anchors, avoid broad rediscovery, preserve unrelated
    working-tree changes, and run focused checks.
  - Escalate if the task becomes correctness-critical or under-specified.
- Deep
  - Own correctness-critical, multi-file, backend, data-flow, API, refactor, and
    edge-case-heavy work.
  - Validate local context against related files and call sites.
  - Use test-driven development or systematic debugging when behavior changes or
    bugs are involved, and verify before reporting completion.

## Testing Strategy

Focused tests should be updated before or alongside the prompt rewrite so
failures describe contract gaps rather than incidental wording changes.

Test coverage targets:

- OpenCode role rendering in `src/agents/prompt-rendering.test.ts`
  - all seven roles retain identity and mode
  - root prompt mentions root coordination, delegation roster, raw-dump
    prohibition, SDD gates, `task`, `question`, and `todowrite`
  - read-only prompts prohibit mutation and durable memory ownership
  - write-capable prompts require verification and working-tree preservation
- Codex role rendering in `src/agents/prompt-rendering.test.ts`
  - all seven roles use Codex terminology such as `request_user_input`,
    Codex custom-agent task, Codex progress tracking surface, and Codex subagent
    references
  - Codex prompts include instruction-level governance or capability-gap
    language where appropriate
  - tests fail on OpenCode-only leakage where Codex wording is expected
- Dialect tests in `src/agents/prompt-dialects.test.ts`
  - OpenCode and Codex tool terms remain explicit
  - unsupported dialect ids throw
  - Codex capability disclosures include instruction-only or diagnostic-only
    language
- Codex adapter tests in `src/harness/adapters/codex.test.ts`
  - rendered artifacts keep instruction-level memory governance when runtime
    enforcement is unsupported
  - diagnostics include memory enforcement, role permission, and parent context
    injection gaps
- Prompt composition tests in `src/agents/prompt-rendering.test.ts` and
  `src/config/loader.test.ts`
  - replacement prompt wins over append
  - append follows generated prompt
  - placeholder expansion remains intact
  - model-family guidance remains before user append text
- Scope guards
  - no generated prompt or test fixture introduces reference roles
  - no prompt-rendering fixture implies support for non-OpenCode/non-Codex
    harnesses

Exact verification commands:

```bash
pnpm test -- src/agents/prompt-rendering.test.ts
pnpm test -- src/agents/prompt-dialects.test.ts src/harness/adapters/codex.test.ts src/config/loader.test.ts
pnpm run check:ci
pnpm run typecheck
pnpm test
```

The focused prompt tests should run first during implementation. The full test
suite should run before reporting the change complete because prompt contracts
affect multiple generation paths.

## Migration / Rollout

No data migration is required. The rollout is source-only:

1. Update focused tests for the required prompt contracts.
2. Rewrite prompt section text and minimal dialect/adapter wording needed to
   satisfy the tests.
3. Keep OpenCode generation as the default path for `createAgents`.
4. Keep Codex artifacts generated through the Codex adapter and existing TOML
   writer behavior.
5. Update docs only where they quote or summarize changed prompt behavior.
6. Run the verification commands above and report failures or unsupported
   capability gaps explicitly.

Rollback is straightforward because the approved scope is limited to prompt
contracts, dialect wording, adapter wording, tests, and aligned docs. If one
harness regresses, revert the affected dialect/adapter wording first while
preserving shared prompt section improvements that pass both harnesses.

## Risks and Mitigations

- Prompt brittleness
  - Risk: tests fail on harmless prose edits or miss semantic regressions.
  - Mitigation: assert durable contract phrases and role-specific obligations,
    not full prompt snapshots.
- Codex/OpenCode drift
  - Risk: one harness gains or loses a rule silently.
  - Mitigation: render both harnesses from the same semantic sections and test
    both dialects for each role.
- Memory governance
  - Risk: subagents appear allowed to own root-session memory or root-only tools.
  - Mitigation: keep root-only tool wording explicit, preserve subagent
    parent-context requirements, and assert Codex diagnostics for
    instruction-only enforcement.
- SDD gates
  - Risk: prompt simplification weakens requirements-interview, artifact,
    plan-review, executing-plans, verification, or archive gates.
  - Mitigation: keep SDD gate language in the orchestrator contract and test the
    durable terms that identify those phases.
- User-facing verbosity
  - Risk: clearer contracts become too long or noisy in normal replies.
  - Mitigation: keep root communication style concise and move detailed rules
    into structured prompt sections and subagent output envelopes.
- Reference import creep
  - Risk: inspiration from Gentle-AI or oh-my-opencode-slim imports extra roles,
    command models, or permission assumptions.
  - Mitigation: document references as inspiration only, test the seven-role
    roster, and keep implementation within thoth-specific interfaces.

## Open Questions

- None blocking. During implementation, if a prompt requirement appears to need
  a new reusable harness concept, prefer adding a typed dialect field or section
  renderer over embedding harness conditionals in role prose.
