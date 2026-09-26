# Design: Adopt Spec-Kit Rigor in the SDD Pipeline

## Technical Approach

This change is overwhelmingly a **contract-and-convention** change, not a
runtime-code change. The SDD pipeline is implemented as:

- **Harness-neutral skill markdown** under `src/skills/**/SKILL.md`, bundled
  verbatim into every harness (shipped via the `files` array in
  `package.json`). These files are the behavior the agents actually follow.
- **Shared convention markdown** under `src/skills/_shared/*.md`, referenced by
  every SDD skill. This is the single layer where harness-agnostic logic lives,
  so any new mechanic defined here is inherited identically by OpenCode, Claude
  Code, and Codex.
- **One TypeScript contract**, `src/harness/core/sdd.ts`, exposing the typed
  `SddPhaseContract` consumed by `sdd.test.ts`. This is the only compiled
  surface touched by the change (handoff-hint field).
- **`openspec/config.yaml`**, which is a documentation-driven contract: it is
  NOT parsed by any TypeScript at runtime (verified: the only `rules:` symbol in
  `src/` is the unrelated agent-prompt `rules` array in `prompt-sections.ts`).
  Its `rules:` sections are constraints that skill prose reads and obeys.

Consequently, all seven mechanisms are delivered by: (a) adding sections to the
relevant `SKILL.md` files, (b) defining the canonical mechanic once in a
`_shared` convention, (c) declaring config keys in `config.yaml` plus the
convention's documented `config.yaml` shape, and (d) for handoffs only, adding
one optional typed field in `sdd.ts`. Gates are **procedural** (skill prose +
the existing `gate` plumbing), not new validators, because `plan-reviewer`
already runs as the `oracle-review` gate and `sdd-design` already runs as a
write phase. No new pipeline phase is introduced.

Phase A (governance, consistency, requirements-quality) and Phase B
(traceability/TDD, handoffs) are reflected directly in the File Changes grouping
so an implementer can ship A independently of B.

## Architecture Decisions

### Decision: Coverage mapping uses an explicit `Spec:` trace tag per task; `[USN]` is the story grouping, not the requirement linkage

**Choice**: Introduce a per-task **`Spec:` traceability tag** that names the
exact requirement (and optionally scenario) each task implements, e.g.
`Spec: sdd-governance/Versioned Constitution Artifact`. Requirement-coverage % =
`(distinct spec requirements named by >=1 task's Spec: tag) / (total spec
requirements across all delta domains)`. The `[USN]` id (introduced by
sdd-tasks-format) is a **user-story-number grouping label** (a coarse
story/epic bucket for prioritization and Independent-Test framing); it is NOT
the requirement linkage. A task therefore carries both: `[USN]` (which story it
belongs to) and `Spec:` (which requirement it satisfies).

**Alternatives considered**:
- *Make `[USN]` itself the requirement id* — rejected: a story routinely spans
  multiple requirements and one requirement can be split across stories, so a
  single `[USN]` cannot express the many-to-many requirement→task mapping that
  coverage % needs. It also collides semantically with "story", forcing one or
  the other meaning to be lossy.
- *Infer coverage by fuzzy text matching task titles to requirement names* —
  rejected: not deterministic, not testable, brittle to wording drift; the
  consistency spec demands a computable percentage.
- *A separate coverage matrix file* — rejected: extra artifact to keep in sync;
  inline `Spec:` tags keep the mapping next to the task and survive edits.

**Rationale**: Coverage must be computable and testable (spec
`sdd-consistency`: "8 of 10 requirements have >=1 mapped task → 80%"). An
explicit `Spec:` tag naming `{domain}/{Requirement Name}` is greppable,
deterministic, and lets `plan-reviewer` count distinct covered requirements
against the total it parses from `openspec/changes/{change}/specs/*/spec.md`
`### Requirement:` headings. Keeping `[USN]` as the story label preserves the
spec-kit traceability intent without overloading it. Both fields stay optional
for back-compat (legacy tasks lack them; coverage simply reports against what is
present and `executing-plans` tolerates absence).

### Decision: Constitution mechanics — fixed template, manual semver by the editor, in-file sync-impact report comment, gate wired into existing phases

**Choice**:
- **Template**: `openspec/memory/constitution.md` with a fixed structure —
  front-matter-style header carrying `Version: MAJOR.MINOR.PATCH` and
  `Ratified` / `Last-Amended` dates; a `## Principles` section with one
  `### Principle N: {Name}` block each containing **Statement**, **Rationale**,
  and **Gate Implications** (what a violation looks like); and a trailing
  `## Sync-Impact Report` section. Seeded with the five native principles named
  in the proposal (delegate-first coordination, read-only role boundaries,
  governed persistence, multi-harness parity, evidence-led verification) at
  `Version: 1.0.0`.
- **Semver policy**: **manual**, performed by whoever edits the constitution.
  MAJOR = principle removed or redefined; MINOR = principle added or guidance
  materially expanded; PATCH = clarification/wording. No tooled auto-bump
  (there is no runtime that parses the file), so the rule is enforced by
  `sdd-init` prose + a checklist line in the constitution itself.
- **Sync-impact report**: an in-file `## Sync-Impact Report` block at the bottom
  of `constitution.md` (most recent entry on top), each entry listing
  `version`, `change type`, `principles touched`, and `downstream gates/artifacts
  affected`. Co-locating it with the constitution avoids a second artifact going
  stale.
- **Gate wiring**: the "Constitution Check" is a **procedural gate** owned
  jointly by `sdd-design` (self-check while authoring) and `plan-reviewer`
  (independent enforcement). It reuses the existing `plan-reviewer` =
  `gate: 'oracle-review'` plumbing rather than adding a new gate enum value
  (see next decision). Blocking + override is expressed in prose: on a detected
  violation the reviewer emits `[REJECT]` (or a CRITICAL finding) and the
  orchestrator surfaces the violation through the harness blocking-input surface
  (AskUserQuestion-equivalent); an explicit user override is logged before
  advancement.

**Alternatives considered**:
- *Tooled/automatic semver bump* — rejected: nothing parses `config.yaml` or
  `constitution.md` at runtime; a "tool" would be net-new infrastructure out of
  scope. Manual bump with a documented policy matches the repo's
  documentation-driven model.
- *Separate `sync-impact-report.md`* — rejected: divergence risk; the proposal
  explicitly ties the report to constitution edits.
- *Constitution Check only in `sdd-design`* — rejected: `sdd-design` self-checks
  can rationalize their own design; the spec requires "`sdd-design` and/or
  `plan-reviewer`", and independent enforcement at `plan-reviewer` is the
  stronger, already-gated point.

**Rationale**: Reuses existing gate plumbing and the established `[OKAY]` /
`[REJECT]` + AskUserQuestion override pattern, so override semantics are
identical across harnesses (the convention defines it once; harnesses lacking a
blocking-input primitive report an unsupported-capability limitation per the
`sdd-governance` capability-gap scenario). Manual semver is the only honest
option given there is no parser.

### Decision: No new `gate` enum values; Constitution Check and consistency block reuse existing gate plumbing

**Choice**: Do **not** add new members to the `gate` union
(`'oracle-review' | 'user-confirmation' | 'iterative-verify'`) in `sdd.ts`. The
Constitution Check and the blocking consistency analysis both ride inside the
existing `plan-review` phase (`gate: 'oracle-review'`), and the
Constitution Check self-check also runs inside `sdd-design` (a normal write
phase, no gate field). Override surfaces reuse the `implementation-confirmation`
/ AskUserQuestion pattern already in the contract.

**Alternatives considered**:
- *Add `gate: 'constitution-check'` and `gate: 'consistency-block'`* — rejected:
  would force changes to `getSddPhase` consumers and every exhaustive switch on
  gate, risk breaking existing `sdd.test.ts` matchers, and misrepresent the
  architecture (these are checks *within* plan review, not separate phases). The
  proposal is explicit: consistency is "Not a new phase."

**Rationale**: Keeps the typed contract minimal and back-compatible; the
existing `sdd.test.ts` gate assertions (`plan-review` → `oracle-review`, etc.)
stay green unchanged. New behavior is expressed in skill prose + config, which
is where every other gate's *content* already lives.

### Decision: `SddPhaseContract` gains one optional `handoffHints?: string[]` field

**Choice**: Add a single optional field `handoffHints?: string[]` to
`SddPhaseContract`. Populate it on the phases that produce forward-looking
constraints — at minimum `spec` (preserve recorded Assumptions and
`[NEEDS CLARIFICATION]` resolutions), `design` (preserve coverage decisions and
architecture constraints), and `proposal` (preserve accepted scope / deferred
areas). Skills surface the upstream phase's `handoffHints` in their prose at the
transition; when absent, no handoff text is surfaced. Gated by the handoff
`config.yaml` section (surfacing can be disabled while the field stays valid).

**Alternatives considered**:
- *Structured object (`{ to: SddPhaseId; preserve: string }[]`)* — rejected for
  the first cut: heavier type surface and more test churn than the spec
  requires; the spec only needs "hint text describing what the next phase must
  preserve is available." `string[]` satisfies every scenario and stays
  trivially optional. (Recorded under Open Questions as a future tightening.)
- *Free-form `handoffHint?: string`* — rejected: multiple distinct
  preservation items per phase read better as a list.

**Rationale**: Optionality is the hard back-compat requirement
(`sdd-phase-handoffs`: "Phases without hints remain valid ... existing consumers
operate unchanged"). An optional array adds zero required fields, so every
existing entry in `SDD_PHASES` and every `getSddPhase(...).toMatchObject(...)`
assertion keeps passing; `getSddWorkflowContract`'s clone already spreads
unknown fields, but we extend its deep-clone to copy `handoffHints` defensively.

### Decision: Canonical `config.yaml` shape is the **list-of-strings `rules:`** form from the shared convention; migrate the current mapping form

**Choice**: Standardize on the `_shared/openspec-convention.md` shape, where each
`rules:` phase key holds a **list of guidance strings**, optionally with a few
typed scalar keys for machine-relevant toggles (the convention already mixes
`apply: [..]` list items with `tdd: false` / `test_command: ''` scalars). The
current `openspec/config.yaml` uses a divergent **mapping** form
(`proposal: {max_words: 500}`, `spec: {format: ...}`); this change rewrites it to
the canonical list+scalar form and **adds one `rules:` section per new
mechanism**. The shared convention's documented `config.yaml` shape is updated to
show the new sections, so doc and live file converge. `sdd-init`'s emitted
template is updated to match.

The exact `rules:` keys/values added:

```yaml
rules:
  proposal:
    - Include rollback plan for risky changes
    - Identify affected modules/packages
  spec:
    - Use RFC 2119 keywords (MUST, SHALL, SHOULD, MAY)
    - Use Given/When/Then scenarios
  design:
    - Document architecture decisions with rationale
    - Require a File Changes section
  tasks:
    - Group tasks by phase with hierarchical numbering
    - Require a per-task Verification block
    tdd: false                      # TDD ordering flag (sdd-tasks-format)
    traceability: true              # require [USN] + Spec: tag + Independent Test per task
  apply:
    - Follow existing code patterns and conventions
    test_command: ''
  verify:
    test_command: ''
    build_command: ''
    coverage_threshold: 0
  archive:
    - Warn before destructive merges

  # --- new mechanism sections ---
  constitution:
    path: openspec/memory/constitution.md
    enforce_check: true             # Constitution Check gate blocks on violation
    version_policy: semver          # MAJOR=remove/redefine, MINOR=add, PATCH=clarify
  consistency:
    enforce_block: true             # CRITICAL findings block plan-review
    require_coverage_percentage: true
  requirements_quality:
    enforce_block: true             # incomplete checklist blocks tasks phase
    dimensions: [completeness, clarity, measurability, testability]
  clarification:
    max_markers_per_spec: 3         # [NEEDS CLARIFICATION] cap enforced by plan-reviewer
  handoffs:
    surface_hints: true             # surface SddPhaseContract.handoffHints at transitions
```

**Alternatives considered**:
- *Keep the current mapping form and document it as canonical* — rejected: the
  shared convention (the single source other skills cite) already specifies the
  list form, `sdd-init` already emits the list form, and the proposal says
  "`config.yaml rules:` gains one section per mechanism" matching the convention.
  Aligning the live file to the convention is the smaller net change and removes
  an existing doc/file divergence.
- *Put toggles in a top-level `mechanisms:` block instead of under `rules:`* —
  rejected: the spec for every mechanism says "`config.yaml` MUST expose a
  dedicated `rules:` section," so the keys belong under `rules:`.

**Rationale**: The convention is the contract skills read; the live file must
match it. This resolves Open Issue #3 by making the list+scalar shape canonical,
adding the seven mechanism keys, and updating both the convention doc and
`sdd-init`'s template so all three stay in lockstep. Per-mechanism `enforce_*`
keys give the "disabled config downgrades the block to a report" scenarios a
concrete switch.

### Decision: Requirements-quality checklist is a new durable artifact `checklists/requirements.md` under the change dir

**Choice**: `sdd-spec` (at or after authoring) generates
`openspec/changes/{change-name}/checklists/requirements.md`, organized with one
`## Domain: {domain}` section per authored delta domain, each containing checkbox
items across the four dimensions (completeness, clarity, measurability,
testability). It uses the same checkbox states as tasks (`- [ ]` / `- [x]` /
`- [-] waived: reason`). The spec→tasks transition is gated on every item being
`- [x]` or explicitly waived; incomplete blocks (overridable, logged) unless the
`requirements_quality` config section disables the block.

**Alternatives considered**:
- *Fold checklist items into `spec.md`* — rejected: pollutes the requirement
  contract and breaks the "consumed before tasks" gate boundary.
- *Persist only in thoth-mem* — rejected: this change runs in `openspec` mode and
  the artifact must be visible/gateable in-repo; thoth-mem persistence remains
  available in hybrid mode via the existing persistence contract.

**Rationale**: A standalone checklist artifact under the change directory is
greppable, gateable, and per-domain as the spec requires, and slots cleanly into
the existing artifact ownership table.

## Data Flow

1. **Bootstrap**: `sdd-init` detects a missing `openspec/memory/constitution.md`
   → creates it at `1.0.0` with the five native principles; writes/updates
   `config.yaml` with the canonical `rules:` shape incl. new sections.
2. **Spec**: `sdd-spec` authors delta specs (≤3 `[NEEDS CLARIFICATION]` per
   file, defaults recorded in an `## Assumptions` section), then emits
   `checklists/requirements.md` per domain. Declares `handoffHints` (assumptions,
   clarifications) for design.
3. **Design**: `sdd-design` reads constitution + spec, runs a Constitution Check
   self-review, records coverage/architecture decisions, declares `handoffHints`
   for tasks.
4. **Spec→Tasks gate**: requirements-quality checklist must be complete (or
   overridden) before `sdd-tasks` runs.
5. **Tasks**: `sdd-tasks` emits each task with `[USN]` story id, `P1/P2/P3`
   priority, `Spec:` requirement trace tag, `Independent Test`, and the existing
   `Verification` block; honors `tasks.tdd` ordering when enabled.
6. **Plan review**: `plan-reviewer` runs executability review **plus** (a)
   cross-artifact consistency with CRITICAL/HIGH/MEDIUM/LOW severities, (b)
   requirement-coverage % from `Spec:` tags vs `### Requirement:` count, (c)
   `[NEEDS CLARIFICATION]` cap check, (d) TDD-ordering check when enabled, (e)
   Constitution Check. CRITICAL consistency findings or Constitution violations
   block; override via blocking-input surface, logged.
7. **Execute**: `executing-plans` surfaces `[USN]`/priority/Independent Test
   when present, tolerates absence.

## File Changes

### Phase A — governance, consistency, requirements-quality

- **ADD** `openspec/memory/constitution.md` — template + five native principles
  at `Version: 1.0.0` + empty `## Sync-Impact Report`. *(constitution artifact)*
- **MODIFY** `openspec/config.yaml` — rewrite to canonical list+scalar `rules:`
  shape; add `constitution`, `consistency`, `requirements_quality`,
  `clarification`, `handoffs` sections and `tasks.tdd`/`tasks.traceability`.
- **MODIFY** `src/skills/_shared/openspec-convention.md` — add canonical
  Constitution artifact (path/semver/sync-impact), the consistency
  severity+coverage model, the requirements-quality checklist artifact + path
  `checklists/requirements.md`, the `[NEEDS CLARIFICATION]` cap + Assumptions
  policy, and update the documented `config.yaml` shape with the new sections.
  Add `Requirements checklist` and `Constitution` rows to the Canonical
  Artifacts table.
- **MODIFY** `src/skills/sdd-init/SKILL.md` — bootstrap `constitution.md` (create
  if absent, preserve+keep version if present, idempotent); emit the updated
  `config.yaml` template with new sections.
- **MODIFY** `src/skills/sdd-design/SKILL.md` — add Constitution Check
  self-review step + reference; consume upstream `handoffHints`.
- **MODIFY** `src/skills/plan-reviewer/SKILL.md` — add consistency analysis
  (severity model + coverage % from `Spec:` tags), Constitution Check
  enforcement, `[NEEDS CLARIFICATION]` cap enforcement, blocking gate + logged
  AskUserQuestion override, all gated by the corresponding config sections.
- **MODIFY** `src/skills/sdd-spec/SKILL.md` — add `[NEEDS CLARIFICATION]` cap
  (≤3), informed-guess-first `## Assumptions` policy, and generation of
  `checklists/requirements.md`; declare `handoffHints`.
- **MODIFY** `src/skills/requirements-interview/SKILL.md` — note that genuine
  forks unresolved at interview become `[NEEDS CLARIFICATION]` markers / recorded
  assumptions downstream (alignment only; no gate ownership).

### Phase B — traceability/TDD, phase handoffs

- **MODIFY** `src/harness/core/sdd.ts` — add optional `handoffHints?: string[]`
  to `SddPhaseContract`; populate on `proposal`, `spec`, `design`; extend
  `getSddWorkflowContract` deep-clone to copy `handoffHints`.
- **MODIFY** `src/harness/core/sdd.test.ts` — add assertions: field is optional
  (phases without it still valid), populated phases expose hints, clone copies
  the array; keep all existing gate/role assertions unchanged.
- **MODIFY** `src/skills/sdd-tasks/SKILL.md` — add `[USN]`, `P1/P2/P3`,
  `Spec:` trace tag, and `Independent Test` to the task template (additive to
  `Verification`); implement `tasks.tdd` ordering; declare `handoffHints`
  consumption.
- **MODIFY** `src/skills/executing-plans/SKILL.md` — surface
  `[USN]`/priority/`Independent Test` when present; tolerate absence (back-compat
  scenario).
- **MODIFY** `src/skills/sdd-design/SKILL.md` and `src/skills/sdd-spec/SKILL.md`
  — `handoffHints` surfacing prose (shared wording sourced from the convention).

> No harness *dialect* files change. All cross-harness logic lives in
> `_shared/openspec-convention.md` and `sdd.ts`; `src/agents/prompt-dialects.ts`
> is untouched because none of these mechanics needs per-harness wording beyond
> the capability-gap reporting already covered by the convention.

## Interfaces / Contracts

- **`SddPhaseContract.handoffHints?: string[]`** — optional; surfaced by skills,
  gated by `rules.handoffs.surface_hints`.
- **Task trace tag** — `Spec: {domain}/{Requirement Name}` (optionally
  `#{Scenario Name}`); machine-countable for coverage %.
- **`[USN]` token** — `[USN-<n>]` story grouping label on a task line.
- **Coverage % formula** — `distinct requirements named by ≥1 task Spec: tag ÷
  total ### Requirement: headings across delta specs`.
- **Constitution header** — `Version: MAJOR.MINOR.PATCH`, `Ratified`,
  `Last-Amended`; `## Principles` blocks; `## Sync-Impact Report`.
- **Config switches** — `rules.constitution.enforce_check`,
  `rules.consistency.enforce_block`, `rules.requirements_quality.enforce_block`,
  `rules.clarification.max_markers_per_spec`, `rules.tasks.tdd`,
  `rules.handoffs.surface_hints`.

## Testing Strategy

- **`src/harness/core/sdd.test.ts`** (the only compiled test touched):
  - new: `handoffHints` is optional — a phase contract without it remains valid
    and `getSddPhase` returns it; existing `toMatchObject` assertions unaffected.
  - new: phases that declare hints (`spec`/`design`/`proposal`) expose the array.
  - new: `getSddWorkflowContract()` deep-clone copies `handoffHints` (mutating
    the clone does not mutate the source).
  - regression: all existing gate (`oracle-review`/`user-confirmation`/
    `iterative-verify`), order, and role assertions stay green — proves no new
    gate enum and no required field were added.
- **Skill-contract checks** (markdown, no runtime): verify by review/grep that
  each mechanism's prose names its config switch and override path; confirm
  `_shared/openspec-convention.md` documents every new `rules:` key so doc and
  `config.yaml` match. Add a doc-consistency check if the repo grows one;
  otherwise this is reviewer-enforced.
- **Config validity**: ensure `openspec/config.yaml` parses as YAML (lint/CI) and
  matches the convention's documented shape.
- **Full gate**: `pnpm run check:ci` (lint, typecheck, build, test) per AGENTS.md
  CI order; only `sdd.test.ts` and `sdd.ts` affect typecheck/test.

## Migration / Rollout

- Every artifact and field is **additive/optional**. Legacy `tasks.md` without
  `[USN]`/`Spec:`/`Independent Test` still executes; legacy specs without
  `[NEEDS CLARIFICATION]`/`Assumptions` still pass; phases without `handoffHints`
  still validate.
- `config.yaml` rewrite is backward-safe because nothing parses it at runtime;
  skills read the new keys, and missing `enforce_*` keys default to enforcing
  (documented in the convention) so absence is safe.
- Each mechanism is independently revertable (proposal Rollback Plan): removing a
  `rules:` section, the constitution file, the skill sections, or the
  `handoffHints` field restores prior behavior with no change to main specs or
  archived changes.
- Ship order: Phase A first (governance/consistency/quality), then Phase B
  (traceability/TDD/handoffs), matching the File Changes grouping.

## Open Questions

- Should `handoffHints` later become a structured
  `{ to: SddPhaseId; preserve: string }[]` once consumers need machine routing?
  Deferred: `string[]` satisfies every current scenario and keeps the field
  trivially optional. Tracked as a future tightening, not a blocker.
- Whether to add an automated doc/config-shape consistency test (assert
  `config.yaml` keys ⊆ documented convention keys). Recommended as a follow-up
  hardening; not required by any spec scenario.
