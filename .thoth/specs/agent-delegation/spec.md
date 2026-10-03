# Agent Delegation Specification

## Purpose

Durable behavioral contract for `agent-delegation`.

## Requirements

### Requirement: Delegated memory authorization

Every canonical dispatch MUST support `none`, `recall`, or `observe` authorization with bounded project, stable root session identity or `unavailable`, and context; that authorization MUST be independent of workspace mutation mode and MUST never delegate root lifecycle.

#### Scenario: US2 - Bounded agent memory usage 1

- **GIVEN** a resume request or durable decision, root cause, convention, discovery, compaction, or semantic completion boundary
- **WHEN** the root needs persistent memory
- **THEN** it loads and follows the installed thoth-mem skill rather than prescribing provider calls itself

#### Scenario: US2 - Bounded agent memory usage 2

- **GIVEN** a child dispatch
- **WHEN** memory is relevant
- **THEN** the envelope carries provider, project, stable root session identity or an explicit unavailable state, authorization, and bounded context

#### Scenario: US2 - Bounded agent memory usage 3

- **GIVEN** a read-only workspace role such as explorer or oracle
- **WHEN** the parent explicitly grants `observe`
- **THEN** the role may persist a durable provider observation without gaining workspace mutation or root lifecycle authority

#### Scenario: US2 - Bounded agent memory usage 4

- **GIVEN** a project change record, durable specification, or historical artifact
- **WHEN** memory is used
- **THEN** `.thoth/` remains canonical and thoth-mem is not used as a mirror of project work

### Requirement: Root coordinates and specialists execute by default

Shipped root instructions on every harness MUST present specialist execution of discovery for unlocated source, external research and substantive implementation as the default, MUST present root direct work only as bounded exceptions, and MUST state that project navigation rules govern the assigned investigator rather than making root the investigator.

#### Scenario: Root coordinates and specialists execute by default

- **GIVEN** a root prompt rendered for any supported harness
- **WHEN** the task needs discovery of unlocated local source and the project's instructions name navigation tools for the root
- **THEN** the prompt directs root to dispatch Explorer without preliminary reads, search, shell inspection or CodeGraph queries
