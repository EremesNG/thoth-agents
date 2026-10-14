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

### Requirement: Delegated memory identity

When memory is relevant to a child dispatch, the dispatch envelope MUST carry the provider, project, stable root session identity or an explicit unavailable state, authorization, and bounded context.

#### Scenario: Delegated memory identity

- **GIVEN** a child dispatch
- **WHEN** memory is relevant
- **THEN** the envelope carries provider, project, stable root session identity or an explicit unavailable state, authorization, and bounded context 

### Requirement: Read-only observe authorization

A read-only workspace role explicitly granted `observe` MAY persist a durable provider observation and MUST NOT thereby gain workspace mutation or root lifecycle authority.

#### Scenario: Read-only observe authorization

- **GIVEN** a read-only workspace role such as explorer or oracle
- **WHEN** the parent explicitly grants `observe`
- **THEN** the role may persist a durable provider observation without gaining workspace mutation or root lifecycle authority 

### Requirement: Canonical project artifacts

Project change records, durable specifications, and historical artifacts MUST remain canonical under `.thoth/`, and thoth-mem MUST NOT be used as a mirror of project work.

#### Scenario: Canonical project artifacts

- **GIVEN** a project change record, durable specification, or historical artifact
- **WHEN** memory is used
- **THEN** `.thoth/` remains canonical and thoth-mem is not used as a mirror of project work 
