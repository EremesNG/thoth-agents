# Requirements checklist: Predictable specialist-writer routing

**Activation reason**: High cross-harness contract risk: eight requirements must
remain coherent across the canonical role/SDD contracts, three native harness
surfaces, generated plugin assets, proportional model effort, and routed guidance.
Incorrect capability or owner wording could silently starve implementation writers
or misrepresent runtime enforcement.

## Initial validation

- [x] CHK001 [Completeness] Do US1–US4, FR-001–FR-008, SC-001–SC-007, all seven roles, three harnesses, Direct exception, artifact-backed implementation, final verification, override, fallback, prompt-budget, reinstall, and consumer-outcome flows have an explicit evidence anchor? Evidence: `spec.md` stories, edge cases, dependencies, assumptions, non-goals, and requirement/success sections cover every named actor and flow.
- [x] CHK002 [Clarity] Does each owner rule have one observable interpretation without making root or deep an unconditional implementation default? Evidence: FR-001 limits root to an isolated Direct micro-action; FR-002 selects designer, quick, or deep by explicit surface/risk signals; edge cases resolve mixed and coupled surfaces.
- [x] CHK003 [Consistency] Do stories, FRs, SCs, assumptions, non-goals, constitution, and current durable requirements agree on depth one, one writer per surface, root-owned OpenSpec state, no new roles, and fresh Oracle verification? Evidence: `spec.md`, `plan.md`, and `openspec/memory/constitution.md` preserve the same invariants and list no conflicting exception.
- [x] CHK004 [Measurability] Does every buildable SC name a count, exact matrix, exit status, or before/after comparison and does the outcome SC avoid a fake implementation claim? Evidence: SC-001–SC-006 define zero/all/exact-role/exit-zero/context-budget outcomes; SC-007 is explicitly typed outcome and remains post-release telemetry.
- [x] CHK005 [Coverage] Does the task graph cover every FR and buildable SC with test-first public seams, while retaining the outcome criterion as a target? Evidence: `tasks.md` T001–T039 explicitly maps FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008, SC-001, SC-002, SC-003, SC-004, SC-005, and SC-006; its outcome note maps SC-007 without manufacturing repository work.

## Domain lenses

- [x] CHK006 [Multi-harness capability truthfulness] Do requirements distinguish static package guarantees, active runtime selectors, permission enforcement, effort support, and instruction-only fallback? Evidence: US2, FR-004, SC-003, assumptions, and Codex edge cases prohibit universal structural claims while preserving conditional `agent_type` use.
- [x] CHK007 [Cost and context evidence] Do requirements avoid promising savings while still producing a measurable proportional-effort and prompt-budget result? Evidence: US3, FR-005–FR-006, SC-004–SC-005, assumptions, and non-goals distinguish effort defaults and character-based estimates from total-task billing or quality claims.
- [x] CHK008 [Generated-surface drift] Do requirements cover canonical source, installed skills, generated plugin output, documentation, and consumer reinstall without treating generated files as independent policy? Evidence: FR-008, SC-006, plan requirement mapping, risk section, and T029–T036 assign one canonical policy and explicit generation/reinstall evidence.

## Revalidation

- Not required: No requirement-affecting artifact changed after the passing specify and plan gates; this checklist audits the accepted `spec.md`, `plan.md`, and `tasks.md` as written. Any later intent or requirement change must append checked revalidation items before implementation continues.
