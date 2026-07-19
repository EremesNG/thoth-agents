# Codex Model Customization

The mandatory Codex CLI setup creates six user custom-agent TOMLs under
`~/.codex/agents/`. Their generated defaults are:

| Role | Model | Reasoning effort |
| --- | --- | --- |
| `explorer` | `gpt-5.6-luna` | `low` |
| `librarian` | `gpt-5.6-luna` | `xhigh` |
| `oracle` | `gpt-5.6-sol` | `xhigh` |
| `designer` | `gpt-5.6-sol` | `medium` |
| `quick` | `gpt-5.6-luna` | `xhigh` |
| `deep` | `gpt-5.6-sol` | `medium` |

The ambient Codex session is root and has no child TOML.

The CLI tracks its managed model state and preserves unrelated custom agents.
Use its model operation to change or refresh managed defaults deliberately.

The optional CLI can plan and apply model changes:

```bash
npx thoth-agents@latest model --harness=codex --role=deep --model=gpt-5.6-sol --effort=xhigh
```

Codex ultimately validates model availability and reasoning effort. More
specific project, profile, CLI, system, managed, or organization settings can
override generated defaults. A model change does not strengthen role selection
or permission enforcement.
