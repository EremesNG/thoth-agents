# SDD and bundled skills

This surface owns mandatory proportional understanding, post-understanding
classification, one ID-named record for substantial work, independent judgment,
and transactional `.thoth` deltas. Read the [public pipeline guide](../sdd-pipeline.md)
for the end-to-end lifecycle.

## Entrypoints

- `src/harness/core/sdd.ts`: understanding and phase contracts, semantic scope,
  risk-aware classification, phase prerequisites, and verification decisions.
- `src/agents/prompt-sections.ts`: root SDD and bounded phase-dispatch guidance.
- `skills/thoth-sdd/`: current phase references, ID-named record template, and
  maintained readiness/closeout validator.
- `skills/thoth-archive/`: transactional declared `.thoth/specs` updates and
  stable-filename archive.
- `skills/thoth-constitution/`: explicit versioned governance lifecycle.
- `skills/thoth-init/`: offline, preserving initialization of minimum `.thoth`
  governance.
- `skills/plan-reviewer/`: optional blocker-focused fresh read-only review.
- `src/harness/core/owned-skills.ts`: shared owned-skill inventory consumed by
  OpenCode, Codex, Claude Code, and Pi.
- `.thoth/constitution.md` and `.thoth/specs/`: active project governance and
  durable product contracts; `.thoth/history/openspec/` is historical only.

## Invariants

- Every change completes proportional `explore -> specify -> clarify` before
  classification. These steps do not force documents, specialist dispatch, or
  interviews. Material human-owned uncertainty blocks classification.
- Classify only after understanding, using meaningful coordination and contract
  impact, uncertainty, and risk. File count alone does not increase scope; a
  clear low-risk localized mechanical change may touch several files and remain
  small. Coordinated multi-area or cross-cutting work, material uncertainty, or
  elevated risk requires substantial planning.
- Small work uses TDD and focused verification without a persistent record.
  Substantial work uses only `.thoth/changes/<id>/<id>.md`, with a safe lowercase
  kebab-case ID. No `change.md` alias, duplicate record, sidecar report, evidence
  directory, process script, wrapper, or evidence generator is permitted.
- Root owns classification, material decisions, the record, semantic acceptance,
  native dependency acceptance, and closeout. Worker and Designer are selected
  by task shape; one writer owns each mutable surface. Native execution/liveness
  remains authoritative.
- Bound useful work across evidence gathering and research, planning,
  implementation, and verification as one independently acceptable outcome per
  unit. Each unit states exact known entrypoints and skill paths, accepted inputs
  and dependencies, its output, owner, owned writes, interface boundaries
  including shared-resource limits, a focused check with observable PASS
  evidence, a return milestone, and a stop or reassessment condition. Read-only
  work says `none` for writes. Substantial task rows stay in the sole ID-named
  record.
- Use units only when they clarify real ownership or dependencies. A known lookup
  needs no invented discovery assignment. Independent precise Explorer questions
  may run in parallel within native capacity; a dependent question names the
  accepted producer output and starts after root accepts it. Keep tiny cohesive
  mechanical work together; do not split by phase, file, test step, or elapsed
  time. Set a meaningful native progress milestone; a generous timeout is not a
  substitute. Preserve configured effort, one writer per mutable surface, and
  native dispatch/liveness. Optional Oracle plan review stays at record level,
  never per unit, and separate from final verification.
- At substantial `ready`, first show the user a concise plan summary (goal,
  acceptance, key decisions, units, risks), then always offer
  `Review plan with Oracle (Recommended)` or `Proceed without review`, even when implementation is already authorized.
  Silence is never an explicit review skip; run a fresh review only when selected.
  After `[OKAY]`, separately offer the `Implement (Recommended)` / `Stop` choice;
  prior explicit authorization remains valid, while a later explicit `Stop`
  supersedes it. Review never grants authorization or replaces final verification.
- Every orchestrator choice with a meaningful recommended action states it.
  Track confirmed answerless native returns per question: repeat the same
  question after the first and second without dependent work, then select the
  recommendation after the third. Explicit answers and `Stop` win. Pending,
  unavailable, failed, interrupted, or host-prohibited attempts do not count;
  disclose higher-priority host limits without claiming three returns or an
  explicit choice. Never invent requested facts or secrets. For unresolved
  human-owned intent, recommend safe deferral so the choice remains open.
- Record plan-review provenance as `EXPLICIT_REVIEW`, `EXPLICIT_SKIP`, or
  `DEFAULT_REVIEW_AFTER_3`; `SKIPPED` is valid only with `EXPLICIT_SKIP`, while
  `OKAY` requires an explicit review or the third-return review default. The
  initial `PENDING` placeholder is valid before closeout only.
- Every change verifies. Small low-risk work receives focused checks; substantial
  or materially risky work requires fresh read-only Oracle judgment. Root maps
  acceptance to actual checks and changed source before PASS. Failed verification
  is corrected within accepted intent and reverified.
- Archive only after fresh PASS and complete closeout. Transactionally apply
  declared exact-title `ADDED`, `MODIFIED`, `REMOVED`, or `RENAMED` deltas under
  `.thoth/specs/`. Keep the record filename stable in
  `.thoth/changes/archive/YYYY-MM-DD-<id>/<id>.md`; preserve historical content.
- Initialization preserves existing project-owned `.thoth` content and creates
  only missing minimum paths. Routine work reads active constitution principles
  without amending lifecycle metadata. Historical `.thoth/history/openspec/`
  material is not active policy.
- SDD execution uses installed local contracts and existing project commands; it
  never invokes the product CLI, downloads contracts, installs skills, or creates
  auxiliary execution tooling. Provider memory remains independent from project
  work evidence.

## Work-unit examples

- **Parallel and dependent discovery:** Explorer A traces a named CLI option
  through its parser and tests to report accepted values. Explorer B checks the
  named installer and tests to list the files it writes. Their evidence can be
  accepted independently and gathered in parallel. An Explorer tracing whether
  that option controls those writes names both accepted outputs as inputs and
  waits until root accepts them. If the requested path or symbol is already
  known, inspect it directly instead of inventing a discovery task.
- **Worker and Designer outcomes:** A Worker owns a service contract and its
  focused behavior check; a Designer owns the screen states and accessibility
  behavior built against that accepted contract, with a separate UI check. The
  Designer names the Worker output as a dependency and starts after root accepts
  it. Split only when both results can be accepted on their own; keep a tiny,
  cohesive change with one writer and one check together.

## Verification

Run focused `src/harness/core/sdd*.test.ts`, `src/harness/sdd-*.test.ts`,
prompt/adapter/bundle/CLI initialization tests, then applicable CI checks in
`docs/agent/testing.md`. Tests show rendered guidance and structural behavior,
not automatic model compliance or provenance of claimed independent review.
