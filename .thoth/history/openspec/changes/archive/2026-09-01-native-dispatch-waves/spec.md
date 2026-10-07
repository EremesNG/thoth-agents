# Feature Specification: Native Dispatch Waves

**Change ID**: `native-dispatch-waves`<br>
**Route**: Accelerated<br>
**Status**: Draft

## Intent and scope

**Why**: The adaptive root already knows that independent lanes should be dispatched before waiting, but artifact-backed SDD records `[P]` only as loose task pairings. Broad implementation ownership can therefore collapse several path-level parallel candidates into one large specialist assignment, and static prompt tests cannot prove native fan-out behavior.<br>
**Impact**: Artifact-backed tasks will declare explicit parallel groups made of independent lanes. Each lane will bind an ordered task sequence to one specialist and the union of its exact task paths, preserving vertical test-to-implementation work while preventing role-wide ownership aggregation. During implementation, the root will translate each ready group into capacity-bounded native dispatch waves, issue every lane dispatch in the current wave before waiting, refill released native capacity before waiting again, and cross the barrier only after every lane has terminal validated evidence.<br>
**Affected capabilities**: `adaptive-sdd`, `multi-harness-agent-pack`

## User stories

### US1 - Declare executable parallel groups (Priority: P1)

As a maintainer, I can express which ordered task sequences form independent lanes, who owns each lane, and what work is blocked on their completion so that implementation does not need to infer dispatch units from vague pairings.

**Independent test**: Validate a tasks artifact containing two disjoint lanes, each with an ordered test-to-implementation task sequence and a specialist owner, plus an explicit prerequisite set and downstream barrier; then mutate each structural field and observe stable validation failures.

**Covers**: FR-001, FR-003, SC-001, SC-002

**Acceptance scenarios**:

1. **Given** two or more lanes with disjoint exact path sets and no cross-lane dependency, **When** tasks are authored, **Then** every `[P]` task appears in exactly one ordered lane inside one named parallel group with a lane-level specialist owner, explicit group prerequisites, a barrier, and concrete independence rationale.
2. **Given** two lanes select the same specialist role, **When** implementation ownership is resolved, **Then** each lane remains a distinct fresh assignment bounded to the union of its task paths instead of being aggregated into one role-wide handoff.
3. **Given** no safe multi-lane group exists, **When** tasks are authored, **Then** the artifact records one evidence-backed `None` reason and marks no task `[P]`.

### US2 - Preserve dependency and ownership safety (Priority: P1)

As an operator, I can trust declared parallel groups to exclude overlapping or dependency-coupled work so that higher fan-out does not create conflicting writers or premature synthesis.

**Independent test**: Submit task artifacts with duplicate task membership, unknown tasks, cross-lane dependencies, overlapping lane path sets, missing owners, invalid prerequisites, and missing barriers; each invalid artifact is rejected before implementation.

**Covers**: FR-001, FR-003, SC-001, SC-002

**Acceptance scenarios**:

1. **Given** one proposed lane consumes a task output from another lane in the same group, **When** the tasks gate runs, **Then** it rejects the cross-lane dependency while allowing ordered dependencies within a lane.
2. **Given** two proposed lanes own equal or ancestor-descendant task paths, **When** the tasks gate runs, **Then** it rejects the group as overlapping.
3. **Given** a `[P]` task is unknown, omitted, duplicated across lanes or groups, or its lane lacks an eligible specialist owner, **When** the tasks gate runs, **Then** it reports a stable structural diagnostic and blocks readiness.

### US3 - Execute native fan-out before fan-in (Priority: P1)

As a user, I can observe multiple independent specialists being invoked through the active harness before the root waits, while native capacity and lifecycle remain owned by that harness.

**Independent test**: Run a bounded two-lane smoke case in each supported harness and capture that both native dispatches precede the first wait or result collection, followed by terminal reconciliation at the declared barrier.

**Covers**: FR-002, FR-004, SC-003, SC-004, SC-005

**Acceptance scenarios**:

1. **Given** a declared group whose ready lanes fit current native capacity, **When** implementation begins, **Then** the root creates one fresh bounded specialist assignment per lane and issues all native dispatches before the first wait, status, result, or assigned-work implementation action.
2. **Given** a declared group is wider than current native capacity, **When** a terminal result releases capacity, **Then** the root dispatches the next undispatched ready lane before waiting again and does not claim full-width concurrency.
3. **Given** a harness lacks or does not prove the needed concurrent primitive, **When** the group is reached, **Then** the root reports the capability gap and uses a truthful sequential fallback without adding a Thoth executor.
4. **Given** some group lanes are nonterminal, timed out, silent, or malformed, **When** fan-in is evaluated, **Then** the root keeps the barrier closed until every lane has terminal validated evidence.

## Edge cases

- A lane is path-disjoint but semantically consumes another lane's output; the two lanes cannot share a group.
- A task belongs to two proposed lanes or groups; readiness is ambiguous and validation fails.
- Multiple lanes use the same role; role identity does not merge their fresh per-lane assignments.
- Tasks inside one lane may form an ordered red-to-green chain across multiple exact paths; that internal sequence remains one bounded writer assignment.
- Native capacity is one; the root reports truthful sequential degradation rather than pretending that the group ran concurrently.
- Capacity is smaller than a group but greater than one; the root keeps available slots filled before issuing another blocking wait.
- A specialist expands beyond its exact task surface; it escalates before editing and the root does not silently widen ownership.
- The barrier is final verification rather than another task; all group members still require terminal task-specific evidence.
- Live tool traces differ by harness; operational evidence is recorded per harness and never normalized into a synthetic universal API.

## Functional requirements

- **FR-001 — Preserve executable planning and task semantics**: `[MODIFIED adaptive-sdd]` Plans MUST map verification seams and exact ownership, while tasks MUST use globally sequential `T### [P?] [US#?]` grammar, exact repository-relative paths, concrete verification outcomes, and complete FR/buildable-SC coverage; every `[P]` task MUST belong to exactly one ordered lane inside one named parallel group, every group MUST declare at least two cross-lane-independent lanes, every lane MUST bind one or more ordered tasks and their exact path union to one eligible specialist owner, and every group MUST declare explicit external prerequisites, one downstream or final-verification barrier, and concrete independence evidence, while artifacts with no safe group MUST record one evidence-backed `None` reason.
- **FR-002 — Use adaptive-root delegation**: `[MODIFIED multi-harness-agent-pack]` Before substantive execution, the root MUST shape bounded ready and blocked lanes with exact dependencies, ownership, specialist fit, and verification inputs; for each declared ready parallel group it MUST create one fresh bounded native assignment per lane, dispatch every lane admitted by current native capacity before the first blocking wait or result collection, refill released capacity with remaining ready lanes before waiting again, accept only terminal native evidence for fan-in, and cross the declared barrier only after all lanes are reconciled, while preserving truthful sequential fallback when native concurrency is unavailable or unproven.
- **FR-003 — Validate declarative dispatch groups**: `[INTERNAL]` The structural validator MUST accept the canonical parallel-group and ordered-lane form and MUST reject with stable diagnostics unknown or omitted `[P]` tasks, duplicate task membership, groups with fewer than two lanes, overlapping cross-lane path sets, declared cross-lane dependencies, missing or ineligible lane owners, invalid group prerequisites, missing barriers, contradictory `None` declarations, and contract drift between the task template, phase guidance, and validator fixtures.
- **FR-004 — Preserve native execution authority**: `[INTERNAL]` Thoth MUST express grouping, readiness, bounded ownership, dispatch ordering, terminal fan-in, and degradation only through SDD artifacts and instructions; it MUST NOT add an executor, scheduler, job board, task database, lifecycle ledger, trace collector, universal worktree manager, synthetic wait API, or fixed cross-harness concurrency limit.

## Success criteria

- **SC-001** `[buildable]`: Focused validator fixtures include at least 1 valid two-lane group with ordered tasks inside each lane and independently reject 11 invalid cases—unknown task, omitted task, duplicate membership, cross-lane dependency, cross-lane path overlap, missing owner, ineligible owner, invalid prerequisite, missing barrier, contradictory `None`, and single-lane group—with stable diagnostic codes.
- **SC-002** `[buildable]`: Canonical task template, task-phase guidance, validator behavior, bundled generated mirror, and routed SDD documentation describe 1 compatible parallel-group grammar with 0 ambiguous legacy pairing instructions.
- **SC-003** `[buildable]`: The implementation-phase contract contains all 7 required lifecycle assertions: one fresh bounded assignment per admitted lane, all current-wave dispatches before the first wait, capacity refill before another wait, no duplicate root implementation, terminal evidence per lane, root-only task-state updates, and barrier release only after complete reconciliation.
- **SC-004** `[outcome]`: A bounded live smoke case for each supported harness records 2 independent native child dispatches before the first blocking wait/result collection when capacity permits, terminal evidence for both children before barrier release, and explicit capability-gap or capacity degradation when equivalent concurrency is unavailable.
- **SC-005** `[buildable]`: Public tools, configuration schemas, runtime hooks, generated assets, and dependencies add zero Thoth-owned execution, scheduling, lifecycle, worktree, or trace-collection surfaces.

## Assumptions

- `[P]` marks eligibility for a declared parallel group; it does not override native capacity, net-gain judgment, semantic dependencies, or truthful fallback.
- The exact task path remains the mutable ownership surface for validator overlap checks; semantic independence additionally requires authored rationale and prerequisite review.
- Native concurrency width may vary by harness and session and is never serialized into a universal Thoth limit.
- Static CI proves artifact and instruction contracts; only per-harness smoke evidence can demonstrate actual model/tool-call ordering.
- Existing generic root guidance already expresses ready-wave-before-wait behavior and requires no new execution runtime.

## Dependencies

- Existing `thoth-sdd` task, implement, validator, and generated-bundle parity surfaces.
- Existing adaptive-root task-shaping and fresh-delegation contracts.
- Native subagent dispatch, capacity, wait/status, and terminal-result behavior exposed by each active harness.

## Out of scope

- Adding roles, increasing a harness concurrency limit, or requiring a universal agent count.
- A scheduler, DAG executor, queue, worktree manager, task database, lifecycle ledger, trace collector, observer, or recovery loop.
- Making Claude Dynamic Workflows, Agent Teams, or any harness-specific orchestration extension part of the portable core.
- Claiming deterministic runtime compliance from static prompt, validator, or adapter tests.
