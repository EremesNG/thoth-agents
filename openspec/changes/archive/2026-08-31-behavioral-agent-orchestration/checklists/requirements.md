# Requirements checklist: Behavioral Agent Orchestration

**Activation reason**: The change crosses shared root behavior, three native harness contracts, specialist routing, parallel-write safety, and constitutional verification ownership. Prompt-presence tests could otherwise create a false PASS while runtime behavior remains linear.

## Initial validation

- [x] CHK001 [Completeness] Do US1-US5 and FR-001-FR-005 cover root task shaping, every specialist, direct ownership, native fan-out/fan-in, terminal fan-in, proportional review, degradation, and explicit non-goals? Evidence: `spec.md` user stories, edge cases, requirements, assumptions, and out-of-scope sections cover each actor, flow, failure, and constraint.
- [x] CHK002 [Clarity] Does every normative requirement distinguish instruction/policy behavior from native execution authority? Evidence: FR-001 and FR-005 require native primitives and forbid a thoth executor, while SC-004 alone owns live model outcome evidence.
- [x] CHK003 [Consistency] Are stories, FRs, SCs, assumptions, and non-goals consistent about parallelism? Evidence: US1 and FR-001 require concurrency only for independent conflict-free lanes; edge cases serialize dependencies or overlapping writes; no criterion rewards raw agent count.
- [x] CHK004 [Measurability] Does every buildable SC have an objective threshold or truth table? Evidence: SC-001 specifies fixture and role counts, SC-002 specifies three roots and zero runtime surfaces, SC-003 specifies gate outcomes, and SC-005 specifies a 2,500-character cap.
- [x] CHK005 [Coverage] Are US1, US2, US3, US4, and US5 mapped to FR-001, FR-002, FR-003, FR-004, FR-005 and SC-001, SC-002, SC-003, SC-004, SC-005 evidence? Evidence: every story has a Covers line and independent test; `plan.md` maps each requirement and criterion to files and verification seams.
- [x] CHK006 [Coverage] Are underused roles tested as semantic choices rather than merely named? Evidence: US2 has distinct positive triggers and exclusions; SC-001 requires at least two positive cases each for `quick`, `librarian`, and `designer` plus all-role coverage.
- [x] CHK007 [Completeness] Are failure modes for native coordination explicit? Evidence: US3 and edge cases cover unavailable primitives, bounded capacity, timeouts remaining nonterminal, duplicate evidence, dependency blocking, and terminal-result reconciliation.

## Domain lenses

- [x] CHK008 [Cross-harness truthfulness] Do requirements preserve each harness as sole lifecycle authority and prohibit emulated status, waiting, wake, cancellation, or terminal results? Evidence: FR-005, US3 scenario 4, assumptions, and out-of-scope list name the forbidden replacement surfaces.
- [x] CHK009 [Governance migration] Is the accepted Direct Oracle change reconciled with current durable governance instead of silently contradicting it? Evidence: FR-004 and `plan.md` require a 5.0.0 → 6.0.0 MAJOR constitution amendment plus full contract propagation before activation.
- [x] CHK010 [Parallel-write safety] Can no requirement be read as permission for conflicting background writers? Evidence: FR-001 requires mutable ownership and conflict-free lanes; US1 scenario 3 and edge cases serialize or consolidate overlapping surfaces.

## Revalidation

- Not required: No requirement-affecting change occurred after this checklist audit; `spec.md` and `plan.md` were validated before the checklist was created.
