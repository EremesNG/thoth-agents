---
name: sdd-tasks
description: Generate phased `tasks.md` checklists from specs and design.
---

# SDD Tasks Skill

Translate the approved spec and design into an implementation checklist.

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
   the persistence contract:
   - **Always**: recover `proposal`
   - **Full pipeline only**: recover `spec` and `design`
   - In accelerated pipeline, derive task structure directly from the proposal.
3. If a task plan already exists, recover `sdd/{change-name}/tasks` with the
   same mode-aware retrieval rules before rewriting it.
4. **Reuse settled evidence before validating**: Reuse settled proposal, design, exploration, and handoff evidence first. Treat accepted scope, success
   criteria, recorded assumptions, and surfaced `handoffHints` as preservation
   constraints. Do not repeat broad discovery merely because the accelerated
   pipeline has no design artifact or because an available artifact omits a
   path.
5. **Run bounded validation**: Validate only the accepted affected areas, the
   authoritative command source, task-referenced existing files, and neighboring relevant tests needed to make the plan executable.
   - Identify the authoritative command source from project instructions and
     existing conventions (for example `package.json`, `Makefile`, `Cargo.toml`,
     `.csproj`, or `pyproject.toml`). Use only commands confirmed there in
     `Run:` fields; never invent commands or imply that an unchecked command
     exists.
   - For every task that modifies an existing file, verify that path within the
     accepted affected areas. Check neighboring relevant tests only where they
     support a planned task or its Verification block. Never present an unverified path, command, or test reference as confirmed.
   - Do not expand this pass into repository-wide discovery. If a required
     reference remains unresolved, defer or omit the dependent task, add a
     bounded discovery or coordination task when appropriate, and record the
     unresolved reference once under `## Validation Gaps`.
   - Emit one entry per unresolved reference using this exact structure:

     ```md
     ## Validation Gaps

     | Target | Checks performed | Impact / task disposition | Next action |
     | --- | --- | --- | --- |
     | {unverified path, command, or test} | {bounded checks completed} | {blocked, deferred, omitted, or follow-up task} | {specific discovery, owner, or decision needed} |
     ```

   - Escalate a gap that prevents an executable plan. If the accumulated gaps or
     cross-area validation exceed bounded mechanical planning, recommend
     escalation or complexity-based routing; do not use role changes as generic
     failure recovery.
6. Build a phased checklist for `openspec/changes/{change-name}/tasks.md`. In
   `thoth-mem` mode, produce the same canonical checklist content without
   creating the file.
7. Use hierarchical numbering and Markdown checkboxes with per-task verification:

    ```md
    # Tasks: {Change Title}

    ## Phase 1: Foundation
    - [ ] 1.1 Set up project structure — `src/config/`
      **[USN-1]** | Priority: P1
      **Spec:** `config-domain/Project Structure`
      **Independent Test:** Inspect `src/config/` exists and typechecks in isolation.
      **Verification**:
      - Run: `pnpm run typecheck`
      - Expected: No TypeScript errors in config files

    ## Phase 2: Core Implementation
    - [ ] 2.1 Author core-logic tests — `src/core/handler.test.ts`
      **[USN-2]** | Priority: P1
      **Spec:** `core-domain/Core Logic`
      **Independent Test:** Run the new handler test file; it is red before 2.2.
      **Verification**:
      - Run: `pnpm test -- -t "core handler"`
      - Expected: New tests run (red before 2.2)
    - [ ] 2.2 Implement core logic — `src/core/handler.ts`
      **[USN-2]** | Priority: P1
      **Spec:** `core-domain/Core Logic`
      **Independent Test:** Run the handler tests; they pass against the impl.
      **Verification**:
      - Run: `pnpm test -- -t "core handler"`
      - Expected: All handler tests pass

    ## Phase 3: Integration
    - [ ] 3.1 [P] Integrate with API — `src/api/client.ts`
      **[USN-3]** | Priority: P2
      **Spec:** `api-domain/Client Integration`
      **Independent Test:** Run the API client lint in isolation.
      **Verification**:
      - Run: `pnpm run lint src/api/`
      - Expected: No linting errors in API module

     ## Phase 4: Integration & Release
     - [ ] 4.1 Run full integration test suite and validate release artifacts — all modules
       **Verification**:
       - Run: `pnpm test`
       - Expected: All tests pass with 100% coverage
    ```

    Recognized task states:

     - `- [ ]` pending
     - `- [~]` in progress
     - `- [x]` completed
     - `- [-]` skipped — always append a reason: `- [-] 1.2 Task name — skipped: reason here`

8. Reference concrete file paths and specific spec scenarios in the tasks.
9. If the selected mode includes thoth-mem, persist the full checklist with:

   Use the memory tool binding for `mem_save` with the canonical SDD topic key
   and required metadata fields: `title`, `topic_key`, `type`, `project`,
   `scope`, and `content`.

10. After `tasks.md` is generated, the workflow proceeds to an optional oracle
   plan review via the `plan-reviewer` skill. This is managed outside the scope
   of this skill.
11. The artifact governance validator may run **after** `sdd-tasks` as a
    report-only handoff. It captures placement guidance for the future
    pre-`sdd-apply` entrypoint, but it does not enforce execution or overlap
    with plan review.
12. The orchestrator handles the `[OKAY]` / `[REJECT]` review loop and any
     necessary fixes before proceeding to execution.

## Traceability, TDD Ordering, and Handoff Hints
    
    Canonical definitions live in `_shared/openspec-convention.md`. These fields are
    ADDITIVE to the existing `Verification` block, not a replacement, and they are
    optional for back-compat (legacy `tasks.md` without them still executes).
    
    - **`[USN-<n>]`** — a user-story-number grouping label (a coarse story/epic
      bucket). It is NOT the requirement linkage.
    - **Priority** — one of `P1`, `P2`, `P3`.
    - **`Spec:` trace tag** — names the exact requirement the task implements, in
      `{domain}/{Requirement Name}` format (optionally `#{Scenario Name}`). This is
      the requirement linkage `plan-reviewer` counts for coverage %; keep it
      greppable and one requirement per tag.
    - **`Independent Test`** — how the task's outcome is verified in isolation,
      without depending on other tasks being complete.
    
    ### `tasks.tdd` ordering
    
    When `rules.tasks.tdd` is enabled in `config.yaml`, sequence test-authoring
    tasks BEFORE their corresponding implementation tasks within the same phase (see
    the Phase 2 example: 2.1 authors tests, 2.2 implements). When `tasks.tdd` is
    disabled, impose no test-first ordering constraint. `plan-reviewer` enforces
    this ordering when the flag is enabled.
    
    ### `[P]` parallel markers

    When `rules.tasks.parallel_markers` is enabled in `config.yaml`, an optional
    `[P]` marker MAY be placed AFTER the `N.M` number (`- [ ] 2.1 [P] Title`),
    never before it (`[P] 2.1` would break the task-numbering validator). Emit
    `[P]` ONLY on tasks that are intra-phase, dependency-free of every other task
    in the same phase, and assigned to the SAME execution agent — never across
    phases and never on tasks with intra-phase dependencies. `[P]` is
    back-compatible: when `parallel_markers` is disabled or the marker is absent,
    the plan executes exactly as it does today (absence = today's behavior). It
    annotates an explicit parallel batch; it does not change `N.M`, `[USN]`, the
    `Spec:` tag, or introduce flat `T001` ids.

    ### Consume upstream handoffHints
    
    At task-generation start, surface the spec/design phases' `handoffHints` and
    treat them as preservation constraints (coverage decisions, architecture
    constraints, recorded Assumptions). When no hints were declared, surface
    nothing. Surfacing is gated by `rules.handoffs.surface_hints`.
    
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
- Preserve accepted proposal or spec scope and success criteria in tasks.
- Use boundaries and non-goals to express phase, file, or ownership limits,
  not to shrink the accepted goal.
- Convert deferred or unresolved affected areas into discovery,
  coordination, or follow-up tasks, or emit an explicit warning when follow-up
  cannot be planned yet.
- Do not create vague tasks such as "implement feature".
- The governance validator is advisory only at this stage; it documents
  handoff placement and report findings, but it does not block task generation
  or replace execution planning.
- **Every task MUST include a `Verification` sub-block** with:
  - `Run:` — the exact command(s) to verify this task (e.g., `pnpm test`, `pnpm run typecheck`, `pnpm run lint`)
  - `Expected:` — the specific observable outcome that confirms success
  - Tasks without a `Verification` block will be rejected by the plan-reviewer.
  - Do NOT group verification into a single "Phase 4: Verification" — each task gets its own.
- Retrieve all dependencies through the mode-aware protocol in the persistence
  contract.
