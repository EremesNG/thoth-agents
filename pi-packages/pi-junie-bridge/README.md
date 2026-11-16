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
  levels are discovered from Junie and cached under Pi's agent directory. Model
  labels use Junie's display names and Pi ids are short (below); Junie always
  receives the exact ACP value. Observed context capacity is cached per model
  and reused on registration (32k fallback until observed). Prompt-response
  token usage is attributed to the terminal message only, not duplicated across
  parked Pi tool segments.
- Pi lists a model by its id and only prints a name when it differs, so a raw
  ACP value would read as `v1:12:jetbrains-ai:gemini-3.7-flash`. The catalog
  therefore stores both forms: `id` is the Pi-facing short id, the last segment
  of the ACP value, and `value` is the exact ACP value Junie receives.

  | ACP value | Pi model id |
  | --- | --- |
  | `v1:12:jetbrains-ai:gemini-3.7-flash` | `gemini-3.7-flash` |
  | `v1:12:jetbrains-ai:claude-opus-5-5` | `claude-opus-5-5` |
  | `mix.auto` | `mix.auto` |
  | `v1:12:jetbrains-ai:x` + `v1:99:jetbrains-ai:x` | both keep the full ACP value |

  Mix presets have no scheme and keep their value as the id. Any ACP value
  without `:` is unchanged, and a segment that would be empty keeps the full
  value. When two ACP values would produce the same short id, both keep their
  full ACP value, so two models never collapse into one entry. Selecting either
  form always puts the ACP value on the wire; a durable Junie session record
  stores the ACP value too, and a record written before short ids existed still
  resumes. With a readable catalog, a selection resolves by exact id, then exact
  ACP value, then the single ACP value whose last segment matches; an ambiguous
  or unknown selection fails the turn before anything is sent to Junie, except
  an unknown bare `mix.*` preset, which is passed through. Without a readable
  catalog the selection is passed through and Junie validates it. Observed
  context capacity is keyed by ACP value only.

- Pi tools are exposed through an authenticated loopback MCP server. Calls are
  returned to Pi for execution rather than executed by a second Pi tool loop.
- With a UI, Junie's native tools remain available and permission requests use
  Pi dialogs with Junie's options; dismissal and timeout reject. In headless
  sessions, a Junie `PreToolUse` hook blocks native shell and file mutation
  tools and directs Junie to `pi/bash`, `pi/edit`, and `pi/write` instead;
  native read-only tools remain available. Other native permission requests
  still reject without a UI. Native tool activity is coalesced into display-only
  session entries, never assistant text or LLM history; headless runs omit it.
  On Windows, if the agent-directory path contains cmd metacharacters, batch
  launchers fail closed rather than launching without the hook. Set
  `JUNIE_BRIDGE_LAUNCHER` to the real `junie.exe` to use that path safely.
- After each completed Junie prompt, a display-only line names the real Junie
  model behind Pi's provider model and the cost attributed to that turn, for
  example: `Junie · mix.normal → gpt-6.1-terra (low) · $0.0313`, where the first
  name is the Pi model id (short id, or the full ACP value after a collision)
  and the second is the concrete Junie model reported by local settings. The
  model and
  effort are read best-effort from local `~/.junie/sessions/<ACP sessionId>/`
  `settings.json` after the terminal event, fire and forget: nothing waits for
  that read, so a stalled local file can never delay the next turn, an abort or
  shutdown, and no timer exists to hold the process. The line is emitted only
  while it still belongs to a live session instance that no newer prompt has
  superseded; a cancelled or refused turn, a disposed or closed session, and a
  late read overtaken by the next turn all emit nothing, so display order never
  inverts. The cost is exactly the USD amount
  the bridge attributes to that turn's terminal Pi message from cumulative ACP
  usage updates. Costs of at least `$0.0001` print four decimals; smaller
  positive costs print as `<$0.0001` so a real charge never looks free. The
  effort segment is omitted when Junie reports none, and the cost segment is
  omitted when no cost was attributed to the turn. Missing or
  invalid settings omit the line entirely. It never enters assistant text, LLM
  context or prompts sent back to Junie, and headless runs omit it. These files
  are undocumented: `JUNIE_HOME` overrides the bridge's local-file lookup root
  (it does not configure Junie's own storage location).
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
