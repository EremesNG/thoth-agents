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

- **GIVEN** an SDD phase artifact
- **WHEN** memory is used
- **THEN** `openspec/` remains canonical and thoth-mem is not used as a mirror of `spec.md`, `plan.md`, `tasks.md`, or reports
