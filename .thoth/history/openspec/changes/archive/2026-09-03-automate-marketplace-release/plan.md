# Implementation Plan: Automate Marketplace Release Publication

## Technical context

The existing tag-triggered workflow in `.github/workflows/release.yml` waits for
CI, builds and checks the package, publishes npm, and creates the GitHub release,
but never invokes `scripts/publish-marketplace.mjs`. The local semantic-version
scripts in `package.json` currently push the tag and immediately invoke that
publisher, which makes publication dependent on the maintainer's local
credentials and would create two competing publishers once CI is automated.

The publisher already owns all catalog safety behavior: it confirms the release
tag, shallow-clones `EremesNG/thoth-plugins`, invokes the central updater and
validators, permits only the three catalog files, treats an already-current
version as success, and performs a normal non-force push. This change composes
that existing boundary with an ephemeral GitHub App installation token; it does
not reimplement marketplace logic in this repository.

Implementation ownership remains with Root because the workflow, manifest
scripts, contract tests, and routed documentation form one short, ordered,
coupled behavior change and the relevant context is already loaded. Root owns
`.github/workflows/release.yml`, `package.json`, the affected tests, and release
documentation. A fresh read-only Oracle will own final verification.

## Constitution Check (pre-design)

- **Adaptive-root orchestration**: PASS — The user selected Accelerated SDD after a scope and risk assessment; Root retains the coupled implementation because delegation would add rediscovery without independent mutable work.
- **Explicit role boundaries**: PASS — Root owns planning and the single product-writing surface; the final Oracle remains read-only and independent.
- **Proportional Spec Kit-compatible SDD**: PASS — The selected Accelerated route uses the required fast-forward specification, plan, tasks, ready, verification, and archive gates without optional artifacts that resolve no concrete risk.
- **Truthful multi-harness contracts**: PASS — The design changes repository release automation only and does not claim new harness enforcement or invoke installation/network provisioning during SDD.
- **Independent provider ownership**: PASS — No thoth-mem provider code, setup, hook, lifecycle, or persistence behavior changes.
- **Evidence-led completion**: PASS — The design requires red/green contract tests, static workflow validation, the marketplace integration suite, repository checks, and fresh Oracle verification before archive.

## Design

### Requirement mapping

| Requirement | Technical decision | Files/interfaces | Verification seam |
| --- | --- | --- | --- |
| FR-001 | Add token creation and marketplace publication steps after the existing GitHub release step so failed upstream publication prevents the cross-repository push. | `.github/workflows/release.yml`; `pnpm run release:marketplace` | A workflow contract test reads the repository workflow and verifies step order and the publisher command. |
| FR-002 | Remove the marketplace tail from `release:patch`, `release:minor`, and `release:major`; preserve the standalone manual retry command unchanged. | `package.json`; npm script interface | Existing package-script assertions in `src/harness/publish-marketplace.test.ts` and `src/harness/integration-lifecycle.test.ts` fail first, then pass with the new single-publisher contract. |
| FR-003 | Mint an installation token with `actions/create-github-app-token@v3`, sourcing both configured values from Actions secrets, setting `owner` to the current repository owner, restricting `repositories` to `thoth-plugins`, and requesting only `permission-contents: write`; expose the token only as `GH_TOKEN` to `gh auth setup-git` and the publisher in one step. | `.github/workflows/release.yml`; `THOTH_RELEASE_APP_CLIENT_ID`; `THOTH_RELEASE_APP_PRIVATE_KEY`; Git credential helper | The workflow contract test verifies secret references, owner/repository/permission inputs, token flow, and absence of a broader fallback credential. |

### Execution and sequencing

1. Change the package-script and workflow contract assertions first and run the
   focused tests to capture the expected red state.
2. Update `package.json` and `.github/workflows/release.yml` minimally until the
   focused contracts pass.
3. Update `docs/codex-plugin-packaging.md` and `docs/agent/testing.md` so operator
   recovery and release behavior match the executable contract.
4. Run the simplify review over only this change, then execute focused tests,
   static workflow validation, repository checks, full relevant tests, and a
   fresh Oracle verification.

### Verification strategy

- TDD seam: the repository-owned npm scripts and release workflow are the public
  maintainer interfaces; publisher integration remains the behavioral boundary
  for catalog mutation.
- Focused red/green: `pnpm exec vitest run
  src/harness/publish-marketplace.test.ts
  src/harness/integration-lifecycle.test.ts`.
- Workflow syntax/static contract: run the new Vitest workflow assertion and
  `actionlint .github/workflows/release.yml` when `actionlint` is available.
- Publisher regression: run the marketplace suite with
  `THOTH_PLUGINS_ROOT` pointed at the canonical sibling checkout.
- Repository validation: `pnpm run check:ci`, `pnpm run typecheck`,
  `pnpm run build`, and `pnpm test` with the same canonical marketplace path and
  CI-equivalent Codex environment.
- Security review: inspect the final diff for credential material, unintended
  repositories or permissions, force-push behavior, and unrelated changes.

## Optional support artifacts

- `research.md`: not needed; the official action contract directly documents the selected inputs and token lifetime.
- `data-model.md`: not needed; no persisted application data changes.
- `contracts/`: not needed; the workflow and package scripts are the executable repository contracts.
- `quickstart.md`: not needed; existing release documentation will describe automatic publication and manual recovery.

## Risks and migrations

- A missing App installation, insufficient `Contents: write`, or malformed
  secret will fail after npm and GitHub release publication. Mitigation: keep the
  failure visible in the release job and retain the idempotent manual
  `release:marketplace` recovery command; never fall back to `GITHUB_TOKEN` or a
  wider credential.
- If `thoth-plugins/main` advances between clone and push, the existing publisher
  rejects the non-fast-forward push. Mitigation: preserve the existing error and
  retry contract rather than force-pushing or adding hidden retries.
- Both configured App values currently live as Actions secrets. The Client ID is
  not confidential, but consuming it through `secrets.*` matches the verified
  repository configuration and does not reduce security.
- The live cross-repository write cannot be exercised safely during local
  verification. It remains SC-004 outcome evidence for the next real release;
  static contracts and the existing local-remote integration provide buildable
  evidence beforehand.
- Rollback is a normal revert of the two release configuration edits and
  restoration of local script publication. No data migration is required, and
  any marketplace commit already made remains a valid version update rather than
  destructive state.

## Constitution Check (post-design)

- **Adaptive-root orchestration**: PASS — The design records one Root-owned coupled surface, its dependency order, and a separate fresh Oracle verification boundary.
- **Explicit role boundaries**: PASS — Product mutation, artifact ownership, and read-only approval are assigned without overlapping writers.
- **Proportional Spec Kit-compatible SDD**: PASS — Every technical choice maps to FR/SC evidence, with the live release explicitly classified as an outcome criterion rather than simulated completion.
- **Truthful multi-harness contracts**: PASS — The design reuses the project-owned publisher and GitHub Actions behavior without changing or overstating OpenCode, Codex, or Claude capabilities.
- **Independent provider ownership**: PASS — The design only recalls and records project context through the installed provider contract; no provider-owned surface is mutated.
- **Evidence-led completion**: PASS — The plan separates red/green buildable evidence, static security inspection, full regression checks, independent final judgment, and the deferred live-release outcome.
