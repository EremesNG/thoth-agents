---
name: sdd-propose
description: Create or update `proposal.md` for an OpenSpec change.
---

# SDD Propose Skill

Create the proposal artifact for a change and persist it with thoth-mem.

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

- A change needs its first `proposal.md`
- An existing proposal must be refined after new requirements

## Prerequisites

- A `change-name`
- User intent, problem statement, or prior exploration notes
- Project name for thoth-mem persistence

## Workflow

1. Read the shared conventions before drafting.
2. If the change already exists, recover the latest proposal using the
   retrieval protocol from the persistence contract.
3. Review relevant main specs under the active OpenSpec path to avoid
   proposing contradictions.
4. If the selected mode includes OpenSpec, write
   `openspec/changes/{change-name}/proposal.md` using this shape. In
   `thoth-mem` mode, produce the same content without creating the file:

   ```md
   # Proposal: {Change Title}

   ## Intent
   ## Scope
   ### In Scope
   ### Out of Scope
   ## Approach
   ## Affected Areas
   ## Risks
   ## Rollback Plan
   ## Success Criteria
   ```

5. If the selected mode includes thoth-mem, persist the full proposal with:

   Use the memory tool binding for `mem_save` with the canonical SDD topic key
   and required metadata fields: `title`, `topic_key`, `type`, `project`,
   `scope`, and `content`.

6. In `hybrid` mode, both the filesystem artifact and thoth-mem save must
   succeed.

## Output Format

Return a short report with:

- `Change`: change name
- `Artifact`: `openspec/changes/{change-name}/proposal.md`
- `Topic Key`: `sdd/{change-name}/proposal`
- `Summary`: 2-4 bullets covering intent, scope, and major risks
- `Next Step`: `sdd-spec` (full pipeline) or `sdd-tasks` (accelerated pipeline)

## Rules

- Use canonical OpenSpec filenames only.
- Keep the proposal focused on why, scope, and success criteria.
- Always include rollback guidance and explicit out-of-scope items.
- Never reference engram.
- Never rely on compact search output alone when the mode uses thoth-mem.
  Follow the 3-layer recall protocol: `search(mode: "compact")` →
  `timeline` → `get_observation` to retrieve the full artifact body.
