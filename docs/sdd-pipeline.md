# SDD Pipeline

thoth-agents 0.3.0 keeps SDD robustness while removing phase-skill overhead. The
adaptive root selects one of three routes and invokes dedicated phase agents only
when their artifacts provide value.

Spec Kit semantics are the source of truth for requirements, planning, tasks,
and optional design-support artifacts. thoth-agents keeps those semantics inside
the governed `openspec/changes/<feature>/` store.

## Routes

```text
direct:      implement -> verify
accelerated: specify -> plan -> tasks -> implement -> verify
full:        explore -> specify -> plan -> tasks -> analyze -> implement -> verify
```

Accelerated SDD is intentionally retained. It is the middle route for work that
benefits from explicit artifacts but does not justify exploration and independent
pre-implementation analysis.

| Route | Select when | Required coordination artifacts | Verification owner |
| --- | --- | --- | --- |
| `direct` | Clear, local, low-risk work | None | Adaptive root |
| `accelerated` | Bounded multi-file work, partial clarity, or medium contract/failure risk | `spec.md`, `plan.md`, `tasks.md` | Adaptive root |
| `full` | Explicit SDD request, uncertain material scope, cross-cutting work, or high contract/failure risk | `spec.md`, `plan.md`, `tasks.md` | `oracle` |

A small README correction should normally use direct work. SDD is not a ceremony
tax applied to every request.

## Classification inputs

The root considers:

- intent: documentation, mechanical, behavioral, or architectural;
- scope: local, multi-file, or cross-cutting;
- clarity: clear, partial, or uncertain;
- public/internal contract risk;
- cost of failure; and
- whether the user explicitly requested SDD.

User input is requested only when a material unresolved decision would change
the result. Partial but safely assumable detail does not automatically block the
pipeline.

## Required phases

| Phase | Owner | Purpose |
| --- | --- | --- |
| `explore` | `explorer` | Resolve broad repository uncertainty. Full route only. |
| `specify` | `sdd-specify` | Define testable user-visible requirements and acceptance criteria. |
| `plan` | `sdd-plan` | Translate the accepted specification into an executable technical approach. |
| `tasks` | `sdd-tasks` | Produce dependency-ordered, verifiable implementation slices. |
| `analyze` | `oracle` | Independently check cross-artifact consistency. Full route only. |
| `implement` | adaptive root, `designer`, `quick`, or `deep` | Make the product change with one writer per mutable surface. |
| `verify` | root or `oracle`, by route | Check the result against requirements and focused evidence. |

The three SDD phase agents may write only coordination artifacts under
`openspec/`. They do not implement product code and do not delegate further.

## Conditional phases

| Phase | Activate only when | Owner |
| --- | --- | --- |
| `clarify` | An unresolved material decision cannot be handled by a safe local assumption. | `sdd-specify` |
| `checklist` | Requirements are high-risk, compliance-sensitive, or ambiguity-prone. | `sdd-specify` |
| `converge` | Verification finds an actionable defect. | Adaptive root routes a bounded fix and re-verification. |

Conditional phases are not mandatory gates. They exist to recover rigor when the
risk signal justifies it.

## Conditional architectural grilling

`architectural-grilling` is an external pre-specification decision gate, not an
SDD phase. Activate it only when:

- the user explicitly asks to be grilled; or
- material product or architecture branches remain human-owned and unresolved.

Do not activate it for Direct or Accelerated work, routine clarification, or
merely because the route is Full. While active, the root stays in discovery and
decision mode, asks one material question per turn, and waits for explicit
closure. If the user stops early, unresolved branches and their risk remain
visible rather than being converted into assumptions.

Closed decisions feed `spec.md` and `plan.md`. Those remain the canonical
artifacts; no additional blueprint file is required by thoth-agents.

## Artifact graph

All paths below are relative to `openspec/changes/<feature>/`.

| Artifact | Producer | Consumes | Required for |
| --- | --- | --- | --- |
| `spec.md` | `specify` | — | Accelerated, full |
| `plan.md` | `plan` | `spec.md` | Accelerated, full |
| `tasks.md` | `tasks` | `spec.md`, `plan.md` | Accelerated, full |
| `checklists/requirements.md` | `checklist` | `spec.md` | Conditional |
| `research.md` | `plan` | `spec.md` | Optional |
| `data-model.md` | `plan` | `spec.md` | Optional |
| `contracts/` | `plan` | `spec.md` | Optional |
| `quickstart.md` | `plan` | `spec.md`, `plan.md` | Optional |

Optional artifacts are created only when they reduce implementation or
verification risk. They are not generated as placeholders.

## Delegation rules

- Maximum depth is one: child agents never create grandchildren.
- The root may do bounded direct work.
- Delegate only for specialization, context isolation, independent review, or
  truly independent parallel work.
- Maintain one writer per mutable surface.
- Read-heavy exploration, research, analysis, and verification are preferred
  delegation candidates.
- Child returns are distilled conclusions and evidence, not raw logs or full
  file dumps.

## Verification and convergence

Every route ends with verification proportional to behavior and risk. Direct and
accelerated routes remain lightweight by default: the root runs the smallest
sufficient focused checks. Full SDD adds independent `oracle` analysis before
implementation and independent verification afterward.

Convergence is bounded to actionable findings. A clean result ends the route; a
finding triggers a focused fix and re-check, not a restart of every SDD phase.

## Memory boundary

`openspec/` is the filesystem coordination surface. If thoth-mem is installed,
its own guidance controls persistence, session continuity, checkpointing, and
recovery. thoth-agents does not duplicate those mechanics in the SDD pipeline.
