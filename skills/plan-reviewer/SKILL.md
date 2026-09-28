---
name: plan-reviewer
description: Independent blocker-only Oracle review of a ready substantial SDD plan before separate implementation authorization.
license: MIT
compatibility: Requires the installed sibling thoth-sdd skill.
metadata:
  author: thoth-agents
  version: "2.0"
---

# Plan Reviewer

After the substantial plan passes `ready`, root may offer Review plan with Oracle
(Recommended) or Proceed without review. Explicit answers win; only three
confirmed answerless native returns permit the recommended review default. Root,
not Oracle, owns choices, budgets, recovery, and implementation authorization.

A fresh read-only Oracle reviews `.thoth/changes/<id>/<id>.md`,
`.thoth/constitution.md`, affected canonical `.thoth/specs/`, and focused source
evidence. Check grounded exploration, observable acceptance, settled
clarification, technical feasibility, dependencies, verification seams,
autonomy bounds, and native capacity. Concurrent tasks need semantic
independence and non-overlapping mutable ownership; unknown liveness blocks only
conflicting work. Do not require multiple reports, universal requirement IDs,
workflow manifests, evidence directories, or a scheduler. Structural `ready` is
necessary but not sufficient for semantic readiness.

Return `[OKAY]` with concise evidence or `[REJECT]` with at most three actual
execution blockers and smallest repairs; keep cautions separate. Root repairs
same-intent blockers in the same record, revalidates affected gates, and uses a
fresh Oracle for each round. A human-owned material blocker stops the round.
Root records review disposition without inventing approval, then separately
offers Implement (Recommended) or Stop. That second decision has its own
three-confirmed-answerless budget. Review never substitutes for fresh
independent final Oracle verification, and Oracle never writes change artifacts.
