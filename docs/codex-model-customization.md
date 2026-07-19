# Codex Model Customization

The Codex CLI installation writes one user-scope custom-agent TOML per
specialist under `~/.codex/agents/thoth-agents-{role}.toml`. The ambient Codex
session remains the orchestrator and keeps the model selected by the user or
active Codex configuration.

For installation ownership, see [Codex Install](codex-install.md). For the
OpenCode-only built-in provider preset, see
[Provider Configuration](provider-configurations.md).

## Generated specialist defaults

| Role | Model | Reasoning effort |
| --- | --- | --- |
| `explorer` | `gpt-5.6-luna` | `low` |
| `librarian` | `gpt-5.6-luna` | `xhigh` |
| `oracle` | `gpt-5.6-sol` | `xhigh` |
| `sdd-specify` | `gpt-5.6-sol` | `high` |
| `sdd-plan` | `gpt-5.6-sol` | `high` |
| `sdd-tasks` | `gpt-5.6-luna` | `medium` |
| `designer` | `gpt-5.6-sol` | `medium` |
| `quick` | `gpt-5.6-luna` | `xhigh` |
| `deep` | `gpt-5.6-sol` | `medium` |

No `orchestrator` TOML is generated. Configure the root model through normal
Codex user, project, profile, or session controls.

## Change a managed specialist model

Preview and apply model changes through the thoth-agents CLI rather than editing
the generated TOML directly:

```bash
npx thoth-agents@latest model --harness=codex --role=deep --model=gpt-5.6-sol
```

The operation updates only the selected managed TOML model fields and
`~/.codex/agents/.thoth-agents-managed-models.json`. It creates bounded backups
and preserves unrelated TOML content.

## Reasoning effort

The default effort is emitted only while the role uses its package-owned default
model. An explicit model override can omit or replace that default according to
the model plan supplied by the CLI. Codex ultimately validates model and effort
availability against the active catalog and configuration.

## Limitations

- The root model is never managed by thoth-agents.
- Only the nine generated thoth-agents specialist TOMLs are supported model
  targets.
- Provider-per-agent configuration is not generated. Configure custom providers
  through supported Codex user-level provider configuration.
- More specific project, profile, CLI, system, or managed configuration may
  override user-level defaults.
- Model configuration does not strengthen role selection, permissions, memory
  governance, or provider boundaries.
- Claude Code model defaults are package-owned and cannot be rewritten through
  this Codex operation.
