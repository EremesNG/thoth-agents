---
name: sdd-verify
description: Verify implementation against specs and persist a compliance report.
---

# SDD Verify Skill

Act as the quality gate for a change by turning specs and test evidence into a
verification report.

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
- Expected `round N` from the dispatch envelope (the verify-loop round counter; defaults to round 1 for the first verify after apply)

## Workflow

1. Read the shared conventions.
2. Recover complete artifacts through the selected persistence mode and
   installed provider guidance where applicable:
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

    ## Round
    round N  <!-- stamped from the dispatch envelope's expected round; source of truth for the loop counter -->

    ## Completeness
    ## Build and Test Evidence
    ## Compliance Matrix
    <!-- Full pipeline: map Given/When/Then scenarios from spec -->
    <!-- Accelerated pipeline: map success criteria from proposal -->
    ## Design Coherence (full pipeline only)

    ## Issues Found

    ### Critical
    - **[C1]** {one-line problem statement}
      - file: `path/to/file.ts:LINE` (or `path/to/file.ts` when line is N/A)
      - scenario: `{Requirement title} › {Scenario name}` (full pipeline) OR
        criterion: `{proposal success-criterion id/text}` (accelerated pipeline)
      - fix: {imperative remediation instruction}

    ### Warnings
    - **[W1]** {one-line problem statement}
      - file: `path/to/file.ts:LINE`
      - scenario / criterion: {anchor}
      - fix: {imperative remediation instruction}

    ## Verdict
    ```

6. Build a compliance matrix: in full pipeline, map each Given/When/Then
   scenario to evidence; in accelerated pipeline, map each proposal success
   criterion to evidence.
7. If the selected mode includes thoth-mem, request the full report outcome
   under `sdd/{change-name}/verify-report` through installed provider guidance
   and require evidence before reporting success.
8. Stamp the expected `round N` from the dispatch envelope into the report's
   `## Round` field and the `Round` return field. The orchestrator treats this
   `round N` marker as the source of truth for the verify-loop round counter
   when enforcing the round bound across iterations.
9. Apply the governance-touched heuristic from
   `_shared/openspec-convention.md` > Constitution Governance > Amendment
   Auto-Suggest. When it matches, surface the shared report-only
   `sdd-constitution` suggestion. This is advisory and MUST NOT change the
   verdict or block verification.

## Output Format

Return:

- `Change`
- `Artifact`: `openspec/changes/{change-name}/verify-report.md`
- `Topic Key`: `sdd/{change-name}/verify-report`
- `Round`: `round N` (mirrors the report's `## Round` marker)
- `Verdict`: pass, pass with warnings, or fail
- `Compliance Summary`: compliant vs total scenarios
- `Critical Issues`: anchored compact lines (`id — file:line — scenario/criterion — fix`), one per issue, or `None`
- `Constitution Suggestion`: surfaced or none

## Rules

- Verification requires real evidence, not only static inspection.
- Every acceptance criterion must appear in the compliance matrix: spec
  scenarios in full pipeline, proposal success criteria in accelerated pipeline.
- Distinguish blockers from warnings clearly.
- Do not fix issues inside this phase; report them.
- Every Critical Issue MUST carry at least one remediation anchor (file: and/or scenario:/criterion:); prose-only Critical Issues are invalid output.
- Stamp the `round N` marker from the dispatch envelope into `## Round`.
- Recover full artifacts with the protocol in the persistence contract.
