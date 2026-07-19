# Analyze contract

**Owner**: oracle (read-only, independent)<br>
**Applies to**: Full

Review `spec.md`, `plan.md`, `tasks.md`, the constitution, and optional checklist.
Detect contradictions, ambiguity, duplication, scope drift, orphan tasks,
uncovered FR/SC, invalid task ordering, and constitution violations. Report stable
finding IDs with CRITICAL/HIGH/MEDIUM/LOW severity, requirement and story coverage
percentages, checklist status, and a `ready` or `blocked` verdict. Any CRITICAL
finding, constitution violation, or baseline requirement with zero task coverage
blocks implementation. Do not edit artifacts; root owns remediation.
