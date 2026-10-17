# @thoth-agents/pi-askcodex

The `AskCodex` delegation tool for [pi](https://github.com/earendil-works/pi), backed by the user's local Codex harness through `codex app-server --stdio`. **This is a tool, not a model provider**: it adds no models to `/model` and works alongside your current Pi provider.

Codex runs its own tool loop with its sandbox, configured MCP servers, skills, plugins, and optional web search. It can use the user's real browser and native Windows apps through Codex Computer Use. This package does not modify `~/.codex/config.toml` or Codex Desktop settings and has no `codex exec`/SDK fallback.

## Install

```sh
pi install npm:@thoth-agents/pi-askcodex
```

Requires Pi `>=0.99.0`, Node `>=22.19.0`, and Codex Desktop installed with a working Codex login. Install this package manually; the Thoth installer does not manage it. `AskCodex` is enabled by default; set `enabled: false` to disable registration.

- Prefer the **Desktop-bundled `codex.exe`**, not a standalone CLI install.
- **Native-app Computer Use requires Codex Desktop running**.
- **Browser Computer Use works without Desktop running**, with the configured Codex browser extension in the user's Edge/Chrome browser.
- Codex follows its own bundled `computer-use` skill for Computer Use methods. AskCodex only adds delegation and approval notes to the developer instructions; it does not prescribe how Codex performs Computer Use. App access approvals are handled by the host or the user; if access is denied, Codex is instructed to report it and stop.
- Computer Use still requires the corresponding Codex tools/plugin and browser extension to be available. Installing AskCodex does not install those integrations.

## Binary resolution

Resolution uses the first available source, in this order:

1. `ASKCODEX_BIN`, then the config file's `bin`: an explicit path to the native executable. An invalid explicit path fails rather than silently falling back.
2. On Windows, `%LOCALAPPDATA%/OpenAI/Codex/bin/<hash>/codex.exe`, choosing the executable with the newest modification time. If `LOCALAPPDATA` is absent, the resolver uses `~/AppData/Local`.
3. `codex.exe` on Windows PATH, or `codex` on macOS/Linux PATH, with a warning about native Computer Use and read-only shell compatibility. Automatic Desktop-bundle discovery is Windows-only.

On Windows, `.cmd`/`.bat` shims are rejected: execution uses `shell: false`. Point `ASKCODEX_BIN` at a real `codex.exe`, for example in PowerShell:

```powershell
$env:ASKCODEX_BIN = "$env:LOCALAPPDATA\OpenAI\Codex\bin\<hash>\codex.exe"
```

Explicit paths can become stale after Desktop updates; omit the override to use automatic discovery. The tool records the chosen binary and source in result details and performs a best-effort Desktop-running probe (unknown on non-Windows or probe failure).

## Configuration

Global file: `~/.pi/agent/askcodex/config.json`. There is no project-level config merge. Missing files use defaults; unreadable or malformed files warn and use defaults. Restart or reload the extension after changing configuration.

```json
{
  "enabled": true,
  "defaultMode": "accept-edits",
  "defaultTimeoutMinutes": 15,
  "allowedApps": [],
  "webSearch": "disabled"
}
```

All supported keys and defaults, cross-checked against `src/config.ts`:

| Key | Default | Meaning / environment override |
| --- | --- | --- |
| `enabled` | `true` | Register `AskCodex`. `ASKCODEX_ENABLED` accepts `true`, `1`, `yes`, `on` or `false`, `0`, `no`, `off` (case-insensitive); unrecognized values use the file/default. |
| `bin` | Unset | Native Codex executable path; `ASKCODEX_BIN` overrides it. See binary resolution above. |
| `defaultModel` | Unset (Codex default) | Model id; overridden by `ASKCODEX_DEFAULT_MODEL`. |
| `defaultEffort` | Unset (Codex default) | Reasoning effort; overridden by `ASKCODEX_DEFAULT_EFFORT`. Calls validate `minimal`, `low`, `medium`, `high`, or `xhigh`. |
| `defaultMode` | `"accept-edits"` | `"plan"` or `"accept-edits"`; other values fall back to `"accept-edits"`. |
| `defaultTimeoutMinutes` | `15` | Positive finite number; calls also enforce the supported timer range. |
| `allowedApps` | `[]` | Exact Computer Use app identifiers allowed for session-scoped approval. |
| `webSearch` | `"disabled"` | `"disabled"`, `"cached"`, or `"live"`; search is opt-in. |
| `extraArgs` | Unset (no extra arguments) | String array appended to the app-server launch arguments; advanced use only. |

Only the four environment overrides listed above are supported. Per-call parameters override the corresponding configured defaults. Allowlisting is separate from the Codex shell sandbox; it does not grant command, file, or general permission approvals.

## AskCodex tool

Give Codex a self-contained task, including relevant paths and constraints. For example:

```json
{
  "prompt": "Review src/config.ts for validation gaps. Report evidence; do not edit files or operate apps.",
  "mode": "plan"
}
```

### Parameters

| Parameter | Default | Description |
| --- | --- | --- |
| `prompt` | Required | Non-empty, self-contained task. |
| `mode` | Config `defaultMode` (`"accept-edits"`) | `"plan"` or `"accept-edits"`; see sandbox limits below. |
| `conversationId` | Unset (new thread) | Returned Codex thread id to resume; must not be empty. |
| `model` | Config `defaultModel`, otherwise Codex default | Codex model id. |
| `thinking` | Config `defaultEffort`, otherwise Codex default | `minimal`, `low`, `medium`, `high`, or `xhigh`. |
| `effort` | Same as `thinking` | Synonym; conflicting `thinking`/`effort` values are rejected. |
| `cwd` | Current Pi working directory | Existing workspace directory. |
| `digest` | `true` in plan mode, otherwise `false` | Ask for a compact digest of findings, decisions, changed paths, and verification. |
| `includeContext` | `false` | Explicitly export the resolved Pi conversation branch to a private `.askcodex-context-<id>.md` file in `cwd` for Codex to read. Omits non-text media, bounds tool payloads, and removes the file during cleanup. |
| `webSearch` | Config `webSearch` (`"disabled"`) | `"live"`, `"cached"`, `"disabled"`, or boolean (`true` → live, `false` → disabled). |
| `timeoutMinutes` | Config `defaultTimeoutMinutes` (`15`) | Positive finite minutes, within the supported timer range (at most 2,147,483,647 ms). Includes startup and approval waiting. |

### Modes and sandbox limits

- `plan` selects Codex's **read-only sandbox**.
- `accept-edits` selects **workspace-write** and is the default.

**Plan/read-only does NOT make MCP tools or Computer Use GUI actions read-only.** Developer instructions forbid mutations in plan mode, including through MCP/GUI, but that instruction is not an enforcement boundary for those integrations. App access approval can authorize GUI actions even in plan mode. Use narrowly scoped prompts and approvals; do not treat plan mode as protection for external services or open documents.

Both modes use Codex's `on-request` approval policy with the user as reviewer. Approvals can authorize additional access; review each request rather than assuming the initial sandbox is the whole boundary.

### Approval policy

- `allowedApps` matches only Computer Use app elicitations, using the exact requested `tool_params.app` identifier (case-insensitive, surrounding whitespace trimmed). No wildcard, prefix, substring, or display-name matching.
- Matching apps are auto-accepted with **session scope only**, including without Pi UI.
- Other app requests, MCP elicitations, command/file approvals, and permission requests ask through Pi's UI. Without UI they are declined; cancelled, dismissed, or failed prompts also decline. Unknown server requests are rejected and reported.
- Computer Use offers session approval; other prompts offer once/session only as supported by the request. **Persistent/"always" approval is never granted.** Every decision is recorded in result `details.approvals`.

For Notepad, `"notepad.exe"` may not be sufficient: Codex may also request its **packaged-app id**. Add both exact identifiers observed in approval details if you intend to allow both; do not guess the packaged id or broaden the allowlist. Start with an empty list and inspect the requested identifiers through an interactive Pi call.

### Results, continuation, and cancellation

The result contains the final Codex agent message and a `conversationId` footer. Details include thread/turn ids, status, model/effort/mode, elapsed time, binary source, `desktop.running` (`true`, `false`, or `'unknown'` after the probe), warnings, approval decisions, token usage when reported, errors, and available plan/diff updates. Live cards show elapsed time, current activity, and recent agent text.

Continue the same Codex thread with a self-contained follow-up:

```json
{
  "prompt": "Recheck the validation gap you found; report only new evidence and do not edit.",
  "mode": "plan",
  "conversationId": "<id returned by AskCodex>"
}
```

Threads are **non-ephemeral**, stored by Codex under `~/.codex/sessions`, and may appear in Codex Desktop history. Continuation survives the app-server process ending; it is not an isolated or disposable conversation. `includeContext` is opt-in because exporting Pi history shares it with Codex; deleting the temporary file does not remove text already read into the Codex thread.

Pi cancellation or timeout sends `turn/interrupt` when thread/turn ids are known, waits briefly (up to 1.5 seconds), then closes the client and terminates its owned process tree. The result reports interruption and whether it timed out or was aborted. Cancellation does not roll back completed file edits or GUI actions.

## Compatibility and risks

- **`codex app-server` is experimental.** The implementation targets the verified Desktop-bundled `0.162.0-alpha.17.2` protocol, not a guarantee of future compatibility.
- Desktop-bundled binaries are **version-volatile/alpha** and may change with Desktop updates. Automatic discovery follows the newest executable, not a pinned version.
- Protocol drift fails closed: failed handshakes/protocol errors fail the call, and unknown server requests are rejected rather than auto-approved. There is no CLI/SDK fallback.
- On Windows, the standalone PATH `codex` has produced **blank native-app screenshots, missing typing, and read-only shell sandbox errors** (`helper_unknown_error: setup refresh had errors`, including ACL errors). Prefer the Desktop bundle; having Desktop running alone does not fix an incompatible CLI binary.
- Codex loads the user's existing MCP/skills/plugins configuration. Delegated actions can affect real services, browser sessions, and documents; review that configuration and keep app approvals narrow.

## Troubleshooting

| Symptom | Check / remedy |
| --- | --- |
| `AskCodex` is missing | Confirm package installation and that `enabled` / `ASKCODEX_ENABLED` has not disabled registration; reload Pi. This package does not add a provider/model. |
| Executable not found, invalid path, or shim rejected | Install Codex Desktop; remove a stale override or set `ASKCODEX_BIN` to the real native executable, not `codex.cmd`/`codex.bat`. |
| Native Computer Use unavailable | Start Codex Desktop and confirm Codex's Computer Use integration is configured. The best-effort probe checks the Codex app process (Store: `ChatGPT.exe` under `WindowsApps/OpenAI.Codex_*`), not CLI/helper processes. Inaccessible paths produce unknown, not a stopped-app warning; detection is not a capability guarantee. |
| Blank screenshots, no typing, or read-only shell setup errors | Inspect `details.binary`; switch from a standalone PATH CLI to the Desktop-bundled executable. |
| App access denied | Inspect `details.approvals` for the exact app identifier, including Notepad's packaged-app id. Use interactive Pi approval or deliberately add that identifier to `allowedApps`. Headless calls decline non-allowlisted requests. |
| Browser tools unavailable | Check the Codex browser extension connection and follow Codex's bundled `computer-use` skill. Desktop need not be running for browser Computer Use. |
| Handshake/protocol failure after an update | Inspect returned errors and `stderrTail` when present; check the selected binary/version. Use a compatible Desktop bundle or update AskCodex; do not bypass approval handling. |
| Call times out while awaiting approval | Answer in Pi UI, use a narrow app allowlist for unattended Computer Use, or increase `timeoutMinutes`. Other approvals still decline without UI. |
| No final answer or process exited mid-turn | Treat the returned failure as failure, not success; inspect errors and stderr. Resume only with a returned `conversationId` and verify any partial effects. |

## Development

From the repository root:

```sh
pnpm --filter @thoth-agents/pi-askcodex typecheck
pnpm --filter @thoth-agents/pi-askcodex test
pnpm --filter @thoth-agents/pi-askcodex build
```

Offline tests use a fake app-server; they do not launch Codex Desktop or perform real Computer Use.
