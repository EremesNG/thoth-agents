# @thoth-agents/pi-background-tasks

Local shell/process jobs for Pi: spawn commands, poll watches, inspect logs and status, stop work, and receive completion callbacks without blocking the foreground turn. Tool names are unchanged: `bg_task_spawn`, `bg_task_watch`, `bg_task_list`, `bg_task_status`, `bg_task_log`, `bg_task_stop`, `bg_task`, and `bg_status`. The Work panel remains available in interactive sessions.

## Provenance

Copied from https://github.com/1aboveio/pi-better-harness, directory `packages/pi-better-background-tasks`, commit `86876e8369a673892a10c4e8df15460386ad0132` (upstream version 0.6.2). MIT; `Copyright (c) 2026 1aboveio` is retained in LICENSE. Shared libraries are now owned source; no upstream monorepo synchronization scripts are needed.

The manifest follows the existing vendored packages' conventions (scoped name, source-TypeScript extension entry, public publish configuration; not marked private). Installing this workspace does not change the operator's Pi settings.

## Use

Thoth's complete Pi Install and applied Update install and individually verify
`npm:@thoth-agents/pi-background-tasks@>=0.3.0`. An existing copy from any source
at or above that floor is preserved without reinstalling; an older copy remains
untouched and blocks completion with manual upgrade guidance. Ambiguous identity
fails closed. Upgrade a local/Git checkout in place, or review ownership before
switching its configured source with Pi's native remove/install commands; verify
the installed manifest and rerun setup. Dry-run performs no mutation.

For a standalone install:

```sh
pi install 'npm:@thoth-agents/pi-background-tasks@>=0.3.0'
```

Restart Pi after installation. The manifest loads the compiled `./dist/index.ts`
entry; workspace development builds it with `pnpm run build:pi-extensions`.

```json
{
  "name": "build",
  "shell": "none",
  "argv": ["node", "build.mjs"],
  "timeout_seconds": 1800
}
```

Pass this to `bg_task_spawn`. Prefer `shell:"none"` and `argv` for literal arguments: the executable runs directly, without shell parsing or MSYS argument rewriting. Commands should be long-running work, not short foreground checks.

### Declare the command shell

Spawn, watch, and the `bg_task` action wrapper accept **`shell: "bash" | "powershell" | "none"`**, default **`"bash"`**. New calls reject the old boolean form. Write the syntax of the shell you declare; commands are never translated or silently run in another shell. An unavailable requested shell fails before launch, naming the missing shell, available shells (including PowerShell edition/version), and how to rewrite the call.

- **`bash`** resolves through Pi's public shell resolver and `shellPath` setting, with Pi's arguments (`-c`). Windows: `shellPath` → Git Bash under Program Files → `bash.exe` on PATH. POSIX: `shellPath` → `PI_BETTER_BACKGROUND_TASKS_SHELL` override → `/bin/bash` → PATH bash. Pi's `sh` fallback and System32/Sysnative WSL bash are rejected as bash unavailable. Bash command strings retain Pi's MSYS path/argument conversion behavior; use `none` for literal native argv. Git Bash reopens its log streams inside the shell so stdout/stderr are captured.
- **`powershell`** prefers validated PowerShell Core 7+, then Windows PowerShell Desktop 5.1 on Windows; POSIX supports pwsh only. `PI_BACKGROUND_TASKS_PWSH` replaces pwsh discovery and may point to either edition; an unusable override still permits the Windows 5.1 candidate, never a different shell. Normal Windows discovery checks PATH pwsh, Program Files/PowerShell/7 and WindowsApps, then System32/WindowsPowerShell/v1.0/powershell.exe. Windows PowerShell **5.1 lacks `&&`/`||`**: use compatible PowerShell syntax. The encoded wrapper sets UTF-8 before parsing user commands inside `try`, suppresses progress, and propagates explicit `exit N` and native-command exit codes.
- **`none`** runs `argv` directly. No command shell is required, but Windows containment still uses a validated PowerShell helper, preferring 7+ and accepting built-in 5.1. PowerShell 7 is not a prerequisite for Windows jobs of any shell.

Tool descriptions and command/shell parameter docs disclose shells detected once at registration (paths, PowerShell edition/version and 5.1 limitations). Availability is revalidated at launch. Every spawn/watch result includes the actual shell label in text and `details.shell` (`kind`, `executable`, `label`, and PowerShell `edition`/`version`). Legacy records without launch details report those details as unknown. Reload normalizes legacy metadata: `false` → `none`, `true`/absent → `powershell` on Windows or `bash` on POSIX, preserving the shell the old job was written for.

A watch repeatedly executes a command until `success_when`, `failure_when`, or timeout matches. Its first result is returned after at most 15 seconds. Watch timeout defaults to 900 seconds; `timeout_seconds:0` disables it. Spawned processes have no default timeout. Logs retain a bounded tail (4 MiB by default), and terminal artifacts are retained for seven days. List/status/log default to the current session; `all:true` explicitly opts into cross-session inspection.

Completion callbacks are session-origin scoped and delivered as Pi follow-ups. Cancelled tasks do not wake the agent. Failed checks remain visible in status and can receive failure-attention callbacks. The Work panel's Background section shows local work and its evidence.

### Work panel and history

The Background provider uses pi-core's v2 data-only Work panel contract: rows
carry unstyled text and semantic status, with rendering owned by the host.
pi-core's [discovery/action API](../pi-core/README.md#discovery-and-actions) lists
sources, subscribes to revisions, reads bounded rows and invokes same-session
open/history/close actions. Upgrade pi-subagents, pi-background-tasks and pi-todo
together to `>=0.3.0`, then `/reload`: first-owner arbitration hides incompatible
sections in mixed v1/v2 installs.

The Background section shows running work and current-prompt outcomes while the
agent is busy (all failures/timeouts and at most three recent completed tasks).
When idle with no running tasks, it collapses to one selectable summary with
session done/failed totals. This replaces the former 30-second row expiry.
Prompt retention uses pi-core's observed-text heuristic: a run must match an
interactive/RPC prompt observed while idle; prompts queued while streaming do
not advance it.

Press ← from an empty editor to focus the Work panel, ↑/↓ to select, and Enter
to open history (a task row selects that task). `/bg` opens the same panel; no
default shortcut is added. History lists every retained task from the current
cwd/session, newest first, including dismissed tasks and older outcomes. Task
metadata and retained logs are shown in bounded pages of up to 64 KiB, with
visible capture/retention loss notices. ←/→ selects a task, ↑/↓, PgUp/PgDn,
Home/End and the mouse wheel scroll the current page; `[`/`]` pages the log.
Press `x` twice to stop a running task; Esc, `q` or Ctrl+C closes history.
The shared pi-core overlay host enables mouse reporting in regular TUI mode and
releases it on close, rejection or disposal; fullscreen-owned tracking is untouched.
Dismissing a terminal Work-panel row does not remove it from history or totals.
Registry retention is unchanged: maintenance removes terminal artifacts after
seven days.

Tool calls/results, completion/failure messages and the Work panel's Background
section render through the theme's Render KIT when present, discovered through
`@thoth-agents/pi-core` at render time. Without the kit, they keep native Pi
rendering; there is no dependency on `@thoth-agents/pi-thoth-theme`.

## Task summary channel

Publishes complete current cwd/session-origin snapshots on pi-core's v1
`thoth:background:state` channel, with source
`@thoth-agents/pi-background-tasks` and envelope
`{ v, source, sessionId, at, data }` (`at` is Unix milliseconds). Data contains
only task id/name, kind/status, lifecycle times, exit code/signal and dismissal,
plus status counts; dismissed tasks remain included. The contract permits numeric
or short-text progress (at most 200 UTF-16 code units), currently omitted by this
publisher. Commands, argv, environment, results, stdout/stderr, logs and log paths
are never published.

Subscribe before requesting on `thoth:background:state:request` with `data: {}`
and the target session ID in the envelope. Requests before readiness are answered
once by the readiness snapshot. Publications use fresh metadata reads after
registry changes, including filesystem notifications for another process's
writes (no polling timers), and on session start/switch. Watches are disposed and
rebound across session switches and disposed on shutdown. Consumers replace the
full snapshot; this channel does not change work-panel/history providers or
retention. See [pi-core's exact contract](../pi-core/README.md#task-summary-and-usage-channels).

## Lifecycle and limits

A session's `/reload` suspends that instance's scheduling without stopping its jobs. The next instance adopts work of the same origin, including an in-flight watch poll: it does not start an overlapping poll, and completion is delivered once. Runtime timers, the Work panel Background section and failure-attention state belong to each extension instance; loading or ending a headless child does not change root-session work or UI.

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
