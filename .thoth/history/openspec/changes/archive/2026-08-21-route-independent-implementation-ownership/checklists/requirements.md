# Requirements checklist: Route-independent implementation ownership

**Activation reason**: The change corrects a canonical cross-harness
orchestration invariant whose ambiguous wording can either starve specialists or
force costly ceremonial delegation across every SDD route.

## Initial validation

- [x] CHK001 [Completeness] Do US1–US4 and FR-001–FR-007 cover Direct/no-artifact specialist work, Accelerated/Full root work, delegated writer selection, explicit user direction, main-context continuity, subagent isolation, shared mutable state, cost caveats, three harnesses, skills/docs/generated output, and mandatory Oracle verification? Evidence: every named flow has a story scenario, requirement, success criterion, assumption, edge case, or non-goal in `spec.md`.
- [x] CHK002 [Clarity] Is “route-independent” defined as route controlling artifacts/gates while ownership separately chooses root or a writer from task shape and net gain? Evidence: Why, Impact, US1, FR-001, FR-003, SC-001, and assumptions use the same two-axis definition.
- [x] CHK003 [Consistency] Do stories, FRs, SCs, assumptions, edge cases, plan decisions, and non-goals agree that root and writers are eligible in every route but Oracle remains mandatory? Evidence: no accepted artifact grants a route-specific implementation monopoly or weakens final verification.
- [x] CHK004 [Measurability] Does every buildable SC name an executable owner seam, stale phrase count, exact cross-product case, policy factor family, validator budget, or repository command? Evidence: SC-001–SC-006 each state observable passing criteria; SC-007 is explicitly an outcome.
- [x] CHK005 [Coverage] Does every US/FR/SC map to at least one test-first or verification task and are user-direction conflicts plus shared-state/contention failures represented? Evidence: `tasks.md` traces US1, US2, US3, US4; FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007; and SC-001, SC-002, SC-003, SC-004, SC-005, SC-006, SC-007, with the outcome criterion retained as post-release observation.

## Domain lenses

- [x] CHK006 [Multi-harness truthfulness] Does the policy preserve OpenCode native roles, Claude namespaced selection, Codex conditional agent_type fallback, and instruction-only capability disclosures? Evidence: FR-006, assumptions, plan harness design, and T010–T012/T018 retain native deltas and prohibit adapter-local policy.
- [x] CHK007 [Cost and performance] Does the specification avoid claiming that cheaper models or more agents automatically reduce total cost and require representative evidence? Evidence: FR-001/FR-004, US2, edge cases, SC-007, risks, and non-goals distinguish model price from total tokens, latency, rediscovery, and coordination overhead.
- [x] CHK008 [Concurrency and ownership] Are independent parallelism, single ordered chains, shared mutable state, one writer per surface, and non-overlapping writes unambiguous? Evidence: US2, FR-001/FR-002/FR-007, edge cases, assumptions, plan policy factors, and T001/T004/T017 cover each boundary.

## Revalidation

- [x] CHK009 [Oracle revalidation] Does the repaired artifact set include the active repository `AGENTS.md` as a governed and tested surface, replacing unconditional UI/UX delegation with conditional `designer` selection only after a net-gain decision? Evidence: FR-006 and SC-002/SC-005 name `AGENTS.md`; the plan maps it; T017 owns the edit; T021 includes active-instruction stale-policy rejection.
