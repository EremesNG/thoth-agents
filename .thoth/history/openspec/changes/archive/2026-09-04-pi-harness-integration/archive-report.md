# Archive Report: Pi Harness Integration

**Status**: ARCHIVED<br>
**Oracle verdict**: PASS<br>
**Archive path**: `openspec/changes/archive/2026-09-04-pi-harness-integration/`

## Completed scope

- Added Pi as the fourth first-class harness with one ambient root, six canonical
  specialists, native delegation through pinned `pi-subagents-j0k3r`, owned and
  external skill setup, provider-owned memory setup, CLI/TUI operations, ledger
  authority, and truthful capability diagnostics.
- Added the pinned native Context7 and Exa integrations plus adapter-backed
  grep.app configuration, exact package-source verification, independent
  research-provider runtime states, and fail-closed partial-install handling.
- Raised the active Node.js floor to `>=22.19` while preserving OpenCode, Codex,
  Claude Code, pnpm `11.2.2`, and existing generated-package behavior.
- Implemented FR-001 through FR-020; all buildable SC-001 through SC-007 pass.

## Verification lineage

- `verify-report.md` records final independent Oracle PASS after a superseded
  first round and convergence of V-001, V-002, and V-003.
- Formatting, type checking, build, 1,096 unit/integration tests, focused Pi
  checks, generated-output verification, diff checks, and secret scanning pass.

## Canonical specification sync

- Updated: `cli-installation`, `external-required-skills`, `multi-harness-agent-pack`, `project-tooling`.
## Deviations and residual warnings

- SC-008 remains an explicit outcome RISK: the isolated real Pi package install
  stalled beyond 120 seconds, so foreground/background delegation was not
  observed without substituting mocked success.
- SC-009 remains an explicit outcome RISK: Context7, Exa, and grep.app runtime
  registrations were not observable after the same external installation stall;
  their managed and runtime contracts are covered by passing buildable tests.
- The real Pi home was not modified. The isolated smoke directory remains at
  `C:\Users\EremesNG\AppData\Local\Temp\thoth-pi-smoke-c46a925bca014a5da66cca5140a392fa`
  because host policy rejected cleanup.

## Follow-up

- Repeat SC-008 and SC-009 against the installed Pi runtime when its package
  installation completes normally; no implementation blocker remains.
