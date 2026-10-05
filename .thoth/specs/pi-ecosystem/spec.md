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

The Thoth Pi task-list package (published under the `@thoth-agents` scope as a fork of the juicesharp rpiv 2.12.0 task-list package) MUST register the session task-list tool with the upstream 2.12.0 schema and transition rules, MUST reconstruct the session list from the branch on session start, tree navigation and compaction, MUST publish its full session snapshot on the pi-core task-list state channel after each change and in answer to a request, MUST add the open tasks to the model context before each agent start when any exist using an API detected at runtime that degrades without failing on the minimum supported Pi, and its editor widget MUST show only the current session's list.

#### Scenario: Thoth Pi task-list extension

- **GIVEN** a session with open tasks in the task-list tool
- **WHEN** the session is compacted and the agent starts again
- **THEN** the list is reconstructed, the open tasks are present in the model context, and a fresh state snapshot is published on the pi-core task-list state channel

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
