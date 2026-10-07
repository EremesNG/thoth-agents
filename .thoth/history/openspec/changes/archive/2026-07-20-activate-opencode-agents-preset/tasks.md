# Tasks: Activate the applied OpenCode agents preset

## MVP scope

US1 is the first independently testable slice: applying either a dirty subset
or the complete unchanged role list persists and activates a real
`presets.agents` roster containing all seven effective roles without losing
unrelated configuration. US2 completes the safe status/readback/reapply loop.

## Dependencies

`T001 -> T002 -> T003 -> T004 -> T005 -> T006 -> T007 -> T008`; the red/green slices share `src/cli/operations/opencode.ts`, round-trip verification depends on the persisted shape, and final evidence depends on the stable simplified diff.

## Story US1

- [x] T001 [US1] Add passing install/sync preset characterization plus failing model-activation and field-preservation tests for FR-001, FR-002, FR-004, SC-001, SC-002, and SC-004 in `src/cli/operations/opencode.test.ts` | Verify: install and sync each persist preset openai while focused Vitest fails because model Apply does not materialize and activate a complete agents preset
- [x] T002 [US1] Materialize and activate the complete effective agents preset for FR-001, FR-002, SC-001, and SC-002 in `src/cli/operations/opencode.ts` | Verify: focused activation fixtures pass for dirty and full payloads while preserving selected/root fields, unrelated presets, and unrelated top-level keys

## Story US2

- [x] T003 [US2] Add the failing post-apply status, complete role-readback comparison, and repeat-apply test for FR-003 and SC-003 in `src/cli/operations/opencode.test.ts` | Verify: focused Vitest fails because the active complete agents preset is classified as roster drift, changes unrequested readback values, or blocks the second plan
- [x] T004 [US2] Recognize the complete managed agents preset and report its active roster for FR-003 and SC-003 in `src/cli/operations/opencode.ts` | Verify: round-trip status has zero roster-drift blockers, readback returns activated values, and two consecutive valid model plans apply
- [x] T005 [US2] Document explicit model Apply preset activation for FR-004 and SC-004 in `README.md` | Verify: public guidance distinguishes the shipped openai default from the applied named agents preset and covers unchanged and dirty Apply

## Parallel execution

- None: both red/green slices edit the same OpenCode operation test and adapter, while documentation and final evidence depend on the accepted persistence semantics.

## Final verification

- [x] T006 [US2] Apply behavior-preserving simplify review for FR-001, FR-002, FR-003, FR-004, SC-001, SC-002, SC-003, and SC-004 in `src/cli/operations/opencode.ts` | Verify: focused tests retain the same activation, preservation, status, and repeat-apply assertions with no unrelated edits
- [x] T007 [US2] Run proportional repository validation for FR-001, FR-002, FR-003, FR-004, SC-001, SC-002, SC-003, and SC-004 in `package.json` | Verify: focused OpenCode/TUI suites, `pnpm run check:ci`, `pnpm run typecheck`, and any additional risk-driven checks complete with zero failures
- [x] T008 [US2] Map independent Oracle evidence for FR-001, FR-002, FR-003, FR-004, SC-001, SC-002, SC-003, and SC-004 in `openspec/changes/activate-opencode-agents-preset/verify-report.md` | Verify: read-only Oracle records PASS with executed evidence, residual risks, and no unresolved critical finding

## Convergence after failed verification

- [x] T009 [US2] Remediate V-001 (missing) by adding clean/full payload and active selected-preset filesystem fixtures for FR-002, FR-004, and SC-002 in `src/cli/operations/opencode.test.ts` | Verify: focused Vitest proves all seven submitted values activate `presets.agents` and selected custom-preset fields survive defaults -> selected -> root materialization
- [x] T010 [US2] Remediate V-002 (contradicts) by giving a complete managed preset precedence over the root-only legacy classifier and adding its colocated regression for FR-003 and SC-003 in `src/cli/operations/opencode.ts` | Verify: a complete `presets.agents` plus complete root `agents` is installed in plugin-drift and missing-main branches, while a root-only legacy roster remains drift
- [x] T011 [US2] Remediate V-003 (partial) by clarifying the materialized agents merge exception and adding the corresponding operation regression for FR-002 and SC-003 in `openspec/changes/activate-opencode-agents-preset/plan.md` | Verify: an unrequested role without `variant` remains unchanged after repeat Apply, and the plan explains why a complete materialized roster is authoritative over canonical fallback

Convergence execution order: `T009 -> T010 -> T011 -> T008`.
