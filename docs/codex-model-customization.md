# Codex Model Customization

The Codex adapter generates one custom-agent TOML file per role under
`.codex/agents/thoth-agents-{role}.toml`. Generated non-orchestrator
subagents receive explicit model defaults so Codex users can start with
role-appropriate GPT-family models while the root Codex thread remains
user-controlled.

For the broader multi-harness orientation, see the
[README](../README.md). For OpenCode provider presets, see
[Provider Configurations](provider-configurations.md).

## Generated subagent defaults

The generated non-orchestrator agent files include `model`:

| Role | Generated model |
| --- | --- |
| `oracle` | `gpt-5.5` |
| `librarian` | `gpt-5.4-mini` |
| `explorer` | `gpt-5.4-mini` |
| `designer` | `gpt-5.4-mini` |
| `quick` | `gpt-5.4-mini` |
| `deep` | `gpt-5.5` |

No selectable Codex `orchestrator` TOML is generated in v1, and the generated
`.codex/config.toml` snippet does not set a root `model`. Choose the root Codex
model in your normal Codex user or project configuration.

## Override a generated subagent model

Use the existing `agents.<role>.model` plugin configuration shape to opt in to a
different Codex subagent model during generation:

```json
{
  "agents": {
    "oracle": { "model": "gpt-5.5-codex-custom" },
    "explorer": { "model": [{ "id": "gpt-5.4-mini-custom" }] }
  }
}
```

Only the configured subagent changes. Unconfigured subagents keep the generated
defaults, and `orchestrator` remains omitted from generated Codex model output.
When `model` is an array, Codex generation uses the first entry's model id.

## Reasoning effort

Generated Codex agent TOML includes `model_reasoning_effort` only on validated
Codex agent surfaces. The generated values are:

- `high` for `oracle`, `deep`, and `orchestrator`
- `medium` for `librarian`, `explorer`, `designer`, and `quick`

If you remove `model_reasoning_effort` from an agent file, Codex inherits or
falls back according to the active Codex configuration instead of the generated
agent-specific value.

## Custom providers

Configure custom providers through Codex configuration, not through generated
agent defaults. Codex supports root/project settings such as `model_provider`
and provider tables like `[model_providers.<id>]` in `.codex/config.toml` or the
user-level Codex config.

Provider-per-agent overrides are intentionally not generated. The current
validated Codex subagent surface covers per-agent `model` and
`model_reasoning_effort`, but provider-per-agent TOML fields are not confirmed
by the validation record. Treat provider-per-agent customization as
validation-required before adding it to generated artifacts.
