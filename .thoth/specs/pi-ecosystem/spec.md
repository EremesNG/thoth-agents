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
