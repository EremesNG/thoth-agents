# Design: Extend Spec-Kit Rigor (Phase 2)

## Technical Approach

Like Phase 1 (`adopt-spec-kit-rigor`), this is overwhelmingly a
**contract-and-convention** change, not a runtime-code change. The three
mechanisms are delivered through the same four shared surfaces, so OpenCode,
Claude Code, and Codex inherit identical behavior with zero dialect-specific
handling:

- **Harness-neutral skill markdown** under `src/skills/**/SKILL.md` (the behavior
  agents actually follow), bundled verbatim into every harness.
- **Shared convention markdown** under `src/skills/_shared/*.md`, the single layer
  where harness-agnostic mechanics are defined once and cited by every skill.
- **One TypeScript contract**, `src/harness/core/sdd.ts`, exposing the typed
  `SddPhaseContract` / `SDD_PHASES` / `FULL_SDD_PHASE_ORDER` consumed by
  `sdd.test.ts`. This is the only compiled surface touched (the new `clarify`
  phase entry + phase-order/prereq reorder).
- **`openspec/config.yaml`**, a documentation-driven contract (NOT parsed by any
  TypeScript at runtime — verified: the only `rules` symbol in `src/` is the
  unrelated agent-prompt `rules` array in `prompt-sections.ts`). Skill prose
  reads and obeys its `rules:` sections.

The delegation matrix in `src/agents/prompt-sections.ts` is derived from
`SDD_PHASES` via `getDelegatedSddPhase` / `primarySddRole`, so adding the
`clarify` phase to `sdd.ts` is the single source the matrix renderer consumes.

Each mechanism is additive, default-disabled, and independently revertable.
`[P]` and sub-artifacts are skill/template additions gated by new `config.yaml`
toggles; consumers tolerate absence. `sdd-clarify` is a new typed phase inserted
into `FULL_SDD_PHASE_ORDER` between `spec` and `design`, requiring a
prerequisite renumber.

## Architecture Decisions

### Decision (a): Clarify write-back is an in-place edit of the authoritative spec; thoth-mem reuses the `sdd/{change}/spec` topic key (no new artifact, no new key)

**Choice**:
- **Write-back target**: `sdd-clarify` edits the **existing delta spec file(s)**
  in place at `openspec/changes/{change-name}/specs/{domain}/spec.md`. Resolved
  `[NEEDS CLARIFICATION]` markers are replaced with the resolved decision (inline,
  or folded into the spec's `## Assumptions` section when the resolution is a
  recorded default). No new artifact (`clarifications.md`, `spec-clarified.md`,
  etc.) is created. `clarify.producesArtifact = false`.
- **thoth-mem topic key**: in `hybrid`/`thoth-mem` mode, `sdd-clarify` re-saves
  the edited spec under the **same** canonical key `sdd/{change-name}/spec`
  (upsert), exactly as `sdd-spec` does. No `spec-clarified` key is introduced.
- **Checklist re-validation**: after write-back, `sdd-clarify` re-validates
  `openspec/changes/{change-name}/checklists/requirements.md` against the
  clarified spec, flipping items that were waived/open due to a now-resolved
  ambiguity (e.g. the three `- [-] waived: ... deferred to design` items become
  resolvable once design fixes them — though for THIS change those three forks
  are resolved here in design, not in a clarify run). The checklist remains the
  spec->tasks gate; `sdd-clarify` does not advance past `design` with an
  unresolved checklist.
- **Downstream consumption**: because write-back is in-place under the same path
  and same topic key, `design` (and every downstream phase) reads the clarified
  spec through its existing recovery path with **zero new wiring** — the
  "design consumes the clarified spec" scenario is satisfied by the storage being
  identical to the pre-clarify storage location.

**Alternatives considered**:
- *New `clarifications.md` artifact + `sdd/{change}/spec-clarified` key* —
  rejected: forces every downstream consumer (`design`, `tasks`, `plan-reviewer`,
  validators) to learn a second source and a precedence rule (clarified vs base),
  creates a divergence/staleness surface, and contradicts the spec's
  "reflected in the authoritative spec content consumed by design" language. The
  proposal explicitly frames clarify as "updates the spec in place ... produces
  no new permanent artifact."
- *Append-only `## Clarifications` log section inside spec.md* — rejected as the
  primary mechanism: it leaves the original ambiguous statement/marker standing,
  so the spec still "presents it as unresolved," violating the write-back
  requirement. (A short dated `## Clarifications` log MAY be added as a
  supplementary audit trail, but the marker/statement itself MUST be resolved in
  place.)

**Rationale**: One authoritative spec, one topic key, one recovery path. This is
the minimal-divergence choice, matches the existing `sdd-spec` upsert pattern
(stable `topic_key` upserts instead of duplicating), and makes the
"design sees clarified content" scenario true by construction rather than by new
plumbing. Re-validating the same `checklists/requirements.md` keeps the existing
spec->tasks gate authoritative.

### Decision (b): Sub-artifact inclusion is gated by BOTH conditions with config as the hard floor and author judgment as the discretionary ceiling (config gates, author decides within the gate)

**Choice**: Two necessary conditions, evaluated in order:
1. **Hard gate (config)**: `rules.design.sub_artifacts` MUST be `true`. If
   `false`/absent, no sub-artifacts are ever produced (back-compat default).
2. **Complexity gate (config threshold, author-evaluated)**: when enabled, the
   change MUST meet `rules.design.complexity_threshold`. The threshold is a
   declarative trigger set defined in config; the **`sdd-design` author evaluates
   the change against it** and decides which of the four sub-artifacts (if any)
   are warranted. `complexity_threshold` is a small mapping, e.g.

   ```yaml
   design:
     sub_artifacts: false          # master enable (default disabled)
     complexity_threshold:
       affected_domains: 3         # >= N delta-spec domains
       affected_files: 12          # >= N files in the File Changes section
       external_research: true     # unresolved tech/library choice present
   ```

   Semantics: sub-artifacts become **eligible** when the change meets ANY listed
   trigger (OR across triggers). Eligibility is necessary, not sufficient — the
   author still applies judgment about which surfaces add value (`research.md`
   only when there is genuine unknown investigation; `data-model.md` only when
   there is a non-trivial data shape; `contracts/` only when there are
   interfaces to pin; `quickstart.md` only when a runnable smoke path helps).

**Precedence**: config is authoritative for the *gate* (a disabled toggle or an
unmet threshold is an absolute veto the author cannot override); the *author* is
authoritative for *selection within the gate* (an eligible change MAY still get
zero sub-artifacts if none add value — the spec says "MAY produce"). `design.md`
is always produced regardless.

**Alternatives considered**:
- *Pure config (a parser decides inclusion)* — rejected: nothing parses
  `config.yaml` at runtime, and a fixed numeric rule cannot judge whether a
  `research.md` is actually warranted; it would force ceremony on changes that
  merely cross a file count.
- *Pure author judgment (ignore config threshold)* — rejected: the spec REQUIRES
  "gated by both the enable toggle AND a complexity condition"; author-only
  removes the reviewable, configurable floor and the disabled-state guarantee.

**Rationale**: This is the only reading that satisfies the spec's "both the
enable toggle AND a complexity condition" while staying honest about the
documentation-driven (no-runtime-parser) model. Config gives a deterministic,
reviewable veto and default-off back-compat; author judgment prevents the
"simple change forced into four files" anti-pattern the spec's
"does not force sub-artifact ceremony" scenario guards against.

### Decision (c): `[P]` is a within-phase, same-batch parallel signal layered on the existing consecutive+same-agent heuristic; cross-phase parallelism is explicitly out

**Choice**:
- **Granularity**: `[P]` groups **only within a single `## Phase N` block**, never
  across phases. Phase boundaries remain hard sequential barriers (phase N+1 may
  depend on phase N outputs).
- **Interaction with the existing heuristic**: today `executing-plans` groups
  "the next consecutive ready tasks that target the same execution agent"
  (implicit batching, SKILL.md Phase 2.A/2.B). `[P]` makes that batch
  **explicit**: when `rules.tasks.parallel_markers` is enabled, `[P]`-marked
  consecutive tasks **within the same phase that target the same execution role**
  form one explicit parallel batch. `[P]` is an *upgrade of the existing
  same-agent grouping signal*, not a new cross-agent scheduler — it does not
  authorize dispatching different roles concurrently.
- **`executing-plans` interpretation**: at its grouping logic (SKILL.md Phase 2),
  when the toggle is on, consume contiguous `[P]` tasks in a phase as a declared
  parallel batch (surface them as a batch dispatch); when the toggle is off or no
  `[P]` markers are present, fall back to today's implicit consecutive+same-agent
  grouping unchanged.
- **Safety**: `[P]` asserts the tasks are dependency-free of each other.
  `sdd-tasks` MUST NOT emit `[P]` on tasks with intra-phase dependencies (the
  "sequential tasks omit the marker" scenario). When `[P]`-marked tasks would
  touch overlapping files (write conflict risk) and the harness dispatches them
  as genuinely concurrent writers, `executing-plans` MUST recommend
  **worktree isolation** per parallel writer (or serialize them); a harness
  without concurrent-dispatch capability treats `[P]` as an annotated sequential
  batch and reports the capability gap (no behavior divergence in output).
- **Marker placement (critical back-compat)**: `[P]` is placed **after** the
  `N.M` number: `- [ ] 2.1 [P] Title — path`. This is mandatory: the
  `tasks-validator` applies `TASK_NUMBERING = /^(\d+\.\d+)\s+.+$/` to the task
  body (text after `- [ ] `), so a leading `- [ ] [P] 2.1 ...` would trigger
  `tasks.malformed-numbering`. Placing `[P]` after the number keeps the validator
  green with no validator code change required for *correctness*, though an
  explicit validator test asserting `[P]` acceptance is added (see Testing).

**Alternatives considered**:
- *Cross-phase `[P]` parallelism* — rejected: phases encode dependency order
  (the whole point of `## Phase N`); parallelizing across them would require a
  real dependency DAG the pipeline does not model and the spec does not ask for
  (it scopes `[P]` to "other `[P]`-marked tasks in the same phase").
- *`[P]` as a cross-agent concurrent scheduler* — rejected: `executing-plans`
  preserves role boundaries and one-role-per-dispatch; `[P]` upgrades the
  existing same-agent batch signal, it does not introduce heterogeneous
  concurrency.
- *`[P]` before the number (`- [ ] [P] 2.1`)* — rejected: breaks
  `tasks-validator` numbering and the `N.M`-preservation requirement.

**Rationale**: Scoping `[P]` to within-phase, same-agent batches makes it a
faithful, low-risk *explicit* form of the batching `executing-plans` already
does implicitly, satisfies every spec scenario ("two `[P]` tasks in a phase
dispatched as an explicit parallel batch"; "missing markers fall back to implicit
grouping"), and keeps the back-end multi-agent scheduler untouched. Worktree
isolation is the established safety valve for concurrent writers.

### Decision: `sdd-clarify` phase contract, order insertion, and prerequisite renumber in `sdd.ts`

**Choice**: Add one `SddPhaseContract` entry and renumber. Exact shape:

```ts
{
  id: 'clarify',
  order: 5,
  requiredFor: ['full'],
  prerequisites: ['spec'],
  producesArtifact: false,
  owner: 'write-capable-agent',
  artifactSkill: 'sdd-clarify',
  defaultAgentRole: 'deep',
  supportingAgentRoles: ['oracle'],
  delegationReason:
    'Resolve residual spec ambiguity in place before design consumes it.',
  handoffHints: [
    'Preserve clarified resolutions written back into the spec.',
    'Keep the requirements-quality checklist re-validated before design.',
  ],
}
```

- Add `'clarify'` to the `SddPhaseId` union (between `'spec'` and `'design'`).
- Insert `'clarify'` into `FULL_SDD_PHASE_ORDER` between `'spec'` and `'design'`.
- **Order renumber** (the insertion shifts every subsequent `order`):
  `spec` stays 4; `clarify` = 5; `design` 5->6; `tasks` 6->7; `plan-review`
  7->8; `implementation-confirmation` 8->9; `apply` 9->10; `verify` 10->11;
  `archive` 11->12.
- **Prerequisite corrections**: `design.prerequisites` becomes
  `['proposal', 'clarify']` (was `['proposal', 'spec']`) — `clarify` already
  depends on `spec`, so `spec` stays transitively required and
  `canEnterSddPhase` still gates correctly. `tasks.prerequisites` stays
  `['proposal', 'spec', 'design']` (design now transitively implies clarify);
  optionally tighten to include `'clarify'` but it is redundant given
  `design` requires `clarify`. Downstream prereqs (`plan-review` -> `tasks`,
  etc.) are unchanged.
- `producesArtifact: false` (write-back is in place into the spec; no new
  artifact), so `getRequiredSddPhaseOrder('full')` includes `clarify` and
  `canEnterSddPhase` requires it before `design`.
- `getSddWorkflowContract` already deep-clones `handoffHints`; no clone change
  needed.

**Alternatives considered**:
- *`producesArtifact: true`* — rejected: clarify mutates the existing spec in
  place (Decision a); it produces no new artifact, matching the proposal.
- *`defaultAgentRole: 'quick'`* — rejected: residual-ambiguity resolution is
  reasoning-heavy (taxonomy scan, bounded Q&A, write-back correctness); `deep`
  with `oracle` support mirrors `spec`/`proposal`.

**Rationale**: A single typed phase entry + order renumber + one prerequisite
edit is the minimal compiled change; it keeps `canEnterSddPhase` correct and
the delegation matrix derivable from `SDD_PHASES`.

### Decision: Delegation-matrix routing surfaces `clarify` via `primarySddRole('clarify')`; role mapping source is `SDD_PHASES.defaultAgentRole`

**Choice**: Update `renderSddDelegationMatrix()` in `prompt-sections.ts` to add a
`sdd-clarify` routing entry between the spec and design entries, e.g.
`sdd-clarify -> ${primarySddRole('clarify')}`. The role mapping source is the
SAME as every other phase: `getDelegatedSddPhase('clarify').defaultAgentRole`
read from `SDD_PHASES` (which `primarySddRole` resolves through
`getSddWorkflowContract`). No new mapping table; the contract in `sdd.ts` is the
single source. Also update the orchestrator SDD prose route line (`Full SDD:
explore -> propose -> spec -> design -> tasks.`) to
`... -> spec -> clarify -> design -> tasks.`.

**Rationale**: Keeps the matrix derived from the typed contract (no drift),
matches the spec's "matrix entry MUST reflect the phase's position between spec
and design."

### Decision: `config.yaml` additions are additive scalars under existing `rules.tasks` / `rules.design`; defaults keep back-compat (disabled)

**Choice**: Add `parallel_markers: false` under `rules.tasks` and
`sub_artifacts: false` + a `complexity_threshold` mapping under `rules.design`.
Mirror the additions in the convention's documented `config.yaml` shape and the
`sdd-init` emitted template. `rules.design` currently is a bare guidance list;
it must convert to the `guidance:`-subkey form (as `rules.tasks`/`rules.apply`
already do) to legally carry scalars alongside guidance:

```yaml
  design:
    guidance:
      - Document architecture decisions with rationale
      - Require a File Changes section
    sub_artifacts: false            # optional plan sub-artifacts (default off)
    complexity_threshold:
      affected_domains: 3
      affected_files: 12
      external_research: true
  tasks:
    guidance: [ ... unchanged ... ]
    tdd: false
    traceability: true
    parallel_markers: false         # [P] emission + executing-plans consumption (default off)
```

**Rationale**: Default-off scalars under existing sections satisfy the
"absent toggle defaults to disabled" scenarios and the convention's
"mixing bare list entries with scalars is invalid YAML; use a `guidance:`
subkey" rule. Nothing parses config at runtime, so the rewrite is
behavior-safe.

## Data Flow

1. **Spec**: `sdd-spec` authors delta specs (<=3 `[NEEDS CLARIFICATION]` per
   file, defaults recorded in `## Assumptions`), generates
   `checklists/requirements.md`, declares `handoffHints`.
2. **Clarify (NEW, full only)**: `sdd-clarify` recovers `sdd/{change}/spec`,
   runs a taxonomy-driven residual-ambiguity scan (unresolved
   `[NEEDS CLARIFICATION]` markers + taxonomy-classified ambiguities), runs
   bounded Q&A capped at `rules.clarification.max_markers_per_spec` (default 3)
   per spec file, **writes resolutions back in place** into the same spec
   file(s) and re-saves `sdd/{change}/spec`, then **re-validates**
   `checklists/requirements.md`. Boundary: it targets only post-spec residual
   ambiguity, never re-asking resolved `requirements-interview` questions.
3. **Design**: `sdd-design` reads the now-clarified spec (same path/key),
   surfaces upstream `handoffHints`, runs the Constitution Check self-review,
   produces always-present `design.md`, and — only if
   `rules.design.sub_artifacts` is on AND the change meets
   `complexity_threshold` — MAY produce `research.md` / `data-model.md` /
   `contracts/` / `quickstart.md`.
4. **Tasks**: `sdd-tasks` may emit `[P]` after the `N.M` number on
   intra-phase, same-agent, dependency-free tasks when
   `rules.tasks.parallel_markers` is on.
5. **Execute**: `executing-plans`, when the toggle is on, dispatches contiguous
   `[P]` same-role tasks within a phase as an explicit parallel batch
   (recommending worktree isolation for overlapping writers); otherwise falls
   back to today's implicit grouping. Sub-artifacts and `[P]` are tolerated as
   absent by all downstream consumers.

## File Changes

### Created

- **ADD** `src/skills/sdd-clarify/SKILL.md` — new phase skill. Frontmatter
  `name: sdd-clarify` + description. Mirrors `sdd-spec`/`sdd-design` structure:
  Shared Conventions block (links to the three `_shared` convention files),
  Persistence Mode block, When to Use, Prerequisites (`change-name`, spec
  artifact, `checklists/requirements.md`), Workflow:
  (1) read conventions; (2) recover `sdd/{change}/spec` via the recall funnel;
  (3) **taxonomy scan** — defined ambiguity taxonomy (e.g. ambiguous quantifiers,
  undefined terms, missing error/edge behavior, unresolved decision forks,
  underspecified data shapes, unstated non-functional bounds) plus unresolved
  `[NEEDS CLARIFICATION]` markers, producing candidates; (4) **bounded Q&A**
  capped at `rules.clarification.max_markers_per_spec` per spec file (cap 3,
  >3 candidates -> at most 3 resolved); (5) **write-back in place** into the
  delta spec file(s) and re-save `sdd/{change}/spec` (hybrid/thoth-mem);
  (6) **re-validate** `checklists/requirements.md`; (7) declare `handoffHints`
  for design. Boundary section: no duplication of upfront
  `requirements-interview`. Output Format (Change / Artifact: clarified spec /
  Topic Key: `sdd/{change}/spec` / Resolved: list / Next Step: `sdd-design`).
  Rules section.

### Modified — compiled (TypeScript)

- **MODIFY** `src/harness/core/sdd.ts` — add `'clarify'` to `SddPhaseId`; insert
  the `clarify` phase entry; insert `'clarify'` into `FULL_SDD_PHASE_ORDER`
  between `spec` and `design`; renumber `order` for `design`..`archive` (+1);
  set `design.prerequisites = ['proposal', 'clarify']`. No `getSddWorkflowContract`
  change (handoffHints clone already exists).
- **MODIFY** `src/harness/core/sdd.test.ts` — see Testing Strategy.
- **MODIFY** `src/agents/prompt-sections.ts` — add `sdd-clarify ->
  ${primarySddRole('clarify')}` to `renderSddDelegationMatrix()` between spec and
  design entries; update the `Full SDD:` route prose line to insert `clarify`
  between `spec` and `design`.
- **MODIFY** `src/agents/prompt-rendering.test.ts` — assert the matrix contains
  the `sdd-clarify` routing entry (see Testing).
- **MODIFY** `src/agents/index.test.ts` — update the route-order regex at the SDD
  awareness assertion to expect `spec -> clarify -> design -> tasks` (the current
  `/propose\s*->\s*spec\s*->\s*design\s*->\s*tasks/i` breaks on insertion).
- **MODIFY** `src/sdd/artifact-governance/tasks-validator.test.ts` — add `[P]`
  acceptance + (optional) sub-artifact-absence tolerance assertions (see
  Testing).

### Modified — skills + conventions + config (markdown/yaml)

- **MODIFY** `src/skills/sdd-tasks/SKILL.md` — document the optional `[P]` marker
  placed AFTER the `N.M` number (`- [ ] 2.1 [P] Title`), gated by
  `rules.tasks.parallel_markers`; emit only on intra-phase, dependency-free,
  same-agent tasks; preserve `N.M` + `[USN]`; no flat `T001`. Add a `[P]` line to
  the template example.
- **MODIFY** `src/skills/executing-plans/SKILL.md` — at the Phase 2 grouping
  logic, consume `[P]` (toggle-gated) as an explicit parallel batch within a
  phase for same-role tasks; recommend worktree isolation for overlapping
  writers; tolerate absent `[P]` (fall back to implicit grouping).
- **MODIFY** `src/skills/sdd-design/SKILL.md` — add an Optional Sub-Artifacts
  section: gate = `rules.design.sub_artifacts` AND `complexity_threshold`
  (config gates, author selects within the gate); `design.md` always produced;
  name `research.md` / `data-model.md` / `contracts/` / `quickstart.md`; cite the
  `checklists/` subdir precedent for `contracts/`. Note clarify now precedes
  design (consume the clarified spec).
- **MODIFY** `src/skills/_shared/openspec-convention.md` — (1) add `clarify` to
  the directory-structure/lifecycle prose; (2) document optional sub-artifacts in
  the Canonical Artifacts table + directory structure (`research.md`,
  `data-model.md`, `contracts/`, `quickstart.md` as optional, gated); (3) add a
  Parallel Task Markers note (`[P]` syntax, placement after `N.M`, toggle); (4)
  update the documented `config.yaml` shape with `rules.tasks.parallel_markers`,
  `rules.design.sub_artifacts`, `rules.design.complexity_threshold`.
- **MODIFY** `openspec/config.yaml` — convert `rules.design` to `guidance:` form
  and add `sub_artifacts: false` + `complexity_threshold`; add
  `parallel_markers: false` under `rules.tasks`.
- **MODIFY** `src/skills/sdd-init/SKILL.md` — extend the emitted `config.yaml`
  template + the mechanism-section backfill list to include the three new toggles
  (additive, idempotent), so realignment backfills them on stale projects.
- **MODIFY** `src/skills/sdd-spec/SKILL.md` — add a one-line note that residual
  ambiguity surfacing after spec is resolved by the new `sdd-clarify` phase
  (boundary alignment; no behavior change to spec authoring).

> No harness *dialect* file changes. All cross-harness logic lives in
> `_shared/*.md`, `sdd.ts`, and `prompt-sections.ts` (itself harness-agnostic);
> `src/agents/prompt-dialects.ts` is untouched. The only per-harness prose is the
> capability-gap reporting the conventions already define (e.g. a harness without
> concurrent dispatch treats `[P]` as an annotated sequential batch).

## Interfaces / Contracts

- **`SddPhaseId`** gains `'clarify'`.
- **`clarify` phase**: `order: 5`, `requiredFor: ['full']`,
  `prerequisites: ['spec']`, `producesArtifact: false`, `owner:
  'write-capable-agent'`, `artifactSkill: 'sdd-clarify'`, `defaultAgentRole:
  'deep'`, `supportingAgentRoles: ['oracle']`, `handoffHints: [...]`.
- **`design.prerequisites`** = `['proposal', 'clarify']`.
- **`[P]` token** — placed after `N.M`: `- [ ] N.M [P] Title`; gated by
  `rules.tasks.parallel_markers` (default false).
- **Sub-artifacts** — `research.md`, `data-model.md`, `contracts/` (subdir),
  `quickstart.md` under `openspec/changes/{change-name}/`; gated by
  `rules.design.sub_artifacts` + `rules.design.complexity_threshold`.
- **Config switches** — `rules.tasks.parallel_markers`,
  `rules.design.sub_artifacts`, `rules.design.complexity_threshold`;
  clarify reuses `rules.clarification.max_markers_per_spec`.
- **Clarify write-back** — in-place edit of
  `openspec/changes/{change}/specs/{domain}/spec.md`, re-saved under
  `sdd/{change}/spec` (no new artifact/key).

## Testing Strategy

- **`src/harness/core/sdd.test.ts`** (compiled, authoritative):
  - update `models the full SDD phase order` to expect `clarify` between `spec`
    and `design` in `FULL_SDD_PHASE_ORDER` / `getRequiredSddPhaseOrder('full')`.
  - new: `getSddPhase('clarify')` matches `{ requiredFor: ['full'],
    prerequisites: ['spec'], producesArtifact: false, owner:
    'write-capable-agent', artifactSkill: 'sdd-clarify', defaultAgentRole:
    'deep' }` and exposes non-empty `handoffHints`.
  - new: `getSddPhase('design').prerequisites` equals `['proposal', 'clarify']`;
    `canEnterSddPhase({ pipeline: 'full', target: 'design', completed: [...,
    'spec'] })` is `false` and becomes `true` only after `clarify` completes.
  - new: accelerated pipeline order does NOT contain `clarify`
    (`getRequiredSddPhaseOrder('accelerated')`).
  - regression: existing gate (`oracle-review`/`user-confirmation`/
    `iterative-verify`), role, and `handoffHints` optionality assertions stay
    green (orders shifted but ids/gates unchanged).
- **`src/agents/prompt-rendering.test.ts`**: assert the rendered
  `<sdd-delegation-matrix>` contains a `sdd-clarify ->` routing entry (and the
  correct default role token, e.g. `@deep`).
- **`src/agents/index.test.ts`**: replace the route-order regex with one
  expecting `spec -> clarify -> design -> tasks`.
- **`src/sdd/artifact-governance/tasks-validator.test.ts`**: new test — a task
  line with `[P]` after the number (`- [ ] 2.1 [P] Title`) is accepted
  (no `tasks.malformed-numbering`); confirms `[P]` placement is back-compatible
  with the existing `TASK_NUMBERING` regex. (No validator source change required;
  if `[P]`-before-number support is later desired, that is a separate change.)
- **Skill-contract checks** (markdown, reviewer/grep): each new mechanism's prose
  names its config switch and the convention documents every new `rules:` key so
  doc and `config.yaml` match.
- **Config validity**: `openspec/config.yaml` parses as YAML and matches the
  convention's documented shape.

## Migration / Rollout

- Every mechanism is additive/optional and default-disabled. Legacy `tasks.md`
  without `[P]` executes unchanged; changes with only `design.md` consume
  cleanly; the `clarify` phase is full-pipeline only and produces no new
  artifact, so accelerated/direct pipelines are unaffected.
- The `config.yaml` rewrite is behavior-safe (nothing parses it at runtime);
  absent toggles default to disabled.
- Each mechanism is independently revertable (proposal Rollback Plan): removing a
  toggle, the `sdd-clarify` skill + phase entry, or the `[P]`/sub-artifact skill
  sections restores prior behavior with no change to main specs or archived
  changes.
- Ship order: the `clarify` phase (compiled `sdd.ts` + tests +
  `prompt-sections.ts` + new skill) is the highest-risk piece (phase reorder);
  land it with its tests first, then the `[P]` and sub-artifact skill/config
  additions.

### Verification plan

Authoritative gate is `pnpm run lint` and `pnpm test` (AGENTS.md / CI order:
`pnpm run lint`, `pnpm run typecheck`, `pnpm run build`, `pnpm test`).

1. `pnpm run typecheck` — confirms the `SddPhaseId` union + phase entry compile.
2. `pnpm run lint` — Biome.
3. Targeted vitest first: `pnpm test src/harness/core/sdd.test.ts`,
   `pnpm test src/agents/prompt-rendering.test.ts`,
   `pnpm test src/agents/index.test.ts`,
   `pnpm test src/sdd/artifact-governance/tasks-validator.test.ts`.
4. `pnpm test` — full suite.
5. Cross-platform scan (NOT a POSIX `python`/`grep` step — the prior change's
   POSIX verify step can fail on Windows/PowerShell): use the repo `Grep` tool
   (ripgrep) to confirm `clarify` appears in `sdd.ts`, the matrix, and the
   route prose, and that `parallel_markers` / `sub_artifacts` /
   `complexity_threshold` appear in `config.yaml` and the convention doc. This
   replaces any shell-specific verify recipe.

## Open Questions

- Whether `complexity_threshold` should later become a runtime-computed score
  (requires a config parser, currently out of scope) instead of an
  author-evaluated declarative trigger set. Deferred: author-evaluated triggers
  satisfy every spec scenario and match the no-parser model.
- Whether `tasks.prerequisites` should explicitly list `'clarify'` in addition
  to `'design'`. Deferred: redundant since `design` requires `clarify`; left as
  a possible later tightening.
- Whether `tasks-validator` should natively understand `[P]` (strip it before
  numbering) to allow `[P]`-before-number placement. Deferred: the after-number
  placement is back-compatible today; native support is a separate hardening.

## Constitution Check (self-review)

Evaluated against the five native principles in
`openspec/memory/constitution.md`:

- **Delegate-first coordination** — UPHELD: `clarify` routes through the existing
  delegation matrix (`primarySddRole('clarify')`); no new coordination path.
- **Read-only role boundaries** — UPHELD: `clarify` is `write-capable-agent`
  (`deep`) editing only the spec/checklist it owns; `oracle` stays read-only
  support; `[P]` does not let `executing-plans` cross role boundaries.
- **Governed persistence** — UPHELD: write-back reuses the canonical
  `sdd/{change}/spec` key and OpenSpec path (no new store/key); sub-artifacts use
  canonical change-dir paths.
- **Multi-harness parity** — UPHELD: all three mechanisms live in shared modules
  (`sdd.ts`, `prompt-sections.ts`, `_shared/*`, per-phase skills) with zero
  dialect handling; capability gaps are reported, not branched.
- **Evidence-led verification** — UPHELD: phase-order/prereq changes are
  test-covered; clarify re-validates the checklist; `[P]` placement is
  validator-tested.

No principle is violated; no constitution version bump is required. Per
`rules.constitution.enforce_check`, the gate does not block.
