---
name: sdd-archive
description: Merge completed deltas into main specs and archive the change.
---

# SDD Archive Skill

Close the SDD loop by promoting verified change specs into main specs and
recording an audit trail.

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

- The change has an acceptable verification report and is ready to close
- An archive attempt must be retried after an interrupted move or merge

## Prerequisites

- `change-name`
- `pipeline-type` (`accelerated` or `full`)
- Tasks artifact
- Verify report artifact
- Spec artifact (full pipeline only)
- Design artifact (full pipeline only)
- Proposal artifact (always — used for audit trail)

## Workflow

1. Read the shared conventions.
2. Recover artifacts through the retrieval protocol in
   `~/.config/opencode/skills/_shared/persistence-contract.md`:
   - **Always**: recover `proposal`, `tasks`, and `verify-report`
   - **Full pipeline only**: recover `spec` and `design`
3. Refuse to archive if the verification report still contains unresolved
   critical failures.
4. If the selected mode includes OpenSpec and the pipeline is full, merge
   every change spec from
   `openspec/changes/{change-name}/specs/{domain}/spec.md` into
   `openspec/specs/{domain}/spec.md`. In accelerated pipeline, skip the
   spec merge (no delta specs exist).
5. If the selected mode includes OpenSpec, move the completed change directory
   to `openspec/changes/archive/YYYY-MM-DD-{change-name}/`.
6. Create an audit trail report summarizing merged domains, archive location,
   verification lineage, and any mode-based skips.
7. In `thoth-mem` mode, do not create or move `openspec/` artifacts; record the
   archive result only in the audit trail.
8. If the selected mode includes thoth-mem, persist the audit trail with:

   ```text
   thoth_mem_mem_save(
     title: "sdd/{change-name}/archive-report",
     topic_key: "sdd/{change-name}/archive-report",
     type: "architecture",
     project: "{project}",
     scope: "project",
     content: "{full archive report markdown}"
   )
   ```

## Output Format

Return:

- `Change`
- `Archive Path`: `openspec/changes/archive/YYYY-MM-DD-{change-name}/`
- `Topic Key`: `sdd/{change-name}/archive-report`
- `Merged Specs`: list of domains updated in `openspec/specs/`
- `Audit Summary`: concise bullets
- `Status`: archived or blocked

## Rules

- Archive only after verification is acceptable.
- In full pipeline, merge delta specs before moving the change folder.
  In accelerated pipeline, skip the spec merge (no delta specs exist).
- Preserve canonical spec structure and untouched requirements.
- Persist the final audit trail through thoth-mem when the selected mode
  includes it.
- Use the retrieval protocol in
  `~/.config/opencode/skills/_shared/persistence-contract.md` for every
  dependency.
