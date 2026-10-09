# Pi Ecosystem Specification

## Purpose

Durable behavior for pi-ecosystem.

## Requirements

### Requirement: Shared Pi ecosystem contract package

`@thoth-agents/pi-core` MUST define the name, version and payload type of every cross-package Thoth Pi channel introduced through it, including subagent usage, MUST wrap payloads in an envelope carrying version, source package, session ID, timestamp and data, and its subscribe helper MUST ignore payloads with an unsupported version, foreign session filter mismatch or invalid shape instead of throwing; producers MUST publish complete snapshots after each state change and in answer to a request for their session.

#### Scenario: Shared Pi ecosystem contract package

- **GIVEN** a producer and a consumer using pi-core in one Pi session
- **WHEN** the consumer subscribes and then requests the snapshot
- **THEN** it receives the current full snapshot for its session and later snapshots after each change, while malformed or other-version payloads are ignored

### Requirement: Thoth Pi task-list extension

The Thoth Pi task-list package (published under the `@thoth-agents` scope as a fork of the juicesharp rpiv 2.12.0 task-list package) MUST register the session task-list tool with the upstream 2.12.0 schema and transition rules, MUST reconstruct the session list from the branch on session start, tree navigation and compaction, MUST publish its full session snapshot on the pi-core task-list state channel after each change and in answer to a request, MUST add the open tasks to the model context before each agent start when any exist using an API detected at runtime that degrades without failing on the minimum supported Pi, and MUST show only the current session's list through its pi-core work-panel section; that Todos section MUST list the current list with completed tasks marked and a done/total counter, dropping completed tasks first on overflow with an exact `+N done` line; Enter on any Todos row, heading or summary line and the `/todos` command when custom UI is available MUST open one panel built on the pi-core history panel shell with the full current list grouped by status, while `/todos` without custom UI keeps its text output; once every task is completed the list MUST remain shown until the next recognized prompt epoch and then disappear from the section and panel without altering task state.

#### Scenario: Thoth Pi task-list extension

- **GIVEN** a session list with 3 of 7 tasks completed that is later compacted
- **WHEN** the agent starts again and the user selects the Todos `+N done` line or runs `/todos`
- **THEN** the list is reconstructed, the open tasks are present in the model context, a fresh state snapshot is published on the pi-core task-list state channel, and a panel lists all seven tasks grouped by status with a `3/7 completed` header

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

Themed tool and notification cards that render through the Thoth render kit or the theme tool renderers and draw an error-colored border for failed results MUST draw the theme `success` color for affirmative terminal success, the theme `error` color wherever an error border is drawn today (including cancellation where it is red), except that the still-running shell/generic rule in the next sentence takes precedence over this error-color rule, and the theme `accent` color for every other non-error state, consistently across every part of the same card. A shell or generic tool card (bash, PowerShell, generic renderer) that is still running, even with partial output or a partial error flag, MUST show the running form of the standard tool status footer and the `accent` border until it finishes, and only completion changes its footer (to the terminal form of the standard tool status footer, whose summary carries the exit code for shells) and border; in the subagents thread viewer, tool items that are still running MUST be rendered as running, with or without a kit. Cards without a result-driven error border are unchanged.

#### Scenario: Render kit result borders

- **GIVEN** a themed bash card that has already produced output
- **WHEN** it is still running and then completes
- **THEN** it shows the standard running footer and the accent border while running, and after completion the standard terminal footer with the completed status icon and the success border for exit code 0 or the failed status icon and the error border for a failure

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

`@thoth-agents/pi-core` MUST define a render-kit contract that produces the tool card status footer from a status and the tool render context, with a plain-text fallback when no kit is registered; `@thoth-agents/pi-thoth-theme` MUST implement it so that every running first-party tool card (theme built-ins and kit producers) shows the theme working animation frame for the configured icon mode and elapsed time, and every finished tool card shows the theme completed or failed status icon for the configured icon mode, the elapsed time and the tool optional summary.

#### Scenario: Standard tool status footer

- **GIVEN** a themed read, bash or subagent tool card with Nerd icons
- **WHEN** it is running and then finishes
- **THEN** its footer shows `<pyramid frame> · <elapsed>` while running and `<completed icon> · <elapsed>[ · summary]` or `<failed icon> · <elapsed>[ · summary]` after finishing, and in ASCII mode the ASCII frame, separator and status icons

### Requirement: Thoth Pi question tool

The `@thoth-agents/pi-questions-user` package MUST register `ask_user_question` with stable question ids, `single`/`multi`/`text`/`confirm` types, structured `recommended` options, optional previews and no declared maximum on questions or options; MUST return per-id structured answers with status, values, labels, custom text and notes, and report cancellation without implying answers; MUST fall back to sequential select/input without custom UI and return `no_ui` without UI; its TUI MUST show the preview beside the options on wide terminals and below them on narrow ones, and offer a review step before submitting multiple questions.

#### Scenario: Thoth Pi question tool

- **GIVEN** a root session with the TUI
- **WHEN** the model asks two questions with option previews on a wide terminal
- **THEN** previews render to the right of the options, a review step precedes submission and the result lists each answer by question id

### Requirement: Thoth Pi work panel

`@thoth-agents/pi-core` MUST define a versioned work-panel contract with a process-wide provider registry; first-party packages that show live work above the editor (subagents, task list, background tasks) MUST register sections through it instead of installing their own above-editor widgets or panel navigation handlers; the host MUST install exactly one panel widget and one panel input listener per UI session, MUST render compact sections with one heading and counter each, one line per rendered item, a total height budget with exact `+N more` overflow counts, and semantic theme roles for status glyphs, names, secondary text and metrics; MUST let a provider mark items it prefers to drop first on overflow and label their exact dropped count with its own summary line (such as `+N done`), and MUST let a provider make its section heading and summary lines selectable so that Enter opens that provider's own UI; for sections that opt in to prompt retention the host MUST track a prompt epoch that advances when a run starts with exactly the observed text of an interactive or RPC prompt submitted while the agent was idle, MUST compare each run's starting prompt exactly with the retained text it observed for idle interactive or RPC submissions and MUST NOT advance the epoch for a run whose prompt matches none of them (including prompts queued while streaming), and MUST track the agent idle state; MUST render running items, done items until 10 seconds after they ended (at most the three most recent), and failed items (including cancelled) while they ended in the current epoch or until 30 seconds after they ended, whichever is later; MUST keep such a section expanded while any running or lingering item remains, MUST otherwise collapse the section, whether the agent is busy or idle, to one selectable summary line whose Enter opens that provider's history panel, and MUST refresh at each linger boundary; providers MUST let the user close a finished item, hiding it from the panel without removing it from history; the host MUST keep a single selection, MUST be focused with ← only from an empty, focused root editor with no overlay or dialog open and released with Esc, MUST leave unfocused ↑/↓ to the editor, MUST end the panel with a hint row listing only the actions available for the selected item, MUST let a provider with a custom open action show its own UI and otherwise show item details in a framed opaque card of stable size whose ↑/↓ stays within the opened section, MUST close that card only when another UI actually takes focus, and MUST expose a read-only focus-guard query so other key handlers in those packages consume nothing outside the focused root editor.

#### Scenario: Thoth Pi work panel

- **GIVEN** subagents and background tasks opted in, 55 completed subagents from earlier prompts, and a busy prompt in which one subagent completes and one background task fails
- **WHEN** 10 seconds pass, the agent becomes idle, and a new prompt runs 40 seconds after the failure
- **THEN** the completed subagent row disappears after 10 seconds, the failed background row stays until that new prompt, afterwards Agents and Background each render as one summary line with session done/failed counts, Enter on the Agents summary opens the subagents history panel, and `/bg` still lists the failed task

### Requirement: Render kit semantic icons

`@thoth-agents/pi-core` MUST let a registered render kit optionally supply semantic icons (UI punctuation, navigation, motion frames and named icons) through an optional v1 lookup member that legacy v1 kits may omit, and first-party Pi packages MUST resolve those icons and their status glyphs for rendered UI through the registered kit when it provides them, keeping their current native glyphs when no compatible kit or member is available; model-facing text MUST NOT depend on the icon mode.

#### Scenario: Render kit semantic icons

- **GIVEN** the theme kit is registered with Nerd icons
- **WHEN** a subagent, bridge, task-list or work-panel row renders a completed status
- **THEN** it shows the theme completed icon, and without a registered kit it shows its current native glyph

### Requirement: Background task history panel

`@thoth-agents/pi-background-tasks` MUST provide a history panel built on the pi-core history panel shell that lists every current-session task, including expired and dismissed ones, newest first, and shows each task's status, command, timing, exit or error metadata and its retained log paged in bounded pages with a visible notice when earlier output was lost to retention; it MUST open from the Background summary line, from Enter on a background row with that task selected, and from the `/bg` command, and MUST let the user stop a running task with a confirmed close action.

#### Scenario: Background task history panel

- **GIVEN** a session with a dismissed completed task and a running task
- **WHEN** the user runs `/bg`
- **THEN** both tasks are listed newest first, selecting the completed task shows its metadata and paged log, and pressing x twice on the running task stops it

### Requirement: Thoth theme icon modes

`@thoth-agents/pi-thoth-theme` MUST accept an `icons` setting of `nerd`, `unicode` or `ascii`, MUST default to `nerd` when omitted or malformed, and in `unicode` mode MUST supply the native glyph set for semantic icons and status glyphs, substituting a Unicode glyph wherever the native fallback is itself a Nerd glyph.

#### Scenario: Thoth theme icon modes

- **GIVEN** `pi-thoth-theme.json` with `"icons": "unicode"`
- **WHEN** a work-panel row renders a completed status
- **THEN** it shows the native Unicode completed glyph instead of the Nerd icon

### Requirement: Bundled Pi extension packages

Each first-party Pi extension package MUST declare as its Pi extension entry one generated single-file bundle with a `.ts` extension that inlines pi-core and every dependency except the host-provided `@earendil-works/*` and `typebox` modules and declared per-package exceptions, MUST ship the bundle and its runtime assets in its published files, and MUST NOT require pi-core or other inlined dependencies at runtime.

#### Scenario: Bundled Pi extension packages

- **GIVEN** a first-party Pi extension package installed from npm without sibling host SDK copies
- **WHEN** Pi loads it
- **THEN** Pi transpiles one bundle file through its aliases, no duplicate host SDK module is loaded, and the extension activates with its runtime assets available

### Requirement: Version-tolerant pi-core registries

pi-core render-kit and tool-definition registries stored on `globalThis` MUST use keys that include their contract version, and consumers MUST fall back to their no-registry behavior when a stored record does not match the expected shape; the work panel MUST keep one version-independent ownership slot so that exactly one panel widget and one panel input listener exist per UI session across pi-core copies, and a copy with an incompatible work-panel contract MUST install no host and register no section instead of throwing.

#### Scenario: Version-tolerant pi-core registries

- **GIVEN** two extensions bundled with different pi-core versions in one Pi UI session
- **WHEN** both look up the registries and register work-panel sections
- **THEN** one panel widget and one input listener exist, compatible sections share it, an incompatible copy contributes no section, and neither extension throws

### Requirement: Pi question focus over panel overlays

The `ask_user_question` TUI MUST occupy the editor area without covering the chat, MUST keep keyboard input while expanded even when the subagents, task-list or background history overlay or the work-panel detail card is opened and closed, MUST collapse with Ctrl+] to a one-line dock that returns keyboard input to the root editor and re-expand with Ctrl+] while open, and MUST mark its tool-call card as collapsed while collapsed; the subagents history overlay, the task-list history overlay and the work-panel detail card MUST close only their own overlay handle, so that closing one never removes, hides or unfocuses another, and when the focus target restored on close is no longer mounted they MUST focus the expanded questionnaire or otherwise the currently mounted root editor; collapsing, answering or cancelling the question MUST NOT take focus from a still-visible foreign overlay.

#### Scenario: Pi question focus over panel overlays

- **GIVEN** the subagents or task-list history overlay is open
- **WHEN** the root agent asks a question, the user closes the history overlay, collapses the question, types in the editor and expands it again
- **THEN** the chat stays uncovered and scrollable, the questionnaire receives keyboard input when expanded, the editor receives it when collapsed, the tool-call card shows the collapsed state, and the user's answer is returned

### Requirement: Shared Pi panel shell

pi-core MUST export panel primitives (titled frame, cell-width truncation, keyboard plus SGR/urxvt/X10 mouse and wheel parsing, cursor-centered viewport, selectedBg row, hint rows, dirty-discard confirmation, owned-overlay host) and a list-editor shell; Pi list editors MUST render through the shell, and history panels and the work-panel detail card MUST use the primitives without changing their interaction model.

#### Scenario: Shared Pi panel shell

- **GIVEN** the tools, model, history and work-detail panels
- **WHEN** each renders and receives keyboard or wheel input
- **THEN** they share the primitives' frame, width handling and input parsing, the list editors share the shell, and every panel overlay opens through `openOwnedOverlay`

### Requirement: Pi task state channels

pi-subagents and pi-background-tasks MUST publish current-session task summary snapshots on versioned pi-core channels after each change and on request, containing only identity, status, agent/model/effort or kind, lifecycle times, usage/cost, exit and short preview fields, never prompts, transcripts, results, commands, environment or logs; subagent usage MUST be published only on the pi-core usage channel and the Thoth status line MUST consume it from there.

#### Scenario: Pi task state channels

- **GIVEN** a session running subagents and background tasks
- **WHEN** a task changes state or a consumer requests snapshots
- **THEN** both packages publish envelope snapshots for that session with summary fields only, and the status line shows cumulative subagent cost from the usage channel

### Requirement: Discoverable work-panel registry

pi-core MUST let consumers other than the host list registered work-panel sources with id, label, priority, contract version and a per-source monotonic revision that increases on registration and every provider change, subscribe to registration, removal and source changes, read each source's rows as data-only values bounded by a requested maximum and the source row cap, and invoke a source's open, history and close actions by source and row id; work-panel rows MUST contain no functions, and the work-panel contract version MUST be 2.

#### Scenario: Discoverable work-panel registry

- **GIVEN** the subagents, background-tasks and task-list sources registered
- **WHEN** a consumer lists sources, subscribes and a subagent finishes
- **THEN** it sees three sources, receives a change for the subagents source with a higher revision, reads that source's rows as plain data within its bound, and can open the item through the action API
