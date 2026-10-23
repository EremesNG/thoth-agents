# Local background task usage

## Spawn

Use `bg_task_spawn` for a long-running command. Supply `command` and declare `shell:"bash"` (default) or `shell:"powershell"` with matching syntax, or use `shell:"none"` with `argv` for literal executable arguments. Boolean shell values are no longer accepted. Optional fields include `name`, `cwd`, `env`, `callback`, `timeout_seconds`, and `max_log_bytes`.

```json
{"name":"build","shell":"none","argv":["node","build.mjs"],"timeout_seconds":1800}
```

The launch result includes the task ID, log path, and actual shell label. `details.shell` reports `kind`, `executable`, `label`, and PowerShell `edition`/`version`; `none` reports the argv executable. Continue unblocked foreground work instead of repeatedly polling. Inspect the terminal result before considering the parent milestone complete.

### Resolution and unavailable shells

Each command tool description lists detected shells once at registration; launch revalidates them. Bash uses Pi's `shellPath` setting and public resolver: Windows setting → Program Files Git Bash → PATH bash; POSIX setting → `PI_BETTER_BACKGROUND_TASKS_SHELL` override → `/bin/bash` → PATH bash. Pi's `sh` fallback and WSL System32/Sysnative bash are unavailable, not substitutes. Bash uses Pi's `-c` arguments and MSYS conversion behavior; use `none` to avoid native argv rewriting. Git Bash stdout/stderr are captured in the job logs.

PowerShell prefers pwsh 7+, then built-in Windows PowerShell 5.1 on Windows (POSIX: pwsh only). `PI_BACKGROUND_TASKS_PWSH` replaces pwsh discovery and accepts either supported edition; Windows 5.1 remains the final candidate if the override is unusable. The Windows containment helper also accepts 5.1, so hosts without pwsh can run bash, PowerShell and argv jobs. PowerShell output and parse errors are UTF-8; progress is suppressed. Explicit and native exit codes propagate. **PowerShell 5.1 lacks `&&`/`||`**; use compatible syntax.

An unavailable requested shell fails before launch, names available shells with PowerShell edition/version, and suggests rewriting as `shell:"powershell"` with PowerShell syntax or `shell:"bash"` with bash syntax. No cross-shell fallback or translation occurs. For example:

```json
{"shell":"bash","command":"printf 'build started\\n'; node build.mjs"}
{"shell":"powershell","command":"Write-Output 'build started'; node build.mjs"}
```

Persisted pre-enum metadata is normalized on reload: old `false` becomes `none`; `true`/absent keeps the legacy platform shell (`powershell` on Windows, `bash` elsewhere). Legacy launch details remain unknown rather than inferred from today's detection.

## Watch

Use `bg_task_watch` for repeated checks. Supply a command plus `success_when`, and optionally `failure_when`, `interval_seconds`, `timeout_seconds`, and `blind_checks`. Conditions support exit codes, stdout/stderr substrings, and root-prefixed JSON paths (`$.status`, `$.steps[0].status`).

```json
{"shell":"none","argv":["node","health-check.mjs"],"interval_seconds":5,"success_when":{"type":"exit_code","equals":0}}
```

Spawn and watch use the same shell contract and report the shell used. The first check is reported after at most 15 seconds. Cancelling that tool call stops waiting, not the watch; use `bg_task_stop` to cancel the job. Watch timeout defaults to 900 seconds; zero disables it. A broken check should exit nonzero rather than swallowing errors with `exit 0`. Repeated exit-zero checks with stderr and no matching condition are flagged as possibly blind; intentional stderr can be redirected or `blind_checks:0` used deliberately.

## Inspect and stop

- `bg_task_list`: compact task rows, status filtering, caller-owned cursors.
- `bg_task_status`: status, failures, decision, and progress; `verbose:true` returns bounded metadata with environment values omitted.
- `bg_task_log`: compact trailing evidence; `raw:true` or `lines:0` pages retained log bytes.
- `bg_task_stop`: cancel an owned task; `history:true` includes failure history in the result.
- `bg_task_clear`: dismiss owned terminal tasks, optionally filtered by `status`, or one terminal task by `id` (ignoring `status`), without deleting history. Omitted or empty `status` means all terminal statuses; running tasks are never dismissed. `max_bytes` bounds missing-task and ownership diagnostics.

Use `max_bytes` for a UTF-8 output budget and `lines` for log tail rows; the old aliases `maxBytes`/`tail_lines` are not supported.

Default scope is the current session. `all:true` explicitly allows inspection or by-ID mutation of another session's task. Bulk clear dismisses owned terminal tasks only. Completion callbacks are follow-ups tied to the task's originating session; cancellation is quiet.

### Completion callbacks

Ordinary callback-enabled terminal transitions stay in the extension queue while
Pi is busy, compacting, or has no usable live context (`ctx.isIdle()` is false or
throws). Once idle, completions share one compact `background-completion-batch`
follow-up that triggers a turn, rather than preloading separate Pi follow-ups.
`session_start`, `agent_start`, and `agent_settled` refresh availability; delivery
is scheduled asynchronously after the default 100 ms accumulation window. A
lightweight retry timer also detects idle transitions without lifecycle events,
such as the end of manual compaction.

Set `PI_BETTER_CALLBACK_BATCH_MS` to `0`–`5000` milliseconds to tune the window
(invalid values use 100 ms). The existing 2 KiB default payload budget and overflow
rules apply: only represented completions are receipted; overflow and new arrivals
wait for the next available run. Failed sends restore events for retry. Ownership
is rechecked before sending, and `callback:false` never enters the queue.

After an ordinary handoff, an `awaitingRun` guard blocks another until Pi has
been observed busy, or the send fails. If Pi accepts a handoff but never exposes
that busy state, the guard remains latched; there is deliberately no timeout
that could duplicate a deferred run. This is a handoff-level guarantee, not an
exactly-once guarantee for model execution. Urgent failure alerts remain immediate
and bypass this gate, independently of Pi's `followUpMode`.

API wrappers share the queue through the host event bus or session-manager
identity. On reload, the old instance cancels its pending entries and timers;
the new instance replays unreceipted terminal tasks with fresh ownership checks.
Shared in-memory handoff receipts prevent resending an accepted notification
when its durable receipt write failed.

### Interactive history

Run `/bg`, or focus the Work panel with ← on an empty editor and press Enter on
the Background summary or a task row. Row Enter opens history at that task.
There is no default history shortcut. History is scoped to the current cwd and
session, lists newest first, and includes dismissed tasks and older outcomes
that no longer render above the editor.

- ←/→ selects tasks; ↑/↓, PgUp/PgDn, Home/End and mouse wheel scroll content.
- `[`/`]` selects the previous/next retained log page (up to 64 KiB per page).
- `x` twice stops the selected running task; terminal history is not dismissed.
- Esc, `q` or Ctrl+C closes the panel.

The panel shows status, command, start/end/elapsed timing, exit/error metadata
and retained output. Notices disclose output lost to capture or retention; lost
bytes cannot be recovered by paging. The above-editor section uses prompt
retention, not a 30-second timeout: running work always shows, current-prompt
failures/timeouts show while busy, and at most three current-prompt completed
outcomes show. An idle section without running work collapses to a summary of
session done/failed totals. Dismissed tasks stay out of rows, not history or totals.
Prompt epochs follow pi-core's observed-text matching for interactive/RPC input
submitted while idle; queued streaming input does not advance the epoch.

## Intent and evidence

`operation_id` groups modified retries of the same operation in one session; a later success recovers earlier failures. `expected_exit_codes` declares intentional nonzero exits. Zero is ignored, not rejected. Neither field treats signals or timeouts as expected.

Logs retain up to 4 MiB by default, disclosing retention and capture loss. Terminal artifacts expire after seven days. See the README lifecycle and limits for reload handoff and verified shutdown cleanup.
