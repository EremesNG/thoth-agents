# Implement contract

**Owner**: adaptive root, `designer`, `quick`, or `deep` in every route; exactly
one writer per mutable surface

SDD routes govern artifacts and gates, not implementation ownership. Before
implementation or dispatch, root records the decided owner, task-shape/net-gain
rationale, exact paths, accepted FR/buildable-SC scope, non-goals, and
verification commands. Route, file count, or cheaper model price alone is not an
ownership rationale.

Root may retain implementation when short or sequential work, shared mutable
state, accumulated context, rediscovery, or coordination overhead outweighs
delegation benefit. Delegate when specialization, context isolation, independent
bounded work, quality, latency, or total cost creates demonstrated net gain. If
root owns the surface, do not dispatch a writer. If a specialist owns it, send a
bounded handoff with the exact surface, requirements, and checks.

Root marks selected artifact-backed tasks `[~]`; Direct or no-artifact work has
no task state. Use the mandatory `tdd` skill for behavior changes and work in
vertical red/green slices. Child writers never edit task state; root marks `[x]`
only after checking task-specific evidence.

After deciding delegation creates net gain, select deterministically:

- `designer` for user-facing UI/UX, interaction, accessibility, responsive, or
  visual-quality work;
- `quick` for a known narrow mechanical low-risk surface with exact targets;
- `deep` for coupled multi-file, shared-contract, migration, concurrency,
  edge-case-heavy, or high-risk work.

Proven independent surfaces may use different writers only with non-overlapping
ownership. Overlapping or compatibility-coupled work uses one `deep` writer and
ordered handoffs. A writer escalates before expanding beyond its routing
boundary. Every route requires mandatory verification, and the implementation
writer never approves its own work. For trivial deterministic Direct work, Root
may run the proportionate focused checks when Root is not self-approving its own
implementation. For materially risky Direct work and every Accelerated or Full
final verify, root hands the unchanged candidate to a fresh read-only Oracle.

Implementation evidence may refine an artifact without restarting the workflow:

- If it preserves the accepted intent, return the evidence to root; root updates
  the canonical artifact and revalidates only affected downstream artifacts and
  gates.
- If it changes intent or accepted product scope, start a new change rather than
  silently expanding this one.

Report files changed, checks executed, deviations, and remaining work.

## Native dispatch groups and waves

For each ready group, confirm prerequisites, ordered lane tasks, exact path
union, owner, requirements, and checks. Select the capacity-bounded set of
undispatched ready lanes and create one fresh native specialist assignment per admitted lane. Issue every dispatch in that native wave before any wait, status,
result collection, or root implementation action. Retain handles; when terminal evidence frees capacity, dispatch the next undispatched ready lane before waiting again. Validate terminal evidence per lane, while root alone updates task state. Cross the declared barrier only after every lane is terminal and reconciled. Preserve truthful capability/capacity fallback: when native
concurrency is unavailable or width is one, use a truthful sequential fallback.
