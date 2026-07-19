# Harness packaging and compatibility

## Responsibility

This route owns the canonical contracts, adapters, capabilities, diagnostics,
and writers for OpenCode, Codex, and Claude Code.

## Entrypoints

- `src/harness/registry.ts`: default/supported harnesses.
- `src/harness/core/agent-pack.ts`: ten-role contract.
- `src/harness/core/sdd.ts`: route/artifact contract.
- `src/harness/adapters/`: harness translation.
- `src/harness/writers/`: deterministic artifact layouts.
- `src/harness/generate-integration-packages.ts`: checked-in Codex and Claude
  marketplace packages, rendered from the harness adapters.
- `.agents/plugins/marketplace.json` and `.claude-plugin/marketplace.json`:
  repository marketplace entrypoints.

## Invariants

- OpenCode remains the default.
- Codex uses the ambient session as root plus nine specialist TOMLs.
- Claude packages the root agent plus nine subagents.
- No adapter bundles SDD phase skills or thoth-mem provider assets.
- Required external skills are installed by `src/cli/skills.ts`, outside plugin
  manifests.
- Codex/Claude plugin manifests remain minimal and use only documented fields.
- Codex and Claude packages live under `integrations/`; never generate them in a
  user's plugin cache.
- Public installation distinguishes the native package layer from CLI-managed
  user surfaces. Plugin-only installation is incomplete for every harness.
- Claude installation and status use the native plugin manager. Its installed
  cache is immutable to thoth-agents; documented first install adds the
  marketplace and plugin before running the CLI.
- Capability gaps remain explicit; never claim cross-harness enforcement parity.
- Generated files are outputs. Change the owning adapter/writer.
- `pnpm run build` regenerates both integration packages before compiling, so
  Claude `agents/*.md` always comes from the canonical prompt code under
  `src/agents/` through `claudeCodeAdapter`.
- `npm version` runs the package `version` lifecycle before Git commit/tag
  creation. The `release:patch`, `release:minor`, and `release:major` commands
  force that lifecycle with `--ignore-scripts=false`, then regenerate, verify,
  and stage every generated integration surface after the root version changes.

## Public references

- [`../installation.md`](../installation.md)
- [`../codex-install.md`](../codex-install.md)
- [`../codex-plugin-packaging.md`](../codex-plugin-packaging.md)
- [`../claude-code-install.md`](../claude-code-install.md)
- [`../claude-code-plugin-packaging.md`](../claude-code-plugin-packaging.md)

## Verification

Run adapter/writer tests first, then the consuming CLI install/operation tests.
`pnpm run build` includes `integration:sync`; use that command directly only
when you need to refresh generated packages without compiling. Run
`pnpm run integration:verify` to prove the checked-in catalogs, generated Claude
agents, lifecycle scripts, and plugin versions are current. Add schema and
tarball verification when published output changes.
