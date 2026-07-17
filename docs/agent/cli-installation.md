# CLI and installation

## Responsibility

This route owns parsing, runtime detection, commands, TUI, and
install/update/sync/reset/configuration operations. It does not own the internal
contract of a harness artifact, although it consumes that contract.

## Signals and entrypoints

- Signals: CLI, argument, command, TUI, install, update, reset, sync, dry-run,
  managed state, config path, provider/model selection.
- `src/cli/index.ts:main` is the binary and calls `parseCliArgs`,
  `detectRuntimeContext`, and `runCliCommand`.
- `src/cli/operations/index.ts` registers operations for `opencode`, `codex`, and
  `claude`.
- `src/cli/tui/` owns the interactive experience.
- `src/cli/config-io.ts`, `config-manager.ts`, and `managed-state-io.ts` own I/O
  and managed state; confirm callers before changing formats.

## Invariants and risks

- The published binary is `thoth-agents` -> `./dist/cli/index.js`.
- The OpenCode plugin entrypoint is not a shell command.
- Dry-run is no-write; reset may overwrite files within the managed scope. Both
  operations must preserve documented semantics and path/state tests, without
  broad force outside that scope.
- Codex requires trust review; do not omit `/plugins` or `/hooks` when the route
  needs them.
- A change to an argument or visible output may be a public contract and requires
  reviewing README/documentation in addition to tests.

## Dependencies and overlays

- Load [`harness-packaging.md`](harness-packaging.md) if generated output or
  harness capability selection changes.
- Load [`agents-and-delegation.md`](agents-and-delegation.md) if the CLI changes
  role models, variants, or overrides.
- Do not load plugin runtime context for an isolated parsing/TUI change.

## Tests and verification

- Parser/commands/runtime: `src/cli/parser.test.ts`, `commands.test.ts`,
  `runtime.test.ts`, `index.test.ts`.
- Installation/config: `src/cli/install.test.ts`, `codex-install.test.ts`,
  `claude-code-install.test.ts`, `*config*.test.ts`, and `managed-state-io.test.ts`.
- TUI: `src/cli/tui/**/*.test.ts` and `src/cli/tui/App.test.tsx` with snapshot.
- Harness operations: `src/cli/operations/**/*.test.ts`.
- Public reference: [`../installation.md`](../installation.md).

## Common mistakes

- Changing the parser without updating help/tests leaves commands accepted but
  undiscoverable.
- Changing a managed path without compatible migration/reset can touch files
  outside the expected scope.
- Updating only the TUI ignores the non-interactive path and `TERM=dumb`.

## Evidence and uncertainty

- Verified in `package.json`, `src/cli/index.ts`, `src/cli/operations/index.ts`,
  and the test inventory.
- Effects on real installations must be validated with fixtures/dry-run before
  writing user configuration.
