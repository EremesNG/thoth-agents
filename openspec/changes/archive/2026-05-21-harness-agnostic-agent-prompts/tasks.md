# Tasks: Harness-Agnostic Agent Prompts

## Notes, Non-Goals, and Safeguards

- Keep this change limited to prompt-generation contracts for OpenCode and Codex.
- Do not change the seven-agent roster, runtime delegation behavior, install targets,
  skill packaging, MCP configuration, permissions, TOML writer behavior, or SDD
  artifact governance except where prompt wording must stay accurate.
- Preserve OpenCode as the default rendered prompt contract for `createAgents(config)`.
- Avoid full-prompt snapshot or exact-prose parity tests; prefer contract phrases,
  role semantics, and renderer API tests so the new implementation does not replace
  one brittle prose dependency with another.
- Treat Codex capability gaps as explicit prompt-facing disclosures, not as a reason
  to weaken or rename role responsibilities.

## Phase 1: Typed Prompt Dialect and Section Model

- [x] 1.1 Add the typed prompt rendering seam — `src/agents/prompt-utils.ts`,
  `src/agents/prompt-dialects.ts` (new or equivalent),
  `src/agents/prompt-sections.ts` (new or equivalent)

  Define or re-export typed contracts equivalent to `HarnessPromptDialect`,
  `ToolNomenclature`, `CapabilityProfile`, semantic prompt sections, and pure
  section renderers. Keep compatibility exports from `prompt-utils.ts` where
  existing callers still depend on them, and keep placeholder replacement,
  model-family detection, step-budget behavior, and `composeAgentPrompt` behavior
  available.

  **Covers spec scenarios**: Shared policy avoids OpenCode-only tool names;
  Harness terminology remains representable; OpenCode wording is rendered from
  the OpenCode dialect; Codex wording is rendered from the Codex dialect.

  **Verification**:
  - Run: `bun test src/agents/prompt-rendering.test.ts`
  - Expected: New prompt renderer tests pass, proving semantic sections render
    OpenCode and Codex wording through dialect data without TypeScript runtime
    errors.
  - Run: `bun run typecheck`
  - Expected: No TypeScript errors from new prompt dialect, capability, or section
    interfaces.

- [x] 1.2 Define OpenCode and Codex dialect/capability wording —
  `src/agents/prompt-dialects.ts`, `src/harness/types.ts`,
  `src/harness/adapters/codex.ts`

  Centralize tool and role nomenclature for OpenCode terms such as `task`,
  `task_status`, `question`, `todowrite`, and `@role`, plus Codex terms such as
  `request_user_input`, Codex role agents, host status surfaces, and
  instruction-only capability disclosures derived from Codex capabilities.
  Unsupported harnesses remain out of scope.

  **Covers spec scenarios**: Harness limitations do not rewrite role identity;
  Codex wording is rendered from the Codex dialect; Unsupported harnesses remain
  out of scope for prompt rendering.

  **Verification**:
  - Run: `bun test src/agents/prompt-dialects.test.ts`
  - Expected: Dialect tests pass, proving OpenCode and Codex render distinct,
    explicit terminology and Codex exposes capability-gap language.
  - Run: `bun run typecheck`
  - Expected: Dialect types remain aligned with harness capability types and no
    additional harness id is introduced.

## Phase 2: Shared Prompt Utility Refactor with OpenCode Default Preserved

- [x] 2.1 Convert shared prompt utilities to semantic section factories —
  `src/agents/prompt-utils.ts`, `src/agents/prompt-sections.ts`

  Refactor shared policy constants such as question protocol, subagent rules,
  read-only/write-capable memory rules, response budgets, model-family sections,
  SDD/delegation guidance, visual QA guidance, verification guidance, and output
  contracts into semantic factories rendered by a harness dialect. Shared policy
  data must describe intent without hardcoding OpenCode-only tool names unless a
  section is explicitly harness-specific.

  **Covers spec scenarios**: Shared policy avoids OpenCode-only tool names;
  OpenCode rendering remains explicit and stable; Codex rendering uses Codex
  semantics without brittle adaptation.

  **Verification**:
  - Run: `bun test src/agents/prompt-rendering.test.ts`
  - Expected: Tests assert shared semantic policy inputs are neutral and rendered
    OpenCode prompts still include required OpenCode tool, delegation,
    user-question, memory, visual QA, and verification wording.
  - Run: `bun test src/harness/core/memory-governance.test.ts`
  - Expected: Memory governance diagnostics and rendered prompt wording continue
    to enforce orchestrator-owned and subagent-limited memory responsibilities.

- [x] 2.2 Preserve default OpenCode prompt behavior and custom prompt overrides —
  `src/agents/prompt-utils.ts`, `src/agents/index.ts`

  Ensure existing OpenCode agent creation uses the OpenCode dialect by default.
  Preserve `customPrompt` replacement semantics and `customAppendPrompt` append
  semantics after placeholder resolution and model-family rendering.

  **Covers spec scenarios**: OpenCode wording is rendered from the OpenCode
  dialect; Runtime behavior changes stay constrained to prompt contracts.

  **Verification**:
  - Run: `bun test src/agents/prompt-rendering.test.ts`
  - Expected: Tests prove OpenCode remains the default render target and custom
    prompt/append behavior is unchanged.
  - Run: `bun run typecheck`
  - Expected: Existing `createAgents(config)` call sites remain source-compatible.

## Phase 3: Seven-Agent Semantic Prompt Conversion

- [x] 3.1 Convert the orchestrator prompt to semantic sections —
  `src/agents/orchestrator.ts`, `src/agents/prompt-sections.ts`

  Convert `ORCHESTRATOR_PROMPT` into ordered semantic sections rendered through
  the OpenCode dialect by default. Preserve root-session coordination,
  sequencing, delegate-first routing, requirements-interview/SDD governance,
  plan-review gating, user-question protocol, memory ownership, progress
  tracking, and output constraints.

  **Covers spec scenarios**: All roles retain their semantic responsibilities;
  OpenCode rendering remains explicit and stable; Runtime behavior changes stay
  constrained to prompt contracts.

  **Verification**:
  - Run: `bun test src/agents/prompt-rendering.test.ts -t "orchestrator"`
  - Expected: Orchestrator contract tests pass, including OpenCode-specific
    `task`, `task_status`, `question`, `todowrite`, SDD, memory, and plan-review
    wording.
  - Run: `bun run typecheck`
  - Expected: Orchestrator exports and agent factory integration remain valid.

- [x] 3.2 Convert read-only specialist prompts to semantic sections —
  `src/agents/explorer.ts`, `src/agents/librarian.ts`, `src/agents/oracle.ts`,
  `src/agents/prompt-sections.ts`

  Convert explorer, librarian, and oracle prompts while preserving read-only
  boundaries, dispatch method expectations, evidence-focused output, no-workspace
  mutation constraints, plan-review-only responsibilities for oracle, and memory
  limitations for child agents.

  **Covers spec scenarios**: All roles retain their semantic responsibilities;
  Harness limitations do not rewrite role identity; OpenCode rendering remains
  explicit and stable.

  **Verification**:
  - Run: `bun test src/agents/prompt-rendering.test.ts -t "read-only"`
  - Expected: Read-only role tests pass for explorer, librarian, and oracle role
    nature, mode, dispatch, memory, and output contracts.
  - Run: `bun run typecheck`
  - Expected: Converted read-only role prompt modules compile without API drift.

- [x] 3.3 Convert write-capable specialist prompts to semantic sections —
  `src/agents/designer.ts`, `src/agents/quick.ts`, `src/agents/deep.ts`,
  `src/agents/prompt-sections.ts`

  Convert designer, quick, and deep prompts while preserving write-capable
  boundaries, synchronous dispatch, role-specific verification expectations,
  screenshot/browser exclusivity for designer, narrow implementation constraints
  for quick, thorough correctness-critical implementation constraints for deep,
  destructive git command prohibitions, and concise structured output contracts.

  **Covers spec scenarios**: All roles retain their semantic responsibilities;
  OpenCode rendering remains explicit and stable; Runtime behavior changes stay
  constrained to prompt contracts.

  **Verification**:
  - Run: `bun test src/agents/prompt-rendering.test.ts -t "write-capable"`
  - Expected: Write-capable role tests pass for designer, quick, and deep role
    nature, mode, safety, visual QA, verification, and output contracts.
  - Run: `bun run typecheck`
  - Expected: Converted write-capable role prompt modules compile without API
    drift.

## Phase 4: Codex Dialect Rendering Path

- [x] 4.1 Render Codex root and subagent prompts from semantic sections —
  `src/harness/adapters/codex.ts`, `src/harness/core/agent-pack.ts`,
  `src/agents/prompt-sections.ts`, `src/agents/prompt-dialects.ts`

  Replace Codex role prompt generation based on
  `codexAdaptOpenCodePrompt(findOpenCodeAgentPrompt(...))` with Codex dialect
  rendering. Keep `CODEX_CAPABILITIES`, model defaults, reasoning effort,
  artifact paths, diagnostics, skill package artifacts, MCP payloads, hook
  diagnostics, and unsupported harness behavior unchanged. Add prompt-facing
  metadata to `agent-pack.ts` only if needed to avoid duplication, without
  changing role names, modes, or dispatch meanings.

  **Covers spec scenarios**: Codex wording is rendered from the Codex dialect;
  Codex generation survives OpenCode prose changes; Codex rendering uses Codex
  semantics without brittle adaptation; Harness limitations do not rewrite role
  identity.

  **Verification**:
  - Run: `bun test src/harness/adapters/codex.test.ts`
  - Expected: Codex adapter tests pass with Codex root and subagent prompts
    produced through semantic rendering while existing artifact path, TOML, model,
    skill, MCP, hook, diagnostic, and unsupported-harness coverage remains green.
  - Run: `bun run typecheck`
  - Expected: Codex adapter no longer requires OpenCode prompt lookup to render
    Codex instructions.

- [x] 4.2 Remove or isolate brittle Codex exact-prose adaptation —
  `src/harness/adapters/codex.ts`, `src/harness/adapters/codex.test.ts`

  Delete `codexAdaptOpenCodePrompt` if no longer needed, or reduce it to a
  deprecated compatibility helper that the Codex export path does not call.
  Replace tests that assert broad OpenCode prose substitutions with tests proving
  Codex generation does not depend on exact OpenCode sentences or paragraphs.

  **Covers spec scenarios**: Avoid Codex prompt adaptation by exact OpenCode
  prose replacement; Codex generation survives OpenCode prose changes; OpenCode-
  only phrases do not leak into Codex shared policy output.

  **Verification**:
  - Run: `bun test src/harness/adapters/codex.test.ts -t "prompt"`
  - Expected: Focused Codex prompt tests fail if the Codex generation path calls
    broad OpenCode adaptation or leaks unframed OpenCode-only terms into Codex
    shared policy wording.
  - Run: `bun test src/agents/prompt-rendering.test.ts -t "Codex"`
  - Expected: Renderer-level Codex tests pass even when OpenCode contract phrases
    are asserted independently of Codex output.

## Phase 5: Prompt Contract and Governance Test Coverage

- [x] 5.1 Add focused OpenCode and Codex prompt rendering tests —
  `src/agents/prompt-rendering.test.ts` (new or equivalent),
  `src/agents/prompt-dialects.test.ts` (new or equivalent)

  Cover all seven role prompts for role nature, mode, scope, output expectations,
  safety rules, harness terminology, capability disclosures, and neutral shared
  policy source. Assert key contract phrases, not entire prompt snapshots.

  **Covers spec scenarios**: OpenCode rendering remains explicit and stable;
  Codex rendering uses Codex semantics without brittle adaptation; All roles
  retain their semantic responsibilities; Harness terminology remains
  representable.

  **Verification**:
  - Run: `bun test src/agents/prompt-rendering.test.ts`
  - Expected: All semantic prompt contract tests pass for OpenCode and Codex.
  - Run: `bun test src/agents/prompt-dialects.test.ts`
  - Expected: Dialect and capability disclosure tests pass for supported harnesses
    only.

- [x] 5.2 Update existing Codex and memory governance tests —
  `src/harness/adapters/codex.test.ts`,
  `src/harness/core/memory-governance.test.ts`

  Update Codex assertions from OpenCode role contracts with Codex text adaptation
  to semantic Codex rendering. Keep memory governance tests and add coverage that
  neutral governance contracts render through harness-specific wording for
  OpenCode and Codex without weakening orchestrator-owned memory rules.

  **Covers spec scenarios**: Codex rendering uses Codex semantics without brittle
  adaptation; OpenCode-only phrases do not leak into Codex shared policy output;
  Verify OpenCode and Codex prompt contracts with focused tests.

  **Verification**:
  - Run: `bun test src/harness/adapters/codex.test.ts`
  - Expected: Codex adapter tests pass without exact OpenCode prose replacement
    assertions.
  - Run: `bun test src/harness/core/memory-governance.test.ts`
  - Expected: Memory governance tests pass for existing diagnostics and new
    harness-specific prompt wording coverage.

## Phase 6: Focused and Full Verification

- [x] 6.1 Run focused prompt and governance verification — prompt rendering,
  Codex adapter, memory governance

  Execute the smallest sufficient focused test set before full-suite checks and
  fix any prompt contract regressions without broadening scope.

  **Covers spec scenarios**: Verify OpenCode and Codex prompt contracts with
  focused tests; Keep harness-agnostic prompt work within approved scope.

  **Verification**:
  - Run: `bun test src/agents/prompt-rendering.test.ts`
  - Expected: All semantic prompt rendering tests pass.
  - Run: `bun test src/agents/prompt-dialects.test.ts`
  - Expected: All dialect tests pass.
  - Run: `bun test src/harness/adapters/codex.test.ts`
  - Expected: Codex adapter tests pass.
  - Run: `bun test src/harness/core/memory-governance.test.ts`
  - Expected: Memory governance tests pass.

- [x] 6.2 Run repository-level verification — TypeScript, Biome, and full tests

  Validate the completed change against the project commands defined in
  `package.json` and inspect any failures for prompt-contract or unrelated
  baseline issues before reporting completion.

  **Covers spec scenarios**: Runtime behavior changes stay constrained to prompt
  contracts; Unsupported harnesses remain out of scope for prompt rendering;
  Verify OpenCode and Codex prompt contracts with focused tests.

  **Verification**:
  - Run: `bun run typecheck`
  - Expected: TypeScript completes with no errors.
  - Run: `bun run check:ci`
  - Expected: Biome check completes with no formatting or lint errors.
  - Run: `bun test`
  - Expected: Full Bun test suite passes, including prompt, harness, and existing
    regression tests.
