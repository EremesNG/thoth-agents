# @thoth-agents/pi-background-tasks

Local shell/process jobs for Pi: spawn commands, poll watches, inspect logs and status, stop work, and receive completion callbacks without blocking the foreground turn. Tool names are unchanged: `bg_task_spawn`, `bg_task_watch`, `bg_task_list`, `bg_task_status`, `bg_task_log`, `bg_task_stop`, `bg_task`, and `bg_status`. The background-work navigator remains available in interactive sessions.

## Provenance

Copied from https://github.com/1aboveio/pi-better-harness, directory `packages/pi-better-background-tasks`, commit `86876e8369a673892a10c4e8df15460386ad0132` (upstream version 0.6.2). MIT; `Copyright (c) 2026 1aboveio` is retained in LICENSE. Shared libraries are now owned source; no upstream monorepo synchronization scripts are needed.

The manifest follows the existing vendored packages' conventions (scoped name, source-TypeScript extension entry, public publish configuration; not marked private). Installing this workspace does not change the operator's Pi settings.

## Use

Install/select this package explicitly in Pi settings, then restart Pi. Pi loads `./src/index.ts` directly; no build step is needed.

```json
{
  "name": "build",
  "shell": false,
  "argv": ["node", "build.mjs"],
  "timeout_seconds": 1800
}
```

Pass this to `bg_task_spawn`. Prefer `shell:false` and `argv` for literal arguments: the executable runs directly, without a shell or argument rewriting. Commands should be long-running work, not short foreground checks.

On Windows, command strings and watch commands use **PowerShell Core 7+** with `-NoProfile -NonInteractive` and UTF-16LE `-EncodedCommand` (UTF-8 stdout/stderr). Native-command exit codes and explicit `exit N` propagate. Write PowerShell syntax, not Bash syntax. Install PowerShell 7 or set `PI_BACKGROUND_TASKS_PWSH` to its `pwsh.exe` path. Discovery checks that explicit override, otherwise `where.exe pwsh.exe`, then `%ProgramFiles%\PowerShell\7\pwsh.exe` and `%LOCALAPPDATA%\Microsoft\WindowsApps\pwsh.exe`. Each discovered executable is validated as Core edition major 7+ and cached for that discovery configuration. An invalid override or missing compatible executable fails actionably; **there is no Git Bash fallback**. PowerShell 7 is also required for the hidden containment helper, including for argv jobs.

On POSIX, command strings keep `/bin/bash`; `PI_BETTER_BACKGROUND_TASKS_SHELL` overrides the POSIX shell only.

A watch repeatedly executes a command until `success_when`, `failure_when`, or timeout matches. Its first result is returned after at most 15 seconds. Watch timeout defaults to 900 seconds; `timeout_seconds:0` disables it. Spawned processes have no default timeout. Logs retain a bounded tail (4 MiB by default), and terminal artifacts are retained for seven days. List/status/log default to the current session; `all:true` explicitly opts into cross-session inspection.

Completion callbacks are session-origin scoped and delivered as Pi follow-ups. Cancelled tasks do not wake the agent. Failed checks remain visible in status and can receive failure-attention callbacks. The navigator shows local work and its evidence.

## Lifecycle and limits

A session's `/reload` suspends that instance's scheduling without stopping its jobs. The next instance adopts work of the same origin, including an in-flight watch poll: it does not start an overlapping poll, and completion is delivered once. Runtime timers, navigator UI and failure-attention state belong to each extension instance; loading or ending a headless child does not change root-session work or UI.

Every other `session_shutdown` reason (including quit, new, resume and fork) stops the origin's running jobs and in-flight watch commands, subject to the platform guarantees below. Cancelled jobs do not send completion callbacks.

**Windows containment:** every job and watch poll is created suspended, assigned to its own unnamed Job Object, and resumed only after assignment succeeds. Assignment failure terminates the suspended child without running it. Jobs have KILL_ON_JOB_CLOSE and no breakaway permission; only stdio handles are inherited. Termination uses `TerminateJobObject`, and `ActiveProcesses == 0` must be verified before cancellation, natural-exit finalization, watch-condition evaluation, or the next poll. A short-lived intermediate cannot escape tracking: there is no ancestry census or PID-based tree kill. Opaque launch-time ownership survives same-process reload and is never reconstructed from persisted PIDs. Failed cleanup stays running, owned and retriable.

One hidden PowerShell helper, shared across sessions in the same Pi process, owns the job handles outside those jobs. It waits independently on Pi's process handle. **Any Pi process exit, including a crash, closes the jobs and kills their trees on Windows.** Helper death also kills its contained jobs; if emptiness cannot be queried, the package conservatively retains unverified ownership instead of declaring success. Child-session teardown stops only its own containers, never the shared helper. This is not a sandbox: work brokered through services, elevation, WSL or remote systems is outside the containment guarantee.

**POSIX is best-effort:** each launch gets its own detached process group. Cleanup sends TERM, waits up to 500 ms, then KILL when needed, and waits for the group to report ESRCH. No ancestry census or individual-PID fallback is used. A reused group ID after the leader is reaped can be signalled; descendants that leave the group (`setsid`) can escape; abrupt Pi death does not clean up groups. ESRCH does not prove that escaped descendants exited. Natural exit triggers the same best-effort group cleanup before terminalization or another poll.

Jobs survive only a same-process owning-session `/reload`, not a Pi restart. During the gap between reload instances, scheduled deadlines are suspended; resumed work enforces overdue deadlines. Child sessions are separate origins and must emit their shutdown event when they end. All package and fixture process launchers explicitly hide Windows consoles.

## Development

From the workspace root:

```sh
pnpm install --frozen-lockfile
pnpm --filter @thoth-agents/pi-background-tasks run typecheck
pnpm --filter @thoth-agents/pi-background-tasks run test
```

Tests use private temporary registry roots. Node fixtures cover portable process jobs and local watch sequences; executable-shell incident reproductions have explicit POSIX-only guards on Windows.
