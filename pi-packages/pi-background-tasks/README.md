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

Pass this to `bg_task_spawn`. Prefer `shell:false` and `argv` for literal arguments. Shell commands use `/bin/bash` on POSIX and Git for Windows Bash on Windows; `PI_BETTER_BACKGROUND_TASKS_SHELL` overrides the executable. Commands should be long-running work, not short foreground checks.

A watch repeatedly executes a command until `success_when`, `failure_when`, or timeout matches. Its first result is returned after at most 15 seconds. Watch timeout defaults to 900 seconds; `timeout_seconds:0` disables it. Spawned processes have no default timeout. Logs retain a bounded tail (4 MiB by default), and terminal artifacts are retained for seven days. List/status/log default to the current session; `all:true` explicitly opts into cross-session inspection.

Completion callbacks are session-origin scoped and delivered as Pi follow-ups. Cancelled tasks do not wake the agent. Failed checks remain visible in status and can receive failure-attention callbacks. The navigator shows local work and its evidence.

## Lifecycle implementation checkpoint

Reload currently suspends scheduling and hands durable task metadata to the next instance. Processes remain alive and a resumed session delivers terminal callbacks once. The stronger session-ending cleanup and concurrent-instance isolation described in the approved change record are **not implemented yet**. Until that work lands, ending Pi can leave jobs running, and suspended deadlines are not enforced. Do not rely on automatic cleanup at this checkpoint.

Even after lifecycle cleanup is implemented, abrupt host death cannot run shutdown hooks; OS-level containment is outside this package's guarantees.

## Development

From the workspace root:

```sh
pnpm install --frozen-lockfile
pnpm --filter @thoth-agents/pi-background-tasks run typecheck
pnpm --filter @thoth-agents/pi-background-tasks run test
```

Tests use private temporary registry roots. Node fixtures cover portable process jobs and local watch sequences; executable-shell incident reproductions have explicit POSIX-only guards on Windows.
