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
2. If the change already exists, recover the complete latest proposal using
   the selected mode and installed provider guidance where applicable.
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
   ### Deferred / Needs Discovery
   ### Out of Scope
   ## Approach
   ## Affected Areas
   ## Risks
   ## Rollback Plan
   ## Success Criteria
   ```

5. If the selected mode includes thoth-mem, request persistence of the full
   proposal under `sdd/{change-name}/proposal` through installed provider
   guidance and require outcome evidence before reporting success.

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
- Preserve the original user intent and product goal in proposal scope. Do not
  silently shrink broad goals such as full UX redesigns.
- Describe material behavior changes with `From`, `To`, `Reason`, and `Impact`
  when applicable.
- Use `Deferred / Needs Discovery` for unresolved affected areas that are still
  part of the accepted goal.
- Keep `Out of Scope` disciplined: include only explicit exclusions, rejected
  options, ownership-separated future work, or deliberately deferred phases.
- Do not move parts of the stated user goal to `Out of Scope` only because the
  implementation path is unknown.
- Always include rollback guidance and explicit out-of-scope items when they
  exist.
- Never reference engram.
- Never treat partial provider context as the complete proposal. Require
  evidence of the full artifact body or report recovery as degraded or
  unsupported.
