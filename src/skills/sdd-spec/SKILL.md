---
name: sdd-spec
description: Write OpenSpec delta specs with RFC 2119 language and GWT scenarios.
---

# SDD Spec Skill

Write or update the change specifications for one or more affected domains.

## Shared Conventions

- Shared references:
- `~/.config/opencode/skills/_shared/openspec-convention.md`
- `~/.config/opencode/skills/_shared/persistence-contract.md`
- `~/.config/opencode/skills/_shared/thoth-mem-convention.md`

## Persistence Mode

The orchestrator passes the artifact store mode (`thoth-mem`, `openspec`, or
`hybrid`). Follow
`~/.config/opencode/skills/_shared/persistence-contract.md` for read/write
rules per mode.

- `thoth-mem`: persist to thoth-mem only — do NOT create or modify
  `openspec/` files.
- `openspec`: write files only — do NOT call thoth-mem save tools.
- `hybrid`: persist to both (default).

## When to Use

- A proposal is approved and must be converted into testable requirements
- Existing change specs need to be expanded or corrected

## Prerequisites

- `change-name`
- The proposal artifact must exist
- Access to any current main specs for impacted domains

## Workflow

1. Read the shared conventions.
2. Recover the proposal using the retrieval protocol in
   `~/.config/opencode/skills/_shared/persistence-contract.md`.
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

   ```text
   thoth_mem_mem_save(
     title: "sdd/{change-name}/spec",
     topic_key: "sdd/{change-name}/spec",
     type: "architecture",
     project: "{project}",
     scope: "project",
     content: "{full spec markdown across all domains}"
   )
   ```

## Output Format

Return:

- `Change`
- `Artifacts`: list of domain spec paths written
- `Topic Key`: `sdd/{change-name}/spec`
- `Coverage Summary`: requirements and scenarios added or modified
- `Next Step`: usually `sdd-design`

## Rules

- Every requirement must use RFC 2119 keywords.
- Every requirement must have at least one Given/When/Then scenario.
- Specs describe behavior, not implementation details.
- Keep domain boundaries explicit.
- Use the retrieval protocol from
  `~/.config/opencode/skills/_shared/persistence-contract.md` for every SDD
  dependency.