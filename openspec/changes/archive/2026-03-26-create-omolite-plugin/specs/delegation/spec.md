# Delegation Specification

## Purpose

Define how delegated background work is identified, persisted, retrieved, and
made available across session compaction boundaries.

## Requirements

### Requirement: Completed background delegations are persisted to disk

The system MUST persist each completed background task result to disk at:

`~/.local/share/opencode/delegations/[projectId]/[rootSessionId]/[taskId].md`

Persisted results MUST remain retrievable after in-memory task state has been
compacted or discarded.

#### Scenario: Completed result is written to delegation storage

- GIVEN a background task reaches the completed state with output content
- WHEN the system finalizes the task
- THEN a markdown record SHALL exist at the task's delegation storage path
- AND the record SHALL contain the completed result for later retrieval

#### Scenario: Incomplete task is not exposed as a completed record

- GIVEN a background task is pending, starting, or running
- WHEN a caller checks for its persisted result
- THEN the system SHALL NOT treat it as a completed disk-backed result

#### Scenario: Persistence failure does not erase the live result

- GIVEN a background task completes successfully
- AND the delegation storage location is unavailable
- WHEN the system attempts to persist the completed result
- THEN the task result SHALL remain available for the current session
- AND the system SHALL indicate that persistent retrieval is unavailable

### Requirement: Delegation storage is partitioned by stable project identity

The system MUST derive `projectId` from a stable identifier based on the
repository root commit hash so that the same repository reuses the same
delegation storage location across sessions. The system MUST NOT mix delegation
records from different repositories into the same project directory.

#### Scenario: Same repository reuses the same project directory

- GIVEN two root sessions are created for the same repository at different times
- WHEN completed background delegations are persisted
- THEN both sessions SHALL write under the same projectId directory

#### Scenario: Different repositories are isolated

- GIVEN completed background delegations from two different repositories
- WHEN the records are persisted
- THEN the records SHALL be stored under different projectId directories

#### Scenario: Stable project identity cannot be derived

- GIVEN the system cannot derive the stable project identity for a repository
- WHEN a completed background task is ready for persistence
- THEN the system SHALL NOT write the task into an ambiguous project directory
- AND the system SHALL report that persistent delegation storage is unavailable

### Requirement: Delegation task identifiers are human-readable and unique

Background task identifiers MUST be readable enough for human reference and
MUST be unique within a root session's delegation history.

#### Scenario: Human-readable task ID is issued on launch

- GIVEN a caller launches a new background task
- WHEN the task ID is returned
- THEN the task ID SHALL be readable enough to reference manually
- AND the caller SHALL be able to use that same ID to retrieve output later

#### Scenario: Colliding task ID is not reused

- GIVEN a root session already contains a persisted or active delegation record
  for a task ID
- WHEN a new background task is launched in that same root session
- THEN the new task SHALL receive a different task ID

### Requirement: background_output supports disk fallback

`background_output` MUST return a completed task result from disk when the task
is no longer available in memory but a persisted delegation record exists. If
neither memory nor disk contains the task, the system SHALL report that the task
is unavailable.

#### Scenario: Disk-backed completed result is returned after memory loss

- GIVEN a completed background task has a persisted delegation record on disk
- AND the task is no longer present in in-memory task state
- WHEN the caller requests background_output for that task ID
- THEN the system SHALL return the persisted completed result

#### Scenario: Missing task is reported as unavailable

- GIVEN a task ID is absent from both in-memory state and persisted delegation
  storage
- WHEN the caller requests background_output for that task ID
- THEN the system SHALL report that the task is unavailable

### Requirement: Delegation context survives compaction

During compaction, the system MUST inject delegation context derived from the
root session's completed delegations so that completed delegated work remains
available to the resumed conversation.

#### Scenario: Compaction includes completed delegation context

- GIVEN a root session has one or more completed background delegations
- WHEN the conversation is compacted or resumed from compaction
- THEN the injected context SHALL include those completed delegation outcomes
- AND the resumed agent SHALL be able to continue without re-running them

#### Scenario: No delegation context is injected when none exists

- GIVEN a root session has no completed background delegations
- WHEN the conversation is compacted
- THEN the compaction context SHALL omit delegation history

### Requirement: Persisted delegation records follow a markdown contract

Each persisted delegation record MUST be markdown that contains a header with
title, summary, agent, status, and timestamps, followed by the full task
content.

#### Scenario: Persisted record contains required metadata and body

- GIVEN a completed background delegation is written to disk
- WHEN the markdown file is read
- THEN it SHALL include title, summary, agent, status, and timestamps in the
  header
- AND it SHALL include the full task content after the header

#### Scenario: Large multi-paragraph output remains readable

- GIVEN a completed background task produces multi-paragraph output
- WHEN the delegation record is persisted and later read back
- THEN the markdown record SHALL preserve the full content body
- AND the metadata header SHALL remain separately identifiable from that body
