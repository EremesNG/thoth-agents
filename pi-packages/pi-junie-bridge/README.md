# Pi Junie Bridge

Use your JetBrains AI subscription in Pi through the official Junie CLI. This
extension registers the `junie` model provider; it is not an AskJunie delegation
tool or a direct JetBrains inference API client.

## Install

Prerequisites: Node >=22.19, Pi >=1.5.0, and the Junie CLI installed and logged in
with your JetBrains Account. Run `junie` separately to complete login; the bridge
does not manage credentials or provide Pi `/login` authentication.

```bash
pi install npm:@thoth-agents/pi-junie-bridge
```

Restart Pi, run `/junie models` to refresh the available models, then select a
`junie` model in Pi. Installation is optional/manual, not managed by the Thoth
installer. If discovery cannot find the CLI, set `JUNIE_BRIDGE_LAUNCHER` to the
real Junie executable (especially on Windows).

## How it works

- Junie runs as an ACP agent provider over stdio. Models and supported effort
  levels are discovered from Junie and cached under Pi's agent directory.
- Pi tools are exposed through an authenticated loopback MCP server. Calls are
  returned to Pi for execution rather than executed by a second Pi tool loop.
- Junie's native tools remain available. Their permission requests are shown as
  Pi permission dialogs using Junie's options; headless requests, dismissal and
  timeout reject. Native tool activity is display-only in Pi.
- `brave_mode` is forced **off** on new, resumed and forked sessions. Junie session
  mappings persist across Pi restarts. Each Pi session uses its own lifecycle cwd
  (or a cwd supplied by that call/context). If an identified session has neither,
  the bridge warns and uses process cwd only for that session's in-memory state;
  it never borrows another session's cwd or permission UI.
- Default lean pi-subagents children retain Junie's lifecycle for workspace and
  teardown cleanup. Explicit `lifecycle_passthrough` lists replace defaults, so
  include `@thoth-agents/pi-junie-bridge` when configuring one.
- On Windows, the bundled pi-core launcher contains Junie in a kill-on-close Job
  Object. If the launcher is unavailable, a warning identifies the leader-only
  fallback, which cannot guarantee descendant cleanup.

## Commands

| Command | Purpose |
| --- | --- |
| `/junie models` | Refresh the cached model catalog without an inference prompt. |
| `/junie quota` | Fetch the remaining JetBrains AI balance on demand in an isolated, temporary session. |

Quota uses Junie's advertised `/stats` command, never a free-form prompt or the
user's mapped session. Two consecutive probes of Junie CLI 26.11.1 returned an
unchanged balance with no usage, thought or tool activity: this is **inferred
non-consuming behavior**, not a billing guarantee. Unexpected activity, missing
data or timeout reports quota unavailable and points to JetBrains Account →
JetBrains AI settings. There is no periodic quota polling.

## Limitations

- Junie's built-in tools **cannot be disabled**. Even with `brave_mode` off,
  Junie may run commands it classifies as safe without asking (observed with
  `echo` on Junie 26.11.1). The bridge can only gate permission requests Junie
  sends; headless requests reject. This bridge is not an OS sandbox.
- Authentication, model availability, ACP details and `/stats` behavior depend on
  the installed Junie version. Live behavior can change upstream.
- Pi model price rates are zero; message costs use Junie's cumulative USD usage
  reports, not measured subscription fees. Trailing usage received after a
  message ends is attributed to the next message in that session, without
  changing the completed message or delaying its terminal event. The attributed
  baseline persists across resume; an unreported final tail needs a later
  cumulative report to be recovered after restart. The Thoth theme classifies
  `junie` as a subscription provider by default.
- No captured-token proxy, API-key/BYOK management or npm bootstrap is included.

## Development

```bash
pnpm --filter @thoth-agents/pi-junie-bridge run typecheck
pnpm --filter @thoth-agents/pi-junie-bridge run test
pnpm --filter @thoth-agents/pi-junie-bridge run build
```

Tests use a fake ACP agent and loopback MCP; they do not require Junie login or
spend subscription credits. They do not establish live compatibility with every
Junie version.
