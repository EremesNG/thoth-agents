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

## Releasing

Everything ships from a root `v*` tag. The release workflow publishes every
`pi-packages/*` version that is not yet on npm, then creates one
`<name>@<version>` tag and GitHub release per published Pi package, then
publishes the root `thoth-agents` package. Pi packages are versioned
independently; a release only publishes the ones whose version changed.

Root only:

```bash
pnpm release:patch   # or release:minor / release:major; needs a clean tree
```

A Pi package plus the root (example: `pi-subagents` 0.1.0 -> 0.1.1):

```bash
pnpm release:pi pi-subagents patch   # directory or full name; patch|minor|major
git commit -am "chore(pi-subagents): release 0.1.1"
pnpm release:patch                   # Pi packages only ship from a root tag
```

`release:pi` only edits that package's `version`; it creates no commit or tag.
Pull requests show a non-blocking warning when a Pi package changed without a
version bump.

In 0.x, `^0.1.0` does not include `0.2.0`. A `pi-core` minor bump therefore
reaches the published packages that depend on it (`pi-subagents`,
`pi-questions-user`, `pi-todo`, `pi-antigravity-bridge`, `pi-background-tasks`,
`pi-claude-bridge`, `pi-thoth-theme`) only when each of them is also bumped and
republished; pnpm then rewrites their dependency to the new range. Use a
`pi-core` patch for compatible changes consumers can pick up on their own.

The release waits up to 15 minutes for the exact-commit CI. If a Windows job
flakes, rerun the failed job and then the Release workflow; nothing is
published before CI passes. See [harness packaging](agent/harness-packaging.md#release-flow)
for the full flow and the one-time npm bootstrap of new Pi packages.

## Engineering references

- [Architecture](agent/architecture.md)
- [Agent context router](agent/index.md)
- [Codex surface validation](codex-surface-validation.md)
- [Codex plugin packaging](codex-plugin-packaging.md)
- [Claude Code plugin packaging](claude-code-plugin-packaging.md)
