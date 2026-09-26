# Design: Persist Oracle Plan Review Results

## Technical Approach

Persist Oracle plan-review as a first-class SDD gate artifact without making the
Oracle role writable. Oracle continues to perform the independent read-only
review and returns the portable review token (`[OKAY]` or `[REJECT]`) plus notes.
The coordinator, or a write-capable persistence helper when the harness requires
subagent writes, materializes that result into the selected persistence stores.

Canonical OpenSpec path:

```text
openspec/changes/{change-name}/plan-review.md
```

Canonical thoth-mem topic key for modes that include memory:

```text
sdd/{change-name}/plan-review
```

This design run is OpenSpec-only because thoth-mem writes are blocked by
`no such table: observation_facts`; no memory write is performed for this
artifact.

The persisted artifact is Markdown with YAML front matter so humans can review
it while recovery can parse deterministic fields. Front matter carries the gate
metadata and freshness manifest; body sections carry the Oracle result text,
comments, blockers, non-blocking notes, and override context.

```md
---
schema: thoth-agents/sdd-plan-review/v1
artifact: plan-review
change: {change-name}
gate: oracle-review
status: "[OKAY]" # or "[REJECT]", "OVERRIDDEN"
reviewer_role: oracle
reviewed_at: {ISO-8601 timestamp}
pipeline: full # or accelerated
persistence_mode: openspec # thoth-mem | hybrid | none
memory_topic_key: sdd/{change-name}/plan-review
override:
  occurred: false
  at: null
  surface: null
  context: null
reviewed_artifacts:
  - role: proposal
    path: openspec/changes/{change-name}/proposal.md
    required: true
    sha256: {hex digest}
---

# Plan Review: {change-name}

## Oracle Result
## Comments
## Non-Blocking Notes
## Blockers
## User Override Context
## Freshness Manifest
## Recovery Decision
```

Freshness uses `sha256` over the exact UTF-8 bytes of each persisted artifact as
read at review time. Paths are stored relative to the project root and sorted by
path for deterministic comparison. Recovery recomputes the same digests from the
currently selected store before accepting a saved approval.

Reviewed artifact sets:

- Full pipeline: `proposal.md`, every delta spec at
  `openspec/changes/{change-name}/specs/*/spec.md`, `design.md`, `tasks.md`, and
  `checklists/requirements.md` when present for the change.
- Accelerated pipeline: `proposal.md` and `tasks.md`; spec and design artifacts
  are not required because accelerated pipelines do not produce them.

## Architecture Decisions

### Decision: Use `plan-review.md` as the canonical OpenSpec artifact

**Choice**: Add `openspec/changes/{change-name}/plan-review.md`.

**Alternatives considered**: Embed the result in `tasks.md`, add a nested
`reviews/plan.md`, or rely on thoth-mem state.

**Rationale**: A sibling change-local artifact matches existing OpenSpec
conventions (`design.md`, `tasks.md`, `verify-report.md`), is visible in
OpenSpec-only mode, avoids mutating the task checklist with review metadata, and
keeps the gate result separate from the later implementation-confirmation gate.

### Decision: Preserve Oracle as read-only and persist outside Oracle

**Choice**: `plan-reviewer` remains a read-only Oracle skill. The coordinator or
`quick` persistence helper writes the artifact from Oracle's returned result.
Update the phase contract to mark plan-review as producing an artifact while
using `persistenceAgentRole: 'quick'` for harnesses where a write-capable
subagent must do the filesystem or memory write.

**Alternatives considered**: Let Oracle write the artifact directly, or make the
root rerun Oracle on every recovery.

**Rationale**: Direct Oracle writes violate the read-only role boundary. Always
rerunning Oracle preserves safety but fails the stated durability goal. A
separate persistence owner matches the existing `sdd-verify` pattern where
Oracle reviews and `quick` can persist report artifacts.

### Decision: Use SHA-256 content digests for freshness

**Choice**: Store `sha256` digests for every reviewed planning artifact.

**Alternatives considered**: File mtimes, Git revisions, opaque artifact IDs, or
manual review timestamps only.

**Rationale**: Digests are deterministic across harnesses, work without Git, are
stable through session compaction, and detect any content change that could make
`[OKAY]` stale. Timestamps alone cannot prove unchanged content; mtimes are too
sensitive to filesystem behavior.

### Decision: Keep implementation confirmation as a separate gate

**Choice**: A fresh `[OKAY]` satisfies only the `plan-review` gate. Recovery must
still require `implementation-confirmation` before `apply`.

**Alternatives considered**: Treat saved approval as consent to implement.

**Rationale**: Oracle approval is technical plan approval, not user permission to
mutate implementation files. Existing tests and prompt guidance require a user
confirmation gate after `[OKAY]` and before `sdd-apply`.

### Decision: Missing or stale artifacts fail closed

**Choice**: Missing `plan-review.md`, missing memory topic, unparsable schema,
non-approval status, or digest mismatch does not satisfy the plan-review gate.
The coordinator reports the reason and reruns Oracle unless the normal explicit
blocking-input override path is used and persisted.

**Alternatives considered**: Infer approval from completed tasks or from prior
conversation state.

**Rationale**: Legacy changes must not be approved by default. Safe recovery
requires durable evidence, not conversational memory or task presence.

## Data Flow

1. `sdd-tasks` completes and writes `tasks.md`.
2. The coordinator dispatches Oracle with `plan-reviewer` and the current
   persistence mode, pipeline type, change name, and required artifact context.
3. Oracle reads the plan artifacts and returns `[OKAY]` or `[REJECT]` with the
   bounded comments/blockers defined by `plan-reviewer`.
4. The coordinator computes the reviewed-artifact manifest from the selected
   store:
   - OpenSpec/hybrid: project-relative OpenSpec files.
   - thoth-mem/hybrid: recovered canonical artifact contents by deterministic
     topic key.
5. A write-capable owner persists the exact review result as
   `plan-review.md`, `sdd/{change-name}/plan-review`, or both, depending on the
   selected persistence mode.
6. On recovery, the coordinator reads the persisted plan-review artifact before
   rerunning Oracle. If status is `[OKAY]` and every reviewed artifact digest
   matches, `plan-review` is complete. Otherwise the review is stale or blocking
   and Oracle must run again.
7. After a fresh `[OKAY]`, the coordinator still asks the user for
   implementation confirmation before dispatching `sdd-apply`.

Hybrid divergence follows the shared persistence contract: prefer thoth-mem,
fall back to OpenSpec when memory is absent, and immediately converge the stale
or missing copy from the freshest full artifact when memory writes are available.
If convergence fails, report the persistence limitation and avoid claiming both
stores were updated.

## File Changes

- `src/harness/core/sdd.ts`
  - Set the `plan-review` phase `producesArtifact` to `true`.
  - Add `artifactSkill: 'plan-reviewer'` and
    `artifactMeaning: 'oracle-plan-review-result'`.
  - Add `persistenceAgentRole: 'quick'` so read-only Oracle review and artifact
    writes remain separate.
  - Add handoff hints that a fresh approval only satisfies `plan-review` and that
    implementation confirmation remains required.

- `src/skills/plan-reviewer/SKILL.md`
  - Add persistence instructions for returning enough structured content to
    materialize `plan-review.md`.
  - Define the required reviewed artifact set for full and accelerated pipelines.
  - Preserve existing `[OKAY]` / `[REJECT]` output tokens and bounded rejection
    rules.

- `src/skills/_shared/openspec-convention.md`
  - Add `plan-review.md` to the change directory structure and canonical artifact
    table.
  - Document schema, freshness semantics, stale approval behavior, and legacy
    fail-closed behavior.

- `src/skills/_shared/thoth-mem-convention.md`
  - Add `plan-review` to supported SDD artifact names.
  - Add the deterministic topic key `sdd/{change-name}/plan-review`.

- `src/skills/_shared/persistence-contract.md`
  - Add `plan-reviewer` / plan-review persistence ownership to artifact
    ownership.
  - Clarify read/write behavior for OpenSpec, thoth-mem, and hybrid recovery.

- `src/sdd/artifact-governance/artifact-loader.ts`
  - Extend normalized artifact descriptors for `plan-review`.
  - Add reusable SHA-256 digest helpers for reviewed planning artifacts.
  - Add plan-review recovery helpers that parse `plan-review.md`, compare reviewed
    artifact digests, return fresh approval only for matching `[OKAY]`, and fail
    closed for stale, missing, rejected, or unparsable evidence.

- `src/agents/prompt-sections.ts`
  - Update SDD gate guidance to recover and validate a fresh plan-review artifact
    before rerunning Oracle.
  - Keep the post-`[OKAY]` implementation-confirmation question unchanged.
  - Note that Oracle is read-only and a write-capable persistence owner records
    the artifact when needed.

- `docs/sdd-pipeline.md`
  - Add `plan-review.md` as a canonical artifact between `tasks.md` and
    implementation confirmation.
  - Document freshness reuse, stale rerun behavior, and legacy missing-artifact
    behavior.

- `docs/quick-reference.md`
  - Add the new artifact path and memory topic to the SDD/artifact-store quick
    reference.

- Tests:
  - `src/harness/core/sdd.test.ts`: assert plan-review now produces an artifact,
    keeps `gate: 'oracle-review'`, keeps `owner: 'oracle'`, uses
    `persistenceAgentRole: 'quick'`, and still requires
    `implementation-confirmation` before `apply`.
  - Prompt/rendering tests such as `src/agents/index.test.ts`,
    `src/agents/prompt-rendering.test.ts`,
    `src/hooks/phase-reminder/index.test.ts`, and adapter/skill-layout tests:
    assert generated guidance includes the persisted plan-review artifact path,
    deterministic topic key, stale approval behavior, and separate user
    confirmation gate.
  - `src/sdd/artifact-governance/artifact-loader.test.ts`: assert `plan-review`
    path/topic descriptors, SHA-256 digest generation, fresh `[OKAY]` recovery,
    stale digest invalidation, missing legacy artifact failure, rejected status
    failure, and unparsable artifact failure.

## Interfaces / Contracts

### Plan-review artifact contract

Required front matter fields:

- `schema`: currently `thoth-agents/sdd-plan-review/v1`.
- `artifact`: `plan-review`.
- `change`: OpenSpec change name.
- `gate`: `oracle-review`.
- `status`: exact `[OKAY]`, exact `[REJECT]`, or `OVERRIDDEN` when a user
  override allowed advancement after a blocking result.
- `reviewer_role`: `oracle`.
- `reviewed_at`: ISO-8601 timestamp generated when the review result is
  persisted.
- `pipeline`: `accelerated` or `full`.
- `persistence_mode`: selected artifact store mode.
- `memory_topic_key`: `sdd/{change-name}/plan-review` for memory-including
  modes; present as canonical metadata even in OpenSpec-only artifacts.
- `override`: object with `occurred`, `at`, `surface`, and `context` fields.
- `reviewed_artifacts`: non-empty list of `{ role, path, required, sha256 }`.

Required Markdown sections:

- `## Oracle Result`: exact token and brief outcome text.
- `## Comments`: reviewer comments that explain approval or rejection.
- `## Non-Blocking Notes`: optional cautions that do not block.
- `## Blockers`: up to three blocking issues for `[REJECT]`; empty/`None` for
  clean approvals.
- `## User Override Context`: explicit override details when applicable;
  otherwise `None`.
- `## Freshness Manifest`: human-readable table mirroring front matter paths and
  digests.
- `## Recovery Decision`: one of `fresh approval`, `blocking result`,
  `stale approval`, `override recorded`, or `legacy/missing evidence` with the
  reason recovery should use.

### Recovery contract

- A saved `[OKAY]` satisfies `plan-review` only when schema is supported,
  pipeline matches, every required artifact exists, and every digest matches.
- A digest mismatch, missing required artifact, unsupported schema, or missing
  plan-review artifact requires a new Oracle review.
- `[REJECT]` and `OVERRIDDEN` do not equal clean Oracle approval. `OVERRIDDEN`
  may allow advancement only when it was produced by the normal blocking-input
  override flow and its context is persisted.
- Recovery must not mark `implementation-confirmation` complete from any
  plan-review artifact status.

## Testing Strategy

- Unit-test SDD contract metadata in `src/harness/core/sdd.test.ts` first,
  covering artifact production, role separation, and gate ordering.
- Unit-test or snapshot-test generated prompts/skill layouts so OpenCode, Codex,
  and Claude Code surfaces all carry the same path/topic/stale-recovery rules.
- Add parser/digest tests around representative `plan-review.md` content:
  fresh `[OKAY]`, changed `tasks.md`, changed full-pipeline spec, missing legacy
  artifact, `[REJECT]`, and override context.
- Run the smallest focused tests after implementation, then the repo's normal
  checks for the touched surface (`pnpm run typecheck`, focused Vitest tests, and
  broader `pnpm test` if prompt snapshots or shared contracts changed widely).

## Migration / Rollout

No historical OpenSpec changes are rewritten. Existing changes without
`plan-review.md` remain safe by default and require a fresh Oracle review before
the gate can be considered complete. Future plan reviews write the artifact in
all persistence modes that include OpenSpec or thoth-mem.

For hybrid mode, rollout follows the existing convergence rule: write both
stores and treat the phase as fully persisted only when both writes succeed. If
thoth-mem remains unavailable, OpenSpec-only runs still have durable repo-visible
recovery, while memory-including runs must report the memory persistence failure
instead of claiming convergence.

## Constitution Check

Passes.

- Delegate-first coordination: preserved; Oracle reviews, coordinator sequences,
  and write-capable persistence is separate from read-only review.
- Read-only role boundaries: preserved; Oracle does not mutate the workspace.
- Governed persistence: preserved; artifact uses canonical OpenSpec path and
  deterministic `sdd/*` topic key, with no ad hoc store.
- Multi-harness parity: preserved; semantics live in shared contracts,
  conventions, skills, and prompt sections rather than one harness dialect.
- Evidence-led verification: strengthened; recovery relies on persisted review
  evidence plus artifact digests and fails closed when evidence is missing or
  stale.

## Open Questions

None.
