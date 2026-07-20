# SDD Pipeline

thoth-agents combines Spec Kit-grade artifact rigor with OpenSpec-style durable
requirement deltas. The adaptive root recommends the lightest safe route, the
user selects Direct, Accelerated, or Full, and root loads only the current phase
contract.

## Routes

```text
Direct:      implement -> verify
Accelerated: specify -> plan -> tasks -> implement -> verify -> archive
Full:        explore -> specify -> plan -> tasks -> implement -> verify -> archive
```

| Route | Selection signal | Execution policy |
| --- | --- | --- |
| Direct | Clear, bounded, low-risk work—including multi-file documentation or mechanical edits | No SDD artifacts; oracle still verifies independently. |
| Accelerated | Generic SDD request, partial clarity, moderate risk/cost, multi-surface behavior, or architecture work | Root fast-forwards specification, plan, and tasks without routine pauses. |
| Full | Material uncertainty, cross-cutting behavior/architecture, high contract risk, or high failure cost | Adds focused exploration and separate phase gates. |

An explicitly named route is the user's selection and wins. Otherwise root
assesses the work, recommends one route, presents Direct, Accelerated, and Full,
and waits for the user's choice. A generic “use SDD” request makes Accelerated
the minimum recommendation, but does not choose on the user's behalf. The number
of files alone does not raise documentation or mechanical work out of Direct.

`architectural-grilling` runs before specification only when explicitly
requested or when a material product/architecture decision remains human-owned.
Full by itself does not activate it.

## Ownership

| Phase | Owner | Mutation boundary |
| --- | --- | --- |
| `explore` | `explorer` | Read-only repository evidence |
| `specify` | root | `openspec/changes/<feature>/spec.md` |
| `clarify` | root | Canonical `spec.md`; no sidecar answer document |
| `plan` | root | `plan.md` and justified support artifacts |
| `checklist` | root | Conditional `checklists/requirements.md` |
| `tasks` | root | `tasks.md` |
| `plan-review` | `oracle` | Optional read-only findings when the user selects review after `ready` |
| `implement` | root, `designer`, `quick`, or `deep` | One writer per mutable surface |
| `verify` | `oracle` | Always read-only and independent |
| `converge` | root | Append-only remediation in `tasks.md` |
| `archive` | root | Transactional spec sync, audit report, and dated move |

The writer never substitutes for oracle. Oracle owns every final verification
and each user-selected pre-implementation plan review.

## Fast-forward versus gated planning

Accelerated writes `spec.md -> plan.md -> tasks.md` in one uninterrupted root
pass. It validates `specify`, then `ready`; planning gates are not routine user
pauses, but the post-`ready` review choice is.
Optional research, data model, contracts, quickstart, clarification, or checklist
artifacts appear only for a concrete risk signal.

Full validates `specify`, `plan`, `tasks`, and `ready` separately because the
route already carries uncertainty or material cost. On both artifact-backed
routes, `ready` precedes the user's review-or-proceed choice and implementation;
`closeout` follows implementation and independent verification.

If implementation evidence refines the same intent, root updates the canonical
artifact and revalidates only affected downstream artifacts and gates. A changed
intent starts a new change.

## Progressive phase contracts

Static role prompts carry only route and ownership rules. After selecting an
artifact-backed route, root loads `thoth-sdd` and reads only
`references/phases/<current>.md`. Delegated phases receive a bounded dispatch
envelope rather than the entire pipeline prompt.

Every dispatch also carries a compact MEMORY block: provider, project, stable
root session identity or `unavailable`, `none|recall|observe` authorization, and
bounded recalled context. This authorization is independent of workspace write
permission. A read-only explorer or oracle may persist one durable provider
observation when explicitly given `observe`, but can never mutate files or own
root lifecycle.

Installation can use the thoth-agents CLI and `npx skills add`; SDD execution
cannot. All phase contracts are local. A missing bundled contract or mandatory
external skill is an incomplete installation, not permission to provision it
mid-workflow.

thoth-mem follows the same runtime boundary. Installation may invoke its public
setup CLI, but SDD phases load the already installed `thoth-mem` skill and MCP
surface. Root uses it for bounded prior-work recall, reusable decisions, root
causes, conventions, discoveries, verified compaction, and semantic continuity.
Provider failure degrades memory only; it does not block unrelated
implementation or oracle verification.

## Canonical artifacts

Accelerated and Full use `openspec/changes/<feature>/`:

```text
spec.md
plan.md
tasks.md
verify-report.md
archive-report.md
checklists/requirements.md   # conditional
research.md                  # optional when it resolves risk
data-model.md                # optional
contracts/                   # optional
quickstart.md                # optional
plan-review.md               # optional when the user selects Oracle review
```

These files are the single SDD source of truth. thoth-mem may preserve durable
lessons and root continuity under its own guidance, but phase artifacts are not
mirrored into provider memory.

### Specification contract

`spec.md` records `Why`, `Impact`, and affected capability slugs, then defines:

- prioritized, independently testable `US#` stories;
- `Covers: FR-###, SC-###` traceability and Given/When/Then scenarios per story;
- sequential named FRs with normative `MUST`/`SHALL` behavior;
- one delta marker on every FR: `[INTERNAL]`, `[ADDED capability]`,
  `[MODIFIED capability]`, `[REMOVED capability]`, or
  `[RENAMED capability FROM Previous title]`;
- typed success criteria: `[buildable]` or `[outcome]`; and
- edge cases, assumptions, dependencies, and explicit non-goals.

Buildable SCs need implementation tasks. Outcome SCs remain measurable product
or operational verification targets without fake implementation work.

### Plan and constitution

`plan.md` maps technical decisions to FR/SC or confirmed repository evidence,
names exact components/interfaces/paths, and covers migration, risk, rollback,
and verification seams. Support artifacts exist only when they reduce a named
risk.

Routine planning reads `openspec/memory/constitution.md` and records pre/post
design Constitution Checks. It does not bump or validate constitution lifecycle
metadata. The `thoth-constitution` lifecycle activates only for an explicit
amendment and requires governance SemVer, ISO dates, a Sync Impact Report, and
propagation to affected templates/instructions/docs.

### Tasks

Every executable task uses:

```text
- [ ] T### [P?] [US#?] description with FR-###/SC-### coverage in `exact/path` | Verify: observable outcome
```

Tasks identify an independently testable MVP, dependencies, exact paths, and a
verification outcome. They cover all FRs and buildable SCs. Behavior tests
precede implementation.

`[P]` is valid only for proven non-overlapping mutable paths and requires a
concrete task pairing. If no safe parallel work exists, the artifact says
`- None: <reason>`; it never invents parallelism to satisfy a template. Root
alone moves task state from `[ ]` to `[~]` to `[x]` after evidence.

### Requirements checklist

Checklist is conditional. It records why it activated, then audits requirement
quality across the base taxonomy: Completeness, Clarity, Consistency,
Measurability, and Coverage. Applicable domain lenses—security, privacy,
accessibility, compliance, performance, migration, or domain rules—are generated
from actual risk; otherwise the artifact records an evidence-backed `None`.

After a requirement-affecting change, the checklist records checked
revalidation. When nothing relevant changed, it records an evidence-backed `Not
required` instead of ceremonial repetition.

## Plan review, verify, and converge

After `ready` on Accelerated or Full, root recommends and presents two choices:
`Review plan with Oracle (Recommended)` and `Proceed without review`. The user
decides. Proceeding skips pre-implementation Oracle review and authorizes
implementation; it does not skip final verification.

When selected, the bundled `plan-reviewer` asks read-only Oracle to judge
completeness, correctness, cross-artifact coherence, buildability, and outcome
coverage. Oracle returns exactly `[OKAY]` or `[REJECT]`; rejection identifies at
most three actionable blockers. Root repairs canonical artifacts and offers the
choice again. A fresh `[OKAY]` is persisted in `plan-review.md` with SHA-256
digests, then root summarizes the approved plan and separately asks whether to
implement or stop. The artifact stays in OpenSpec and is not mirrored into
provider memory.

Plan review is optional and never substitutes for mandatory final Oracle
verification.

Every `verify` uses the same three dimensions and maps each FR/buildable SC to
implementation evidence and executed checks. Direct returns PASS/FAIL in-session.
Accelerated and Full persist `verify-report.md` with independence metadata,
compliance matrix, stable findings, commands/results, and residual risks. Every
outcome SC must have observed PASS evidence or a matrix RISK backed by an
explicit residual-risk entry.

Failed Direct work returns to `implement -> verify`. Failed artifact-backed work
activates `converge`, which classifies each gap as `missing`, `partial`,
`contradicts`, or `unrequested` and appends traceable tasks. With no actionable
gap, `tasks.md` remains byte-for-byte unchanged. Implementation and oracle
verification then repeat.

## Closeout and archive

Before archive, `closeout` requires all tasks `[x]`, independent oracle PASS, no
unresolved CRITICAL finding, complete FR/buildable-SC compliance evidence, a
PASS-or-explicit-RISK disposition for every outcome SC, and `archive-report.md`
status `READY`.

The archive script validates every declared durable delta before touching
`openspec/specs/`. It then stages, backs up, and transactionally applies ADDED,
MODIFIED, REMOVED, and RENAMED requirement blocks and acceptance scenarios.
`[INTERNAL]` requirements and undeclared prose never update permanent specs. A
handled delta, report, or move failure triggers independent report recovery and
rollback of canonical changes within the active process.

This is not crash-atomic: forced process or operating-system termination between
renames can leave `.spec.md.thoth-stage-*` or `spec.md.thoth-backup-*` files.
Inspect those files and the canonical spec before retrying archive.

On success, the report records `ARCHIVED`, the canonical sync result, and the
change moves to:

```text
openspec/changes/archive/YYYY-MM-DD-<feature>/
```

## Structural validation

Run from the installed `thoth-sdd` skill directory:

```text
node scripts/validate.mjs --change openspec/changes/<feature> --route <accelerated|full> --through <specify|plan|tasks|checklist|ready|closeout> --json
```

`specify`, `plan`, `tasks`, and conditional `checklist` validate only artifacts
available at that point. `ready` validates the complete pre-implementation set.
`closeout` adds completed-task, oracle-independence, compliance, and
archive-readiness checks. No gate requires a future phase output.

Structural success does not replace oracle judgment; it makes artifact grammar,
traceability, lifecycle, and closeout failures deterministic and fast.
