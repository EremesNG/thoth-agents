# Design: Migrate Bun Tooling to pnpm

## Technical Approach

Migrate the project as a Node-compatible toolchain change rather than a direct
command rename. pnpm becomes the authoritative package manager, Vitest replaces
the Bun test runner, tsup replaces `bun build`, and active CLI/script entrypoints
use Node shebangs and Node-compatible environment access.

The implementation should preserve product behavior and generated agent
semantics. Changes are limited to package management, build/test execution,
runtime entrypoint compatibility, lockfile/cache handling, CI, docs, and
fixtures whose command text represents active project guidance.

Use pnpm 11 as the intended package-manager line. Local package metadata checks
on 2026-05-22 show `pnpm@11.2.2` requires Node `>=22.13`, so the migration
should explicitly raise the tooling/runtime prerequisite to Node `>=22.13`
rather than retaining the earlier lower-Node package-manager plan.

## Architecture Decisions

### Decision: Pin pnpm 11 through `packageManager`
**Choice**: Add `packageManager: "pnpm@11.2.2"` or a later compatible pnpm 11
patch version selected during implementation, and document Corepack setup for
pnpm 11. Add an `engines.node` declaration of `>=22.13` unless implementation
finds a higher floor required by the selected dependencies.

**Alternatives considered**: Stay on an earlier pnpm major to preserve a lower
Node compatibility floor; leave pnpm unpinned and document manual installation
only.

**Rationale**: The user explicitly requires pnpm 11, and pnpm 11 carries a
Node 22.13+ prerequisite in the checked package metadata. Pinning the pnpm 11
line lets Corepack, local setup, and CI converge on the same package-manager
major while making the Node floor visible instead of implicit.

### Decision: Use Vitest for test migration
**Choice**: Replace `bun:test` imports with `vitest` imports and add Vitest as
a dev dependency. With Node `>=22.13` as the intended floor, prefer the current
Vitest major compatible with Node 22 and pin the resolved version in
`pnpm-lock.yaml`.

**Alternatives considered**: Node's built-in test runner; a local compatibility
shim around `bun:test`.

**Rationale**: The suite uses `describe`, `test`, `it`, `expect`, lifecycle
hooks, `mock`, `mock.module`, and `spyOn` across 55 test files. Node's built-in
test runner does not provide an equivalent assertion and mocking surface without
substantial rewrites. Vitest minimizes migration friction with familiar
`expect`, `vi.fn`, `vi.mock`, and `vi.spyOn` APIs.

### Decision: Convert Bun mocks to Vitest APIs explicitly
**Choice**: Migrate imports from `bun:test` to `vitest`, replacing Bun's
`mock()` with `vi.fn()`, `spyOn` with `vi.spyOn`, and `mock.module(...)` with
Vitest-compatible module mocking. Add focused setup/reset patterns only where
tests currently depend on Bun module mock state.

**Alternatives considered**: Add an adapter module that re-exports Bun-like
names from Vitest.

**Rationale**: Explicit conversion avoids carrying a fake `bun:test` contract
forward. A shim could reduce diff size but would preserve the wrong abstraction
and hide module-mocking differences that need test-by-test validation.

### Decision: Use tsup for Node ESM build output
**Choice**: Add `tsup` and replace `bun build` with a Node-compatible build
pipeline. Build `src/index.ts` to `dist/index.js` and `src/cli/index.ts` to
`dist/cli/index.js` as ESM with `target: "node22"` or the final declared Node
floor. Keep declaration generation via `tsc --emitDeclarationOnly`.

**Alternatives considered**: Direct `tsc` JavaScript emit; raw esbuild scripts.

**Rationale**: The package currently relies on Bun bundling for two entrypoints.
tsup wraps esbuild with simpler multi-entry ESM output, externalization controls,
and shebang preservation suitable for CLI output, while keeping TypeScript
declarations under the existing `tsc` contract.

### Decision: Run TypeScript utility scripts with `tsx`
**Choice**: Replace `bun run scripts/generate-schema.ts` with
`tsx scripts/generate-schema.ts` and change the script shebang to
`#!/usr/bin/env node` or remove the shebang if it is only run through npm
scripts.

**Alternatives considered**: Precompile the schema script with tsup; rewrite it
to JavaScript.

**Rationale**: The schema generator is a small development-time TypeScript
script. `tsx` is the least invasive Node-compatible runner for that workflow
and keeps the existing source layout.

### Decision: Keep generic Bun root markers, but make pnpm active
**Choice**: Keep `bun.lock` and `bun.lockb` in generic LSP root markers if they
serve external projects, but ensure `pnpm-lock.yaml` is present, covered by
tests, and documented as the active lockfile for this repository.

**Alternatives considered**: Remove Bun root markers entirely.

**Rationale**: LSP helpers appear to support generic project detection beyond
this repository. Removing Bun markers could regress users who open Bun projects,
while the spec only requires that Bun markers are not the only recognized
lockfile markers.

## Data Flow

Developer and CI dependency state flows through `package.json` plus
`pnpm-lock.yaml`. Corepack resolves the pinned pnpm 11 version from
`packageManager`; CI runs on Node `>=22.13`, uses
`pnpm install --frozen-lockfile`, and executes project checks through
`pnpm run`.

Build flow becomes `pnpm run build` -> tsup bundles plugin and CLI entries for
the declared Node `>=22.13` floor -> `tsc --emitDeclarationOnly` emits
declarations -> `pnpm run generate-schema` runs the Zod schema generator
through `tsx`.

Test flow becomes `pnpm test` -> Vitest executes `src/**/*.test.ts` under Node.
Tests import directly from `vitest`; module mocks use `vi.mock`/`vi.fn`, with
per-file reset/restore calls where current Bun mocks or spies leak state.

Auto-update flow continues to update plugin config and invalidate cached
package state, but it removes pnpm package artifacts instead of editing
`bun.lock`, then runs `pnpm install` in the OpenCode plugin directory with the
existing timeout behavior.

## File Changes

Planned package and lockfile changes:

- Modify `package.json`: replace Bun scripts with pnpm/Node-compatible scripts,
  add `packageManager` pinned to pnpm 11, add `engines.node` with a Node
  `>=22.13` floor, add dev dependencies for `vitest`, `tsup`, `tsx`, and Node
  types if needed, remove `bun-types`.
- Add `pnpm-lock.yaml` generated by pnpm.
- Remove `bun.lock` from active dependency state.
- Modify `tsconfig.json`: remove `types: ["bun-types"]`; add Node-compatible
  type coverage through `@types/node` if source or tests require it.
- Optionally add `tsup.config.ts` if package scripts become clearer than
  inline tsup command flags.
- Optionally add `vitest.config.ts` only if default Vitest discovery or ESM
  module mocking needs explicit project configuration.

Planned runtime and source changes:

- Modify `src/cli/index.ts`: replace `#!/usr/bin/env bun` with
  `#!/usr/bin/env node`; preserve CLI behavior and package bin path.
- Modify `scripts/generate-schema.ts`: remove the Bun shebang or replace it
  with a Node-compatible shebang; replace `process.execPath x biome ...` with
  a package-manager-neutral command, likely `pnpm exec biome format ... --write`
  or a direct local binary invocation.
- Modify `src/utils/env.ts`: prefer `process.env` as the default Node contract;
  retain `globalThis.Bun?.env` only as an explicitly documented compatibility
  fallback if still useful.
- Modify `src/hooks/auto-update-checker/index.ts`: rename
  `runBunInstallSafe` to a pnpm-oriented helper; run `pnpm install`; update log
  messages and comments.
- Modify `src/hooks/auto-update-checker/cache.ts`: replace Bun lockfile
  mutation with pnpm lockfile/cache invalidation semantics. Prefer removing the
  stale cached package directory and package dependency entry, then let
  `pnpm install` reconcile `pnpm-lock.yaml`; avoid ad hoc YAML lockfile edits.
- Modify `src/tools/lsp/constants.ts` tests if needed to assert
  `pnpm-lock.yaml` behavior. Source already includes `pnpm-lock.yaml`.
- Modify `src/tools/ast-grep/constants.ts` and `src/tools/ast-grep/cli.ts`:
  replace `bun add -D @ast-grep/cli` guidance with `pnpm add -D
  @ast-grep/cli`.

Planned test changes:

- Modify all 55 `src/**/*.test.ts` files that import `bun:test`.
- Convert `mock()` to `vi.fn()`.
- Convert `spyOn` to `vi.spyOn`.
- Convert `mock.module` to `vi.mock` with Vitest-compatible hoisting/import
  behavior; when tests mock modules after imports, move mocks above imports or
  use dynamic import patterns.
- Remove per-test `/// <reference types="bun-types" />` comments.
- Add focused tests for pnpm cache invalidation and install command behavior in
  `src/hooks/auto-update-checker/cache.test.ts` and
  `src/hooks/auto-update-checker/checker.test.ts`.
- Ensure `src/tools/lsp/constants.test.ts` covers `pnpm-lock.yaml` root marker
  behavior.

Planned CI, docs, fixtures, and generated artifact changes:

- Modify `.github/workflows/ci.yml`: replace Bun setup matrix with Node setup,
  Corepack/pnpm activation, pnpm cache, `pnpm install --frozen-lockfile`, and
  pnpm-invoked checks.
- Modify `README.md`, `AGENTS.md`, and relevant docs under `docs/` to replace
  active `bun`, `bun run`, and `bun test` workflows with pnpm commands.
- Modify generated fixture expectations under `src/harness/__fixtures__/` when
  they represent active generated project guidance.
- Review tests that use `bun run hook` as arbitrary user hook command input.
  If the command is only a user-provided opaque string, keep the product
  behavior but change test literals to neutral commands or pnpm commands so
  active fixtures do not teach Bun as the default.
- Leave historical OpenSpec archive references unchanged unless they appear in
  active documentation or generated output.

## Interfaces / Contracts

- Package manager contract: active workflows use pnpm and
  `pnpm-lock.yaml`; CI uses frozen lockfile installs.
- Node runtime contract: CLI bin and development scripts run under Node, not a
  Bun-only runtime.
- Test contract: test files import from `vitest`; no active tests import
  `bun:test`.
- Build contract: `dist/index.js`, `dist/index.d.ts`, `dist/cli/index.js`, and
  CLI shebang behavior remain available for package consumers.
- Auto-update contract: update checks still modify the pinned plugin package
  version and attempt installation with timeout, but the install command and
  cache invalidation use pnpm semantics.
- LSP/root marker contract: `pnpm-lock.yaml` is an accepted root marker; Bun
  markers may remain for compatibility with external Bun projects.
- User-facing command contract: active setup, build, test, dev, CI, installer,
  and generated guidance uses pnpm unless explicitly labeled historical.

## Testing Strategy

Smallest sufficient verification after implementation:

1. `pnpm install --frozen-lockfile`
2. `pnpm run check:ci`
3. `pnpm run typecheck`
4. `pnpm run build`
5. `pnpm test`

Focused behavioral checks:

- `pnpm test -- src/hooks/auto-update-checker/cache.test.ts`
- `pnpm test -- src/hooks/auto-update-checker/checker.test.ts`
- `pnpm test -- src/tools/lsp/constants.test.ts`
- `pnpm test -- src/harness/writers/codex-plugin-package.test.ts`
- `pnpm test -- src/harness/adapters/codex-surfaces.test.ts`
- `pnpm test -- src/tools/ast-grep`

Static search checks:

- Search active source, tests, docs, package metadata, CI, and fixtures for
  `bun:test`, `bun-types`, `#!/usr/bin/env bun`, `bun install`, `bun test`,
  `bun run`, and `bun add`.
- Classify any remaining Bun references as historical, compatibility fallback,
  external-project support, or opaque user-provided command data.

## Migration / Rollout

Implement in phases:

1. Package-manager foundation: add pnpm 11 `packageManager`, Node `>=22.13`
   engines, pnpm lockfile, CI setup, and pnpm scripts while preserving package
   identity.
2. Build/runtime migration: add tsup/tsx, update shebangs, remove Bun ambient
   types, and verify build outputs.
3. Test migration: convert Bun test APIs to Vitest and run focused tests until
   module mocks are stable.
4. Runtime helper migration: update auto-update install/cache behavior,
   environment fallback, LSP tests, and AST grep guidance.
5. Documentation and fixture sweep: update active docs/help/generated fixtures
   and confirm no active Bun command guidance remains.
6. Full verification: run install, check, typecheck, build, full tests, and
   static search checks.

Rollback is a single toolchain revert: restore Bun package scripts, `bun.lock`,
Bun CI setup, `bun:test` imports, Bun shebangs, Bun cache invalidation, and
docs/fixtures. Avoid mixing product behavior changes into the migration so the
rollback remains bounded.

## Open Questions

- Should the project pin `packageManager` to `pnpm@11.2.2` specifically or a
  newer pnpm 11 patch discovered during implementation?
  Recommended default: pin the exact pnpm 11 patch used to generate
  `pnpm-lock.yaml`, with Node `>=22.13` documented in `engines.node`, setup
  docs, and CI.
- Should `bun.lock` be deleted immediately in the migration commit or retained
  temporarily as a historical reference? Recommended default: delete it from
  active dependency state once `pnpm-lock.yaml` is committed.
- Should auto-update cache invalidation delete `pnpm-lock.yaml` in the plugin
  cache or leave lockfile reconciliation entirely to `pnpm install`?
  Recommended default: do not edit pnpm YAML directly; remove stale package and
  package.json dependency entries only, then run pnpm install.
- Are any generated fixtures intentionally demonstrating arbitrary user-provided
  Bun commands? Recommended default: preserve behavior for opaque commands but
  change test examples to neutral or pnpm commands where they appear as active
  guidance.
