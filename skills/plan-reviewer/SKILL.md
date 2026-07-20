---
name: plan-reviewer
description: Review a ready Accelerated or Full SDD artifact set for execution blockers after the user chooses the optional Oracle plan review. Use only for the pre-implementation plan-review phase; return exact [OKAY] or [REJECT] semantics while keeping final verification separate.
metadata:
  author: thoth-agents
  version: '1.0'
---

# Plan Reviewer

Review whether an accepted SDD plan can be implemented safely as written. Focus
on true execution blockers, not stylistic preferences or redesign ideas.

## Activation

Use this skill only after all of these conditions hold:

- The selected route is Accelerated or Full.
- The route's `ready` validator gate has passed.
- The user chose `Review plan with Oracle (Recommended)` instead of
  `Proceed without review`.

Do not activate automatically, and do not use it for Direct work. The user may
proceed without this review. Skipping it means there is no pre-implementation
Oracle review; mandatory final Oracle verify still applies.

## Ownership and inputs

Root coordinates the phase and dispatches Oracle. Oracle remains read-only: it
must not edit source, SDD artifacts, or coordination state. Root persists the
returned review at `openspec/changes/<change>/plan-review.md` using
`templates/plan-review.md`.

Review these canonical inputs:

- `spec.md`
- `plan.md`
- `tasks.md`
- an active requirements checklist, when present
- `openspec/memory/constitution.md`, when governance applies

OpenSpec is the only SDD artifact store. Do not mirror `plan-review.md` or its
payload into provider memory.

## Review method

Judge the artifact set on five dimensions:

1. Completeness: every in-scope requirement and success criterion maps to work.
2. Correctness: named files, symbols, commands, and public contracts are real or
   explicitly created by the plan.
3. Coherence: artifacts agree on scope, sequencing, dependencies, and ownership.
4. Buildability: a competent implementer can execute without guessing about
   critical paths or hidden prerequisites.
5. Outcome coverage: verification tasks can demonstrate the requested result.

Respect TDD ordering and the repository constitution when they apply. Report
non-blocking cautions separately so they do not become artificial gates.

## Decision contract

Default to `[OKAY]`. Return `[REJECT]` only when execution is genuinely blocked.
A rejection contains at most 3 actionable blockers. For each blocker, state why
it blocks execution and the smallest concrete repair. Preserve the exact
`[OKAY]` and `[REJECT]` tokens across every harness.

After `[REJECT]`, Root repairs the canonical artifacts and offers the user the
review-or-proceed choice again. Do not silently approve a changed plan.

## Freshness and persistence

Root computes SHA-256 digests for every reviewed artifact and records them in
the persisted review. Treat a stored approval as fresh only while every recorded
digest matches. A stale review has no gate value; rerun it only if the user still
chooses review.

The persisted artifact records the status, Oracle role, timestamp, route,
comments, non-blocking notes, blockers, any explicit override, and source
digests. Oracle returns this payload; Root is the only writer that persists it.

## Handoff

After `[OKAY]`, Root summarizes the approved plan and must ask whether to implement or stop.
Approval is not implementation authorization. Choosing
`Proceed without review` at the earlier choice does authorize implementation.

Plan review never replaces mandatory final Oracle verify. Every route still
requires independent post-implementation verification by a non-writer.

## Output

For an executable plan:

```text
[OKAY]
- Brief evidence that the plan is complete, coherent, and executable.
- Optional non-blocking cautions.
```

For a blocked plan:

```text
[REJECT]
1. <blocker, impact, and smallest repair>
2. <optional blocker>
3. <optional blocker>
```
