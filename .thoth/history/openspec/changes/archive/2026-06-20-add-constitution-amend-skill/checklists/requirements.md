# Requirements-Quality Checklist: add-constitution-amend-skill

"Unit tests for English." Each authored delta domain is checked across four
dimensions: completeness, clarity, measurability, testability. Items are `- [x]`
(satisfied), `- [ ]` (open), or `- [-] waived: reason`. The spec -> tasks
transition is gated on every item being `- [x]` or explicitly waived.

## Domain: sdd-constitution

### Completeness
- [x] The guided amendment of `openspec/memory/constitution.md` (semver bump, `Last-Amended` update, prepended Sync-Impact Report entry) is fully specified
- [x] The dual trigger model (explicit invocation AND report-only auto-suggest from sdd-verify/sdd-archive) is specified
- [x] The report-only / read-only-asset constraint (never edits another SKILL.md or plugin asset) is an explicit requirement
- [x] Registration in `BUNDLED_SKILL_REGISTRY` and harness parity are covered
- [x] The Sync-Impact Report entry format `X.Y.Z | change type | principles touched | downstream gates/artifacts affected` is named

### Clarity
- [x] RFC 2119 keywords used in every requirement statement
- [x] The semver policy (MAJOR=remove/redefine, MINOR=add/expand, PATCH=clarify) is stated unambiguously and tied to a MANUAL-but-guided decision
- [x] "Report-only" is unambiguous: auto-suggest is non-blocking, never a gate; propagation documents/flags but never edits
- [x] The single writable target (constitution file only) is stated distinctly from all other (read-only) assets

### Measurability
- [x] Each requirement has at least one Given/When/Then scenario
- [x] Amended vs. unamended constitution states (version, date, Sync-Impact entry count) are distinct, observable outcomes
- [x] Triggered vs. not-triggered auto-suggest (governance touched vs. not) has distinct, observable outcomes

### Testability
- [x] Registration is checkable against `BUNDLED_SKILL_REGISTRY` / `custom-skills.test.ts`
- [x] The read-only-asset constraint is checkable as a prose invariant (no write target other than the constitution file)
- [x] The governance-touched DETECTION heuristic for auto-suggest is resolved in `## Assumptions` (open question (a)) as a deliberately-broad, low-false-negative path/principle-reference check; the report-only, non-blocking BEHAVIOR is specified and testable
- [x] The suggestion-text location is resolved in `## Assumptions` (open question (b)) as a DRY `_shared` snippet referenced by both sdd-verify and sdd-archive; aligned presence in both is testable
- [x] Whether `sdd-constitution` joins the SDD phase contract/delegation matrix is resolved in `## Assumptions` (open question (c)) as standalone (registered, NOT a pipeline phase); absence from phase orders is testable
