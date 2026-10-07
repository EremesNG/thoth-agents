# Config Specification

## Purpose

Define the configuration schema extensions and defaults needed for thoth-mem,
delegation persistence, and the updated agent roster.

## Requirements

### Requirement: Thoth configuration is supported

The configuration schema MUST support thoth-mem settings that include command,
data directory, environment values, and timeout.

#### Scenario: Valid thoth configuration is accepted

- GIVEN configuration includes valid thoth command, data directory,
  environment, and timeout values
- WHEN the plugin configuration is validated
- THEN the configuration SHALL be accepted

#### Scenario: Invalid thoth configuration is rejected

- GIVEN configuration includes an invalid thoth setting value or type
- WHEN the plugin configuration is validated
- THEN the configuration SHALL be rejected

### Requirement: Delegation configuration is supported

The configuration schema MUST support delegation settings that include storage
directory and timeout.

#### Scenario: Valid delegation configuration is accepted

- GIVEN configuration includes a valid delegation storage directory and timeout
- WHEN the plugin configuration is validated
- THEN the configuration SHALL be accepted

#### Scenario: Invalid delegation configuration is rejected

- GIVEN configuration includes an invalid delegation storage directory or
  timeout value
- WHEN the plugin configuration is validated
- THEN the configuration SHALL be rejected

### Requirement: Default agent configuration reflects the new roster

Default agent configuration MUST remove `fixer` and MUST include `quick` and
`deep` alongside `orchestrator`, `explorer`, `librarian`, `oracle`, and
`designer`.

#### Scenario: Default agent defaults include quick and deep

- GIVEN the plugin loads with default agent configuration
- WHEN the default agent entries are enumerated
- THEN quick and deep SHALL both be present in the default roster

#### Scenario: Fixer is absent from default agent defaults

- GIVEN the plugin loads with default agent configuration
- WHEN the default agent entries are enumerated
- THEN fixer SHALL NOT appear in the default roster

### Requirement: thoth-mem can be disabled independently

The configuration schema MUST allow thoth-mem integration to be disabled without
disabling unrelated MCP integrations or the core agent system.

#### Scenario: thoth-mem disable flag suppresses memory MCP only

- GIVEN configuration disables thoth-mem integration
- WHEN the plugin initializes MCP integrations
- THEN thoth-mem SHALL be disabled
- AND unrelated MCP integrations SHALL remain unaffected

#### Scenario: Core agent behavior remains available when thoth-mem is disabled

- GIVEN configuration disables thoth-mem integration
- WHEN the plugin initializes agents and tools
- THEN the core agent roster and non-memory tools SHALL remain available
