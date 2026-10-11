---
name: plan-reviewer
description: Provides independent, blocker-only Oracle review of a substantial SDD plan. Use only when plan review was selected at substantial ready; it does not authorize implementation.
license: MIT
compatibility: Requires the installed sibling thoth-sdd skill.
metadata:
  author: thoth-agents
  version: "2.0"
---

# Plan Reviewer

After the substantial plan passes `ready`, root first shows the user a concise
plan summary, then always offers Review plan with Oracle (Recommended) or
Proceed without review, even when implementation is already authorized. Silence is never an explicit skip; a fresh review runs only
when selected. Root, not Oracle, owns choices, budgets, recovery, and
implementation authorization. Every orchestrator choice with a meaningful
recommendation follows the per-question rule: repeat the same question after its
first and second confirmed answerless native returns without dependent work,
then select the recommendation after the third. Explicit answers and `Stop` win.
Pending, unavailable, failed, interrupted, or host-prohibited attempts do not
count. Report higher-priority host limits accurately; do not claim unmade returns
or an explicit user choice. Never invent facts or secrets; when a human-owned
decision is still unresolved, recommend safe deferral.

A fresh read-only Oracle reviews `.thoth/changes/<id>/<id>.md`,
`.thoth/constitution.md`, affected canonical `.thoth/specs/`, and focused source
evidence. Check grounded exploration, observable acceptance, settled
clarification, technical feasibility, dependencies, verification seams,
autonomy bounds, and native capacity. Concurrent tasks need semantic
independence and non-overlapping mutable ownership; unknown liveness blocks only
conflicting work. Do not require multiple reports, universal requirement IDs,
workflow manifests, evidence directories, or a scheduler. Structural `ready` is
necessary but not sufficient for semantic readiness.

Return exactly one fenced `thoth-result` JSON envelope as the entire final
message, following the specialist contract: `role: "oracle"`,
`review.kind: "plan-review"`, and `review.verdict: "OKAY" | "REJECT"`.
Include concise evidence and at most three blocking risks for actual execution
blockers with smallest repairs; mark cautions nonblocking. An OKAY requires
`status: "complete"` and no blocking risks. Root validates the unchanged native
terminal result with `--role oracle --review-kind plan-review` using the sibling
thoth-sdd skill's **Specialist result validation** procedure, including its shared
one-request format-only repair budget. Root records plan-review `OKAY` only from a validated envelope
and after judging the content; a malformed or missing envelope is not approval.
Root repairs same-intent blockers in the same record, revalidates affected gates,
and uses a fresh Oracle for each round. A human-owned material blocker stops the
round. Root records both review disposition and selection provenance without
inventing approval. Accepted provenance is `EXPLICIT_REVIEW`, `EXPLICIT_SKIP`, or
`DEFAULT_REVIEW_AFTER_3`; `SKIPPED` requires explicit skip, while `OKAY` requires
explicit review or the third-return review default. After validated `OKAY`, root preserves
the separate Implement (Recommended) / Stop choice and separately offers it,
honoring prior explicit implementation authorization; an explicit later Stop
supersedes it. That choice has its own per-question budget. Review never
substitutes for fresh independent final Oracle verification, and Oracle never
writes change artifacts.
