# Testing and verification context

## Layout

| Scope | Location | Runner | Notes |
|---|---|---|---|
| unit/contract | `src/**/*.test.ts` | Vitest | colocated tests by responsibility |
| TUI/React | `src/**/*.test.tsx` | Vitest in Node environment | includes snapshot under `src/cli/tui/__snapshots__/` |
| built runtime | `src/plugin-node-runtime.test.ts` | Vitest | release runs it after build |

`vitest.config.ts` includes only `src/**/*.test.ts` and `src/**/*.test.tsx`; a
snapshot does not run by itself.

## Verified commands

| Purpose | Command | Directory | Evidence |
|---|---|---|---|
| focused test | `pnpm exec vitest run path/to/test` | root | runner and release script |
| full suite | `pnpm test` | root | `package.json` |
| lint | `pnpm run lint` | root | `package.json` |
| Biome CI check | `pnpm run check:ci` | root | `package.json`, `ci.yml` |
| typecheck | `pnpm run typecheck` | root | `package.json`, `ci.yml` |
| build | `pnpm run build` | root | `package.json`, `release.yml` |

Replace `path/to/test` with a real test; do not literally run the placeholder.

## Selection rules

- Start with tests colocated with the changed behavior.
- Add harness/writer tests when generated output or public compatibility changes.
- Add CLI and harness tests together when installation consumes a changed artifact.
- Add `src/harness/core/sdd.test.ts` when route, phase, or artifact ownership changes.
- Add memory-governance/provider-boundary tests when provider ownership or
  evidence reporting changes.
- Do not report a command as successful if it was not run.
- Distinguish pre-existing failures from regressions introduced by the change.

## CI, release, and pre-merge

`.github/workflows/ci.yml` uses Node `22.13`, pnpm `11.2.2`, frozen installation,
`pnpm run check:ci`, `pnpm run typecheck`, and `pnpm test`. It currently has no
build step.

`.github/workflows/release.yml` waits for successful CI for the commit, installs
again, runs `pnpm run build`, then
`pnpm exec vitest run src/plugin-node-runtime.test.ts`, publishes npm, and
creates the GitHub release. Only after those steps succeed, it mints an
ephemeral `thoth-plugins-release-bot` token scoped to `thoth-plugins` with
`contents: write` and runs `pnpm run release:marketplace`.

The marketplace integration suite consumes the canonical `thoth-plugins`
checkout through `THOTH_PLUGINS_ROOT`; it validates the publisher locally but
does not claim that the live GitHub App installation or cross-repository push
has succeeded. That outcome is established by a real tag release.

For large changes and before a PR, the preserved local pre-merge order is:

1. `pnpm run check:ci`
2. `pnpm run typecheck`
3. `pnpm run build`
4. `pnpm test`

Use the combination applicable to the scope; the absence of build in `ci.yml`
does not remove the human obligation to validate the build when appropriate.

## Common failures

- Running the full suite repeatedly hides the signal from a focused test.
- Assuming CI runs build contradicts the current workflow.
- Running write-formatting during diagnosis modifies files; use that command only
  when scope authorizes formatting.

## Evidence and uncertainty

- Verified in `package.json`, `vitest.config.ts`, `.github/workflows/ci.yml`, and
  `.github/workflows/release.yml`.
- No mandatory external services are documented because the inspected Vitest
  configuration does not establish that requirement.
