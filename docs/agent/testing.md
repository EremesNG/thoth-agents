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
| built Pi extension bundles | `pnpm run test:pi-extensions` | root after build | `scripts/pi-extension-bundles.test.mjs` |
| packed Pi package | `pnpm run verify:pi-package` | root after build | real-Pi local install/list normalization, five attributable runtime-discovered skills, one `session_start` materializing five specialists without an orchestrator child, unrelated-directory import, and isolated provider observation |

Replace `path/to/test` with a real test; do not literally run the placeholder.

## Selection rules

- Start with touched-package/area typechecks and TDD tests colocated with the
  changed behavior.
- Add harness/writer tests when generated output or public compatibility changes.
- Add CLI and harness tests together when installation consumes a changed artifact.
- Add `src/harness/core/sdd.test.ts` and `sdd-protocol.test.ts` when route,
  phase, authorization or artifact ownership changes.
- Add memory-governance/provider-boundary tests when provider ownership or
  evidence reporting changes.
- Do not report a command as successful if it was not run.
- Distinguish pre-existing failures from regressions introduced by the change.

## CI and release

`.github/workflows/ci.yml` uses Node `22.19`, pnpm `11.2.2`, frozen installation,
`pnpm run check:ci`, `pnpm run typecheck`, and `pnpm test`. It currently has no
build step. The repository is a pnpm workspace: the root install also installs
all nine `pi-packages/*` members, and CI then runs each package's `typecheck`
plus offline tests through `pnpm --filter` (`test` for `@thoth-agents/pi-core`,
`@thoth-agents/pi-todo`, `@thoth-agents/pi-questions-user`, `@thoth-agents/pi-subagents`,
`@thoth-agents/pi-antigravity-bridge`, `@thoth-agents/pi-background-tasks`,
`@thoth-agents/pi-openai-fast` and `@thoth-agents/pi-thoth-theme`,
`test:unit` for `@thoth-agents/pi-claude-bridge`; its live `test` never runs in CI).
Pi-core provides typed, versioned `pi.events` channels. Pi-todo is a first-party
fork of `@juicesharp/rpiv-todo` `2.12.0` with session-state publication through
pi-core and open-task reinjection. Pi-questions-user is the first-party
`ask_user_question` extension with typed questions and structured per-id answers.
A second job, `pi-packages-windows` on `windows-latest` (same Node, pnpm and frozen
install), runs only those nine package typechecks and offline tests, one step per
command so a failure cannot be masked; the root suite runs only on Ubuntu.
Its vitest steps pass `--retry=2` so an isolated slow-runner failure does not block
a release, while a consistent failure still fails; fix flakes at their cause
rather than relying on retries. `workflow_dispatch` allows manual CI runs (for
example repeated Windows stability checks); `release.yml` only waits for `push` runs.
Both CI jobs provision Bun `1.3.14` for the pi-subagents Bun runtime compatibility test.

CI also runs a PR-only, non-blocking "Pi version bump" warning step
(`scripts/check-pi-version-bumps.mjs`); skipped runs emit a `::notice`.

`.github/workflows/release.yml` waits for successful CI for the commit, installs
again, runs `pnpm run build`, then
`pnpm exec vitest run src/plugin-node-runtime.test.ts`. It then publishes the Pi
packages (only versions not yet on npm), reconciles per-package `<name>@<version>`
tags and GitHub releases (idempotent on rerun), generates root notes that exclude
Pi-only commits and list the released Pi versions, publishes the root npm package
and creates the GitHub release. A Pi publish failure blocks the root publish. Only
after those steps succeed, it mints an
ephemeral `thoth-plugins-release-bot` token scoped to `thoth-plugins` with
`contents: write` and runs `pnpm run release:marketplace`. Bumping and the
one-time bootstrap are in [harness packaging](harness-packaging.md#release-flow).

The marketplace integration suite consumes the canonical `thoth-plugins`
checkout through `THOTH_PLUGINS_ROOT`; it validates the publisher locally but
does not claim that the live GitHub App installation or cross-repository push
has succeeded. That outcome is established by a real tag release.

## Local closeout gate

This is repository-specific policy, not a change to shipped generic workflow
skills under `skills/`.

1. Run typechecks and the TDD tests for the touched packages/areas.
2. Run repository `pnpm run check:ci` and `pnpm run typecheck`.
3. Add `pnpm run build` when the change affects built/runtime output or packaging;
   use `pnpm run test:pi-extensions` for changed Pi extension bundles.

For Pi task-channel changes, run the full offline tests and typechecks for
pi-core, pi-subagents, pi-background-tasks and pi-thoth-theme, plus affected
`src/cli/pi-install*.test.ts`, operation tests and `src/pi.test.ts` when the
managed inventory changes. The channel tests cover exact summary-only key
allow-lists and bounds, session/readiness requests, fresh cross-process metadata,
and the usage envelope/status-line migration (including checkpoint replay).
Rerun a failing Windows timing check once to distinguish a transient failure
from a repeatable regression; report both outcomes.

For Pi question-dock/editor-slot changes, run full offline tests and typechecks
for pi-core, pi-questions-user and pi-subagents (including `test/ui`), plus the
repository checks, build and built-extension bundle tests above. Focus checks
must include real SDK/TUI 1.0.2 coverage of overlay focus recapture, expanded and
collapsed close repair, foreign-overlay preservation, editor submission,
fullscreen transcript scrolling and open-tool-card invalidation. Follow with a
live check of uncovered/scrollable chat, collapsed editor input, state-preserving
re-expansion and focus after each history/detail overlay closes. Rerun a failing
Windows timing check once and report both outcomes; automated checks do not
replace the live check.

Release/packaging tooling tests (for example publish-marketplace,
generate-release-notes, setup-codex-local, and packed real-SDK tests) are required
locally only when the change touches their inputs:

- release scripts;
- plugin manifests;
- `skills/`;
- published `package.json` fields or package `files` allowlists;
- marketplace/plugin packaging.

Select tooling tests for the affected inputs; unrelated release/packaging suites
do not block product-change closeout. Full `pnpm test` is the safety net after
push/PR in Linux CI, alongside the `pi-packages-windows` job; it does not block
local closeout. Report unrelated environment failures (such as Windows timing)
with evidence, rather than treating them as change failures. Failures caused by
the change must still be fixed before closeout.

## Packed Pi verification

When packed Pi verification is in scope, it requires Pi `>=0.99.0` and Node.js
`>=22.19.0`.
Every real Pi observation must set `PI_CODING_AGENT_DIR` to a disposable
directory and use `--no-extensions` plus the installed and observer extensions
explicitly. Never aim a package smoke at the operator's real Pi home.
For packed local candidates, also record the relative configured source returned
by `pi list --no-approve` and its resolved absolute path; byte-equality with the
absolute install command is not valid Pi package identity evidence.

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
