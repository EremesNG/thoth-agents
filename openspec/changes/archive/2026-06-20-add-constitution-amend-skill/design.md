# Design: Add Constitution Amendment Skill (`sdd-constitution`)

## Technical Approach

Like the prior spec-kit adoptions, this is a **contract-and-convention** change,
not a runtime-code change. There is no data model and no API surface. The
deliverable is delivered through the same shared surfaces, so OpenCode, Claude
Code, and Codex inherit identical behavior with zero dialect-specific handling:

- **One new harness-neutral skill** `src/skills/sdd-constitution/SKILL.md` — the
  guided amendment workflow agents follow. Its ONLY runtime write target is the
  end-user project file `openspec/memory/constitution.md`.
- **Shared convention markdown** `src/skills/_shared/openspec-convention.md` —
  the single layer where the amendment doctrine, the DRY auto-suggest snippet,
  and the read-only-asset / report-only-propagation rules are defined once and
  cited by the two trigger skills.
- **Two hook skills** `src/skills/sdd-verify/SKILL.md` and
  `src/skills/sdd-archive/SKILL.md` — each gains a report-only, non-blocking
  auto-suggest step that REFERENCES the shared snippet (no inlined duplicate
  prose).
- **One compiled registry edit** `src/harness/core/skills.ts` — a new
  `BUNDLED_SKILL_REGISTRY` entry making the skill discoverable and invocable.
  This is the only compiled surface touched.
- **One test edit** `src/cli/custom-skills.test.ts` — a registration assertion
  for the new entry (the registry is projected into `CUSTOM_SKILLS`).

Critically, the skill is NOT a pipeline phase: it is deliberately NOT added to
`src/harness/core/sdd.ts` (`SddPhaseId`, `FULL_SDD_PHASE_ORDER`,
`ACCELERATED_SDD_PHASE_ORDER`, `SDD_PHASES`) nor to the delegation matrix in
`src/agents/prompt-sections.ts`. It is a standalone `ORCHESTRATOR_ONLY`
governance skill (spec Assumption c). Each piece is additive and independently
revertable; absence of the skill leaves today's creation + enforcement behavior
unchanged.

### Complexity-gated sub-artifacts: NOT warranted

Per the `sdd-design` sub-artifact gating (`rules.design.sub_artifacts` AND
`rules.design.complexity_threshold`), this change is a markdown-doc + small
registry/test edit. It crosses none of the eligibility triggers in a way that
adds value:

- **`research.md`** — NOT needed. No unresolved external tech/library choice; the
  approach (skill markdown + registry entry) is fully determined by existing
  repo patterns and the resolved spec Assumptions.
- **`data-model.md`** — NOT needed. No data shape; the only persisted artifact is
  the existing constitution file's existing header/Sync-Impact shape.
- **`contracts/`** — NOT needed. No interfaces to pin; the one TS touchpoint is a
  registry literal that already conforms to `SkillRegistryEntry`.
- **`quickstart.md`** — NOT needed. No runnable smoke path beyond the existing
  `pnpm test` registration assertion.

`design.md` (this file) is the sole design artifact.

## Architecture Decisions

### Decision (a): `sdd-constitution` is a standalone `ORCHESTRATOR_ONLY` registry skill, NOT an SDD pipeline phase

**Choice**: Register the skill only in `BUNDLED_SKILL_REGISTRY`
(`src/harness/core/skills.ts`). Do NOT touch `src/harness/core/sdd.ts` or
`src/agents/prompt-sections.ts`. The skill is discoverable and explicitly
invocable, and surfaced opportunistically via the two report-only hooks.

**Alternatives considered**:
- *Add a `constitution` phase to `FULL_SDD_PHASE_ORDER`* — rejected: governance
  amendment is not a per-change pipeline step; inserting it would force a phase
  on every change, require a prerequisite renumber (the costly part of the prior
  `clarify` change), and contradict spec Assumption (c) and the
  "Skill is absent from the pipeline phase order" scenario.

**Rationale**: Minimal compiled change (one registry literal), matches the spec
requirement "MUST NOT be inserted into `FULL_SDD_PHASE_ORDER` ... because
governance amendment is not a per-change pipeline phase," and keeps the
delegation matrix unchanged.

### Decision (b): The auto-suggest snippet is authored ONCE in `_shared/openspec-convention.md` and referenced (not inlined) by `sdd-verify` and `sdd-archive`

**Choice**: Add a named, quotable snippet block to the Constitution Governance
section of `src/skills/_shared/openspec-convention.md`. `sdd-verify` and
`sdd-archive` each add a short step that says "emit the shared
constitution-amendment auto-suggest snippet (see `_shared/openspec-convention.md`
> Constitution Governance > Amendment Auto-Suggest) when the governance-touched
heuristic matches," rather than restating the wording.

**Alternatives considered**:
- *Inline the suggestion text in each hook skill* — rejected: guarantees
  wording drift between the two trigger points (proposal Risk "Auto-suggest
  drift"); the spec resolves Assumption (b) to a single `_shared` definition.

**Rationale**: DRY, single source of truth, drift-proof. It does not violate the
read-only-asset model: the shared convention is an in-repo source asset; at
runtime the skills only READ the doctrine to emit advisory text — no asset is
written (spec Assumption b).

### Decision (c): The skill's ONLY runtime write target is `openspec/memory/constitution.md`; propagation is report-only

**Choice**: The skill prose hard-constrains writes to the end-user constitution
file. It never edits another `SKILL.md`, any file under `src/`, or any template.
Because the enforcement gates (`sdd-design`, `plan-reviewer`) read the
constitution LIVE, there are no static principle copies to realign; the
Sync-Impact Report entry only DOCUMENTS which gates consume the changed
principles and FLAGS in-flight `design.md` / `tasks.md` for human re-review.

**Alternatives considered**:
- *Spec-kit-style Consistency Propagation Checklist that edits dependent
  templates* — rejected: bundled skills are READ-ONLY assets when installed in a
  harness; our live-read enforcement means there is nothing to propagate. Editing
  a dependent asset is the key risk this design must foreclose.

**Rationale**: Respects installed-asset integrity and the live-read architecture;
satisfies the "Attempt to realign a dependent skill is refused" and
"Constitution file is the sole write target" scenarios.

### Decision (d): Semver classification is a human-confirmed blocking input; no runtime parser, no auto-bump

**Choice**: The Workflow classifies the proposed change as MAJOR / MINOR / PATCH
per the documented policy and presents it for confirmation through the harness
blocking-input surface (AskUserQuestion-equivalent) BEFORE any version write. No
runtime parser selects the bump; no version is written without explicit
confirmation; a determination of "no change warranted" yields a reported no-op.

**Rationale**: Satisfies "Human-Confirmed Semver Classification" and "Idempotent
No-Op" requirements; mitigates the semver-misclassification risk by keeping the
decision human-owned (proposal Risk "Semver misjudgment").

### Decision (e): Governance-touched heuristic is broad and low-false-negative; false positives are acceptable because the suggestion is advisory

**Choice**: Encode the spec Assumption (a) heuristic in the shared snippet's
preamble. The hook fires when ANY of: (1) the change's `proposal.md`
Impact/Affected Areas, `design.md`, `tasks.md`, or delta `spec.md` reference
`openspec/memory/constitution.md`, "the constitution," or a named principle;
OR (2) the change modifies `src/skills/_shared/openspec-convention.md`
(Constitution Governance) or `openspec/memory/constitution.md` itself; OR
(3) any artifact names a constitution principle by title.

**Rationale**: Advisory-only output means a misfire is low-impact (a human
decides), so the broad heuristic favoring false positives over false negatives
is the defensible default (spec Assumption a; proposal Risk "Suggestion
misfire").

### Decision (f): No `openspec/config.yaml` change

**Choice**: Do not touch `openspec/config.yaml`. The `constitution` section
already exists (`path`, `enforce_check`, `version_policy: semver`), and a
report-only design needs no new toggle. `enforce_check` continues to gate the
separate Constitution Check, which this change does not alter.

**Rationale**: Satisfies the "No new `config.yaml` toggle" exclusion; the
existing `version_policy: semver` already declares the bump policy this skill
follows.

## Data Flow

1. **Trigger** — either explicit invocation of `sdd-constitution`, OR a
   report-only suggestion surfaced by `sdd-verify` / `sdd-archive` when the
   governance-touched heuristic matches a completed change. The suggestion never
   blocks verification or archival.
2. **Load** — the skill reads `openspec/memory/constitution.md` (existing
   `Version:` / `Ratified:` / `Last-Amended:` header and `## Sync-Impact Report`).
3. **Determine change** — the human-described principle change is summarized; if
   none is warranted, the skill reports a no-op and stops (no edit).
4. **Classify + confirm** — classify MAJOR/MINOR/PATCH and present via the
   blocking-input surface; no write until confirmed.
5. **Apply (constitution file only)** — bump `Version:`, set `Last-Amended:` to
   the current date, and PREPEND one `## Sync-Impact Report` entry in the format
   `- X.Y.Z | change type | principles touched | downstream gates/artifacts affected`,
   preserving all prior content and entries.
6. **Report-only propagation** — the entry names the consuming gates
   (`sdd-design`, `plan-reviewer`) and flags any in-flight `design.md` /
   `tasks.md` referencing now-changed principles for human re-review; no
   dependent asset is edited.
7. **Persist per mode** — `hybrid`: write the file AND record a governance
   observation; `thoth-mem`: record the observation only (no `openspec/` write);
   `openspec`: write the file only.

## File Changes

### Created

- **ADD** `src/skills/sdd-constitution/SKILL.md` — the guided amendment skill.
  Full section outline (canonical SKILL.md anatomy):

  - **YAML front-matter**:
    ```yaml
    ---
    name: sdd-constitution
    description: Guide a semver constitution amendment and Sync-Impact Report entry.
    metadata:
      author: thoth-agents
      version: 1.0.0
    ---
    ```
  - **H1 + one-liner**: `# SDD Constitution Skill` + a sentence stating it
    performs a guided, human-confirmed amendment of
    `openspec/memory/constitution.md` ONLY.
  - **## Shared Conventions** — links to
    `../_shared/openspec-convention.md`, `../_shared/persistence-contract.md`,
    `../_shared/thoth-mem-convention.md`.
  - **## Persistence Mode** — standard `thoth-mem` / `openspec` / `hybrid` block
    copied from peer skills.
  - **## When to Use** — a principle must be added/redefined/removed or guidance
    clarified; OR a report-only suggestion from `sdd-verify`/`sdd-archive`
    flagged a governance-touching change.
  - **## Prerequisites** — `change-name` (optional context; the skill may run
    standalone), an existing `openspec/memory/constitution.md` (bootstrapped by
    `sdd-init`), and a human-described principle change.
  - **## Workflow** (numbered):
    1. Read the shared conventions (esp. Constitution Governance).
    2. Load `openspec/memory/constitution.md`; if absent, instruct running
       `sdd-init` first (do not create it here).
    3. Determine the principle change from the human description; if none is
       warranted, report a no-op and stop.
    4. Classify the bump (MAJOR=remove/redefine; MINOR=add/expand;
       PATCH=clarify) and CONFIRM via the harness blocking-input surface; do
       not write before confirmation; never use a runtime parser.
    5. Apply to the constitution file ONLY: bump `Version:`, set `Last-Amended:`
       to the current date, and PREPEND one Sync-Impact Report entry in the
       canonical format; preserve all existing content and prior entries.
    6. Emit REPORT-ONLY impact: name the live-read consuming gates
       (`sdd-design`, `plan-reviewer`) and FLAG any in-flight change
       `design.md` / `tasks.md` referencing now-changed principles for human
       re-review — do NOT edit them.
    7. Persist per selected mode (file and/or governance observation).
  - **## Output Format** — `Constitution Version` (old -> new), `Bump`
    (MAJOR/MINOR/PATCH or no-op), `Sync-Impact Entry` (the prepended line),
    `Consuming Gates`, `In-Flight Artifacts Flagged`, `Files Written` (only
    `openspec/memory/constitution.md` or none), `Status` (amended or no-op).
  - **## Rules** (hard MUST-NOTs):
    - NEVER edit, create, or delete any other `SKILL.md`, any file under `src/`,
      or any bundled/template asset — the ONLY writable target is
      `openspec/memory/constitution.md`.
    - NEVER auto-bump: no runtime parser; no version write without explicit
      human confirmation.
    - No-op when no principle change is warranted; report it, write nothing.
    - Preserve all existing constitution content and ALL prior Sync-Impact
      Report entries; only prepend the new entry and update version/date.
    - Propagation is report-only: document consuming gates and flag in-flight
      artifacts; never auto-fix them.

  Exact registry description string (MUST match `skills.ts` byte-for-byte):
  `Guide a semver constitution amendment and Sync-Impact Report entry.`

### Modified — compiled (TypeScript)

- **MODIFY** `src/harness/core/skills.ts` — add one `BUNDLED_SKILL_REGISTRY`
  entry. Insert at the end of the array (after the `sdd-archive` entry, near
  line 147, before the closing `]` at line 148), preserving ordering with the
  other `sdd-*` skills:
  ```ts
  {
    name: 'sdd-constitution',
    description:
      'Guide a semver constitution amendment and Sync-Impact Report entry.',
    allowedRoles: ORCHESTRATOR_ONLY,
    sourcePath: 'src/skills/sdd-constitution',
    kind: 'skill',
    purpose: 'sdd',
  },
  ```

### Modified — tests

- **MODIFY** `src/cli/custom-skills.test.ts` — add a registration assertion
  mirroring the existing `sdd-init` / `executing-plans` blocks (place alongside
  them, ~after line 92). The projected `CUSTOM_SKILLS` shape uses `allowedAgents`
  (not `allowedRoles`) and omits `kind`/`purpose`:
  ```ts
  test('registers the sdd-constitution skill for orchestrator use', () => {
    expect(CUSTOM_SKILLS).toContainEqual({
      name: 'sdd-constitution',
      description:
        'Guide a semver constitution amendment and Sync-Impact Report entry.',
      allowedAgents: ['orchestrator'],
      sourcePath: 'src/skills/sdd-constitution',
    });
  });
  ```
  The `description` string MUST equal the `skills.ts` entry exactly.

### Modified — skills + conventions (markdown)

- **MODIFY** `src/skills/_shared/openspec-convention.md` — extend the
  **Constitution Governance** section (currently lines ~208-249, after the
  existing `Constitution Check gate` bullet and before
  `### config.yaml mechanism-section backfill`). Add THREE prose blocks:

  1. **Amendment workflow doctrine** (new bullet/sub-section
     `### Constitution Amendment`): the guided, human-confirmed semver bump
     (reusing the existing Semver bump policy bullet), the `Last-Amended` update,
     and the prepended `## Sync-Impact Report` entry format
     `- X.Y.Z | change type | principles touched | downstream gates/artifacts affected`.
     State the amendment is performed by the `sdd-constitution` skill, that the
     ONLY writable target is `openspec/memory/constitution.md`, and that the bump
     is human-confirmed via the blocking-input surface (no runtime parser, no
     auto-bump, no-op when no change).
  2. **Read-only-asset + report-only-propagation doctrine** (new sub-section
     `### Read-Only Assets and Report-Only Propagation`): bundled skills are
     read-only when installed; the amendment skill MUST NOT edit any other
     `SKILL.md`, any `src/` file, or any template. Because enforcement gates read
     the constitution LIVE, there are no static principle copies to realign; the
     Sync-Impact entry documents the consuming gates (`sdd-design`,
     `plan-reviewer`) and flags in-flight `design.md` / `tasks.md` for human
     re-review instead of editing them.
  3. **Shared auto-suggest snippet** (new sub-section
     `### Amendment Auto-Suggest (shared snippet)`): the single canonical,
     quotable text that `sdd-verify` and `sdd-archive` both reference. It states
     the governance-touched heuristic (spec Assumption a) and the advisory,
     non-blocking suggestion. Proposed snippet text:
     > **Constitution amendment auto-suggest (report-only).** A completed change
     > is "governance-touching" when ANY holds: its `proposal.md` Impact/Affected
     > Areas, `design.md`, `tasks.md`, or delta `spec.md` reference
     > `openspec/memory/constitution.md`, "the constitution," or a named
     > principle; OR it modifies `src/skills/_shared/openspec-convention.md`
     > (Constitution Governance) or `openspec/memory/constitution.md`; OR any
     > artifact names a constitution principle by title. When governance-touching,
     > surface a NON-BLOCKING suggestion: "This change touched governance/
     > principles — consider running `sdd-constitution` to record a constitution
     > amendment." This suggestion is advisory only; it MUST NOT block
     > verification or archival.

- **MODIFY** `src/skills/sdd-verify/SKILL.md` — insert a report-only auto-suggest
  step into the Workflow. Place it as a new step after the current step 8 (the
  `round N` stamping step, ~line 99-102), before `## Output Format` (~line 104):
  > 9. Apply the governance-touched heuristic from
  >    `_shared/openspec-convention.md` > Constitution Governance >
  >    Amendment Auto-Suggest. When it matches, surface the shared report-only
  >    `sdd-constitution` suggestion. This is advisory and MUST NOT change the
  >    verdict or block verification.

  Reference the shared snippet — do NOT restate the heuristic or suggestion text.
  Optionally add a one-line `## Output Format` field
  `Constitution Suggestion: surfaced or none`.

- **MODIFY** `src/skills/sdd-archive/SKILL.md` — insert a report-only auto-suggest
  step into the Workflow after step 6 (the audit-trail report, ~line 58-59),
  renumbering the existing thoth-mem steps 7/8 accordingly:
  > 7. Apply the governance-touched heuristic from
  >    `_shared/openspec-convention.md` > Constitution Governance >
  >    Amendment Auto-Suggest. When it matches, surface the shared report-only
  >    `sdd-constitution` suggestion. This is advisory and MUST NOT block
  >    archival.

  Reference the shared snippet — do NOT restate it. Optionally add an
  `## Output Format` field `Constitution Suggestion: surfaced or none`.

### Unchanged (explicit)

- **NO change** to `openspec/config.yaml` — Decision (f): report-only design; the
  `constitution` section and `version_policy: semver` already exist.
- **NO change** to `src/harness/core/sdd.ts`, `src/agents/prompt-sections.ts`, or
  any pipeline-phase/delegation-matrix surface — Decision (a): standalone skill.
- **NO change** to enforcement-gate logic in `sdd-design` / `plan-reviewer`.

## Interfaces / Contracts

- **`BUNDLED_SKILL_REGISTRY` entry** — `name: 'sdd-constitution'`,
  `description: 'Guide a semver constitution amendment and Sync-Impact Report entry.'`,
  `allowedRoles: ORCHESTRATOR_ONLY` (`['orchestrator']`),
  `sourcePath: 'src/skills/sdd-constitution'`, `kind: 'skill'`, `purpose: 'sdd'`.
  Already conforms to the existing `SkillRegistryEntry` interface — no type
  change.
- **`CUSTOM_SKILLS` projection** — exposes `{ name, description, allowedAgents,
  sourcePath }` (`allowedRoles` -> `allowedAgents`; `kind`/`purpose` dropped).
  The test asserts this projected shape.
- **Sync-Impact Report entry format** (existing, reused) —
  `- X.Y.Z | change type | principles touched | downstream gates/artifacts affected`.
- **Single runtime write target** — `openspec/memory/constitution.md` only.
- **Shared snippet anchor** — `_shared/openspec-convention.md` >
  Constitution Governance > Amendment Auto-Suggest, referenced by `sdd-verify`
  and `sdd-archive`.

## Testing Strategy

- **`src/cli/custom-skills.test.ts`** (authoritative for registration): the new
  `toContainEqual` assertion confirms the projected `sdd-constitution` entry with
  the exact description string and `allowedAgents: ['orchestrator']`.
- **`pnpm run typecheck`** — the new registry literal must satisfy
  `satisfies readonly SkillRegistryEntry[]` (purpose/kind unions).
- **Markdown/doc consistency (reviewer + Grep)**: confirm the registry
  description string is byte-identical in `skills.ts`, `custom-skills.test.ts`,
  and the SKILL.md front-matter `description`; confirm both hook skills reference
  the shared snippet anchor and do NOT inline the suggestion text; confirm
  `sdd-constitution` does NOT appear in `sdd.ts` phase orders or the delegation
  matrix.
- **No new compiled behavior** — no `sdd.test.ts` / `prompt-rendering.test.ts`
  changes are required (the skill is not a phase and not in the matrix).

### Verification plan (CI order, AGENTS.md)

1. `pnpm run lint` — Biome.
2. `pnpm run typecheck` — registry literal compiles.
3. `pnpm test src/cli/custom-skills.test.ts` — registration assertion (targeted).
4. `pnpm run build` — bundle includes the new skill source.
5. `pnpm test` — full suite.
6. Cross-platform scan with the repo `Grep` tool (NOT POSIX shell): description
   string parity across the three files; both hooks reference the shared snippet;
   no `sdd-constitution` in `sdd.ts`/matrix.

## Migration / Rollout

- Fully additive and default-on-discovery only (the skill does nothing unless
  invoked or its advisory suggestion is acted on). No phase, no toggle, no
  enforcement change, so accelerated/direct pipelines and existing changes are
  unaffected.
- Ship order (lowest-risk first): (1) author `SKILL.md`; (2) add the registry
  entry + the `custom-skills.test.ts` assertion together (they must agree);
  (3) extend `_shared/openspec-convention.md` with the three blocks; (4) add the
  two hook steps referencing the shared snippet. The critical invariant
  throughout: the only runtime write target is `openspec/memory/constitution.md`.
- Each piece is independently revertable (proposal Rollback Plan): delete the
  skill dir, remove the registry entry + assertion, revert the convention and
  hook additions — prior behavior is restored with no spec/archive/config/gate
  change.

## Open Questions

- None blocking. The three spec deferred items (a/b/c) are resolved by the spec's
  `## Assumptions` and adopted verbatim here (broad low-false-negative heuristic;
  DRY `_shared` snippet; standalone non-phase skill).

## Constitution Check (self-review)

Evaluated against the five native principles in
`openspec/memory/constitution.md`:

- **Delegate-first coordination** — UPHELD: registered `ORCHESTRATOR_ONLY`,
  discoverable/invocable through the existing registry; no new coordination path.
- **Read-only role boundaries** — UPHELD: the skill's single runtime write target
  is the end-user constitution file; it is explicitly forbidden from editing any
  bundled asset; the two hooks only READ shared doctrine to emit advisory text.
- **Governed persistence** — UPHELD: the only write target is the canonical
  `openspec/memory/constitution.md`; thoth-mem observations follow the
  persistence contract; no improvised store/key.
- **Multi-harness parity** — UPHELD: skill, shared doctrine, and snippet live in
  shared layers with zero dialect handling; behavior is identical across
  OpenCode, Claude Code, and Codex.
- **Evidence-led verification** — UPHELD: registration is test-covered; doc
  parity and the absence-from-phase-order invariant are reviewer/Grep-verified.

No principle is violated; no constitution version bump is required for THIS
change (it only adds the MECHANISM by which future amendments occur). Per
`rules.constitution.enforce_check`, the gate does not block.
