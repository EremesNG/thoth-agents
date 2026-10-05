# Pi Subagents Extension

Pi extension for delegating work to markdown-defined subagents. Continuation is unavailable by default: `subagent_continue` is exposed only when effective `enable_continue` is explicitly `true`. The extension registers tools for the orchestrator, runs subagents in isolated in-memory Pi sessions, tracks task history, provides a TUI history panel, and supports per-subagent model/thinking-effort profiles.

Requires Pi `>=0.99.0` and Node `>=22.19.0`; development SDK/TUI dependencies are pinned to `1.0.2`. This fork delegates LLM subagents. Background shell jobs belong to the separate `@thoth-agents/pi-background-tasks` package; its lifecycle passes through by default, and child jobs stop with the child. Existing configuration, model/tool commands, run-mode defaults, and continuation policy are preserved.

## What it provides

- Markdown-defined subagents loaded from global and project directories.
- `subagent_run` for task-mode or background delegation to one agent per call.
- Optional `subagent_continue` for resuming the exact persisted nested session with optional mode/model/effort overrides when `enable_continue: true`.
- `subagent_send_message` for live same-parent steering of owned background tasks on supported Pi runtimes.
- Child-provided `ask_orchestrator` for blocking questions and non-blocking progress, with parent `subagent_reply` (enabled by default for every child unless denied).
- Status/result/list/cancel tools for delegated tasks.
- Isolated in-memory agent sessions for each subagent run.
- Subagent markdown used as system prompt, with delegated task/context as the user prompt.
- Project-scoped task history in a global SQLite data/cache location.
- TUI history panel via `/subagents` or `ctrl+,` by default.
- Task-to-background handoff via `ctrl+h` by default, configurable in `subagents.json`.
- Automatic background completion/failure notifications that start or queue a parent-orchestrator response; no polling is needed just to wait.
- TUI execution rendering can expand/collapse tool and rendered component output with `ctrl+o`, show/hide assistant thinking blocks with `ctrl+t`, and display queued/consumed steering messages in the owning task detail timeline.
- Model profile UI via `/subagents-model`.
- Per-agent/default model and thinking-effort configuration.
- Tool allowlist filtering that prevents subagents from delegating to other subagents.
- Generic subagent-to-parent interaction handoff so human decisions happen on the main thread.

## Install as a Pi package

This fork is an installable Pi package named `@thoth-agents/pi-subagents`,
version `1.0.0`.

Thoth-managed public setup uses this npm source:

```bash
pi install 'npm:@thoth-agents/pi-subagents@>=1.0.0'
```

For local development in this monorepo, use the checkout directly:

```bash
pnpm run setup:pi:local
```

The helper supplies the fork path to Thoth's Pi installer and does not require
publishing the local package to npm. To configure Pi directly, use the same
scoped source and add `-l` to install for one project instead of globally:

```bash
pi install -l 'npm:@thoth-agents/pi-subagents@>=1.0.0'
```

The package manifest exposes:

```json
{
  "pi": {
    "extensions": ["./index.ts"],
    "skills": ["./skills"]
  }
}
```

The npm metadata includes the `pi-package` keyword required for Pi package gallery discovery. After publishing the npm package, it is eligible to appear on the Pi package page.

Use `/reload` after changing extension code, skill files, config, or markdown subagent definitions during an interactive session.

Package installation scope and configuration scope are independent. A globally installed extension can still use project-local `.pi/subagents.json` and `.pi/subagents/*.md`; a project-local package installation does not require every subagent setting to be project-local.

## Subagent definitions

Subagents are markdown files with optional strict YAML frontmatter. Each definition's identity is its filename stem, trimmed and normalized to lowercase. If frontmatter `name` is present, it must match that identity case-insensitively; otherwise loading fails with a diagnostic telling you to rename the file or change `name`.

Load order:

1. Global user agents from `$PI_CODING_AGENT_DIR/agents/*.md`.
2. Global user subagents from `$PI_CODING_AGENT_DIR/subagents/*.md`.
3. Project agents from `.pi/agents/*.md`.
4. Project subagents from `.pi/subagents/*.md`.

Project definitions override global definitions with the same normalized filename identity. Within the same scope, `subagents` definitions override `agents` definitions with that identity and Pi shows a startup warning so the duplicate can be cleaned up. Every failed definition load blocks lower-priority definitions with its filename identity, not a name claimed in invalid frontmatter.

The npm package is the extension runtime only. It does not ship or load subagent definitions from `node_modules/@thoth-agents/pi-subagents/agents`; use the directories above, or run `subagent_list_agents` / `subagent({ action: "list" })` to inspect the definitions Pi actually loaded.

Default global agent directory:

```txt
~/.pi/agent
```

Override with:

```bash
PI_CODING_AGENT_DIR=/path/to/pi-agent-dir
```

### Definition format

Example (`discovery.md`):

```md
---
name: discovery
description: investigates isolated ideas, code, documentation, and context7 before deciding whether deeper design work is needed
tools:
  - read
  - bash
  - context7_status
  - context7_search_library
model: anthropic/claude-sonnet-4-5
effort: low
---

# Discovery Subagent

You are an isolated research executor...
```

Supported frontmatter:

| Field | Description |
|---|---|
| `name` | Optional name; must match the filename stem after trimming and case-insensitive normalization. Identity always comes from the filename. A mismatch fails loading; rename the file to `<name>.md` or change `name`. |
| `description` | Short description shown by `subagent_list_agents`. |
| `tools` | Tool allowlist: a comma-separated inline list or multiline YAML list, never both. Explicit exact-name lists are the recommended default. Manual advanced globs, including `*`, match all registered root tools (active and inactive); exact names also work when root-inactive. The runner then adds enabled `ask_orchestrator`, subtracts `disallowed_tools`, and excludes native `subagent_*` tools. Missing permitted implementations are dropped with a durable warning; launch fails if none remain. Omitted `tools` uses the built-in defaults; an empty definition list uses configured `default_tools`. |
| `disallowed_tools` | Manually configured exact tool names removed after allowlist resolution, for injected tools and trimming glob results. Accepts a comma-separated string or YAML list. Absent, empty string/value, or `[]` means no denial. Globs, non-string items, nested values, and ambiguous declarations fail definition loading with a source diagnostic. Uninstalled denied names are inert and produce no warning. |
| `model` | Optional model as `provider/model-id`. |
| `effort`, `thinking_level`, `thinkingLevel` | Optional thinking effort: `off`, `minimal`, `low`, `medium`, `high`, `xhigh`. |
| `subagent_mode` | Optional default execution mode for this definition: `task` or `background`. |

### Tool allowlist formats

Use an explicit exact-name list by default, and choose exactly one `tools` format per subagent definition.

Comma-separated inline list:

```yaml
tools: read, write, bash
```

Multiline YAML list:

```yaml
tools:
  - read
  - write
  - bash
```

Both examples load the same allowlist: `read`, `write`, and `bash`. Comma splitting applies to `tools` and `disallowed_tools`; scalar fields such as `description` can contain commas without becoming lists.

Every definition's frontmatter must be a strict YAML mapping with unique keys, regardless of whether it declares `disallowed_tools`. Only plain scalars, sequences and mappings are supported: anchors (`&`), aliases (`*`), merge keys (`<<`) and explicit tags (`!`, `!!` or custom tags) anywhere in the frontmatter fail loading with a diagnostic and block same-filename fallback. Quoted strings containing these characters are ordinary text. Quote the wildcard as `tools: "*"` (or `tools: ["*"]`) and quote values containing `: `, such as `description: "worker: x"`. Unquoted `tools: *` and colon-containing plain descriptions are invalid YAML and are not accepted as legacy syntax.

YAML parse errors, duplicate keys, non-mapping/null documents, invalid types for supported fields, name mismatches, malformed `disallowed_tools`, and unreadable files fail definition loading with a source diagnostic and block fallback with the same filename identity. Diagnostics for invalid YAML include quoting guidance. A failed `custom.md` claiming `name: worker` blocks `custom`, not a separate `worker.md`; it cannot act as a worker override. Quoted keys and YAML string escapes are supported; `tools` accepts a comma-separated string or a list of strings.

Globs are manual advanced selections, not the default. Every glob, including `tools: "*"` and `agent_browser_*`, expands at launch against all tools registered in the root session via `getAllTools()` (active and inactive). `*` is an ordinary glob, alone or mixed with exact names; this is broader than the previous active-only behavior. Preserve glob entries when saving or synchronizing rather than expanding them. The removed `@active` selector is rejected with a diagnostic recommending exact names.

The runtime natively excludes only `subagent_*`, for every selection form. Other packages' tools, including `ask_user_question`, `todo` and third-party delegation tools, are selectable unless the definition denies them. Shell-job tools from `@thoth-agents/pi-background-tasks` remain selectable under `*`; its lifecycle passes through by default, and child jobs stop with the child.

With `enable_ask_orchestrator: true` (the default), every child receives the child-provided `ask_orchestrator` unless its `disallowed_tools` denies it. This includes globs (including `*`), explicit lists that omit it, and empty/default selections; even an empty or unavailable root inventory under `*` yields the injected tool alone. Disabled or denied names are removed before SDK registration and verification, never reported as missing implementations. The same effective permitted list controls SDK tools, custom-tool injection and registry verification. An empty effective selection fails launch.

Edit `disallowed_tools` manually in the definition file to deny injected tools or trim glob results. For example, either format removes injected `ask_orchestrator` and ordinary `bash`:

```yaml
disallowed_tools: ask_orchestrator, bash
```

```yaml
disallowed_tools:
  - ask_orchestrator
  - bash
```

Thoth-generated specialists use explicit lists that omit the interactive question tool, task-list tool and third-party delegation tools. Only Oracle declares `disallowed_tools`, denying `ask_orchestrator` to preserve independent judgment. The runtime itself is role-agnostic. Thoth synchronization preserves operator `tools` (including globs) and operator `disallowed_tools`, including an explicit empty denial.

These exclusions are not a sandbox: shell and MCP tools can still launch agents indirectly.

For every selection form—explicit lists and globs (including `*`), alone or mixed—a selected tool without a child-loadable implementation is dropped after session creation, and the child runs with the remaining tools. Dropped names are persisted as `dropped_tools` in task and attempt history and shown as a compact warning on running/queued widget cards and in status, result, and completion notifications; they are never listed in the child prompt. If every selected tool is missing, launch fails with the missing-implementation diagnostic. All selections still reject unexpected extra child tools, and unrelated startup failures remain errors.

Exact names and tools matched by globs reach the child even when inactive in the root. For example, `agent_browser_*` includes root-inactive registered browser capabilities that the child may activate. All selections are checked against the child's registered implementations, rather than requiring every selected tool to be active in the model tool list. Selected `deferred` and `codemode` tools remain callable through Pi's native nested-tool interface. Excluded and prohibited tools are absent from the child's registered inventory.

If the registered inventory is unavailable or a glob matches no registered tool, that glob contributes nothing; exact names and enabled `ask_orchestrator` still apply. There is no fallback to the root's active inventory. Native `subagent_*` controls remain excluded, and `disallowed_tools` applies to every form. Missing child implementations use the same durable warning rules; launch fails only when no permitted implemented tool remains.

Do not mix the formats or declare `tools` more than once:

```yaml
# Invalid: inline and multiline formats are mixed.
tools: read, write
  - bash
```

Invalid definitions are not loaded. On startup or `/reload`, Pi shows a warning with the subagent name, file path, and validation issue. Use either the inline or list format without duplicate keys. The parser accepts frontmatter files with either LF or Windows CRLF line endings.

The markdown body becomes the subagent instructions.

## Project and global config

Choose the narrowest scope that matches the intended behavior:

| Scope | Path | Use it when |
|---|---|---|
| Global defaults | `$PI_CODING_AGENT_DIR/subagents.json`, or `~/.pi/agent/subagents.json` when the environment variable is unset | The setting should apply across projects unless locally overridden. |
| Project-local overrides | `.pi/subagents.json` | This workspace needs different defaults, shortcuts, tools, or profiles. |
| One definition | Frontmatter in the selected global/project Markdown definition | Only that subagent needs `subagent_mode`, or an explicit per-file model/effort override. |

Config resolves as a field-by-field cascade:

`enable_continue` follows the same cascade and defaults to `false`. Because tool exposure is decided when the extension loads, changing `enable_continue` takes effect after `/reload` or a Pi restart.


1. Project `.pi/subagents.json` values win when present.
2. Missing project fields inherit from global `$PI_CODING_AGENT_DIR/subagents.json` or `~/.pi/agent/subagents.json`.
3. Fields missing from both use built-in defaults.

Avoid copying every global value into project config: add only intentional local overrides unless you specifically want to pin inherited values. Changing where the package is installed does not change this cascade.

`model_profiles` follow the selected definition source rather than being merged freely across scopes: project-local definitions use project-local profiles, while global definitions use global profiles. If a project definition overrides a global definition with the same normalized name, the project definition and its project-local profile win.

### Asking an agent to configure Subagents

You can ask the bundled `subagents-configuration` skill for setup or explanation. If your request does not already name a scope, the agent should explain the cascade and ask whether you want:

1. a global default for every project;
2. a project-local override for the current workspace; or
3. a change to one subagent definition only.

The agent should also ask for unresolved behavior choices—such as whether omitted runs default to `task` or `background`—before editing. A question about how configuration works is not authorization to change files, and the agent should not edit both global and project config unless you explicitly request both.

Example requests:

```txt
Explain whether default_mode belongs in global or project config. Do not edit anything.
Set default_mode to background only for this project.
Configure the global reviewer profile, but leave project overrides unchanged.
Give the project-local discovery definition background mode without changing other agents.
```

### Config example

The same JSON shape is valid globally or project-locally; place it only in the scope you intend:

```json
{
  "default_model": "anthropic/claude-sonnet-4-5",
  "default_effort": "medium",
  "default_mode": "background",
  "enable_continue": false,
  "enable_ask_orchestrator": true,
  "ask_timeout_ms": 600000,
  "timeout_ms": 1200000,
  "stall_timeout_ms": 240000,
  "max_concurrency": 5,
  "debug": false,
  "session_resources": "lean",
  "lifecycle_passthrough": [
    "@thoth-agents/pi-claude-bridge",
    "@thoth-agents/pi-antigravity-bridge",
    "@thoth-agents/pi-background-tasks",
    "@thoth-agents/pi-openai-fast"
  ],
  "history_panel_shortcut": "ctrl+,",
  "detail_cancel_shortcut": "x",
  "background_handoff_shortcut": "ctrl+h",
  "default_tools": [
    "read",
    "memory_context",
    "memory_search",
    "memory_recall",
    "memory_get"
  ],
  "model_profiles": {
    "discovery": {
      "model": "anthropic/claude-haiku-4-5",
      "effort": "low"
    }
  }
}
```

### Config fields

| Field | Default | Description |
|---|---:|---|
| `default_model` | current orchestrator model | Fallback model for all subagents. Format: `provider/model-id`. |
| `default_effort` | current orchestrator effort | Fallback thinking effort. Also accepts `default_thinking_level` or `thinkingLevel`. |
| `default_mode` | `background` | Fallback execution mode when neither the invocation nor the selected definition sets one. Accepts `task` or `background`. |
| `enable_continue` | `false` | Opt-in gate for new continuations and `subagent_continue` tool exposure. Project values override global values; changing it requires `/reload` or restart before tool availability changes. |
| `enable_ask_orchestrator` | `true` | Gate for always-on child-provided `ask_orchestrator` (unless denied by that definition) and parent `subagent_reply`. Follows the global/project cascade; `/reload` or restart after changes to update parent tool exposure. |
| `ask_timeout_ms` | `600000` | Positive integer reply timeout per question (10 minutes). Waiting suspends `stall_timeout_ms`, but still counts toward total `timeout_ms`. |
| `model_profiles` | `{}` | Per-agent model/effort overrides scoped to matching definitions. Project-local profiles apply to project-local definitions; global profiles apply to global definitions. |
| `timeout_ms` | `1200000` | Total timeout per subagent task (20 minutes). |
| `stall_timeout_ms` | `240000` | Inactivity timeout for a subagent session (4 minutes). |
| `max_concurrency` | `5` | Max concurrent subagent tasks per cwd/config pair. |
| `debug` | `false` | Enable bounded runtime/interaction diagnostics in the executing project's `.pi/subagents-debug.log`. Use temporarily and disable after diagnosis. |
| `session_resources` | `lean` | SDK resource loading mode. `lean` uses the subagent markdown body as the nested session system prompt, skips skills, prompt templates, themes, and context files, and loads extensions in tools-only/safety-hook mode so allowlisted extension tools remain available without startup context injection. Use explicit `full` only when a subagent intentionally needs the full Pi resource set. Also accepts camelCase `sessionResources`. |
| `lifecycle_passthrough` | `["@thoth-agents/pi-claude-bridge", "@thoth-agents/pi-antigravity-bridge", "@thoth-agents/pi-background-tasks", "@thoth-agents/pi-openai-fast"]` | Trust list: in lean mode, packages with an exact matching nearest `package.json` name retain their full event lifecycle, including startup, shutdown, and model selection. Prompt-shaping events are observe-only as defense in depth, except that a `before_provider_request` return may replace the provider payload (see isolation below); not a sandbox. Project arrays replace global arrays; `[]` disables passthrough. Non-string entries and the adaptive-root package `thoth-agents` are rejected with a warning. |
| `history_panel_shortcut` | `ctrl+,` | Shortcut used to open the subagents history/detail panel. Accepts modified Pi-style shortcuts such as `ctrl+<letter>`, `ctrl+,`, `ctrl+shift+,`, or `shift+alt+,`, and also accepts camelCase `historyPanelShortcut`. |
| `detail_cancel_shortcut` | `x` | Shortcut for the subagents history/detail panel to cancel only the currently selected queued/running subagent. `ctrl+...` values are also registered as a Pi shortcut scoped by the active panel, so they still work when the TUI captures control keys; single-letter values are handled by the panel input. Accepts `ctrl+<letter>`, `ctrl+shift+<letter>`, `ctrl+,`, or one lowercase letter, and also accepts camelCase `detailCancelShortcut`. It is ignored when the panel is not active or the selected subagent is already finished. |
| `background_handoff_shortcut` | `ctrl+h` | Shortcut used to send a running task-mode subagent to the background. Accepts `ctrl+<letter>` and also accepts camelCase `backgroundHandoffShortcut`. |
| `default_tools` | see below | Fallback tool allowlist used by the runner when an agent definition has an empty tool list. Explicit exact-name lists are recommended; supports the same manual globs (including ordinary `*`) over all registered root tools as frontmatter `tools`; all forms drop missing child implementations with a durable warning, failing only if every selected tool is missing. Omitted frontmatter `tools` uses the built-in default list. |

Default tools:

```json
["read", "memory_context", "memory_search", "memory_recall", "memory_get"]
```

The former UI selector `mode: "opencode" | "claude"` is no longer a supported config field. Do not add it. History/background visibility and task-to-background handoff are available together and are configured independently through their shortcut fields.

Subagent delegation tools are always blocked from subagent tool allowlists, even if listed:

```txt
subagent_run
subagent_list_agents
subagent_status
subagent_result
subagent_list_tasks
subagent_cancel
any tool starting with subagent_
```

## Model profile resolution

Effective model resolution order:

1. `model_profiles[agent].model` from the config matching the selected definition scope: project-local for project definitions, global for global definitions
2. subagent frontmatter `model`
3. `default_model`
4. current orchestrator model
5. unresolved

Effective effort resolution order:

1. `model_profiles[agent].effort` from the config matching the selected definition scope: project-local for project definitions, global for global definitions
2. subagent frontmatter `effort` / `thinking_level` / `thinkingLevel`
3. `default_effort`
4. current orchestrator thinking level
5. unresolved

If a configured model cannot be resolved, the runner reports an error. If a selected model fails or stalls and the current orchestrator model is different, the runner falls back to the current model.

## Debug and interaction bridge logs

Debug logging is disabled by default. Enable it in global or project `subagents.json`:

```json
{
  "debug": true
}
```

When enabled, subagents write local debug/audit breadcrumbs to the executing project's `.pi` directory:

```txt
.pi/subagents-debug.log
```

The log is intended for runtime debugging of delegated sessions and generic interaction handoff issues. Interaction bridge entries include safe metadata such as task id, agent name, request id, kind, requester, prompt presence, and payload presence. They intentionally avoid storing raw private data beyond the bounded task/history surfaces already captured for debugging.

Useful event names:

- `runner_event` — compact SDK event shape observed by the subagent runner.
- `interaction_bridge_payload_detected` — runner found a structured interaction request.
- `interaction_bridge_payload_recovered_from_channel` — runner recovered a request from the shared interaction channel.
- `interaction_bridge_request_detected` — manager received an interaction request from the runner.
- `interaction_bridge_prompt_main_thread` — manager is prompting the main user.
- `interaction_bridge_user_response` — main user response was published for the subagent to consume.

## Tools exposed to the orchestrator

| Tool | Purpose |
|---|---|
| `subagent_list_agents` | List loaded markdown-defined subagents. |
| `subagent_run` | Delegate a task to exactly one subagent. Supports `task` and `background` mode. |
| `subagent_continue` | Enabled only when `enable_continue: true`. Resumes a completed, failed, or cancelled task in the same persisted nested Pi session, with an optional continuation-mode override. |
| `subagent_status` | Get status for a delegated task. |
| `subagent_send_message` | Queue a live message for an owned running background task. |
| `subagent_reply` | When `enable_ask_orchestrator: true`, answer an outstanding child question owned by the current parent Pi session. |
| `subagent_result` | Read the result for a delegated task. |
| `subagent_list_tasks` | List active and persisted delegated tasks for the current cwd. |
| `subagent_cancel` | Cancel a running delegated task. |

Only the main orchestrator should call these tools. Subagents are explicitly prevented from calling `subagent_*` tools.

Delegation controls use Pi's `model-only` exposure: they remain active for the orchestrator's model, while native `executeTool` and codemode cannot invoke them.

### `subagent_run`

Parameters:

```ts
{
  agent: string;
  task: string;
  context?: string;
  mode?: "task" | "background";
}
```

Behavior:

- Invocation mode stays optional. Effective resolution is `input.mode ?? definition.subagent_mode ?? config.default_mode ?? "background"`. An explicit `mode: "task"` remains effective when the user asks to wait.
- `mode: "task"` waits for completion and returns compact task summaries.
- `mode: "background"` returns task IDs immediately. Respond to the user and wait for the automatic completion/failure turn; do not sleep, poll status, or fetch results just to wait. Use status/result tools only when you explicitly need an intermediate status or stored result.
- Batch input is intentionally unsupported: call `subagent_run` once per subagent so each delegation has an isolated lifecycle, result, and failure surface.
- Double Escape during task-mode execution cancels running subagents and aborts the main turn.

Examples:

```ts
// Omitted mode: use the selected definition or config; otherwise background.
{ agent: "analyst", task: "review the plan" }

// Explicit request to wait: task mode is preserved.
{ agent: "reviewer", task: "review the plan", mode: "task" }
```

### `subagent_continue`

`subagent_continue` is disabled by default. Set effective `enable_continue: true` and then `/reload` or restart Pi before expecting the tool to appear.

When effective `enable_continue` is `false`, the tool is not registered, direct or stale continuation attempts receive a generic unavailable response, historical task and continuation records remain visible, and failed/cancelled/interrupted/stopping terminal results plus terminal background notifications do not recommend continuation or mention `subagent_continue`.

Parameters:

```ts
{
  task_id: string;
  prompt: string;
  mode?: "task" | "background";
  model?: string;
  effort?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
}
```

Behavior:

- Continuations keep the same `task_id` and exact persisted nested Pi session.
- New continuations and continuation guidance are available only while the task cwd resolves `enable_continue: true`.
- Effective continuation mode resolves once as `input.mode ?? previous_task.effective_mode ?? previous_task.mode ?? config.default_mode ?? "background"`.
- `mode: "task"` waits, renders `(task)`, and remains eligible for manual `ctrl+h` handoff.
- `mode: "background"` returns immediately, renders `(background)`, and relies on the automatic completion notification.
- While background tasks are active, an `Agents` widget appears above the input displaying up to 3 compact active subagent cards with distinct card boundaries and theme hierarchy. Running cards use an animated braille indicator and show the agent, resolved model, and a concise task summary (avoiding raw prompt clutter in the identity row). Compact telemetry rows keep tool uses, lifetime tokens, context percentage, task-average output speed (`N tok/s`), and elapsed time readable even when narrow; activity and compactions also appear when available. Output speed sits between context and elapsed and divides accumulated assistant output tokens by measured assistant generation time, excluding tool execution and compaction. Its counters persist across continuations; unavailable or legacy timing shows `?`, never an invented rate. Token totals include input, output, and cache writes, excluding repeated cache reads. Unavailable metrics show `?`, while measured zeroes remain visible. When more than 3 active agents run, a selectable overflow footer reports the count of additional active subagents and opens the full `/subagents` history panel on Enter. Queued tasks use a hollow dot and appear as a grouped count. Running cards and the grouped queue show a compact dropped-tools warning when present; terminal tasks leave the widget, with the warning retained in status, result, and completion. Header keyboard hints adapt to terminal width and are discoverable initially. With the root editor focused and empty, use the arrow keys and Enter to open a selected task or the overflow footer, or return to the editor with Escape. Widget navigation never consumes keys while an overlay, native dialog, other custom UI, or Thoth panel holds input; existing navigation exits when editor focus is lost. At session start the widget wraps the configured editor factory (or Pi's default editor), preserving editor behavior and keybindings. If another extension replaces or reinstalls that editor later, navigation fails closed with one visible warning until the next session start.
- When `mode` is omitted, the continuation preserves the previous task attempt's effective mode. Legacy records without a valid saved mode fall back through `default_mode` and then `background`.
- Model and effort overrides still require an explicit user decision before use.

### `subagent_send_message`

Use `subagent_send_message` only for a running background task owned by the exact originating parent session. Successful enqueue is not delivery.

```ts
{ task_id: "subtask_reviewer_...", message: "Please include the missing constraint." }
```

Successful response:

```json
{
  "status": "queued",
  "task_id": "subtask_reviewer_...",
  "pending_message_count": 1,
  "message": "Message accepted into the steering queue; this does not prove model consumption."
}
```

Rejected ownership/runtime examples:

```json
{
  "status": "rejected",
  "reason": "not_owner",
  "message": "Only the exact originating parent Pi session may message this live background task."
}
```

```json
{
  "status": "rejected",
  "reason": "unsupported_runtime",
  "required_pi_version": ">=0.99.0",
  "detected_pi_version": "0.98.0",
  "message": "Live background messaging requires Pi runtime >=0.99.0; detected 0.98.0."
}
```

Live-message requirements, visibility, and lifecycle:

- Live steering requires Pi runtime `>=0.99.0` and an available nested SDK `session.steer(...)` bridge. Compatibility is detected from the Pi SDK version already loaded by the runner; known old or unknown runtimes fail closed.
- Ownership is exact: only the parent Pi session that launched the currently running background attempt can send to it. Continuations rebind ownership to the parent session that starts that attempt.
- A same-parent message may be accepted before the nested steering bridge is ready. It remains in a bounded pending queue and is forwarded exactly once when readiness is established.
- `status: "queued"` proves queue acceptance, not model consumption. The owning `/subagents` task detail timeline renders each message chronologically as queued and then consumed when the SDK confirms consumption, including FIFO handling of identical message text.
- When the bridge is ready, the tool awaits Pi's asynchronous steering acknowledgment. `status: "handled"` means an input extension handled the message, clears its pending delivery expectation, and does not prove model consumption. A native rejection returns `status: "rejected"` with `reason: "enqueue_failed"` and removes that message's pending entry. Pre-ready acceptance remains queued until the bridge forwards it; a later failure contributes to the terminal undelivered count.
- Active `subagent_status` surfaces `pending_message_count`. Terminal `subagent_result` and completion notifications surface `undelivered_message_count`, including `0`.
- Pending queue entries are discarded on completion, cancellation, shutdown, restart, or continuation; they are not replayed into a new attempt.
- Message text is private to the owning task detail timeline and persisted task-detail snapshot. Lists, widgets, completion notifications, result summaries, logs, and unrelated parent sessions expose only safe counts/metadata.
- Live task-mode rendering shows the latest three safe activity labels; live background rendering shows one current activity only.

### `subagent_reply`

```ts
{ task_id: "subtask_analyst_...", request_id: "question-uuid", message: "Keep runtime scope only." }
```

Only the exact originating parent Pi session may reply. `request_id` may be omitted only when that task has exactly one pending question. Unknown tasks, unknown/stale requests, ambiguous replies, unavailable caller identity, foreign sessions, and empty replies return clear errors without consuming a question. A successful reply resolves that child tool call with the reply text; it is not a steering message or a new child session.

Questions arrive as automated `subagent-question` messages with task id, agent, UUID request id, and question text. They trigger a parent turn using follow-up delivery, like completion notifications. They are subagent input, **not user messages or user authorization**. The orchestrator may ask the human a material decision with its own user-question tool before answering through `subagent_reply`.

## Tool exposed only to selected children

### `ask_orchestrator`

```ts
{ kind: "question", message: "Does the approved scope include a migration?" }
{ kind: "progress", message: "Discovery complete; implementation is underway." }
```

- The tool is injected in-process for every child when `enable_ask_orchestrator` is true unless denied by `disallowed_tools`, regardless of `tools` selection; it is not registered for the root.
- `question` blocks until the parent replies, and the child may ask repeatedly in the same live session. Replies are correlated by task id and UUID request id.
- Each question rejects on `ask_timeout_ms` expiry, task cancellation, or session shutdown. Waiting suspends stall inactivity (`stall_timeout_ms`); the inactivity budget resumes after the last pending question ends. Total `timeout_ms` continues, so long human escalation can still exhaust the task's total budget.
- `progress` returns immediately and keeps the latest five `progress_updates` on the task; it never injects a parent message or triggers a turn. The widget shows the latest progress update.
- `subagent_status` and `subagent_list_tasks` expose `pending_question_count`, `pending_questions` (`request_id`, `message`, `created_at`), and recent `progress_updates` in compact details and text. Pending questions are live-only and cannot be answered after the parent session ends.
- Use questions for material alignment or decisions, not as a substitute for the child's own discovery, and never to delegate. This channel does not change the separate human interaction bridge described below.

## Commands and shortcuts

| Entry point | Description |
|---|---|
| `/subagents` | Open the session-focused TUI subagent history panel. |
| `/subagents-model` | Configure model profiles for global or project subagent definitions. |
| `ctrl+,` | Open the TUI subagent history panel by default. Configurable via `history_panel_shortcut` in `subagents.json`. |
| `x` | Cancel the currently selected queued/running subagent from the open history/detail panel by default. Configurable via `detail_cancel_shortcut` in `subagents.json`. |
| `ctrl+h` | Send the running task-mode subagent task to the background by default. Configurable via `background_handoff_shortcut` in `subagents.json`. |
| `ctrl+o` | Expand or collapse rendered tool output and subagent responses in the active execution/detail view. |
| `ctrl+t` | Show or hide assistant thinking blocks in the open subagent execution panel, using Pi's `app.thinking.toggle` keybinding. |

`/subagents-model` writes profile changes to the config that matches each selected definition: project-local subagents write to `.pi/subagents.json`, while global subagents write to `~/.pi/agent/subagents.json` or `$PI_CODING_AGENT_DIR/subagents.json` when `PI_CODING_AGENT_DIR` is set.

In non-TUI environments, edit `model_profiles` manually in the matching local or global JSON file.

## Task history

Task history is stored in a global data/cache location, while each row remains scoped by project `cwd`:

```txt
$XDG_DATA_HOME/pi/subagents/subagents-history.sqlite
```

Fallback:

```txt
~/.local/share/pi/subagents/subagents-history.sqlite
```

Environment overrides:

```bash
PI_SUBAGENTS_HISTORY_DB_PATH=/absolute/path/to/subagents-history.sqlite
PI_SUBAGENTS_HISTORY_HOME=/absolute/path/to/subagents-history-home
```

The history DB stores:

- task metadata;
- status and timestamps;
- model/effort used;
- usage stats when available;
- result/error/output preview;
- delegated user prompt and subagent system prompt separately;
- compact thread snapshots;
- task events.

When `debug: true` is configured, the extension also may write debug diagnostics to:

```txt
.pi/subagents-debug.log
```

History and debug logging are best-effort: failures to persist them should not break delegation.

## Generic interaction handling

Subagents run in isolated sessions, but any human interaction must happen on the main thread. The extension uses one generic protocol for all such cases.

A subagent-side tool or extension can publish or return an interaction request:

```json
{
  "type": "interaction_required",
  "requestId": "req-123",
  "kind": "operator-decision",
  "origin": "subagent",
  "requester": { "subagentName": "analyst", "taskId": "subtask_..." },
  "prompt": {
    "title": "Choose strategy",
    "message": "How should the subagent continue?",
    "choices": ["safe", "fast"]
  },
  "payload": { "any": "structured data needed to answer" },
  "response": { "expected": "choice" }
}
```

The parent manager surfaces the request to the main thread, collects a response with `select`, `confirm`, `input`, or `editor`, publishes:

```json
{
  "type": "interaction_response",
  "requestId": "req-123",
  "status": "answered",
  "value": "safe"
}
```

Then the subagent is retried so the subagent-side tool/extension can consume the response and continue. For unknown or rich interaction kinds, the parent falls back to an editor with the request payload so the user can return arbitrary text or JSON.

Background subagent tasks cannot request interactive main-thread handling. Rerun in `task` mode if human interaction is needed.

## Prompt and memory behavior

In the default `lean` mode, the runner treats the subagent markdown body as the nested session system prompt. The delegated user prompt contains only the orchestrator-provided context and task. The runner does not inject `AGENTS.md`, workflow skills, memory startup context, or generated memory constraints into the delegated user prompt.

In lean mode, non-listed extensions keep tools/safety-hook isolation: selected extension tools and tool-safety hooks (`tool_call`, `tool_result`, and `user_bash`) remain available; other handlers are stripped, except `session_shutdown` for load-time provider owners. Packages in `lifecycle_passthrough` retain **all event handlers**, including `session_start`, `session_shutdown`, and `model_select`. Child startup (`reason: "startup"`) is awaited after parent provider replay and tool-selection verification, before the first prompt. Startup handler errors are non-fatal task-history diagnostics. Teardown emits shutdown once per child before disposal, including failure, cancellation, timeout, and verification failure (where startup has not yet run); generic cleanup remains best-effort with a five-second bound. The listed background-task fork runs its shutdown handlers once first, using the public child context and an independent ten-second bound per handler, so a stalled handler in another package cannot skip child-job cleanup before disposal.

For listed packages, `before_agent_start`, `agent_start`, `turn_start`, `context`, `context_with_system`, `input`, `before_provider_request`, and `before_provider_headers` are observe-only: each invocation receives its own clone of event data, with opaque live members such as `AbortSignal` and functions passed through, unchanged context, and its awaited return discarded, except `before_provider_request`: its handler still receives a clone, but a non-`undefined` return replaces the provider payload (this is how `@thoth-agents/pi-openai-fast` sends `service_tier: "priority"` in children). All other events pass unchanged. This is defense in depth, **not a sandbox**: the list trusts packages with the child's live `SessionManager` and Pi API. A listed extension can still change the child session or prompt through those APIs. Do not list untrusted extensions. The adaptive-root injector package `thoth-agents` can never receive passthrough and is rejected with a config warning.

Package identity uses the nearest manifest of the real extension file, stops at the first manifest, and fails closed on missing, unreadable, or invalid manifests. Commands, flags, and shortcuts remain stripped in lean mode; full resource mode is unchanged.

The default list contains `@thoth-agents/pi-claude-bridge`, `@thoth-agents/pi-antigravity-bridge`, `@thoth-agents/pi-background-tasks`, and `@thoth-agents/pi-openai-fast`; explicit `[]` disables it, and a project array replaces the global array. These listed packages receive their full lifecycle in lean children. Use `@thoth-agents/pi-background-tasks` for shell jobs: child jobs stop on completion, cancellation, error, or parent-driven teardown (including root reload), without stopping sibling or root jobs. Explicit trust lists must include the fork to retain this cleanup; passthrough is not a sandbox. An Antigravity child starts its Pi-tool MCP bridge lazily when using an `antigravity` model (at startup, model selection, or before its first provider stream), with private per-instance discovery by default. Children that never use Antigravity do not start a bridge or spawn agy.

Memory behavior should be specified in each subagent markdown definition. A subagent can use memory only when its tool allowlist includes the relevant memory tools.

Context7 access is controlled by each subagent definition's tool allowlist. Grant external documentation tools only to agents that need them.

## Bundled resources

This package bundles:

- `index.ts` and `src/**` — the Pi extension runtime.
- `skills/subagents-configuration/SKILL.md` — configuration guidance for agents that need to explain, create, or edit subagent definitions and global/project settings. It requires explicit scope selection and unresolved behavior decisions before edits.

Subagent definitions are intentionally user/project configuration, not hard-coded package behavior. Add them globally in `$PI_CODING_AGENT_DIR/agents/*.md` or `$PI_CODING_AGENT_DIR/subagents/*.md`, or project-locally in `.pi/agents/*.md` or `.pi/subagents/*.md`. Do not inspect `node_modules/@thoth-agents/pi-subagents/agents` for definitions; that path is not part of the package design and may not exist.

## Development

This package is a member of the thoth-agents pnpm workspace; the root `pnpm-lock.yaml` pins the development Pi SDK and TUI to `1.0.2`. Run focused native SDK and renderer checks with `0.99.0` as well, then restore the locked tree with `pnpm install --frozen-lockfile` from the repository root before final validation.

Install dependencies once, from the repository root:

```bash
pnpm install
```

Run tests:

```bash
pnpm --filter @thoth-agents/pi-subagents run test
```

Run typecheck:

```bash
pnpm --filter @thoth-agents/pi-subagents run typecheck
```

Verify the package contents:

```bash
pnpm --filter @thoth-agents/pi-subagents run pack:dry-run
```

Run the full local check:

```bash
pnpm --filter @thoth-agents/pi-subagents run check
```

## Related project docs

- `README.md` — package usage, configuration, and development notes.
- `skills/subagents-configuration/SKILL.md` — subagent configuration policy.
- Pi package docs — `docs/packages.md` in the Pi coding-agent distribution.
