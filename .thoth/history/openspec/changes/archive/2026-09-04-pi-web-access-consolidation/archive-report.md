# Archive Report: Consolidate Pi web research

**Status**: ARCHIVED<br>
**Oracle verdict**: PASS<br>
**Archive path**: `openspec/changes/archive/2026-09-04-pi-web-access-consolidation/`

## Completed scope

- US1 / FR-001, FR-002 / SC-001: six exact external packages with pi-web-access@0.27.0, truthful web runtime evidence, unchanged failure/dry-run guarantees.
- US2 / FR-003, FR-004 / SC-002, SC-003: four native web tools, noninteractive guidance, generated Pi assets, current documentation and transition commands.
- Preserved preexisting unrelated test edits and other harness outputs.

## Verification lineage

- verify-report.md records fresh independent oracle_pi_web_final PASS and its 48 passing tests.
- Implementation evidence: 106 focused tests, 12 integration tests, check:ci, typecheck, build.
- git diff --check passed; no critical unresolved finding.

## Canonical specification sync

- Updated: `cli-installation`, `multi-harness-agent-pack`.
## Deviations and residual warnings

- SC-004: RISK-SC004-LIVE-WEB-UNOBSERVED. Live search/fetch were not performed under offline SDD.
- verify:pi-package not run; no claim about packed installation or live tool loading.
- Root recorded task completion after terminal evidence; plan-review hashes describe the approved preimplementation task state.

## Follow-up

- Operator removes the two replaced Pi packages using the documented native commands, then performs updated setup and a live search/fetch smoke test.
- No actual home package changes, commits, or publication were performed in this repository change.
