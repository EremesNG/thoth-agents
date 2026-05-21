# Design: Harness-Agnostic Agent Prompts

## Technical Approach

Refactor prompt generation from role-specific monolithic OpenCode prompt strings
plus Codex post-processing into a typed semantic prompt layer that renders through
explicit harness dialects. The implementation should keep the existing seven
agent factories and runtime roster intact, but change their prompt source from
raw harness prose to ordered semantic sections.

The target shape is:

1. Define reusable prompt contracts in `src/agents/prompt-utils.ts` or a new
   adjacent module such as `src/agents/prompt-sections.ts`:
   - `HarnessPromptDialect`: selected harness id, tool nomenclature, role
     reference style, dispatch phrases, user-question phrases, and capability
     disclosures.
   - `ToolNomenclature`: neutral concept names mapped to concrete wording for
     delegation, user input, progress tracking, background status, memory tools,
     visual QA, and verification.
   - `CapabilityProfile`: typed capabilities already represented by
     `HarnessCapabilities`, with prompt-facing disclosure text for
     instruction-only or unknown enforcement.
   - `PromptSectionRenderer`: pure functions that receive semantic section data
     plus a dialect and return prompt text.
2. Convert shared policy constants such as `QUESTION_PROTOCOL`,
   `SUBAGENT_RULES`, read-only/write-capable memory rules, response budgets, and
   model-family sections into semantic section factories. The shared factories
   describe intent, while dialect renderers insert explicit OpenCode or Codex
   tool names.
3. Convert each role prompt file to compose role-local semantic sections with a
   default OpenCode dialect. This preserves current OpenCode behavior while
   removing OpenCode-only terms from neutral shared policy definitions.
4. Update the Codex adapter to render Codex prompts from the same semantic role
   sections and `getAgentPackContract()` data instead of calling
   `codexAdaptOpenCodePrompt(findOpenCodeAgentPrompt(...))`.
5. Leave artifact generation, TOML writer behavior, skill packaging, MCP
   configuration, permissions, and runtime delegation behavior unchanged.

## Architecture Decisions

### Decision: Introduce typed dialect rendering as the prompt seam

**Choice**: Add an explicit prompt rendering seam with types equivalent to
`HarnessPromptDialect`, `ToolNomenclature`, `CapabilityProfile`, and
`PromptSectionRenderer`, and expose OpenCode and Codex dialect instances.

**Alternatives considered**: Continue broad `.replaceAll()` adaptation in
`src/harness/adapters/codex.ts`; maintain two fully separate prompt trees; or
only add more targeted string replacements.

**Rationale**: The spec requires Codex wording to survive OpenCode prose changes
and requires shared policy to avoid hardcoded OpenCode-only tool names.
Replacement-based adaptation is brittle and has already coupled Codex prompt
correctness to exact OpenCode wording. Separate prompt trees would reduce
coupling but risk policy drift. Typed dialect rendering keeps a single semantic
policy source while making harness-specific wording explicit and testable.

### Decision: Preserve OpenCode as the default rendered prompt contract

**Choice**: Existing `create*Agent` functions should continue returning
OpenCode-ready prompts by default, using the OpenCode dialect internally.

**Alternatives considered**: Require every caller to pass a harness id; or move
all agent creation behind harness adapters in one change.

**Rationale**: The current plugin runtime is OpenCode-first. Default OpenCode
rendering minimizes runtime behavior changes and avoids broad call-site churn in
`src/agents/index.ts`, permission presets, and configuration overrides.

### Decision: Codex adapter consumes semantic renderers, not OpenCode prompts

**Choice**: Replace `codexAdaptOpenCodePrompt` usage with a Codex prompt render
call such as `renderAgentPrompt({ role, dialect: CODEX_PROMPT_DIALECT, ... })`.
`codexAdaptOpenCodePrompt` should be deleted or reduced to a deprecated, unused
compatibility helper guarded by tests that fail if the Codex path calls it.

**Alternatives considered**: Keep `findOpenCodeAgentPrompt()` and make the
adapter replace only placeholder tokens; or adapt OpenCode generated prompts
through an AST-like intermediate string format.

**Rationale**: The spec explicitly forbids dependence on exact OpenCode prose
replacement. Rendering Codex from semantic sections also lets capability-gap
language come from `CODEX_CAPABILITIES` rather than from ad-hoc appended notes.

### Decision: Keep role identity in role contracts and prompt sections together

**Choice**: Continue using `src/harness/core/agent-pack.ts` as the structured
roster contract for harness artifacts, while role prompt files retain role-local
responsibility, output, and specialty guidance as semantic sections.

**Alternatives considered**: Move all role prompt content into
`agent-pack.ts`; or keep `agent-pack.ts` only for Codex TOML metadata.

**Rationale**: `agent-pack.ts` already captures stable role identity,
permissions, dispatch mode, and verification summary. Role files contain richer
operational instructions and model-profile composition. Splitting stable role
contracts from full prompt sections avoids overloading one data structure while
preserving the seven-agent nature across harnesses.

### Decision: Model capability gaps as prompt-facing renderer inputs

**Choice**: Codex-specific instruction-only language for delegation, role
permissions, parent context injection, memory governance, and hooks should be
rendered from `CODEX_CAPABILITIES` through the Codex dialect/capability profile.

**Alternatives considered**: Hardcode capability warnings inside each Codex role
prompt or rely only on diagnostics.

**Rationale**: Diagnostics are important but do not appear inside generated
agent instructions. Prompt-facing capability disclosures ensure Codex agents see
accurate limitations without weakening or renaming the role contract.

## Data Flow

```text
role semantic sections
  + shared semantic policies
  + model-family section
  + optional custom prompt / append prompt
  + HarnessPromptDialect + CapabilityProfile
      -> renderAgentPrompt(...)
          -> OpenCode: createAgents(...).config.prompt
          -> Codex: renderCodexRootInstructions(...) and .codex/agents/*.toml
```

OpenCode runtime flow remains `createAgents(config)` -> OpenCode SDK agent
configs. Codex export flow remains `codexAdapter.render(context)` -> harness
artifacts, but Codex role instructions are produced by semantic rendering rather
than `findOpenCodeAgentPrompt()` plus `codexAdaptOpenCodePrompt()`.

Custom prompt override behavior must be preserved: if `customPrompt` is present,
it replaces the rendered base prompt after placeholder resolution; if
`customAppendPrompt` is present, it is appended after dialect-rendered base and
model-family sections.

## File Changes

- `src/agents/prompt-utils.ts`
  - Keep existing utility exports where callers need them, but introduce or
    re-export the typed dialect/rendering interfaces.
  - Replace shared OpenCode-specific constants with neutral section factories or
    renderer-compatible section data.
  - Preserve `composeAgentPrompt`, placeholder replacement, model-family
    detection, and step-budget behavior.
- `src/agents/prompt-dialects.ts` (new, or equivalent)
  - Define `OPENCODE_PROMPT_DIALECT` and `CODEX_PROMPT_DIALECT`.
  - Centralize tool and role nomenclature: `task`, `task_status`, `question`,
    `todowrite`, `@designer`, and Codex equivalents such as
    `request_user_input`, Codex role agents, and host status surfaces.
  - Centralize instruction-only capability disclosures for Codex.
- `src/agents/prompt-sections.ts` (new, or equivalent)
  - Define semantic section descriptors and renderers for role, mode,
    responsibility, shared subagent rules, memory governance, question protocol,
    response budgets, SDD/delegation, visual QA, verification, and output
    contracts.
  - Provide a `renderAgentPrompt` or `renderRolePrompt` API used by both
    OpenCode agent factories and Codex adapter.
- `src/agents/orchestrator.ts`
  - Convert `ORCHESTRATOR_PROMPT` from a raw OpenCode prompt into ordered
    semantic sections rendered with the OpenCode dialect by default.
  - Ensure SDD, dispatch, question, memory, and routing wording still render
    explicit OpenCode instructions for normal plugin use.
- `src/agents/explorer.ts`, `src/agents/librarian.ts`, `src/agents/oracle.ts`,
  `src/agents/designer.ts`, `src/agents/quick.ts`, `src/agents/deep.ts`
  - Convert each role prompt to semantic role-local sections.
  - Preserve mode, scope, responsibilities, read-only/write-capable constraints,
    output envelopes, and role-specific verification expectations.
- `src/agents/index.ts`
  - Minimal or no behavior change. If a new render option is required, keep
    OpenCode as the default so `createAgents(config)` remains compatible.
- `src/harness/adapters/codex.ts`
  - Remove the Codex path's dependence on `codexAdaptOpenCodePrompt` and
    `findOpenCodeAgentPrompt`.
  - Render subagent TOML `developer_instructions` and root instructions with the
    Codex dialect.
  - Keep `CODEX_CAPABILITIES`, model defaults, reasoning effort, artifact paths,
    diagnostics, skill packaging, MCP config, and hook diagnostics unchanged.
- `src/harness/core/agent-pack.ts`
  - Keep role roster stable. Add prompt-facing metadata only if needed to avoid
    duplication, without changing role names, modes, or dispatch meanings.
- `src/harness/adapters/codex.test.ts`
  - Update assertions from "OpenCode role contracts with Codex tool adaptations"
    to semantic Codex rendering.
  - Add regression coverage that Codex prompt generation does not call or depend
    on exact OpenCode prose replacements.
  - Update deterministic fixtures after behavior-preserving prompt rendering
    changes.
- `src/harness/core/memory-governance.test.ts`
  - Keep existing governance tests and add coverage that neutral governance
    contracts are rendered through harness-specific wording.
- Optional new tests: `src/agents/prompt-rendering.test.ts` or
  `src/agents/prompt-dialects.test.ts`
  - Assert shared policy source is neutral and harness renderings are explicit.

## Interfaces / Contracts

Suggested TypeScript shape:

```ts
export interface ToolNomenclature {
  delegationTool: string;
  backgroundDelegationTool?: string;
  backgroundStatusTool?: string;
  userQuestionTool: string;
  progressTool: string;
  roleReference(role: AgentPromptRole): string;
}

export interface CapabilityProfile {
  capabilities: HarnessCapabilities;
  renderCapabilityDisclosure(capability: keyof HarnessCapabilities):
    | string
    | undefined;
}

export interface HarnessPromptDialect {
  harness: HarnessId;
  tools: ToolNomenclature;
  capabilities: CapabilityProfile;
  dispatchLabel(method: AgentDispatchMethod): string;
  renderRoleInvocation(role: AgentPromptRole): string;
}

export interface PromptSectionRenderer<TSection> {
  render(section: TSection, dialect: HarnessPromptDialect): string;
}
```

These names may be adjusted during implementation, but the seam must remain
typed and harness-specific wording must be data-driven or renderer-driven rather
than exact-prose replacement.

Unsupported harness behavior remains governed by `HarnessId = 'opencode' |
'codex'` and existing unsupported harness diagnostics. This change must not add
third-harness fixtures, generated prompts, or runtime support.

## Testing Strategy

- Add unit tests for shared semantic section neutrality:
  - shared policy section data/render inputs do not contain OpenCode-only tool
    names for delegation, user-question, visual QA, memory, or verification
    unless the section is explicitly OpenCode-specific.
  - OpenCode and Codex dialects render the same semantic section with distinct,
    explicit tool wording.
- Add OpenCode prompt contract tests:
  - all seven rendered prompts preserve current role nature, mode, scope, output
    expectations, and safety rules.
  - OpenCode prompts still include explicit `task`, `task_status`, `question`,
    `todowrite`, and `@role` wording where appropriate.
- Add Codex prompt contract tests:
  - Codex root and subagent prompts include `request_user_input`, Codex role
    agent wording, and instruction-only capability-gap language.
  - Codex prompts do not contain OpenCode-only phrases except explicit
    compatibility notes.
  - Codex generation still works if an OpenCode prompt sentence changes, proven
    by removing tests that assert adaptation from OpenCode prose and adding tests
    against the renderer API.
- Preserve existing harness tests:
  - Codex artifact paths, model defaults, TOML fields, skill package artifacts,
    MCP payloads, hook diagnostics, memory governance diagnostics, and
    unsupported harness behavior.
- Verification commands for implementation:
  - `bun test src/harness/adapters/codex.test.ts`
  - `bun test src/harness/core/memory-governance.test.ts`
  - `bun test` when prompt fixture updates are complete
  - `bun run typecheck`
  - `bun run check:ci`

## Migration / Rollout

1. Introduce dialect/rendering types and OpenCode dialect without changing any
   exported runtime behavior.
2. Move shared prompt utilities to semantic factories while keeping exported
   names or compatibility wrappers where needed by role files.
3. Convert one leaf agent, preferably `deep`, to the semantic renderer and prove
   OpenCode prompt parity for key contract phrases.
4. Convert the remaining six role prompts and add OpenCode role-preservation
   tests.
5. Switch Codex root and subagent prompt generation to the Codex dialect.
6. Remove or isolate `codexAdaptOpenCodePrompt` and update tests/fixtures so
   Codex coverage proves semantic rendering, not string adaptation.
7. Run focused tests first, then full typecheck, Biome check, and full test
   suite.

Rollback is straightforward because OpenCode remains the baseline rendering
target: revert the semantic renderer and role prompt conversions, restore the
existing prompt constants and Codex adapter path, and keep any tests that reveal
prompt-contract regressions for future attempts.

## Open Questions

- Should the prompt renderer live entirely under `src/agents/` or should shared
  harness-facing types be placed under `src/harness/core/`? Recommended default:
  keep prompt rendering under `src/agents/` and import harness capability types
  from `src/harness/types.ts` to avoid making agent creation depend on adapter
  internals.
- Should the legacy exported constants remain available during migration?
  Recommended default: keep compatibility exports until all local references and
  tests are converted, then remove them only if no external imports are expected.
- How strict should prompt parity tests be for OpenCode? Recommended default:
  assert key contract phrases and role semantics, not full prompt snapshots, to
  avoid replacing one brittle exact-prose dependency with another.
