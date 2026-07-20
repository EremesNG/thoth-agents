# Analyze contract

**Owner**: oracle (read-only, independent)<br>
**Applies to**: Full

Review `spec.md`, `plan.md`, `tasks.md`, the constitution, and any activated
checklist across three separate dimensions:

- **Completeness**: all accepted scope, FRs, buildable SCs, stories, failures,
  and constraints have downstream coverage.
- **Correctness**: requirements and technical choices are testable, feasible,
  and consistent with repository evidence and the constitution.
- **Coherence**: spec, plan, tasks, dependencies, and verification seams do not
  contradict or duplicate one another.

Buildable SCs require tasks; outcome SCs require measurable validation intent,
not fake implementation tasks. Report stable finding IDs with
CRITICAL/HIGH/MEDIUM/LOW severity, coverage percentages, checklist status, and a
`ready` or `blocked` verdict. Any CRITICAL finding, constitution violation, or
FR/buildable SC with zero task coverage blocks implementation. Never edit
artifacts; root owns remediation.
