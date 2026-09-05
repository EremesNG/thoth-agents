# Development

This guide is for working on thoth-agents itself. To install the published
plugin, use the [installation guide](installation.md).

## Build and verify

Requirements: Node.js `>=22.19` and `pnpm@11.2.2`.

From the repository checkout:

```bash
pnpm install
pnpm run check:ci
pnpm run typecheck
pnpm run build
pnpm test
```

`pnpm run build` regenerates the integration packages, compiles the runtime and
TypeScript declarations, and refreshes the JSON schema. There is no separate
declaration-generation step.

For smaller changes, run the nearest focused checks first. See the
[testing guide](agent/testing.md) for test ownership and validation scope.

## Local harness setup

- **Codex:** follow [local development synchronization](codex-plugin-packaging.md)
  to configure the personal marketplace and run `pnpm run setup:codex:local`.
  This synchronizes the local plugin and required global layer; it does not
  install external skills or invoke thoth-mem setup.
- **Pi:** follow [local Pi installation](installation.md#pi) after building.
  Pass the absolute checkout root through `--local-package-root`; install a
  local thoth-mem checkout separately using that provider's own setup command.
- **OpenCode and Claude Code:** consult the [installation guide](installation.md)
  and [Claude packaging guide](claude-code-plugin-packaging.md) for their
  managed surfaces and ownership boundaries.

Do not treat a successful build or package installation as evidence that a
harness's live delegation, model providers, or memory lifecycle work correctly.

## Engineering references

- [Architecture](agent/architecture.md)
- [Agent context router](agent/index.md)
- [Codex surface validation](codex-surface-validation.md)
- [Codex plugin packaging](codex-plugin-packaging.md)
- [Claude Code plugin packaging](claude-code-plugin-packaging.md)
