# Windows Job Object feasibility checkpoints

## Milestone 1 historical record (prototype subsequently moved into source)

Original run: `node pi-packages/pi-background-tasks/prototype/windows-job-probe.mjs`
Requires Windows and PowerShell Core 7+ (override executable with `PWSH_PATH`).
No dependency changes. Nothing under `src/` changed.

## Built

- `windows-job-helper.ps1`: persistent UTF-8 JSON-lines host; one `Add-Type` per
  process; Core 7+ check. `launch`, `query`, `terminate` requests carry an `id`.
- `windows-job-helper.cs`: unnamed KILL_ON_JOB_CLOSE jobs, no breakaway flags;
  suspended/no-window Unicode `CreateProcessW`; assignment before resume;
  failed assignment terminates/waits the suspended process. Stdio uses an
  append-only log handle with read/write/delete sharing. A startup handle allowlist
  passes only log/NUL handles; job and parent handles are non-inheritable.
  Native parent-handle wait on a separate thread calls `Environment.Exit`, independent
  of PowerShell's blocking stdin. `query` reports leader exit and active job processes.
- `windows-job-probe.mjs`: real Node orphan-tree and independent owner-death probes,
  with cleanup. Ancestor CIM queries in the prototype are diagnostics ONLY, never
  ownership or termination authority. No PID-based descendant killing.

## Final green probe, 2026-10-02 00:22 UTC

PowerShell 7.6.6; Pi PID **39392**, `IsProcessInJob=true`; helper PID **40780**, also
`true`. Pi's Orca ancestors 39248/35116 also reported `true`. Nested assignment
succeeded on the current host; no breakaway was needed.

(a) Leader **36092** (creation time `2026-10-02T00:22:08.9624944Z`) exited 0;
intermediate **6612** was gone; grandchild **40880** stayed alive. The job reported
**ActiveProcesses=1** after leader exit and again after 150 ms, then **0** following
`TerminateJobObject`. Grandchild PID was gone. Node descendants use `detached:true`
to prevent Node/libuv's own close-on-parent-exit jobs masking the orphan case;
they still remain contained by the prototype job. Unicode cwd/argv/env, UTF-8
stdout/stderr and preservation of an existing log prefix passed.

(b) Killing the **monitored owner** (Pi stand-in) **42564** caused helper **24644**,
leader **37404**, and descendant **26212** to disappear within **108.1 ms**.
The probe kept the helper's IPC open: this proves the parent-handle waiter is
independent of EOF. IMPORTANT: that stand-in was not the helper's actual spawning
parent; the outer probe spawned both. Two attempts at a stricter actual-spawning-
parent fixture (Node wrapper launching a detached helper, inherited pipes then
relayed pipes) did not reach helper readiness. Those attempts were cleaned up;
root should reassess that fixture before claiming the literal actual-parent test
passed. The final retained probe intentionally uses the successful, explicitly
labelled independent monitored-owner test instead.

(c) Pi/helper job membership and real successful nested assignment above.

(d) First helper cold start **1652.1 ms**, including diagnostic CIM ancestor reads;
Add-Type compile **663.6 ms**. Second helper cold **1761.3 ms**, compile **669.8 ms**.
Warm launch request/response **35.5 ms**. Compile happens once per helper, not launch.

## Verification and limits

Test-first: protocol/orphan test failed with the absent helper; implementation then
ran it. An initial non-detached orphan fixture was masked by Node's own child-job
cleanup; explicitly detached descendants produced the intended surviving orphan.
The final retained probe passed and cleans its helpers, owner, jobs and temp files.
A targeted CIM diagnostic after the failed fixture attempts found no prototype
PowerShell helpers left running.

This is feasibility code, not production-ready transport/ownership code. No AC-3,
AC-7 POSIX or AC-8 runtime rewiring, reload registry, failure-injection tests,
PID-reuse tests, denied-assignment test, explicit breakaway test, or release protocol
has been implemented. Assignment failure is fail-closed by construction but has
not yet been fault-injected. Do not interpret this checkpoint as full AC-7 PASS.

Milestone 1 was accepted with the two follow-up probes below. No commit made.

## Gap closure and milestone 2 checkpoint

Reproducible retained probe:
`node pi-packages/pi-background-tasks/src/test-support/windows-job-host-probe.mjs`.
Final run against the **source** helper: Node spawning parent **36096**, helper
**37396**, leader **33964**, descendant **35100**. `taskkill /PID 36096 /F` (NO `/T`)
killed the parent alone; all four PIDs disappeared within **154.2 ms**. The parent
uses the package's non-detached hidden spawn with stdio pipes, not the earlier
problematic detached wrapper fixture. Ready follows Add-Type and opening the
parent handle. Earlier independent-owner probe established non-EOF parent waiting.

Assignment denial injected an invalid job handle (test-only helper flag): Win32
error **6**, suspended child **19636** terminated, `neverResumed=true`, and its
marker file never appeared. This probe also passed before moving the helper.

Source integration added `windows-job-helper.ps1/.cs`, `windows-job-client.ts`, and
`windows-process.ts`. A process-global Symbol.for singleton retains the helper
across module reload; runtime launches retain opaque terminate closures instead of
reconstructing authority from persisted PID/PGID. Windows jobs and watches use the
helper, bounded ActiveProcesses verification, and release only empty jobs. The
helper permits only stdio handle inheritance and keeps native parent waiting
independent of IPC. There is no production ancestry census or PID-based Windows
termination. POSIX keeps best-effort detached-group TERM/500ms/KILL/ESRCH handling.
Group-ID reuse, abrupt Pi death and setsid escapes remain POSIX limits.

PowerShell command-shell migration is **not** implemented: command strings still
use Git Bash inside the job, including temporary shell-owned log redirection;
argv jobs use CreateProcess directly. Package publish files include the helper
sources; no dependency or lockfile change. `prototype/` was removed.

Validation on frozen production logic:
- Package typecheck **PASS**.
- Real helper protocol tests **4 passed** (isolation, fail-closed denial, helper
  death, singleton reattachment).
- Focused process/containment/lifecycle run **22 passed, 2 skipped**: immediate-exit
  intermediates for jobs and watches; timeouts; captures; reload and concurrent
  origins; child/root isolation.
- Full package suite **189 passed, 33 failed, 4 skipped** (26 files: 20 pass/6 fail).
  Remaining failures: 23 old process/watch cleanup fault-injection tests mock the
  removed census/direct-spawn/taskkill protocol; 8 obsolete Windows spawn/kill
  expectations; 1 runtime metadata-only PID ownership test; 1 missing-shell log
  format expectation (CreateProcess native error now replaces ENOENT text).
  These tests were NOT silently skipped or removed. Their retry/ownership
  invariants must be ported to the container protocol before accepting AC-7/AC-3.
- Two orphan grandchildren from the deliberately red pre-integration probe
  (**29680**, **37316**) were found by the manual test-fixture cleanup audit and
  explicitly killed. Final audit: no probe grandchildren or package helpers left.

Remaining work: migrate the failure-injection fixtures and obsolete Windows
expectations, test POSIX behavior on POSIX (old detached-descendant lifecycle tests
still assume stronger cross-group guarantees), audit bounded helper/protocol
failure and retry paths, improve unavailable-owner errors, document package limits,
and obtain a green full suite. Then AC-8 and the remaining AC-3 acceptance work.
This is an uncommitted checkpoint, NOT a green milestone 2 / full AC-7 claim.
