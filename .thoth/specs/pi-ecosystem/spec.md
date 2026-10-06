# Pi Ecosystem Specification

## Purpose

Durable behavior for pi-ecosystem.

## Requirements

### Requirement: Shared Pi ecosystem contract package

`@thoth-agents/pi-core` MUST define the name, version and payload type of every cross-package Thoth Pi channel introduced through it (the pre-existing subagent-usage channels owned by pi-subagents are exempt until a separately authorized migration), MUST wrap payloads in an envelope carrying version, source package, session ID, timestamp and data, and its subscribe helper MUST ignore payloads with an unsupported version, foreign session filter mismatch or invalid shape instead of throwing; producers MUST publish complete snapshots after each state change and in answer to a request for their session.

#### Scenario: Shared Pi ecosystem contract package

- **GIVEN** a producer and a consumer using pi-core in one Pi session
- **WHEN** the consumer subscribes and then requests the snapshot
- **THEN** it receives the current full snapshot for its session and later snapshots after each change, while malformed or other-version payloads are ignored

### Requirement: Thoth Pi task-list extension

The Thoth Pi task-list package (published under the `@thoth-agents` scope as a fork of the juicesharp rpiv 2.12.0 task-list package) MUST register the session task-list tool with the upstream 2.12.0 schema and transition rules, MUST reconstruct the session list from the branch on session start, tree navigation and compaction, MUST publish its full session snapshot on the pi-core task-list state channel after each change and in answer to a request, MUST add the open tasks to the model context before each agent start when any exist using an API detected at runtime that degrades without failing on the minimum supported Pi, and MUST show only the current session's list through its pi-core work-panel section.

#### Scenario: Thoth Pi task-list extension

- **GIVEN** a session with open tasks in the task-list tool
- **WHEN** the session is compacted and the agent starts again
- **THEN** the list is reconstructed, the open tasks are present in the model context and the work-panel Todos section, and a fresh state snapshot is published on the pi-core task-list state channel 

### Requirement: Thoth Pi render kit

`@thoth-agents/pi-core` MUST define a versioned render-kit contract and a process-wide registry for it; `@thoth-agents/pi-thoth-theme` MUST implement and register that kit for its own session while its tool styling is enabled and MUST withdraw only its own registration; first-party Pi packages MUST look up the kit at render time for their tool calls, tool results, custom messages and above-editor widgets, MUST keep a render shell that does not depend on kit availability, MUST render through the kit when present, MUST render native output equivalent to the Pi default tool shell without nested frames when it is absent, and MUST NOT depend on the theme package.

#### Scenario: Thoth Pi render kit

- **GIVEN** a Pi session with the theme and a first-party producer
- **WHEN** a producer tool, message or widget renders with the theme active and again with the theme absent
- **THEN** it shows the theme frame and roles in the first case and native unframed output in the second, regardless of extension load order

### Requirement: Antigravity bridge terminal stream guarantee

Every Antigravity bridge provider stream MUST end with exactly one terminal event (stop, toolUse or error), MUST fail with an explicit error instead of waiting silently beyond its configured startup, queue and inactivity bounds (disabled caps stay disabled), and MUST deliver the final outcome of an agy turn that settled while a replay round trip was outstanding to the matching continuation call.

#### Scenario: Antigravity bridge terminal stream guarantee

- **GIVEN** an Antigravity-backed Pi turn
- **WHEN** the driver task throws, an internal wait exceeds its bound, or agy settles during a outstanding replay
- **THEN** the stream ends once with an explicit error or the retained final response, and the next call is not blocked

### Requirement: Subagent stall diagnostics

A pi-subagents stall failure MUST report time since the last session event, the last event type, active tracked tools with their idle time, whether the agent settled after its last start, and outstanding orchestrator questions; the agent-settled status MUST NOT be presented as success and the orchestrator-response heading MUST be shown only for completed tasks.

#### Scenario: Subagent stall diagnostics

- **GIVEN** a child whose prompt does not resolve after it emitted agent_settled
- **WHEN** the stall watchdog fires
- **THEN** the structured error contains those diagnostics, the settled status is shown neutrally, and the result heading marks any text as partial

### Requirement: Claude bridge keeps appended instructions current

`@thoth-agents/pi-claude-bridge` MUST, for a resumed Claude Code session within one recording epoch, deliver through Claude Code's conversation-context channel the appended system instructions that changed since the latest ones the model has been given (including a return to the recorded value or an empty value) as the added, changed and removed top-level blocks labeled as superseding the same blocks of earlier versions, falling back to the full current appended instructions when blocks cannot be identified unambiguously, MUST keep every delivered context value within Claude Code's inline limit by splitting larger updates, MUST deliver nothing extra when they are unchanged, and MUST NOT disable Claude Code system prompt recording or replace the recorded system prompt.

#### Scenario: Claude bridge keeps appended instructions current

- **GIVEN** a resumed Claude Code session whose large appended instructions changed in one small block after it started
- **WHEN** the next prompt runs through the bridge
- **THEN** the model receives that changed block inline in its context, unchanged blocks are not resent, and the recorded system prompt and its cache prefix stay unchanged

### Requirement: Render kit output reuse

First-party Pi transcript tool-call, tool-result and custom-message renderers whose inputs are fixed at component creation and that render through the Thoth render kit MUST reuse their rendered lines for repeated renders at the same width while the same kit remains registered, and MUST recompute after `invalidate()`, a width change, or a kit change, without altering rendered output; live above-editor widgets and overlays are excluded.

#### Scenario: Render kit output reuse

- **GIVEN** a completed kit-rendered transcript tool or message card
- **WHEN** the host renders it repeatedly at the same width with the same registered kit
- **THEN** the card body is built once and identical lines are returned until invalidation, a width change, or a kit change

### Requirement: Thoth Pi tool definition registry

`@thoth-agents/pi-core` MUST provide a process-wide registry where first-party Pi packages publish the tool definitions they register, returning a per-instance handle, resolving a tool name to its most recent live publication, and letting a handle withdraw only its own entries; first-party packages that register tools MUST publish them only from interactive sessions with a UI and withdraw them on session shutdown.

#### Scenario: Thoth Pi tool definition registry

- **GIVEN** a first-party package registered a tool with Pi
- **WHEN** another first-party package looks the tool up by name in the registry
- **THEN** it receives the full definition including its renderers without re-evaluating the owning extension

### Requirement: Subagent viewer tool rendering

The subagents thread viewer MUST resolve tool definitions from the tool definition registry before re-evaluating any extension source; when a render kit is registered it MUST NOT re-evaluate extension sources and MUST render tool calls and results through the kit's tool-renderer resolution when the kit provides it, following the theme's respected-package ownership for tools whose definitions are cheaply available and using the generic kit card otherwise; when no kit is registered it MUST keep native rendering.

#### Scenario: Subagent viewer tool rendering

- **GIVEN** a render kit is registered and a subagent used a tool from an already-loaded extension
- **WHEN** the user opens that subagent in the viewer
- **THEN** the tool card renders through the kit without re-evaluating the extension source

### Requirement: Render kit result borders

Themed tool and notification cards that render through the Thoth render kit or the theme's tool renderers and draw an error-colored border for failed results MUST draw the theme `success` color for affirmative terminal success, the theme `error` color wherever an error border is drawn today (including cancellation where it is red), except that the still-running shell/generic rule in the next sentence takes precedence over this error-color rule, and the theme `accent` color for every other non-error state, consistently across every part of the same card. A shell or generic tool card (bash, PowerShell, generic renderer) that is still running, even with partial output or a partial error flag, MUST show the running form of the standard tool status footer and the `accent` border until it finishes, and only completion changes its footer (to the terminal form of the standard tool status footer, whose summary carries the exit code for shells) and border; in the subagents thread viewer, tool items that are still running MUST be rendered as running, with or without a kit. Cards without a result-driven error border are unchanged.

#### Scenario: Render kit result borders

- **GIVEN** a themed bash card that has already produced output
- **WHEN** it is still running and then completes
- **THEN** it shows the standard running footer and the accent border while running, and after completion the standard terminal footer with `✓` and the success border for exit code 0 or `✗` and the error border for a failure

### Requirement: Claude bridge projects Pi prompt sections

`@thoth-agents/pi-claude-bridge` MUST project the content of every Pi `systemPromptOptions.sections` entry that Pi would render into the prompt sent to Claude Code exactly once, applying built-in slot overrides as Pi does and rendering other sections in Pi's tag-wrapped form.

#### Scenario: Claude bridge projects Pi prompt sections

- **GIVEN** a Pi extension sets a non-built-in prompt section with a truthy value
- **WHEN** the bridge sends that turn to Claude Code
- **THEN** the appended system prompt contains that section exactly once in Pi's tag-wrapped form

### Requirement: Claude bridge discloses MCP tool names

`@thoth-agents/pi-claude-bridge` MUST, when it serves Pi tools over its MCP server, tell the model that plain Pi tool names in instructions refer to the prefixed MCP tools.

#### Scenario: Claude bridge discloses MCP tool names

- **GIVEN** Pi tools are served as `mcp__custom-tools__<name>`
- **WHEN** the bridge projects the system prompt
- **THEN** the prompt states that a plain name `X` refers to `mcp__custom-tools__X`

### Requirement: Standard tool status footer

`@thoth-agents/pi-core` MUST define a render-kit contract that produces the tool card status footer from a status and the tool render context, with a plain-text fallback when no kit is registered; `@thoth-agents/pi-thoth-theme` MUST implement it so that every running first-party tool card (theme built-ins and kit producers) shows the animated pyramid frame and elapsed time, and every finished tool card shows `✓` or `✗`, the elapsed time and the tool's optional summary.

#### Scenario: Standard tool status footer

- **GIVEN** a themed read, bash or subagent tool card
- **WHEN** it is running and then finishes
- **THEN** its footer shows `<pyramid frame> · <elapsed>` while running and `✓ · <elapsed>[ · summary]` or `✗ · <elapsed>[ · summary]` after finishing

### Requirement: Thoth Pi work panel

`@thoth-agents/pi-core` MUST define a versioned work-panel contract with a process-wide provider registry; first-party packages that show live work above the editor (subagents, task list, background tasks) MUST register sections through it instead of installing their own above-editor widgets or panel navigation handlers; the host MUST install exactly one panel widget and one panel input listener per UI session, MUST render compact sections with one heading and counter each, one line per item, a total height budget with exact `+N more` overflow counts, and semantic theme roles for status glyphs, names, secondary text and metrics, MUST keep a single selection, MUST be focused with ← only from an empty, focused root editor with no overlay or dialog open and released with Esc, MUST leave unfocused ↑/↓ to the editor, MUST end the panel with a hint row listing only the actions available for the selected item, MUST let a provider with a custom open action show its own UI and otherwise show item details in a framed opaque card of stable size whose ↑/↓ stays within the opened section, MUST close that card only when another UI actually takes focus, and MUST expose a read-only focus-guard query so other key handlers in those packages consume nothing outside the focused root editor.

#### Scenario: Thoth Pi work panel

- **GIVEN** subagents, todos and background tasks active in one Pi session
- **WHEN** the user presses ← on an empty editor, moves with ↑↓ across sections, opens a task-list item's detail, moves with ↑↓, a question dialog then opens, and the user presses Esc
- **THEN** one panel with one cursor traverses all items, the detail card keeps its size and stays in the Todos section, the card closes when the dialog opens so Esc acts on the dialog, and unfocused ↑ recalls prompt history 
