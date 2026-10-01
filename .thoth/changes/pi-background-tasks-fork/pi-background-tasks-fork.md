# Change: pi-background-tasks-fork

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: medium
**Risk**: medium

## Exploration

- Comparison (Librarian matrices, fresh Oracle judgment, operator clarification): the
  operator's background need is shell/process jobs only; LLM launching is covered by
  pi-subagents. npm `pi-background-tasks` 2.6.9 is operator-owned
  (`~/.pi/agent/settings.json:15`, `"npm:pi-background-tasks"`); thoth-agents never
  installs or verifies it (`src/cli/pi-install.ts:43-75`).
- Live isolated probe of `pi-better-background-tasks` (1aboveio/pi-better-harness
  `97218c6`, npm 0.6.2) on Windows/Pi 0.99.1: loads cleanly; eight tools `bg_task_spawn`,
  `bg_task_watch`, `bg_task_list`, `bg_task_status`, `bg_task_log`, `bg_task_stop`,
  `bg_task`, `bg_status`; stop and timeout kill parent and grandchild; watches fire;
  completion via `pi.sendMessage` `{deliverAs:"followUp",triggerTurn:true}`; same-session
  reload keeps the job and the new instance delivers it; quit or owner exit leaves the
  tree running with deadlines unenforced; origin-scoped registry under
  `os.tmpdir()/pi-better-background-tasks/`; spaces in paths work; Windows spawn uses
  Git Bash (shell strings get MSYS argument conversion, argv does not).
- Feasibility (Explorer + Oracle): shutdown handler ignores the reason and only
  suspends (`src/index.ts:25-29`, `runtime.ts:132-146`); `stopTask` (`runtime.ts:728-800`)
  sends TERM without awaiting exit on POSIX; in-flight watch commands spawn in
  `runCommandOnce` (`process.ts:178-259`) with an untracked PID and no abort signal
  (`runtime.ts:830-858`); suspended deadlines are not enforced
  (`runtime.ts:1061-1072`); scheduling state is module-global (`runtime.ts:28-44,130-143`),
  which with Pi's cached extension factories risks cross-session interference.
  Lean pi-subagents children keep third-party tools but filter their handlers unless
  listed in `lifecycle_passthrough` (`pi-packages/pi-subagents/src/runner/sdk-runner.ts:272-308`,
  `src/config.ts:23-26`); child jobs belong to the child session origin; child teardown
  emits `quit` with a 5 s race (`session-teardown.ts:12-38`); root shutdown closes
  children regardless of reason (`subagents-extension.ts:275`, `manager.ts:556`).
- Vendoring facts (Librarian, upstream main `86876e8`, identical package to `97218c6`;
  npm 0.6.2 = `9cc2080`, differing only in two navigator rendering details): no runtime
  dependency on sibling monorepo packages (shared libraries are copied into `src/`);
  peers `@earendil-works/pi-coding-agent`, `typebox`; imports undeclared
  `@earendil-works/pi-tui` (runtime) and `pi-ai` (one test); MIT,
  "Copyright (c) 2026 1aboveio"; 25 production files / 12,555 LOC (sandbox core 1,663,
  navigator 1,571, runtime 1,325, SSH core 902); 23 test files, several assuming
  `bash`/`sleep`/`/var/tmp`; `pretest`/`prepack`/`pretypecheck` run monorepo
  `scripts/sync-shared-*`; one test imports `../../../scripts/provider-schema-compat.mjs`;
  Vitest ^3 vs local 4; NodeNext/noEmit source-TS Pi loading like our other packages.
- Repository surfaces naming the current package (Explorer): pi-subagents README:5,151,
  `skills/subagents-configuration/SKILL.md:182`, `docs/installation.md:396-399`,
  `docs/agent/harness-packaging.md:40,54-58`; standalone-star exclusions
  (`pi-subagents/src/tool-patterns.ts`, root `src/pi/tools-panel.ts`, spec line 473) stay.
- Previously vendored packages (`pi-subagents`, both bridges) live in `pi-packages/`,
  are installed by the root pnpm workspace, excluded from root Biome, and checked in CI
  (Ubuntu and the `pi-packages-windows` job).

## Intent

Own a trimmed fork of pi-better-background-tasks as `@thoth-agents/pi-background-tasks`
for local shell jobs: jobs survive `/reload` of their owning session and are stopped,
with verified termination, on every other shutdown, including subagent teardown.

## Non-goals

- No SSH/tmux remote jobs, sandbox enforcement/observation or pi-better goal
  integration.
- No thoth-agents installer change: the package stays operator-selected in Pi settings.
- No survival of child jobs across a root `/reload` (children close and their jobs
  stop).
- No protection against abrupt Pi death (no hook runs); Job Object containment remains
  out of scope.
- Standalone-star delegation exclusions stay unchanged as defense.

## Acceptance

- AC-1: `pi-packages/pi-background-tasks/` holds the package copied from upstream
  `86876e8` with provenance recorded, renamed `@thoth-agents/pi-background-tasks`, MIT
  LICENSE and copyright retained; shared libraries become owned source (sync scripts and
  monorepo script imports removed); `@earendil-works/pi-tui` declared; Pi dev
  dependencies 0.99.1 and Vitest/TypeBox aligned with the workspace; root Biome excludes
  it; frozen workspace install works; package typecheck and tests pass on Windows.
- AC-2: Trimmed to local jobs: SSH/tmux remote, sandbox core and observation, and goal
  provider removed with their tool parameters, docs and tests; local spawn, watches,
  logs, list/status/stop, callbacks and the navigator kept. Tests that need POSIX tools
  become node-based or carry an explicit POSIX guard with reason.
- AC-3: Lifecycle: on `session_shutdown` with reason `reload` the current
  suspend/handoff behavior is kept; on every other reason the package stops all running
  jobs of that origin, including in-flight watch commands (tracked and aborted), with
  verified termination (Windows tree kill awaited; POSIX TERM, bounded wait, then KILL)
  and records them cancelled. Runtime scheduling state is per extension instance, so
  concurrent sessions and children do not interfere. Tests cover quit/new/resume/fork
  stop, reload survival and single delivery, TERM-resistant POSIX processes, watch
  abort, and two concurrent origins.
- AC-4: Children: `@thoth-agents/pi-background-tasks` joins pi-subagents' default
  `lifecycle_passthrough`; a child's jobs stop on child completion, cancellation, error
  or parent-driven teardown, without affecting sibling or root jobs. Real-SDK tests in
  pi-subagents.
- AC-5: Docs and CI: package README (provenance, trimmed scope, lifecycle and limits),
  pi-subagents README/skill, `docs/installation.md`, `docs/agent/harness-packaging.md`
  name the fork for shell jobs; the Ubuntu and Windows CI jobs check the package;
  AGENTS.md CI description updated.
- AC-6: Live, after merge, operator settings switch (backup first, explicit
  confirmation) and full Pi restart: a root job survives `/reload` and delivers once;
  `/quit` (or `/new`) stops a running root job tree (verified from outside Pi by PID and
  creation time); a subagent's job stops when the subagent ends or is cancelled; frozen
  package and root checks pass.

## Clarifications

- Fork into `pi-packages` when the package does not fit 100% (user, 2026-10-01).
- Keep only local jobs (user, 2026-10-01).
- Package name `@thoth-agents/pi-background-tasks` (user, 2026-10-01).
- Jobs survive `/reload`; stopped on any other shutdown (user, 2026-10-01).
- Child jobs stop with the subagent, including on root `/reload` (user, 2026-10-01).
- Standalone-star exclusions stay as defense; docs recommend the fork (user, 2026-10-01).

## Decisions

- Base on upstream `86876e8` (current main; package identical to the probed `97218c6`).
- Fix lifecycle in the fork rather than a bridge over the private registry format;
  per-instance runtime state makes lifecycle passthrough safe for concurrent sessions.
- Keep tool names unchanged; they stay eligible under standalone `*`.

## Durable deltas

- `ADDED multi-harness-agent-pack` **Own session-scoped Pi background shell jobs** — The vendored `@thoth-agents/pi-background-tasks` package MUST run local shell jobs owned by their session, MUST keep a session's running jobs across that session's reload, and MUST stop every running job of the session, including in-flight watch commands, with verified process-tree termination on any other session shutdown, including subagent teardown, without affecting jobs of other sessions.
  - GIVEN running background jobs in a root session and in a subagent; WHEN the root reloads, the subagent ends, or the root quits; THEN the root jobs survive the reload and deliver once, the subagent jobs stop with it, and on quit no job process of that session survives while other sessions' jobs continue.

## Plan

1. Worker A (sole writer of `pi-packages/pi-background-tasks/**` and root
   `pnpm-lock.yaml`): AC-1, then AC-2, then AC-3, test-first for behavior.
2. Worker B (sole writer of `pi-packages/pi-subagents/**`, after AC-3): AC-4.
3. Root (parallel, disjoint): root `biome.json` exclusion, CI steps, AGENTS.md,
   `docs/installation.md`, `docs/agent/harness-packaging.md` (AC-1/AC-5 root parts).
4. Root: frozen checks, commits, merge, operator settings switch with backup, restart,
   AC-6 live, fresh Oracle, archive.

## Tasks

- [ ] AC-1: vendor and tooling
  - Outcome: package builds and tests in the workspace
  - Known entrypoints and skill paths: upstream `packages/pi-better-background-tasks` at `86876e8`, prior vendoring record `.thoth/changes/archive/2026-09-30-pi-bridges-adoption/pi-bridges-adoption.md`
  - Inputs: Exploration
  - Dependencies: none
  - Output: package + lockfile
  - Owner: worker A
  - Writes: `pi-packages/pi-background-tasks/**`, `pnpm-lock.yaml`
  - Interface boundaries: other packages untouched
  - Focused check and PASS evidence: frozen install; package typecheck and test on Windows
  - Return milestone: green
  - Stop / reassessment: a hidden runtime dependency on a sibling monorepo package
- [ ] AC-2: trim to local jobs
  - Outcome: remote, sandbox and goal code removed
  - Known entrypoints and skill paths: `src/remote-task-preset.ts`, `src/shared-ssh-core/**`, `src/shared-sandbox-core.ts`, `src/sandbox.ts`, `src/goal-provider.ts`, `src/tools.ts`, tdd skill `C:\Users\EremesNG\.pi\agent\skills\tdd\SKILL.md`
  - Inputs: AC-1
  - Dependencies: AC-1
  - Output: code + tests
  - Owner: worker A
  - Writes: `pi-packages/pi-background-tasks/**`
  - Interface boundaries: local tool behavior unchanged
  - Focused check and PASS evidence: suite green on Windows; no remote/sandbox/goal references remain
  - Return milestone: green
  - Stop / reassessment: local paths depend on removed modules beyond simple extraction
- [ ] AC-3: lifecycle and verified termination
  - Outcome: reload keeps jobs; other shutdowns stop them verifiably
  - Known entrypoints and skill paths: `src/index.ts:25-29`, `src/runtime.ts:28-44,130-146,728-800,830-858,1061-1150`, `src/process.ts:178-259,352-392`, tdd skill
  - Inputs: AC-2
  - Dependencies: AC-2
  - Output: code + tests
  - Owner: worker A
  - Writes: `pi-packages/pi-background-tasks/**`
  - Interface boundaries: tool schemas unchanged
  - Focused check and PASS evidence: tests listed in AC-3 pass on Windows
  - Return milestone: green
  - Stop / reassessment: per-instance state conflicts with reload handoff semantics
- [ ] AC-4: child coverage
  - Outcome: child jobs stop with the child
  - Known entrypoints and skill paths: `pi-packages/pi-subagents/src/config.ts:23-26`, `src/runner/sdk-runner.ts:272-308`, `test/runner/providers-real-sdk.test.ts`, tdd skill
  - Inputs: AC-3
  - Dependencies: AC-3
  - Output: config default + real-SDK tests + docs
  - Owner: worker B
  - Writes: `pi-packages/pi-subagents/**`
  - Interface boundaries: other passthrough behavior unchanged
  - Focused check and PASS evidence: child completion/cancel/error stop child jobs; sibling and root jobs unaffected
  - Return milestone: green
  - Stop / reassessment: passthrough exposes prompt-shaping behavior from the package
- [ ] AC-5: docs and CI
  - Outcome: docs and CI cover the fork
  - Known entrypoints and skill paths: `biome.json`, `.github/workflows/ci.yml`, `AGENTS.md`, `docs/installation.md:396-399`, `docs/agent/harness-packaging.md:40,54-58`, pi-subagents README:5,151 and SKILL:182 (worker B), package README (worker A)
  - Inputs: Clarifications
  - Dependencies: none for root parts
  - Output: docs/CI
  - Owner: root (root files); workers for their package docs
  - Writes: root files listed
  - Interface boundaries: unrelated docs unchanged
  - Focused check and PASS evidence: `pnpm run check:ci`; workflow review
  - Return milestone: committed
  - Stop / reassessment: none
- [ ] AC-6: live and frozen checks
  - Outcome: live lifecycle verified
  - Known entrypoints and skill paths: thoth-archive skill
  - Inputs: AC-1..AC-5
  - Dependencies: AC-1..AC-5
  - Output: evidence
  - Owner: root
  - Writes: operator `~/.pi/agent/settings.json` only after backup and explicit confirmation
  - Interface boundaries: operator config otherwise preserved
  - Focused check and PASS evidence: outside-Pi PID and creation-time checks per scenario
  - Return milestone: fresh Oracle PASS
  - Stop / reassessment: a job survives quit or a subagent end

## Authorization

**Plan review**: PENDING
**Plan review selection**: PENDING
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
- AC-6: PENDING | check | evidence
- Source: .thoth/specs/multi-harness-agent-pack/spec.md | sha256:038f88e274ae0db74c316f4ccf5341e693c7e06cc80719c4bcdf5222732c4614

## Closeout

**Archive**: PENDING
