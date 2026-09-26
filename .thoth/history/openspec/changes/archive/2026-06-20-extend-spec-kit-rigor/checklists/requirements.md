# Requirements-Quality Checklist: extend-spec-kit-rigor

"Unit tests for English." Each authored delta domain is checked across four
dimensions: completeness, clarity, measurability, testability. Items are `- [x]`
(satisfied), `- [ ]` (open), or `- [-] waived: reason`. The spec -> tasks
transition is gated on every item being `- [x]` or explicitly waived.

## Domain: sdd-tasks-format

### Completeness
- [x] `[P]` emission, the config toggle, executing-plans consumption, and harness parity are all specified
- [x] Back-compatibility (absent `[P]`, absent toggle) is covered by explicit scenarios
- [x] `N.M` numbering and `[USN]` preservation is asserted (no flat `T001`)

### Clarity
- [x] RFC 2119 keywords used in every requirement statement
- [x] The MODIFIED requirement header matches the base spec header verbatim
- [x] `[P]` is defined as an explicit parallel-dispatch signal vs. today's implicit batching

### Measurability
- [x] Each requirement has at least one Given/When/Then scenario
- [x] Enabled vs. disabled/absent toggle states have distinct, observable outcomes

### Testability
- [x] Scenarios are checkable against `tasks.md` content and `executing-plans` dispatch
- [-] waived: exact `[P]` dispatch granularity (cross-phase vs. same-agent batch) is deferred to design (open question (c)); the batch-existence behavior is testable now

## Domain: sdd-design-authoring

### Completeness
- [x] `design.md` always-required invariant is stated independent of sub-artifacts
- [x] All four sub-artifacts (`research.md`, `data-model.md`, `contracts/`, `quickstart.md`) are named
- [x] Both gating conditions (enable toggle AND complexity) are specified
- [x] Downstream-consumer tolerance of absent sub-artifacts is covered

### Clarity
- [x] RFC 2119 keywords used in every requirement statement
- [x] Supplementary vs. authoritative roles are unambiguous (sub-artifacts never replace `design.md`)
- [x] `contracts/` layout precedent (`checklists/` subdir) is stated

### Measurability
- [x] Each requirement has at least one Given/When/Then scenario
- [x] Complex vs. simple vs. disabled produce distinct, observable outputs

### Testability
- [x] Scenarios are checkable against the change-directory contents and config state
- [-] waived: which actor evaluates `complexity_threshold` (author vs. config) is deferred to design (open question (b)); the gating-by-both-conditions behavior is testable now

## Domain: sdd-clarification

### Completeness
- [x] Phase position, Full-SDD-only scope, taxonomy scan, bounded Q&A, write-back, checklist re-validation, delegation routing, and harness parity are all specified
- [x] Boundary with `requirements-interview` (no duplication) is an explicit requirement
- [x] `SddPhaseContract` / `FULL_SDD_PHASE_ORDER` / `SDD_PHASES` registration and downstream prereqs are required

### Clarity
- [x] RFC 2119 keywords used in every requirement statement
- [x] Bounded Q&A is tied to the existing clarification cap, not a new bound
- [x] "Authoritative spec content consumed by design" decouples behavior from storage representation

### Measurability
- [x] Each requirement has at least one Given/When/Then scenario
- [x] Full vs. accelerated pipeline presence of `clarify` has distinct, observable outcomes
- [x] Cap-bounded Q&A has a concrete numeric scenario (cap 3, >3 candidates -> at most 3)

### Testability
- [x] Phase-order, prereq, and delegation-matrix scenarios are checkable against `sdd.ts` and `prompt-sections.ts`
- [-] waived: write-back storage representation (in-place vs. new artifact; thoth-mem topic key) is deferred to design (open question (a)); the design-consumes-clarified-spec behavior is testable now
