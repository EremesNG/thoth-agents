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
Oracle review; mandatory final verification still applies under the selected
route and its risk-aware ownership boundary.

## Ownership and inputs

Resolve `<skill-dir>` as the directory containing this `SKILL.md`. Every bundled
asset path in this contract is anchored to that installed skill root rather than
the project or current working directory.

Root coordinates the phase and dispatches Oracle. Oracle remains read-only: it
must not edit source, SDD artifacts, or coordination state. Root persists the
returned review at `openspec/changes/<change>/plan-review.md` using
`<skill-dir>/templates/plan-review.md`.

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

## Native parallel executability

Structural ready validation proves that declared parallel metadata is
well-formed; it does not prove semantic independence. When `tasks.md` declares
parallel groups, Oracle must independently assess whether the plan can execute
them safely:

- Confirm each lane path union is genuinely disjoint from the other lanes and
  its selected owner fits the bounded work.
- Confirm cross-lane data flow does not hide a dependency and that the declared
  prerequisites and barrier reflect the real execution order.
- Confirm the handoff is sufficient for native capacity-bounded waves:
  dispatch-before-wait for every admitted lane, refill before another wait, and
  terminal reconciliation before releasing the barrier.
- Require a truthful sequential fallback when native concurrency or capacity is
  unavailable or unproven.

For an evidence-backed `None` declaration, assess whether the claimed coupling
really prevents a safe group. Treat a structural-but-semantically-unsafe group
as a blocker only when the smallest repair is required before implementation;
keep capacity uncertainty as a non-blocking caution when the declared fallback
still makes the plan executable.

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

Plan review never replaces or substitutes for mandatory final verification.
Every route still requires post-implementation verification, but ownership is
proportional: trivial deterministic Direct work may be Root-verified when Root
is not self-approving its own implementation; materially risky Direct work and
every Accelerated or Full final verify require a fresh read-only Oracle.

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
