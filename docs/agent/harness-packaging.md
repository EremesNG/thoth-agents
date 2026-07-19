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
  marketplace packages.
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
- Claude installation and status use the native plugin manager. Its installed
  cache is immutable to thoth-agents.
- Capability gaps remain explicit; never claim cross-harness enforcement parity.
- Generated files are outputs. Change the owning adapter/writer.

## Public references

- [`../installation.md`](../installation.md)
- [`../codex-install.md`](../codex-install.md)
- [`../codex-plugin-packaging.md`](../codex-plugin-packaging.md)
- [`../claude-code-plugin-packaging.md`](../claude-code-plugin-packaging.md)

## Verification

Run adapter/writer tests first, then the consuming CLI install/operation tests.
Run `pnpm run integration:sync` after package-source changes and
`pnpm run integration:verify` to prove the checked-in catalogs are current.
Add build/schema and tarball verification when published output changes.
