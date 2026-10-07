# Requirements checklist: Restore user-controlled SDD gates

**Activation reason**: The change redefines two active governance principles,
changes route and phase semantics across three harnesses, and restores a removed
review skill. Missing or contradictory requirements could silently remove user
authority or weaken mandatory final verification.

## Initial validation

- [x] CHK001 [Completeness] Do the requirements cover every actor, decision path, failure path, persistence boundary, and harness? Yes — US1 covers route recommendation and selection, US2 covers review/skip/reject/approve/final-verify paths, US3 covers OpenCode/Codex/Claude distribution, and Edge cases cover missing input primitives and stale evidence.
- [x] CHK002 [Clarity] Does each requirement have one observable interpretation? Yes — FR-001 names the three choices and the duplicate-prompt exception; FR-002 names the ready gate and both review choices; FR-003 fixes tokens, blocker count, owner, path, and freshness; FR-004 separates plan-review from verify; FR-005/FR-006 name distribution and governance surfaces.
- [x] CHK003 [Consistency] Do stories, FRs, SCs, assumptions, dependencies, and non-goals agree? Yes — every story maps to its FR/SC set, all surfaces keep plan review optional and final verify mandatory, and the assumptions explicitly exclude the removed legacy architecture and thoth-mem mirroring.
- [x] CHK004 [Measurability] Can every requirement and success criterion be judged objectively? Yes — SC-001 through SC-006 name classifier, phase graph, prompt, skill, generation, ownership, constitution, and repository command evidence with all/100% outcomes.
- [x] CHK005 [Coverage] Is every US, FR, SC, and named failure mode mapped? Yes — US1 maps FR-001/SC-001; US2 maps FR-002/FR-003/FR-004/SC-002/SC-003/SC-005; US3 maps FR-005/FR-006/SC-004/SC-006; Edge cases cover Direct, recommendation disagreement, missing blocking input, stale review, and review-skip verification.

## Domain lenses

- [x] CHK006 [Migration] Does the contract distinguish restored behavior from removed v0.2 implementation? Yes — Assumptions and Out of scope preserve only user route/review decisions, blocker tokens, freshness, and approval separation while excluding requirements-interview, phase agents, executing-plans, and provider persistence.
- [x] CHK007 [Compliance] Does the governance amendment preserve constitution lifecycle rules? Yes — plan.md classifies a MAJOR 4.0.0 to 5.0.0 amendment, preserves ratification/date requirements, enumerates affected principles/templates/docs, and includes lifecycle validation.

## Revalidation

- [x] CHK008 [Coverage] Were affected US/FR/SC mappings revalidated after planning and validator-driven formatting changes? Yes — specify, plan, and tasks gates passed after the changes; the active checklist adds no new product scope and confirms every US1-US3, FR-001-FR-006, and SC-001-SC-006 mapping.
