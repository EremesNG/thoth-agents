# Provider Configuration

OpenCode 0.3.0 ships one built-in preset: `openai`. Kimi, GitHub Copilot,
ZAI/GLM, and mixed-provider mappings are intentionally absent.

## Default OpenAI mapping

| Role | Model | Effort/variant |
| --- | --- | --- |
| `orchestrator` | `openai/gpt-6-sol` | `xhigh` |
| `explorer` | `openai/gpt-6-luna` | `low` |
| `librarian` | `openai/gpt-6-luna` | `high` |
| `oracle` | `openai/gpt-6-astra` | `medium` |
| `designer` | `openai/gpt-6-sol` | `medium` |
| `worker` | `openai/gpt-6-luna` | `max` |

Model IDs and supported variants remain subject to the active harness catalog.
The shipped OpenCode validation accepts the `max` variant used by the Worker
mapping. Users may override individual roles in `thoth-agents.json`; an explicit
override is not a built-in provider preset.

These are reasoning-effort defaults, not measured task price, latency, token, or
quality guarantees. Valid explicit role variants win; model-only Codex overrides
do not invent an effort for an unknown custom model. `quick` and `deep` are not
accepted aliases, and their prior overrides are not migrated to Worker.

## Policy

- Root routing behavior is invariant across model overrides.
- `oracle` remains read-only and owns every verification.
- Model choice does not create permission or capability equivalence between
  harnesses.
- Provider-owned memory is external and is never inferred from a model mapping.

## Optional CLI customization

```bash
npx thoth-agents@latest model --harness=opencode --role=worker --model=openai/gpt-6-luna --effort=max
npx thoth-agents@latest model --harness=codex --role=worker --model=gpt-6-luna --effort=max
```

The CLI is a convenience; native or project configuration can be edited through
the harness's documented surfaces instead.
