# Proposal: Migrate Bun Tooling to pnpm

## Intent

Move thoth-agents from Bun-centric project workflows to pnpm-managed
Node-compatible workflows while preserving current package identity, supported
harness behavior, generated artifacts, and verification expectations. The change
should make installation, CI, development scripts, docs, and generated command
contracts consistent with pnpm, without silently leaving runtime-only Bun
assumptions in active paths.

## Scope

### In Scope

- Replace Bun package-management workflows with pnpm, including lockfile,
  package-manager pinning, install commands, CI setup, lifecycle scripts, and
  developer documentation.
- Decide and implement a non-Bun test runner strategy, likely Vitest or Node's
  built-in test runner, so the suite no longer depends on `bun:test`.
- Update CLI/runtime entrypoints, generated fixtures, docs, README content,
  installer examples, auto-update behavior, lockfile detection, and environment
  helpers that currently assume Bun.
- Preserve TypeScript strictness, Biome formatting, existing OpenCode and Codex
  behavior, and the canonical `thoth-agents` identity.

### Out of Scope

- Changing product behavior, agent semantics, SDD workflow rules, memory
  governance, or harness support beyond what the package-manager/runtime
  migration requires.
- Adding new package-manager support matrices or compatibility aliases unless
  a later spec explicitly scopes them.
- Replacing thoth-mem, OpenSpec, Biome, or the OpenCode/Codex adapter model.

## Approach

Treat this as a toolchain and runtime migration, not a string replacement.
Specify pnpm 11 as the package manager, require the Node 22+ tooling/runtime
floor needed by pnpm 11, generate `pnpm-lock.yaml`, remove active Bun-only
package metadata where no longer needed, and convert scripts to Node/pnpm
equivalents. Select a test runner that supports the current test patterns with
minimal behavioral drift, then migrate `bun:test` imports and test scripts.
Audit generated command text and runtime helpers so active user surfaces
consistently present pnpm commands and Node-compatible execution.

## Affected Areas

- Package metadata and lockfiles: `package.json`, `bun.lock`,
  `pnpm-lock.yaml`, `tsconfig.json`.
- CI and developer workflow documentation.
- CLI shebangs, runtime environment access, auto-update install/cache logic, and
  lockfile/root-marker detection.
- Test framework imports, test scripts, fixtures, generated outputs, README, and
  docs that expose Bun commands.

## Risks

- Test semantics may differ between Bun and the selected Node-compatible runner.
- CLI execution may depend on Bun-specific shebang or runtime APIs not obvious
  from package scripts alone.
- Generated fixtures and docs may drift if command contracts are updated without
  regenerating or verifying snapshots.
- pnpm 11 requires Node 22+ unless a standalone pnpm distribution is selected.

## Rollback Plan

Revert the migration change as a single unit: restore Bun package metadata,
`bun.lock`, Bun-based scripts, CI setup, test runner imports, docs, generated
fixtures, and runtime Bun assumptions. Keep rollback limited to toolchain
changes so product behavior and SDD artifacts remain unaffected.

## Success Criteria

- Fresh install and CI workflows use pnpm 11, Node 22+, and a committed
  `pnpm-lock.yaml`.
- No active source, tests, generated fixtures, or docs instruct users to use Bun
  for project workflows except explicitly historical or migration notes.
- Tests run under the selected Node-compatible runner without `bun:test`.
- Typecheck, lint/check, build, and focused/full tests pass with pnpm commands.
- CLI and installer examples remain accurate for current `thoth-agents` usage.
