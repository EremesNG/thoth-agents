# Tasks: Migrate Bun Tooling to pnpm

## Phase 1: Toolchain Package Metadata and Lockfile

- [x] 1.1 Update package-manager metadata and dependency set - `package.json`
  **Covers**: Package manager metadata is explicit; Standard project checks run through pnpm; TypeScript ambient types stay aligned with runtime support.
  **Work**:
  - Add `packageManager: "pnpm@11.2.2"` or a later compatible pnpm 11 patch version selected during implementation.
  - Add an `engines.node` floor of `>=22.13` unless the selected dependency set requires a higher Node 22+ floor.
  - Replace Bun-backed scripts with pnpm/Node-compatible scripts for `build`, `generate-schema`, `test`, `dev`, and `prepublishOnly`.
  - Add dev dependencies for a current Vitest version compatible with Node 22, `tsup`, `tsx`, and Node types if needed.
  - Remove `bun-types` from active dependencies.
  **Verification**:
  - Run: `pnpm install --lockfile-only`
  - Expected: `package.json` declares pnpm 11 and Node `>=22.13`; no `bun-types` dependency remains in active package metadata.

- [x] 1.2 Generate authoritative pnpm lockfile and retire Bun lockfile - `pnpm-lock.yaml`, `bun.lock`
  **Covers**: Fresh install uses pnpm lockfile state; Bun lockfiles are not active source of truth.
  **Work**:
  - Generate and commit `pnpm-lock.yaml`.
  - Remove `bun.lock` from active dependency state after `pnpm-lock.yaml` is generated.
  - Ensure active install guidance treats `pnpm-lock.yaml` as the source-of-truth lockfile.
  **Verification**:
  - Run: `pnpm install --frozen-lockfile`
  - Expected: Dependencies install from `pnpm-lock.yaml`; no Bun lockfile is required for install or verification.

- [x] 1.3 Remove Bun ambient TypeScript configuration - `tsconfig.json`
  **Covers**: TypeScript ambient types stay aligned with runtime support.
  **Work**:
  - Remove `types: ["bun-types"]`.
  - Add Node-compatible type coverage only where required by source or tests.
  - Preserve strict TypeScript behavior and existing module settings.
  **Verification**:
  - Run: `pnpm run typecheck`
  - Expected: TypeScript resolves Node-compatible ambient types without `bun-types`.

- [x] 1.4 Add build/test runner configuration only where it clarifies scripts - `tsup.config.ts`, `vitest.config.ts`
  **Covers**: Standard project checks run through pnpm; Tests run through pnpm.
  **Work**:
  - Add `tsup.config.ts` if inline `tsup` script flags become hard to maintain.
  - Add `vitest.config.ts` only if Vitest discovery, ESM behavior, or module mocking needs explicit configuration.
  - Keep configuration minimal and aligned with Node ESM output.
  **Verification**:
  - Run: `pnpm run build && pnpm run typecheck`
  - Expected: Build and TypeScript commands accept the runner configuration without requiring Bun runtime support; full test discovery is deferred until Vitest migration.

## Phase 2: Runtime, Build, Shebang, and Environment Changes

- [x] 2.1 Replace Bun build pipeline with tsup and declaration emit - `package.json`, `src/index.ts`, `src/cli/index.ts`
  **Covers**: Standard project checks run through pnpm; Runtime entrypoints are not Bun-only; Package identity remains stable.
  **Work**:
  - Build `src/index.ts` to `dist/index.js` and `src/cli/index.ts` to `dist/cli/index.js` as Node-compatible ESM.
  - Preserve declaration generation through `tsc --emitDeclarationOnly`.
  - Preserve package `main`, `types`, `bin`, package name, and `thoth-agents` identity.
  **Verification**:
  - Run: `pnpm run build`
  - Expected: `dist/index.js`, `dist/index.d.ts`, and `dist/cli/index.js` are emitted with package identity unchanged.

- [x] 2.2 Convert CLI and helper script shebangs to Node-compatible execution - `src/cli/index.ts`, `scripts/generate-schema.ts`
  **Covers**: Runtime entrypoints are not Bun-only.
  **Work**:
  - Replace `#!/usr/bin/env bun` with `#!/usr/bin/env node` where an executable shebang is needed.
  - Remove the schema script shebang if it only runs through package scripts, or make it Node-compatible.
  - Keep CLI argument parsing and schema generation behavior unchanged.
  **Verification**:
  - Run: `pnpm run build && node dist/cli/index.js --help`
  - Expected: The built CLI starts through Node and displays help without requiring Bun.

- [x] 2.3 Run TypeScript schema generation through tsx - `package.json`, `scripts/generate-schema.ts`
  **Covers**: Standard project checks run through pnpm; Active command surfaces prefer pnpm.
  **Work**:
  - Replace `bun run scripts/generate-schema.ts` with `tsx scripts/generate-schema.ts`.
  - Replace `process.execPath x biome ...` with a Node/pnpm-compatible formatter invocation such as `pnpm exec biome format ... --write` or a direct local binary call.
  - Preserve deterministic schema output.
  **Verification**:
  - Run: `pnpm run generate-schema && pnpm run check:ci`
  - Expected: `thoth-agents.schema.json` is regenerated/formatted deterministically and Biome reports no formatting drift.

- [x] 2.4 Make environment access Node-first with explicit compatibility fallback - `src/utils/env.ts`
  **Covers**: Runtime entrypoints are not Bun-only.
  **Work**:
  - Prefer `process.env` for active Node execution.
  - Retain `globalThis.Bun?.env` only as an explicitly documented compatibility fallback if it remains useful.
  - Keep environment lookup behavior stable for existing callers.
  **Verification**:
  - Run: `pnpm run typecheck && pnpm run check:ci`
  - Expected: Environment helper changes typecheck and format/lint cleanly without relying on Bun ambient types; behavioral test execution is deferred until Vitest migration.

- [x] 2.5 Migrate auto-update install and cache behavior to pnpm semantics - `src/hooks/auto-update-checker/index.ts`, `src/hooks/auto-update-checker/cache.ts`
  **Covers**: Auto-update cache uses pnpm lockfile semantics; Runtime entrypoints are not Bun-only.
  **Work**:
  - Rename Bun-oriented helper names/logs to pnpm-oriented names.
  - Run `pnpm install` in the OpenCode plugin directory with the existing timeout behavior.
  - Replace Bun lockfile mutation with pnpm-safe invalidation, preferring stale package directory and dependency entry cleanup over ad hoc YAML edits.
  **Verification**:
  - Run: `pnpm run typecheck && pnpm run check:ci`
  - Expected: Auto-update pnpm install/cache changes typecheck and format/lint cleanly; focused behavior tests are deferred until Vitest migration.

- [x] 2.6 Keep generic root markers while asserting pnpm lockfile support - `src/tools/lsp/constants.ts`, `src/tools/lsp/constants.test.ts`
  **Covers**: LSP root markers include pnpm.
  **Work**:
  - Confirm `pnpm-lock.yaml` remains an accepted root marker.
  - Keep generic `bun.lock` and `bun.lockb` markers only as external-project compatibility markers.
  - Add or update tests so pnpm lockfile behavior is explicit.
  **Verification**:
  - Run: `pnpm run typecheck && pnpm run check:ci`
  - Expected: Root marker changes typecheck and format/lint cleanly, with `pnpm-lock.yaml` represented in test code for later Vitest execution.

- [x] 2.7 Update ast-grep installation guidance to pnpm - `src/tools/ast-grep/constants.ts`, `src/tools/ast-grep/cli.ts`
  **Covers**: Active command surfaces prefer pnpm.
  **Work**:
  - Replace active `bun add -D @ast-grep/cli` guidance with `pnpm add -D @ast-grep/cli`.
  - Preserve ast-grep discovery and execution behavior.
  **Verification**:
  - Run: `pnpm run check:ci && pnpm run typecheck`
  - Expected: Ast-grep guidance changes format/lint and typecheck cleanly; active install guidance uses pnpm and behavior tests are deferred until Vitest migration.

## Phase 3: Test Runner Migration

- [x] 3.1 Convert all active test imports from `bun:test` to Vitest - `src/**/*.test.ts`
  **Covers**: Tests use a Node-compatible runner; Tests run through pnpm.
  **Work**:
  - Replace `bun:test` imports with `vitest` imports across active tests.
  - Convert `mock()` to `vi.fn()` and `spyOn` to `vi.spyOn`.
  - Remove per-test `/// <reference types="bun-types" />` comments.
  **Verification**:
  - Run: `pnpm test -- --run`
  - Expected: Vitest discovers and runs the test suite without any active `bun:test` imports.

- [x] 3.2 Convert Bun module mocks to Vitest-compatible module mocking - `src/**/*.test.ts`
  **Covers**: Tests use a Node-compatible runner; Generated artifacts remain deterministic after command updates.
  **Work**:
  - Replace `mock.module(...)` with `vi.mock(...)` or dynamic import patterns that respect Vitest hoisting.
  - Add `vi.resetModules`, `vi.clearAllMocks`, or `vi.restoreAllMocks` only where current tests rely on Bun mock isolation.
  - Keep test intent and assertions unchanged except for runner API differences.
  **Verification**:
  - Run: `pnpm test -- src/hooks src/harness src/tools`
  - Expected: Module-mocking-heavy tests pass under Vitest with stable isolation.

- [x] 3.3 Add focused regression tests for migrated package-manager surfaces - `src/hooks/auto-update-checker/cache.test.ts`, `src/hooks/auto-update-checker/checker.test.ts`, `src/tools/lsp/constants.test.ts`, `src/harness/writers/codex-plugin-package.test.ts`, `src/harness/adapters/codex-surfaces.test.ts`
  **Covers**: Focused behavioral tests cover migrated surfaces; Harness behavior is unchanged.
  **Work**:
  - Assert pnpm install/cache behavior in auto-update tests.
  - Assert `pnpm-lock.yaml` root marker behavior in LSP tests.
  - Assert generated package/plugin surfaces preserve `thoth-agents` identity and expected harness semantics.
  **Verification**:
  - Run: `pnpm test -- src/hooks/auto-update-checker/cache.test.ts src/hooks/auto-update-checker/checker.test.ts src/tools/lsp/constants.test.ts src/harness/writers/codex-plugin-package.test.ts src/harness/adapters/codex-surfaces.test.ts`
  - Expected: Focused migrated-surface tests pass and prove pnpm-compatible command contracts.

## Phase 4: Generated Commands, Fixtures, Docs, and CI

- [x] 4.1 Update CI to install and verify with pnpm - `.github/workflows/ci.yml`
  **Covers**: CI installs with frozen pnpm lockfile; CI executes pnpm project scripts.
  **Work**:
  - Replace Bun setup with Node 22+ setup, Corepack activation for pnpm 11, pnpm caching, and `pnpm install --frozen-lockfile`.
  - Invoke project checks through pnpm-compatible commands.
  - Preserve the existing verification intent and branch triggers.
  **Verification**:
  - Run: `pnpm run check:ci`
  - Expected: CI workflow syntax/content passes repository formatting/lint checks and references Node 22+, pnpm 11 setup, pnpm install, and pnpm check commands.

- [x] 4.2 Update active developer documentation and setup commands - `README.md`, `AGENTS.md`, `docs/`
  **Covers**: Active command surfaces prefer pnpm; Corepack setup is discoverable.
  **Work**:
  - Replace active `bun install`, `bun run`, `bun test`, and `bun build` guidance with pnpm equivalents.
  - Document Node `>=22.13` and Corepack/pnpm 11 activation consistently with `packageManager`.
  - Leave historical OpenSpec archive references unchanged unless they are active guidance.
  **Verification**:
  - Run: `pnpm run check:ci`
  - Expected: Documentation formatting passes and active workflow docs use pnpm-compatible commands.

- [x] 4.3 Update generated command contracts and fixtures - `src/harness/__fixtures__/`, related harness writer/adaptor tests
  **Covers**: Active command surfaces prefer pnpm; Generated artifacts remain deterministic after command updates; Harness behavior is unchanged.
  **Work**:
  - Update active generated fixture expectations that represent project setup, install, build, test, or dev commands.
  - Preserve opaque user-provided command behavior; change example literals away from Bun only where they function as active default guidance.
  - Regenerate or update snapshots deterministically.
  **Verification**:
  - Run: `pnpm test -- src/harness`
  - Expected: Harness tests pass with pnpm command text while preserving agent, SDD, memory, and adapter semantics.

- [x] 4.4 Update CLI help and installer/update-facing text - `src/cli/index.ts`, `src/hooks/auto-update-checker/index.ts`, command-generating sources
  **Covers**: Active command surfaces prefer pnpm; Package identity remains stable.
  **Work**:
  - Replace active Bun command examples in CLI/help/install/update text with pnpm-compatible commands.
  - Keep package name, plugin identity, and supported harness names unchanged.
  **Verification**:
  - Run: `pnpm run build && node dist/cli/index.js --help`
  - Expected: CLI help builds and displays current pnpm-compatible guidance without rebranding the product.

## Phase 5: Verification and Cleanup

- [x] 5.1 Run full pnpm verification sequence - repository root
  **Covers**: Full pnpm verification passes.
  **Work**:
  - Verify installation, formatting/lint, typecheck, build, and full tests through pnpm.
  - Fix any issues caused by pnpm script semantics, Vitest runtime differences, or tsup output.
  **Verification**:
  - Run: `pnpm install --frozen-lockfile && pnpm run check:ci && pnpm run typecheck && pnpm run build && pnpm test -- --run`
  - Expected: Full migration verification passes without requiring Bun.

- [x] 5.2 Run static Bun-reference audit and classify intentional leftovers - active source, tests, docs, package metadata, CI, fixtures
  **Covers**: Bun lockfiles are not active source of truth; Active command surfaces prefer pnpm; Runtime entrypoints are not Bun-only.
  **Work**:
  - Search for `bun:test`, `bun-types`, `#!/usr/bin/env bun`, `bun install`, `bun test`, `bun run`, and `bun add`.
  - Remove active Bun references or classify remaining references as historical, compatibility fallback, external-project support, or opaque user-provided command data.
  - Ensure no active default workflow teaches Bun as the project toolchain.
  **Verification**:
  - Run: `rg "bun:test|bun-types|#!/usr/bin/env bun|bun install|bun test|bun run|bun add" package.json tsconfig.json .github README.md AGENTS.md docs src`
  - Expected: No unclassified active Bun runtime/package-manager guidance remains; any matches are intentionally retained and documented by context.

- [x] 5.3 Confirm distribution contract and product semantics remain stable - `dist/`, package metadata, generated harness surfaces
  **Covers**: Harness behavior is unchanged; Package identity remains stable.
  **Work**:
  - Confirm package entrypoints, bin path, schema artifact, generated plugin outputs, role roster, SDD rules, and memory governance semantics are unchanged except for package-manager/runtime command text.
  - Avoid adding package-manager compatibility aliases or unrelated product behavior changes.
  **Verification**:
  - Run: `pnpm test -- src/harness src/agents src/sdd && pnpm run build`
  - Expected: Harness/agent/SDD tests and build pass, with `thoth-agents` identity and generated semantic contracts preserved.
