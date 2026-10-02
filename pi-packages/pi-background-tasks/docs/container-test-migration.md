# Container-test migration checkpoint

No commits. Windows full package validation: **typecheck PASS; 26 files PASS;
221 tests passed, 4 skipped**. `git diff --check` passes (existing CRLF notices only).

The replacement fixture (`src/test-support/job-helper-fixture.ts`) implements the
helper's JSON-lines boundary using streams. It exercises the **real**
WindowsJobClient, including active-process queries, bounded verification, retained
opaque job keys, and release. It does not mock `terminate()` into automatic success.

## Classification of all 33 previously failing tests

Names are abbreviated below; `process-cleanup`, `watch-cleanup`, etc. refer to the
corresponding `src/*.test.ts` file. No failing invariant was skipped.

| Previous test | Classification | Preserved/replacement assertion |
|---|---|---|
| process-cleanup: natural exit 0 | obsolete-replaced | Failed native terminate retains container; quit retries before cancellation |
| process-cleanup: natural exit 7 | obsolete-replaced | Same, preserving nonzero exit facts |
| process-cleanup: failed census | obsolete-replaced | Query unavailable cannot prove emptiness; repeated shutdown fails until query recovers |
| process-cleanup: reused descendant PID | obsolete-replaced | Requests carry opaque keys, not PIDs; unrelated reused PID remains untouched |
| process-cleanup: restoration | obsolete-replaced | Same-process authority reattached; metadata-only foreign PID authority separately refused |
| process-cleanup: same-process grace | obsolete-replaced | Lost leader cannot release a live, retained container |
| process-cleanup: partial stop | obsolete-replaced | Failed terminate leaves running/unended; retry verifies then cancels |
| process-cleanup: delayed leader close | obsolete-replaced | Close cannot terminalize failed cleanup; eventual terminal timestamp stays stable |
| process-cleanup: failed ordinary deadline | obsolete-replaced | Failure survives leader exit/reload and shutdown retries |
| process-cleanup: fresh module reload | obsolete-replaced | Opaque authority survives resetModules and lost-leader grace |
| process-cleanup: close during deadline | **fixed** | Adapter emits exit facts once before cleanup resolves, avoiding loss of exit facts at finalization |
| watch-cleanup: natural settlement | obsolete-replaced | Natural success remains running if cleanup fails |
| watch-cleanup: successful taskkill not verification | obsolete-replaced | Successful terminate plus ActiveProcesses > 0 cannot settle or start another poll |
| watch-cleanup: success branch | obsolete-replaced | Verify/release before success |
| watch-cleanup: failure branch | obsolete-replaced | Verify/release before failure |
| watch-cleanup: invalid-condition branch | obsolete-replaced | Verify/release before invalid-condition terminal state |
| watch-cleanup: nonmatching branch | obsolete-replaced | Release empty container before next launch |
| watch-cleanup: evaluation-error branch | obsolete-replaced | Release empty container before next launch |
| watch-cleanup: known-PID command error, cleanup succeeds | obsolete-replaced | Helper query error surfaces only after retained container cleanup succeeds |
| watch-cleanup: known-PID command error, cleanup fails | obsolete-replaced | Error plus failed cleanup survives reload; quit retries the same container |
| watch-cleanup: suspended natural completion | obsolete-replaced | Suspended instance cannot release unverified poll ownership |
| watch-cleanup: failed timeout | obsolete-replaced | Deadline failure remains running/unended; quit retries |
| watch-cleanup: failed stop | obsolete-replaced | Two terminate requests, exactly one verified release; cancelled only after empty |
| process-windows: taskkill whole tree | obsolete-replaced | PID API refuses signals; real helper tests verify independent containers and orphan cleanup |
| process-windows: taskkill cannot start | obsolete-replaced | Missing helper launch is actionable and never invokes PID fallback |
| process-windows: taskkill failure with live process | obsolete-replaced | Native terminate-denial fault coverage in process/watch cleanup suites |
| process-windows: exited-process taskkill race | obsolete-replaced | Empty-container terminate is idempotent; no PID liveness grants authority |
| process-windows: POSIX direct-PID fallback | obsolete-replaced | Signal only owned group; ESRCH/other errors never fall back to unrelated PID |
| process-windows: direct Windows spawn/redirection | obsolete-replaced | Jobs/watches launch separate keys through one hidden helper |
| runtime-windows: failed stop | **fixed** | Missing ownership gets an actionable refusal, remains running, signals no PID |
| windows-spawn-options: hidden direct jobs/watches | obsolete-replaced | Hidden helper with explicit flags and piped IPC; distinct job keys |
| windows-spawn-options: hidden census/taskkill | obsolete-replaced | Helper-only transport; no native-PID fallback |
| process-windows.integration: missing-shell log | **fixed** | Message now names executable and cwd, explains remediation, retains native error |

Additional coverage added:
- Helper temporarily unavailable during cleanup: ownership survives reload and
  recovery allows the same container to be retried.
- Helper crashes during watch cleanup: repeated shutdown attempts retain running
  ownership, no terminal timestamp/callback and no replacement poll. Native handle
  loss is never treated as a successful query.

Focused validation before the full suite: **58 tests passed** in the six previously
failing files. POSIX native execution remains a CI obligation; this checkpoint ran
on the Windows operator host. AC-8 is not implemented by this checkpoint.
