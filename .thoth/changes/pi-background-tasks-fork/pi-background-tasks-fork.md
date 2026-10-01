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
for local shell jobs whose process trees are contained by the operating system (Windows
Job Objects, POSIX process groups), so stopping a job never misses an ordinarily created
descendant and never touches another job's or session's processes. Jobs survive a
same-process `/reload` of their owning session and stop, with verified termination, on
every other shutdown, including subagent teardown and abrupt Pi death on Windows. On
Windows, command jobs run in PowerShell 7.

## Non-goals

- No SSH/tmux remote jobs, sandbox enforcement/observation or pi-better goal
  integration.
- No thoth-agents installer change: the package stays operator-selected in Pi settings.
- No survival of child jobs across a root `/reload` (children close and their jobs
  stop), and no survival across a Pi process restart.
- No snapshot/census-based descendant tracking and no PID-based tree kill on Windows.
- No sandbox: work brokered through services, elevation, WSL or remote systems, and POSIX
  descendants that leave their process group (`setsid`), are documented limits.
- No Git Bash on Windows for command jobs; no bash fallback when PowerShell 7 is
  missing (fail with a clear error).
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
- AC-3: Lifecycle: on `session_shutdown` with reason `reload` the jobs keep running
  and the new instance adopts them (and any in-flight watch poll) by origin in the same Pi
  process, delivering each completion once; on every other reason the package stops all
  running jobs of that origin, including in-flight watch commands, terminating their
  containers (AC-7) and recording them cancelled only after the container reports no
  live process. When a job leader or a watch poll command exits on its own, its
  container is terminated and verified empty before the job becomes terminal or the next
  poll starts. A job whose termination cannot be verified stays running and owned and
  is retried by stop and by non-reload shutdown. Runtime, navigator and failure-attention
  state stay per extension instance or keyed by origin (headless children never replace
  or dispose root UI or callbacks). Tests cover quit/new/resume/fork stop, reload
  survival and single delivery, reload during a blocked poll then quit, natural exit with
  a surviving grandchild through a short-lived intermediate (job and every watch
  branch), watch abort, two concurrent origins, and child load/end leaving root UI and
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
  confirmation) and full Pi restart, with PowerShell 7 jobs on Windows: a root job
  survives `/reload` and delivers once; `/new` stops a running root job tree; a job
  whose leader exits leaving a grandchild through a short-lived intermediate leaves no
  survivor; a subagent's job stops when the subagent ends or is cancelled; jobs of a
  second concurrent Pi session are untouched; killing the Pi process abruptly leaves no
  job process; all verified from outside Pi by PID and creation time. Frozen package and
  root checks pass.
- AC-7: OS containment. Windows: every job and watch poll command is created suspended,
  assigned to its own unnamed Job Object (KILL_ON_JOB_CLOSE, breakaway disabled) and only
  then resumed; assignment failure terminates the suspended process and fails the launch
  (never runs uncontained). Termination uses TerminateJobObject; verification is
  QueryInformationJobObject reporting zero active processes. Job handles live in a
  hidden helper process outside the job (no Node native addon, no downloaded binary)
  that survives extension reload in the same Pi process, is re-attached by the new
  instance, and exits when Pi exits so the OS closes the jobs and kills their trees.
  No PID-based taskkill or ancestry census remains. POSIX: each job runs under a small
  anchor process that leads its own process group, starts the command inside that group
  and stays alive until cleanup finishes, so the group ID cannot be reused while the
  package may signal it; termination is TERM, bounded wait, KILL to the group, then
  verification that only the anchor remains, then authority is retired before the anchor
  exits last. Ownership is never reconstructed from persisted PID/PGID. A persistent
  POSIX guardian process, outside the job groups and holding a pipe from Pi, kills every
  registered group (TERM then KILL) when that pipe closes because Pi exited or crashed.
  Descendants that leave the group (`setsid`) are a documented limit. Tests (Windows and
  POSIX CI): containment of immediate-exit intermediates, deterministic PID-reuse cases
  (an unrelated process reusing a former descendant PID is never signalled), concurrent
  sessions with same cwd, nested host jobs, denied assignment fail-closed, attempted
  breakaway, helper death and abrupt parent death killing the jobs, reload re-attach,
  deterministic POSIX leader/PGID reuse (a reused group ID is never signalled), and the
  POSIX guardian killing groups when Pi is killed abruptly. The first worker checkpoint
  proves helper feasibility on the real host (compile once, assignment under the actual
  Pi/Orca job nesting) before rewiring.
- AC-8: PowerShell 7 on Windows. Command (string) jobs and watch commands run in
  PowerShell 7 (`pwsh -NoProfile -NonInteractive -Command`, discovered via an explicit
  override, `where.exe` and standard install paths, validated as Core edition 7+);
  argv jobs run the executable directly without a shell; the Git Bash trampoline is
  removed; a missing PowerShell 7 fails the launch with an actionable message. POSIX
  command jobs keep the existing shell. Tool descriptions tell the model which shell runs
  on each platform. Tests cover discovery, quoting, exit codes, stdout/stderr capture and
  UTF-8 on Windows; any code adapted from `oversk7/pi-pwsh-notify` keeps its MIT notice.

## Clarifications

- Fork into `pi-packages` when the package does not fit 100% (user, 2026-10-01).
- Keep only local jobs (user, 2026-10-01).
- Package name `@thoth-agents/pi-background-tasks` (user, 2026-10-01).
- Jobs survive `/reload`; stopped on any other shutdown (user, 2026-10-01).
- Child jobs stop with the subagent, including on root `/reload` (user, 2026-10-01).
- When a job leader or watch poll command exits on its own, kill and verify its remaining
  descendants before terminalizing (user, 2026-10-01).
- Standalone-star exclusions stay as defense; docs recommend the fork (user, 2026-10-01).
- Replan (user, 2026-10-01, after round-4 verification and the ownership-design judgment
  showed snapshot tracking can miss descendants and misattribute processes across
  sessions): keep this fork as the base, replace snapshot tracking with own OS
  containment (Windows Job Object, POSIX process group), PowerShell 7 for Windows command
  jobs, survival only across same-process `/reload` (any real Pi exit, including a crash,
  kills the jobs, on Windows and POSIX). pi-background-tasks (ISC) and pi-pwsh-notify (MIT)
  were compared; only
  PowerShell 7 support is taken from the latter.

## Decisions

- Replan review round 1 (fresh Oracle subtask_thoth-oracle_1790897170817_f7329559):
  REJECT on two POSIX contracts — crash cleanup was Windows-only although the user chose
  any Pi exit, and a reaped leader's PGID could be reused and signalled. Repaired in AC-7
  (anchor group leader pinning the PGID through cleanup, authority retired before the
  anchor exits, no reconstruction from persisted PID/PGID; POSIX guardian killing groups
  when Pi's pipe closes) and the delta. Cautions adopted: one persistent PowerShell 7
  helper compiled once (not per poll), UTF-8 IPC, CreateProcessW Unicode
  args/env/cwd, append-mode share-compatible log handles, no inherited job/parent handles,
  no breakaway, fail closed on assignment restrictions, await ActiveProcesses == 0, parent
  wait independent of blocked IPC; replace runtime.ts PID-based `processTreeFor`
  reconstruction and foreign-owner reassignment with opaque container ownership; child
  teardown must not terminate the shared helper; assert pwsh Core 7+ on windows-latest;
  README (Git Bash, census, crash disclaimer) amended; rerun real-SDK child tests.
- Replan (root, 2026-10-01): plan review and implementation authorization reset because
  scope changed (AC-3 rewritten, AC-6 rewritten, AC-7 containment and AC-8 PowerShell 7
  added; Job Object containment moved from non-goal into scope). Earlier implementation
  commits for AC-1, AC-2, AC-4 and AC-5 stay; the census-based termination in
  `src/process-termination.ts` and its callers is replaced. Ownership-design judgment
  (fresh Oracle subtask_thoth-oracle_1790895611444_135db4f4): current census can kill an
  unrelated process (captured parent absent from the census authorizes its PID's new
  children) and miss owned ones; recommends Job Objects created suspended and assigned
  before resume, a helper outside the job, zero-active-process verification.
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

- Amended AC-3 implementation (`08bf1ba`): a worker on the previous model timed
  out mid-way; a fresh worker (operator-switched model) completed it from the preserved
  partial diff. Natural exits, lost-leader recovery and all watch settlements verify the
  remaining tree before terminalizing or polling again; finalize and poll release require
  verified cleanup; empty-tree settlement is one census. Package typecheck 0; suites 216
  passed / 4 skipped (one full-suite run showed a single failure of the reload
  single-delivery test with "cleanup failed: a process tree is still running" under load;
  8/8 isolated reruns and the next full run passed); pi-subagents 525 passed / 1 skipped.
  Windows test config bounds workers to 2 with a 15 s timeout for real CIM helpers.

## Durable deltas

- `ADDED multi-harness-agent-pack` **Own session-scoped Pi background shell jobs** — The vendored `@thoth-agents/pi-background-tasks` package MUST run local shell jobs owned by their session inside operating-system process containers (Windows Job Objects assigned before the job runs, POSIX process groups), MUST keep a session's running jobs across that session's same-process reload, MUST stop every running job of the session, including in-flight watch commands, on any other session shutdown, subagent teardown or Pi process exit (including a crash), MUST terminate and verify a job's container when its leader or watch command exits on its own before recording it terminal, MUST NOT signal processes outside a job's container, and MUST run Windows command jobs in PowerShell 7.
  - GIVEN running background jobs in two Pi sessions and in a subagent, including a job whose leader exits leaving a grandchild; WHEN one root reloads, the subagent ends, the job leader exits, or the root quits or its process dies; THEN reloaded root jobs survive and deliver once, the subagent's and the exited leader's remaining processes stop, nothing of the quitting session survives, and the other session's jobs are untouched.

## Plan

1. Worker A (sole writer of `pi-packages/pi-background-tasks/**` and root
   `pnpm-lock.yaml`): AC-7 containment (Windows helper + Job Objects, POSIX groups),
   then AC-8 PowerShell 7, then AC-3 rewired onto containment, test-first; checkpoints
   returned within about 10 minutes each.
2. Root: CI/docs touch-ups if AC-7/AC-8 change requirements (pwsh on windows-latest).
3. Root: frozen checks, commits, merge, operator settings switch with backup, restart,
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
- [ ] AC-3: lifecycle on containment
  - Outcome: reload keeps and re-attaches jobs; other shutdowns and natural exits terminate containers verifiably
  - Known entrypoints and skill paths: `src/index.ts:25-29`, `src/runtime.ts:28-44,130-146,570-614,728-800,830-858,1061-1150`, `src/process.ts:178-259,352-392`, `src/navigator-provider.ts:21-43`, `src/shared-navigator.ts:111,209-238`, tdd skill
  - Inputs: AC-2
  - Dependencies: AC-7, AC-8
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
- [ ] AC-7: OS containment
  - Outcome: every job and watch command runs in its own OS container; termination and verification act only on the container
  - Known entrypoints and skill paths: `src/process.ts`, `src/process-termination.ts`, `src/runtime.ts`, `src/process-identity.ts`, tdd skill `C:\Users\EremesNG\.pi\agent\skills\tdd\SKILL.md`
  - Inputs: Exploration, Clarifications, Decisions (ownership-design judgment)
  - Dependencies: none
  - Output: helper + code + tests
  - Owner: worker A
  - Writes: `pi-packages/pi-background-tasks/**`
  - Interface boundaries: tool schemas unchanged; no native addon or downloaded binary
  - Focused check and PASS evidence: AC-7 tests on Windows; POSIX tests in CI
  - Return milestone: containment tests green
  - Stop / reassessment: host job restrictions prevent assignment on this machine
- [ ] AC-8: PowerShell 7 on Windows
  - Outcome: Windows command jobs and watches run in pwsh 7; Git Bash trampoline removed
  - Known entrypoints and skill paths: `src/process.ts` launcher, `src/tools.ts` descriptions, reference `oversk7/pi-pwsh-notify` `src/runtime.ts` (MIT), tdd skill
  - Inputs: Clarifications
  - Dependencies: AC-7
  - Output: code + tests + README
  - Owner: worker A
  - Writes: `pi-packages/pi-background-tasks/**`
  - Interface boundaries: argv jobs unchanged; POSIX shell unchanged
  - Focused check and PASS evidence: discovery, quoting, exit codes, capture and UTF-8 tests on Windows
  - Return milestone: green
  - Stop / reassessment: pwsh unavailable on windows-latest CI

## Authorization

**Plan review**: PENDING
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: PENDING

Before the 2026-10-01 replan: the user explicitly selected Review plan with Oracle. Round 1 returned [REJECT] (shared
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
- AC-7: PENDING | check | evidence
- AC-8: PENDING | check | evidence
- Source: .thoth/specs/multi-harness-agent-pack/spec.md | sha256:038f88e274ae0db74c316f4ccf5341e693c7e06cc80719c4bcdf5222732c4614

## Closeout

**Archive**: PENDING
