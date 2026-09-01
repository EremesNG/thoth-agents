# Implementation Plan: Native Dispatch Waves

## Technical context

The shared orchestration policy already renders a harness-neutral `dispatch-ready-wave` step and each dialect names native delegation/status primitives. The missing bridge is artifact-backed: `skills/thoth-sdd/templates/tasks.md` and the tasks phase reference describe loose `[P]` pairings, `validateTasks` checks only task membership/path overlap at pairing level, and the implement phase does not translate a declared group into distinct native assignments and a barrier.

The archived `behavioral-agent-orchestration` change demonstrated the failure mode: individual tasks named one exact file, but implementation ownership aggregated broad code/skills and documentation surfaces into one Deep and one Quick handoff. This design therefore separates three levels without adding runtime state: granular `T###` tasks, ordered writer-owned lanes, and parallel groups of independent lanes. A lane may contain an ordered red-to-green sequence across multiple exact paths; a group provides the fan-out/fan-in boundary between lanes.

The repository has extensive pre-existing user changes, including canonical and generated skill surfaces. Implementation must preserve them, edit canonical `skills/` sources first, and synchronize `plugin/` only through the existing integration command after concurrent writers finish.

## Constitution Check (pre-design)

- **Adaptive-root orchestration**: PASS — The design makes existing ready-lane fan-out executable from SDD artifacts while preserving depth one, bounded native capacity, one writer per lane surface, and root-owned reconciliation.
- **Explicit role boundaries**: PASS — No role is added or widened; each declared lane receives one eligible `designer`, `quick`, or `deep` owner, and repeated use of the same role creates distinct bounded assignments rather than a reusable pool.
- **Proportional Spec Kit-compatible SDD**: PASS — The change strengthens the existing `tasks.md` coordination surface and implement phase without adding a new artifact, phase, or unconditional ceremony.
- **Truthful multi-harness contracts**: PASS — Parallel groups remain declarative and the active harness continues to own capacity, dispatch, wait/status, terminal results, and truthful sequential degradation.
- **Independent provider ownership**: PASS — The design does not touch thoth-mem installation, authorization, lifecycle, persistence, hooks, or recovery.
- **Evidence-led completion**: PASS — Static validator and bundle seams prove buildable contracts; actual native ordering remains a separately reported per-harness outcome criterion and Accelerated final verification remains Oracle-owned.

## Design

### 1. Canonical group and lane grammar

Replace loose pairing prose in `skills/thoth-sdd/templates/tasks.md` and `skills/thoth-sdd/references/phases/tasks.md` with one strict existing-section grammar:

```markdown
## Parallel execution

### Group P1

- Lane L1: T001 -> T002 | Owner: deep
- Lane L2: T003 -> T004 | Owner: quick
- Prerequisites: None
- Barrier: T005
- Rationale: Both lane path sets are disjoint and neither lane consumes peer output.
```

Rules:

- Group IDs start at `P1` and remain unique/sequential; lane IDs restart at `L1` inside each group and remain unique/sequential.
- A group contains at least two lanes. Each lane contains one or more ordered task IDs and exactly one `designer`, `quick`, or `deep` owner.
- Every `[P]` task belongs to exactly one lane in exactly one group; non-`[P]` tasks cannot appear in a lane.
- A lane's mutable surface is the union of its member tasks' exact paths. Paths may form an ordered vertical slice inside one lane, but surfaces from different lanes in the same group cannot overlap.
- `Prerequisites` is `None` or a comma-separated set of known task IDs outside the group. A group is ready only after those tasks have terminal validated evidence.
- `Barrier` is one known downstream task or `Final verification`; a task barrier must sort after every group member and cannot be a group prerequisite/member.
- The Dependencies section remains authoritative for declared task edges. Edges within a lane are allowed; an edge between lanes in the same group is rejected.
- `Rationale` must be concrete. When no group exists, the section contains only `- None: <evidence-backed reason>` and no task uses `[P]`.

This is an authoring/validation contract, not a serialized runtime DAG.

### 2. Structural validator

Refactor only the parallel portion of `validateTasks` in `skills/thoth-sdd/scripts/validate.mjs`. Add small pure parsing helpers for task dependency edges and parallel group blocks, then validate:

- group/lane grammar and sequential IDs;
- known `[P]`-only membership, total coverage, and uniqueness;
- eligible lane owners;
- known external prerequisites;
- downstream/final barriers;
- cross-lane path overlap; and
- declared cross-lane dependency edges.

Retain `SDD-TASK-PARALLEL` for missing/contradictory section modes and add bounded stable category codes for lane grammar, membership, ownership, prerequisites, barrier, dependency, and overlap. The validator derives no execution state and performs no dispatch.

### 3. Native implementation lifecycle

Extend `skills/thoth-sdd/references/phases/implement.md` with a phase-local procedure that connects a ready group to the generic root policy:

1. Confirm group prerequisites and each lane's ordered tasks, exact path union, owner, requirements, and checks.
2. Select the capacity-bounded set of undispatched ready lanes.
3. Create one fresh native specialist assignment per admitted lane.
4. Issue every dispatch in that native wave before any wait, status, result collection, or implementation of assigned work by root.
5. Retain native handles; after terminal evidence frees capacity, dispatch the next undispatched ready lane before waiting again.
6. Validate terminal evidence per lane; root alone updates task state.
7. Cross the declared barrier only after every lane is terminal and reconciled.
8. Report capability/capacity degradation and use a truthful sequential fallback when concurrency is unavailable or width is one.

The wording will avoid universal `wait_all`, fixed concurrency, or identical isolation claims across harnesses.

### 4. Tests, documentation, and generated bundle

The confirmed public TDD seams proposed for implementation are:

- **Validator CLI seam**: `src/harness/sdd-validator.test.ts` invokes the canonical `validate.mjs` through its real CLI and asserts accepted/rejected task artifacts plus stable diagnostic codes.
- **Bundled contract seam**: `src/harness/bundled-skills.test.ts` reads canonical/generated task and implement contracts and proves grammar/lifecycle parity without inspecting private parser helpers.
- **Operational outcome seam**: bounded native harness smoke traces demonstrate dispatch ordering; this remains outcome evidence and is not represented as deterministic CI.

Work proceeds in vertical slices: add one failing CLI fixture, implement only enough parser/validation behavior to pass, and repeat by validation category. Contract tests go red before task/implement guidance changes. After canonical sources pass, update `docs/agent/sdd-and-skills.md` and `docs/sdd-pipeline.md`, then run `pnpm run integration:sync` once under root ownership and verify generated parity.

No adapter or shared `agent-pack.ts` behavior changes unless implementation evidence reveals a missing cross-reference; the current generic ready-wave policy is already correct.

### Requirement mapping

| Requirement | Technical decision | Files/interfaces | Verification seam |
| --- | --- | --- | --- |
| FR-001 | Replace loose pairings with strict groups containing ordered writer-owned lanes, prerequisites, barrier, and rationale. | `skills/thoth-sdd/templates/tasks.md`, `skills/thoth-sdd/references/phases/tasks.md` | Bundled contract assertions and validator CLI valid fixture. |
| FR-002 | Translate each ready group into capacity-bounded native dispatch waves and terminal barrier reconciliation. | `skills/thoth-sdd/references/phases/implement.md` | Bundled contract assertions plus per-harness operational smoke evidence. |
| FR-003 | Parse and validate group/lane structure, membership, ownership, prerequisites, barriers, overlaps, and declared cross-lane dependencies. | `skills/thoth-sdd/scripts/validate.mjs`, `src/harness/sdd-validator.test.ts` | Real validator CLI behavior with stable diagnostics. |
| FR-004 | Keep the feature entirely in artifacts, instructions, validation, tests, docs, and generated mirrors. | `skills/thoth-sdd/`, `docs/`, `plugin/` | Existing package/bundle tests and scoped production-surface diff. |
| SC-001 | Add a valid two-lane vertical-slice fixture and eleven independent invalid mutations. | `src/harness/sdd-validator.test.ts` | Focused Vitest suite. |
| SC-002 | Remove ambiguous pairing prose and synchronize one grammar across canonical, routed, and generated surfaces. | `skills/thoth-sdd/`, `docs/agent/sdd-and-skills.md`, `docs/sdd-pipeline.md`, `plugin/skills/thoth-sdd/` | Bundled skill parity and targeted contradiction search. |
| SC-003 | Assert all seven native lifecycle requirements at the public contract seam. | `src/harness/bundled-skills.test.ts`, `skills/thoth-sdd/references/phases/implement.md` | Focused bundled-skills suite. |
| SC-004 | Observe actual fan-out/fan-in per harness without claiming deterministic CI. | External/native smoke sessions and `verify-report.md` disposition | Recorded native dispatch-before-wait evidence or explicit residual RISK. |
| SC-005 | Add no execution/lifecycle surface. | Package manifests, tool/schema registries, dependencies | Existing integration/package checks and scoped diff inspection. |

## Optional support artifacts

- `research.md`: Not needed; current local audit, independent Oracle review, and current official harness evidence already resolved the architecture and portability boundary.
- `data-model.md`: Not needed; groups and lanes are Markdown coordination grammar parsed transiently by the existing validator, not persisted runtime entities.
- `contracts/`: Not needed; the canonical task template/reference and validator CLI are the owned contract surfaces.
- `quickstart.md`: Not needed; existing SDD pipeline documentation will carry the authoring example.

## Risks and migrations

- **Horizontal TDD regression**: Treating every task as one agent would separate tests from implementation. Mitigation: group ordered tasks into a writer-owned lane and parallelize only across lanes.
- **False independence**: Disjoint paths may still be semantically coupled. Mitigation: require explicit prerequisites/rationale and reject declared cross-lane dependency edges; Oracle still judges completeness beyond structural validation.
- **Overly strict Markdown parsing**: A canonical grammar intentionally rejects ambiguous prose. Mitigation: document one exact template, use category diagnostics, and cover valid/invalid CLI fixtures.
- **Capacity mismatch**: An authored group may exceed a runtime's current width. Mitigation: use capacity-bounded native waves, refill slots before another wait, and preserve one final group barrier.
- **Legacy task artifacts**: Active artifacts using old pairing prose will fail the strengthened gate. No backward compatibility is required; update active artifacts when revalidated, while archived changes remain historical.
- **Dirty generated bundle**: `plugin/` already contains user-owned changes. Mitigation: one root-owned integration sync after canonical lanes complete, followed by a scoped diff review; never hand-edit generated mirrors.
- **Prompt duplication**: Repeating generic choreography in root/adapters would add bloat. Mitigation: change phase-local SDD guidance only and leave `agent-pack.ts` unchanged unless evidence proves a gap.
- **Runtime proof gap**: Static tests cannot prove model tool ordering. Mitigation: keep SC-004 as explicit per-harness outcome evidence and never treat prompt strings as execution proof.
- **Rollback**: Revert the canonical group/lane grammar, validator categories, implement-phase procedure, tests, docs, and synchronized mirrors together. There is no runtime state or migration to unwind.

## Constitution Check (post-design)

- **Adaptive-root orchestration**: PASS — The completed design binds each ready group to distinct lane owners and an explicit barrier while keeping capacity, dispatch, waiting, and terminal truth native.
- **Explicit role boundaries**: PASS — Ordered tasks stay within one bounded writer lane, parallel lanes have disjoint surface unions, and repeated roles become fresh assignments rather than shared mutable ownership.
- **Proportional Spec Kit-compatible SDD**: PASS — Existing `tasks.md` gains one strict section grammar and the implement phase consumes it; no new artifact, phase, or routine gate is introduced.
- **Truthful multi-harness contracts**: PASS — The design promises only capacity-bounded native waves and truthful degradation, not a portable `wait_all`, fixed width, shared isolation model, or Thoth execution engine.
- **Independent provider ownership**: PASS — All planned files are SDD, validation, documentation, test, or generated skill surfaces unrelated to provider-owned memory mechanics.
- **Evidence-led completion**: PASS — Public CLI and bundled-contract seams receive TDD coverage, generated parity is verified after fan-in, and live ordering remains separately dispositioned under mandatory fresh Oracle final verification.
