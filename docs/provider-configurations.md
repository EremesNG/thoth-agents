# Provider Configuration

## OpenCode built-in preset

thoth-agents 0.3.0 ships one built-in OpenCode model mapping: `openai`.

Kimi, GitHub Copilot, ZAI/GLM, and mixed-provider presets were removed. The
installer does not write provider credentials or alternate provider blocks.

| Role | OpenCode model | Variant |
| --- | --- | --- |
| `orchestrator` | `openai/gpt-5.6-sol` | `xhigh` |
| `explorer` | `openai/gpt-5.6-luna` | `low` |
| `librarian` | `openai/gpt-5.6-luna` | `xhigh` |
| `oracle` | `openai/gpt-5.6-sol` | `xhigh` |
| `sdd-specify` | `openai/gpt-5.6-sol` | `high` |
| `sdd-plan` | `openai/gpt-5.6-sol` | `high` |
| `sdd-tasks` | `openai/gpt-5.6-luna` | `medium` |
| `designer` | `openai/gpt-5.6-sol` | `medium` |
| `quick` | `openai/gpt-5.6-luna` | `xhigh` |
| `deep` | `openai/gpt-5.6-sol` | `medium` |

The generated shape is equivalent to:

```json
{
  "$schema": "https://unpkg.com/thoth-agents@latest/thoth-agents.schema.json",
  "preset": "openai",
  "presets": {
    "openai": {
      "orchestrator": {
        "model": "openai/gpt-5.6-sol",
        "variant": "xhigh"
      }
    }
  }
}
```

The actual generated `openai` object includes all ten roles from the table.

## Explicit role overrides

Advanced users may override a role through the `agents` object without creating
another built-in preset:

```json
{
  "preset": "openai",
  "agents": {
    "deep": {
      "model": "openai/gpt-5.6-sol",
      "variant": "high"
    }
  }
}
```

User overrides win over generated defaults where the harness supports them. An
arbitrary provider-qualified override is user-managed and is not a shipped or
validated thoth-agents provider preset.

## Codex and Claude Code

Codex receives providerless OpenAI model names in custom-agent TOMLs because that
is the native Codex model surface. Claude Code uses its native `haiku`, `sonnet`,
`opus`, or `inherit` values for plugin agents. Those harness-native choices do
not reintroduce alternate OpenCode presets.

Codex specialist models can be changed through the bounded thoth-agents model
operation described in [Codex Model Customization](codex-model-customization.md).
The Codex root remains user-controlled. Claude agent defaults are stored in the
versioned native plugin package; because Claude owns its installed cache, changing
them requires publishing and installing a new thoth-agents version.

## Credentials

thoth-agents never writes provider credentials. Configure authentication through
the selected harness and provider's supported mechanism.
