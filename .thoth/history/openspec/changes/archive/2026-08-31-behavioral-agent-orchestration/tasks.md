# Tasks: Behavioral Agent Orchestration

## Authoring contract

Task IDs are globally sequential. Each executable line names one literal repository-relative mutable surface and one observable verification result. Tests and fixtures precede their implementations; outcome SC-004 remains a final smoke target rather than manufactured product work.

## MVP scope

US1 is the first independently testable story: the canonical contract and all three generated roots expose one ordered dependency/ownership procedure, mark independent lanes ready before dependent synthesis, prevent overlapping writers, and contain no thoth-owned executor or lifecycle state.

## Ownership and dispatch record

| Owner | Net-gain rationale | Surface | Requirements | Checks |
| --- | --- | --- | --- | --- |
| Root | `shared-state`: SDD artifacts and constitutional authority remain root-owned. | `openspec/changes/behavioral-agent-orchestration/`, `openspec/memory/constitution.md` | FR-004, SC-003 | SDD gates and constitution validator. |
| Deep writer | `sequential-chain`: shared task-shaping, prompt, SDD, and bundled-skill contracts are compatibility-coupled and need one correctness context. | `src/harness/core/`, `src/agents/`, `skills/` | FR-001-FR-005, SC-001-SC-003, SC-005 | Focused Vitest, typecheck, generated-root inspection. |
| Quick writer | `coordination-cost`: once canonical wording is frozen, public documentation is a known low-risk non-code surface that can be updated without reloading implementation internals. | `README.md`, `docs/` | FR-001-FR-005 | Targeted search for contradictory legacy claims and documentation review. |
| Root integration | `shared-state`: generated `plugin/` output overlaps an already dirty user-owned marketplace worktree and must be synchronized once, inspected narrowly, and never delegated concurrently. | `plugin/` | FR-001-FR-005, SC-002-SC-003, SC-005 | Integration sync/verify and scoped diff review. |

## Dependencies

`T001 -> T002 -> T008`; `T003 -> T009`; `T004 -> T010`; `T005 -> T011`; `T006 -> T012`; `T007 -> T013`; `T008 + T009 -> T010`; `T012 -> T013 -> T014 -> T015`; `T008 + T009 + T010 + T015 -> T016`; `T016 -> T017`; `T010 + T015 -> T018`; `T010 + T015 -> T019`; `T018 + T019 -> T020`; `T016 + T020 -> T021`; `T021 -> T022`; `T017 + T022 -> T023`.

## Story US1

- [x] T001 [P] [US1] Add structured dependency, ready-wave, blocked-lane, ownership-conflict, duplicate-work, bounded-width, and terminal-wait fixtures with FR-001/FR-005 and SC-001/SC-002 coverage in `docs/agent/routing-cases.json` | Verify: 18 structured cases include graph decisions and 2+ positive quick/librarian/designer cases.
- [x] T002 [US1] Replace name-presence assertions with decision-specific graph-shaping and cross-harness contract assertions for FR-001/FR-005 and SC-001/SC-002 in `src/harness/core/agent-routing.test.ts` | Verify: red evidence captured; final focused suite passed.
- [x] T003 [P] [US4] Add the complete Direct/Accelerated/Full route-and-risk truth table for FR-004 and SC-003 in `src/harness/core/sdd.test.ts` | Verify: 13-case red evidence followed by green route/risk truth table.
- [x] T004 [P] [US3] Add generated-root assertions for the ordered procedure, full specialist directory, fan-out-before-wait, terminal fan-in, proportional Oracle wording, native dialects, and SC-005 size budget with FR-001/FR-002/FR-004/FR-005 coverage in `src/agents/prompt-rendering.test.ts` | Verify: all three roots pass; growth OpenCode +2283, Codex +2355, Claude +2324.
- [x] T005 [P] [US4] Update constitution contract expectations for the governed 6.0.0 proportional-verification amendment with FR-004/FR-005 and SC-003 coverage in `src/harness/sdd-constitution.test.ts` | Verify: fixture went red on 5.0.0/unconditional Oracle, then 6/6 focused tests passed.
- [x] T006 [P] [US4] Update bundled-skill parity expectations for Direct proportional verification and mandatory artifact-backed Oracle with FR-004 and SC-003 coverage in `src/harness/bundled-skills.test.ts` | Verify: red on unconditional Oracle wording; focused skill/constitution suites passed 19/19.
- [x] T007 [P] [US1] Add canonical policy assertions for ordered task shaping, all-role consideration, single-writer ownership, bounded native width, and zero runtime-state concepts with FR-001/FR-002/FR-003/FR-005 and SC-001/SC-002 coverage in `src/harness/core/agent-pack.test.ts` | Verify: focused tests and production-surface forbidden-concept search passed.
- [x] T008 [P] [US1] Implement the compact task-shaping, semantic role-selection, dependency, ownership, native-wave, terminal-evidence, and degradation contract for FR-001/FR-002/FR-003/FR-005 and SC-001/SC-002 in `src/harness/core/agent-pack.ts` | Verify: immutable policy contract passes focused tests and contains no mutable runtime state.
- [x] T009 [US4] Implement the pure proportional final-verification decision and route-aware owner for FR-004 and SC-003 in `src/harness/core/sdd.ts` | Verify: pure truth-table decision passes and verification remains mandatory.
- [x] T010 [US1] Render one ordered graph-shaping block and equally salient complete specialist directory while preserving native harness authority for FR-001-FR-005 and SC-002/SC-003/SC-005 in `src/agents/prompt-sections.ts` | Verify: 127 focused tests and typecheck passed within all root budgets.

## Story US4

- [x] T011 [P] [US4] Amend governance from 5.0.0 to 6.0.0 with the accepted proportional Direct verification rule, amendment date, impact report, and history for FR-004/FR-005 and SC-003 in `openspec/memory/constitution.md` | Verify: validator returned valid=true, version=6.0.0, errors=[].
- [x] T012 [US4] Propagate the 6.0.0 proportional-verification default into the initialization template for FR-004/FR-005 and SC-003 in `skills/thoth-constitution/templates/constitution.md` | Verify: generated template output and constitution contract tests passed.
- [x] T013 [US4] Update SDD route ownership and final-verification guidance for FR-004 and SC-003 in `skills/thoth-sdd/SKILL.md` | Verify: bundled-skill parity suite passed.
- [x] T014 [US4] Update implementation handoff wording so final verification follows the route/risk decision without implementer self-approval for FR-004 and SC-003 in `skills/thoth-sdd/references/phases/implement.md` | Verify: bundled-skill parity suite passed.
- [x] T015 [US4] Remove the obsolete every-route Oracle claim while preserving optional-plan-review semantics for FR-004 and SC-003 in `skills/plan-reviewer/SKILL.md` | Verify: bundled-skill parity suite passed; optional plan review remains distinct.

## Story US2

- [x] T016 [US2] Propagate the full role-aware task-shaping procedure and proportional verification governance into repository root instructions for FR-001-FR-005 and SC-002/SC-003/SC-005 in `AGENTS.md` | Verify: project root now encodes task shaping, all specialists, native authority, and proportional verification; routing suite passed 19/19.
- [x] T017 [P] [US2] Update the routed delegation guide with semantic role triggers, dependency-versus-order tests, parallel waves, and proportional review for FR-001-FR-004 and SC-001-SC-003 in `docs/agent/agents-and-delegation.md` | Verify: dependency, wave, specialist, and proportional-review guidance updated.
- [x] T018 [P] [US4] Update internal SDD routing guidance for the new verification owner decision with FR-004 and SC-003 coverage in `docs/agent/sdd-and-skills.md` | Verify: route/risk verification ownership aligned.
- [x] T019 [P] [US4] Update the public route table and verification flow for proportional Direct Oracle with FR-004 and SC-003 coverage in `docs/sdd-pipeline.md` | Verify: route table and prose agree.
- [x] T020 [P] [US2] Update the primary public overview and examples for complete specialist use, native parallel waves, and proportional review with FR-001-FR-004 and SC-003 coverage in `README.md` | Verify: examples use native waves and no thoth runtime claim.
- [x] T021 [P] [US2] Update concise role and SDD reference wording for FR-002/FR-004 and SC-001/SC-003 in `docs/quick-reference.md` | Verify: underused role triggers and review boundary present.
- [x] T022 [P] [US3] Update skill/MCP ownership documentation without adding orchestration tools for FR-004/FR-005 and SC-002/SC-003 in `docs/skills-and-mcps.md` | Verify: native authority retained; no orchestration tool added.
- [x] T023 [P] [US3] Update Codex installation guidance for native collaboration, full role selection, and proportional verification with FR-001/FR-002/FR-004 and SC-002/SC-003 in `docs/codex-install.md` | Verify: native Codex collaboration and proportional gate documented.
- [x] T024 [P] [US3] Update Claude installation guidance for native Agent fan-out/fan-in and proportional verification with FR-001/FR-002/FR-004 and SC-002/SC-003 in `docs/claude-code-install.md` | Verify: native Claude fan-out/fan-in and gate documented.
- [x] T025 [P] [US3] Update Claude package behavior documentation for the same root policy and review boundary with FR-002/FR-004/FR-005 and SC-002/SC-003 in `docs/claude-code-plugin-packaging.md` | Verify: package behavior matches roots and adds no runtime claim.
- [x] T026 [P] [US3] Update the internal architecture map for behavioral graph shaping and native-only execution with FR-001/FR-004/FR-005 and SC-002/SC-003 in `docs/agent/architecture.md` | Verify: decision policy/root and native lifecycle authority separated.

## Story US5

- [x] T027 [US5] Synchronize generated plugin agents and bundled skills from canonical sources with FR-001-FR-005 and SC-002/SC-003/SC-005 coverage in `plugin` | Verify: sync changed only generated orchestrator/oracle, skill mirrors, and Claude asset manifest; marketplace files were untouched.

## Parallel execution

- T001, T003, T004, T005, T006, and T007 may run in parallel because they own distinct fixture/test files and establish independent failing seams before implementation.
- After T010 and T015 freeze canonical behavior, T017, T018, T019, T020, T021, T022, T023, T024, T025, and T026 may run in parallel because each owns one distinct documentation file.
- T008 and T011 may run in parallel after their tests exist because typed policy and root-owned constitution files do not overlap; T009 remains ordered before T010 because prompt ownership consumes its decision contract.

## Final verification

- [x] T028 [US5] Run focused agent-pack, routing, SDD, prompt, constitution, bundled-skill, adapter, and integration-package tests for FR-001-FR-005 and SC-001-SC-003/SC-005 in `src` | Verify: 13 focused suites passed, 216/216 tests.
- [x] T029 [US5] Run the constitution lifecycle validator and Full SDD validator through tasks after all governed artifacts settle for FR-004/FR-005 and SC-003 in `openspec/changes/behavioral-agent-orchestration` | Verify: constitution 6.0.0 and Full-through-tasks validators returned valid with zero errors/warnings.
- [x] T030 [US5] Run pnpm run check:ci, pnpm run typecheck, pnpm run build, and pnpm test, then classify any pre-existing marketplace failure for FR-001-FR-005 and SC-001-SC-003/SC-005 in `package.json` | Verify: check:ci, typecheck, build, and full 84-file/1040-test suite passed; marketplace tests also passed.
- [x] T031 [US5] Apply the mandatory behavior-preserving simplify review to changed implementation surfaces for FR-005 and SC-005 in `src/harness/core/agent-pack.ts` | Verify: dependency wording now comes from the canonical policy instead of duplicated prompt prose; 127 focused tests and typecheck remain green.
- [x] T032 [US5] Delegate fresh read-only Oracle verification of implementation, governance propagation, test evidence, no-runtime scope, and SC-004 disposition for FR-001-FR-005 and SC-001-SC-005 in `openspec/changes/behavioral-agent-orchestration/verify-report.md` | Verify: fresh Oracle returned FAIL on FR-003/FR-004 coherence; SC-004 was classified deferred/non-blocking and convergence T034-T037 was appended.
- [x] T033 [US5] Archive passing durable deltas into canonical specifications and record outcome-SC disposition for FR-001-FR-005 and SC-001-SC-005 in `openspec/changes/behavioral-agent-orchestration/archive-report.md` | Verify: closeout is prepared with Oracle PASS lineage, transactional sync targets, and explicit SC-004 residual risk.

## Convergence round 1

- [x] T034 [US4] Oracle classification contradicts: add regression assertions for finding FR-003/FR-004 across the focused contract suites in `src/harness/core/sdd.test.ts` | Verify: three suites produced four targeted red failures covering all Oracle findings.
- [x] T035 [US4] Oracle classification contradicts: reconcile route-independent implementation ownership and proportional final-verification rules for FR-003/FR-004 and SC-003 in `src/harness/core/sdd.ts` | Verify: adaptive-verification, route-independent writer prose, proportional protocols, and 76/76 convergence tests passed.
- [x] T036 [US4] Oracle classification contradicts: reconcile the verify phase reference and stale routing fixture notes, then synchronize only generated mirrors from `skills/thoth-sdd/references/phases/verify.md` | Verify: canonical/generated bundle tests passed 19/19 after integration sync.
- [x] T037 [US5] Oracle classification partial: re-run focused/full verification and delegate a fresh Oracle round for FR-003/FR-004, preserving SC-004 as explicit ID-matched deferred outcome evidence in `openspec/changes/behavioral-agent-orchestration/verify-report.md` | Verify: fresh Oracle returned PASS with no critical finding; SC-004 remains explicit RISK/non-blocking.
