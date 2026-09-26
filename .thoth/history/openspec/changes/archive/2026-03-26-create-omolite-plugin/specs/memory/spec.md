# Memory Specification

## Purpose

Define the expected behavior for thoth-mem integration, memory-aware prompt
injection, compaction recovery, and memory lifecycle capture.

## Requirements

### Requirement: thoth-mem is registered as a local MCP by default

Unless explicitly disabled, the system MUST register `thoth-mem` as a local
stdio MCP using the default command `npx -y thoth-mem@latest`.

#### Scenario: Default thoth-mem MCP is registered

- GIVEN thoth-mem integration has not been disabled
- WHEN MCP definitions are created for the plugin
- THEN a local MCP entry for thoth-mem SHALL be present
- AND its default command SHALL be `npx -y thoth-mem@latest`

#### Scenario: Disabled thoth-mem MCP is omitted

- GIVEN configuration explicitly disables thoth-mem integration
- WHEN MCP definitions are created for the plugin
- THEN the thoth-mem MCP entry SHALL NOT be registered

#### Scenario: Unavailable thoth-mem command is surfaced as unavailable

- GIVEN thoth-mem integration is enabled
- AND the configured command cannot be started
- WHEN the plugin attempts to use the thoth-mem MCP
- THEN the system SHALL surface memory integration as unavailable
- AND it SHALL NOT claim that memory operations succeeded

### Requirement: thoth-mem invocation is configurable

The system MUST allow thoth-mem invocation settings to be configured, including
command, data directory, environment values, and timeout.

#### Scenario: Custom thoth-mem invocation settings are applied

- GIVEN configuration provides a custom thoth-mem command, data directory,
  environment, and timeout
- WHEN the thoth-mem MCP is registered
- THEN the runtime MCP definition SHALL reflect those configured values

#### Scenario: Omitted optional settings fall back to defaults

- GIVEN thoth-mem integration is enabled with no custom invocation settings
- WHEN the MCP is registered
- THEN the system SHALL use the default thoth-mem command
- AND it SHALL use default values for other optional invocation settings

### Requirement: Memory Protocol is injected into the system prompt

For tracked sessions with thoth-mem enabled, the system MUST inject the Memory
Protocol into the system prompt so the agent knows how to use persistent memory.

#### Scenario: Root session receives Memory Protocol guidance

- GIVEN a tracked root session starts with thoth-mem enabled
- WHEN the system prompt is prepared
- THEN the system prompt SHALL include Memory Protocol guidance

#### Scenario: Disabled thoth-mem omits Memory Protocol guidance

- GIVEN thoth-mem integration is disabled for the session
- WHEN the system prompt is prepared
- THEN the Memory Protocol guidance SHALL NOT be injected

### Requirement: Compaction includes memory recovery instructions

During compaction, the system MUST inject relevant memory context and MUST add a
clear FIRST ACTION instruction directing the resumed agent to recover memory
context before continuing work.

#### Scenario: Compaction injects retrieved memory context

- GIVEN a tracked session has stored memory context available
- WHEN the conversation is compacted
- THEN the compaction payload SHALL include the relevant memory context
- AND it SHALL include a FIRST ACTION instruction to recover memory context

#### Scenario: FIRST ACTION survives even when no context is found

- GIVEN a tracked session has no retrievable memory context
- WHEN the conversation is compacted
- THEN the compaction payload SHALL still include the FIRST ACTION instruction
- AND it SHALL NOT fabricate nonexistent memory context

### Requirement: Passive learnings are captured from task output

The system MUST capture passive learnings from Task tool output when that output
contains recognized passive-learning content. Output that does not contain the
recognized passive-learning content MUST NOT create passive learning entries.

#### Scenario: Recognized learnings are captured

- GIVEN Task tool output contains recognized passive-learning content
- WHEN the hook processes that output
- THEN the learnings SHALL be persisted to thoth-mem

#### Scenario: Ordinary task output is ignored for passive capture

- GIVEN Task tool output does not contain recognized passive-learning content
- WHEN the hook processes that output
- THEN no passive learning entries SHALL be created

### Requirement: Session lifecycle is tracked for root sessions only

The system MUST start memory session tracking when a root session is created and
MUST avoid registering sub-agent or background child sessions as separate root
memory sessions unless they are explicitly designated for tracking.

#### Scenario: Root session starts memory tracking

- GIVEN a new root conversation session is created
- WHEN the lifecycle hook receives the session.created event
- THEN the system SHALL start a thoth-mem session for that root session

#### Scenario: Sub-agent session is filtered from root tracking

- GIVEN a sub-agent or background child session is created
- WHEN the lifecycle hook receives the session.created event
- THEN the system SHALL NOT register that child session as a separate root
  memory session

### Requirement: User prompts are captured from message updates

For tracked root sessions, the system MUST capture user prompts from
`message.updated` events.

#### Scenario: User prompt is captured from message update

- GIVEN a tracked root session receives a user-authored message update
- WHEN the lifecycle hook processes the message.updated event
- THEN the prompt SHALL be persisted to thoth-mem for that session

#### Scenario: Non-user updates are ignored for prompt capture

- GIVEN a message.updated event does not represent a user prompt in a tracked
  root session
- WHEN the lifecycle hook processes the event
- THEN no user-prompt memory entry SHALL be created
