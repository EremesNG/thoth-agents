---
name: sdd-clarify
description: Resolve residual spec ambiguity in place before design, with a bounded taxonomy-driven clarification pass.
---

# SDD Clarify Skill

Resolve residual ambiguity that survives `sdd-spec` by writing clarified
resolutions back into the authoritative delta spec, before `sdd-design`
consumes it.

## Shared Conventions

- [../_shared/openspec-convention.md](../_shared/openspec-convention.md)
- [../_shared/persistence-contract.md](../_shared/persistence-contract.md)
- [../_shared/thoth-mem-convention.md](../_shared/thoth-mem-convention.md)

## Persistence Mode

The orchestrator passes the artifact store mode (`thoth-mem`, `openspec`, or
`hybrid`). Follow the persistence contract for read/write rules per mode.

- `thoth-mem`: persist to thoth-mem only — do NOT create or modify
  `openspec/` files.
- `openspec`: write files only — do NOT call thoth-mem save tools.
- `hybrid`: persist to both (default).

## When to Use

- The delta specs are authored and residual ambiguity (unresolved
  `[NEEDS CLARIFICATION]` markers or taxonomy-classified gaps) must be resolved
  before design.
- A `full` SDD pipeline run reaches the `clarify` phase between `spec` and
  `design`. The phase is full-pipeline only; accelerated and direct pipelines
  skip it.

## Prerequisites

- `change-name`
- The spec artifact must exist (recoverable under `sdd/{change-name}/spec`).
- `openspec/changes/{change-name}/checklists/requirements.md` must exist.

## Workflow

1. Read the shared conventions.
2. Recover `sdd/{change-name}/spec` using the recall funnel in the persistence
   contract (`mem_recall(mode="compact")` -> `mem_recall(mode="context")` ->
   `mem_get(...)`), and read the delta spec file(s) under
   `openspec/changes/{change-name}/specs/{domain}/spec.md`.
3. **Taxonomy scan** — scan the recovered spec against the ambiguity taxonomy to
   produce resolution candidates:
   - ambiguous quantifiers (e.g. "fast", "several", "most")
   - undefined terms (domain nouns with no pinned meaning)
   - missing error/edge behavior (no failure/edge path specified)
   - unresolved decision forks (competing options with no default)
   - underspecified data shapes (fields, types, or cardinality not pinned)
   - unstated non-functional bounds (latency, size, concurrency, limits)
   - plus every unresolved `[NEEDS CLARIFICATION]` marker already in the spec.
4. **Bounded Q&A** — resolve candidates capped at
   `rules.clarification.max_markers_per_spec` (default 3) per spec file. With
   more than the cap, resolve at most the cap's worth, prioritizing the
   highest-impact ambiguities; leave the rest as explicit markers for a later
   pass. Prefer an informed-guess default recorded in `## Assumptions` over a
   blocking question when a defensible default exists.
5. **Write-back in place** — replace each resolved `[NEEDS CLARIFICATION]`
   marker / ambiguous statement with its resolved decision directly in the same
   delta spec file(s) (inline, or folded into the spec's `## Assumptions`
   section when the resolution is a recorded default). Do NOT create a new
   artifact (`clarifications.md`, `spec-clarified.md`, etc.). In
   `hybrid`/`thoth-mem` mode, re-save the edited spec under the SAME canonical
   key `sdd/{change-name}/spec` (upsert) — no `spec-clarified` key.
6. **Re-validate** `openspec/changes/{change-name}/checklists/requirements.md`
   against the clarified spec: flip items that were waived or open due to a
   now-resolved ambiguity, and declare `handoffHints` for design (the resolved
   decisions and the re-validated checklist state design must preserve). Do not
   advance past design with an unresolved checklist.

## Boundary

`sdd-clarify` targets only **post-spec residual** ambiguity. It MUST NOT
re-run or duplicate the upfront `requirements-interview`, and MUST NOT re-ask
questions already resolved during requirements discovery. It edits only the
spec and its requirements checklist; it produces no new permanent artifact.

## Output Format

Return:

- `Change`
- `Artifact`: clarified delta spec path(s) (edited in place)
- `Topic Key`: `sdd/{change-name}/spec`
- `Resolved`: list of ambiguities resolved (marker/taxonomy class -> resolution)
- `Next Step`: `sdd-design`

## Rules

- Write resolutions back into the authoritative spec in place; never leave a
  resolved ambiguity standing as unresolved.
- Reuse the canonical `sdd/{change-name}/spec` topic key (upsert); introduce no
  new artifact or key.
- Cap resolutions at `rules.clarification.max_markers_per_spec` per spec file.
- Re-validate `checklists/requirements.md` before handing off to design.
- Do not duplicate `requirements-interview`; resolve only residual post-spec
  ambiguity.
- Use the recall funnel from the persistence contract for every SDD dependency.
