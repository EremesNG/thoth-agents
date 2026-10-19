# Change: antigravity-windows-job-containment

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: medium
**Risk**: medium

## Exploration

- `pi-packages/pi-antigravity-bridge` terminates every owned process through `src/process-termination.ts:11-71`: on Windows a live leader gets `taskkill /PID <pid> /T /F` (`:45`), with a leader `kill` fallback when the helper cannot spawn; on POSIX a negative-PID SIGTERM followed by group SIGKILL after 750 ms. Already-exited leaders return immediately, so descendants that outlive a normally exiting leader are never cleaned up. Deadline defaults to 3000 ms and resolves with a `termination-warning` instead of rejecting.
- `taskkill /T` walks the tree by recorded parent PID; a process whose stale parent PID equals a tree member's (reused) PID is included. The project rule (memory `windows/process-tree-termination`) is to never select processes by PID tree, parent PID or creation time; only Job Objects or owned handles.
- Callers of the termination helper: `src/driver.ts:787` (persistent stream-json agy, spawn `:411-475`, JSON stdin `:289`, abort `:333-346`, stall `:701`, recycle/shutdown `:753-788`), `src/ask-tool.ts:844` (per-delegation agy, ignored stdin, settles on `exit` and `close` `:863-889`), `src/web-tools.ts:155` (per-web delegate, Buffer stdout/stderr, 120 s timeout), `src/acp/connection.ts:532` (persistent ACP binary, JSON-RPC stdin `:499-510`, `#finish` `:565-580`), `src/models.ts:147` (`agy models` listing, 8 s watchdog), `src/agy-version.ts:91` (`--version`, 5 s watchdog), `src/tasks.ts:131` (`lsof`, POSIX-only use). All spawn with `shell: false`, `windowsHide: true`, `detached: process.platform !== "win32"`. Session teardown (`extensions/index.ts:1059-1085`) recycles both drivers. The artifact opener (`extensions/index.ts:1582,1612`) is intentionally detached and unowned; `acp/setup.ts` `unzip` and `diff-render.ts` synchronous `git` have no termination path.
- Windows console constraint: README `:199-205` records that spawning agy with `detached: true` produced visible console windows for its MCP descendants, so Windows spawns stay attached with `windowsHide`.
- `@thoth-agents/pi-core` ships the Windows job launcher (`src/windows-job/`): `launchInJob({file,args,cwd,env}) -> { pid, stdin, stdout, stderr, exited: Promise<{code}>, terminate(timeoutMs), release() }`, named-pipe stdio sockets, `JobLauncherUnavailable` for helper/compile/assignment failures, ambiguous-launch reconciliation, and helper-generation recovery (commit 0037771). `CreateProcessW` uses `CREATE_NO_WINDOW | EXTENDED_STARTUPINFO_PRESENT | CREATE_UNICODE_ENVIRONMENT` with `STARTF_USESTDHANDLES` (`launcher.cs:118-123`). `release` rejects non-empty jobs. The helper singleton is one process-wide `Symbol.for('thoth-agents.pi-core.windows-job.v1')` (`client.ts:352-353`) whose assets resolve beside the bundle that created it (`client.ts:91-95`), so separately bundled consumers (pi-askcodex today, the bridge after this change) would share one helper, its protocol version and its failure domain.
- Executable resolution: bridge callers pass a bare `agy` by default (`src/driver.ts:411`, `src/ask-tool.ts:760-804`, `src/web-tools.ts:142-150`); Node's spawn resolves it through libuv's Windows search, but `launchInJob` forwards `file` unchanged as the non-null `lpApplicationName` of `CreateProcessW` (`pi-core/src/windows-job/client.ts:285-291`, `launcher.cs:123-128`), which neither searches PATH nor appends an extension (Microsoft Learn, CreateProcessW parameters). A missing target is a target error, not `JobLauncherUnavailable`, so the fallback would not apply. pi-background-tasks resolves executables itself before launching (`src/windows-job-client.ts` `executablePath`).
- Lifecycle facts for adaptation: `launchInJob` is asynchronous; its streams and the leader `exited` promise are independent, so leader exit can be reported before stdout/stderr are fully consumed (`client.ts:267-308`, `launcher.cs:130-175`). Helper readiness allows 30 s and protocol requests 20 s; bridge defaults include 120 s startup waits, a 30 s ACP initialize timeout and 3 s termination, and configured shorter bounds can expire while a launch is pending.
- Test seams: bridge Windows fixtures are `.mjs` programs redirected to `process.execPath` by a mocked `child_process.spawn` (`tests/helpers/portable-spawn.ts`, `tests/helpers/node-fixture.ts`, `tests/helpers/process-tree.ts`); native job launches bypass that redirection. In source (test) runs every importer resolves the same pi-core assets, while bundled consumers resolve assets copied beside their own `dist` (`client.ts:91-95`).
- AskCodex reference integration: `pi-packages/pi-askcodex/src/app-server-client.ts:105-134` (launch, terminate then release, fallback only on `JobLauncherUnavailable` with a warning), `:222-248` (leader-only fallback kill), `:342-380` (bounded shutdown).
- The bridge already lists pi-core as a devDependency and bundles it inline (`package.json:72`, `scripts/build-pi-extensions.mjs:16,48-65`); launcher assets are copied only for pi-askcodex (`build-pi-extensions.mjs:17-22`, asserted in `scripts/pi-extension-bundles.test.mjs:29-33,76-78`).
- Tests: `tests/process-termination.test.ts` (Windows real parent/grandchild teardown; warning/listener cleanup), `tests/owned-process-termination.test.ts` (real-tree abort/timeout/cap for delegation, listing, version and web), `tests/helpers/process-tree.ts:24,47` (fixture; cleanup uses `taskkill`), `tests/driver-lifecycle.test.ts:96-117` (cleanup uses `taskkill` at `:102`), `tests/windows-spawn-options.test.ts`, `tests/extension-lifecycle.test.ts`. CI Windows runs bridge typecheck and tests with `--retry=2` (`.github/workflows/ci.yml:198-202`). pi-subagents `test/runner/real-sdk-process-cancel.test.ts` and `test/runner/real-process-cancel.test.ts` already end recorded PIDs individually; the only remaining `taskkill` mention (`real-sdk-process-cancel.test.ts:165`) is a comment about upstream Pi behavior (verified during plan review).

## Intent

On Windows, the Antigravity bridge runs every agy process that executes agents (the persistent stream-json driver, AskAntigravity delegations, web-tool delegates and the ACP connection) inside its own kill-on-close Job Object through the pi-core launcher, and ends those processes and all their descendants only through that job, both when Pi stops them and when the leader exits on its own. Short metadata probes keep a plain spawn and end only their own leader. No runtime path or test cleanup in the bridge or pi-subagents selects processes by PID tree any more, separately bundled launcher consumers never share a helper, and POSIX behavior is unchanged.

## Non-goals

- Migrating pi-background-tasks' own helper.
- The intentionally detached artifact opener, `acp/setup.ts` `unzip`, `diff-render.ts` synchronous `git`, POSIX-only `lsof` and the manual `scripts/*.mjs` probes.
- Containing processes created through brokers, COM or WMI (they do not inherit job membership).
- Changing agy behavior, bridge stream/timeout semantics beyond what containment requires, or AskCodex behavior other than helper isolation.
- Version bumps or releases.

## Acceptance

- AC-1: Each separately bundled consumer of the pi-core Windows job launcher uses its own helper; a helper death, recovery or ambiguous-launch reconciliation in one consumer never terminates or serves another consumer's jobs, while calls from the same bundle keep sharing one helper.
- AC-2: On Windows the driver, AskAntigravity, web-tool and ACP agy processes launch inside their own job, resolving the executable exactly as Node's spawn does (missing target reported as `ENOENT`), with stdio semantics preserved (UTF-8 and Buffer decoding, JSON stdin writes, ignored stdin, stderr handling) and with the leader exit, stream close and spawn-error notifications their callers rely on.
- AC-3: When such a process is aborted, times out, stalls, is recycled or shut down, or its leader exits on its own, its job is terminated: the leader and every descendant end, including persistent descendants that outlive the leader, while a process outside the job, including one whose stale parent PID equals the agy PID, keeps running; existing deadlines and `termination-warning` behavior are preserved.
- AC-4: When the job launcher is unavailable, those processes start with the current plain spawn, termination ends only the owned leader through its own process handle, and a warning is emitted; no PID-tree fallback exists.
- AC-5: `agy --version` and `agy models` keep their plain spawn and budgets; on Windows a timeout or output cap ends only the owned leader through its own handle, without `taskkill`.
- AC-6: Descendant console processes of an agy process launched inside a job show no visible console window, matching the current `windowsHide` attached spawn.
- AC-7: No `taskkill … /T`, `Win32_Process` or parent-PID selection remains in bridge runtime code, bridge test helpers, or the pi-subagents test cleanups; test cleanups end only recorded fixture PIDs individually.
- AC-8: The launcher assets ship beside `pi-packages/pi-antigravity-bridge/dist/index.ts` and the bundle tests assert them; README and CHANGELOGs describe the containment, the fallback, the normal-exit policy and its known limitations.
- AC-9: POSIX behavior is unchanged: process groups, SIGTERM then group SIGKILL after 750 ms, and existing tests pass.

## Clarifications

- Normal-exit policy (user, 2026-10-18): option A, same as AskCodex — when an owned agy process ends for any reason its job is terminated, so no descendant outlives it. Accepted risk: anything agy starts that should outlive it (for example a browser that was not already running) ends with it.
- Containment scope (user, 2026-10-18): option A — only agent-executing processes (driver, AskAntigravity, web tools, ACP) use the job; `--version` and `models` keep a plain spawn with leader-only termination so the helper cold start never delays model discovery at Pi startup.
- Test cleanup (user, 2026-10-18): include the remaining `taskkill /T` test cleanups in the bridge and pi-subagents; end only recorded PIDs individually.

## Decisions

- Reuse the pi-core launcher (no new native code); the bridge adds a small owned-process facade that adapts `LaunchedJob` to the subset of `ChildProcess` behavior its callers use, so call sites change minimally.
- Launcher helper isolation: replace the single process-wide helper with a registry keyed by the resolved launcher asset location, so each bundle gets its own helper and failure domain. Same-bundle callers share one helper; the global key is versioned.
- Normal exit: when the leader's `exited` settles, the facade terminates and releases the job once (memoized and shared with explicit termination), so surviving descendants end and their inherited pipes close; `close` is emitted after leader exit and stream end.
- Fallback mirrors AskCodex: only `JobLauncherUnavailable` falls back to plain spawn with a warning and leader-only owned-handle termination; target spawn errors (for example a missing binary) surface as the same `error` the callers handle today.
- Windows termination for non-job processes (probes and fallback) becomes owned-handle `kill` only; `process-termination.ts` no longer spawns `taskkill`.
- Executable resolution: on Windows the facade resolves the target before `launchInJob` with a faithful port of libuv's `search_path`, `path_search_walk_ext` and `search_path_join_test` (libuv v1.52.x `src/win/process.c`, as bundled by Node 24; v1.51 is identical for these functions; Node does not set `FILE_PATH_EXACT_NAME`), citing the upstream source in a code comment. The contract is equivalence with what `child_process.spawn` would execute for the same file, cwd and environment. Known subtleties the port must keep (non-exhaustive; the upstream source governs): directory-component detection; extension probing applies to path-containing names too; a file name with a nonempty extension tries the exact name, then `.com`, then `.exe`, while an extensionless name (including one ending in a dot) tries only `.com` then `.exe`, and a trailing dot is not doubled when appending; the current directory is searched for a bare name only when `NeedCurrentDirectoryForExePathW("")` would return true, that is, when `NoDefaultCurrentDirectoryInExePath` is not defined in the Pi process environment; PATH comes from the child environment when one is given, with quoted and relative entries handled as upstream; a candidate must exist and not be a directory. Not found produces the same `error` event (code `ENOENT`) callers handle today; a resolved non-executable target surfaces as the launcher's target error. Probes and the fallback keep Node's own resolution.
- Drain-aware settlement: leader exit is reported through `exit`; `close` fires only after the leader exited, stdout and stderr ended and the post-exit job termination settled, so output written before or around leader exit is never discarded. Callers that settle on `exit` but consume output keep working because the facade preserves Node's ordering (`exit` may precede final data; `close` follows all data).
- Pending launch: termination requested while `launchInJob` is pending is remembered; a cancelled launch never falls back to plain spawn; a launch that resolves after cancellation or after the caller's deadline still has its job terminated and released (ownership is never abandoned), while its notifications are fenced (no late events after the termination deadline resolved).
- Caller-level drain: the driver, AskAntigravity and ACP currently finalize or remove data listeners on `exit`; the migration makes their output-dependent settlement drain-aware (settle on `close`, or after stream end following `exit`) and adds caller-level tests that final output written just before leader exit is delivered.
- Drain scope (final verification round 1): drain-aware `close` settlement applies only to job-backed processes, where the post-exit job termination guarantees that descendant-held pipes close. POSIX processes and the Windows launcher-unavailable fallback keep the base exit-based settlement, so a descendant holding an inherited pipe can never delay terminal settlement after the leader exits.
- Startup bounds cover pending launch (final verification round 1): every existing startup bound (stream driver `startupTimeoutMs`, ACP initialize timeout, AskAntigravity and web-tool watchdogs) also covers the asynchronous job launch; on expiry the pending launch is terminated through the facade (late job still terminated and released, notifications fenced) and the caller reports its existing timeout error. Termination deadlines and `termination-warning` semantics stay those of the existing helper. Helper launch time counts against existing startup bounds; the 30 s readiness cap is not treated as total launch time; no pre-warming.
- No launcher flag change. External evidence (libuv 1.51/1.52 `src/win/process.c:1019-1075`, Node `process_wrap.cc`, Microsoft Learn process creation flags and console creation): Node's piped `windowsHide`, non-detached spawn uses `CREATE_NO_WINDOW` plus `STARTF_USESHOWWINDOW`/`SW_HIDE`; the launcher uses `CREATE_NO_WINDOW` without `SW_HIDE`. For a console-subsystem agy and descendants inheriting its windowless console the mechanism is the same; `SW_HIDE` only affects a GUI process's initial show state. Job membership does not affect console allocation. Console parity is still verified empirically on Windows with a real descendant console process.
- A cold default browser started by agy through ShellExecute may be created directly inside the job (and end with it) or delegated outside it; this is covered by the accepted normal-exit policy and documented as a limitation.

## Durable deltas

- `ADDED pi-ecosystem` **Antigravity bridge Windows job containment** — On Windows `@thoth-agents/pi-antigravity-bridge` MUST launch every agy process that executes agents (stream-json driver, AskAntigravity delegations, web-tool delegates and the ACP connection) inside its own kill-on-close Job Object and MUST end it and its descendants only through that job, both when the bridge stops it and when its leader exits on its own; short metadata probes and the launcher-unavailable fallback MUST end only their own leader through its process handle (the fallback also warns), and the bridge MUST never terminate a process selected by PID tree, parent PID or creation time.
  - GIVEN a Windows Pi session where an AskAntigravity delegation runs agy that started a persistent descendant, and an unrelated process exists whose stale parent PID equals the agy PID; WHEN the delegation times out or agy exits on its own; THEN agy and its descendant end through the job and the unrelated process keeps running .
- `ADDED pi-ecosystem` **Windows job launcher consumer isolation** — `@thoth-agents/pi-core`'s Windows job launcher MUST give each separately bundled consumer its own helper, so a helper failure, recovery or ambiguous-launch reconciliation in one consumer never terminates or serves another consumer's jobs.
  - GIVEN AskCodex and the Antigravity bridge each running a job in the same Pi process; WHEN one consumer's helper dies or reconciles an ambiguous launch; THEN only that consumer's jobs are affected and the other consumer's job keeps running .

## Plan

Approach: three independent writer surfaces, then one dependent bridge migration.

1. **pi-core helper isolation** (`pi-packages/pi-core/src/windows-job/client.ts`, tests, `CHANGELOG.md`). Replace the single `Symbol.for('thoth-agents.pi-core.windows-job.v1')` client with a versioned global registry keyed by the resolved launcher asset path; `launchInJob` uses the client for its own bundle. Keep the public API, `JobLauncherUnavailable`, generation recovery and reconciliation unchanged. Tests: two actual distinct asset locations (for example temporary copies of `launcher.cs`/`launcher.ps1` standing in for two bundles) yield distinct helpers; the same location shares one helper; one consumer's helper death leaves another consumer's job running (Windows integration).
2. **Bridge owned-process facade and termination** (`pi-packages/pi-antigravity-bridge/src/process-termination.ts`, a new facade module beside it, tests). Facade: synchronous return of a process object with `pid`, `stdin` (or null for ignored stdin), `stdout`/`stderr` readables, `exitCode`/`signalCode`, and `spawn`/`error`/`exit`/`close` events; Windows uses `launchInJob` with the job terminated and released once after leader exit or on explicit termination; `JobLauncherUnavailable` falls back to plain spawn with a warning; POSIX is the current spawn. Includes Windows executable resolution, drain-aware `close`, and pending-launch termination as decided above. Termination: job terminate for job-backed processes, owned-handle `kill` for Windows non-job processes, unchanged POSIX group kill; deadlines and warnings preserved. Tests first (fixtures launch `process.execPath` with script arguments, so they exercise real jobs without the spawn mock): real-job parent/grandchild/persistent descendant termination on abort, on normal leader exit and on deadline; stale-parent foreign process survives; resolver differential tests comparing the facade's resolution with what `child_process.spawn` executes (fixture executables that report their own path) for: a bare name present on PATH only as `<name>.exe`; an extensionless path to an existing `.exe` (for example `process.execPath` without `.exe`); exact-file precedence for a name with an extension; `.com` before `.exe`; an extensionless file that must be ignored; a name ending in a dot (`agy.` and `.\agy.` select `agy.exe`); cwd and PATH both containing `<name>.exe`, with and without `NoDefaultCurrentDirectoryInExePath` defined; a relative path; a quoted PATH entry; and a missing target emitting `error` with `ENOENT`; output written immediately before leader exit is fully delivered before `close`; abort, shutdown and helper death while launch is pending, and delayed fallback, respect deadlines and leave no job running; fallback warning and leader-only kill; console parity (a console descendant of an in-job stand-in has no visible console window); POSIX tests unchanged.
3. **Bridge call-site migration** (`src/driver.ts`, `src/ask-tool.ts`, `src/web-tools.ts`, `src/acp/connection.ts` use the facade; `src/models.ts`, `src/agy-version.ts` keep plain spawn with the leader-only Windows termination; `tests/helpers/process-tree.ts`, `tests/driver-lifecycle.test.ts` cleanups end recorded PIDs individually; `tests/helpers/portable-spawn.ts` and `tests/helpers/node-fixture.ts` adapted so caller tests' `.mjs` fixtures run through the facade with real jobs (redirection at the facade boundary instead of only the `child_process.spawn` mock); caller tests; README Windows containment section incl. normal-exit policy, fallback and broker/WMI limitation; `CHANGELOG.md` `[Unreleased]`). Driver, AskAntigravity and ACP settlement becomes drain-aware with caller-level final-output tests. Existing `owned-process-termination`, `driver-lifecycle`, `windows-spawn-options` and `extension-lifecycle` tests keep passing, updated only where they asserted `taskkill` or spawn options that the facade replaces.
4. **pi-subagents test cleanup** (`pi-packages/pi-subagents/test/runner/real-sdk-process-cancel.test.ts`, `real-process-cancel.test.ts`): already satisfied; verification only (no edits).
5. **Packaging** (`scripts/build-pi-extensions.mjs` launcher asset entries for the bridge, `scripts/pi-extension-bundles.test.mjs` assertions).

Dependencies: unit 3 depends on unit 2's accepted facade. Units 1, 2, 4 and 5 touch disjoint files and may run in parallel; unit 2 consumes the unchanged public `launchInJob` API, so it does not wait for unit 1.

Risks: an agy-started process meant to outlive agy ends with the job (accepted policy); first agent run per Pi process on Windows includes the helper cold start (bounded by the existing startup bound and the 30 s helper readiness cap); one extra PowerShell helper per consumer; broker/WMI-created processes escape the job; hosted Windows CI reliability.

Verification seams (Windows host, locally): `pnpm --filter @thoth-agents/pi-core run typecheck|test`, `pnpm --filter @thoth-agents/pi-antigravity-bridge run typecheck|test`, `pnpm --filter @thoth-agents/pi-askcodex run test`, focused pi-subagents test files, `pnpm run build:pi-extensions && pnpm run test:pi-extensions`, `pnpm run check:ci`, `pnpm run typecheck`, and a repository search showing no `taskkill`/`/T` tree kills outside the stated exclusions. Hosted CI on the exact pushed SHA remains the post-closeout release gate.

## Tasks

- [x] AC-1: pi-core launcher gives each bundled consumer its own helper
  - Outcome: per-consumer helper registry with unchanged public API
  - Known entrypoints and skill paths: `pi-packages/pi-core/src/windows-job/client.ts:91-95,352-353`, `pi-packages/pi-core/src/windows-job/client-recovery.test.ts`, existing windows-job tests; skills `tdd`, `simplify`
  - Inputs: accepted exploration and decisions in this record; commit 0037771 generation recovery
  - Dependencies: none
  - Output: registry keyed by resolved launcher asset path, tests, CHANGELOG entry
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-core/src/windows-job/client.ts`, `pi-packages/pi-core/src/windows-job/*.test.ts`, `pi-packages/pi-core/CHANGELOG.md`
  - Interface boundaries: `launchInJob`, `LaunchedJob`, `JobLauncherUnavailable` unchanged; pi-askcodex consumer
  - Focused check and PASS evidence: pi-core typecheck and tests pass on Windows including a two-consumer isolation test using two distinct real asset locations; pi-askcodex tests pass
  - Return milestone: tests green with isolation evidence
  - Stop / reassessment: the asset path cannot identify a consumer reliably, or the public API must change
- [x] AC-2: bridge owned-process facade launches agent processes inside a job on Windows
  - Outcome: facade module with ChildProcess-compatible surface for job-backed, fallback and POSIX processes
  - Known entrypoints and skill paths: `pi-packages/pi-antigravity-bridge/src/process-termination.ts`, `pi-packages/pi-askcodex/src/app-server-client.ts:105-134,222-248,342-380` (reference), `pi-packages/pi-core/src/windows-job/index.ts`; skills `tdd`, `simplify`
  - Inputs: accepted exploration, decisions and clarifications in this record
  - Dependencies: none
  - Output: facade module with libuv-equivalent Windows executable resolution, drain-aware `close` and pending-launch termination, rewritten termination helper without `taskkill`, unit and Windows integration tests (resolver differential matrix against `spawn`, output before leader exit, pending-launch abort/shutdown/helper death without fallback after cancellation)
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-antigravity-bridge/src/process-termination.ts`, new facade module in `pi-packages/pi-antigravity-bridge/src/`, `pi-packages/pi-antigravity-bridge/tests/process-termination.test.ts`, new facade tests in `pi-packages/pi-antigravity-bridge/tests/`
  - Interface boundaries: existing `terminate…` helper signature used by seven callers; `launchInJob` public API
  - Focused check and PASS evidence: bridge typecheck; new facade tests and `tests/process-termination.test.ts` pass on Windows
  - Return milestone: facade and termination tests green
  - Stop / reassessment: a caller-required ChildProcess behavior cannot be provided by the launcher, or the launcher needs native changes
- [x] AC-3: facade terminates the whole job on abort, deadline and normal leader exit while sparing outsiders
  - Outcome: real-job evidence for termination semantics and the stale-parent outsider
  - Known entrypoints and skill paths: facade from the AC-2 row; `pi-packages/pi-antigravity-bridge/tests/helpers/process-tree.ts`; skill `tdd`
  - Inputs: AC-2 facade design
  - Dependencies: none (same unit and writer as the AC-2 row)
  - Output: Windows integration tests for persistent descendants after abort, deadline and normal exit, and the outsider survival case
  - Owner: thoth-worker (same assignment as the AC-2 row)
  - Writes: facade tests from the AC-2 row
  - Interface boundaries: none beyond the AC-2 row
  - Focused check and PASS evidence: tests show descendants gone and outsider alive
  - Return milestone: with the AC-2 row
  - Stop / reassessment: as the AC-2 row
- [x] AC-4: launcher-unavailable fallback ends only the owned leader and warns
  - Outcome: fallback path with warning and leader-only kill, tested
  - Known entrypoints and skill paths: facade from the AC-2 row
  - Inputs: AC-2 facade design
  - Dependencies: none (same unit and writer as the AC-2 row)
  - Output: fallback tests
  - Owner: thoth-worker (same assignment as the AC-2 row)
  - Writes: facade tests from the AC-2 row
  - Interface boundaries: `JobLauncherUnavailable`
  - Focused check and PASS evidence: fallback tests pass
  - Return milestone: with the AC-2 row
  - Stop / reassessment: as the AC-2 row
- [x] AC-6: console descendants of an in-job agy stand-in show no visible console window
  - Outcome: Windows integration test proving console parity with the current attached `windowsHide` spawn
  - Known entrypoints and skill paths: `pi-packages/pi-core/src/windows-job/launcher.cs:118-123`; facade from the AC-2 row
  - Inputs: AC-2 facade design; external evidence on `CREATE_NO_WINDOW` versus Node `windowsHide`
  - Dependencies: none (same unit and writer as the AC-2 row)
  - Output: console visibility test
  - Owner: thoth-worker (same assignment as the AC-2 row)
  - Writes: facade tests from the AC-2 row
  - Interface boundaries: none
  - Focused check and PASS evidence: descendant console window absent or not visible
  - Return milestone: with the AC-2 row
  - Stop / reassessment: a visible window appears, requiring a launcher flag change (return to root before editing pi-core)
- [x] AC-2: driver, AskAntigravity, web-tool and ACP sites use the facade
  - Outcome: four call sites migrated with caller semantics preserved
  - Known entrypoints and skill paths: `src/driver.ts:289,333-346,411-475,701,753-788`, `src/ask-tool.ts:804-889`, `src/web-tools.ts:150-208`, `src/acp/connection.ts:183-234,499-533,565-580` under `pi-packages/pi-antigravity-bridge/`; skills `tdd`, `simplify`
  - Inputs: accepted AC-2 facade unit output
  - Dependencies: facade unit (AC-2/AC-3/AC-4/AC-6 rows) accepted
  - Output: migrated call sites with drain-aware output settlement, caller-level final-output tests and updated caller tests
  - Owner: thoth-worker
  - Writes: those four source files, `pi-packages/pi-antigravity-bridge/tests/owned-process-termination.test.ts`, `tests/driver-lifecycle.test.ts`, `tests/windows-spawn-options.test.ts`, `tests/extension-lifecycle.test.ts`, `tests/helpers/process-tree.ts`, `tests/helpers/portable-spawn.ts`, `tests/helpers/node-fixture.ts`, other bridge tests only where they assert replaced spawn options or `taskkill`
  - Interface boundaries: bridge stream terminal guarantee and timeout semantics; session teardown in `extensions/index.ts:1059-1085`
  - Focused check and PASS evidence: full bridge test suite and typecheck pass on Windows
  - Return milestone: bridge suite green
  - Stop / reassessment: a caller needs behavior outside the facade contract, or stream/timeout semantics would change
- [x] AC-5: version and model probes keep plain spawn with leader-only Windows termination
  - Outcome: probes unchanged except termination, verified
  - Known entrypoints and skill paths: `pi-packages/pi-antigravity-bridge/src/models.ts:124-175`, `src/agy-version.ts:80-113`
  - Inputs: accepted facade unit output (termination helper)
  - Dependencies: facade unit accepted
  - Output: probe termination tests updated
  - Owner: thoth-worker (same assignment as the call-site row)
  - Writes: within the call-site row's writes
  - Interface boundaries: model discovery budgets (8 s watchdog, 3 s termination) and version 5 s watchdog
  - Focused check and PASS evidence: listing and version timeout/cap tests pass
  - Return milestone: with the call-site row
  - Stop / reassessment: as the call-site row
- [x] AC-7: bridge test helpers end recorded PIDs individually
  - Outcome: no `taskkill /T` in bridge tests
  - Known entrypoints and skill paths: `pi-packages/pi-antigravity-bridge/tests/helpers/process-tree.ts:47`, `tests/driver-lifecycle.test.ts:102`
  - Inputs: user clarification on test cleanup
  - Dependencies: facade unit accepted (same writer as the call-site row)
  - Output: updated cleanups
  - Owner: thoth-worker (same assignment as the call-site row)
  - Writes: within the call-site row's writes
  - Interface boundaries: none
  - Focused check and PASS evidence: repository search shows no `/T` in bridge tests; suite passes
  - Return milestone: with the call-site row
  - Stop / reassessment: a cleanup cannot know the fixture PIDs
- [x] AC-8: bridge README and CHANGELOG document containment
  - Outcome: docs for containment, fallback, normal-exit policy and limitations
  - Known entrypoints and skill paths: `pi-packages/pi-antigravity-bridge/README.md:199-205`, `pi-packages/pi-antigravity-bridge/CHANGELOG.md`
  - Inputs: accepted decisions and clarifications
  - Dependencies: facade unit accepted (same writer as the call-site row)
  - Output: README section and `[Unreleased]` entry
  - Owner: thoth-worker (same assignment as the call-site row)
  - Writes: those two files
  - Interface boundaries: none
  - Focused check and PASS evidence: `pnpm run check:ci` passes; text matches behavior
  - Return milestone: with the call-site row
  - Stop / reassessment: none
- [x] AC-7: pi-subagents test cleanups end recorded PIDs individually (already satisfied; verify)
  - Outcome: confirmed absence of `taskkill /T` in pi-subagents tests
  - Known entrypoints and skill paths: `pi-packages/pi-subagents/test/runner/real-sdk-process-cancel.test.ts`, `pi-packages/pi-subagents/test/runner/real-process-cancel.test.ts`
  - Inputs: user clarification on test cleanup; plan-review finding that cleanup is already PID-individual
  - Dependencies: none
  - Output: search evidence
  - Owner: root
  - Writes: none
  - Interface boundaries: none
  - Focused check and PASS evidence: repository search shows no `taskkill` invocation with `/T` in pi-subagents tests
  - Return milestone: before final verification
  - Stop / reassessment: a `/T` cleanup is found (then assign an edit)
- [x] AC-8: launcher assets ship beside the bridge bundle
  - Outcome: build copies `launcher.cs`/`launcher.ps1` into `pi-packages/pi-antigravity-bridge/dist` and the bundle test asserts them
  - Known entrypoints and skill paths: `scripts/build-pi-extensions.mjs:16-22,63-65`, `scripts/pi-extension-bundles.test.mjs:29-33,76-78`
  - Inputs: accepted exploration
  - Dependencies: none
  - Output: asset entries and assertions
  - Owner: thoth-worker
  - Writes: `scripts/build-pi-extensions.mjs`, `scripts/pi-extension-bundles.test.mjs`
  - Interface boundaries: pi-core asset resolution beside the running bundle
  - Focused check and PASS evidence: `pnpm run build:pi-extensions && pnpm run test:pi-extensions` pass with the assets present
  - Return milestone: bundle tests green
  - Stop / reassessment: the bridge bundle layout prevents asset resolution
- [x] AC-9: POSIX behavior unchanged
  - Outcome: POSIX paths and tests unchanged
  - Known entrypoints and skill paths: `pi-packages/pi-antigravity-bridge/src/process-termination.ts` POSIX branch and its tests
  - Inputs: facade and call-site outputs
  - Dependencies: facade and call-site units accepted
  - Output: diff review and test evidence showing the POSIX branch unchanged
  - Owner: thoth-oracle (final verification)
  - Writes: none
  - Interface boundaries: none
  - Focused check and PASS evidence: POSIX branch diff empty or behavior-identical; POSIX tests pass in hosted Linux CI after push
  - Return milestone: final verification
  - Stop / reassessment: POSIX behavior changed
- [x] AC-2: stream driver and other startup bounds cover the pending job launch
  - Outcome: a pending or hung `launchInJob` cannot outlive the caller's existing startup bound; expiry terminates the launch and reports the existing timeout error
  - Known entrypoints and skill paths: `pi-packages/pi-antigravity-bridge/src/driver.ts:248-305,411-440`, `src/owned-process.ts:94-138`, `src/acp/connection.ts`, `src/ask-tool.ts`, `src/web-tools.ts`; skills `tdd`, `simplify`
  - Inputs: final verification round 1 finding (pending launcher with `startupTimeoutMs=25` left the driver running after 150 ms)
  - Dependencies: none
  - Output: startup-deadline coverage of pending launch for every caller, with regressions
  - Owner: thoth-worker
  - Writes: bridge `src/` call sites and `src/owned-process.ts` if needed, bridge tests
  - Interface boundaries: stream terminal guarantee; facade pending-launch fencing
  - Focused check and PASS evidence: pending-launch startup regression per caller passes; bridge suite green on Windows
  - Return milestone: with the AC-9 convergence row
  - Stop / reassessment: a bound cannot observe launch without changing public behavior
- [x] AC-9: POSIX and fallback settlement stay exit-based when descendants hold inherited pipes
  - Outcome: drain-aware `close` settlement only for job-backed processes; POSIX and Windows fallback settle as at base when the leader exits
  - Known entrypoints and skill paths: `pi-packages/pi-antigravity-bridge/src/driver.ts:451`, `src/ask-tool.ts:895`, `src/acp/connection.ts:230`, `src/owned-process.ts`
  - Inputs: final verification round 1 finding (WSL Node 22 differential probe: base driver settled ERROR promptly, current driver unsettled after 500 ms)
  - Dependencies: none (same writer as the startup row)
  - Output: scoped settlement plus inherited-pipe regressions for POSIX and the Windows fallback
  - Owner: thoth-worker (same assignment as the startup row)
  - Writes: same as the startup row
  - Interface boundaries: stream terminal guarantee; Windows drain tests stay green
  - Focused check and PASS evidence: inherited-pipe regressions pass (POSIX via platform-independent test or WSL probe; Windows fallback natively); bridge suite green
  - Return milestone: both convergence rows done
  - Stop / reassessment: job-backed drain and prompt POSIX settlement cannot both hold

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

Plan review: rounds 1-3 REJECT (Windows executable resolution through `launchInJob`; resolver fidelity to libuv), repaired in this record; round 4 fresh Oracle OKAY (validated). After OKAY, the stale pi-subagents cleanup exploration was corrected to verification-only, as the reviewer recommended.

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: bfae285c5fea7fd80fe129fdaef97260a9ec019e3298b26d5e95882c929755fa

Final verification round 1 (fresh Oracle) FAILED with two blockers: the stream driver bypassed `startupTimeoutMs` while the job launch was pending, and unconditional `close` settlement regressed POSIX and the Windows fallback when descendants hold inherited pipes. Both were converged (Decisions "Drain scope" and "Startup bounds cover pending launch", two added task rows) and round 2 (fresh Oracle) PASSED; envelope validated with `--record-sha256`.

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS. Both round-1 regressions are fixed. The full uncommitted change satisfies AC-1 through AC-9, the recorded decisions and durable deltas. No blocking correctness risk found.",
  "evidence": [
    {
      "id": "record",
      "kind": "artifact-review",
      "locator": ".thoth/changes/antigravity-windows-job-containment/antigravity-windows-job-containment.md",
      "claim": "Independently hashed exact bytes preceding Authorization; digest matches the assignment. Verify gate passes, canonical spec digest matches, and tracked/untracked changes remain within declared scope against HEAD 003777187b55ba7c51d2f2fcf79352594ed388d1.",
      "basis": "observed",
      "uncertainty": "Authorization, final-review and archive bookkeeping remain root-owned."
    },
    {
      "id": "core",
      "kind": "execution",
      "locator": "pi-packages/pi-core/src/windows-job/{client.ts,client-isolation.test.ts,client-recovery.test.ts,integration.test.ts}",
      "claim": "Windows isolation, recovery and integration tests pass 11/11. Distinct asset locations use distinct helpers; one helper's failure/recovery leaves the other's job running. Public package exports and job interfaces are unchanged. AskCodex passes 289 tests, with 4 skipped.",
      "basis": "observed",
      "uncertainty": "Ambiguous reconciliation isolation additionally follows from its unchanged instance-local implementation."
    },
    {
      "id": "bridge",
      "kind": "execution",
      "locator": "pi-packages/pi-antigravity-bridge/tests",
      "claim": "Fresh Windows runs pass 212/212 tests across 21 focused files, covering native jobs, normal exit, cancellation, deadlines, fallback, probes, drain, inherited pipes, startup ownership, lifecycle sinks and migrated callers.",
      "basis": "observed",
      "uncertainty": "This is focused independent coverage, not another full-suite run; root reports the final full suite passed 930 tests with 9 skipped."
    },
    {
      "id": "startup",
      "kind": "independent-reproduction",
      "locator": "src/driver.ts:420-433; tests/caller-pending-launch.test.ts; external real-timer probe",
      "claim": "With a pending launcher, startupTimeoutMs=25 and other caps disabled, the driver returns ERROR and becomes dead in 62 ms rather than remaining running at 150 ms. After the termination deadline, the late job is terminated and released exactly once. All four callers' pending-launch regressions pass.",
      "basis": "observed",
      "uncertainty": "The independent real-timer probe targets the stream driver; ACP, AskAntigravity and web bounds also have passing injected-launch tests and source review."
    },
    {
      "id": "posix",
      "kind": "independent-differential",
      "locator": "WSL Node 22.22.1; HEAD/current source bundles outside repository",
      "claim": "With descendants retaining inherited pipes, base/current settlement is driver ERROR 31/33 ms, Ask exit-0 31/26 ms, and ACP ERROR 36/30 ms; descendants remain alive at settlement. Separate process-group probes terminate resistant descendants after 751/752 ms, with leader SIGTERM in both versions.",
      "basis": "observed",
      "uncertainty": "Host presentation imports were stubbed for the inherited-pipe probe; process creation, caller settlement and termination code were real. Full hosted Linux CI remains a release check."
    },
    {
      "id": "containment",
      "kind": "source-and-native-tests",
      "locator": "src/owned-process.ts; src/process-termination.ts; tests/owned-process-integration.test.ts; tests/owned-process-pending.test.ts",
      "claim": "Native tests verify descendant cleanup on normal exit, abort and deadline while outsiders survive; output drains before job-backed close; pending cancellation never falls back; late ownership is cleaned and notifications fenced. Only JobLauncherUnavailable permits warned leader-only fallback. Console descendant visibility is False.",
      "basis": "observed",
      "uncertainty": "The outsider test uses disjoint job membership, not actual stale-PPID reuse. Safety for stale ancestry follows from the absence of any ancestry-based selection."
    },
    {
      "id": "resolver",
      "kind": "source-and-differential-tests",
      "locator": "src/windows-executable.ts; tests/windows-executable.test.ts; libuv v1.52.0 src/win/process.c",
      "claim": "The resolver matches the reviewed upstream search functions and passes the native spawn differential matrix, including extension precedence, trailing dots, cwd suppression, quoted/relative PATH and ENOENT. UTF-8, Buffer output and pre-spawn JSON writes pass.",
      "basis": "observed",
      "uncertainty": "Differential coverage is representative rather than exhaustive."
    },
    {
      "id": "packaging",
      "kind": "execution-and-document-review",
      "locator": "scripts/build-pi-extensions.mjs; scripts/pi-extension-bundles.test.mjs; bridge README/CHANGELOG; core CHANGELOG",
      "claim": "Bundle smoke passes 13/13. Fresh bridge and AskCodex builds using current source and production build options succeed outside the repository with both launcher assets present. Documentation covers normal-exit policy A, fallback, console behavior and broker/browser limitations.",
      "basis": "observed",
      "uncertainty": "Repository distribution files were not rewritten during this read-only review."
    },
    {
      "id": "checks",
      "kind": "execution-and-search",
      "locator": "git diff --check; repository searches; root and touched-package validation",
      "claim": "Root check:ci, root typecheck and bridge/core typechecks pass. No prohibited tree-kill or ancestry selection remains in scoped runtime/test cleanup code; the remaining pi-subagents taskkill mention is commentary about upstream behavior.",
      "basis": "observed",
      "uncertainty": "Biome reports existing non-failing warnings."
    },
    {
      "id": "flakes",
      "kind": "diagnosis",
      "locator": "src/sessions.ts:101-110,129-160; tests/lifecycle-sink.test.ts cleanup; HEAD comparison",
      "claim": "SessionStore queues unawaited asynchronous persistence, while fixture cleanup removes its directory without joining that queue; both behaviors match base. This provides a credible in-process ENOTEMPTY race. ENOENT resolution occurs before launcher invocation, and successful follow-up shutdown awaits native close. Both ENOENT cases pass under cleanup tracing; base-copy lifecycle, driver and sessions tests pass 33/33.",
      "basis": "inferred",
      "uncertainty": "The original full-load failures were not reproduced. Exact ENOTEMPTY attribution and relative flake rates remain unproven; new job-launch overhead can increase timing-test contention."
    },
    {
      "id": "memory",
      "kind": "recall",
      "locator": "project git:3726a62c-51e1-43ba-a466-57d41c5b7048; recalled 1de6e1c5-5352-4f0d-b531-ec94621889dd",
      "claim": "Bounded project recall recovered prior Windows console context. Current artifacts and execution, not memory, determine this verdict. No memory writes or session lifecycle operations occurred.",
      "basis": "observed",
      "uncertainty": "Project-only recall; no session continuity claim."
    }
  ],
  "verification": [
    {
      "check": "AC-1",
      "method": "Registry/API review, native isolation/recovery tests and AskCodex suite",
      "outcome": "pass",
      "evidenceIds": ["core"],
      "reason": "Helper ownership and failure domains are separated by bundled asset location."
    },
    {
      "check": "AC-2",
      "method": "Four caller migrations, resolver differential tests, stdio/drain and startup checks",
      "outcome": "pass",
      "evidenceIds": ["bridge", "resolver", "startup", "containment"],
      "reason": "Windows agent callers use the facade with required notifications, stdio and bounded launch behavior."
    },
    {
      "check": "AC-3",
      "method": "Native normal-exit, abort/deadline, outsider-survival and pending-ownership tests",
      "outcome": "pass",
      "evidenceIds": ["containment", "bridge", "checks"],
      "reason": "Termination uses owned jobs, including policy A cleanup after leader exit, without PID-tree selection."
    },
    {
      "check": "AC-4",
      "method": "Unavailable-launcher, target-error, leader-survival and inherited-pipe fallback tests",
      "outcome": "pass",
      "evidenceIds": ["containment", "bridge"],
      "reason": "Only launcher unavailability permits warned fallback; termination targets only the owned leader."
    },
    {
      "check": "AC-5",
      "method": "Probe source review and timeout/output-cap regressions",
      "outcome": "pass",
      "evidenceIds": ["bridge", "checks"],
      "reason": "Metadata probes retain plain spawn and budgets, with Windows leader-only termination."
    },
    {
      "check": "AC-6",
      "method": "Real Windows descendant console visibility test",
      "outcome": "pass",
      "evidenceIds": ["containment"],
      "reason": "The descendant console window is absent or invisible without native flag changes."
    },
    {
      "check": "AC-7",
      "method": "Scoped runtime/helper/cleanup search and diff review",
      "outcome": "pass",
      "evidenceIds": ["checks"],
      "reason": "No prohibited PID-tree, parent-PID or creation-time termination selection remains."
    },
    {
      "check": "AC-8",
      "method": "Packaging diff, fresh external builds, packed-bundle smoke and documentation review",
      "outcome": "pass",
      "evidenceIds": ["packaging"],
      "reason": "Launcher assets are declared and packed beside the bridge bundle; documentation matches the contract."
    },
    {
      "check": "AC-9",
      "method": "POSIX branch comparison and real WSL base/current differential probes",
      "outcome": "pass",
      "evidenceIds": ["posix", "bridge"],
      "reason": "Non-job settlement remains exit-based, and SIGTERM followed by group SIGKILL after 750 ms is preserved."
    },
    {
      "check": "F1: startup bounds cover pending launch",
      "method": "Independent real-timer reproduction plus all-caller pending-launch regressions",
      "outcome": "pass",
      "evidenceIds": ["startup", "containment"],
      "reason": "The original unbounded running state is eliminated; late jobs remain owned and are cleaned."
    },
    {
      "check": "F2: drain scope excludes POSIX and Windows fallback",
      "method": "Native inherited-pipe tests and independent WSL HEAD/current comparison",
      "outcome": "pass",
      "evidenceIds": ["posix", "bridge"],
      "reason": "Descendant-held pipes no longer postpone non-job terminal settlement; job-backed output still drains."
    },
    {
      "check": "Terminal stream guarantee, durable deltas and scope",
      "method": "Canonical spec/record review, lifecycle/startup regressions and full diff inspection",
      "outcome": "pass",
      "evidenceIds": ["record", "bridge", "startup", "checks"],
      "reason": "Timeouts produce explicit errors, terminal settlement remains fenced, and no undeclared product change was found."
    },
    {
      "check": "Reported Windows flakes",
      "method": "Focused reruns, base comparison, cleanup tracing and ownership-path analysis",
      "outcome": "pass",
      "evidenceIds": ["flakes", "bridge", "containment"],
      "reason": "No new deterministic functional regression or leaked-process evidence was found. Exact original flake attribution remains qualified."
    }
  ],
  "risks": [
    {
      "description": "Full-load timing and cleanup flakes remain possible. ENOTEMPTY is consistent with unchanged asynchronous SessionStore persistence, not evidence of an ENOENT launcher leak. On recurrence, trace pending writes and join fixture persistence before removal; do not alter containment or introduce PID-tree cleanup.",
      "severity": "medium",
      "blocking": false,
      "evidenceIds": ["flakes", "bridge", "containment"]
    },
    {
      "description": "Accepted limitations remain: broker-created processes can escape jobs, cold browsers may end with agy, and cold helper startup consumes existing bounds. Hosted Node 22 Linux/Windows CI remains the post-push release gate.",
      "severity": "low",
      "blocking": false,
      "evidenceIds": ["record", "packaging", "posix"]
    }
  ],
  "openQuestions": [],
  "nextAction": "Validate this unchanged envelope, record acceptance evidence, and run closeout before archiving.",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/antigravity-windows-job-containment/antigravity-windows-job-containment.md",
    "reviewedRecordSha256": "bfae285c5fea7fd80fe129fdaef97260a9ec019e3298b26d5e95882c929755fa"
  }
}
```

After PASS, root pastes the Oracle's unchanged final-verification envelope here.

- AC-1: PASS | pi-core windows-job isolation/recovery/integration tests (11/11), pi-core suite 1036, AskCodex 289 passed / 4 skipped | Oracle round 2 evidence `core`
- AC-2: PASS | facade migration of driver/AskAntigravity/web/ACP, libuv resolver differential matrix, stdio/drain and pending-launch startup regressions; bridge suite 930 passed / 9 skipped | Oracle round 2 evidence `bridge`, `resolver`, `startup`
- AC-3: PASS | native job tests: descendants end on normal exit, abort and deadline; outsider survives; late jobs cleaned | Oracle round 2 evidence `containment`
- AC-4: PASS | JobLauncherUnavailable-only fallback with warning and leader-only kill, inherited-pipe fallback regression | Oracle round 2 evidence `containment`
- AC-5: PASS | probe timeout/output-cap regressions with plain spawn and leader-only Windows termination | Oracle round 2 evidence `bridge`, `checks`
- AC-6: PASS | real Windows descendant console visibility test reports no visible window | Oracle round 2 evidence `containment`
- AC-7: PASS | repository search: no taskkill tree kill or ancestry selection in bridge src/tests or pi-subagents test cleanups | Oracle round 2 evidence `checks`
- AC-8: PASS | build:pi-extensions + test:pi-extensions 13/13 with launcher assets beside bridge dist; README/CHANGELOG reviewed | Oracle round 2 evidence `packaging`
- AC-9: PASS | WSL Node 22 base/current differential: exit-based non-job settlement and 750 ms group SIGKILL preserved | Oracle round 2 evidence `posix`
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:b73d13803f97f55efa64463e0685c1283eaac5fbf6cb59c07d4213578d3bb6a7

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
