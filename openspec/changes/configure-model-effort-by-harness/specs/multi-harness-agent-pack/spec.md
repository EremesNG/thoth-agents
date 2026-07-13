# Multi-Harness Agent Pack Delta Specification

## Assumptions

- Model selection already exists per role and remains independently configurable from reasoning effort.
- `inherit` is the neutral effort state and means that thoth-agents does not force a harness-specific effort override.
- Persisted or input `null` and `default` effort values normalize to `inherit`; they are not explicit effort levels.
- Effort values are open strings validated against the selected model and harness at runtime; there is no global effort enum.
- Harness capabilities can be normalized for presentation while preserving harness-specific output contracts.
- The persisted state schema version remains `v1`; optional fields are backward compatible.
- The documented Codex subagent effort surface is `none|minimal|low|medium|high|xhigh|max|ultra`; model metadata further narrows this set.
- For OpenCode, a "confirmed" effort means both that the selected model publishes the value in validated `models.dev` metadata and that the active OpenCode runtime can represent it through a variant or supported provider option.
- Claude Code aliases (`sonnet`, `opus`, `haiku`, and `inherit`) do not map to a stable concrete `models.dev` record, so alias effort selection follows Claude Code's official frontmatter contract and leaves runtime downgrading to Claude Code.

## Requirements

### Requirement: Neutral role effort configuration

The configuration model MUST represent each role's reasoning effort independently from its model, MUST support `inherit` as the neutral value, MUST normalize omitted, `null`, and `default` effort inputs to `inherit`, and MUST validate explicit effort strings dynamically without a global closed enum.

#### Scenario: Role inherits harness behavior

- **GIVEN** a role has a configured model and no explicit effort
- **WHEN** configuration is loaded or generated
- **THEN** the system MUST preserve the model and MUST allow the harness's default effort behavior to apply

#### Scenario: Explicit effort changes independently

- **GIVEN** a role has a configured model
- **WHEN** a supported explicit effort is selected for that role
- **THEN** the system MUST update the role's effort without changing its model

#### Scenario: Effort returns to neutral

- **GIVEN** a role has an explicit effort override
- **WHEN** the role effort is set to `inherit`
- **THEN** the system MUST clear the emitted harness-specific effort override while preserving the role's model

#### Scenario: Null or default effort normalizes to inherit

- **GIVEN** a TUI, CLI, or persisted role effort is omitted, `null`, or `default`
- **WHEN** role effort configuration is normalized
- **THEN** the system MUST treat it as `inherit`, MUST emit no explicit harness effort override, and MUST preserve the role's model

### Requirement: Interactive effort configuration

The TUI configuration flow MUST include an effort-selection step after model selection, MUST constrain choices to the selected harness and model capabilities, and MUST offer `inherit` even when no explicit effort values are supported.

#### Scenario: User configures effort in the TUI

- **GIVEN** a user selects a harness, role, and model in the TUI
- **WHEN** the effort step is displayed
- **THEN** the TUI MUST show `inherit` plus only the explicit effort values supported for that harness and model

#### Scenario: Model has no explicit effort support

- **GIVEN** the selected harness and model expose no explicit supported effort values
- **WHEN** the effort step is displayed
- **THEN** the TUI MUST offer `inherit` and MUST NOT invent an effort value

### Requirement: Non-interactive role effort configuration

The CLI MUST support repeatable `--role-effort role=effort` input, MUST validate the role and effort against the selected harness and role model, and MUST preserve roles not named by the option.

#### Scenario: Valid CLI effort override

- **GIVEN** a role has a selected model and the requested effort is supported
- **WHEN** `--role-effort role=effort` is provided
- **THEN** the CLI MUST persist and generate that role's effort override without changing unrelated roles

#### Scenario: Invalid CLI effort override

- **GIVEN** the role is unknown, the syntax is malformed, or the effort is unsupported for the selected harness and model
- **WHEN** `--role-effort role=effort` is processed
- **THEN** the CLI MUST reject the value with an actionable validation error and MUST NOT partially apply it

### Requirement: Backward-compatible state persistence

State schema `v1` MUST accept optional per-harness role-effort maps, MUST interpret absent maps and absent role entries as `inherit`, and MUST preserve existing model-only state.

#### Scenario: Existing model-only v1 state loads

- **GIVEN** a valid `v1` state contains role model mappings but no effort maps
- **WHEN** the state is loaded
- **THEN** the loader MUST preserve all model mappings and MUST interpret every missing effort as `inherit`

#### Scenario: Optional effort maps round-trip

- **GIVEN** a valid `v1` state contains optional per-harness role-effort entries
- **WHEN** the state is loaded and saved
- **THEN** the system MUST preserve supported explicit entries and MUST NOT require entries for roles using `inherit`

### Requirement: Codex effort contract

For a Codex role whose selected model resolves to an exact `openai/<model>` record, Codex choices and generation MUST use the intersection between values published by that record's validated `reasoning_options` entry of type `effort` and the documented Codex subagent effort surface `none|minimal|low|medium|high|xhigh|max|ultra`. The generator MUST emit the selected intersection value unchanged as `model_reasoning_effort`, MUST emit no override for `inherit`, and MUST NOT infer missing or undocumented values.

#### Scenario: Supported Codex effort is selected

- **GIVEN** the selected Codex model's exact OpenAI catalog record publishes the requested effort and the effort belongs to the documented Codex subagent surface
- **WHEN** Codex configuration is generated
- **THEN** the generator MUST emit that exact value as the role's `model_reasoning_effort`

#### Scenario: Unsupported Codex effort is supplied

- **GIVEN** a Codex role is assigned an explicit effort absent from either the selected model's exact OpenAI catalog record or the documented Codex subagent surface
- **WHEN** configuration is validated
- **THEN** the system MUST reject the effort with an actionable error and MUST NOT emit or approximate it

#### Scenario: Extended Codex effort is model-published

- **GIVEN** the selected Codex model publishes `none`, `max`, or `ultra` in its effort values
- **WHEN** choices are presented or that value is validated
- **THEN** the system MUST offer and accept the published value
- **AND** it MUST NOT offer `none`, `max`, or `ultra` when the selected model does not publish it

#### Scenario: Codex model has no exact OpenAI effort record

- **GIVEN** the selected Codex model cannot be resolved to an exact validated `openai/<model>` record with an effort option
- **WHEN** effort choices are presented
- **THEN** the system MUST offer `inherit` only and MUST NOT invent an explicit effort list

### Requirement: OpenCode confirmed-variant contract

OpenCode generation MUST emit an effort-derived override only when the selected model publishes the requested value in validated `models.dev` metadata and the active OpenCode runtime can represent that value through a generated variant or supported provider option. If either condition fails, validation MUST return an actionable error and generation MUST emit no unsupported override. Generation MUST clear a previously generated effort override when the new effective effort is `inherit`, absent, unsupported, unrepresentable, or stale.

OpenCode effort ownership MUST be recorded in an additive version-1 managed-state sidecar. The system MUST remove or replace an existing variant automatically only when it matches the previously recorded CLI-managed effort, or when the current operation explicitly supplies a replacement effort. A divergent untracked/user-edited variant MUST be preserved with an actionable warning.

#### Scenario: Confirmed OpenCode variant is selected

- **GIVEN** the selected OpenCode model publishes the requested effort and the runtime can represent it as a variant or supported provider option
- **WHEN** OpenCode configuration is generated
- **THEN** the generator MUST emit exactly the runtime-representable override selected by the OpenCode adapter

#### Scenario: OpenCode variant is unconfirmed

- **GIVEN** the requested effort is absent from the selected model's catalog values or cannot be represented by the active OpenCode runtime
- **WHEN** OpenCode configuration is validated or generated
- **THEN** the system MUST report which catalog or runtime condition failed
- **AND** the generator MUST NOT emit an effort-derived variant or provider option

#### Scenario: Previously generated OpenCode variant becomes stale

- **GIVEN** an earlier generated configuration contains an effort-derived override equal to the role's recorded CLI-managed effort and it is no longer published, no longer runtime-representable, or the role now uses `inherit`
- **WHEN** OpenCode configuration is regenerated
- **THEN** the generator MUST clear the stale effort-derived variant or provider option while preserving unrelated configuration

#### Scenario: User-owned OpenCode variant diverges from managed state

- **GIVEN** the current OpenCode variant differs from the role's recorded CLI-managed effort and the operation does not explicitly replace it
- **WHEN** OpenCode configuration is regenerated or the model changes
- **THEN** the generator MUST preserve the divergent variant
- **AND** it MUST report an actionable ownership warning instead of silently deleting user configuration

### Requirement: Claude Code official-effort intersection

For Claude Code aliases `sonnet`, `opus`, and `haiku`, choices and generation MUST offer only the official explicit frontmatter values `low`, `medium`, `high`, `xhigh`, and `max`, plus `inherit`, and MUST delegate any model-specific runtime downgrade to Claude Code. For an exact concrete Claude model with validated catalog effort metadata, choices and generation MUST use the intersection of those official explicit values and the model-published effort values, plus `inherit`. The `inherit` model alias and every role effort set to `inherit` MUST remain selectable and MUST emit no explicit effort override.

#### Scenario: Claude alias uses official effort values

- **GIVEN** a Claude Code role uses the `sonnet`, `opus`, or `haiku` model alias
- **WHEN** effort choices are presented
- **THEN** the system MUST offer `inherit`, `low`, `medium`, `high`, `xhigh`, and `max`
- **AND** generation MUST emit a selected explicit value unchanged and leave runtime downgrade behavior to Claude Code

#### Scenario: Concrete Claude model uses the official intersection

- **GIVEN** a Claude Code role uses an exact concrete model with validated catalog effort metadata
- **WHEN** choices are presented or configuration is validated
- **THEN** the system MUST offer `inherit` plus only values present in both `low|medium|high|xhigh|max` and the model-published effort values
- **AND** it MUST NOT offer or emit values outside that intersection

#### Scenario: Claude inherit remains neutral

- **GIVEN** the model alias is `inherit` or the role effort is `inherit`
- **WHEN** Claude Code choices are presented or configuration is generated
- **THEN** `inherit` MUST remain available and the generator MUST emit no explicit effort override

### Requirement: Non-destructive regeneration

Effort-aware generation MUST preserve existing model-only configurations, manual model selections, and unrelated user configuration, except for effort fields or generated variants that the current effective role-effort state requires adding, changing, or clearing.

#### Scenario: Existing model-only configuration is regenerated

- **GIVEN** an existing configuration contains model selections and no effort overrides
- **WHEN** effort-aware generation runs with all roles using `inherit`
- **THEN** the generator MUST preserve the model selections and MUST NOT add explicit effort overrides

#### Scenario: Unrelated user configuration exists

- **GIVEN** an existing harness configuration contains settings not owned by role model or role effort generation
- **WHEN** effort-aware generation updates owned fields
- **THEN** the generator MUST preserve all unrelated settings

#### Scenario: Manual model is selected

- **GIVEN** a role uses a supported manually configured model
- **WHEN** effort-aware configuration is validated or generated
- **THEN** the system MUST preserve the manual model and MUST apply only effort behavior explicitly supported for it

### Requirement: Excluded controls

This change MUST NOT add an effort enablement toggle and MUST NOT expose or generate `budget_tokens` as part of role effort configuration.

#### Scenario: User configures role effort

- **GIVEN** the TUI, CLI, state, or generator handles role effort
- **WHEN** configuration options or output are produced
- **THEN** the system MUST NOT require an enablement toggle and MUST NOT expose or emit `budget_tokens`

### Requirement: Codex and OpenCode OpenAI installation presets

Fresh Codex installation and the generated OpenCode `openai` preset MUST use the same confirmed role assignments: `oracle=gpt-5.6-sol/high`, `librarian=gpt-5.6-luna/low`, `explorer=gpt-5.6-luna/low`, `designer=gpt-5.6-terra/high`, `quick=gpt-5.6-luna/medium`, and `deep=gpt-5.6-terra/xhigh`. Claude Code installation defaults MUST remain unchanged.

#### Scenario: Fresh Codex installation emits confirmed defaults

- **GIVEN** no installed Codex role artifact exists
- **WHEN** Codex installation output is rendered
- **THEN** each generated role artifact MUST contain its confirmed default model and `model_reasoning_effort`
- **AND** the default effort MUST still be validated as writable for that selected model

#### Scenario: OpenCode OpenAI preset mirrors Codex defaults

- **GIVEN** the OpenCode provider preset is generated for `openai`
- **WHEN** the preset is rendered
- **THEN** the six role model and variant assignments MUST equal the confirmed Codex role/model/effort mapping
- **AND** unrelated providers and the OpenCode orchestrator assignment MUST remain unchanged unless separately specified

#### Scenario: Claude defaults remain stable

- **GIVEN** Claude Code installation or model configuration is generated
- **WHEN** this preset change is applied
- **THEN** Claude Code MUST retain its existing model and effort defaults

### Requirement: Installed effort is the authoritative current value

For an existing Codex or Claude role artifact, the TUI MUST derive `Current effort` from the installed artifact rather than regenerated templates or managed-state metadata. An explicit serialized effort MUST be shown unchanged; an existing artifact with no serialized effort field MUST be shown as `inherit`. OpenCode MUST continue to derive the current variant from the actual OpenCode configuration. The optional `configuredEfforts` map MUST be used only for ownership and last-CLI-applied bookkeeping, never as the authoritative current display value.

#### Scenario: Manual effort is visible without sidecar metadata

- **GIVEN** an installed Codex role artifact contains `model_reasoning_effort = "high"`
- **AND** the managed-state sidecar has no `configuredEfforts` entry for that role
- **WHEN** the TUI loads role model assignments
- **THEN** `Current effort` MUST be `high`

#### Scenario: Existing artifact omits effort

- **GIVEN** an installed Codex or Claude role artifact exists without its effort field
- **AND** managed state contains an older or divergent effort value
- **WHEN** the TUI loads role model assignments
- **THEN** `Current effort` MUST be `inherit`
- **AND** the sidecar value MUST NOT be presented as current

#### Scenario: Installed value diverges from managed state

- **GIVEN** an installed role artifact contains an explicit effort different from `configuredEfforts`
- **WHEN** current role assignments are read
- **THEN** the TUI MUST show the installed explicit effort
- **AND** a model-only or no-op preview MUST preserve that installed effort unless the user explicitly replaces or clears it

#### Scenario: Missing artifact uses the real installation recommendation

- **GIVEN** no installed role artifact exists
- **WHEN** the TUI determines the initial current/recommended effort
- **THEN** it MUST use the effort that the harness installation renderer would emit
- **AND** it MUST use `inherit` when that renderer emits no effort default

## handoffHints

- Keep normalized effort selection separate from harness-specific serialization.
- Preserve dynamic per-model validation; do not introduce a global effort enum in types, schemas, TUI choices, or CLI validation.
- Treat stale-field removal as an owned-field update; preserve all unrelated keys byte-for-byte where the existing writer permits.
- Add focused compatibility fixtures for model-only `v1` state, manual models, repeated CLI flags, and regeneration from explicit effort back to `inherit`.
- Test Codex exact catalog values (including conditional `none`, `max`, and `ultra`), OpenCode's catalog-plus-runtime confirmation and stale clearing, and Claude Code alias versus concrete-model behavior independently.
