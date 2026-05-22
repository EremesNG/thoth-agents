# Provider Configurations

OpenCode provider presets map models and variants to the seven thoth-agents
roles. This page is OpenCode-scoped because it edits OpenCode plugin config
files. Codex users should use
[Codex Model Customization](codex-model-customization.md) for Codex role model
defaults and customization boundaries.

## Config File Location

Edit one of:

- `~/.config/opencode/thoth-agents.json`
- `~/.config/opencode/thoth-agents.jsonc`

Project-local OpenCode overrides can also live at:

- `.opencode/thoth-agents.json`
- `.opencode/thoth-agents.jsonc`

## Important Note

This config maps models and variants to agents for the OpenCode plugin path.
Skill and MCP usage is prompt-driven rather than configured through per-agent
allowlists. Codex provider configuration is handled through Codex config and the
validated surfaces described in
[Codex Model Customization](codex-model-customization.md).

## Default: OpenAI

The OpenCode installer generates this preset automatically:

```json
{
  "preset": "openai",
  "presets": {
    "openai": {
      "orchestrator": { "model": "openai/gpt-5.4" },
      "oracle": { "model": "openai/gpt-5.4", "variant": "high" },
      "librarian": { "model": "openai/gpt-5.4-mini", "variant": "low" },
      "explorer": { "model": "openai/gpt-5.4-mini", "variant": "low" },
      "designer": { "model": "openai/gpt-5.4-mini", "variant": "medium" },
      "quick": { "model": "openai/gpt-5.4-mini", "variant": "low" },
      "deep": { "model": "openai/gpt-5.4", "variant": "high" }
    }
  }
}
```

## Kimi For Coding

```json
{
  "preset": "kimi",
  "presets": {
    "kimi": {
      "orchestrator": { "model": "kimi-for-coding/k2p5" },
      "oracle": { "model": "kimi-for-coding/k2p5", "variant": "high" },
      "librarian": { "model": "kimi-for-coding/k2p5", "variant": "low" },
      "explorer": { "model": "kimi-for-coding/k2p5", "variant": "low" },
      "designer": { "model": "kimi-for-coding/k2p5", "variant": "medium" },
      "quick": { "model": "kimi-for-coding/k2p5", "variant": "low" },
      "deep": { "model": "kimi-for-coding/k2p5", "variant": "high" }
    }
  }
}
```

Authenticate with OpenCode:

```bash
opencode auth login
```

## GitHub Copilot

```json
{
  "preset": "copilot",
  "presets": {
    "copilot": {
      "orchestrator": { "model": "github-copilot/claude-opus-4.6" },
      "oracle": { "model": "github-copilot/claude-opus-4.6", "variant": "high" },
      "librarian": { "model": "github-copilot/grok-code-fast-1", "variant": "low" },
      "explorer": { "model": "github-copilot/grok-code-fast-1", "variant": "low" },
      "designer": {
        "model": "github-copilot/gemini-3.1-pro-preview",
        "variant": "medium"
      },
      "quick": { "model": "github-copilot/claude-sonnet-4.6", "variant": "low" },
      "deep": { "model": "github-copilot/claude-opus-4.6", "variant": "high" }
    }
  }
}
```

## ZAI Coding Plan

```json
{
  "preset": "zai-plan",
  "presets": {
    "zai-plan": {
      "orchestrator": { "model": "zai-coding-plan/glm-5" },
      "oracle": { "model": "zai-coding-plan/glm-5", "variant": "high" },
      "librarian": { "model": "zai-coding-plan/glm-5", "variant": "low" },
      "explorer": { "model": "zai-coding-plan/glm-5", "variant": "low" },
      "designer": { "model": "zai-coding-plan/glm-5", "variant": "medium" },
      "quick": { "model": "zai-coding-plan/glm-5", "variant": "low" },
      "deep": { "model": "zai-coding-plan/glm-5", "variant": "high" }
    }
  }
}
```

## Mixing Providers

OpenCode can mix providers across agents:

```json
{
  "preset": "my-mix",
  "presets": {
    "my-mix": {
      "orchestrator": { "model": "openai/gpt-5.4" },
      "oracle": { "model": "openai/gpt-5.4", "variant": "high" },
      "librarian": { "model": "kimi-for-coding/k2p5", "variant": "low" },
      "explorer": { "model": "github-copilot/grok-code-fast-1", "variant": "low" },
      "designer": { "model": "kimi-for-coding/k2p5", "variant": "medium" },
      "quick": { "model": "openai/gpt-5.4-mini", "variant": "low" },
      "deep": { "model": "openai/gpt-5.4", "variant": "high" }
    }
  }
}
```

## Switching Presets

### Method 1: Edit the config file

Set `preset` to the key you want to use:

```json
{
  "preset": "my-mix"
}
```

### Method 2: Environment variable

The environment variable takes precedence over the file:

```bash
export THOTH_AGENTS_PRESET=my-mix
opencode
```

## Codex Model Configuration

Codex generated subagents use Codex custom-agent TOML fields, not OpenCode
provider presets. The current validated Codex surface supports per-agent
`model` and `model_reasoning_effort` output, while provider-per-agent TOML
fields remain validation-required before they can be generated.

See [Codex Model Customization](codex-model-customization.md) for the supported
Codex path.

## Related Docs

- [Installation Guide](installation.md)
- [Quick Reference](quick-reference.md)
- [Skills and MCPs](skills-and-mcps.md)
- [Codex Model Customization](codex-model-customization.md)
