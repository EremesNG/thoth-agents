---
name: sdd-verify
description: Verify implementation against specs and persist a compliance report.
---

# SDD Verify Skill

Act as the quality gate for a change by turning specs and test evidence into a
verification report.

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

- Implementation work is complete enough to validate
- A prior verification report must be refreshed after more code changes

## Prerequisites

- `change-name`
- Tasks artifact
- `pipeline-type` (`accelerated` or `full`)
- Spec artifact (full pipeline only)
- Design artifact (full pipeline only)
- Proposal artifact (accelerated pipeline — used as the verification reference)
- Ability to run the relevant checks or tests

## Workflow

1. Read the shared conventions.
2. Recover artifacts with the retrieval protocol in
   `~/.config/opencode/skills/_shared/persistence-contract.md`:
   - **Always**: recover `tasks`
   - **Full pipeline**: recover `spec` and `design`
   - **Accelerated pipeline**: recover `proposal` (used as the verification reference)
3. Optionally recover `apply-progress` with the same mode-aware rules if it
   exists and helps explain task coverage.
4. Read the changed code and run the required verification commands.
5. If the selected mode includes OpenSpec, create
   `openspec/changes/{change-name}/verify-report.md` with at least:

   In `thoth-mem` mode, produce the same report content without creating the
   file:

    ```md
    # Verification Report: {Change Title}

    ## Completeness
    ## Build and Test Evidence
    ## Compliance Matrix
    <!-- Full pipeline: map Given/When/Then scenarios from spec -->
    <!-- Accelerated pipeline: map success criteria from proposal -->
    ## Design Coherence (full pipeline only)
    ## Issues Found
    ## Verdict
    ```

6. Build a compliance matrix: in full pipeline, map each Given/When/Then
   scenario to evidence; in accelerated pipeline, map each proposal success
   criterion to evidence.
7. If the selected mode includes thoth-mem, persist the report with:

   ```text
   thoth_mem_mem_save(
     title: "sdd/{change-name}/verify-report",
     topic_key: "sdd/{change-name}/verify-report",
     type: "architecture",
     project: "{project}",
     scope: "project",
     content: "{full verify report markdown}"
   )
   ```

## Output Format

Return:

- `Change`
- `Artifact`: `openspec/changes/{change-name}/verify-report.md`
- `Topic Key`: `sdd/{change-name}/verify-report`
- `Verdict`: pass, pass with warnings, or fail
- `Compliance Summary`: compliant vs total scenarios
- `Critical Issues`: bullets or `None`

## Rules

- Verification requires real evidence, not only static inspection.
- Every acceptance criterion must appear in the compliance matrix: spec
  scenarios in full pipeline, proposal success criteria in accelerated pipeline.
- Distinguish blockers from warnings clearly.
- Do not fix issues inside this phase; report them.
- Recover full artifacts with the protocol in
  `~/.config/opencode/skills/_shared/persistence-contract.md`.
