---
name: plan-reviewer
description: Review an approved Thoth work contract for concrete execution blockers when the user selects review or its bounded unanswered-question default selects it.
license: MIT
compatibility: Requires the installed sibling thoth-work skill.
metadata:
  author: thoth-agents
  version: "2.1"
---

# Plan Reviewer

Use a fresh read-only Oracle to judge the executable agreement in
`.thoth/changes/<id>/work.yaml`. Root must offer review or direct implementation
when a persisted plan is ready; the user decides. Root must not select or skip
review on its own risk assessment. Follow the sibling thoth-work
[planning choices](../thoth-work/references/planning.md), including the two
separate three-unanswered-return budgets and root-owned recovery record. A review
never grants execution permission or substitutes for final verification.

Root supplies the validated contract, only relevant supporting context and
durable specifications, and the actual source references needed to judge it.
Resolve bundled helpers relative to this skill's installed sibling `thoth-work`.
Do not load a whole codebase or require separate spec, plan, tasks, or reports.

Judge outcome coverage, concrete dependencies, autonomy bounds, recoverability,
and whether each unit has a useful output and verification method. Check that
concurrent units have compatible read inputs, interfaces, mutable surfaces, and
shared resources. File separation alone is insufficient. Dispatch must fill
proven native capacity before waiting, refill released capacity, and release
each consumer after its own dependencies are accepted. There is no global wave
barrier. Unknown native liveness blocks only conflicting work.

Return `[OKAY]` with concise evidence, or `[REJECT]` with at most three actionable
execution blockers and their smallest repairs. Keep nonblocking suggestions
separate. Root repairs same-intent blockers and uses a fresh Oracle for a new
judgment. After [OKAY], root summarizes the approved plan and asks Implement
(Recommended) or Stop with approved plan, even when the objective was already
authorized. Only that choice may default to implementation after its third
confirmed unanswered native return; explicit Stop wins. Other material decisions
remain unresolved without an answer.

Root may save a useful review under `evidence/plan-review.md` using the optional
template. Include digests of the agreement and reviewed source content. A stored
review is historical when its reviewed inputs change. Material replanning needs
a fresh review and post-approval implementation choice; expected implementation
edits do not reopen settled choices. The root owns persistence;
Oracle never writes work artifacts, and nothing is mirrored to provider memory.
