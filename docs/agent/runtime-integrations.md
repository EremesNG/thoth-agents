# Plugin runtime and integrations

## Responsibility

This route owns OpenCode plugin composition, hooks, MCPs, LSP and ast-grep
tools, tmux, and fallbacks executed during a session. It does not own
installation artifacts for other harnesses.

## Signals and entrypoints

- Signals: hook, event, tool, MCP, LSP, ast-grep, tmux, rate limit, retry,
  runtime fallback, plugin initialization.
- `src/index.ts:ThothAgents` is the main entrypoint.
- `src/hooks/index.ts` exports update, header, retry, fallback, recovery, reminder,
  skill-sync, and `thoth-mem` hooks.
- `src/mcp/index.ts:createBuiltinMcps` registers `exa`, `context7`, `grep_app`,
  and `thoth_mem`, respecting disabled MCPs.
- `src/tools/index.ts` exports LSP and ast-grep tools.

## Flow

1. The plugin loads config and agent definitions.
2. It composes fallbacks, skill synchronization, tmux, MCPs, and hooks.
3. It returns agent configuration, tools, MCPs, and handlers to the OpenCode host.
4. Colocated tests validate each integration; the built runtime has a dedicated
   test in `src/plugin-node-runtime.test.ts`.

## Invariants and risks

- User overrides in agent configuration must be preserved when merging plugin
  defaults.
- An MCP in `disabled_mcps` must not be registered.
- Auxiliary hook errors must not invent recovery guarantees the host does not
  provide.
- Tmux is limited to OpenCode; do not describe Codex as tmux-aware.
- Memory-hook changes require the memory overlay and lifecycle tests.

## Dependencies and overlays

- [`memory-governance.md`](memory-governance.md) for `thoth_mem` and its hook.
- [`agents-and-delegation.md`](agents-and-delegation.md) for role prompts,
  permissions, or model fallback.
- [`harness-packaging.md`](harness-packaging.md) only when a generated surface
  outside the OpenCode runtime changes.

## Tests and verification

- Colocated tests under `src/hooks/`, `src/mcp/`, `src/tools/`, and `src/utils/`.
- `src/plugin-node-runtime.test.ts` for the built artifact.
- [`../tmux-integration.md`](../tmux-integration.md) documents tmux operation.
- Consult [`testing.md`](testing.md) before expanding to build/full suite.

## Evidence and uncertainty

- Verified in `src/index.ts` and hooks/MCP/tools barrels.
- Actual availability of external MCP services depends on the environment;
  local tests do not prove credentials or remote availability.
