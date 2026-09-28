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
- Offer `Review plan with Oracle (Recommended)` or `Proceed without review`; run
  the fresh review only when selected. For each choice separately, only its
  third confirmed answerless native return selects the recommendation; pending,
  unavailable, failed, or interrupted questions do not count. After a selected
  `[OKAY]`, preserve the separate `Implement (Recommended)` / `Stop` decision;
  review never grants authorization or replaces final verification. Material
  decisions never default.
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

## Verification

Run focused `src/harness/core/sdd*.test.ts`, `src/harness/sdd-*.test.ts`,
prompt/adapter/bundle/CLI initialization tests, then applicable CI checks in
`docs/agent/testing.md`. Tests show rendered guidance and structural behavior,
not automatic model compliance or provenance of claimed independent review.
