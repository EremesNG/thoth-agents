# AC-3 containment lifecycle checkpoint

Uncommitted implementation on top of `7306e4d`; no pi-subagents edits.

## Audit fixes

- Retained handles are named/treated as opaque owned containers; `processTreeFor`,
  persisted PID/PGID reconstruction and foreign-owner reassignment are absent.
- A process-global, reload-stable random host-instance ID is persisted separately
  from diagnostic OS process-start information. A reused Pi PID cannot grant a new
  process ownership of a previous process's work.
- Resuming a task whose previous supervisor exited records failed/lost execution,
  with Windows host-exit Job Object semantics or explicit unverified POSIX cleanup.
  It does not probe/signal a stored job PID or claim cancellation. Live foreign-host
  tasks stay running and are not adopted.
- Missing current-host container authority is not verification: lost-leader grace
  leaves the task running/unended with an actionable ownership error.
- Watch stop checks the retained poll's origin before using its container. Unknown
  persisted watches cannot be recreated/stopped as though owned by this instance.
- POSIX lifecycle fixtures now keep descendants inside the owned group; detached
  setsid escapes are not incorrectly asserted as covered by best-effort cleanup.

## Acceptance evidence

| AC-3 behavior | Coverage |
|---|---|
| quit/new/resume/fork stops verified origin containers | `lifecycle.test.ts` parameterized shutdown cases |
| same-process reload survival and exactly-once callback | `lifecycle.test.ts`, `reload-handoff.test.ts`; singleton client test |
| blocked watch poll reload then quit | `lifecycle.test.ts`; one launch, no overlap, descendants gone |
| natural process exit through short-lived intermediate | `natural-watch-containment.test.ts` job branch, `containment.integration.test.ts` |
| natural watch success/failure/invalid-condition/nonmatch/evaluation-error branches | `natural-watch-containment.test.ts`: real grandchild through short-lived intermediate in every branch; no live prior grandchild at next poll |
| error/deadline settlement and failed-cleanup retry | `process-cleanup.test.ts`, `watch-cleanup.test.ts`; fake native protocol exercises the real container client |
| watch abort | `lifecycle.test.ts` |
| concurrent origins; child ending leaves root UI/callbacks/attention unchanged | `lifecycle.test.ts` |
| new host, live foreign host, recycled host PID | `host-reconciliation.test.ts` (4 tests) |
| child teardown completion/cancel/error/hanging preceding handler | pi-subagents real-SDK suite, unchanged |

## Frozen checks on Windows

- Package typecheck: **PASS**.
- Package suite: **30 files passed; 225 tests passed, 4 skipped**.
- `pnpm --filter @thoth-agents/pi-subagents run test`: **38 files passed;
  525 tests passed, 1 skipped**. No subagents changes required.
- `git diff --check`: PASS (existing CRLF conversion notices only).
- Native POSIX execution remains an Ubuntu CI obligation, not a Windows-host claim.

The runtime never derives native authority from diagnostic PID liveness. A missing
or dead helper remains conservative if ActiveProcesses cannot be queried; retries
cannot manufacture verification. Live operator AC-6 and independent review remain
root-owned follow-up work.
