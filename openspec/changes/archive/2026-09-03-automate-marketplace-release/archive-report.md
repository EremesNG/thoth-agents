# Archive Report: Automate Marketplace Release Publication

**Status**: ARCHIVED<br>
**Oracle verdict**: PASS<br>
**Archive path**: `openspec/changes/archive/2026-09-03-automate-marketplace-release/`

## Completed scope

- US1 / FR-001 / FR-003 / SC-001 / SC-003: the successful tag release now
  mints a repository-scoped GitHub App token and invokes the existing validated
  publisher only after npm and GitHub release publication.
- US2 / FR-002 / SC-002 / SC-003: local semantic-version commands no longer
  compete with CI, while the idempotent manual marketplace retry remains.

## Verification lineage

- `verify-report.md` records independent oracle PASS with executed evidence for
  every FR and buildable SC and an explicit residual RISK for outcome SC-004.

## Canonical specification sync

- Updated: `release-publishing`.
## Deviations and residual warnings

- SC-004 remains unobserved until the next real tag release exercises the App
  installation and cross-repository push.
- `actionlint` was unavailable; the workflow passed its focused repository
  contract test and exact static inspection.
- The official token action uses a mutable major-version reference consistent
  with current repository conventions.

## Follow-up

- Observe the next real `v*.*.*` release and confirm one bot update or an
  already-current result in `thoth-plugins/main` without a maintainer-run
  publication command.
