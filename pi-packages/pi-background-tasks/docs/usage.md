# Local background task usage

## Spawn

Use `bg_task_spawn` for a long-running command. Supply `command` and declare `shell:"bash"` (default) or `shell:"powershell"` with matching syntax, or use `shell:"none"` with `argv` for literal executable arguments. Boolean shell values are no longer accepted. Optional fields include `name`, `cwd`, `env`, `callback`, `timeout_seconds`, and `max_log_bytes`.

```json
{"name":"build","shell":"none","argv":["node","build.mjs"],"timeout_seconds":1800}
```

The launch result includes the task ID, log path, and actual shell label. `details.shell` reports `kind`, `executable`, `label`, and PowerShell `edition`/`version`; `none` reports the argv executable. Continue unblocked foreground work instead of repeatedly polling. Inspect the terminal result before considering the parent milestone complete.

### Resolution and unavailable shells

Tool descriptions and command/shell parameter docs list detected shells at registration; launch revalidates them. Bash uses Pi's `shellPath` setting and public resolver: Windows setting → Program Files Git Bash → PATH bash; POSIX setting → `PI_BETTER_BACKGROUND_TASKS_SHELL` override → `/bin/bash` → PATH bash. Pi's `sh` fallback and WSL System32/Sysnative bash are unavailable, not substitutes. Bash uses Pi's `-c` arguments and MSYS conversion behavior; use `none` to avoid native argv rewriting. Git Bash stdout/stderr are captured in the job logs.

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

Watch and `bg_task` spawn/watch actions use the same shell contract and report the shell used. The first check is reported after at most 15 seconds. Cancelling that tool call stops waiting, not the watch; use `bg_task_stop` to cancel the job. Watch timeout defaults to 900 seconds; zero disables it. A broken check should exit nonzero rather than swallowing errors with `exit 0`. Repeated exit-zero checks with stderr and no matching condition are flagged as possibly blind; intentional stderr can be redirected or `blind_checks:0` used deliberately.

## Inspect and stop

- `bg_task_list`: compact task rows, status filtering, caller-owned cursors.
- `bg_task_status`: status, failures, decision, and progress; `verbose:true` returns bounded metadata with environment values omitted.
- `bg_task_log`: compact trailing evidence; `raw:true` or `lines:0` pages retained log bytes.
- `bg_task_stop`: cancel an owned task.
- `bg_task`: action wrapper for spawn/watch/list/status/log/stop/clear.
- `bg_status`: action wrapper for list/status/log/stop/clear.

Default scope is the current session. `all:true` explicitly allows inspection or by-ID mutation of another session's task. Bulk clear dismisses owned terminal tasks only. Completion callbacks are follow-ups tied to the task's originating session; cancellation is quiet.

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
