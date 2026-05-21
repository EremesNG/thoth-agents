---
name: sdd-tasks
description: Generate phased `tasks.md` checklists from specs and design.
---

# SDD Tasks Skill

Translate the approved spec and design into an implementation checklist.

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

- **Full pipeline**: proposal, spec, and design are ready for execution planning
- **Accelerated pipeline**: proposal is ready and spec/design are intentionally skipped
- A task plan must be refreshed after scope changes

## Prerequisites

- `change-name`
- `pipeline-type` (`accelerated` or `full`)
- Proposal artifact
- Spec artifact (full pipeline only)
- Design artifact (full pipeline only)

## Workflow

1. Read the shared conventions.
2. Recover artifacts via the retrieval protocol in
   `~/.config/opencode/skills/_shared/persistence-contract.md`:
   - **Always**: recover `proposal`
   - **Full pipeline only**: recover `spec` and `design`
   - In accelerated pipeline, derive task structure directly from the proposal.
3. If a task plan already exists, recover `sdd/{change-name}/tasks` with the
   same mode-aware retrieval rules before rewriting it.
4. **Validate existing-file references**: For every task that modifies an existing file (not creates a new one), verify the file actually exists on disk before including it in the task list. If a referenced "existing" file is not found, flag it as a design defect in an `> ⚠️ Warning` block at the top of the tasks artifact, and omit the task or add a note.
5. **Codebase discovery (required when design artifact is absent or lacks file paths)**:
   Before generating tasks, actively explore the repository to gather the concrete data needed for accurate Verification blocks:
    1. Read the project's build manifest or task runner config (e.g., `package.json`, `Makefile`, `Cargo.toml`, `.csproj`, `pyproject.toml`) to discover available commands for testing, building, linting, and type-checking. Use the exact commands the project defines in `Run:` fields — never invent commands that don't exist in the project.
   2. Explore the directory structure of affected areas to confirm actual file paths and module layout.
   3. Check for existing test files (e.g., `*.test.ts`, `*.spec.ts`) to reference in Verification commands.
   4. Use the proposal's "Affected Areas" and "Approach" as navigation hints, not as authoritative file paths.

   This exploration is mandatory in accelerated pipeline. In full pipeline, prefer paths from the design artifact's `File Changes` section but still validate commands from `package.json`.
6. Build a phased checklist for `openspec/changes/{change-name}/tasks.md`. In
   `thoth-mem` mode, produce the same canonical checklist content without
   creating the file.
5. Use hierarchical numbering and Markdown checkboxes with per-task verification:

    ```md
    # Tasks: {Change Title}

    ## Phase 1: Foundation
    - [ ] 1.1 Set up project structure — `src/config/`
      **Verification**:
      - Run: `bun run typecheck`
      - Expected: No TypeScript errors in config files

    ## Phase 2: Core Implementation
    - [ ] 2.1 Implement core logic — `src/core/handler.ts`
      **Verification**:
      - Run: `bun test -t "core handler"`
      - Expected: All handler tests pass

    ## Phase 3: Integration
    - [ ] 3.1 Integrate with API — `src/api/client.ts`
      **Verification**:
      - Run: `bun run lint src/api/`
      - Expected: No linting errors in API module

     ## Phase 4: Integration & Release
     - [ ] 4.1 Run full integration test suite and validate release artifacts — all modules
       **Verification**:
       - Run: `bun test`
       - Expected: All tests pass with 100% coverage
    ```

    Recognized task states:

     - `- [ ]` pending
     - `- [~]` in progress
     - `- [x]` completed
     - `- [-]` skipped — always append a reason: `- [-] 1.2 Task name — skipped: reason here`

7. Reference concrete file paths and specific spec scenarios in the tasks.
8. If the selected mode includes thoth-mem, persist the full checklist with:

   ```text
   thoth_mem_mem_save(
     title: "sdd/{change-name}/tasks",
     topic_key: "sdd/{change-name}/tasks",
     type: "architecture",
     project: "{project}",
     scope: "project",
     content: "{full tasks markdown}"
   )
   ```

9. After `tasks.md` is generated, the workflow proceeds to an optional oracle
   plan review via the `plan-reviewer` skill. This is managed outside the scope
   of this skill.
10. The artifact governance validator may run **after** `sdd-tasks` as a
    report-only handoff. It captures placement guidance for the future
    pre-`sdd-apply` entrypoint, but it does not enforce execution or overlap
    with plan review.
11. The orchestrator handles the `[OKAY]` / `[REJECT]` review loop and any
     necessary fixes before proceeding to execution.

## Output Format

Return:

- `Change`
- `Artifact`: `openspec/changes/{change-name}/tasks.md`
- `Topic Key`: `sdd/{change-name}/tasks`
- `Phase Summary`: task counts per phase
- `Execution Order`: one short paragraph
- `Next Step`: `sdd-apply`

## Rules

- Tasks must be small, actionable, and verifiable.
- Order tasks by dependency.
- Include testing and verification work explicitly.
- Do not create vague tasks such as "implement feature".
- The governance validator is advisory only at this stage; it documents
  handoff placement and report findings, but it does not block task generation
  or replace execution planning.
- **Every task MUST include a `Verification` sub-block** with:
  - `Run:` — the exact command(s) to verify this task (e.g., `bun test`, `bun run typecheck`, `bun run lint`)
  - `Expected:` — the specific observable outcome that confirms success
  - Tasks without a `Verification` block will be rejected by the plan-reviewer.
  - Do NOT group verification into a single "Phase 4: Verification" — each task gets its own.
- Retrieve all dependencies through the mode-aware protocol in
  `~/.config/opencode/skills/_shared/persistence-contract.md`.
