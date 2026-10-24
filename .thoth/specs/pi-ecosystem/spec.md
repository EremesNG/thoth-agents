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

The Thoth Pi task-list package (published under the `@thoth-agents` scope as a fork of the juicesharp rpiv 2.12.0 task-list package) MUST register the session task-list tool with the upstream 2.12.0 schema and transition rules extended by an atomic `batch` action whose ordered create/update/delete ops may reference tasks created earlier in the same call through call-scoped refs, and by a create-time status of the initial status, in_progress or completed, without limiting how many tasks are in progress; it MUST reconstruct the session list from the branch on session start, tree navigation and compaction, MUST publish its full session snapshot on the pi-core task-list state channel after each change and in answer to a request, MUST add the open tasks to the model context before each agent start when any exist using an API detected at runtime that degrades without failing on the minimum supported Pi, and MUST show only the current session's list through its pi-core work-panel section; that Todos section MUST list the current list with completed tasks marked and a done/total counter, dropping completed tasks first on overflow with an exact `+N done` line; Enter on any Todos row, heading or summary line and the `/todos` command when custom UI is available MUST open one panel built on the pi-core history panel shell with the full current list grouped by status, while `/todos` without custom UI keeps its text output; once every task is completed the list MUST remain shown until the next recognized prompt epoch and then disappear from the section and panel without altering task state.

#### Scenario: Thoth Pi task-list extension

- **GIVEN** an empty session list
- **WHEN** the agent sends one batch call creating seven tasks, two of them in_progress and one depending on another through a ref, and the list is later compacted
- **THEN** one snapshot is published with seven tasks and both in_progress tasks, the dependency points to the created id, and the reconstructed list, model context and `/todos` panel show the same seven tasks grouped by status

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

pi-subagents and pi-background-tasks MUST publish current-session task summary snapshots on versioned pi-core channels after each change and on request, containing only identity, status, agent/model/effort or kind, lifecycle times, usage/cost, exit and short preview fields, never prompts, transcripts, results, commands, environment or logs; the subagents snapshot MUST also carry a bounded set of the session's persisted task summaries selected by highest cost with the same fields; subagent usage MUST be published only on the pi-core usage channel and the Thoth status line MUST consume it from there.

#### Scenario: Pi task state channels

- **GIVEN** a resumed session with more than 100 persisted subagent tasks and running background tasks
- **WHEN** a task changes state or a consumer requests snapshots
- **THEN** both packages publish envelope snapshots for that session with summary fields only, the subagents snapshot includes the highest-cost persisted tasks up to its bound, and the status line shows cumulative subagent cost from the usage channel

### Requirement: Discoverable work-panel registry

pi-core MUST let consumers other than the host list registered work-panel sources with id, label, priority, contract version, a per-source monotonic revision that increases on registration and every provider change, and the provider's summary counts, subscribe to registration, removal and source changes, read each source's rows as data-only values bounded by a requested maximum and the source row cap, and invoke a source's open, history and close actions by source and row id; work-panel rows MUST contain no functions, and the work-panel contract version MUST be 2.

#### Scenario: Discoverable work-panel registry

- **GIVEN** the subagents, background-tasks and task-list sources registered
- **WHEN** a consumer lists sources, subscribes and a subagent finishes
- **THEN** it sees three sources with their summary counts, receives a change for the subagents source with a higher revision and updated counts, reads that source's rows as plain data within its bound, and can open the item through the action API

### Requirement: Provider rate-limit registry

pi-core MUST provide a process-wide, version-tolerant registry of provider rate-limit windows that bridges in root or subagent sessions report to and consumers can list and subscribe to, containing only status, utilization fraction, reset and observation times, window type, overage flags and the observing session id; the Claude bridge MUST report every rate-limit event to it, and subagent cards MUST show an active warning observed by their own session.

#### Scenario: Provider rate-limit registry

- **GIVEN** a subagent running on the Claude bridge
- **WHEN** its query receives a warning rate-limit event
- **THEN** the registry lists that window with the child session id, a consumer subscribed in the root session is notified, and the subagent's card shows the warning with its reset time

### Requirement: Subscription provider cost and on-demand quota

the Antigravity bridge MUST report API-equivalent message cost through an explicit model-to-catalog price mapping, the theme MUST treat `antigravity` as a default subscription provider, and provider quota MUST only be fetched on demand through `/agy quota` and `/claude quota`, never periodically.

#### Scenario: Subscription provider cost and on-demand quota

- **GIVEN** an Antigravity session using a mapped Gemini model
- **WHEN** a turn completes and the user runs `/claude quota`
- **THEN** the message cost equals the catalog price for its tokens, the status line includes it marked `(sub)`, and the quota command prints the plan windows without sending a prompt

### Requirement: Thoth Pi sidebar

`@thoth-agents/pi-sidebar` MUST render a read-only right sidebar in Pi fullscreen and regular modes through guarded, owner-checked layout adapters that fall back to no sidebar with a diagnostic, MUST offer Session, Workspace, work-panel source and Cost panels that can be shown, hidden and reordered with persisted order and visibility, including through a `/sidebar settings` overlay, MUST default to a 50-column width that the user can resize through `/sidebar resize`, settings and fullscreen divider drag without a keyboard shortcut down to a 36-column minimum, following the pi-atelier auto-hide rules, MUST render atelier-style themed panel chrome with per-panel icons and colors and per-element row colors drawn from the active theme roles, work-panel header summaries and detail-command footers, a Workspace path abbreviated like the editor border with changed-file and line counts versus HEAD, and a subagent cost bar panel with a `/sidebar cost` curves view, and MUST declare the work-panel sources it displays through a pi-core UI-preferences registry so the work panel neither renders nor selects nor focuses them while their sidebar panels are visible.

#### Scenario: Thoth Pi sidebar

- **GIVEN** a 160-column fullscreen session with a running subagent, two todos and modified files and no saved width
- **WHEN** the sidebar is visible with Agents, Todos, Workspace and Cost panels
- **THEN** the sidebar is 50 columns wide, `/sidebar resize` cannot shrink it below 36, each panel shows its themed title with a summary, Agents and Todos show their detail commands, Workspace shows `~`-abbreviated path and `Changed N files +A −D`, Cost shows bars by task display name, and the work panel no longer shows the absorbed sections or accepts ← focus for them

### Requirement: Stable work-panel row height

the shared work-panel renderer MUST decide multi-line metric wrapping and, for the sidebar's column layout, which elements to show from reserved widths of each metric's number format, so a row's line count and visible columns do not change when only the digit width of its metric values changes within each format's reserved range; sidebar Agents rows MUST render a first line with the status glyph, a name without a leading `thoth-` prefix, the task summary in the remaining width and the elapsed time, and, when at least one of its other metrics is admitted, a second line under the name whose columns are aligned panel-wide and kept in the priority context, cost, speed, tokens, tools, warnings and model/effort, showing a lower-priority element only when every higher-priority one fits; in every sidebar columns-layout panel a truncated summary that would show fewer than four cells MUST be hidden with its separator while a complete short summary stays visible; values beyond a reserved range MAY only increase a row's line count or drop elements, never toggle back and forth.

#### Scenario: Stable work-panel row height

- **GIVEN** a running `thoth-oracle` subagent row with a long task summary, context, cost, speed, tokens, tools and model whose values cross format boundaries such as 99→100 tok/s and 9s→10s
- **WHEN** the work panel and the 50- and 72-column sidebar render it
- **THEN** the sidebar row shows `oracle`, a readable summary and elapsed on its first line, at least context and cost on its second line at 50 columns and at least context, cost and speed at 72 columns, while every value stays within its reserved range the visible columns and the two-line height do not change, and rows below it do not move

### Requirement: Codemode compact rendering

When Thoth theme tool rendering is enabled, the Pi `codemode` tool is drawn by the Thoth render kit as a card of its nested calls without replacing or wrapping Pi's builtin codemode extension.

#### Scenario: Codemode compact rendering

- **GIVEN** a codemode call whose details list nested calls
- **WHEN** it renders collapsed
- **THEN** it shows up to eight nested calls with name, status and duration and a count of the remaining calls, and expanded it shows the script, output and errors

### Requirement: Codemode default activation

The Pi installer enables codemode with mode `on` in global settings unless the user already configured codemode.

#### Scenario: Codemode default activation

- **GIVEN** global settings without codemode configuration
- **WHEN** thoth-agents installs for Pi
- **THEN** `defaultTools` selects codemode (`+codemode` additively, or plain `codemode` in an empty or replacement list) and `codemode.mode` is `on`, while existing user codemode choices and unrelated settings are preserved

### Requirement: Codemode in lean subagent children

A Thoth Pi subagent child whose tool selection includes `codemode` registers Pi's public codemode extension so the tool is available, scoped to the child's selected tools.

#### Scenario: Codemode in lean subagent children

- **GIVEN** a lean child whose tools include `codemode` and `read`
- **WHEN** its session starts
- **THEN** the `codemode` tool is registered and a script can call `read`, but cannot call unselected tools or `model-only` delegation controls

### Requirement: Codemode delegation boundary

Thoth delegation controls, the child `ask_orchestrator` and `notify_orchestrator` tools and `ask_user_question` are `model-only` direct calls that codemode scripts cannot invoke, and root guidance directs batching only of script-callable work.

#### Scenario: Codemode delegation boundary

- **GIVEN** codemode is active in mode `on` or `only`
- **WHEN** the root delegates, replies to a child or asks the user, or a child asks or notifies the orchestrator
- **THEN** those are direct tool calls that scripts cannot invoke, and independent reads, research or memory calls may be batched in one script

### Requirement: Named Pi subagent model profiles

Pi `/subagents-model` MUST manage named model profiles (model and effort per subagent, plus an optional root orchestrator model and effort) stored in `<agentDir>/thoth/profiles.json` and `<project>/.pi/thoth/profiles.json`, with a read-only virtual `default`, draft-until-save creation from default or another profile, project-over-global name shadowing, and effective selection session → project pin → global active → `default` applied at run time without rewriting agent definitions; `model_profiles` in `subagents.json` MUST NOT be used. A profile orchestrator MUST be applied to the current session on activation and at the start of new sessions only, MUST NOT change the model on resume, reload or fork, MUST leave the model untouched when undefined or unavailable (with a warning when unavailable), and Pi `settings.json` MUST NOT be written.

#### Scenario: Named Pi subagent model profiles

- **GIVEN** a global active profile `openai` and a project pin `claude` defining orchestrator `anthropic/claude-opus-5-5`
- **WHEN** a subagent runs in that project without a session selection
- **THEN** it uses the `claude` profile's model and effort, a new session in that project starts with `anthropic/claude-opus-5-5`, resuming an older session keeps its own model, and selecting `openai` for the session makes later runs in that session, including after resume, use `openai` without changing any config file

### Requirement: Tool-aware subagent stall budgets

For ordinary inactivity, the pi-subagents inactivity watchdog MUST apply `stall_timeout_ms` only when no tool is active; while tools are active its ordinary inactivity check MUST fire only when an active tool exceeds its own budget, defaulting to `tool_stall_timeout_ms` (default 900000, never below `stall_timeout_ms`) and extended to the declared seconds timeout plus 30 seconds for `bash`/`powershell` `timeout` or any `timeout_seconds` argument, capped at `max_total_timeout_ms`; maintenance suspension ceilings and execution deadlines are unaffected; the final stall error MUST identify the applied budget.

#### Scenario: Tool-aware subagent stall budgets

- **GIVEN** a child running a silent `bash` command with `timeout: 1000`, default config, and a deadline beyond 20 minutes
- **WHEN** 16 minutes pass without tool updates
- **THEN** no stall fires, and a stall fires once 1030 seconds pass without updates, with the final error naming the tool budget of 1030000 ms

### Requirement: AskCodex app-server delegation

`@thoth-agents/pi-askcodex` MUST register an `AskCodex` tool, unless disabled by configuration, that delegates a task to the local Codex harness through `codex app-server` over stdio, resolving the binary from explicit configuration, then the Codex Desktop-bundled executable, then PATH with a warning; it MUST map `plan` to a read-only sandbox and `accept-edits` to workspace-write, return the final agent message, a continuation id that resumes the same Codex thread, token usage and every approval decision; it MUST answer Computer Use app elicitations by accepting allowlisted apps with session scope only, asking the user through Pi UI for other approvals when UI is available and declining them otherwise, never granting persistent approval; and it MUST interrupt the turn and terminate its own process tree on abort or timeout, except that on Windows without an available job launcher it terminates only the app-server leader as defined by AskCodex Windows job containment.

#### Scenario: AskCodex app-server delegation

- **GIVEN** Codex Desktop running, `notepad.exe` allowlisted and no Pi UI
- **WHEN** `AskCodex` asks Codex to type text into Notepad and Codex requests Computer Use approval for Notepad and later a command approval outside the sandbox
- **THEN** the Notepad request is accepted with session persistence, the command approval is declined, both decisions appear in the result, and the result includes the final message and a continuation id

### Requirement: Shared Pi question service

`@thoth-agents/pi-core` MUST provide a process-wide question-service registry keyed by its contract version where a provider registers an ask function through a per-instance handle that withdraws only its own registration and consumers resolve the most recent compatible provider, receiving none when absent or when the stored record has an incompatible shape; `@thoth-agents/pi-questions-user` MUST register its question UI as provider only in sessions with UI, withdraw it on shutdown, support disabling free-text answers per question and resolve an aborted request as cancelled after disposing its UI; `@thoth-agents/pi-askcodex` MUST present approval prompts through a compatible provider as a single-choice question without a recommended option or free text and with a preview of the command, working directory or app identifier, MUST fall back to the native select dialog when no compatible provider exists, and MUST decline on cancellation, abort or any answer other than an allow option.

#### Scenario: Shared Pi question service

- **GIVEN** a Pi UI session with pi-questions-user and pi-askcodex loaded
- **WHEN** Codex requests approval for a command outside the sandbox
- **THEN** the question UI shows the command and working directory in its preview with `Allow once` and `Decline`, no option is marked recommended, free text is not offered, and choosing `Decline` declines the request

### Requirement: Sidebar work-panel launch order and retention

The pi-sidebar Agents and Background panels MUST list active rows first in launch order with the oldest active at the top (subagent original creation time, background start time with task id as tie-breaker) and MUST NOT reorder active rows because of activity, followed by the three most recently finished rows ordered by completion time with the most recent first, under one rule for every terminal status without time-based expiry; when height is insufficient they MUST hide the oldest finished rows first, then the oldest active rows, reporting hidden rows with a `+N more` line.

#### Scenario: Sidebar work-panel launch order and retention

- **GIVEN** two running subagents launched in order A then B and four background tasks that finished in order W, X, Y, Z, of which W failed
- **WHEN** B reports activity after A and the sidebar renders
- **THEN** A stays above B above any finished agent, and the Background panel shows Z, Y and X in that order without W

### Requirement: Work-panel terminal status taxonomy

First-party work-panel providers MUST render cancelled and interrupted work as a muted cancelled status that is not counted as a failure, MUST render timed-out work with a distinct timed-out status glyph counted as a failure, MUST render a background task whose non-zero exit code was declared expected as a non-error expected-exit status counted as done, and MUST render a failed background task whose failure incidents are all recovered or superseded as a muted resolved status not counted as a failure; header summaries MUST count only actionable failures as failed and MUST report queued and cancelled counts separately, and the new statuses MUST resolve through the render kit with Unicode, Nerd and ASCII glyphs.

#### Scenario: Work-panel terminal status taxonomy

- **GIVEN** a cancelled subagent, a subagent that hit its total timeout, a background task exiting 1 with `expected_exit_codes: [1]` and a failed background task later recovered by a same-operation success
- **WHEN** the sidebar renders their panels
- **THEN** they show the ■ cancelled, ◷ timed-out, expected-exit and ↻ resolved glyphs respectively, the subagent rows show no status label, and the failed counters count only the timeout

### Requirement: AskCodex Windows job containment

On Windows `@thoth-agents/pi-askcodex` MUST launch the Codex app-server inside its own kill-on-close Job Object, assigned before the app-server's first thread runs, with its stdio connected directly to Pi, and MUST terminate the app-server and its descendants only through that job; when the job launcher is unavailable it MUST terminate only the leader through its own process handle and warn, and it MUST never terminate a process selected by PID, parent PID or creation time.

#### Scenario: AskCodex Windows job containment

- **GIVEN** a Windows Pi session where AskCodex runs an app-server that spawned a persistent descendant and an unrelated process exists whose stale parent PID equals the app-server PID
- **WHEN** the AskCodex call times out
- **THEN** the app-server and its descendant are terminated through the job and the unrelated process keeps running

### Requirement: Antigravity bridge Windows job containment

On Windows `@thoth-agents/pi-antigravity-bridge` MUST launch every agy process that executes agents (stream-json driver, AskAntigravity delegations, web-tool delegates and the ACP connection) inside its own kill-on-close Job Object and MUST end it and its descendants only through that job, both when the bridge stops it and when its leader exits on its own; short metadata probes and the launcher-unavailable fallback MUST end only their own leader through its process handle (the fallback also warns), and the bridge MUST never terminate a process selected by PID tree, parent PID or creation time.

#### Scenario: Antigravity bridge Windows job containment

- **GIVEN** a Windows Pi session where an AskAntigravity delegation runs agy that started a persistent descendant, and an unrelated process exists whose stale parent PID equals the agy PID
- **WHEN** the delegation times out or agy exits on its own
- **THEN** agy and its descendant end through the job and the unrelated process keeps running

### Requirement: Windows job launcher consumer isolation

`@thoth-agents/pi-core`'s Windows job launcher MUST give each separately bundled consumer its own helper, so a helper failure, recovery or ambiguous-launch reconciliation in one consumer never terminates or serves another consumer's jobs.

#### Scenario: Windows job launcher consumer isolation

- **GIVEN** AskCodex and the Antigravity bridge each running a job in the same Pi process
- **WHEN** one consumer's helper dies or reconciles an ambiguous launch
- **THEN** only that consumer's jobs are affected and the other consumer's job keeps running

### Requirement: Compact model-facing Pi tool definitions

The in-repo Pi packages pi-background-tasks, pi-questions-user, pi-todo, pi-antigravity-bridge, pi-askcodex and pi-subagents MUST keep each package's serialized tool definitions (name, description, parameter schema, prompt snippet and guidelines) within a size budget enforced by a package test, state shared guidance once per tool, and declare no deprecated parameter aliases; pi-background-tasks MUST expose the standalone tools `bg_task_spawn`, `bg_task_watch`, `bg_task_list`, `bg_task_status`, `bg_task_log`, `bg_task_stop` and `bg_task_clear` and no action-wrapper tools, and MUST declare `bg_task_watch` conditions with one flat condition schema whose per-type fields are validated before launch; pi-antigravity-bridge MUST keep its `antigravity` replay wrapper active and executable while omitting its declaration from provider requests.

#### Scenario: Compact model-facing Pi tool definitions

- **GIVEN** a Pi session with these packages loaded
- **WHEN** their registered tool definitions are serialized and a provider request is prepared
- **THEN** each package stays within its tested budget, no definition declares `maxBytes`, `tail_lines` or an `effort` alias, the background-task tools are exactly the seven standalone tools with shell guidance stated once per tool, a watch condition missing its per-type field is rejected before launch, and the request declares no `antigravity` tool while provider-emitted replay calls still execute 

### Requirement: Claude bridge resumes Claude Code sessions across Pi processes

`@thoth-agents/pi-claude-bridge` MUST, when a persisted Pi session continues in a new Pi process or after its in-memory bridge state was cleared, resume the Claude Code session of the last cleanly completed bridge turn with that session's recorded system prompt and append epoch instead of rebuilding it, but only when it can prove the same Pi session, the same Pi history prefix and an unchanged Claude Code transcript; otherwise it MUST rebuild as before, and it MUST NOT reuse a checkpoint left by an aborted, failed, compacted, rewritten or in-flight turn.

#### Scenario: Claude bridge resumes Claude Code sessions across Pi processes

- **GIVEN** a persisted Pi session whose last turn completed through the bridge and whose Claude Code transcript is unchanged
- **WHEN** Pi restarts and the session continues with a new prompt
- **THEN** the bridge resumes the same Claude Code session id with the same recorded system prompt without re-importing history, so the request reuses the cached conversation prefix

### Requirement: Subagent history retention

`@thoth-agents/pi-subagents` MUST keep each persisted task's identity, status, timing, usage/cost, result and session path, MUST store execution detail (thread snapshot, transcript, system prompt) only for the latest attempt of each task and MUST NOT persist per-event rows; it MUST clear that execution detail for terminal tasks whose last activity is older than a configurable retention (default 14 days) without blocking session start, without touching queued or running tasks, and without failing when the database is busy; it MUST reclaim database file space only through an explicit compaction command that holds exclusive access to the database from before its first change until compaction ends, and that refuses without changing data when exclusive access cannot be acquired.

#### Scenario: Subagent history retention

- **GIVEN** a terminal subagent task last active 20 days ago and the default retention
- **WHEN** the pruning pass runs
- **THEN** its snapshot, transcript and system prompt are cleared while `subagent_status`, `subagent_result`, the history listings and cost totals still show the task and its result

### Requirement: Subagent terminal task memory

After a subagent task is terminal, its runner has settled and its terminal record is durably persisted, `@thoth-agents/pi-subagents` MUST keep only a lightweight summary of the task in process memory and load its execution detail from history on demand; when the terminal record could not be persisted it MUST keep the full task in memory, and a continuation that reuses the task id MUST NOT lose its own state.

#### Scenario: Subagent terminal task memory

- **GIVEN** a completed subagent task whose terminal record was persisted
- **WHEN** later turns call `subagent_status`, `subagent_result` or `subagent_continue` for it
- **THEN** they behave as before while the manager no longer holds that task's transcript, thread snapshot or system prompt

### Requirement: Bounded subagent tool result details

Subagent tool results and progress updates MUST build task details through one explicit bounded projection that never includes transcripts, system prompts or thread snapshots, bounds prompt and context text to a fixed preview, and includes the final response only in final results; renderers MUST keep rendering older persisted details that still contain those fields.

#### Scenario: Bounded subagent tool result details

- **GIVEN** a running subagent with a long transcript
- **WHEN** `subagent_run` emits progress updates and its final result
- **THEN** no update or result details contain the transcript or system prompt, and both new and previously persisted tool cards render unchanged

### Requirement: Claude bridge leaves session summaries to Pi

`@thoth-agents/pi-claude-bridge` MUST NOT take over Pi's session compaction or branch-summary hooks, leaving summary generation and its failure handling to Pi and other extensions, and any summary model call it serves MUST run on its isolated path in the owning Pi session's working directory.

#### Scenario: Claude bridge leaves session summaries to Pi

- **GIVEN** a Pi session on a Claude bridge model
- **WHEN** Pi compacts the session or summarizes a branch during tree navigation
- **THEN** the bridge neither preempts nor cancels the hook, and a summary request routed to it runs isolated in that session's cwd

### Requirement: Claude bridge uses the Pi session working directory

`@thoth-agents/pi-claude-bridge` MUST run each Claude Code query and isolated call in the working directory of the Pi session that issued it, not the host process's working directory.

#### Scenario: Claude bridge uses the Pi session working directory

- **GIVEN** a host running Pi sessions in different directories in one process
- **WHEN** each session sends a turn through the bridge
- **THEN** each Claude Code query runs in its own session's directory

### Requirement: Antigravity bridge read-only enforcement

`@thoth-agents/pi-antigravity-bridge` MUST refuse with a visible error, without launching agy, every provider turn while `readOnly` is on or the provider mode is plan, and every AskAntigravity call while `readOnly` is on, and MUST never pass any spelling of agy's skip-permissions flag to a plan-mode run.

#### Scenario: Antigravity bridge read-only enforcement

- **GIVEN** `readOnly` on or provider mode plan; WHEN a provider turn starts, or an AskAntigravity call starts while `readOnly` is on; THEN it fails with a visible error and no agy process starts; and GIVEN an AskAntigravity plan run
- **WHEN** agy is launched
- **THEN** its arguments contain no skip-permissions flag

### Requirement: Antigravity bridge re-delivers unpolled escalated results

`@thoth-agents/pi-antigravity-bridge` MUST re-deliver, exactly once and at the next turn boundary, each escalated bridge call result that completed but was never returned by a poll, as a late prompt in the conversation it belongs to, keeping it pollable and leaving a result with no known conversation pollable without prompting.

#### Scenario: Antigravity bridge re-delivers unpolled escalated results

- **GIVEN** an escalated bridge call that completes after the model ended its turn without polling
- **WHEN** the next turn boundary is reached
- **THEN** the result is delivered once as a late prompt in its conversation and remains pollable

### Requirement: Background completion callbacks wait for an idle agent

`@thoth-agents/pi-background-tasks` MUST hold ordinary background completion callbacks while the Pi agent is busy and deliver a session's held callbacks as one aggregated follow-up that triggers a turn after the agent becomes idle. It MUST NOT hand off another ordinary callback batch until the previous handoff has started a run or failed, and MUST keep urgent notifications immediate.

#### Scenario: Background completion callbacks wait for an idle agent

- **GIVEN** two background tasks of one session that complete while the agent is running a turn
- **WHEN** the agent settles
- **THEN** one follow-up message reports both completions and triggers one turn, and no second ordinary handoff happens before that turn starts

### Requirement: Task-list replay of nested mutations

`@thoth-agents/pi-todo` MUST persist the full task-list snapshot of each successful state-changing call, including calls nested inside another tool such as codemode, as a session entry. It MUST reconstruct the list from the latest such entry on the current branch, falling back to legacy `todo` tool-result snapshots only when the branch has none.

#### Scenario: Task-list replay of nested mutations

- **GIVEN** a session whose only task-list mutations were `todo` calls nested in codemode
- **WHEN** the session is resumed, navigated or compacted
- **THEN** the reconstructed list equals the list after the last nested mutation

### Requirement: Narrow-width expansion hints

`@thoth-agents/pi-thoth-theme` MUST keep the expansion key visible when a collapsed row that ends in a `<key> to expand` hint is wider than its available width. It does so by first shortening the hint to the bare key and then truncating the preceding text, at every theme truncation boundary, including render-kit cards. It MUST leave rows that fit, rows without such a hint, and rows too narrow to keep at least one column of preceding text unchanged apart from ordinary truncation.

#### Scenario: Narrow-width expansion hints

- **GIVEN** a collapsed bash result whose row `… 120 more lines · ctrl+o to expand` is wider than a 20-column frame even after the hint is shortened to `ctrl+o`
- **WHEN** it renders
- **THEN** the row ends with `· ctrl+o`, preceded by truncated text; and the same result at 120 columns renders exactly as before
