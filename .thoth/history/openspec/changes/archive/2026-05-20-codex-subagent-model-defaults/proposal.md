# Proposal: Codex Subagent Model Defaults

## Intent

Deepen Codex-generated subagents by giving each Codex subagent an explicit GPT-family model default that matches the role's expected speed, cost, and reasoning depth. Codex root/orchestrator model selection remains user-controlled, so this change only targets generated subagent artifacts.

## Scope

### In Scope

- Add Codex-only default model mapping for generated subagents:
  - `oracle`: `gpt-5.5`
  - `librarian`: `gpt-5.4-mini`
  - `explorer`: `gpt-5.4-mini`
  - `designer`: `gpt-5.4-mini`
  - `quick`: `gpt-5.4-mini`
  - `deep`: `gpt-5.5`
- Preserve the existing OpenCode agent behavior and configuration surface.
- Keep generated Codex root artifacts model-neutral: neither `.codex/agents/orchestrator.toml` nor `.codex/config.toml` may emit an opinionated `model` default for this change because Codex users select the root-thread model themselves.
- Document how users can adjust or override generated Codex subagent models.
- Document custom provider behavior and limitations for Codex users.

### Out of Scope

- No implementation changes in this proposal phase.
- No tasks, specs, design, or code generation in this phase.
- No provider-per-agent override support unless later validation proves Codex documents and supports it.
- No Claude, Antigravity, or additional harness support.

## Approach

The implementation should update only the Codex adapter/generated subagent defaults so role definitions render `model` values for Codex custom agents. Defaults should prefer GPT-family models for Codex compatibility and use mini models for faster specialist roles. The implementation should either expose a supported configuration override path or clearly document how users edit generated `.codex/agents/*.toml` model fields.

Design decision: subagent defaults are scoped strictly to generated `.codex/agents/*.toml` files. This change must not introduce or preserve an opinionated generated root `model` value in `.codex/config.toml`; if users configure a root model through an existing, documented root/project Codex setting, that setting is separate from generated subagent defaults and must not be created as a side effect of this change.

Documentation should be added under `docs/`, likely as `docs/codex-model-customization.md`, explaining per-subagent model changes, `model_reasoning_effort` inheritance/adjustment where relevant, and custom provider constraints. Custom providers should be described as user/global/profile-level Codex configuration (`model_provider` and `model_providers.<id>`); per-agent provider override remains unknown and validation-required.

## Affected Areas

- Codex adapter or TOML rendering for generated subagents.
- Existing Codex surface documentation, including `docs/codex-surface-validation.md` references where useful.
- New Codex model customization documentation under `docs/`.
- Tests covering generated Codex subagent model defaults and OpenCode non-regression.

## Risks

- Codex model/provider semantics may differ across versions; provider-per-agent support is not confirmed.
- Fixed defaults could surprise users unless override documentation is explicit.
- Accidentally applying defaults to OpenCode or root/orchestrator would violate scope.

## Rollback Plan

Remove the Codex model default mapping and the model customization documentation. Because OpenCode behavior must remain unchanged and Codex root model selection is omitted, rollback should not affect existing OpenCode plugin behavior.

## Success Criteria

- Codex-generated subagents include the specified default `model` values.
- No Codex orchestrator/root model default is emitted, including no unintended root `model` entry in generated `.codex/config.toml`.
- OpenCode behavior remains unchanged.
- Documentation explains how to change subagent models and accurately states custom provider limitations.
- Tests or checks verify the mapping, root config model-neutral behavior, and guard against OpenCode regressions.
