# Verification Report: Automate Marketplace Release Publication

**Reviewer**: oracle<br>
**Independent from implementer**: Yes<br>
**Verdict**: PASS

## Review dimensions

- **Completeness**: PASS — FR-001 through FR-003 and every buildable success criterion have implementation, tests, and documentation; SC-004 is retained as an outcome risk.
- **Correctness**: PASS — Publication is ordered after npm and GitHub release success, uses the scoped App token, preserves idempotency and normal-push rejection, and removes duplicate local automation.
- **Coherence**: PASS — Specification, plan, tasks, workflow, package scripts, tests, publisher behavior, and documentation agree.

## Compliance matrix

| Requirement | Implementation evidence | Executed check | Result |
| --- | --- | --- | --- |
| FR-001 | `.github/workflows/release.yml:131` publishes npm and creates the GitHub release before minting the token and invoking the existing publisher. | `pnpm exec vitest run src/harness/publish-marketplace.test.ts src/harness/integration-lifecycle.test.ts` passed 11 tests. | PASS |
| FR-002 | `package.json:59` retains the manual publisher while all semantic-version release commands end after the tag push. | `pnpm exec vitest run src/harness/publish-marketplace.test.ts src/harness/integration-lifecycle.test.ts` passed every script contract. | PASS |
| FR-003 | `.github/workflows/release.yml:143` uses the two configured secrets, owner scope, only `thoth-plugins`, `contents: write`, and the App-token output as marketplace `GH_TOKEN`. | `pnpm run check:ci` passed and independent static credential/permission inspection found no broader fallback. | PASS |
| SC-001 `[buildable]` | `src/harness/publish-marketplace.test.ts:138` verifies post-release ordering, App inputs, exact repository permission, token flow, and publisher command. | Focused workflow Vitest passed; `pnpm run check:ci` checked 242 files with zero warnings. | PASS |
| SC-002 `[buildable]` | `src/harness/publish-marketplace.test.ts:178` and `src/harness/integration-lifecycle.test.ts:48` verify the three local version scripts and retained manual command. | Focused Vitest passed 11 tests across both files. | PASS |
| SC-003 `[buildable]` | `src/harness/publish-marketplace.test.ts:192` and `scripts/publish-marketplace.mjs:131` preserve target-only changes, idempotency, missing-tag failure, and rejected concurrent normal pushes. | `pnpm test` passed 84 files and 1,060 tests against the canonical `THOTH_PLUGINS_ROOT`; `pnpm run build` passed. | PASS |
| SC-004 `[outcome]` | No real tag-release bot publication was executed during repository verification. | N/A — observe the next real `v*.*.*` release and resulting `thoth-plugins/main` state. | RISK |

## Findings

| ID | Severity | Dimension | Evidence | Remediation anchor |
| --- | --- | --- | --- | --- |
| R-001 | Residual risk | Completeness | SC-004 lacks live release evidence because App installation access and secret values are intentionally inaccessible. | Observe the next tag release and record its marketplace step and resulting central state. |
| W-001 | Low | Correctness | `actionlint` is unavailable; validation used the focused workflow contract and exact static inspection. | Run `actionlint` when available or add it to CI in a future change. |
| W-002 | Low | Correctness | `actions/create-github-app-token@v3` is a mutable major tag consistent with current repository conventions. | Pin a reviewed commit SHA if the release security policy later requires immutable action references. |

## Residual risks

- SC-004: The live App installation and cross-repository push remain unobserved. The next real release must produce one bot catalog commit or an already-current result without a maintainer-run publication command.
