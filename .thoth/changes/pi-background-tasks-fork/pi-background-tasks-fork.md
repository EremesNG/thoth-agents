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
  are installed by the root pnpm workspace and checked in CI (Ubuntu and the
  `pi-packages-windows` job); the two bridges are excluded from root Biome while
  pi-subagents stays Biome-checked.

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
  and records them cancelled. When a job leader or a watch poll command exits on its
  own, the remaining descendants of its tree are terminated and verified before the job
  becomes terminal or the next poll starts (process-group semantics); leader exit or a
  settled command alone never counts as verified termination, and a job whose cleanup
  fails stays running and owned until verification. A leader already lost when an
  instance resumes, whose descendants cannot be identified on Windows, is a documented
  limit. Runtime scheduling state, navigator ownership
  (`navigator-provider.ts:21-43` `piRef`/active origin, `shared-navigator.ts` global UI
  state) and failure-attention state are per extension instance or keyed by origin, so
  a headless child loading or ending never replaces or disposes root UI, navigator or
  callbacks. On reload, control of an in-flight watch poll is handed off by origin: the
  new instance adopts (or the old instance finishes and releases) the running poll so
  no overlapping poll starts and a later quit can abort it; timers stay instance-local.
  Tests cover quit/new/resume/fork stop, reload survival and single delivery, reload
  during a blocked poll followed by quit (no overlapping poll, no surviving descendant,
  single delivery), TERM-resistant POSIX processes (descendants and groups, not only the
  leader), watch abort, two concurrent origins, and child load/end leaving root UI and
  callbacks unchanged.
- AC-4: Children: `@thoth-agents/pi-background-tasks` joins pi-subagents' default
  `lifecycle_passthrough`; a child's jobs stop on child completion, cancellation, error
  or parent-driven teardown, without affecting sibling or root jobs. Child teardown
  guarantees the background package's shutdown cleanup runs before disposal with its own
  bound, independent of other extensions' shutdown handlers that stall (today the whole
  sequential emission races one 5 s deadline, `session-teardown.ts:12-38`). Real-SDK
  tests in pi-subagents, including a hanging preceding handler and multiple jobs.
- AC-5: Docs and CI: package README (provenance, trimmed scope, lifecycle and limits),
  pi-subagents README/skill, `docs/installation.md`, `docs/agent/harness-packaging.md`
  name the fork for shell jobs; the root Pi adapter guidance default passthrough list
  (`src/harness/adapters/pi.ts:52`) and its test include the fork; the Ubuntu and Windows
  CI jobs check the package; AGENTS.md CI description updated.
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
- When a job leader or watch poll command exits on its own, kill and verify its remaining
  descendants before terminalizing (user, 2026-10-01, after final verification round 3
  found natural-close, lost-leader and poll-settlement paths abandoning descendants).
- Standalone-star exclusions stay as defense; docs recommend the fork (user, 2026-10-01).

## Decisions

- Plan review round 1 (fresh Oracle): REJECT — shared navigator/attention state made
  passthrough unsafe; reload could strand an in-flight watch poll; child teardown is
  best-effort behind other handlers. Repaired in AC-3/AC-4 and Tasks. Cautions adopted:
  child `pi.sendMessage` is bound to the child session; verify descendants and groups;
  keep hermetic test isolation from prior vendoring.
- Base on upstream `86876e8` (current main; package identical to the probed `97218c6`).
- Fix lifecycle in the fork rather than a bridge over the private registry format;
  per-instance runtime state makes lifecycle passthrough safe for concurrent sessions.
- Keep tool names unchanged; they stay eligible under standalone `*`.

- Implementation checkpoint (root, 2026-10-01): `a41144d` (worker A: vendored from
  86876e8 with provenance/MIT, owned shared libs, Pi 0.99.1/Vitest 4; trimmed remote,
  sandbox and goal), `cda1fef` (worker A: reload keep + origin poll adoption; non-reload
  stop of jobs and in-flight watches with verified tree termination; per-instance
  runtime/navigator/attention state; windowsHide on every spawn; tests found and fixed two
  POSIX descendant-discovery gaps and an overdue-adoption leak), `ecc6568` (worker B:
  default passthrough + dedicated bounded fork shutdown phase before generic teardown;
  red run left four survivors behind a hanging handler, green zero; docs), `01d6514` and
  `3a5159d` (root: Biome exclusion, CI steps on Ubuntu and Windows, AGENTS.md, testing,
  installation and packaging docs, adapter default passthrough guidance test-first).
  Out of scope, recorded: Windows Git Bash trampoline mangles escaped backslash paths
  inside multiline `node -e` arguments (upstream behavior). Frozen checks: frozen install
  0; pi-subagents 0 / 525 passed, 1 skipped; antigravity 0 / 571 passed, 9 skipped;
  background-tasks 0 / 190 passed, 4 skipped (two real POSIX termination cases run only
  on POSIX CI); claude 0 / unit 290; root check:ci, typecheck, build 0 (no generated
  drift); root test 1208 passed / 4 missing-sibling failures. Live AC-6 follows.

- Live AC-6 (2026-10-01, main 0.5.0 at 0272780; full restart; operator settings entry
  switched from npm:pi-background-tasks to the fork path with backup
  settings.json.bgfork-1790881896; Pi loaded bg_task_* and no bg_run). Root reload: job
  bg_1crw_muq0ha8b_1 (node 69736 + grandchild 75308) kept the same PIDs and creation
  times across the operator's /reload, origin session 01a0f3b8 unchanged, and its
  completion was delivered exactly once (one background-completion-batch entry in the
  session). Root /new: job bg_1crw_muq0mpfq_1 (67412 + 31764) — after the operator's /new
  and /resume both PIDs were gone and meta recorded cancelled at 20:58:12Z. Children (the
  operator temporarily added bg_task_spawn/bg_task_status to thoth-worker via
  /subagents-tools): a worker that spawned a job and finished left no job process (45192 +
  33900 gone; meta cancelled, origin = child session); a worker cancelled while running
  left no job process (77100 + 18160 gone after 10 s; meta cancelled, child origin); the
  root control job bg_1crw_muq0q2yt_2 (15776 + 77564) stayed alive throughout and was then
  stopped by root.

- Final verification round 1 (fresh Oracle subtask_thoth-oracle_1790888523859_eed6d6f8):
  FAIL only on AC-3 — a failed watch termination dropped poll ownership (a retry recorded
  cancelled without verifying the live tree) and a failed timeout cleanup marked the watch
  terminal so shutdown skipped it; AC-1, AC-2, AC-4..AC-6 PASS, spec baseline matched.
  Repaired in `31fadad` (worker, test-first): command handle and captured
  descendant/group IDs stay owned and retriable until termination verifies; two
  fault-injection regressions red then green. Package typecheck 0; two suite runs 192
  passed / 4 skipped. Deployed Pi needs a full restart to load it.

- Final verification round 2 (fresh Oracle subtask_thoth-oracle_1790889810203_f698208b):
  FAIL only on AC-3 — the watch repair held, but ordinary jobs lost cleanup ownership after
  partial termination (retry recorded cancelled with an orphan alive; a delayed leader
  close recorded failed and quit skipped the survivor). Repaired in `91773a4`
  (worker, test-first) as a general invariant: every job keeps its terminator and captured
  descendants across stop/deadline failures, retries, shutdown and reload; leader close
  only records exit facts while cleanup is still running; handoff/lost-process paths and
  finalization cannot terminalize unfinished cleanup; worker audited every terminal-status
  write and terminator release. Six regressions red then green. Package typecheck 0; two
  suite runs 198 passed / 4 skipped; pi-subagents suite unchanged.

- Final verification round 3 (fresh Oracle subtask_thoth-oracle_1790891116577_ad68839c):
  FAIL only on AC-3 — requested-stop failure paths now hold, but ownership escaped through
  natural leader close (runtime.ts:239-260), lost-leader recovery (runtime.ts:351-354,
  398-404,428-437) and every watch poll settlement (process.ts:237-254; runtime.ts:539-655,
  690-713); a real Windows probe confirmed exit 0 with a live descendant. The user chose
  process-group semantics (Clarifications); AC-3 and the delta were amended accordingly.

## Durable deltas

- `ADDED multi-harness-agent-pack` **Own session-scoped Pi background shell jobs** — The vendored `@thoth-agents/pi-background-tasks` package MUST run local shell jobs owned by their session, MUST keep a session's running jobs across that session's reload, and MUST stop every running job of the session, including in-flight watch commands, with verified process-tree termination on any other session shutdown, including subagent teardown, MUST terminate and verify the remaining process tree when a job leader or watch command exits on its own before recording the job terminal, and MUST NOT affect jobs of other sessions.
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

- [x] AC-1: vendor and tooling
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
- [x] AC-2: trim to local jobs
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
- [x] AC-3: lifecycle and verified termination
  - Outcome: reload keeps jobs; other shutdowns stop them verifiably
  - Known entrypoints and skill paths: `src/index.ts:25-29`, `src/runtime.ts:28-44,130-146,570-614,728-800,830-858,1061-1150`, `src/process.ts:178-259,352-392`, `src/navigator-provider.ts:21-43`, `src/shared-navigator.ts:111,209-238`, tdd skill
  - Inputs: AC-2
  - Dependencies: AC-2
  - Output: code + tests
  - Owner: worker A
  - Writes: `pi-packages/pi-background-tasks/**`
  - Interface boundaries: tool schemas unchanged
  - Focused check and PASS evidence: tests listed in AC-3 pass on Windows
  - Return milestone: green
  - Stop / reassessment: per-instance state conflicts with reload handoff semantics
- [x] AC-4: child coverage
  - Outcome: child jobs stop with the child
  - Known entrypoints and skill paths: `pi-packages/pi-subagents/src/config.ts:23-26`, `src/runner/sdk-runner.ts:272-308`, `src/runner/session-teardown.ts:12-38`, `test/runner/providers-real-sdk.test.ts`, tdd skill
  - Inputs: AC-3
  - Dependencies: AC-3
  - Output: config default + real-SDK tests + docs
  - Owner: worker B
  - Writes: `pi-packages/pi-subagents/**`
  - Interface boundaries: other passthrough behavior unchanged
  - Focused check and PASS evidence: child completion/cancel/error stop child jobs; sibling and root jobs unaffected; with a hanging preceding shutdown handler the child's multiple jobs still stop before disposal
  - Return milestone: green
  - Stop / reassessment: passthrough exposes prompt-shaping behavior from the package
- [x] AC-5: docs and CI
  - Outcome: docs and CI cover the fork
  - Known entrypoints and skill paths: `biome.json`, `.github/workflows/ci.yml`, `AGENTS.md`, `src/harness/adapters/pi.ts:52` + `pi.test.ts` (root, after worker B), `docs/installation.md:396-399`, `docs/agent/harness-packaging.md:40,54-58`, pi-subagents README:5,151 and SKILL:182 (worker B), package README (worker A)
  - Inputs: Clarifications
  - Dependencies: none for root parts
  - Output: docs/CI
  - Owner: root (root files); workers for their package docs
  - Writes: root files listed
  - Interface boundaries: unrelated docs unchanged
  - Focused check and PASS evidence: `pnpm run check:ci`; workflow review
  - Return milestone: committed
  - Stop / reassessment: none
- [x] AC-6: live and frozen checks
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

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

The user explicitly selected Review plan with Oracle. Round 1 returned [REJECT] (shared
navigator state, reload poll handoff, best-effort child teardown), repaired here; round 2
fresh Oracle subtask_thoth-oracle_1790873914669_dab9caec returned [OKAY]. The user then
explicitly chose Implement. Cautions: the AC-4 seam captures the fork's handlers during
isolation and invokes them once via the public `ExtensionRunner.createContext()` with
their own bound, deduplicating ordinary emission (enlarging the shared race does not
satisfy AC-4); explicit passthrough arrays replace defaults, so AC-6 checks the
effective configuration; the root adapter's hardcoded default list was added to AC-5 at
the reviewer's caution.

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
