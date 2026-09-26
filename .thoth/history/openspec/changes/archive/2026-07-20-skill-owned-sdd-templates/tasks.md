# Tasks: Skill-owned SDD templates

## MVP scope

US1 is the first independently testable slice: canonical and generated workflow
contracts resolve every phase/template/validator asset from the installed skill
root, with focused bundle tests proving no project template dependency.

## Dependencies

`T001 -> T002 -> T003 -> T004`; `T001 -> T005 -> T006`;
`T007 -> T008`; `T002..T010 -> T011 -> T012 -> T013`. Documentation follows
the settled canonical contract, generated output follows all canonical skill
edits, and final verification follows the complete focused/full check set.

## Test-first contract setup

- [x] T001 Add failing initializer and canonical/generated bundle assertions for FR-001, FR-002, FR-003, SC-001, and SC-002 in `src/harness/bundled-skills.test.ts` | Verify: focused tests expose unqualified skill assets, project template creation, and init dependence on bundled SDD templates

## Story US1

- [x] T002 [US1] Define the installed skill root and qualify phase-contract and validator references for FR-001 and SC-001 in `skills/thoth-sdd/SKILL.md` | Verify: the main contract contains no actionable path whose base is ambiguous
- [x] T003 [US1] Qualify every phase-owned template reference and add missing template anchors for FR-001 in `skills/thoth-sdd/references/phases` | Verify: specify, plan, checklist, tasks, and verify resolve their assets from the declared thoth-sdd skill root
- [x] T004 [US1] Resolve the archive report through the installed sibling thoth-sdd bundle for FR-001 in `skills/thoth-archive/SKILL.md` | Verify: archive names an unambiguous package-relative archive-report template path

## Story US2

- [x] T005 [US2] Remove template directory ownership, collection, preflight, and copying for FR-002, FR-003, and SC-002 in `skills/thoth-init/scripts/init.mjs` | Verify: init succeeds without bundled SDD templates and neither creates nor inspects a project template tree
- [x] T006 [US2] Document governance-only initialization for FR-002, FR-003, and SC-002 in `skills/thoth-init/SKILL.md` | Verify: the public init contract lists only change/archive, specs, memory, manifest, and missing constitution assets

## Story US3

- [x] T007 [US3] Add failing materialized-template and targeted validator regressions for FR-004 and SC-003 in `src/harness/sdd-validator.test.ts` | Verify: a template-derived ready fixture exposes current drift and mutations retain the three reported error codes
- [x] T008 [US3] Align plan and task authoring scaffolds with the executable FR-004 grammar and audit all bundled templates in `skills/thoth-sdd/templates` | Verify: one materialized Accelerated set passes ready without duplicate task IDs, ambiguous paths, or mismatched Constitution coverage

## Shared contract and publication

- [x] T009 Update the top-level ownership explanation for FR-001 through FR-004 in `README.md` | Verify: README distinguishes installed workflow assets from project governance initialization
- [x] T010 Update routed harness, installation, and SDD guidance for FR-001 through FR-004 in `docs` | Verify: bounded search finds no active guide claiming thoth-init creates project SDD templates
- [x] T011 Regenerate the published harness mirrors for SC-001 and SC-002 in `plugin/skills` | Verify: integration synchronization produces canonical-equivalent thoth-sdd, thoth-init, and thoth-archive skill trees
- [x] T012 Run focused bundle, validator, and integration checks for SC-001 through SC-003 in `src/harness` | Verify: focused Vitest suites, integration verification, typecheck, build, formatting check, and full tests pass

## Parallel execution

- None: root is the sole writer, the test-first failures establish contracts before canonical edits, documentation depends on the final wording, and generated plugin files depend on all canonical skill changes.

## Final verification

- [x] T013 [US1] Record independent Oracle evidence for FR-001 through FR-004 and SC-001 through SC-003 in `openspec/changes/skill-owned-sdd-templates/verify-report.md` | Verify: Oracle records PASS with executed evidence or returns actionable findings for convergence

## Convergence

- [x] T014 [US1] Remediate partial F-001 for FR-001 and SC-001 by rooting the plan-reviewer template contract and extending its canonical/generated regression in `skills/plan-reviewer/SKILL.md` | Verify: focused bundle tests prove plan-review.md resolves from the installed plan-reviewer skill in canonical and generated bundles
- [x] T015 [US1] Remediate partial F-002 for FR-001 and SC-001 by rooting the constitution validator/template contract and extending its canonical/generated regression in `skills/thoth-constitution/SKILL.md` | Verify: focused bundle tests prove constitution assets resolve from the installed thoth-constitution skill in canonical and generated bundles
- [x] T016 [US1] Remediate partial F-003 for FR-001 through FR-004 by expanding complete durable replacement blocks and preserving baseline scenarios in `openspec/changes/skill-owned-sdd-templates/spec.md` | Verify: Oracle confirms the archived adaptive-sdd diff retains every baseline obligation while adding skill-owned template behavior
