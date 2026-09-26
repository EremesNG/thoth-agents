<!--
Sync Impact Report
- Version change: 8.0.0 -> 9.0.0
- Modified principles: Bounded ownership and human authority now require two recoverable planning choices with bounded unanswered defaults
- Added sections: None
- Removed sections: None
- Templates: ✅ skills/thoth-constitution/templates/constitution.md; ✅ skills/thoth-work; ✅ skills/plan-reviewer; ✅ root prompts and workflow documentation
- Follow-up TODOs: None
-->
# thoth-agents Project Constitution

**Version**: 9.0.0<br>
**Ratified**: 2026-06-16<br>
**Last amended**: 2026-09-26

## Principles

### 1. Native runtime authority

OpenCode, Codex, Claude Code, and Pi own dispatch, capacity, status, wait,
steering, cancellation, and terminal results through their native primitives.
thoth-agents MUST NOT implement a scheduler, queue, execution database, or
memory provider. Capability gaps MUST remain explicit and use a truthful
sequential fallback.

### 2. Bounded ownership and human authority

Delegation depth is one. Each mutable surface has one writer, and each new
objective or independent judgment uses a fresh fitting specialist. Humans own
material product, architecture, security, and destructive decisions.
For a ready persisted plan, root MUST offer Oracle review (recommended) or direct
implementation. After Oracle [OKAY], root MUST offer implementation (recommended)
or stopping with the approved plan, even when the objective was authorized.
Each choice defaults to its recommendation only after three confirmed unanswered
native returns; explicit answers and Stop always win. Pending questions, unavailable
UI/tools, failures and interruption MUST NOT count. These defaults MUST NOT
resolve other human-owned decisions or override native restrictions. Root MUST
preserve choices and remaining budgets across recovery without repeating settled
choices or asking the user to choose a pipeline.

### 3. Persisted work is the recoverable agreement

Nontrivial or resumable work MUST use `.thoth/changes/<id>/work.yaml` as its
canonical agreement. Per-topic context, external-unit records, and evidence MAY
be added only when useful. `.thoth/` is canonical project state; provider memory
is independent and MUST NOT mirror the work contract. Recovery MUST reconcile
projected state with native liveness before redispatching work.

### 4. Evidence-based acceptance

Root MUST accept each dependency from terminal native evidence before releasing
its consumers. Native execution SHOULD fan out every ready, conflict-free unit,
then refill released capacity as dependencies are accepted; it MUST NOT impose a
global wave barrier. Persisted work requires an independent fresh Oracle final
judgment, and no implementation writer may approve its own work.

### 5. Minimal mechanism

Use the smallest explicit workflow that preserves user intent, ownership,
dependencies, recovery, and verification. Worktrees remain a deferred runtime
concern until a concrete requirement authorizes them.

## Governance

- Amendments require explicit user direction, a refreshed Sync Impact Report,
  and propagation to affected templates, instructions, and durable documents.
- Routine work reads only the active principles relevant to its decisions and
  risks; it does not repeat plan narratives or amend lifecycle metadata.
- MAJOR versions remove or redefine a principle or compatibility boundary.
- MINOR versions add a principle or materially expand guidance.
- PATCH versions clarify wording without changing semantic behavior.
