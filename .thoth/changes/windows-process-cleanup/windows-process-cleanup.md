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
  visible and the task reports a running tool or stream). Run the two tasks serially
  with Pi otherwise quiescent. Snapshot the Pi descendant tree (PIDs, names, parent
  PIDs, creation times) before each task starts and again just before cancel; bind the
  non-empty pre-cancel-minus-baseline set, including provider and Pi-tool branches, to
  that task id (empty or ambiguous attribution fails AC-5); cancel; after a bounded
  wait of 10 s, check that no bound process (same PID and creation time, any name)
  survives and the task persists `cancelled`. A
  survivor or a non-running provider at cancel time fails AC-5 and blocks archive; frozen
  package checks and root `check:ci`, `typecheck`, `build`, `pnpm test` (known four
  missing-sibling failures only) pass.

## Clarifications

- CI: add a Windows job only for the three pi-packages (user, 2026-10-01).
- Claude Windows cleanup: verified by a manual live check; code changes only if it
  fails (user, 2026-10-01).

## Decisions

- Plan review round 2 (fresh Oracle): REJECT only on AC-5 attribution (SDK children
  share the Pi process; no public PID mapping); repaired with serial quiescent runs and
  baseline-diff binding with creation times.
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
- Implementation checkpoint (root, 2026-10-01): `eb88b34` (worker A: five antigravity
  paths await the shared tree helper, six node parent/grandchild tests, Pi dev deps
  0.99.1 with ExtensionToolContext typing fixes, lockfile), `399cc48` (worker B: real SDK
  bash cancellation test with negative control; POSIX test explicit skip reason),
  `d5a6c92` (root: `pi-packages-windows` CI job, AGENTS.md, docs/agent/testing.md).
  Frozen checks: frozen install 0; pi-subagents typecheck 0 and five suite runs 516
  passed / 1 skipped after one first-run single intermittent failure whose test name
  was not captured; antigravity 0 / 566 passed, 9 skipped; claude 0 / unit 290; root
  check:ci, typecheck, build 0; root test 1204 passed / 4 missing-sibling failures.
  Ubuntu and Node 22.19 left to CI. Live AC-5 follows after merge and restart.

- Live AC-5 (2026-10-01, main 0.5.0 at 0272780 containing the merged change; full Pi
  restart; settings load all four pi-packages from the main checkout; root PID 63212,
  quiescent baseline 4 descendants; snapshots by CIM outside Pi's view, excluding the
  snapshotting chain). Claude child (subagents.json designer model switched temporarily,
  restored, hash f51fa3f3 unchanged; first attempt invalid: designer explicitly selected
  inactive agent_browser_electron whose top-level anyOf schema claude-bridge rejects,
  misclassified as provider_network_error; operator removed inactive tools):
  task subtask_thoth-designer_1790887829492_cad607c8 running Pi bash; bound set 8
  (claude.exe 37708 + conhost; bash 68740 > bash 27680 > node 76248 > node 35064 +
  conhosts); cancel; after 10 s survivors 0 by PID and creation time; history status
  cancelled. Antigravity child: task subtask_thoth-designer_1790887908871_e3b9d555 running
  agy native command; bound set 9 (agy.exe 29004 > cmd > node > node, pwsh > node > node,
  conhosts); cancel; after 10 s survivors 0; history cancelled; no pi-agy cache or private
  config left.

## Durable deltas

- None.

## Plan

1. Worker A (sole writer of `pi-packages/pi-antigravity-bridge/**` and the root
   `pnpm-lock.yaml`): AC-1 and AC-2, test-first.
2. Worker B (sole writer of `pi-packages/pi-subagents/**`): AC-3, test-first.
3. Root (parallel, disjoint): AC-4 CI job and docs.
4. Root: frozen checks, commits, merge, restart, AC-5 live check, fresh Oracle, archive.

## Tasks

- [x] AC-1: shared tree termination in antigravity
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
- [x] AC-2: Pi 0.99.1 dev alignment
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
- [x] AC-3: real Pi bash cancellation test
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
- [x] AC-4: Windows CI job and docs
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
- [x] AC-5: live and frozen checks
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

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

The user explicitly selected Review plan with Oracle. Rounds 1-2 returned [REJECT]
(AC-5 vagueness, then attribution), repaired here; round 3 fresh Oracle
subtask_thoth-oracle_1790871001625_d15f42af returned [OKAY]. Cautions: take snapshots
outside Pi and check bound identities globally afterward (reparented survivors).

## Verification

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: d09d4eb685ebab8e105c63762aaf466c4f276a60a17b0717c5c4c3048da22c0d

Fresh read-only Oracle subtask_thoth-oracle_1790888523853_345260f7 returned PASS at
HEAD a3950b5 for commits eb88b34, 399cc48, d5a6c92 (later commits distinguished; relevant
content matches live-checked main 0272780).

- AC-1: PASS | code review + fresh Windows focused tests | five antigravity termination paths await the shared helper with outcomes preserved, artifact openers stay detached; 144 focused tests passed
- AC-2: PASS | manifest/lockfile/installed deps + typecheck | Pi 0.99.1 everywhere; ExtensionToolContext typing only; typecheck 0
- AC-3: PASS | real SDK bash cancel test + in-memory negative control | test passes with history cancelled; disabling tree kill leaves two survivors and fails as expected; POSIX test keeps explicit skip reason
- AC-4: PASS | workflow and docs review | windows-latest job Node 22.19/pnpm 11.2.2, frozen install, one step per check; root stays Ubuntu; docs accurate
- AC-5: PASS | recorded live protocol | restarted main checkout, readiness, bound sets 8 (claude) and 9 (antigravity), zero identity-matched survivors after 10 s, history cancelled; invalid schema attempt excluded; frozen/root checks within the four-failure exception
- Source: pi-packages/pi-antigravity-bridge/src/process-termination.ts | sha256:d7fa760a815c59da1b8694bb2f3d3425274e6bc406bdc88c03acd94666586636
- Source: pi-packages/pi-antigravity-bridge/src/ask-tool.ts | sha256:31749f853468018040184fcb78a74c1e7446da761287e737b87dbf0fa1beabf1
- Source: pi-packages/pi-antigravity-bridge/src/agy-version.ts | sha256:511b68e0eda63f7c4f20feb8d2d37e3d550772ac64eb3370aec13227d3167495
- Source: pi-packages/pi-antigravity-bridge/src/models.ts | sha256:7576d516419783292e7b53dee6aba8b76dc472453a144797f20ac05ba654c5e0
- Source: pi-packages/pi-antigravity-bridge/src/tasks.ts | sha256:838d67412ac3ba4ed80a0529aca97960b07608bb157f66b73f9842944c3d872b
- Source: pi-packages/pi-antigravity-bridge/src/web-tools.ts | sha256:6569621d39c7b417550d847cb6caccb6a23ca3a1dfc7754d7b92fb98330a185a
- Source: pi-packages/pi-antigravity-bridge/package.json | sha256:80c21c8b073a70fcb58a6d6095c1ec33a165cace1e3ea7d9810d9a0368d8be67
- Source: pi-packages/pi-subagents/test/runner/real-sdk-process-cancel.test.ts | sha256:7426972ade612f8c32b82d2f8a2b2ba28e48479718c0d2a7527b0fd1d8363ecb
- Source: .github/workflows/ci.yml | sha256:09a751383c1d0673f4a66fc9a0a7f3dea1c8bbf64ff7eaa97e11a6316890f248
- Source: docs/agent/testing.md | sha256:18e46ce2ea18cd6310ee3d4d495e7541cac2785095f3188c4a648fb48ed0ad12

## Closeout

**Archive**: READY
