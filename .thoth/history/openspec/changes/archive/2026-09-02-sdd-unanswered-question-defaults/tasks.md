# Tasks: SDD unanswered-question defaults

## Authoring contract

Task identifiers are sequential across the file. Each task owns one literal path and ends with observable verification evidence.

## MVP scope

US1 is the MVP: all three rendered root prompts explain the route recommendation before asking, retry answerless route prompts at most three total attempts, then select the recommended route while preserving any explicit answer.

## Dependencies

`T001 -> T002 -> T003 -> T004 -> T005 -> T006 -> T007 -> T008 -> T009 -> T010 -> T011 -> T012 -> T013 -> T014 -> T015 -> T016 -> T017 -> T018 -> T019 -> T020 -> T021`; the contracts are intentionally serialized because later wording and governance synchronization consume the accepted shared semantics.

## Story US1

- [x] T001 [US1] Add failing rendered-root assertions for the pre-route context summary, three total answerless attempts, recommended-route fallback, and explicit-answer precedence covering FR-001/FR-004/SC-001 in `src/agents/prompt-rendering.test.ts` | Verify: focused prompt-rendering test fails on the missing route behavior.
- [x] T002 [US1] Implement the shared route-question contract covering FR-001/FR-004/SC-001 in `src/agents/prompt-sections.ts` | Verify: focused prompt-rendering test passes for OpenCode, Codex, and Claude output.

## Story US2

- [x] T003 [US2] Add failing public phase-protocol assertions for default Oracle review, same-intent review convergence, approved-plan summary, three-attempt implementation fallback, and explicit-stop precedence covering FR-002/FR-003/SC-002/SC-003/SC-004 in `src/harness/core/sdd-protocol.test.ts` | Verify: focused SDD protocol test fails on the missing review and post-approval decision instructions.
- [x] T004 [US2] Implement ready-gate fallback, artifact correction, affected-gate revalidation, fresh Oracle review rounds, approved-plan summary, and bounded implementation-choice fallback covering FR-002/FR-003/SC-002/SC-003/SC-004 in `src/harness/core/sdd.ts` | Verify: focused SDD protocol test passes with explicit-stop precedence and a material human-owned blocker escape.
- [x] T005 [US2] Add failing bundled-skill assertions for route fallback in thoth-sdd plus review activation, three-attempt fallback, and fresh-review convergence in both thoth-sdd and plan-reviewer covering FR-001/FR-002/FR-004/SC-001/SC-002/SC-003 in `src/harness/bundled-skills.test.ts` | Verify: focused bundled-skills test fails on the missing route behavior in thoth-sdd and the missing activation/convergence behavior in plan-reviewer.
- [x] T006 [US2] Update the SDD route and ready-gate workflow contract covering FR-001/FR-002/FR-004/SC-001/SC-002/SC-003 in `skills/thoth-sdd/SKILL.md` | Verify: bundled-skills assertions pass for route and plan-review defaults.
- [x] T007 [US2] Update plan-review activation and rejection convergence covering FR-002/FR-004/SC-002/SC-003 in `skills/plan-reviewer/SKILL.md` | Verify: bundled-skills assertions pass without treating clarification as a new approval.

## Story US3

- [x] T008 [US3] Add failing rendered-root assertions for three total review-choice attempts, Oracle-review fallback, explicit no-review precedence, approved-plan summary, three total implementation attempts, recommended implementation fallback, and explicit stop precedence covering FR-002/FR-003/FR-004/SC-002/SC-004 in `src/agents/prompt-rendering.test.ts` | Verify: focused prompt-rendering test fails on the missing shared review-choice and post-approval behavior.
- [x] T009 [US3] Implement the shared review-choice fallback, approved-plan summary, and implementation-choice fallback covering FR-002/FR-003/FR-004/SC-002/SC-004 in `src/agents/prompt-sections.ts` | Verify: focused prompt-rendering test passes for all three harness outputs while explicit no-review/stop choices win and OKAY alone is not implementation authorization.
- [x] T010 [US3] Add failing bundled-skill assertions for the approved-plan summary, three total implementation attempts, recommended implementation fallback, and explicit stop precedence covering FR-003/FR-004/SC-004 in `src/harness/bundled-skills.test.ts` | Verify: focused bundled-skills test fails on the missing canonical reviewer behavior.
- [x] T011 [US3] Add the approved-plan summary and implementation fallback to the canonical reviewer contract covering FR-003/FR-004/SC-004 in `skills/plan-reviewer/SKILL.md` | Verify: focused bundled-skills test passes and an explicit stop remains authoritative.

## Shared governance and documentation

- [x] T012 Add failing bundled-template assertions for route, review, and implementation no-answer defaults covering FR-001/FR-002/FR-003/FR-004/SC-001/SC-002/SC-004 in `src/harness/bundled-skills.test.ts` | Verify: focused bundled-skills test fails while the constitutional template retains explicit-only selection wording.
- [x] T013 Amend governance from 6.0.0 to 7.0.0 with synchronized principles, impact report, and history covering FR-001/FR-002/FR-003/FR-004 in `openspec/memory/constitution.md` | Verify: thoth-constitution validator reports valid lifecycle metadata with no placeholders.
- [x] T014 Synchronize the constitutional initialization contract covering FR-001/FR-002/FR-003/FR-004/SC-001/SC-002/SC-004 in `skills/thoth-constitution/templates/constitution.md` | Verify: focused bundled-template assertions pass and the template expresses the same three bounded defaults as the amended constitution.
- [x] T015 Synchronize always-loaded repository SDD instructions covering FR-001/FR-002/FR-003/FR-004 in `AGENTS.md` | Verify: root instructions contain all three bounded fallbacks and both required pre-question summaries.
- [x] T016 Synchronize routed SDD invariants and enforcement disclosure covering FR-001/FR-002/FR-003/FR-004 in `docs/agent/sdd-and-skills.md` | Verify: routed guidance matches canonical prompts and states instruction-level fallback where applicable.
- [x] T017 Synchronize the public lifecycle narrative covering FR-001/FR-002/FR-003/FR-004 in `docs/sdd-pipeline.md` | Verify: the pipeline documents explicit-answer precedence, three total attempts, Oracle convergence, and implementation fallback.
- [x] T018 Synchronize skill and MCP documentation covering FR-002/FR-003/FR-004 in `docs/skills-and-mcps.md` | Verify: the documented plan-review flow includes approval summary and no-answer defaults.
- [x] T019 Synchronize the public README workflow summary covering FR-001/FR-002/FR-003/FR-004 in `README.md` | Verify: README behavior agrees with the canonical SDD and reviewer contracts.

## Parallel execution

- None: The prompt, phase protocol, skills, constitution, instructions, and documentation express one coupled behavioral contract; each downstream surface consumes the wording established upstream, so parallel writers would create cross-lane dependencies and reconciliation risk.

## Final verification

- [x] T020 Simplify changed implementation and contract wording without changing behavior, synchronize generated integration packages, and run focused plus repository checks covering SC-001/SC-002/SC-003/SC-004 in `package.json` | Verify: simplify review finds no semantic drift; integration verify, check:ci, typecheck, build, and test commands pass or failures are recorded with evidence.
- [x] T021 Persist fresh independent Oracle PASS evidence for all FRs and buildable SCs in `openspec/changes/sdd-unanswered-question-defaults/verify-report.md` | Verify: a fresh read-only Oracle reports PASS with no unresolved critical finding and the ready-to-close evidence is recorded.

## Convergence round 1

- [x] T022 Remediate V-001 (contradicts) by replacing explicit-user-only plan-review activation and routing metadata with explicit-or-bounded-default semantics, adding adjacent contract regression assertions, and covering FR-001/FR-002/FR-004/SC-001/SC-002/SC-003 in `src/harness/core/sdd.ts` | Verify: focused protocol tests reject stale explicit-only metadata and pass for route fallback, review fallback, and convergence activation.
- [x] T023 Remediate V-002 (contradicts) by removing stale user-selected-only wording from canonical/generated governance, docs, public and skills READMEs, adding adjacent negative regression tests, and covering FR-002/FR-004/SC-002/SC-003 in `skills/thoth-constitution/templates/constitution.md` | Verify: focused tests reject obsolete wording, generated packages are synchronized, and public surfaces agree with explicit-or-bounded-default selection.
- [x] T024 Remediate V-003 (partial) by stating and testing in the shared prompt, matching SDD skill, and public tests that bounded no-answer fallbacks apply only to the route, plan-review, and implementation questions and never to secrets, destructive/security-sensitive actions, or material human-owned decisions, covering FR-004 in `src/agents/prompt-sections.ts` | Verify: focused prompt and bundled-skill tests assert the exclusion boundary across all supported harness outputs.

## Convergence round 2

- [x] T025 Remediate V-004 (contradicts) by replacing stale explicit-user-only Codex route-selection guidance with the pre-question context summary, explicit-answer precedence, and third-answerless recommended fallback, with adjacent public-guidance regression coverage for FR-001/FR-004/SC-001 in `docs/codex-install.md` | Verify: focused bundled documentation tests reject the stale sentence and assert all three route-resolution elements.
