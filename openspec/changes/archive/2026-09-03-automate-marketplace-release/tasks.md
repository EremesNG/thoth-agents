# Tasks: Automate Marketplace Release Publication

## Authoring contract

Task identifiers are sequential across this file. Each task owns one exact
repository-relative path, carries its FR/SC coverage, and ends with observable
verification evidence.

## MVP scope

US1 is the first independently testable story: the repository workflow contract
passes and demonstrates that a successful release mints the scoped App token
and invokes the existing publisher after npm and GitHub release publication.
US2 completes the safe rollout by removing the competing local automatic
publisher while preserving manual recovery.

## Dependencies

`T001 -> T002 -> T003`; `T004 -> T005 -> T006 -> T007`; `T003, T007 -> T008 -> T009 -> T010`.

## Story US1

- [x] T001 [US1] Add a failing workflow contract test for post-release publication and least-privilege GitHub App authentication covering FR-001/FR-003/SC-001 in `src/harness/publish-marketplace.test.ts` | Verify: the focused test fails because the release workflow has no App token or marketplace publication steps.
- [x] T002 [US1] Add the scoped App-token and marketplace publisher steps after GitHub release creation covering FR-001/FR-003/SC-001 in `.github/workflows/release.yml` | Verify: the workflow contract test passes with secrets input, owner and repository scope, contents write, token flow, and required step ordering.
- [x] T003 [US1] Document the tag-release marketplace step and buildable verification boundary covering FR-001/FR-003/SC-001/SC-003 in `docs/agent/testing.md` | Verify: the testing route describes automatic post-release publication and the canonical marketplace integration command without claiming a live cross-repository write was tested.

## Story US2

- [x] T004 [US2] Change the publisher package-script assertions to require CI-owned automatic publication and the retained manual retry covering FR-002/SC-002 in `src/harness/publish-marketplace.test.ts` | Verify: the focused package-script assertion fails while the manifest still invokes marketplace publication locally.
- [x] T005 [US2] Change the integration lifecycle package-script assertions to the same single-publisher contract covering FR-002/SC-002 in `src/harness/integration-lifecycle.test.ts` | Verify: the focused lifecycle assertion fails for each patch, minor, and major script before the manifest change.
- [x] T006 [US2] Remove the local marketplace tail from semantic-version release scripts while keeping the manual publisher command covering FR-002/SC-002 in `package.json` | Verify: both package-script contract suites pass for all three release levels and the standalone retry command.
- [x] T007 [US2] Document CI ownership and the idempotent manual recovery path covering FR-002/SC-002/SC-003 in `docs/codex-plugin-packaging.md` | Verify: release documentation identifies the tag workflow as the sole automatic publisher and preserves the explicit retry command and safety guarantees.

## Parallel execution

- None: The workflow and manifest behavior share package-script contract tests and documentation semantics, so path-disjoint execution would still consume peer output and create avoidable reconciliation risk.

## Final verification

- [x] T008 Review only the release automation diff with the simplify contract while preserving FR-001/FR-002/FR-003 and SC-001/SC-002/SC-003 in `.github/workflows/release.yml` | Verify: no redundant steps, broader credentials, duplicate publisher, or behavior-changing cleanup remains.
- [x] T009 Run focused tests, workflow validation, build, formatting checks, typecheck, and the relevant full suite covering FR-001/FR-002/FR-003 and SC-001/SC-002/SC-003 in `package.json` | Verify: every available command passes, with any unavailable validator or environment-specific limitation recorded explicitly.
- [x] T010 Persist fresh independent Oracle judgment for FR-001/FR-002/FR-003 and SC-001/SC-002/SC-003/SC-004 in `openspec/changes/automate-marketplace-release/verify-report.md` | Verify: the compliance matrix records buildable evidence and marks the unexecuted live-release outcome as residual RISK unless real release evidence exists.
