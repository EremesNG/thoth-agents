# Testing and verification context

## Layout

| Scope | Location | Runner | Notes |
|---|---|---|---|
| unit/contract | `src/**/*.test.ts` | Vitest | colocated tests by responsibility |
| TUI/React | `src/**/*.test.tsx` | Vitest in Node environment | includes snapshot under `src/cli/tui/__snapshots__/` |
| built runtime | `src/plugin-node-runtime.test.ts` | Vitest | release runs it after build |

`vitest.config.ts` includes `src/**/*.test.ts`, `src/**/*.test.tsx`, and
`evals/**/*.test.ts`; a snapshot does not run by itself. Evaluation tests run
sequentially in a separate project; `*.live.ts` is excluded.

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

## Project QA evaluation suite

This is developer tooling under [`evals/`](../../evals/), not an additional
source of product instructions.

- **Deterministic contracts**: [`contracts.json`](../../evals/contracts.json)
  (v1) and [`contracts.test.ts`](../../evals/contracts.test.ts) run in
  `pnpm test`. Positive/negative cases check owning product functions and
  contract text in rendered OpenCode, Codex, Claude and Pi root prompts for
  plan authorization, independent verification, delegated memory scope and
  small-change proportionality. These prove schema/function/text consistency,
  not model compliance; authorization checks are prose checks, not runtime gates.
- **Offline self-tests**: `evals/pi/*.test.ts` also run in `pnpm test`, using a
  synthetic provider and real SDK/subagent paths without real model calls.
  They exercise capture, scripted questions, isolation, caps, child termination,
  settling and deterministic graders (including negative traces). Allow roughly
  2–3 minutes locally for the evaluation tests; runner timing varies.
- **Opt-in live Pi**: `pnpm run eval:pi` uses
  [`vitest.evals.live.config.ts`](../../vitest.evals.live.config.ts) and real
  root/subagent extensions loaded from source; no prior build is needed. It is
  separate from normal tests and never runs in CI. Missing `THOTH_EVAL_MODEL`
  fails fast without calling a model. Run only with explicit consent to spend
  real money.

### Live configuration and limits

| Environment variable | Required/default | Meaning |
| --- | --- | --- |
| `THOTH_EVAL_MODEL` | required, `provider/model` | Parent model |
| `THOTH_EVAL_AUTH` | `~/.pi/agent/auth.json` | Auth file read as a source; never modified |
| `THOTH_EVAL_SKILLS_DIR` | `~/.pi/agent/skills` | Read-only source of the four external required skills |
| `THOTH_EVAL_CASE` | unset: all six cases | Exact case ID below |
| `THOTH_EVAL_MAX_TURNS` | `30` | Positive integer parent-turn cap, not child turns |
| `THOTH_EVAL_CASE_USD` | `1` | Combined parent + child reported USD per case |
| `THOTH_EVAL_RUN_USD` | `5` | Cumulative reported USD across cases in this invocation |
| `THOTH_EVAL_TIME_MS` | case override or `600000` | Positive wall-time cap per case (10 minutes by default; substantial cases use 30 minutes) |
| `THOTH_EVAL_VERBOSE` | unset | Set exactly `1` for bounded console-only trace diagnostics |
| `THOTH_EVAL_SPECIALIST_MODEL` | unset: production specialist pins | Temporary override for all specialists, `provider/model` |

Numeric caps must be positive and finite. There is one trial per selected case
per invocation. IDs are `small-no-record`, `plan-review-choice`,
`verification-fresh-oracle`, `memory-recall-bounded-reads`,
`plan-review-no-forwarded-skills`, and `designer-project-skill`. The catalog plan
case requires canonical review choices, a valid Oracle plan-review OKAY, a separate
Implement/Stop question answered Stop, no implementation writes, and no SKILL.md
path in the Oracle assignment. The designer case requires a completed designer
task and a successful native read of the trusted fixture project skill by that
same designer task, without a forwarded path.

A case's `live.caps` in `contracts.json` may override `timeMs`, `turns` and
`caseUsd`. Precedence is explicit environment variable, then case override,
then harness default. Both plan-review cases, `designer-project-skill`, and `verification-fresh-oracle`
use `timeMs: 1800000` (30 minutes) and `caseUsd: 1`; the per-run USD cap remains
5. The Vitest case timeout allows the selected wall-time cap plus cleanup margin.

Changing the parent model does **not** change specialist pins: generated
specialists retain the production `openai-codex/…` presets unless the temporary
specialist override is set. Auth must support the models actually used; missing
child credentials can make a case INCONCLUSIVE. Console output includes
`modelsUsed`; the harness also records specialist pins internally.

Caps are best-effort evaluation controls, not a billing ceiling or sandbox.
Cost checks use completed parent messages and child usage events; an in-flight
request can overshoot. Zero-priced models warn because USD caps cannot bound
unpriced usage; turn/time caps still apply. The parent turn limit does not bound
child turns. On a cap hit or case end, the harness aborts the parent, emits SDK
shutdown to cancel/await children, then disposes, with a 10-second cleanup bound.
Cleanup timeout means child termination is unconfirmed, not safe completion.

Each case uses a temporary fixture/git workspace and agent directory, in-memory
settings/session, the auth copy, skill assets, and explicitly loaded root and real
subagent extensions. Parent skill discovery uses exactly the root package manifest's
`pi.skills` paths (currently five package skills). External required skills (`tdd`,
`simplify`, `progressive-context-router`, `architectural-grilling`) are copied with
supporting assets from `THOTH_EVAL_SKILLS_DIR` into the temporary agent directory.
Missing required skills produce named setup warnings; they are never installed
or silently substituted. The source directory is read-only to the harness.
SDK 1.0.2's `noSkills` still accepts explicit `additionalSkillPaths`, so unrelated
operator skills remain excluded.

Real subagent children use production resource loading. The harness writes only
its temporary `agent/settings.json`, declaring the repository package by absolute
path with package extensions disabled (extensions are loaded explicitly). It trusts
only the disposable workspace, so child catalogs include fixture project skills
without inheriting operator trust. An offline real-SDK test proves repository
skills appear in child prompts and project skills appear only when trusted.
Home, Pi agent, subagent history and temp paths are rebound
and restored; the operator's `~/.pi/agent` is never written. This isolation is not
an OS/network/credential sandbox. Questions use scripted answers, not a live UI.
Grading waits for children to terminate, parent idle, no pending messages and a
25 ms quiet window so terminal follow-ups settle before teardown.

### Reading results and adding cases

Results are console-only: status, reasons, warnings, reported cost, parent turns
and models used; no persistent report files. **PASS** means the selected trace
satisfied deterministic expectations with positive progress, not universal model
reliability. **FAIL** means an assertion or execution failed. **INCONCLUSIVE**
means the path could not be established (for example caps, setup/auth, cleanup,
rejected plan or unavailable verdict evidence); it is never a PASS. Vitest reports
PASS as passed, FAIL as failed (non-zero exit), and INCONCLUSIVE as skipped with
its reason. `eval:pi` always uses verbose, non-silent reporting to show per-case
summaries. A successful command may still contain skipped findings, so read the
passed/failed/skipped totals and each printed status. Graders use tool calls, questions, task
results and workspace snapshot diffs (including bash/child writes), not an LLM
judge. Only Oracle gate results are envelope-graded by the installed
[`validateResult`](../../skills/thoth-sdd/scripts/validate-result.mjs) API, typed
through its `.d.mts` declaration. For these gates, the entire native task result must be a valid
`thoth-result` envelope; preliminary prose or embedded/example fences are not
extracted to manufacture validity. Oracle approval requires the expected review
kind and verdict: plan-review OKAY or final-verification PASS. The closeout case
binds validation to the known record SHA-256 (the exact UTF-8 prefix before
`## Authorization`). Invalid/missing approval is INCONCLUSIVE without a root
approval write, but FAIL when the root writes OKAY/PASS anyway. Valid negative
verdicts without approval writes are also INCONCLUSIVE: the approval path was not
exercised. Root approval writes must follow the relevant valid completed Oracle
result; unsafe implementation in plan-only trials still fails. Root approval-write
detection remains separate from specialist validation. The seeded implemented
fixture is checked offline against the installed verify and closeout validator.
Root memory-provider calls are outside this suite's assertions.

Ordinary specialist returns use compact markdown and custom agents keep their own
format; neither is envelope-graded or counts as approval. The memory case retains
explicit MEMORY scope checks on every delegation, with no envelope requirement.

For the designer catalog case, claims in the result are **not**
read evidence. Before cleanup the harness reads eval-owned native child JSONL
sessions from task `nested_session_path`, pairs `toolCall`/`toolResult` by call ID,
and retains task attribution. Only a completed non-error `read` of the expected
project SKILL.md by the completed designer task counts. Negative offline traces
cover missing reads, failed reads, another task's reads, and forwarded paths.

`THOTH_EVAL_VERBOSE=1` prints parent skill names, ordered tools, scripted
questions, subagent assignment path flags, task statuses/result excerpts,
envelope validity and validator issue codes for Oracle gate tasks, task-attributed
native child tool completions, written paths and final assistant text. Long
values are marked `[truncated]`. Default output stays summary-only; no persistent
trace/report files are written. Diagnostics can contain prompt/code/answer
content, so review before sharing console output.

To diagnose the small typo case (POSIX shell; PowerShell uses `$env:NAME='value'`):

```sh
THOTH_EVAL_MODEL=openai-codex/gpt-6.1-sol THOTH_EVAL_CASE=small-no-record THOTH_EVAL_VERBOSE=1 pnpm run eval:pi
```

Its grader requires the corrected README content, tolerating only CRLF/LF and
a single terminal newline difference; other content changes still fail.
Workspace snapshots capture edits via bash and real children as well as write
and edit tools. Temporary git repos pin `core.autocrlf=false` without changing
operator config.

To add a case, extend `contracts.json` with a unique ID and schema-valid inputs,
expected outcomes and product/root patterns; preserve positive/negative coverage.
For a live case, add its `live` prompt/expectations, a fixture under
`evals/pi/fixtures/`, and the fixture mapping in
[`live-cases.ts`](../../evals/pi/live-cases.ts). Add any new expectation to
[`contracts-schema.ts`](../../evals/contracts-schema.ts) and its deterministic
grader, with positive and negative offline traces. Run the focused contract,
harness and grader tests plus `pnpm run typecheck`; live execution remains a
separate, consented check.

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
`pnpm run check:ci`, `pnpm run typecheck`, and `pnpm test`. Both jobs build
and test the Pi extension bundles; CI does not run the full root build. The
repository is a pnpm workspace: the root install also installs all ten
`pi-packages/*` members, and CI then runs each package's `typecheck`
plus offline tests through `pnpm --filter` (`test` for `@thoth-agents/pi-core`,
`@thoth-agents/pi-todo`, `@thoth-agents/pi-questions-user`, `@thoth-agents/pi-subagents`,
`@thoth-agents/pi-antigravity-bridge`, `@thoth-agents/pi-background-tasks`,
`@thoth-agents/pi-openai-fast`, `@thoth-agents/pi-thoth-theme` and
`@thoth-agents/pi-sidebar`,
`test:unit` for `@thoth-agents/pi-claude-bridge`; its live `test` never runs in CI).
Pi-core provides typed, versioned `pi.events` channels. Pi-todo is a first-party
fork of `@juicesharp/rpiv-todo` `2.12.0` with session-state publication through
pi-core and open-task reinjection. Pi-questions-user is the first-party
`ask_user_question` extension with typed questions and structured per-id answers.
A second job, `pi-packages-windows` on `windows-latest` (same Node, pnpm and frozen
install), runs those ten package typechecks, offline tests and bundle checks,
one step per command so a failure cannot be masked; the root suite runs only on Ubuntu.
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
Subagent state v2 tests also cover required bounded `history`, strict field
allow-lists and cost ranking before truncation (including old expensive tasks).
Rerun a failing Windows timing check once to distinguish a transient failure
from a repeatable regression; report both outcomes.

For Pi sidebar/layout/UI-preference changes, run full tests and typechecks for
pi-sidebar, pi-core, pi-thoth-theme, pi-subagents, pi-questions-user,
pi-background-tasks and pi-todo. Run each Vitest package separately with
`--maxWorkers=2` on Windows (split if a command would exceed about four minutes).
When installer inventory changes, also run:

```sh
pnpm exec vitest run src/cli/pi-install.test.ts src/cli/install.test.ts src/cli/operations/pi.test.ts src/pi.test.ts --maxWorkers=2
```

Add `pnpm install --frozen-lockfile`, repository checks, full build,
`test:pi-extensions` and `git diff --check`. Cover owner-guarded root/render
restoration and foreign ownership, real TUI fullscreen scroll/wheel, regular
viewport/differential rendering, decorative versus blocking overlays, editor/
question focus, mixed old first-owner fallback, absorption hide/restore and
selection exclusion, width hysteresis, keys/drag, config round trips,
event-driven porcelain-v2/numstat git fixtures (including unborn HEAD, binary
and conflicts), shared `formatCwd` parity, summary discovery, stable keyed
metric heights across widths 20–140, semantic `elapsed` icons, honest history
rows, degrading columns/footers, cost bars/curves and settings save/cancel.
Keep the no-per-render-session-traversal and cached-plan performance checks green. Rerun a Windows timing failure
once and report both outcomes. Follow with a live user check in **both** Pi modes:
transcript wrapping/scrolling, resize/drag/auto-hide, question and foreign-overlay
focus, retained-section ← interaction, restored Work sections and regular-mode
scrollback artifacts. Automated viewport tests do not prove artifact-free native
scrollback or replace the live check.

For Pi provider-status changes, run full offline tests and typechecks for
pi-core, pi-subagents, pi-thoth-theme, pi-antigravity-bridge and
pi-claude-bridge (`test:unit`, not its live `test`). Run each package separately;
on Windows use `--maxWorkers=2` for Vitest and split commands if needed to keep
each under about four minutes. Cover duplicate-core registry sharing/validation/
expiry, per-query Claude event attribution across query-consumer paths, no-prompt
quota success/unavailability/timeout/close, explicit Antigravity model pricing and
ACP exact-usage replacement, subscription defaults, and task warning retention/
replacement/reset after child teardown. Add repository checks, build,
`test:pi-extensions` and `git diff --check`; rerun a failing Windows timing check
once and report both outcomes. Follow with a live user check of quota commands,
subscription cost and child warning/reset display. An agy process trace proves
upstream global MCP startup, not by itself a visible console flash; keep that
uncertainty and any unvalidated workaround explicit.

For Pi work-panel registry/provider changes, run full tests and typechecks for
pi-core, pi-subagents, pi-background-tasks and pi-todo serially on Windows, plus
affected installer/operation tests and `src/pi.test.ts`. Cover v2 discovery,
bounds, revisions, action-context guards and both mixed-version ownership orders;
data-only native/themed golden rows must preserve the existing work-panel,
retention, lifecycle and focus assertions. Add the repository checks, build and
built-extension bundle tests above. Rerun a failing Windows timing check once
and report both outcomes. Follow with a live work-panel check; automated tests
do not replace it.

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
