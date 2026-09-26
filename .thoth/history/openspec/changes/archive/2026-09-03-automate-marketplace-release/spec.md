# Feature Specification: Automate Marketplace Release Publication

**Change ID**: `automate-marketplace-release`<br>
**Route**: Accelerated<br>
**Status**: Draft

## Intent and scope

**Why**: A successful thoth-agents release should update the canonical
`thoth-plugins` catalog without requiring a maintainer to run a second local
publication command.<br>
**Impact**: Tag-triggered releases will publish the released version to
`thoth-plugins/main` through a repository-scoped GitHub App token after the npm
package and GitHub release exist. Local version commands will stop acting as a
second automatic marketplace publisher, while the existing idempotent manual
retry command remains available.<br>
**Affected capabilities**: `release-publishing`

## User stories

### US1 - Publish the released plugin to the marketplace (Priority: P1)

As a maintainer, I can push a release tag and have the successful release job
update the canonical marketplace so that users see the new plugin version
without a separate local publication step.

**Independent test**: Inspect and validate the release workflow contract, then
run the existing marketplace publisher integration suite against the canonical
`thoth-plugins` repository fixture.

**Covers**: FR-001, FR-003, SC-001, SC-003, SC-004

**Acceptance scenarios**:

1. **Given** a valid release tag whose CI, build, runtime check, npm publication,
   and GitHub release succeed, **When** the release job reaches marketplace
   publication, **Then** it mints a GitHub App installation token limited to
   `thoth-plugins` contents and runs the existing marketplace publisher.
2. **Given** the marketplace already references the released version, **When**
   the automated publisher runs, **Then** it completes as the publisher's
   existing idempotent no-op rather than creating a duplicate commit.

### US2 - Keep one automatic publisher with a manual recovery path (Priority: P1)

As a maintainer, I can use the local release convenience commands without
racing the CI publisher, and I can still retry marketplace publication manually
after resolving a failed automated attempt.

**Independent test**: Validate the public package scripts for all three semantic
version levels and the retained `release:marketplace` command.

**Covers**: FR-002, FR-003, SC-002, SC-003

**Acceptance scenarios**:

1. **Given** a maintainer runs `release:patch`, `release:minor`, or
   `release:major`, **When** the command pushes its commit and tag, **Then** it
   does not invoke `release:marketplace` locally because the tag-triggered
   release workflow owns automatic publication.
2. **Given** automated marketplace publication failed after the release was
   created, **When** a maintainer runs `pnpm run release:marketplace` with valid
   credentials, **Then** the existing validated, normal non-force publication
   path can be retried.

## Edge cases

- Missing, malformed, or unauthorized GitHub App credentials must fail the
  marketplace step visibly; the workflow must not fall back to a broader token.
- The App must be installed on `EremesNG/thoth-plugins` with `Contents: write`;
  otherwise token creation or the push will fail.
- A concurrent advance of `thoth-plugins/main` remains a rejected normal push
  and requires an idempotent retry from a fresh checkout.
- A catalog already at the released version remains a successful no-op.
- Marketplace publication must not run when npm publication or GitHub release
  creation failed.

## Functional requirements

- **FR-001 — Automated marketplace publication**: `[ADDED release-publishing]` The tag-triggered release workflow MUST run the existing marketplace publisher after successful npm publication and GitHub release creation.
- **FR-002 — Single automatic publisher**: `[ADDED release-publishing]` The local patch, minor, and major release commands MUST stop invoking marketplace publication after pushing their release tags, while retaining `release:marketplace` as the explicit manual retry command.
- **FR-003 — Least-privilege cross-repository authentication**: `[ADDED release-publishing]` The automated publisher MUST authenticate with an ephemeral GitHub App installation token requested for only the `thoth-plugins` repository and `contents: write`, using Actions secrets for the App client ID and private key without persisting either credential.

## Success criteria

- **SC-001** `[buildable]`: One repository-level workflow contract test passes while proving that marketplace publication occurs after npm publication and GitHub release creation and uses a GitHub App token scoped to `thoth-plugins` contents write.
- **SC-002** `[buildable]`: All package-script contract tests pass while proving that the three local semantic-version release commands end after `git push --follow-tags` and `release:marketplace` still invokes the existing publisher.
- **SC-003** `[buildable]`: All existing marketplace integration tests pass against the canonical `thoth-plugins` checkout while preserving coverage of validated target-only changes, idempotency, and rejected concurrent pushes.
- **SC-004** `[outcome]`: The next real `v*.*.*` release completes with zero maintainer-run marketplace publication commands and either creates one bot commit updating thoth-agents in `thoth-plugins/main` or reports the catalog as already current.

## Assumptions

- `THOTH_RELEASE_APP_CLIENT_ID` and `THOTH_RELEASE_APP_PRIVATE_KEY` are available
  as GitHub Actions secrets in `thoth-agents`.
- The `thoth-plugins-release-bot` GitHub App is installed on
  `EremesNG/thoth-plugins` with repository `Contents: read and write`.
- The existing marketplace publisher remains the sole implementation of catalog
  validation, commit creation, idempotency, and normal non-force push behavior.

## Dependencies

- GitHub Actions and `actions/create-github-app-token`.
- The canonical `EremesNG/thoth-plugins` repository and its validators.
- The existing npm and GitHub release steps must succeed before marketplace
  publication starts.

## Out of scope

- Opening a pull request in `thoth-plugins` instead of pushing directly.
- Changing marketplace catalog schemas, validators, or publication semantics.
- Creating, installing, rotating, or broadening permissions for the GitHub App.
- Retrying failed marketplace publication automatically within the workflow.
