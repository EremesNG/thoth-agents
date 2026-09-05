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
- Pi runtime execution is not composed into `src/index.ts`. `src/pi.ts` is the
  native package entry: `before_agent_start` replaces any earlier Thoth marker
  with one current bounded root block, while `session_start` converges only
  attributable specialist files and degrades without rejecting valid turns.
  Hooks never install packages or use the network. External delegation,
  Context7/Exa, grep MCP, credentials, and lifecycle remain separately owned.
  Extension code still has invoking-user filesystem, credential, and network
  authority; tool allowlists are not an OS sandbox.
