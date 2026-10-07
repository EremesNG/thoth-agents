# Change: pi-packages-npm-release

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: medium
**Risk**: high

## Exploration

- `.github/workflows/release.yml` triggers only on `v*.*.*` tags, verifies the tag
  commit is in `main`/`master`, waits for the exact-SHA push CI, installs, builds,
  runs `src/plugin-node-runtime.test.ts`, generates notes with
  `scripts/generate-release-notes.ts`, runs `npm publish --ignore-scripts` for the
  root package only through OIDC (`id-token: write`, no token secret), creates the
  GitHub release, then publishes the marketplace catalog. No `pi-packages/*`
  package is published by any active workflow.
- `.github/workflows/ci.yml` runs on push/PR to `main`/`master`: Ubuntu root
  checks plus nine Pi package typechecks/offline tests, and a Windows job for the
  nine Pi packages only.
- Root `package.json` is `0.4.2`; root bumps use `release:patch|minor|major`
  (`npm version … && git push --follow-tags`) and the `version` lifecycle runs
  integration sync/verify. No Pi package has a bump script; only `pi-subagents`
  has `release: semantic-release`. `npm version` run inside a subdirectory edits
  only that `package.json` (no commit/tag).
- None of the nine `@thoth-agents/pi-*` packages exists on npm (user-confirmed);
  only `thoth-agents` is published. The root CLI installs
  `pi-subagents`, `pi-questions-user` and the Pi work-list package with `>=` ranges
  (`src/cli/pi-install.ts:51-89`); `pi-core` is transitive.
- Nine Pi packages ship TypeScript source loaded directly by Pi. Gaps:
  `pi-claude-bridge` and `pi-subagents` lack `publishConfig.access: public`;
  `pi-claude-bridge` `repository` points to `elidickinson/pi-claude-bridge`;
  `files` allowlists of antigravity-bridge, claude-bridge and subagents do not
  exclude tests. Internal deps use `workspace:^`, rewritten only by pnpm pack/publish.
- Vendored pipelines: `pi-packages/pi-subagents/.github/workflows/{ci,publish}.yml`,
  `pi-packages/pi-subagents/.releaserc.json` (required by
  `scripts/verify-package-files.mjs:16`, asserted in `test/package.test.ts`,
  listed in `files[]`, semantic-release devDependencies at `package.json:70-77`),
  `pi-packages/pi-claude-bridge/.github/{workflows/ci.yml,ISSUE_TEMPLATE/bug_report.md}`.
- `scripts/generate-release-notes.ts` selects the previous tag as the newest tag
  merged into the target with no prefix filter (`:95-106`) and lists commits with
  no path filter (`:109-147`). Once package tags exist, root notes would pick a
  package tag as the previous release. It has no test; vitest collects `src/**` only.
- Workflow-content tests: `src/plugin-node-runtime.test.ts:85-103` (Node 22.19 in
  CI/release), `src/harness/publish-marketplace.test.ts:175-212` (release step order).
- External evidence (Librarian, 2026-10-06): npm trusted publishing cannot be
  configured for a nonexistent package; `npm trust github` needs npm >=11.15.0,
  account 2FA and an existing package; trust config is per package and one
  workflow file may serve many packages; provenance is automatic under OIDC for
  public repo/package; pnpm 11 publishes natively with OIDC (11.0.7 makes OIDC win
  over static tokens per package in recursive publish); `pnpm publish -r` skips
  versions already in the registry, honors `publishConfig.access` (11.2.0+), and
  `--report-summary` writes `pnpm-publish-summary.json` only after the whole loop
  succeeds in 11.2.2 (not on partial failure).
- Specs: `release-publishing` covers only tag-driven root marketplace publication;
  `pi-ecosystem` and `project-tooling` have no npm publication contract.

## Intent

Publish every `pi-packages/*` package to npm with independent versions from the
existing root `v*` tag release, before the root package, creating one git tag and
one GitHub release per newly published package version with notes generated from
commits touching that package directory. Root release notes cover root changes
plus a list of Pi package versions released with that tag. A root command bumps a
Pi package version, and PR CI warns when a Pi package changes without a bump.

## Non-goals

- Bumping the root to 0.5.0, creating `v0.5.0`, or performing any real npm
  publication; the first manual publication and `npm trust` setup are user actions.
- Publishing on push to `main`; changesets, release-please, semantic-release, or
  lockstep versioning.
- Changing Pi package runtime code or the marketplace flow.
- Making CI run the build or adding root tests to the Windows job.

## Acceptance

- AC-1: `scripts/generate-release-notes.ts` supports package-scoped notes (tag
  prefix plus included path), root notes that consider only `v*` tags and omit
  commits touching only an excluded path, and a "Pi packages" section listing
  package tags pointing at the target; covered by automated tests.
- AC-2: All nine Pi package manifests are publish-ready at version `0.1.0`, and
  the root CLI Pi install specs for first-party packages use `>=0.1.0`: public
  access, this repository's `repository` metadata, packed tarballs exclude tests and vendored
  release config, `workspace:^` rewritten on pack; vendored pipelines and
  semantic-release are removed from `pi-subagents` and `pi-claude-bridge` with
  their checks/docs updated, and every package's typecheck/tests still pass.
- AC-3: On a `v*.*.*` tag, `release.yml` publishes unpublished Pi package versions
  with OIDC before the root npm publication; a failed Pi publication blocks root
  publication; an always-run reconciliation idempotently creates a
  `<name>@<version>` tag and GitHub release (package-scoped notes) for every Pi
  package version on npm without a tag; the root release notes include the Pi
  packages section and exclude Pi-only commits. Structure asserted by automated tests.
- AC-4: `pnpm release:pi <package> <patch|minor|major>` validates input and bumps
  only that Pi package version without commit or tag; PR CI emits a non-blocking
  warning for each Pi package whose non-test files changed without a version
  change. Both covered by automated tests.
- AC-5: Routed docs describe the release flow, Pi bumping, the bump warning and
  the exact one-time bootstrap runbook (manual first publish with 2FA, pi-core
  first, then `npm trust github` per package against `release.yml`).
- AC-6: `pnpm run check:ci`, `pnpm run typecheck`, `pnpm run build`, `pnpm test`
  and all nine Pi package typecheck/offline tests pass.

## Clarifications

- Versioning: independent per package; publish only versions not yet on npm (user).
- Trigger: Pi publication runs behind the root `v*` tag; a Pi-only release also
  bumps the root version (user, replaces publish-on-main).
- Every published package, root included, gets a GitHub release with changelog;
  root notes list released Pi package versions and detail only root changes (user).
- Scope: all nine Pi packages (user).
- Vendored pipelines: remove and centralize (user).
- First publication: user publishes manually from local with 2FA, then runs
  `npm trust` per package (user).
- Package changelog source: commits touching the package folder since its previous
  package tag (user).
- Bump UX: root script `pnpm release:pi <package> <level>` (user).
- Missing-bump detection: PR CI warning, non-blocking (user).
- Initial versions: all nine Pi packages start at `0.1.0` (user); the user needs
  the exact ordered bootstrap commands (manual first publish and trust setup).

## Decisions

- `release.yml` new step order after "Check built plugin runtime": Publish Pi
  packages (`pnpm publish -r --filter "./pi-packages/*" --ignore-scripts
  --no-git-checks`), then an always-run Reconcile Pi releases step gated on a
  successful install, then root notes, root `npm publish`, GitHub release and
  marketplace as today. A failed Pi publish fails the job after reconciliation, so
  root publication does not run.
- Reconciliation does not depend on `pnpm-publish-summary.json` (unreliable on
  partial failure in 11.2.2): for each Pi package whose `npm view <name>@<version>
  version` confirms the version, reconcile two independent conditions: (a) when the
  tag `<name>@<version>` is absent on the remote, create the annotated tag at the
  release commit and push it; (b) when no GitHub release exists for that tag
  (`gh release view`), generate package-scoped notes with `--to <tag>` (the tag now
  exists) and create the release with `--verify-tag`. A tag present with a missing
  release is repaired on rerun; reruns with both present are no-ops.
- Tag format `<package-name>@<version>`, for example `@thoth-agents/pi-subagents@1.0.1`;
  root keeps `v<version>`, which the `v*.*.*` trigger already isolates.
- Generator CLI additions: `--tag-prefix <prefix>` (default `v`), `--path <dir>`
  (include only commits touching it), `--exclude-path <dir>` (drop commits whose
  changed files are all inside it), `--package-tags <glob>` (append a "Pi packages"
  section listing tags matching the glob that point at the target, linking their
  releases). Root release call uses `--exclude-path pi-packages --package-tags
  '@thoth-agents/*@*'`; existing positional/`--from`/`--to` usage stays compatible.
- `scripts/release-pi.mjs` behind root script `release:pi`: accepts a directory
  name (`pi-subagents`) or full package name and a level; rejects nonexistent packages
  and levels; runs `npm version <level> --no-git-tag-version` in that package
  directory; prints the new version and next steps (commit, then root `release:*`).
- `scripts/check-pi-version-bumps.mjs` run in a new `ci.yml` step on
  `pull_request` only, after explicitly fetching the PR base ref (checkout is
  shallow): compares against the PR base; for each Pi package with changed files
  outside test paths (`test/`, `tests/`, `*.test.ts`, `*.test.tsx`, `*.test.mjs`)
  and an unchanged `version`, emits a GitHub `::warning::` annotation and exits 0.
- Trusted publisher workflow filename for all nine packages: `release.yml`.
- Every Pi package `version` is set to `0.1.0` for the first publication;
  `PI_PACKAGE_SPECS` in `src/cli/pi-install.ts:54-56` changes both the
  `@thoth-agents/pi-subagents@>=1.0.0` source range and its `version` floor to
  `0.1.0` (other first-party specs already use `>=0.1.0`). Active advertised
  versions/ranges above `0.1.0` for first-party Pi packages are updated:
  `README.md:96-97`, `docs/installation.md:37,216-217`,
  `docs/agent/cli-installation.md:81`, `docs/agent/architecture.md:36`,
  `docs/agent/harness-packaging.md:32` (U5),
  `pi-packages/pi-subagents/README.md:41,46,60`,
  `pi-packages/pi-subagents/skills/subagents-configuration/SKILL.md:133,144,270`,
  and assertions in `src/cli/pi-install.test.ts:362,2585,2594,2605`,
  `src/cli/install.test.ts:212` and `src/cli/operations/pi.test.ts:143,201-203`.
  Intentional newer-version test fixtures and upstream attribution are preserved. Historical references (archived
  changes, `.thoth/history/`, package CHANGELOG history) stay unchanged.
- `pi-claude-bridge` `repository` points to `EremesNG/thoth-agents` with its
  directory; upstream attribution stays in README/LICENSE.
- `pi-subagents` loses semantic-release scripts/devDependencies, `.releaserc.json`
  and its assertions; its `prepublishOnly` check stays for manual publishes.

## Durable deltas

- `ADDED release-publishing` **Pi package publication in the root release** — The tag-triggered root release MUST publish through npm trusted publishing every `pi-packages/*` package version not yet on npm before publishing the root package, without token secrets, and MUST NOT publish the root package when any Pi publication fails.
  - GIVEN a `v*.*.*` tag whose commit passed push CI and a Pi package version absent from npm; WHEN the release workflow runs; THEN that Pi version is published with OIDC before the root package and versions already on npm are skipped.
- `ADDED release-publishing` **Per-package tags and GitHub releases** — Every Pi package version present on npm MUST have one `<name>@<version>` tag and one GitHub release whose notes list only commits touching that package directory since its previous package tag; reconciliation MUST be idempotent and MUST run after partial publication failures.
  - GIVEN a Pi package version on npm without a matching tag; WHEN the release workflow finishes, even after another Pi package failed; THEN the tag and a GitHub release with package-scoped notes exist and rerunning creates no duplicates.
- `ADDED release-publishing` **Root release notes scope** — Root release notes MUST select the previous release only among `v*` tags, MUST omit commits that only touch `pi-packages/`, and MUST list the Pi package versions tagged at the release commit.
  - GIVEN Pi package tags newer than the last `v*` tag and Pi-only commits; WHEN root notes are generated for a new `v*` tag; THEN the range starts at the previous `v*` tag, Pi-only commits are absent, and released Pi package versions are listed.
- `ADDED release-publishing` **Pi version bump and missing-bump warning** — A root command MUST bump one Pi package version without creating a commit or tag, and pull request CI MUST warn without failing when a Pi package changes non-test files without a version change.
  - GIVEN a pull request changing a Pi package's source without changing its version; WHEN CI runs; THEN a warning annotation names that package and the job does not fail.

## Plan

Four implementation units with frozen interfaces (Decisions), then a docs unit,
root integration checks and a fresh final Oracle.

- U1 notes generator (worker): implement the four generator flags in
  `scripts/generate-release-notes.ts`, extracting testable functions; add
  `src/harness/generate-release-notes.test.ts` using a temporary git repository
  for prefix, include path, exclude path, package-tags section and root default.
- U2 package readiness (worker): the nine `pi-packages/*/package.json` (access,
  repository, files exclusions), delete vendored pipeline files, remove
  semantic-release from `pi-subagents` (scripts, devDependencies, `files`,
  `scripts/verify-package-files.mjs`, `test/package.test.ts`, README release
  section), update `pi-packages/pi-core/README.md:229-234`, set every version to
  `0.1.0`, update `src/cli/pi-install.ts` subagents spec/floor, its active
  documentation references and downstream tests, refresh `pnpm-lock.yaml`.
- U3 release workflow (worker): edit `.github/workflows/release.yml` per Decisions
  using the frozen generator flags; extend workflow assertions in
  `src/harness/publish-marketplace.test.ts` or a new
  `src/harness/release-workflow.test.ts` for step order, Pi publish command,
  always-run reconciliation gating, and root notes flags.
- U4 bump tooling (worker): `scripts/release-pi.mjs`, `scripts/check-pi-version-bumps.mjs`,
  root `package.json` `release:pi` script, `ci.yml` PR-only warning step, tests in
  `src/harness/release-pi.test.ts` and `src/harness/check-pi-version-bumps.test.ts`.
- U5 docs (worker, after U3/U4 accepted): `docs/agent/harness-packaging.md` and
  `docs/agent/testing.md`.
- Root: run AC-6, dispatch final Oracle, archive with spec deltas.

Risks: the Pi publish path is untestable end-to-end before a real tag (mitigated
by structural tests and bootstrap before `v0.5.0`); without bootstrap and trust,
the first tag fails at Pi publish before root publication; `isAlreadyPublished` in
pnpm 11.2.2 treats registry errors as unpublished, producing a loud republish
failure rather than silent harm; a 0.x `pi-core` minor bump is outside consumers'
published caret range until they are also bumped (documented).

## Tasks

- [x] AC-1: Release-note generator flags with tests
  - Outcome: generator supports `--tag-prefix`, `--path`, `--exclude-path`, `--package-tags`
  - Known entrypoints and skill paths: `scripts/generate-release-notes.ts`; `package.json` `release:notes`; skills `C:\Users\EremesNG\.pi\agent\skills\tdd\SKILL.md`, `C:\Users\EremesNG\.pi\agent\skills\simplify\SKILL.md`
  - Inputs: Exploration and Decisions in this record
  - Dependencies: none
  - Output: updated generator and new vitest test
  - Owner: thoth-worker
  - Writes: `scripts/generate-release-notes.ts`, `src/harness/generate-release-notes.test.ts`
  - Interface boundaries: positional output, `--from`, `--to` stay compatible; flags exactly as in Decisions
  - Focused check and PASS evidence: `pnpm exec vitest run src/harness/generate-release-notes.test.ts` and `pnpm run typecheck` pass
  - Return milestone: tests green for all flag cases and root default
  - Stop / reassessment: a flag requires changing the GitHub compare/author behavior
- [x] AC-2: Nine Pi packages publish-ready and vendored pipelines removed
  - Outcome: manifests, removals, subagents checks and docs consistent; tarballs clean
  - Known entrypoints and skill paths: `pi-packages/*/package.json`; `pi-packages/pi-subagents/{.github,.releaserc.json,scripts/verify-package-files.mjs,test/package.test.ts,README.md}`; `pi-packages/pi-claude-bridge/.github`; `pi-packages/pi-core/README.md`; `pi-packages/pi-subagents/skills/subagents-configuration/SKILL.md`; `pi-packages/pi-subagents/README.md`; `src/cli/pi-install.ts` `PI_PACKAGE_SPECS`; `src/cli/pi-install.test.ts`; `src/cli/install.test.ts`; `src/cli/operations/pi.test.ts`; `README.md`; `docs/installation.md`; `docs/agent/cli-installation.md`; `docs/agent/architecture.md`; `pnpm-lock.yaml`; skill `C:\Users\EremesNG\.pi\agent\skills\simplify\SKILL.md`
  - Inputs: Exploration and Decisions in this record
  - Dependencies: none
  - Output: edited manifests/tests/docs, deleted vendored files, refreshed lockfile
  - Owner: thoth-worker
  - Writes: the paths above under `pi-packages/`, `src/cli/pi-install.ts` (subagents spec and floor only), `src/cli/pi-install.test.ts`, `src/cli/install.test.ts`, `src/cli/operations/pi.test.ts`, `README.md`, `docs/installation.md`, `docs/agent/cli-installation.md`, `docs/agent/architecture.md` (advertised Pi package versions only), `pnpm-lock.yaml`
  - Interface boundaries: package names, `pi` manifests and runtime code unchanged; versions become `0.1.0`
  - Focused check and PASS evidence: each package typecheck and offline tests pass; `pnpm exec vitest run src/cli/pi-install.test.ts src/cli/install.test.ts src/cli/operations/pi.test.ts` passes; no active non-historical `pi-subagents@>=1.0.0` reference remains; `pnpm pack` per package lists no test files or `.releaserc.json` and rewrites `workspace:^`
  - Return milestone: all nine packages checked with pack evidence summarized
  - Stop / reassessment: a test exclusion breaks Pi loading, or a version reset breaks another consumer
- [x] AC-3: Root release workflow publishes Pi packages and reconciles tags/releases
  - Outcome: `release.yml` implements the Decisions step order and reconciliation; tests assert it
  - Known entrypoints and skill paths: `.github/workflows/release.yml`, `src/harness/publish-marketplace.test.ts`, `src/plugin-node-runtime.test.ts`; skill `C:\Users\EremesNG\.pi\agent\skills\tdd\SKILL.md`
  - Inputs: Decisions; frozen generator flags
  - Dependencies: none for authoring; AC-1 accepted before final verification
  - Output: edited workflow and workflow test
  - Owner: thoth-worker
  - Writes: `.github/workflows/release.yml`, `src/harness/release-workflow.test.ts`, `src/harness/publish-marketplace.test.ts` (only if existing order assertions need updating)
  - Interface boundaries: marketplace steps, CI wait and branch verification unchanged
  - Focused check and PASS evidence: `pnpm exec vitest run src/harness/release-workflow.test.ts src/harness/publish-marketplace.test.ts src/plugin-node-runtime.test.ts` passes, including assertions that tag and release existence are checked independently (tag-present/release-missing path creates the release)
  - Return milestone: workflow and tests green
  - Stop / reassessment: OIDC or reconciliation cannot be expressed within `release.yml`
- [x] AC-4: `release:pi` bump command and PR missing-bump warning
  - Outcome: both scripts, root script entry and CI step, with tests
  - Known entrypoints and skill paths: root `package.json`, `.github/workflows/ci.yml`; skill `C:\Users\EremesNG\.pi\agent\skills\tdd\SKILL.md`
  - Inputs: Decisions
  - Dependencies: none
  - Output: `scripts/release-pi.mjs`, `scripts/check-pi-version-bumps.mjs`, tests, CI step
  - Owner: thoth-worker
  - Writes: `scripts/release-pi.mjs`, `scripts/check-pi-version-bumps.mjs`, `package.json` (scripts only), `.github/workflows/ci.yml` (one PR-only step), `src/harness/release-pi.test.ts`, `src/harness/check-pi-version-bumps.test.ts`
  - Interface boundaries: existing CI jobs and checks unchanged
  - Focused check and PASS evidence: `pnpm exec vitest run src/harness/release-pi.test.ts src/harness/check-pi-version-bumps.test.ts src/plugin-node-runtime.test.ts` passes
  - Return milestone: scripts and tests green
  - Stop / reassessment: base-diff detection is unavailable in the PR checkout
- [x] AC-5: Release docs and bootstrap runbook
  - Outcome: routed docs describe release flow, bumping, warning and one-time bootstrap
  - Known entrypoints and skill paths: `docs/agent/harness-packaging.md:195-215`, `docs/agent/testing.md:40-69`, `docs/agent/index.md`
  - Inputs: accepted AC-3 and AC-4 outputs
  - Dependencies: AC-3, AC-4
  - Output: updated docs
  - Owner: thoth-worker
  - Writes: `docs/agent/harness-packaging.md`, `docs/agent/testing.md`
  - Interface boundaries: none
  - Focused check and PASS evidence: `pnpm run check:ci` passes; `docs/agent/harness-packaging.md:32` advertises `0.1.0`; a repository-wide search finds no active non-historical first-party Pi version above `0.1.0`; runbook lists pi-core first and `npm trust github <name> --file release.yml --repo EremesNG/thoth-agents`
  - Return milestone: docs updated
  - Stop / reassessment: docs require choices absent from Decisions
- [x] AC-6: Integrated verification
  - Outcome: full local pre-merge order passes on the combined diff
  - Known entrypoints and skill paths: root `package.json` scripts; `pi-packages/*/package.json`
  - Inputs: accepted AC-1..AC-5
  - Dependencies: AC-1, AC-2, AC-3, AC-4, AC-5
  - Output: check results recorded in Verification
  - Owner: root
  - Writes: none
  - Interface boundaries: none
  - Focused check and PASS evidence: `pnpm run check:ci`, `pnpm run typecheck`, `pnpm run build`, `pnpm test`, nine Pi package typecheck/offline tests exit 0
  - Return milestone: all checks green
  - Stop / reassessment: any failure outside owned surfaces

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW

User selected Oracle review. Rounds 1 and 2 REJECT (reconciliation gating; version-reset consumers), record amended; fresh round 3 [OKAY]. Non-blocking: also update `src/cli/operations/pi.test.ts:267` (U2) and run U5 version sweep after U2.
**Implementation**: AUTHORIZED

User selected Implement after [OKAY] on 2026-10-06.

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 70dfaf912bb771360bb40e63b8b3ec79db267108c99ebfdf34aeceb293c31e6b

Final rounds: 1 FAIL (annotated root tags missed by `--points-at`; stale installation doc; fatal CI fetch) and 2 FAIL (Pi-only merge commits kept by `--exclude-path`), each fixed red-to-green by fresh workers; fresh round 3 PASS with 255/255 focused tests, check:ci, typecheck, diff check and validator verify. Live npm/OIDC/GitHub publication not exercised; requires the documented bootstrap.

- AC-1: PASS | `pnpm exec vitest run src/harness/generate-release-notes.test.ts` | 8/8 pass (prefix, path, exclude-path, package-tags, root default, normalizeRef); typecheck PASS
- AC-2: PASS | nine package typechecks; `vitest run src/cli/pi-install.test.ts src/cli/install.test.ts src/cli/operations/pi.test.ts`; `pnpm pack` per package | all versions 0.1.0, access public; 221 CLI tests pass; tarballs contain no tests/.releaserc.json/.github; packed pi-core dep `^0.1.0`; no active first-party `>=1.0.0` left
- AC-3: PASS | `vitest run src/harness/release-workflow.test.ts src/harness/publish-marketplace.test.ts src/plugin-node-runtime.test.ts` | 17/17; Pi publish before root, always-run reconcile gated on install, independent tag/release checks
- AC-4: PASS | `vitest run src/harness/release-pi.test.ts src/harness/check-pi-version-bumps.test.ts` | 19 tests pass; PR-only ci.yml step asserted
- AC-5: PASS | `rg -n "pi-subagents@>=1.0.0|semantic-release" docs/agent` | no matches; harness-packaging.md Release flow/Bumping/One-time bootstrap sections, testing.md release order
- AC-6: PASS | `check:ci`, `typecheck`, `build`, `pnpm test`, nine Pi typecheck/tests | check:ci/typecheck/build exit 0 with no generated drift; pnpm test 1573/1574, sole failure publish-marketplace "tag is not visible" 5s timeout under load in an untouched test, passes isolated 2x; Pi typechecks 9/9; tests pass for core, openai-fast, questions-user, subagents, todo, claude-bridge(test:unit); background-tasks Windows integration and thoth-theme perf test failed under load and pass isolated; antigravity-bridge acp/driver lifecycle tests fail with and without this change (baseline package.json reproduces), pre-existing Windows flakiness
- Source: .thoth/specs/release-publishing/spec.md | sha256:f9d95b6191c03a9a79e090a5a513f7cd23cc0b677ba58737b631da934fe1b16e

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
