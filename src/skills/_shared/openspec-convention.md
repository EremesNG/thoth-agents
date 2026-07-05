# OpenSpec Convention

## Harness Scope

OpenSpec artifacts are harness-independent filesystem artifacts. The canonical
`openspec/` paths, filenames, and archive layout do not change across adapter
bindings.

This file defines harness-neutral artifact semantics. Any runtime-specific file
read/write, delegation, or blocking user input surface is an adapter binding
and must preserve the canonical behavior described here. If a runtime lacks a
required primitive, treat it as an unsupported-capability and report the
limitation instead of changing artifact semantics.

## Mode Scope

This convention applies only when the artifact store mode includes OpenSpec:
`openspec` and `hybrid`.

- In `thoth-mem` mode, skip canonical `openspec/` file writes.
- In `thoth-mem` mode, skip filesystem artifact recovery.

## Pre-flight Validation

When the selected persistence mode includes OpenSpec (`openspec` or `hybrid`),
every SDD skill must verify this structure before proceeding:

1. `openspec/config.yaml` exists
2. `openspec/specs/` exists
3. `openspec/changes/` exists

If any required item is missing:

- STOP and inform the orchestrator that `openspec/` is not initialized.
- Recommend running the `sdd-init` skill first.
- Do NOT attempt to create the structure in that skill.

If the required items exist but the project is stale (`config.yaml` is missing
one or more mechanism sections / toggles, or `openspec/memory/constitution.md`
is absent):

- Recommend running the `sdd-init` skill to additively realign the project.
- Do NOT attempt to backfill the missing pieces in that skill.

If all required items exist and no mechanism pieces are missing, continue
normally.

## Directory Structure

```text
openspec/
├── config.yaml
├── specs/
│   └── {domain}/spec.md
└── changes/
    ├── archive/
    └── {change-name}/
        ├── proposal.md
        ├── specs/
        │   └── {domain}/spec.md          # clarified in place by the clarify phase
        ├── design.md
        ├── research.md                   # optional sub-artifact (gated)
        ├── data-model.md                 # optional sub-artifact (gated)
        ├── contracts/                    # optional sub-artifact subdir (gated)
        ├── quickstart.md                 # optional sub-artifact (gated)
        ├── tasks.md
        ├── plan-review.md
        └── verify-report.md
```

## Canonical Artifacts

| Artifact | Canonical path | Notes |
| --- | --- | --- |
| Proposal | `openspec/changes/{change-name}/proposal.md` | Intent, scope, approach |
| Delta specs | `openspec/changes/{change-name}/specs/{domain}/spec.md` | Use one file per domain |
| Main specs | `openspec/specs/{domain}/spec.md` | Source of truth after archive |
| Design | `openspec/changes/{change-name}/design.md` | Architecture and file plan; always produced |
| Sub-artifacts (optional, gated) | `openspec/changes/{change-name}/{research.md,data-model.md,contracts/,quickstart.md}` | Optional design sub-artifacts; gated by `rules.design.sub_artifacts` + `complexity_threshold` |
| Tasks | `openspec/changes/{change-name}/tasks.md` | Checkbox checklist updated by apply |
| Plan review | `openspec/changes/{change-name}/plan-review.md` | Oracle plan-review result with status, notes, blockers, override context, and SHA-256 reviewed-artifact freshness data |
| Verify report | `openspec/changes/{change-name}/verify-report.md` | Compliance matrix and evidence |
| Requirements checklist | `openspec/changes/{change-name}/checklists/requirements.md` | Domain-typed requirement-quality gate, consumed before tasks |
| Constitution | `openspec/memory/constitution.md` | Semver-versioned native principles + Sync-Impact Report |

`apply-progress` and `archive-report` are durable SDD artifacts, but they are
primarily persisted through thoth-mem topic keys when the mode includes
thoth-mem.

A saved `plan-review.md` approval is reusable only when it contains `[OKAY]` and every recorded reviewed-artifact SHA-256 digest still matches the current planning artifacts. Missing, stale, rejected, or unparsable plan-review evidence fails closed and requires a fresh Oracle review unless a separate explicit user override is captured through the normal blocking-input surface. A fresh plan-review approval satisfies only the plan-review gate; implementation confirmation remains separate.

The canonical OpenSpec copy is the filesystem representation of these artifacts
for `openspec` and `hybrid` modes. thoth-mem topic keys are the memory
representation when the mode includes thoth-mem; neither representation changes
the harness-neutral artifact names or lifecycle.

Delegated handoff summaries are not OpenSpec artifacts. They are root-owned
session summary context when thoth-mem is available, while subagent prompts
carry recovery instructions and continue to use the canonical OpenSpec paths
above for filesystem artifact recovery.

## Writing Rules

- Preserve canonical filenames and locations.
- Read an existing artifact before rewriting it.
- Keep change-specific artifacts under
  `openspec/changes/{change-name}/...`.
- Keep long-lived specs under `openspec/specs/{domain}/spec.md`.
- Archive completed changes under
  `openspec/changes/archive/YYYY-MM-DD-{change-name}/`.

## Artifact Content Rules

- `proposal.md` explains why the change exists.
- `spec.md` uses RFC 2119 keywords and Given/When/Then scenarios (full pipeline only).
- The `clarify` phase (full pipeline only) resolves residual spec ambiguity in
  place between `spec` and `design`, editing the delta `spec.md` files under the
  same path and re-saving the `sdd/{change-name}/spec` key; it produces no new
  artifact.
- `design.md` explains how the change will be implemented (full pipeline only).
  It MAY be accompanied by optional, gated sub-artifacts (`research.md`,
  `data-model.md`, `contracts/`, `quickstart.md`).
- `tasks.md` is phase-based and uses Markdown checkboxes.
- `verify-report.md` maps acceptance criteria to executed evidence: spec
  scenarios in full pipeline, proposal success criteria in accelerated pipeline.

Progress tracking surfaces may mirror task status for user visibility, but
`tasks.md` remains the canonical OpenSpec task artifact whenever the selected
persistence mode includes OpenSpec.

## `config.yaml` Shape

`rules:` carries one section per phase or mechanism. A section is EITHER a
bare list of guidance strings OR a mapping. When a phase needs both human
guidance and machine-relevant scalar toggles, the guidance list lives under a
`guidance:` subkey alongside the scalars (mixing bare `- item` sequence entries
with `key: value` scalars under the same key is invalid YAML).

```yaml
schema: spec-driven

context: |
  Project background, stack, and constraints.

rules:
  proposal:
    - Include rollback plan for risky changes
    - Identify affected modules/packages
  spec:
    - Use RFC 2119 keywords (MUST, SHALL, SHOULD, MAY)
    - Use Given/When/Then scenarios
  design:
    guidance:
      - Document architecture decisions with rationale
      - Require a File Changes section
    sub_artifacts: false        # optional design sub-artifacts (default off)
    complexity_threshold:       # author-evaluated eligibility triggers (OR)
      affected_domains: 3
      affected_files: 12
      external_research: true
  tasks:
    guidance:
      - Group tasks by phase with hierarchical numbering
      - Require a per-task Verification block
    tdd: false                  # TDD ordering flag (sdd-tasks-format)
    traceability: true          # require [USN] + Spec: tag + Independent Test per task
    parallel_markers: false     # [P] emission + executing-plans consumption (default off)
  apply:
    guidance:
      - Follow existing code patterns and conventions
    test_command: ''
  verify:
    test_command: ''
    build_command: ''
    coverage_threshold: 0
  archive:
    - Warn before destructive merges

  # --- mechanism sections (spec-kit-rigor) ---
  constitution:
    path: openspec/memory/constitution.md
    enforce_check: true         # Constitution Check gate blocks on violation
    version_policy: semver      # MAJOR=remove/redefine, MINOR=add, PATCH=clarify
  consistency:
    enforce_block: true         # CRITICAL findings block plan-review
    require_coverage_percentage: true
  requirements_quality:
    enforce_block: true         # incomplete checklist blocks tasks phase
    dimensions: [completeness, clarity, measurability, testability]
  clarification:
    max_markers_per_spec: 3     # [NEEDS CLARIFICATION] cap enforced by plan-reviewer
  handoffs:
    surface_hints: true         # surface SddPhaseContract.handoffHints at transitions
```

Treat `rules` entries as mandatory phase-specific constraints whenever present.
Missing `enforce_*` keys default to enforcing; a section that sets its
`enforce_*` key to `false` downgrades the corresponding block to a report.

## Parallel Task Markers

`sdd-tasks` MAY annotate a task with an optional `[P]` marker placed AFTER the
`N.M` number (`- [ ] 2.1 [P] Title`), never before it. Placement after the
number keeps the `tasks-validator` `TASK_NUMBERING` regex green with no
validator change. `[P]` declares the task is dependency-free of the other
`[P]`-marked tasks in the SAME phase and targets the same execution agent;
`executing-plans` consumes a contiguous `[P]` run as one explicit parallel batch
(recommending worktree isolation for overlapping writers). Both emission and
consumption are gated by `rules.tasks.parallel_markers` (default off);
back-compat: an absent marker or disabled toggle executes exactly as today.

## Constitution Governance

The project constitution lives at `openspec/memory/constitution.md` and holds
NATIVE thoth-agents principles (delegate-first coordination, read-only role
boundaries, governed persistence, multi-harness parity, evidence-led
verification). It is NOT spec-kit's articles; only the mechanics of versioned
governance are adopted.

- **Version**: a semantic version `MAJOR.MINOR.PATCH` in the header, with
  `Ratified` and `Last-Amended` dates. `sdd-init` bootstraps it at `1.0.0`
  when absent and preserves the existing content and version when present
  (idempotent).
- **Semver bump policy** (manual, performed by the editor): MAJOR = a principle
  is removed or redefined; MINOR = a principle is added or guidance materially
  expanded; PATCH = clarification or wording. There is no runtime parser, so
  the policy is enforced by prose, not tooling.
- **Sync-Impact Report**: an in-file `## Sync-Impact Report` section (newest
  entry on top) listing version, change type, principles touched, and the
  downstream gates/artifacts affected.
- **Constitution Check gate**: a procedural gate owned jointly by `sdd-design`
  (self-review while authoring) and `plan-reviewer` (independent enforcement).
  It reuses the existing `oracle-review` gate plumbing — no new `gate` enum
  value. On a detected violation it BLOCKS advancement; the block is
  overridable only through an explicit user decision delivered via the harness
  blocking-input surface (AskUserQuestion-equivalent), and the override MUST be
  logged with the violated principle. Gated by `rules.constitution`; when
  `enforce_check: false`, the check does not block and the skip is noted.

    ### Constitution Amendment

    The AMENDMENT side of the lifecycle is performed by the `sdd-constitution`
    skill. It executes a guided, human-confirmed semver bump (reusing the Semver
    bump policy above), updates the `Last-Amended` date, and PREPENDS one
    `## Sync-Impact Report` entry in the format
    `- X.Y.Z | change type | principles touched | downstream gates/artifacts affected`
    (newest entry on top).

    - The ONLY writable target of the amendment is
      `openspec/memory/constitution.md`.
    - The bump is human-confirmed via the harness blocking-input surface
      (AskUserQuestion-equivalent) BEFORE any version is written. There is no
      runtime parser and no auto-bump; the level is never selected automatically.
    - When no principle change is warranted the skill performs a reported no-op and
      writes nothing.
    - It preserves all existing content and ALL prior Sync-Impact Report entries;
      it only prepends the new entry and updates the version/date fields.

    ### Read-Only Assets and Report-Only Propagation

    When the plugin is INSTALLED in a harness (OpenCode / Codex), bundled skills are
    READ-ONLY assets. The `sdd-constitution` skill MUST NOT edit, create, or delete
    any other `SKILL.md`, any file under `src/`, or any template — its single
    writable target is the end-user `openspec/memory/constitution.md`.

    Because the enforcement gates (`sdd-design`, `plan-reviewer`) read the
    constitution LIVE, there are NO static principle copies to realign. Propagation
    is therefore report-only: the Sync-Impact Report entry DOCUMENTS which
    downstream gates consume the changed principles, and the skill FLAGS any
    in-flight change `design.md` / `tasks.md` that reference now-changed principles
    for HUMAN re-review instead of editing them.

    ### Amendment Auto-Suggest (shared snippet)

    `sdd-verify` and `sdd-archive` REFERENCE this single canonical snippet (they do
    NOT inline it) to surface a report-only amendment suggestion.

    > **Constitution amendment auto-suggest (report-only).** A completed change is
    > "governance-touching" when ANY holds: its `proposal.md` Impact/Affected
    > Areas, `design.md`, `tasks.md`, or delta `spec.md` reference
    > `openspec/memory/constitution.md`, "the constitution," or a named principle;
    > OR it modifies `src/skills/_shared/openspec-convention.md` (Constitution
    > Governance) or `openspec/memory/constitution.md`; OR any artifact names a
    > constitution principle by title. When governance-touching, surface a
    > NON-BLOCKING suggestion: "This change touched governance/principles —
    > consider running `sdd-constitution` to record a constitution amendment." This
    > suggestion is advisory only; it MUST NOT block verification or archival.

    ### config.yaml mechanism-section backfill

`sdd-init` realignment backfills the `config.yaml` mechanism sections
(`constitution`, `consistency`, `requirements_quality`, `clarification`,
`handoffs`) and the `rules.tasks.traceability` / `rules.verify` toggles
additively, mirroring the constitution idempotency above.

- It MUST detect per-section absence independently and merge ONLY the absent
  sections / toggles into the existing `config.yaml`.
- It MUST NOT overwrite any value that is already present; every existing key
  and value is preserved verbatim.
- It MUST report which sections / toggles were added.
- It is idempotent: re-running on a project whose `config.yaml` already carries
  every mechanism section / toggle is a reported no-op.

## Consistency Severity and Coverage Model

`plan-reviewer` performs cross-artifact consistency analysis across
proposal<->spec<->design<->tasks IN ADDITION to its executability review (it is
NOT a new phase). Each finding carries a severity of `CRITICAL`, `HIGH`,
`MEDIUM`, or `LOW`.

- **Blocking gate**: any `CRITICAL` finding BLOCKS advancement past plan
  review; non-CRITICAL findings are reported but do not block. The block is
  overridable only through an explicit, logged user decision via the harness
  blocking-input surface. Gated by `rules.consistency.enforce_block`.
- **Requirement-coverage percentage**: `(distinct spec requirements named by
  >=1 task Spec: tag) / (total ### Requirement: headings across all delta
  specs)`, e.g. 8 of 10 covered -> 80%. The percentage MUST appear in the
  review output (gated by `rules.consistency.require_coverage_percentage`).

## Requirements-Quality Checklist

`sdd-spec` generates a domain-typed requirements-quality checklist at
`openspec/changes/{change-name}/checklists/requirements.md` ("unit tests for
English"). It has one `## Domain: {domain}` section per authored delta domain,
each with checkbox items across four dimensions: completeness, clarity,
measurability, testability. Items use the task checkbox states (`- [ ]` /
`- [x]` / `- [-] waived: reason`). The spec->tasks transition is GATED on every
item being `- [x]` or explicitly waived; an incomplete checklist blocks
(overridable + logged) unless `rules.requirements_quality.enforce_block: false`.

## Clarification Discipline

Spec authoring may use `[NEEDS CLARIFICATION: <question>]` markers for genuine
unresolved decision forks, capped at `rules.clarification.max_markers_per_spec`
(default 3) per spec file. Follow an informed-guess-first policy: when an
ambiguity has a defensible default, apply it and record it in the spec's
`## Assumptions` section rather than emitting a marker; reserve markers for
forks with no defensible default. `plan-reviewer` flags any spec file exceeding
the cap.

## Handoff Hints

`SddPhaseContract` (in `src/harness/core/sdd.ts`) carries an optional
`handoffHints?: string[]`; a phase declares what the next phase must preserve
(accepted scope, recorded assumptions, coverage/architecture decisions). The
field is OPTIONAL — phases without hints stay valid and existing consumers run
unchanged. SDD skills SURFACE the upstream phase's `handoffHints` in their prose
at the transition; when absent, no handoff text is surfaced. Gated by
`rules.handoffs.surface_hints` (when `false`, hints are not surfaced while the
contract field stays valid).
