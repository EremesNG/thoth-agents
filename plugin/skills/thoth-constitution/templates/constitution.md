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

### III. Testable contracts

Behavioral requirements MUST have observable acceptance evidence. Behavior
changes MUST use test-first execution at an agreed public seam when practical.

### IV. Independent assurance

The implementation writer cannot approve its own work. Analyze and verify MUST
be performed by an independent read-only reviewer.

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
