# Verification Report: Add Interactive Multi-Harness TUI

## Completeness

Verification result: passed.

The previous blocker is fixed. Explicit plain CLI operation commands now dispatch
to the shared operation services instead of printing a future-phase placeholder:
`status`, `list`, `update`, `sync`, and `model` all returned real operation
output during verification.

All completed task outcomes in `tasks.md` are represented by implementation,
tests, documentation, or build evidence. The full verification suite passes:
Biome, TypeScript, Vitest, package build, and a final post-build Biome check.

## Build and Test Evidence

- `pnpm exec tsx src/cli/index.ts status`: passed; printed real OpenCode and
  Codex status reports, including OpenCode `missing` and Codex `installed`
  managed state.
- `pnpm exec tsx src/cli/index.ts list`: passed; listed OpenCode and Codex
  harnesses with supported actions.
- `pnpm exec tsx src/cli/index.ts update --harness=opencode`: passed; printed a
  dry-run OpenCode update plan with target paths, backup expectation, and plugin
  messaging.
- `pnpm exec tsx src/cli/index.ts sync --harness=codex`: passed; printed a
  dry-run Codex sync plan with managed surfaces, warnings, and capability
  disclaimers.
- `pnpm exec tsx src/cli/index.ts model --harness=codex --role=deep
  --model=openai/gpt-5.4-mini`: passed; printed a dry-run managed Codex model
  plan for generated subagent TOML and model state only.
- `pnpm run check:ci`: passed.
- `pnpm run typecheck`: passed.
- `pnpm test`: passed, 62 test files and 625 tests.
- `pnpm run build`: passed, including `dist/index.js`, `dist/cli/index.js`,
  `dist/cli/tui/index.js`, declaration generation, and schema generation.
- Final `pnpm run check:ci`: passed after build.

## Compliance Matrix

| Scenario | Status | Evidence |
| --- | --- | --- |
| No-argument interactive terminal opens the TUI | Compliant | `parseCliArgs()` routes zero args to `command: 'tui'` when `isInteractiveRuntime()` is true; `src/cli/index.ts` dynamically imports the TUI entrypoint; TUI tests are included in the 625 passing tests. |
| No-argument non-TTY invocation remains automation-safe | Compliant | Runtime checks reject non-TTY, `TERM=dumb`, and CI contexts; parser returns legacy OpenCode install with `tui: false`; non-TTY tests pass. |
| Explicit install remains command-driven | Compliant | Install parsing preserves `--agent`, `--dry-run`, `--no-tui`, `--reset`, `--tmux`, and `--skills`; compatibility tests pass. |
| Explicit generate remains available | Compliant | Generate parsing preserves `generate --harness=codex --dry-run`; command dispatch still calls Codex generation behavior; tests pass. |
| OpenCode plugin config remains package-based | Compliant | Help/docs and operation output preserve `plugin: ["thoth-agents@latest"]` messaging and avoid claiming a global binary install. |
| CLI binary availability is reported separately | Compliant | README, installation docs, Codex docs, help text, and operation messages distinguish global install, `npx`, and `pnpm dlx` from OpenCode plugin loading. |
| TUI lists supported harnesses and actions | Compliant | Operation registry lists only OpenCode and Codex; `list` command and TUI action data expose those supported harnesses only. |
| TUI exposes status, update, sync, and model configuration | Compliant | TUI uses operation data; direct CLI verification also confirms real `status`, `list`, `update`, `sync`, and `model` command output. |
| Status classifies managed state | Compliant | `status` command reported OpenCode `missing` and Codex `installed`; operation types and tests cover installed, missing, drift, outdated, and unknown states. |
| Update plans preserve unknown and drift detail | Compliant | Operation plan contracts include state, warnings, disclaimers, target paths/surfaces, `dryRun`, and `canApply`; update/sync verification printed dry-run plans without mutation. |
| Mutation flow can preview planned changes | Compliant | `update`, `sync`, and `model` commands defaulted to dry-run previews with target harness, paths/surfaces, backups, warnings, and disclaimers. |
| Unsafe mutation is not implicit | Compliant | TUI apply is explicit; command verification used preview mode; operation plans require `--apply` for writes and reject conflicting apply/dry-run options. |
| OpenCode model settings include supported roles | Compliant | OpenCode model planning derives from the seven-agent roster and supported plugin config shape; related tests pass. |
| Codex model settings avoid unsupported role claims | Compliant | Verified Codex model command targets generated subagent TOML and `.thoth-agents-managed-models.json` only, while disclaiming root/orchestrator and provider-per-role limitations. |

## Design Coherence

The implementation follows the design:

- TTY-aware parsing and dynamic TUI import are implemented.
- Ink/React is used for the TUI surface.
- Shared operation adapters and serializable status/plan/result types are used by
  both TUI and explicit commands.
- Mutation flows are preview-first and apply only through explicit action.
- OpenCode plugin loading remains separate from npm binary availability.
- Codex model configuration is limited to managed generated subagent surfaces and
  reports instruction-level limitations.

The prior design-coherence gap at the explicit CLI command boundary is resolved:
`runOperationCommand()` now formats status/list output and builds update, sync,
and model operation plans through the shared service layer.

## Issues Found

### Blocking

None.

### Warnings

- Verification observed the local OpenCode status as `missing` because the
  current user OpenCode config does not include the managed
  `thoth-agents@latest` plugin entry. This is a correct status classification,
  not an implementation blocker.
- `pnpm run build` regenerates package outputs and schema artifacts as expected;
  final `pnpm run check:ci` passed after build.

## Verdict

Passed. All full-pipeline spec scenarios are compliant, the previous placeholder
blocker is fixed with direct CLI evidence, and archive may proceed.
