<!--
Sync Impact Report
- Version change: N/A -> 1.0.0
- Modified principles: None (initial ratification)
- Added sections: Principles; Governance
- Removed sections: None
- Templates: ✅ initialized by thoth-init
- Follow-up TODOs: None
-->
# Project Constitution

**Version**: 1.0.0<br>
**Ratified**: YYYY-MM-DD<br>
**Last amended**: YYYY-MM-DD

## Principles

### I. User-value first

Every change MUST map to an observable user or operator outcome. Speculative
infrastructure without a current requirement is prohibited.

### II. Simplicity and bounded scope

Delivery MUST use the smallest coherent design that satisfies accepted
requirements. Non-goals MUST be named, and scope cannot expand silently.
Before the SDD route question, Root MUST summarize relevant context, scope,
clarity, risk, and its evidence-based recommendation. Any explicit answer wins.
When the native question returns answerless, Root MUST make at most three total
attempts; after the third answerless result, the recommended route counts as
selected.

### III. Testable contracts

Behavioral requirements MUST have observable acceptance evidence. Behavior
changes MUST use test-first execution at an agreed public seam when practical.

### IV. Independent assurance

Every route MUST include verification proportional to the changed behavior and
risk. The implementation writer cannot approve its own work. Trivial
deterministic Direct work MAY be verified by Root when the decision is bounded
and independent of the implementation writer. Materially risky Direct work and
every Accelerated or Full final verify MUST use a fresh independent read-only
reviewer. Pre-implementation plan review is optional and is selected explicitly
or by the bounded recommended fallback; when offered, any explicit answer wins.
After the third answerless result,
`Review plan with Oracle (Recommended)` counts as selected. Actionable review
rejections MUST be repaired and revalidated before a fresh reviewer round until
approval or a material human-owned blocker. After approval, Root MUST give an
approved plan summary before asking `Implement (Recommended)` or `Stop`; any
explicit answer wins, while the third answerless result selects implementation.
Plan review never substitutes for final verification.

### V. Traceable delivery

Specifications, plans, tasks, implementation evidence, verification verdicts,
and archive reports MUST remain traceable without relying on chat history.

## Governance

- Planning MUST record evidence-backed Constitution Check results before and
  after design; routine feature work reads the principles but does not amend or
  revalidate constitution lifecycle metadata.
- Exceptions MUST identify the principle, reason, risk, owner, and removal
  condition.
- Amendments require explicit user direction, an updated Sync Impact Report,
  and propagation to affected templates, instructions, and documentation.
- MAJOR versions remove or redefine governance compatibility.
- MINOR versions add a principle or materially expand guidance.
- PATCH versions clarify wording without changing its meaning.
