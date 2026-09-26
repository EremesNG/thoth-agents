# Archive Report: Pi interaction and web extensions

**Status**: ARCHIVED<br>
**Oracle verdict**: PASS<br>
**Archive path**: `openspec/changes/archive/2026-09-04-pi-rpiv-extensions/`

## Completed scope

- US1: three pinned 2.9.0 native extensions, exact-source installation/status and required-failure handling (FR-001, FR-005, SC-001).
- US2: truthful ask_user_question and root-owned todo; children escalate questions/progress (FR-002, FR-003, SC-002).
- US3: additive librarian web_search/web_fetch, preserved existing research stack, prerequisites/failure guidance (FR-004, SC-003).
- Generated resources, operator/routed documentation and full regression verification (SC-004).

## Verification lineage

- verify-report.md records independent oracle PASS with executed evidence.
- Fresh oracle_rpiv_final checked all FR/buildable-SC; fresh bounded documentation-delta review covers the two subsequent text corrections.
- Full suite 1162/1162; Oracle focused85/85; integration12/12; build, types, formatting, context validation pass.

## Canonical specification sync

- Updated: `cli-installation`, `multi-harness-agent-pack`.
## Deviations and residual warnings

- Same-intent refinement: routed architecture package count and stale memory-governance test wording; no memory-governance production change.
- T003 wording corrected to match Update-plan parity and inspected shared apply evidence.
- SC-005 retains UI/task-panel/live-web risks, explicitly recorded in verify-report.md.
- Pre-implementation plan review is historical approval; execution state and same-intent refinements change source hashes without claiming renewed plan approval.
- ADDED warnings reviewed semantically: concrete new RPIV integration requirements complement existing native setup/research requirements.

## Follow-up

- Operator can apply updated Pi setup, then observe interactive questions, task panel and configured web tools.
- No home install, provider credentials, commit or publish performed in this change.
