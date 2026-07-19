# Architecture context

## System shape

`src/index.ts` composes the OpenCode plugin. `src/cli/index.ts` exposes install,
status, update, sync, model, and TUI operations. `src/harness/` contains the
canonical ten-role and SDD contracts plus OpenCode, Codex, and Claude adapters.

thoth-mem is a separate provider/plugin. Its installation, hooks, MCP, lifecycle,
persistence, runtime state, and recovery are outside this package.

## Entry flows

### OpenCode runtime

1. Load plugin config.
2. Create the ten agents and render native OpenCode definitions.
3. Compose thoth-agents MCPs, tools, fallback, retry/recovery, update, and tmux
   behavior.
4. Leave provider-owned memory integration untouched.

### Multi-harness installation

1. Complete the harness-native plugin step where required. Codex uses its
   repository marketplace and `/plugins`; Claude runs marketplace add/install
   before the CLI.
2. Parse the CLI/TUI selection.
3. Resolve the OpenCode, Codex, or Claude operation adapter.
4. Render/write only that harness's managed surfaces.
5. Install and verify the four mandatory external skills in the harness-native
   global root.

## Boundaries

| Boundary | Owner | Contract |
| --- | --- | --- |
| OpenCode plugin runtime | `src/index.ts`, `src/hooks/`, `src/mcp/`, `src/tools/` | `dist/index.js` |
| Published CLI | `src/cli/` | `thoth-agents` -> `dist/cli/index.js` |
| Harness portability | `src/harness/` | adapters, capabilities, diagnostics, writers |
| Roles/prompts | `src/agents/`, `src/config/`, `src/harness/core/agent-pack.ts` | ten canonical roles and overrides |
| SDD | `src/harness/core/sdd.ts` | routes, typed phase protocols, dispatch envelope, artifact graph, convergence, verification, and archive |
| Required skills | `src/cli/skills.ts` | simplify, tdd, progressive-context-router, architectural-grilling for all harnesses |
| Memory provider | installed thoth-mem | provider mechanics and lifecycle |

## Invariants

- OpenCode is the default harness.
- Harness guarantees differ and instruction-only gaps stay visible.
- The root may work directly; delegation must produce net gain.
- Delegation depth is one and each mutable surface has one writer.
- SDD phase agents write only `openspec/` coordination artifacts.
- SDD delegation composes the static role contract, the named phase protocol,
  and one run-specific envelope; phase skills are not bundled.
- Artifact-backed routes persist verification evidence and archive only after a
  pass verdict. Convergence is append-only and never implements product code.
- Architectural grilling is conditional and precedes specification only when a
  material human-owned decision tree requires it.
- OpenCode ships only the built-in OpenAI preset.
- External required skills are not plugin settings or fake manifest dependencies.
- Build first regenerates the Codex and Claude integration packages, then runs
  tsup, declaration generation, and schema generation.
