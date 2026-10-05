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
