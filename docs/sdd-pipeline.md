# SDD Pipeline

thoth-agents 0.3.0 keeps SDD robustness while removing phase-skill overhead. The
adaptive root selects one of three routes and invokes dedicated phase agents only
when their artifacts provide value. Phase behavior is defined by compact typed
protocols, not bundled skills: the static role contract describes capability,
the phase protocol describes the operation, and the dispatch envelope carries
run-specific context.

Spec Kit semantics are the source of truth for requirements, planning, tasks,
and optional design-support artifacts. thoth-agents keeps those semantics inside
the governed `openspec/changes/<feature>/` store.

## Routes

```text
direct:      implement -> verify
accelerated: specify -> plan -> tasks -> implement -> verify -> archive
full:        explore -> specify -> plan -> tasks -> analyze -> implement -> verify -> archive
```

Accelerated SDD is intentionally retained. It is the middle route for work that
benefits from explicit artifacts but does not justify exploration and independent
pre-implementation analysis.

| Route | Select when | Required lifecycle artifacts | Verification owner |
| --- | --- | --- | --- |
| `direct` | Clear, local, low-risk work | None | Adaptive root |
| `accelerated` | Bounded multi-file work, partial clarity, or medium contract/failure risk | `spec.md`, `plan.md`, `tasks.md`, `verify-report.md`, `archive-report.md` | Adaptive root |
| `full` | Explicit SDD request, uncertain material scope, cross-cutting work, or high contract/failure risk | `spec.md`, `plan.md`, `tasks.md`, `verify-report.md`, `archive-report.md` | `oracle` |

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
| `archive` | adaptive root or `quick` | Create the audit report and perform the dated archive move after a pass verdict. Artifact-backed routes only. |

The three SDD coordination agents may write only coordination artifacts under
`openspec/`. `sdd-tasks` also owns append-only convergence tasks. They do not
implement product code and do not delegate further.

## Conditional phases

| Phase | Activate only when | Owner |
| --- | --- | --- |
| `clarify` | An unresolved material decision cannot be handled by a safe local assumption. | `sdd-specify` |
| `checklist` | Requirements are high-risk, compliance-sensitive, or ambiguity-prone. | `sdd-specify` |
| `converge` | Artifact-backed verification returns `fail` with actionable, traceable gaps. | `sdd-tasks` appends a Convergence phase to `tasks.md`; implementation and verification then run again. |

Conditional phases are not mandatory gates. They exist only on Accelerated/Full
routes to recover rigor when the risk signal justifies them.

## Phase protocol and dispatch envelope

`src/harness/core/sdd.ts` defines one `SddPhaseProtocol` for every phase. Each
protocol declares its objective, required inputs, instructions, allowed writes,
output schema, completion criteria, blockers, and handoff. Reused roles activate
only the protocol named by the dispatch: for example, `oracle` distinguishes
`phase=analyze` from `phase=verify`, while `quick` distinguishes
`phase=implement` from `phase=archive`.

Every delegated SDD phase uses this envelope:

```text
PHASE
ROUTE / CHANGE
OBJECTIVE
INPUT ARTIFACTS
REQUIREMENTS
BOUNDARIES
VERIFICATION
EXPECTED OUTPUT
HANDOFF
```

The root supplies the dynamic values and keeps phase results. The child static
prompt supplies the canonical protocol. This avoids reinstalling one skill per
phase while preserving explicit cross-phase contracts.

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
| `verify-report.md` | `verify` | `spec.md`, `plan.md`, `tasks.md` | Accelerated, full |
| `archive-report.md` | `archive` | `spec.md`, `plan.md`, `tasks.md`, `verify-report.md` | Accelerated, full |

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

## Implementation, verification, and convergence

Every route includes verification proportional to behavior and risk before
completion. Direct and accelerated routes remain lightweight by default: the
root runs the smallest sufficient focused checks. Full SDD adds independent
`oracle` analysis before implementation and independent verification afterward.

For artifact-backed implementation, the root owns task state: it marks assigned
tasks `[~]` before dispatch and `[x]` only after task-specific evidence has been
verified. Writers receive the accepted artifacts, exact task slice, boundaries,
and verification commands. Behavior changes use test-first execution.

Accelerated and Full verification persist `verify-report.md` with an explicit
`pass` or `fail` verdict, compliance matrix, executed checks, findings, and
residual risks. An oracle remains read-only; the root persists its returned
report. On Accelerated/Full, `fail` activates append-only convergence:
`sdd-tasks` appends traceable remaining work without editing product code, then
control returns to `implement -> verify`. Existing tasks are never rewritten or
renumbered. Direct has no `tasks.md`, so a failed check returns straight to
`implement -> verify`.

## Archive lifecycle

Direct work creates no SDD change directory and never archives. Accelerated and
Full require a pass verdict, complete tasks, and no unresolved critical findings.
The root or `quick` then:

1. creates `archive-report.md` with verification lineage and residual warnings;
2. moves the complete change to
   `openspec/changes/archive/YYYY-MM-DD-<feature>/`; and
3. returns the archive path and audit summary to the root.

Archive does not implicitly merge feature content into `openspec/specs/`.
Durable documentation or specification updates are explicit implementation tasks
completed before verification.

## Memory boundary

`openspec/` is the filesystem coordination surface. If thoth-mem is installed,
its own guidance controls persistence, session continuity, checkpointing, and
recovery. thoth-agents does not duplicate those mechanics in the SDD pipeline.
