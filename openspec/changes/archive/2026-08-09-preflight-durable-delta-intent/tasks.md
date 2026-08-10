# Tasks: Preflight Durable Delta Intent

## MVP scope

US1 is the MVP: the specification gate rejects exact-title durable delta mismatches before planning and reports semantic-review warnings without invalidating correct additions.

## Dependencies

`T001 -> T002 -> T003 -> T004 -> T005 -> T006 -> T007 -> T008 -> T009 -> T010 -> T011 -> T012`; the shared preflight must make the validator slice green before archive adopts it, and generated assets follow canonical edits.

## Story US1

- [x] T001 [US1] Add failing validator CLI fixtures for valid and inverse durable delta baselines with FR-001/FR-002/SC-001 coverage in `src/harness/sdd-validator.test.ts` | Verify: focused tests fail because the specify gate accepts incompatible exact-title operations and emits no semantic-review warning
- [x] T002 [US1] Implement pure metadata parsing, canonical title parsing, ordered preflight issues, and addition-review warnings with FR-001/FR-002/SC-001 coverage in `skills/thoth-sdd/scripts/durable-deltas.mjs` | Verify: the module exposes deterministic results without filesystem writes and the validator tests remain red only at the missing integration point
- [x] T003 [US1] Integrate canonical baseline loading and structured preflight diagnostics into every artifact gate with FR-002/SC-001 coverage in `skills/thoth-sdd/scripts/validate.mjs` | Verify: focused validator CLI tests pass for valid, rejected, sequential, and warning cases
- [x] T004 [US1] Require canonical baseline inspection and the exact ADDED/MODIFIED/REMOVED/RENAMED decision rules in the specify phase contract with FR-001/SC-003 coverage in `skills/thoth-sdd/references/phases/specify.md` | Verify: the installed canonical contract makes every marker decision relative to current requirement titles
- [x] T005 [US1] Replace the template's ADDED-biased example guidance with a complete durable delta selection table with FR-001/SC-003 coverage in `skills/thoth-sdd/templates/spec.md` | Verify: the template distinguishes absent, existing, removed, and renamed canonical titles without prescribing one default marker
- [x] T006 [US1] Align the root specify protocol with canonical baseline inspection and early validator semantics with FR-001/FR-002/SC-003 coverage in `src/harness/core/sdd.ts` | Verify: the shared phase contract cannot instruct roots to choose a durable marker without consulting the canonical capability

## Story US2

- [x] T007 [US2] Add failing archive CLI assertions for both inverse delta mistakes, stable shared codes, unchanged canonical content, and retained changes with FR-003/SC-002 coverage in `src/harness/sdd-archive.test.ts` | Verify: focused tests fail because archive errors lack the shared stable diagnostic codes
- [x] T008 [US2] Replace duplicated archive delta semantics with the shared ordered preflight while preserving transactional application with FR-003/SC-002 coverage in `skills/thoth-archive/scripts/archive.mjs` | Verify: focused archive tests pass for mismatch safety, mixed valid deltas, and rollback faults
- [x] T009 [US2] Document validator-first detection and archive's shared final defense with FR-001/FR-002/FR-003/SC-003 coverage in `docs/sdd-pipeline.md` | Verify: public workflow documentation explains exact-title rules, semantic-overlap limits, and early versus final checks
- [x] T010 [US2] Align archive skill instructions with the shared preflight contract and stable diagnostics with FR-003/SC-002 coverage in `skills/thoth-archive/SKILL.md` | Verify: archive operators are told that deterministic delta incompatibilities are already gated and still rechecked before writes

## Parallel execution

- None: validator and archive intentionally converge on one shared module, and integration generation rewrites the common plugin tree after all canonical edits.

## Final verification

- [x] T011 Synchronize generated harness assets including the shared module with FR-001/FR-002/FR-003/SC-003 coverage in `plugin/skills/thoth-sdd/scripts/durable-deltas.mjs` | Verify: integration sync and verification report no stale, missing, or cross-bundle asset
- [x] T012 Run focused suites followed by formatting, typecheck, build, integration, and full tests with FR-001/FR-002/FR-003/SC-001/SC-002/SC-003 coverage in `package.json` | Verify: all selected commands pass or every attributable residual failure is reported

## Convergence 1 — Oracle FAIL

- [x] T013 [US1] Add a failing validator CLI regression for a titleless canonical Requirement heading that crosses into body text, remediating VERIFY-CRIT-001 classified contradicts with FR-002/SC-001 coverage in `src/harness/sdd-validator.test.ts` | Verify: focused validator tests fail because the malformed baseline is accepted instead of reporting SDD-SPEC-DELTA-BASELINE
- [x] T014 [US1] Restrict canonical heading parsing to same-line horizontal whitespace and reject malformed Requirement candidates, remediating VERIFY-CRIT-001 classified contradicts with FR-002/FR-003/SC-001 coverage in `skills/thoth-sdd/scripts/durable-deltas.mjs` | Verify: the validator regression passes and valid, duplicate-title, and empty-capability behavior remains stable
- [x] T015 [US2] Add archive CLI no-write coverage for titleless and duplicate canonical baselines, remediating VERIFY-CRIT-001 classified partial with FR-003/SC-002 coverage in `src/harness/sdd-archive.test.ts` | Verify: archive reports SDD-SPEC-DELTA-BASELINE before staging and preserves canonical, report, and active change content
- [x] T016 [US1] Cover dependent declaration order, downstream gates, and INTERNAL isolation, remediating VERIFY-WARN-001 classified missing with FR-002/SC-001 coverage in `src/harness/sdd-validator.test.ts` | Verify: public validator CLI tests prove ordered transitions, every later gate rechecks baseline intent, and INTERNAL does not read canonical specs
- [x] T017 Resynchronize generated skills and rerun proportional repository validation after convergence with FR-001/FR-002/FR-003/SC-001/SC-002/SC-003 coverage in `package.json` | Verify: focused suites, integration, formatting, typecheck, build, full tests, ready gate, and diff checks pass
- [x] T018 [US2] Map shared canonical parser failures to the stable archive baseline diagnostic before staging, remediating VERIFY-CRIT-001 classified partial with FR-003/SC-002 coverage in `skills/thoth-archive/scripts/archive.mjs` | Verify: titleless and duplicate baseline archive regressions pass with unchanged canonical, report, and active change content
