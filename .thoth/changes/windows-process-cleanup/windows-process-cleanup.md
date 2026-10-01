# Change: windows-process-cleanup

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: medium
**Risk**: medium

## Exploration

- Facts-only Explorer (subtask_thoth-explorer_1790868586275_524e218c): 11 tests bypass
  Windows (pi-subagents 2, antigravity 9); most are POSIX permission checks. The
  relevant gap is `pi-packages/pi-subagents/test/runner/real-process-cancel.test.ts:43-44`:
  a custom runner using `bash`, `sleep`, `ps --ppid`, process groups and negative-PID
  SIGTERM (`:58-89`), not the actual Pi bash tool. No subagents test proves Windows
  descendant cleanup.
- Pi's actual bash tool already calls `killProcessTree(pid)` on abort/timeout and
  waits for child exit; on Windows that runs `%SystemRoot%\System32\taskkill.exe /F /T /PID`
  (installed `@earendil-works/pi-coding-agent/dist/core/tools/bash.js:65-109`,
  `dist/utils/shell.js:157-172`). Subagent abort calls `session.abort()`, then teardown
  (`pi-subagents/src/runner/sdk-runner.ts:499,543-560,734-749`,
  `src/runner/session-teardown.ts:12-40`).
- Antigravity shared helper `src/process-termination.ts:10-65` (Windows `taskkill /T /F`,
  awaited, 3 s deadline; POSIX group TERM then KILL) is used by the stream-json driver
  and ACP connection, with tests (`tests/process-termination.test.ts:11,36,46`,
  `driver.test.ts:134`, `acp-driver.test.ts:435,737`, `driver-lifecycle.test.ts:12`).
  Paths NOT using it: `AskAntigravity` (the AskAntigravity module in `src/`, lines 750-755 and 788-804; detached spawn
  with negative-PID TERM/KILL and no Windows branch), version probe
  (`src/agy-version.ts:93,107`), model discovery (`src/models.ts:131,150,166`), task query
  (`src/tasks.ts:123,133,139`), web tools (`src/web-tools.ts:148-150`), all
  `ChildProcess.kill`. Artifact openers are intentionally detached/unref'd
  (`extensions/index.ts:1592,1622`).
- Claude bridge: abort calls SDK `interrupt()` then `close()` (`src/index.ts:1932-2000,
  2022-2025,2148`; compact summary `:561-582,656`; AskClaude `:2243-2345`); Windows
  termination of the Claude Code subprocess and its descendants is not established.
- Pi dev dependencies: antigravity `^0.87.0` resolving 0.87.1 (`package.json:65-67`,
  `pnpm-lock.yaml:99-107`); subagents and claude resolve 0.99.1.
- CI (`.github/workflows/ci.yml`) runs only `ubuntu-latest`; it already runs the three
  package typechecks/tests (claude via `test:unit`). `AGENTS.md` and
  `docs/agent/testing.md` describe the CI.

## Intent

On Windows, cancelling or shutting down a subagent or an Antigravity/Claude bridge
leaves no descendant processes, proven by tests that run on Windows locally and in CI,
with all packages developing against Pi 0.99.1.

## Non-goals

- No Job Object containment or background-job survival policy (separate change).
- No change to POSIX behavior beyond routing through the shared helper.
- No claude-bridge code change unless the live check fails.
- Root suite stays Ubuntu-only in CI.

## Acceptance

- AC-1: Antigravity routes every owned subprocess termination through the shared
  tree helper: `AskAntigravity`, version probe, model discovery, task query and web
  tools (artifact openers stay detached by design). Tests (Windows-capable) prove a
  parent and grandchild both exit on abort/timeout for at least `AskAntigravity` and one
  short-lived probe path; existing helper/driver tests stay green.
- AC-2: Antigravity devDependencies `@earendil-works/pi-ai`, `pi-coding-agent`, `pi-tui`
  move to `^0.99.1` with the root lockfile updated; package typecheck and tests pass
  (fix only type fallout required by the bump).
- AC-3: pi-subagents gains a Windows-capable test that runs a real SDK child using the
  actual Pi bash tool with a command that spawns a grandchild, aborts the task and
  proves no descendant survives and the task persists `cancelled`; the POSIX custom-
  runner test keeps its POSIX guard with an explicit reason.
- AC-4: CI adds a `windows-latest` job (Node 22.19, pnpm 11.2.2, frozen install) running
  the three package typechecks and offline tests (claude `test:unit`); the root suite
  stays on Ubuntu. `AGENTS.md` and `docs/agent/testing.md` describe the new job.
- AC-5: Live manual check after merge and full Pi restart, on main at the merged commit
  (record the commit and confirm the loaded package paths point at the main checkout).
  For each of a claude-bridge subagent and an antigravity subagent: record the task id;
  wait until its owned subprocess is running (readiness: the provider process is
  visible and the task reports a running tool or stream); snapshot the full descendant
  tree of the Pi process (PIDs, names, parent PIDs) before cancel; cancel; after a
  bounded wait of 10 s, check that none of the snapshotted descendants owned by that
  task (any name, not only claude/agy) survive and the task persists `cancelled`. A
  survivor or a non-running provider at cancel time fails AC-5 and blocks archive; frozen
  package checks and root `check:ci`, `typecheck`, `build`, `pnpm test` (known four
  missing-sibling failures only) pass.

## Clarifications

- CI: add a Windows job only for the three pi-packages (user, 2026-10-01).
- Claude Windows cleanup: verified by a manual live check; code changes only if it
  fails (user, 2026-10-01).

## Decisions

- Plan review round 1 (fresh Oracle): REJECT only on AC-5 vagueness; repaired with
  loaded-source evidence, readiness, pre-cancel descendant snapshots and a bounded
  survivor check. Cautions adopted: preserve timeout/output-cap outcomes while awaiting
  termination and use POSIX detached groups for short-lived paths (AC-1); 0.99.1 bump
  fallout is `ExtensionToolContext` typing in `approval-gate.ts` and tests (AC-2); AC-3
  measures survivors rather than inferring cleanup from `cancelled` (Pi's taskkill is
  asynchronous) and uses a deterministic offline bash tool-call fixture provider.
- Reuse the existing antigravity helper rather than a new cross-package utility; Pi's
  bash tool already owns its own tree kill.
- Tests that need processes use `node` scripts (not bash/sleep) so they run on Windows
  and Ubuntu alike.

## Durable deltas

- None.

## Plan

1. Worker A (sole writer of `pi-packages/pi-antigravity-bridge/**` and the root
   `pnpm-lock.yaml`): AC-1 and AC-2, test-first.
2. Worker B (sole writer of `pi-packages/pi-subagents/**`): AC-3, test-first.
3. Root (parallel, disjoint): AC-4 CI job and docs.
4. Root: frozen checks, commits, merge, restart, AC-5 live check, fresh Oracle, archive.

## Tasks

- [ ] AC-1: shared tree termination in antigravity
  - Outcome: no owned agy subprocess path skips tree termination
  - Known entrypoints and skill paths: the AskAntigravity module and `pi-packages/pi-antigravity-bridge/src/{agy-version,models,tasks,web-tools}.ts`, `src/process-termination.ts`, tdd skill `C:\Users\EremesNG\.pi\agent\skills\tdd\SKILL.md`
  - Inputs: Exploration
  - Dependencies: none
  - Output: code + tests
  - Owner: worker A
  - Writes: `pi-packages/pi-antigravity-bridge/src/**`, `tests/**`
  - Interface boundaries: tool behavior and outputs unchanged
  - Focused check and PASS evidence: new parent+grandchild tests pass on Windows; full package suite green
  - Return milestone: tests green
  - Stop / reassessment: a path needs the process to outlive Pi
- [ ] AC-2: Pi 0.99.1 dev alignment
  - Outcome: antigravity develops against 0.99.1
  - Known entrypoints and skill paths: `pi-packages/pi-antigravity-bridge/package.json:65-67`, `pnpm-lock.yaml`
  - Inputs: Exploration
  - Dependencies: none
  - Output: manifest + lockfile (+ type fixes)
  - Owner: worker A
  - Writes: package.json, `pnpm-lock.yaml`, minimal source type fixes
  - Interface boundaries: runtime behavior unchanged
  - Focused check and PASS evidence: `pnpm install --frozen-lockfile`, package typecheck/test
  - Return milestone: green
  - Stop / reassessment: fallout requires behavior changes
- [ ] AC-3: real Pi bash cancellation test
  - Outcome: Windows proof that subagent cancel kills bash descendants
  - Known entrypoints and skill paths: `pi-packages/pi-subagents/test/runner/real-process-cancel.test.ts`, `test/runner/providers-real-sdk.test.ts`, `src/runner/sdk-runner.ts`, tdd skill
  - Inputs: Exploration
  - Dependencies: none
  - Output: tests (+ fix if it fails)
  - Owner: worker B
  - Writes: `pi-packages/pi-subagents/**`
  - Interface boundaries: runtime behavior unchanged unless the test exposes a bug
  - Focused check and PASS evidence: new test passes on Windows; suite green
  - Return milestone: tests green
  - Stop / reassessment: the test exposes a defect needing a design decision
- [ ] AC-4: Windows CI job and docs
  - Outcome: CI runs package checks on Windows
  - Known entrypoints and skill paths: `.github/workflows/ci.yml` (one step per check so a failing command cannot be masked by multiline PowerShell), `AGENTS.md` (edited after evidence-only-discovery-roles' AGENTS.md edit; serialized) (Change and verification flow), `docs/agent/testing.md`, progressive-context-router skill
  - Inputs: Clarifications
  - Dependencies: none
  - Output: workflow + docs
  - Owner: root
  - Writes: those three files
  - Interface boundaries: Ubuntu job unchanged
  - Focused check and PASS evidence: workflow YAML review; `pnpm run check:ci`
  - Return milestone: committed
  - Stop / reassessment: none
- [ ] AC-5: live and frozen checks
  - Outcome: live cancel leaves no descendants; full checks pass
  - Known entrypoints and skill paths: thoth-archive skill
  - Inputs: AC-1..AC-4
  - Dependencies: AC-1..AC-4
  - Output: evidence
  - Owner: root
  - Writes: none
  - Interface boundaries: operator config restored by hash after any temporary profile switch
  - Focused check and PASS evidence: per-task pre-cancel descendant snapshot and bounded post-cancel survivor check as defined in AC-5; frozen checks
  - Return milestone: fresh Oracle PASS
  - Stop / reassessment: claude descendants survive (then plan a claude-bridge fix)

## Authorization

**Plan review**: PENDING
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: PENDING

## Verification

**Reviewer**: PENDING
**Independent from implementer**: PENDING
**Verdict**: PENDING
**Reviewed record SHA-256**: PENDING

- AC-1: PENDING | check | evidence
- AC-2: PENDING | check | evidence
- AC-3: PENDING | check | evidence
- AC-4: PENDING | check | evidence
- AC-5: PENDING | check | evidence

## Closeout

**Archive**: PENDING
