# Architecture context

## System shape

`src/index.ts` composes the OpenCode plugin. `src/harness/` owns the canonical
seven-role and SDD contracts plus OpenCode, Codex, and Claude adapters. `skills/`
is the canonical thoth-owned workflow bundle. `src/cli/` owns installation plus
status, repair, model, and TUI operations.

thoth-mem is a separate provider/plugin. Its installation, hooks, MCP lifecycle,
persistence, state, and recovery are outside this package.

## Runtime and delivery flows

1. OpenCode loads seven native role definitions and registers `/thoth-init`.
2. Integration generation renders Claude agents from canonical prompt source and
   copies the four thoth-owned skills into Codex and Claude packages.
3. Codex marketplace installation exposes skills/MCP; mandatory CLI setup then
   materializes global custom-agent TOMLs, `~/.codex/AGENTS.md`, and config
   because the manifest cannot install them. `$thoth-init` creates project
   governance only.
4. Claude marketplace installation exposes its generated agents and owned
   skills; mandatory CLI setup installs external skills, and namespaced init
   creates project governance only.

## Boundaries

| Boundary | Owner |
| --- | --- |
| OpenCode runtime | `src/index.ts`, hooks, MCPs, tools |
| Roles/prompts | `src/agents/`, `src/config/`, `src/harness/core/agent-pack.ts` |
| SDD ownership | `src/harness/core/sdd.ts` |
| Detailed SDD/init/archive contracts | `skills/` |
| Generated integrations | `src/harness/generate-integration-packages.ts` |
| Installation and operations CLI | `src/cli/` |
| Memory provider | installed thoth-mem |

## Invariants

- OpenCode is default; harness guarantees differ.
- Root coordinates SDD and loads only the current contract.
- Oracle owns analyze and every verify.
- Delegation depth is one; one writer owns each mutable surface.
- OpenCode ships only the OpenAI preset.
- Owned SDD contracts are bundled; external skills come from canonical
  repositories during installation and are never fetched during an SDD.
- Build synchronizes both integrations before compilation and schema generation.
