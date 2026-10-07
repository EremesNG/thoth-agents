# Tasks: Codex Subagent Model Defaults

## Non-goals

- Do not change OpenCode agent behavior, defaults, prompts, permissions, or runtime fallback behavior.
- Do not emit a Codex root/orchestrator model default.
- Do not emit an opinionated generated root `model` default in `.codex/config.toml`; any user-configured root model setting is separate from generated subagent defaults and must not be introduced by this change.
- Do not implement provider-per-agent overrides unless Codex documentation and surface validation explicitly confirm that field.
- Do not add Claude, Antigravity, or other harness behavior.

## Phase 1: Surface and override foundation

- [x] 1.1 Confirm the validated Codex agent TOML surface permits the fields this change will emit — `src/harness/adapters/codex-surfaces.ts`, `docs/codex-surface-validation.md`
  **Verification**:
  - Run: `bun test -t "Codex TOML writer"`
  - Expected: `project-agent-toml` accepts `model` and `model_reasoning_effort`; unvalidated fields still warn and are skipped.

- [x] 1.2 Design the smallest opt-in override path before implementation — `src/config/schema.ts`, `src/harness/types.ts`, `src/harness/adapters/codex.ts`
  **Verification**:
  - Run: `bun run typecheck`
  - Expected: The chosen shape is typed without widening to `any`, reuses existing per-agent `model` override semantics where possible, and does not require provider-per-agent support.
  **Acceptance evidence**:
  - If existing `agents.<role>.model` config can be threaded into Codex generation, document that decision in code/tests and use it.
  - If it cannot be safely reused, add only the minimal Codex-specific opt-in shape needed for per-subagent model overrides before emitting override behavior.

## Phase 2: Codex default model emission

- [x] 2.1 Add a Codex-only subagent model default map — `src/harness/adapters/codex.ts`
  **Verification**:
  - Run: `bun test -t "Codex adapter"`
  - Expected: Generated Codex subagent TOML includes defaults for `oracle = gpt-5.5`, `librarian = gpt-5.4-mini`, `explorer = gpt-5.4-mini`, `designer = gpt-5.4-mini`, `quick = gpt-5.4-mini`, and `deep = gpt-5.5`; `.codex/agents/orchestrator.toml` has no `model` field.

- [x] 2.2 Emit `model_reasoning_effort` only when surface validation supports it — `src/harness/adapters/codex.ts`, `src/harness/writers/codex-toml.ts`
  **Verification**:
  - Run: `bun test -t "Codex TOML writer"`
  - Expected: `model_reasoning_effort` appears for validated `project-agent-toml` generation, remains skipped with a diagnostic if removed from the validated field list in test coverage, and no unvalidated fields are silently emitted.

- [x] 2.3 Keep Codex root config model-neutral while applying subagent defaults — `src/harness/adapters/codex.ts`, Codex root config generation/tests
  **Verification**:
  - Run: `bun test -t "Codex adapter"`
  - Expected: Generated `.codex/config.toml` contains no unintended root `model` default when subagent defaults are applied, `.codex/agents/orchestrator.toml` still has no `model` field, and default `model` entries appear only in `.codex/agents/*.toml` for non-orchestrator subagents.
  **Acceptance evidence**:
  - If an existing user-configured root model setting is supported elsewhere, tests or documented evidence show it remains separate from generated subagent defaults and is not introduced by this change.

- [x] 2.4 Preserve OpenCode behavior — `src/harness/adapters/opencode.test.ts`
  **Verification**:
  - Run: `bun test -t "OpenCode harness adapter"`
  - Expected: OpenCode adapter output still equals `getAgentConfigs()` and no Codex model defaults leak into OpenCode artifacts.

## Phase 3: Tests, fixtures, and override evidence

- [x] 3.1 Add focused adapter tests for generated Codex model defaults and omission of orchestrator/root model — `src/harness/adapters/codex.test.ts`
  **Verification**:
  - Run: `bun test -t "Codex adapter"`
  - Expected: Tests assert each subagent default model, assert orchestrator TOML omits `model`, assert generated `.codex/config.toml` omits any unintended root `model`, and fail on missing or swapped role defaults.
  **Acceptance evidence**:
  - Test output covers generated TOML samples for all six non-orchestrator subagents, the orchestrator omission, and the root `.codex/config.toml` model-neutral artifact.

- [x] 3.2 Add override tests using the supported config shape from Phase 1 — `src/harness/adapters/codex.test.ts`, `src/config/loader.test.ts` if config loading is involved
  **Verification**:
  - Run: `bun test -t "Codex adapter"`
  - Expected: A configured subagent model override replaces the default for that role only, unconfigured subagents keep their defaults, and orchestrator/root remains without a generated model unless an independently user-configured root model already exists through a documented root config path.

- [x] 3.3 Update deterministic Codex fixtures to prove emitted TOML — `src/harness/__fixtures__/codex/agent-deep.toml` and additional Codex agent fixtures if needed
  **Verification**:
  - Run: `bun test -t "matches deterministic Codex agent"`
  - Expected: Fixture assertions show `model = "gpt-5.5"` for deep, preserve `model_reasoning_effort = "high"`, and keep fixture ordering deterministic.

## Phase 4: Documentation

- [x] 4.1 Add the Codex model customization user guide — `docs/codex-model-customization.md`
  **Verification**:
  - Run: `bun run check:ci`
  - Expected: Documentation passes Biome checks and includes where generated fields appear, how to change models per subagent, how inheritance works when fields are omitted, how custom providers are configured in Codex, and the provider-per-agent limitation.
  **Acceptance evidence**:
  - The guide explicitly names `.codex/agents/{role}.toml`, `model`, `model_reasoning_effort`, Codex global/project `model_provider` plus `[model_providers.<id>]`, and states provider-per-agent override is validation-required/not docs-confirmed.

- [x] 4.2 Link the new guide from existing Codex surface documentation — `docs/codex-surface-validation.md`
  **Verification**:
  - Run: `bun run check:ci`
  - Expected: Existing surface validation docs point users to the customization guide without changing validated/unsupported surface claims.

## Phase 5: Final verification

- [x] 5.1 Run focused Codex adapter, TOML, and fixture checks — Codex harness tests
  **Verification**:
  - Run: `bun test -t "Codex adapter" && bun test -t "Codex TOML writer" && bun test -t "matches deterministic Codex agent"`
  - Expected: Focused tests pass and provide evidence for defaults, overrides, root `.codex/config.toml` model-neutral behavior, fixture TOML, and surface validation behavior.

- [x] 5.2 Run repository quality gates — all touched TypeScript and docs
  **Verification**:
  - Run: `bun run typecheck && bun run check:ci && bun test`
  - Expected: TypeScript typecheck, Biome check, and the full Bun test suite pass.
