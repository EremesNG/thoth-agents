# Local background task usage

## Spawn

Use `bg_task_spawn` for a long-running command. Supply either `command` (PowerShell 7 syntax on Windows; the configured POSIX shell's syntax elsewhere, defaulting to `/bin/bash`) or `shell:false` with `argv` (literal executable and arguments). Optional fields include `name`, `cwd`, `env`, `callback`, `timeout_seconds`, and `max_log_bytes`.

```json
{"name":"build","shell":false,"argv":["node","build.mjs"],"timeout_seconds":1800}
```

The launch result includes the task ID and log path. Continue unblocked foreground work instead of repeatedly polling. Inspect the terminal result before considering the parent milestone complete.

## Watch

Use `bg_task_watch` for repeated checks. Supply a command plus `success_when`, and optionally `failure_when`, `interval_seconds`, `timeout_seconds`, and `blind_checks`. Conditions support exit codes, stdout/stderr substrings, and root-prefixed JSON paths (`$.status`, `$.steps[0].status`).

```json
{"shell":false,"argv":["node","health-check.mjs"],"interval_seconds":5,"success_when":{"type":"exit_code","equals":0}}
```

The first check is reported after at most 15 seconds. Cancelling that tool call stops waiting, not the watch; use `bg_task_stop` to cancel the job. Watch timeout defaults to 900 seconds; zero disables it. A broken check should exit nonzero rather than swallowing errors with `exit 0`. Repeated exit-zero checks with stderr and no matching condition are flagged as possibly blind; intentional stderr can be redirected or `blind_checks:0` used deliberately.

## Inspect and stop

- `bg_task_list`: compact task rows, status filtering, caller-owned cursors.
- `bg_task_status`: status, failures, decision, and progress; `verbose:true` returns bounded metadata with environment values omitted.
- `bg_task_log`: compact trailing evidence; `raw:true` or `lines:0` pages retained log bytes.
- `bg_task_stop`: cancel an owned task.
- `bg_task`: action wrapper for spawn/watch/list/status/log/stop/clear.
- `bg_status`: action wrapper for list/status/log/stop/clear.

Default scope is the current session. `all:true` explicitly allows inspection or by-ID mutation of another session's task. Bulk clear dismisses owned terminal tasks only. Completion callbacks are follow-ups tied to the task's originating session; cancellation is quiet. The interactive navigator retains task details and logs.

## Intent and evidence

`operation_id` groups modified retries of the same operation in one session; a later success recovers earlier failures. `expected_exit_codes` declares intentional nonzero exits. Zero is ignored, not rejected. Neither field treats signals or timeouts as expected.

Logs retain up to 4 MiB by default, disclosing retention and capture loss. Terminal artifacts expire after seven days. See the README lifecycle and limits for reload handoff and verified shutdown cleanup.
