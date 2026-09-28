# Release Publishing Specification

## Purpose

Durable behavioral contract for `release-publishing`.

## Requirements

### Requirement: Automated marketplace publication

The tag-triggered release workflow MUST run the existing marketplace publisher after successful npm publication and GitHub release creation.

#### Scenario: US1 - Publish the released plugin to the marketplace 1

- **GIVEN** a valid release tag whose CI, build, runtime check, npm publication, and GitHub release succeed
- **WHEN** the release job reaches marketplace publication
- **THEN** it mints a GitHub App installation token limited to `thoth-plugins` contents and runs the existing marketplace publisher

#### Scenario: US1 - Publish the released plugin to the marketplace 2

- **GIVEN** the marketplace already references the released version
- **WHEN** the automated publisher runs
- **THEN** it completes as the publisher's existing idempotent no-op rather than creating a duplicate commit

### Requirement: Single automatic publisher

The local patch, minor, and major release commands MUST stop invoking marketplace publication after pushing their release tags, while retaining `release:marketplace` as the explicit manual retry command.

#### Scenario: US2 - Keep one automatic publisher with a manual recovery path 1

- **GIVEN** a maintainer runs `release:patch`, `release:minor`, or `release:major`
- **WHEN** the command pushes its commit and tag
- **THEN** it does not invoke `release:marketplace` locally because the tag-triggered release workflow owns automatic publication

#### Scenario: US2 - Keep one automatic publisher with a manual recovery path 2

- **GIVEN** automated marketplace publication failed after the release was created
- **WHEN** a maintainer runs `pnpm run release:marketplace` with valid credentials
- **THEN** the existing validated, normal non-force publication path can be retried

### Requirement: Least-privilege cross-repository authentication

The automated publisher MUST authenticate with an ephemeral GitHub App installation token requested for only the `thoth-plugins` repository and `contents: write`, using Actions secrets for the App client ID and private key without persisting either credential.

#### Scenario: US1 - Publish the released plugin to the marketplace 1

- **GIVEN** a valid release tag whose CI, build, runtime check, npm publication, and GitHub release succeed
- **WHEN** the release job reaches marketplace publication
- **THEN** it mints a GitHub App installation token limited to `thoth-plugins` contents and runs the existing marketplace publisher

#### Scenario: US1 - Publish the released plugin to the marketplace 2

- **GIVEN** the marketplace already references the released version
- **WHEN** the automated publisher runs
- **THEN** it completes as the publisher's existing idempotent no-op rather than creating a duplicate commit

#### Scenario: US2 - Keep one automatic publisher with a manual recovery path 1

- **GIVEN** a maintainer runs `release:patch`, `release:minor`, or `release:major`
- **WHEN** the command pushes its commit and tag
- **THEN** it does not invoke `release:marketplace` locally because the tag-triggered release workflow owns automatic publication

#### Scenario: US2 - Keep one automatic publisher with a manual recovery path 2

- **GIVEN** automated marketplace publication failed after the release was created
- **WHEN** a maintainer runs `pnpm run release:marketplace` with valid credentials
- **THEN** the existing validated, normal non-force publication path can be retried
