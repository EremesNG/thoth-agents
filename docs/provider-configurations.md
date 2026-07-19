# Provider Configuration

OpenCode 0.3.0 ships one built-in preset: `openai`. Kimi, GitHub Copilot,
ZAI/GLM, and mixed-provider mappings are intentionally absent.

## Default OpenAI mapping

| Role | Model | Effort/variant |
| --- | --- | --- |
| `orchestrator` | `openai/gpt-5.6-sol` | `xhigh` |
| `explorer` | `openai/gpt-5.6-luna` | `low` |
| `librarian` | `openai/gpt-5.6-luna` | `xhigh` |
| `oracle` | `openai/gpt-5.6-sol` | `xhigh` |
| `designer` | `openai/gpt-5.6-sol` | `medium` |
| `quick` | `openai/gpt-5.6-luna` | `xhigh` |
| `deep` | `openai/gpt-5.6-sol` | `medium` |

Model IDs and supported variants remain subject to the active harness catalog.
Users may override individual roles in `thoth-agents.json`; an explicit override
is not a built-in provider preset.

## Policy

- Root routing behavior is invariant across model overrides.
- `oracle` remains read-only and owns every verification.
- Model choice does not create permission or capability equivalence between
  harnesses.
- Provider-owned memory is external and is never inferred from a model mapping.

## Optional CLI customization

```bash
npx thoth-agents@latest model --harness=opencode --role=deep --model=openai/gpt-5.6-sol
npx thoth-agents@latest model --harness=codex --role=deep --model=gpt-5.6-sol
```

The CLI is a convenience; native or project configuration can be edited through
the harness's documented surfaces instead.
