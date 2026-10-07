# Verification Report: Migrate Bun Tooling to pnpm

## Completeness

All tasks in `openspec/changes/migrate-bun-to-pnpm/tasks.md` are checked
complete. No unchecked or in-progress task markers remain.

Hybrid artifact recovery attempted thoth-mem exact topic searches for
`proposal`, `spec`, `design`, `tasks`, and `apply-progress`; no scoped records
were returned, so verification used the canonical OpenSpec artifacts as the
hybrid fallback.

## Build and Test Evidence

- Execution evidence provided by the implementation agent:
  `pnpm install --frozen-lockfile && pnpm run check:ci && pnpm run typecheck &&
  pnpm run build && pnpm test -- --run` passed without override, covering 55
  test files and 563 tests.
- Execution evidence provided by the implementation agent:
  `pnpm test -- src/harness src/agents src/sdd && pnpm run build` passed,
  covering 18 files and 183 tests.
- Execution evidence provided by the implementation agent:
  `pnpm pack --dry-run` passed.
- Verification-phase focused check:
  `pnpm test -- src/hooks/auto-update-checker/cache.test.ts
  src/hooks/auto-update-checker/checker.test.ts
  src/tools/lsp/constants.test.ts
  src/harness/writers/codex-plugin-package.test.ts
  src/harness/adapters/codex-surfaces.test.ts --run` passed, covering 5 files
  and 53 tests.
- Verification-phase static audit:
  `rg "bun:test|bun-types|#!/usr/bin/env bun|bun install|bun test|bun run|bun add"
  package.json tsconfig.json .github README.md AGENTS.md docs src` returned
  only opaque user-provided hook command fixture data in harness tests.
- Focused repository inspection confirmed `pnpm-lock.yaml` exists, `bun.lock`
  is absent, `package.json` includes pnpm/Node/Vitest/tsup metadata, CLI and
  schema script shebangs are Node-compatible, and pnpm lockfile semantics are
  represented in auto-update/cache and LSP root-marker code.

## Compliance Matrix

| Scenario | Status | Evidence |
| --- | --- | --- |
| Fresh install uses pnpm lockfile state | Compliant | `pnpm-lock.yaml` exists, `bun.lock` is absent, and full evidence includes `pnpm install --frozen-lockfile`. |
| Bun lockfiles are not active source of truth | Compliant | Static audit found no active Bun lockfile guidance; retained matches are opaque fixture command data only. |
| Package manager metadata is explicit | Compliant | `package.json` contains pnpm 11 metadata, Node `>=22.13`, Vitest, tsup, and no `bun-types`. |
| Corepack setup is discoverable | Compliant | Docs/AGENTS/CI were updated to pnpm/Corepack guidance and passed repository checks in the full evidence. |
| CI installs with frozen pnpm lockfile | Compliant | `.github/workflows/ci.yml` contains pnpm workflow content; full check evidence includes `check:ci`. |
| CI executes pnpm project scripts | Compliant | CI and package scripts use pnpm-compatible commands; no active default Bun workflow was found. |
| Standard project checks run through pnpm | Compliant | Full evidence includes `pnpm run check:ci`, `typecheck`, and `build`. |
| Tests run through pnpm | Compliant | Full suite and focused Vitest checks passed through pnpm. |
| Tests use a Node-compatible runner | Compliant | Static audit found no `bun:test`; focused tests passed under Vitest. |
| Runtime entrypoints are not Bun-only | Compliant | CLI and schema script shebangs are Node-compatible; no Bun shebang remains. |
| TypeScript ambient types stay aligned with runtime support | Compliant | `tsconfig.json` and package metadata no longer require `bun-types`; full typecheck passed. |
| Active command surfaces prefer pnpm | Compliant with classified leftovers | Static audit found only opaque user-provided hook commands in tests; active docs/source guidance uses pnpm. |
| Generated artifacts remain deterministic after command updates | Compliant | Harness-focused tests passed, including generated Codex package and surface fixtures. |
| LSP root markers include pnpm | Compliant | `src/tools/lsp/constants.ts` includes `pnpm-lock.yaml`; focused LSP test passed. |
| Auto-update cache uses pnpm lockfile semantics | Compliant | Auto-update focused tests passed and cache code references `pnpm-lock.yaml` semantics. |
| Harness behavior is unchanged | Compliant | Harness/agent/SDD focused evidence passed; implementation summary reports semantic preservation. |
| Package identity remains stable | Compliant | Package and generated-surface tests passed with `thoth-agents` identity retained. |
| Full pnpm verification passes | Compliant | Full install/check/typecheck/build/test chain passed in execution evidence. |
| Focused behavioral tests cover migrated surfaces | Compliant | Verification-phase focused command passed 5 files and 53 tests. |

## Design Coherence

The implementation matches the design direction: pnpm 11 is authoritative,
Node `>=22.13` is declared, Vitest replaces `bun:test`, tsup/tsx replace
Bun-backed build and script execution, active CLI/runtime entrypoints are
Node-compatible, auto-update and cache paths use pnpm semantics, LSP root
markers include `pnpm-lock.yaml`, and docs/fixtures/CI align with pnpm except
for intentionally opaque hook-command fixture data.

## Issues Found

- Blocking: None.
- Nonblocking: The verification-phase thoth-mem recovery searches did not find
  the expected prior SDD artifact topics in the provided child scope. OpenSpec
  fallback artifacts were complete and sufficient for verification, and this
  report is persisted to both targets.
- Nonblocking: Static audit still reports `bun run ...` strings in harness
  tests, but they are opaque user-provided hook command fixture values rather
  than active project workflow guidance.

## Verdict

Pass.
