# OpenCode runtime and integrations

## Responsibility

This route owns OpenCode plugin composition, thoth-agents hooks, research MCPs,
LSP/ast-grep tools, tmux, and runtime model fallback. It does not own Codex or
Claude installation and does not own provider memory lifecycle.

## Flow

1. `src/index.ts` loads config and renders the ten OpenCode agents.
2. It composes thoth-agents MCPs and tools.
3. It registers update checking, delegation retry guidance, JSON recovery,
   foreground fallback, and optional tmux behavior.
4. It leaves required-skill installation to the CLI and thoth-mem integration to
   the independent provider.

## Invariants

- Preserve user agent overrides.
- Respect `disabled_mcps`.
- OpenCode generated defaults use only the built-in OpenAI preset.
- No Copilot-specific header hook or alternate-provider preset is part of 0.3.0.
- No phase-reminder, phase-skill sync, or provider lifecycle hook is bundled.
- Tmux is OpenCode-only.

Verify with colocated hook/MCP/tool tests and
`src/plugin-node-runtime.test.ts` after build-affecting changes.
