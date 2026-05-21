---
name: sdd-apply
description: Execute assigned SDD tasks and return structured implementation results.
---

# SDD Apply Skill

Implement assigned SDD tasks and return durable execution results to the
orchestrator.

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

- A change has a task plan and implementation should begin or resume
- A batch of checklist items must be executed and reported back to the
  orchestrator

## Prerequisites

- `change-name`
- `pipeline-type` (`accelerated` or `full`)
- Assigned task numbers or phase range
- Task artifact
- Spec and design artifacts (full pipeline only)
- Proposal artifact (accelerated pipeline — used as the acceptance reference)

## Workflow

1. Read the shared conventions.
2. Recover artifacts with the retrieval protocol in
   `~/.config/opencode/skills/_shared/persistence-contract.md`:
   - **Always**: recover `tasks`
   - **Full pipeline**: recover `spec` and `design`
   - **Accelerated pipeline**: recover `proposal` (used as the acceptance reference)
3. Read the affected code before editing anything.
4. Execute only the assigned checklist items.
5. In modes that include thoth-mem, persist an implementation progress report
   with:

   ```text
   thoth_mem_mem_save(
     title: "sdd/{change-name}/apply-progress",
     topic_key: "sdd/{change-name}/apply-progress",
     type: "architecture",
     project: "{project}",
     scope: "project",
     content: "{progress report markdown}"
   )
   ```

6. If the orchestrator requests it, include enough detail for it to update the
   canonical tasks artifact and memory checkpoints accurately.

## Response Format

Return a structured result to the orchestrator using the Task Result envelope:

**Status**: completed | failed | partial
**Task**: {task reference}

**What was done**: concrete list of changes
**Files changed**: paths with descriptions
**Verification**: check results (passed/failed)
**Issues**: problems encountered with severity
**Failure/Skip reason**: if applicable

Progress tracking (checkbox state updates) is managed by the orchestrator
via the `executing-plans` skill. Do not update task checkboxes yourself.

## Rules

- Read the acceptance contract before implementing: specs in full pipeline,
  proposal in accelerated pipeline.
- Follow the design unless you explicitly report a justified deviation.
- Update only the tasks assigned in the current batch.
- Persist the progress artifact whenever the selected mode includes thoth-mem.
- Retrieve every SDD dependency with the mode-aware protocol in
  `~/.config/opencode/skills/_shared/persistence-contract.md`.
- Return structured execution evidence to the orchestrator so it can manage task
  state correctly.
