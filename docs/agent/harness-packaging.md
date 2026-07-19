# Harness packaging and compatibility

## Entrypoints

- `src/harness/registry.ts`: supported/default harnesses
- `src/harness/core/agent-pack.ts`: seven-role contract
- `src/harness/core/sdd.ts`: route and ownership contract
- `src/harness/adapters/`: native translation
- `src/harness/generate-integration-packages.ts`: Codex/Claude packages
- `skills/`: canonical thoth-owned workflow bundle
- `.agents/plugins/marketplace.json` and `.claude-plugin/marketplace.json`:
  repository marketplace catalogs

## Invariants

- OpenCode remains default.
- Codex uses ambient root plus six global TOMLs created by the mandatory CLI.
  Its plugin manifest carries skills/MCP but cannot install custom agents or
  `~/.codex/AGENTS.md`; `$thoth-init` creates project governance only.
- Claude packages root plus six generated namespaced subagents.
- Both packages include the four canonical thoth-owned skills. External skills
  are installed from their source repositories by the mandatory CLI flow.
- Native managers own marketplace snapshots, cache, enablement, and trust.
- Generated files are outputs; edit canonical adapters, prompts, or skills.
- Capability gaps remain explicit and deduplicated. Only unrecoverable required
  generation errors exit nonzero.
- Build and npm version lifecycle synchronize plugin versions and generated
  packages.
- No adapter bundles thoth-mem lifecycle behavior or project QA executables.

## Verification

Run focused adapter/generator tests, `pnpm run integration:sync`, and
`pnpm run integration:verify`. Use `pnpm run build` for the full generated and
compiled contract.
