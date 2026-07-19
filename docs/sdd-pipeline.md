# SDD Pipeline

thoth-agents keeps specification-driven development but removes phase-only
agents and prompt-heavy ceremony. The adaptive root selects the lightest safe
route, then loads only the current phase contract from the bundled `thoth-sdd`
skill.

## Routes

```text
Direct:      implement -> verify
Accelerated: specify -> plan -> tasks -> implement -> verify -> archive
Full:        explore -> specify -> plan -> tasks -> analyze -> implement -> verify -> archive
```

| Route | Selection signal | Governance |
| --- | --- | --- |
| Direct | Clear, local, low-risk request | No SDD artifacts; independent verification remains mandatory. |
| Accelerated | Bounded multi-file work or moderate risk | Full canonical artifact formats without exploration or pre-implementation analysis. |
| Full | Explicit SDD, material uncertainty, cross-cutting contracts, high risk or failure cost | Adds read-only exploration and independent consistency analysis. |

A README or similarly simple mechanical change should normally remain Direct.
The existence of a phase or specialist is never, by itself, a reason to use it.

## Ownership

| Phase | Owner | Mutation boundary |
| --- | --- | --- |
| `explore` | `explorer` | Read-only repository evidence |
| `specify` | root | `openspec/changes/<feature>/spec.md` |
| `clarify` | root | Update canonical `spec.md`; no parallel clarification artifact |
| `plan` | root | `plan.md` and justified support artifacts |
| `checklist` | root | `checklists/requirements.md` |
| `tasks` | root | `tasks.md` |
| `analyze` | `oracle` | Read-only findings returned to root |
| `implement` | root, `designer`, `quick`, or `deep` | Exactly one writer per mutable surface |
| `verify` | `oracle` | Always read-only and independent |
| `converge` | root | Append-only `tasks.md` remediation |
| `archive` | root | Guarded audit report and dated move |

Oracle owns every verification in Direct, Accelerated, and Full. The root or
writer that implemented the change cannot substitute for independent oracle
judgment.

## Progressive contracts

Static prompts contain route and ownership rules, not all SDD instructions.
After selecting Accelerated or Full, root loads `thoth-sdd` and reads only
`references/phases/<current>.md`. The owned `thoth-constitution` and
`thoth-archive` skills are loaded only for their lifecycle gates.

Installation may use the thoth-agents CLI and `npx skills add`, but pipeline
execution does not. Every phase reads installed local contracts; a missing
contract or mandatory external skill is reported as an incomplete installation
instead of being downloaded mid-SDD.

Delegated phases receive a bounded envelope with phase, route/change, objective,
input artifacts, requirements, boundaries, verification criteria, expected
output, and handoff. Child agents return distilled evidence rather than chat
transcripts or raw logs.

## Canonical artifacts

Accelerated and Full use `openspec/changes/<feature>/`:

```text
spec.md
plan.md
tasks.md
verify-report.md
archive-report.md
checklists/requirements.md   # conditional
research.md                  # optional when it reduces risk
data-model.md                # optional
contracts/                   # optional
quickstart.md                # optional
```

### Specification

`spec.md` must include:

- prioritized `US#` stories that can be implemented and tested independently;
- a plain-language outcome and independent test for each story;
- Given/When/Then acceptance scenarios;
- unique sequential `FR-###` functional requirements;
- measurable, implementation-independent `SC-###` success criteria; and
- edge cases, assumptions, dependencies, and explicit out-of-scope boundaries.

Material ambiguity blocks advancement or activates `clarify`. Accepted answers
are written into canonical requirements and revalidated.

### Plan and constitution

`plan.md` maps each technical choice to FR/SC or confirmed repository evidence,
names affected components and exact paths/interfaces, and identifies migration,
risk, and verification seams. It records a pre-design Constitution Check and a
post-design check against concrete decisions. An unjustified violation blocks
task generation.

The project constitution is `openspec/memory/constitution.md`. Init creates a
starter only when the project has none; amendments are explicit and never
silently regenerated.

### Tasks

Every executable task uses:

```text
- [ ] T### [P?] [US#?] description with FR-###/SC-### coverage in `exact/path` | Verify: observable outcome
```

`[P]` means safe parallel execution with no overlapping mutable files. `[US#]`
links story work and is omitted only for genuinely shared setup or closeout.
Tasks identify the MVP story, dependencies, concrete parallel examples,
verification outcomes, and complete FR/SC coverage. Behavior tests precede
implementation work.

Root alone updates task state: `[~]` before dispatch and `[x]` only after
checking task-specific evidence. Child writers do not edit task checkboxes.

### Requirements checklist

The conditional checklist audits requirement quality, not implementation. It
uses stable `CHK###` IDs and covers Completeness, Clarity, Consistency,
Measurability, and Coverage across stories, FR/SC, actors, failure modes, and
non-functional constraints. It records an initial pass and a distinct
revalidation after clarification or planning changes.

## Analysis and verification

Full `analyze` asks oracle to challenge contradictions, ambiguity, duplication,
scope drift, orphan tasks, missing FR/SC coverage, ordering, checklist state,
and Constitution compliance. Critical findings or uncovered baseline
requirements block implementation.

Every `verify` asks oracle to map accepted requirements to implementation
evidence and executed checks. Direct returns PASS/FAIL in-session. Accelerated
and Full persist `verify-report.md` with a compliance matrix, stable findings,
commands/results, residual risk, and explicit verdict.

Failed Direct work returns to `implement -> verify`. Failed artifact-backed work
activates append-only `converge`, then returns to a separate implementation
writer and oracle verification. Archive remains blocked until PASS.

## Archive

Accelerated and Full finish only when all tasks are `[x]`, oracle records PASS,
and no unresolved CRITICAL finding remains. Root creates `archive-report.md` and
moves the change to:

```text
openspec/changes/archive/YYYY-MM-DD-<feature>/
```

Archive does not implicitly merge feature text into `openspec/specs/`. A
permanent specification or documentation update must be an explicit
implementation task before verification.

## Structural validation

Run from the `thoth-sdd` skill directory:

```text
node scripts/validate.mjs --change openspec/changes/<feature> --route <accelerated|full> --through <specify|plan|tasks|checklist|final> --json
```

Select the gate that just completed. `specify` requires only `spec.md`; `plan`
adds `plan.md` and requires `openspec/memory/constitution.md`; `checklist`
requires that plan plus a completed conditional checklist; `tasks` adds
`tasks.md`; and `final` validates the complete pre-implementation artifact set.
No gate requires a future phase's output.

The validator enforces identifiers, per-story independence and acceptance
examples, exact Constitution principle coverage/evidence, task
grammar/order/US-FR-SC coverage and verification outcomes,
MVP/dependency/parallel guidance, and checklist IDs/taxonomy/coverage/
revalidation. Structural success never replaces oracle's semantic judgment.
