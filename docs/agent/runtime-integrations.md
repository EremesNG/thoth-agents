# OpenCode runtime and integrations

## Responsibility

This route owns OpenCode plugin composition, seven native role definitions,
`/thoth-init`, thoth-agents hooks, research MCPs, LSP/ast-grep tools, tmux, and
runtime model fallback. It does not own Codex/Claude manager state or provider
memory lifecycle.

## Flow

1. Load config and render seven OpenCode roles.
2. Register the offline `/thoth-init` command from the packaged skill.
3. Compose MCPs, tools, fallback, retry/recovery, update, and optional tmux.
4. Leave thoth-mem mechanics to the independent provider.

## Invariants

- Preserve user agent and command overrides.
- Respect `disabled_mcps`.
- Generate only the built-in OpenAI preset.
- No alternate-provider mapping, phase-agent reminder, or provider lifecycle
  hook is bundled.
- Tmux is OpenCode-only.
