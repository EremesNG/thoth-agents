# thoth-agents Project Constitution

Version: 1.0.0
Ratified: 2026-06-16
Last-Amended: 2026-06-16

Native thoth-agents governing principles. This artifact adopts the
MECHANICS of versioned governance, not spec-kit's articles. Bump the
semantic version on every edit per the policy below and append a
Sync-Impact Report entry.

Principles: delegate-first coordination, read-only role boundaries, governed
persistence, multi-harness parity, and evidence-led verification.

## Semver Bump Policy

- MAJOR: a principle is removed or its meaning redefined.
- MINOR: a principle is added or its guidance materially expanded.
- PATCH: clarification or wording with no behavioral change.

The bump is manual (no runtime parses this file). The editor MUST update
`Version`, `Last-Amended`, and the `## Sync-Impact Report` on every change.

## Principles

### Principle 1: Delegate-first coordination

**Statement**: The root/orchestrator coordinates and delegates execution to
role-specialized agents; it does not absorb specialist work it should route.

**Rationale**: Delegation keeps each phase owned by the best-fit role and
preserves the multi-agent dispatch model the pipeline is built on.

**Gate Implications**: A design or plan that collapses delegation into a
single monolithic actor, or routes a phase to the wrong owner, violates
this principle.

### Principle 2: Read-only role boundaries

**Statement**: Read-only roles (explorer, librarian, oracle) MUST NOT mutate
the workspace; only write-capable roles edit files.

**Rationale**: Clear read/write boundaries make review and verification
trustworthy and prevent accidental scope creep during discovery.

**Gate Implications**: Assigning workspace edits to a read-only role, or
having oracle/explorer/librarian write artifacts, violates this principle.

### Principle 3: Governed persistence

**Statement**: Durable memory and artifacts use the governed surfaces
(thoth-mem and `openspec/`) with the ownership rules in the persistence and
thoth-mem conventions; ad hoc persistence patterns are not introduced.

**Rationale**: A single governed memory model keeps session/project scope,
prompt ownership, and SDD artifacts consistent and recoverable.

**Gate Implications**: Inventing alternate stores, saving subagent prompts as
user intent, or bypassing the `sdd/*` namespace rules violates this principle.

### Principle 4: Multi-harness parity

**Statement**: Behavior is defined once in shared layers (`_shared`
conventions, unified skill prose, the `sdd.ts` contract) and applies
identically across OpenCode, Claude Code, and Codex; per-harness prose is
limited to declared capability gaps.

**Rationale**: Shared-layer logic prevents dialect drift and keeps gate and
artifact semantics portable.

**Gate Implications**: Duplicating mechanics per dialect, or silently
changing gate semantics for one harness instead of reporting an
unsupported-capability limitation, violates this principle.

### Principle 5: Evidence-led verification

**Statement**: Completion claims are backed by executed evidence; the bounded
verify loop and acceptance criteria gate progress, and failures escalate
rather than being asserted away.

**Rationale**: Verifiable evidence is the value proposition of the pipeline
and the basis for trustworthy archive.

**Gate Implications**: Marking work done without verification evidence, or
skipping the verify gate, violates this principle.

## Sync-Impact Report

<!-- Newest entry on top. Each entry: version | change type | principles
touched | downstream gates/artifacts affected. -->

- 1.0.0 | initial ratification | all five principles introduced | establishes
  the Constitution Check gate consumed by sdd-design and plan-reviewer.
