# Memory Orchestration Specification

## Purpose

Durable behavioral contract for `memory-orchestration`.

## Requirements

### Requirement: Root memory routing

The adaptive root MUST recall prior project memory with task key terms before exploring, planning, or dispatching non-trivial work, unprompted, MUST save durable knowledge as soon as it is verified, unprompted, including decisions, discoveries and findings, bugs with root cause and fix, what worked and what failed, and lessons from accepted specialist results, and MUST route recall, durable lessons, verified compaction, and meaningful semantic completion through the installed thoth-mem skill while retaining root-only lifecycle and real-user-intent ownership.

#### Scenario: Root memory routing

- **GIVEN** a non-trivial user task
- **WHEN** the root starts work
- **THEN** it recalls prior project memory before exploration, planning, or dispatch, and skips memory only for trivial or conversational turns 
