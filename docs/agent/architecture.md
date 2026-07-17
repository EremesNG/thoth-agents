# Architecture context

## System shape

The package has two main executable surfaces: `src/index.ts` composes the
OpenCode plugin, and `src/cli/index.ts` runs the installer/TUI. `src/harness/`
maintains common contracts and adapters/writers for OpenCode, Codex, and Claude
Code. Role, SDD, and memory contracts are shared, but each harness may apply
them through runtime enforcement or instructions only.

## Entry flows

### OpenCode runtime

1. `src/index.ts:ThothAgents` loads configuration with `loadPluginConfig`.
2. `createAgents` and `renderOpenCodeAgentConfigs` produce role configuration.
3. The entrypoint registers hooks, MCPs, and tools from `src/hooks/`, `src/mcp/`,
   and `src/tools/`.
4. Colocated tests and `src/plugin-node-runtime.test.ts` verify integration and
   built-runtime contracts.

### Multi-harness installation

1. `src/cli/index.ts:main` combines `parseCliArgs`, `detectRuntimeContext`, and
   `runCliCommand`.
2. `src/cli/operations/index.ts` selects operations for `opencode`, `codex`, or
   `claude`.
3. `src/harness/registry.ts` resolves the adapter; `src/harness/writers/`
   produces specific artifacts.
4. Tests under `src/cli/` and `src/harness/` fix paths, layout, and diagnostics.

## Boundaries and ownership

| Boundary | Owner | Contract | Verification |
|---|---|---|---|
| OpenCode plugin | `src/index.ts` and runtime integrations | main export `dist/index.js` | `src/plugin-node-runtime.test.ts` and colocated tests |
| Published CLI | `src/cli/` | `thoth-agents` binary -> `dist/cli/index.js` | parser, commands, install, and operations tests |
| Harness portability | `src/harness/` | adapters, capabilities, diagnostics, and writers | `src/harness/**/*.test.ts` |
| Roles and prompts | `src/agents/`, `src/config/` | seven canonical names and overrides | agents/config tests |
| Governed workflow | `src/harness/core/`, `src/skills/`, `src/sdd/` | SDD and memory contracts | core/SDD/governance tests |

## Non-obvious invariants

- OpenCode is `DEFAULT_HARNESS` in `src/harness/registry.ts`.
- `SUPPORTED_HARNESSES` derives from the registry; do not maintain parallel
  lists without checking adapters, operations, and tests.
- Harness capabilities are not equivalent: an `instruction-only` fallback must
  remain visible as a limitation.
- The build combines `tsup`, TypeScript declarations, and schema generation;
  declarations have no independent pipeline.

## Expand context when

- a change crosses runtime and installation artifacts;
- it modifies published output, a schema, or generated prompts;
- it changes memory ownership, SDD phases, or harness enforcement.

## Evidence and uncertainty

- Verified in `package.json`, `src/index.ts`, `src/cli/index.ts`,
  `src/cli/operations/index.ts`, `src/harness/registry.ts`, and cited tests.
- Existing installation documentation may lag behind tests; when they disagree,
  prefer the current manifest, registries, writers, and tests.
