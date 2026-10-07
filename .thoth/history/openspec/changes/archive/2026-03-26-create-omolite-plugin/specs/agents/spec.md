# Agents Specification

## Purpose

Define the role boundaries, execution modes, and availability rules for the
plugin's agent roster.

## Requirements

### Requirement: Seven role-based agents

The system MUST provide exactly seven first-class agent identities for this
plugin: `orchestrator`, `explorer`, `librarian`, `oracle`, `designer`,
`quick`, and `deep`. The system MUST NOT expose `fixer` as an available agent.

#### Scenario: Default agent roster is available

- GIVEN the plugin is loaded with the create-omolite-plugin change
- WHEN the available agents are listed
- THEN the roster SHALL include orchestrator, explorer, librarian, oracle,
  designer, quick, and deep
- AND the roster SHALL NOT include fixer

#### Scenario: Legacy fixer requests are rejected

- GIVEN a caller requests the fixer agent by name
- WHEN the system validates the requested agent
- THEN the request SHALL be rejected as unsupported

### Requirement: Orchestrator is delegate-first

The orchestrator MUST coordinate repository inspection and modification work by
delegating to specialist agents. For requests that require reading or writing
workspace content, the orchestrator MUST NOT perform that work inline.

#### Scenario: Repository work is delegated

- GIVEN the orchestrator receives a request that requires code inspection or
  code changes
- WHEN it chooses how to execute the work
- THEN it SHALL delegate the repository work to one or more specialist agents
- AND it SHALL NOT complete that repository work inline by itself

#### Scenario: Pure coordination can stay in the orchestrator

- GIVEN the orchestrator receives a request that only needs planning,
  sequencing, or delegation guidance
- WHEN no repository read or write is required
- THEN the orchestrator MAY answer directly without delegating

### Requirement: Explorer and librarian are background-only read agents

`explorer` and `librarian` MUST be read-only agents and MUST be invocable
through asynchronous background delegation. Requests to run either agent through
the synchronous task flow SHALL be rejected.

#### Scenario: Explorer runs asynchronously with read-only scope

- GIVEN a caller launches explorer through the background task flow
- WHEN the request is accepted
- THEN the task SHALL run asynchronously
- AND explorer SHALL be limited to read-only behavior

#### Scenario: Librarian runs asynchronously with read-only scope

- GIVEN a caller launches librarian through the background task flow
- WHEN the request is accepted
- THEN the task SHALL run asynchronously
- AND librarian SHALL be limited to read-only behavior

#### Scenario: Synchronous execution is blocked for explorer and librarian

- GIVEN a caller attempts to run explorer or librarian through the synchronous
  task flow
- WHEN the system validates the execution mode
- THEN the request SHALL be rejected as an incompatible mode for that agent

### Requirement: Quick, deep, and designer are synchronous write-capable agents

`quick`, `deep`, and `designer` MUST be write-capable agents and MUST be
invocable through the synchronous task flow for work that needs immediate
completion in the active conversation.

#### Scenario: Deep can complete write-capable synchronous work

- GIVEN a caller runs deep through the synchronous task flow
- WHEN the task requires workspace modifications
- THEN deep SHALL be permitted to perform write-capable work
- AND the result SHALL be returned synchronously to the caller

#### Scenario: Quick can complete write-capable synchronous work

- GIVEN a caller runs quick through the synchronous task flow
- WHEN the task requires workspace modifications
- THEN quick SHALL be permitted to perform write-capable work
- AND the result SHALL be returned synchronously to the caller

#### Scenario: Designer can complete write-capable synchronous work

- GIVEN a caller runs designer through the synchronous task flow
- WHEN the task requires artifact or workspace updates
- THEN designer SHALL be permitted to perform write-capable work
- AND the result SHALL be returned synchronously to the caller

#### Scenario: Background execution is blocked for synchronous write agents

- GIVEN a caller attempts to launch quick, deep, or designer through the
  background task flow
- WHEN the system validates the execution mode
- THEN the request SHALL be rejected as an incompatible mode for that agent

### Requirement: Oracle is a synchronous read-only agent

`oracle` MUST be read-only and MUST be invocable through the synchronous task
flow for analysis, reasoning, or review that does not modify workspace content.

#### Scenario: Oracle performs synchronous read-only analysis

- GIVEN a caller runs oracle through the synchronous task flow
- WHEN the requested work is analysis or review
- THEN oracle SHALL be available synchronously
- AND oracle SHALL remain read-only

#### Scenario: Background execution is blocked for oracle

- GIVEN a caller attempts to launch oracle through the background task flow
- WHEN the system validates the execution mode
- THEN the request SHALL be rejected as an incompatible mode for that agent
