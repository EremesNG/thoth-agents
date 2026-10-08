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

### Requirement: Pi package publication in the root release

The tag-triggered root release MUST publish through npm trusted publishing every `pi-packages/*` package version not yet on npm before publishing the root package, without token secrets, and MUST NOT publish the root package when any Pi publication fails.

#### Scenario: Pi package publication in the root release

- **GIVEN** a `v*.*.*` tag whose commit passed push CI and a Pi package version absent from npm
- **WHEN** the release workflow runs
- **THEN** that Pi version is published with OIDC before the root package and versions already on npm are skipped

### Requirement: Per-package tags and GitHub releases

Every Pi package version present on npm MUST have one `<name>@<version>` tag and one GitHub release whose notes list only commits touching that package directory since its previous package tag; reconciliation MUST be idempotent and MUST run after partial publication failures.

#### Scenario: Per-package tags and GitHub releases

- **GIVEN** a Pi package version on npm without a matching tag
- **WHEN** the release workflow finishes, even after another Pi package failed
- **THEN** the tag and a GitHub release with package-scoped notes exist and rerunning creates no duplicates

### Requirement: Root release notes scope

Root release notes MUST select the previous release only among `v*` tags, MUST omit commits that only touch `pi-packages/`, and MUST list the Pi package versions tagged at the release commit.

#### Scenario: Root release notes scope

- **GIVEN** Pi package tags newer than the last `v*` tag and Pi-only commits
- **WHEN** root notes are generated for a new `v*` tag
- **THEN** the range starts at the previous `v*` tag, Pi-only commits are absent, and released Pi package versions are listed

### Requirement: Pi version bump and missing-bump warning

A root command MUST bump one Pi package version without creating a commit or tag, and pull request CI MUST warn without failing when a Pi package changes non-test files without a version change.

#### Scenario: Pi version bump and missing-bump warning

- **GIVEN** a pull request changing a Pi package's source without changing its version
- **WHEN** CI runs
- **THEN** a warning annotation names that package and the job does not fail

### Requirement: Pi extension bundles built before publication

The tag-triggered release MUST generate every Pi extension bundle before publishing `pi-packages/*`, and CI MUST build the bundles and load each one through Pi's extension loader.

#### Scenario: Pi extension bundles built before publication

- **GIVEN** a release tag for a Pi extension package version not yet on npm
- **WHEN** the release workflow publishes Pi packages
- **THEN** the published tarball contains the freshly generated bundle referenced by its Pi extension entry
