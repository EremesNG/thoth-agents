# SDD and bundled skills

## Responsibility

This route owns route classification, phase ownership, conditional gates,
Spec Kit-compatible artifacts, validation, and the thoth-owned workflow bundle.

## Entrypoints

- `src/harness/core/sdd.ts`: routes, owners, prerequisites, artifact graph,
  dispatch envelope, verification, and archive metadata
- `skills/thoth-sdd/`: lazy phase references, templates, validator
- `skills/thoth-constitution/`: constitution lifecycle
- `skills/thoth-archive/`: guarded archive
- `skills/thoth-init/`: offline project bootstrap
- `src/cli/skills.ts`: canonical repository mappings for mandatory external
  execution skills
- [`../sdd-pipeline.md`](../sdd-pipeline.md): public contract

## Invariants

- Direct remains ceremony-free; Accelerated and Full use canonical artifacts.
- Root owns sequential coordination and loads the current reference on demand.
- Explorer owns Full discovery; oracle owns Full analysis and every verify.
- The implementer never self-approves.
- Specifications use US/FR/SC identifiers and independent acceptance examples.
- Plans gate on the project constitution before and after design.
- Tasks use exact T###/[P]/[US#] grammar, MVP/dependencies/parallel examples,
  tests first, an observable verification outcome per task, and complete
  US/FR/SC coverage.
- Structural validation is phase-aware (`--through`), requires the Constitution
  from planning onward, and never requires an artifact from a later gate.
- Clarify, checklist, and converge are conditional; converge is append-only.
- Archive requires complete tasks, oracle PASS, no unresolved CRITICAL issue,
  and never implicitly merges into `openspec/specs/`.
- Owned phase contracts are bundled. External skills are CLI-installed once;
  SDD phase execution is CLI- and network-independent.

Provider persistence is an overlay only; follow installed provider guidance.
