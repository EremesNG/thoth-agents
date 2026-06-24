---
name: sdd-spec
description: Write OpenSpec delta specs with RFC 2119 language and GWT scenarios.
---

# SDD Spec Skill

Write or update the change specifications for one or more affected domains.

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

- A proposal is approved and must be converted into testable requirements
- Existing change specs need to be expanded or corrected

> Boundary: residual ambiguity that surfaces after spec authoring is resolved by
> the `sdd-clarify` phase (between `spec` and `design`), not here — spec
> authoring behavior itself is unchanged.

## Prerequisites

- `change-name`
- The proposal artifact must exist
- Access to any current main specs for impacted domains

## Workflow

1. Read the shared conventions.
2. Recover the proposal using the retrieval protocol in
   the persistence contract.
3. If the change already has spec work, recover `sdd/{change-name}/spec` with
   the same mode-aware retrieval rules before editing.
4. Read `openspec/specs/{domain}/spec.md` for each affected domain to determine
   whether you are writing a delta spec or a brand-new spec.
5. If the selected mode includes OpenSpec, write canonical change artifacts
   under `openspec/changes/{change-name}/specs/{domain}/spec.md`. In
   `thoth-mem` mode, produce the same canonical content without creating files.
6. Use this structure in every spec file:

   ```md
   # Delta for {Domain}

   ## ADDED Requirements
   ### Requirement: {Name}
   The system MUST ...

   #### Scenario: {Name}
   - GIVEN ...
   - WHEN ...
   - THEN ...

   ## MODIFIED Requirements
   ## REMOVED Requirements
   ```

   For a brand-new domain, write a full spec instead of a delta.

7. If the selected mode includes thoth-mem, persist the complete spec payload
   with:

   Use the memory tool binding for `mem_save` with the canonical SDD topic key
   and required metadata fields: `title`, `topic_key`, `type`, `project`,
   `scope`, and `content`.

## Clarification Discipline and Requirements-Quality Checklist

    Follow these mechanisms (canonical definitions in
    `_shared/openspec-convention.md` — Clarification Discipline and
    Requirements-Quality Checklist). All are gated by their `config.yaml rules:`
    sections.

    ### `[NEEDS CLARIFICATION]` markers and Assumptions

    - Use `[NEEDS CLARIFICATION: <concrete question>]` ONLY for a genuine decision
      fork where no single default is defensible. The marker text MUST name the
      specific unresolved decision, not a vague placeholder.
    - Cap markers at `rules.clarification.max_markers_per_spec` (default 3) per spec
      file.
    - Informed-guess-first: when an ambiguity has a defensible default, APPLY the
      default and record it in an `## Assumptions` section of the spec rather than
      emitting a marker. Do not silently default a genuine fork.

    ### Generate `checklists/requirements.md`

    At or after authoring the delta specs, generate
    `openspec/changes/{change-name}/checklists/requirements.md` ("unit tests for
    English"):

    - One `## Domain: {domain}` section per authored delta domain.
    - Each domain section carries checkbox items across the four dimensions:
      completeness, clarity, measurability, testability.
    - Items use the task checkbox states (`- [ ]` / `- [x]` / `- [-] waived:
      reason`).
    - The spec->tasks transition is gated on every item being `- [x]` or explicitly
      waived (gated by `rules.requirements_quality.enforce_block`).

    ### Declare handoffHints

    Declare `handoffHints` for the design phase: the recorded `## Assumptions` and
    any unresolved `[NEEDS CLARIFICATION]` resolutions the design phase must
    preserve. Surfacing is gated by `rules.handoffs.surface_hints`.

    ## Output Format

Return:

- `Change`
- `Artifacts`: list of domain spec paths written
- `Checklist`: `openspec/changes/{change-name}/checklists/requirements.md`
- `Topic Key`: `sdd/{change-name}/spec`
- `Coverage Summary`: requirements and scenarios added or modified
- `Next Step`: usually `sdd-design`

## Rules

- Every requirement must use RFC 2119 keywords.
- Every requirement must have at least one Given/When/Then scenario.
- Specs describe behavior, not implementation details.
- Keep domain boundaries explicit.
- Use the retrieval protocol from the persistence contract for every SDD
  dependency.
