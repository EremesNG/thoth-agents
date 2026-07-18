---
name: sdd-init
description: Bootstrap OpenSpec structure and SDD context for a project.
metadata:
  author: gentleman-programming
  version: "1.0"
---

# SDD Init Skill

Initialize SDD for a project by detecting local conventions, creating the
minimal OpenSpec structure when needed, and persisting startup context.

## Shared Conventions

- [../_shared/openspec-convention.md](../_shared/openspec-convention.md)
- [../_shared/persistence-contract.md](../_shared/persistence-contract.md)
- [../_shared/thoth-mem-convention.md](../_shared/thoth-mem-convention.md)

## Persistence Mode

The orchestrator passes the artifact store mode (`thoth-mem`, `openspec`, or
`hybrid`). Follow the persistence contract for read/write rules per mode.

- `thoth-mem`: persist initialization context to thoth-mem only — do NOT create
  or modify `openspec/` files.
- `openspec`: create or update OpenSpec structure only — do NOT call thoth-mem
  save tools.
- `hybrid`: do both (default).

## When to Use

- SDD is needed but `openspec/` is not initialized
- `openspec/` exists but is stale: missing `config.yaml` mechanism sections
  (`constitution` / `consistency` / `requirements_quality` / `clarification` /
  `handoffs`), missing `tasks.traceability` / `tasks.parallel_markers` /
  `design.sub_artifacts` / `design.complexity_threshold` / `verify` toggles, or a
  missing `openspec/memory/constitution.md`
- A new project needs initial OpenSpec conventions
- The team wants detected stack/context captured before `sdd-propose`

## Prerequisites

- Project root path
- Project name
- Selected persistence mode (default: `hybrid`)

## Workflow

1. Read the shared conventions before initializing.
2. Detect project stack and conventions from repository files:
   - Stack indicators: `package.json`, `go.mod`, `pyproject.toml`,
     `requirements.txt`, `Cargo.toml`, `pom.xml`, `build.gradle`,
     `composer.json`.
   - Testing indicators: `vitest.config.*`, `jest.config.*`,
     `playwright.config.*`, `pytest.ini`, `tox.ini`, `go test` conventions,
     `Cargo.toml` test crates.
   - Style indicators: `biome.json`, `.eslintrc*`, `eslint.config.*`,
     `.prettierrc*`, `ruff.toml`, `.golangci.*`, `rustfmt.toml`.
   - CI indicators: `.github/workflows/*`, `.gitlab-ci.yml`,
     `azure-pipelines.yml`, `.circleci/config.yml`.
   - Architecture hints: common layout markers such as `apps/`, `packages/`,
     `services/`, `src/`, `cmd/`, `internal/`.
3. Build concise config context (max 10 lines) using detected values. Use
   `unknown` for missing signals.
4. If the selected mode includes OpenSpec (`openspec` or `hybrid`), check
   whether these already exist:
   - `openspec/config.yaml`
   - `openspec/specs/`
   - `openspec/changes/`
5. If the required OpenSpec paths already exist, do not dead-end. Compute
   whether the project is fully aligned or stale, then realign additively:
   - **Fully aligned** (all paths present AND `config.yaml` already carries
     every mechanism section / toggle AND `openspec/memory/constitution.md`
     exists) -> report a no-op and return. Never overwrite by default.
   - **Stale / partial** (any piece below is absent) -> proceed to the
     additive backfill in steps 5a-5c. Never overwrite a value that is
     already present.

    5a. Compute the per-piece *absent set* (detect each independently; treat a
        partially-present `openspec/` per-piece, not all-or-nothing):
        - missing `openspec/specs/`
        - missing `openspec/changes/` (and `changes/archive/`)
        - missing `config.yaml` mechanism sections: `constitution`,
          `consistency`, `requirements_quality`, `clarification`, `handoffs`
        - missing `config.yaml` toggles: `rules.tasks.traceability`,
          `rules.tasks.parallel_markers`, `rules.design.sub_artifacts`,
          `rules.design.complexity_threshold`,
          `rules.verify` (`test_command` / `build_command` /
          `coverage_threshold`)
        - missing `openspec/memory/constitution.md`

    5b. For each absent piece, additively create or merge ONLY that piece using
        the canonical shapes defined in step 7 (`config.yaml`) and step 7a
        (`constitution.md`). Merge missing `config.yaml` sections into the
        existing file, preserving every present key and value verbatim. Never
        rewrite a value that is already present. Never renumber or recreate an
        existing `constitution.md` (see step 7a idempotency).

    5c. Report exactly what was added (list each created path and each merged
        `config.yaml` section / toggle). If the absent set was empty, report a
        no-op instead.
6. If any required OpenSpec path is missing and mode includes OpenSpec, create
   only the minimum structure:

   ```text
   openspec/
   ├── config.yaml
   ├── specs/
   └── changes/
       └── archive/
   ```

7. Generate `openspec/config.yaml` dynamically with this shape:

       ```yaml
       schema: spec-driven

       context: |
         Tech stack: {detected}
         Architecture: {detected}
         Testing: {detected}
         Style: {detected}

       rules:
         proposal:
           - Include rollback plan for risky changes
           - Identify affected modules/packages
         spec:
           - Use RFC 2119 keywords (MUST, SHALL, SHOULD, MAY)
           - Use Given/When/Then scenarios
         design:
           guidance:
             - Document architecture decisions with rationale
             - Require a File Changes section
           sub_artifacts: false        # optional design sub-artifacts (default off)
           complexity_threshold:       # author-evaluated eligibility triggers (OR)
             affected_domains: 3
             affected_files: 12
             external_research: true
         tasks:
           guidance:
             - Group tasks by phase with hierarchical numbering
             - Keep tasks small enough to complete in one session
           tdd: false                  # TDD ordering flag (sdd-tasks-format)
           traceability: true          # require [USN] + Spec: tag + Independent Test per task
           parallel_markers: false     # [P] emission + executing-plans consumption (default off)
         apply:
           guidance:
             - Follow existing code patterns and conventions
           test_command: ''
         verify:
           test_command: ''
           build_command: ''
           coverage_threshold: 0
         archive:
           - Warn before merging destructive deltas

         # --- mechanism sections (spec-kit-rigor) ---
         constitution:
           path: openspec/memory/constitution.md
           enforce_check: true         # Constitution Check gate blocks on violation
           version_policy: semver      # MAJOR=remove/redefine, MINOR=add, PATCH=clarify
         consistency:
           enforce_block: true         # CRITICAL findings block plan-review
           require_coverage_percentage: true
         requirements_quality:
           enforce_block: true         # incomplete checklist blocks tasks phase
           dimensions: [completeness, clarity, measurability, testability]
         clarification:
           max_markers_per_spec: 3     # [NEEDS CLARIFICATION] cap enforced by plan-reviewer
         handoffs:
           surface_hints: true         # surface SddPhaseContract.handoffHints at transitions
       ```

       Mixing bare `- item` list entries with `key: value` scalars under one key is
       invalid YAML; when a phase carries scalar toggles (`tasks`, `apply`,
       `verify`), put its guidance strings under a `guidance:` subkey.

    7a. Bootstrap the project constitution at `openspec/memory/constitution.md`
        (mode includes OpenSpec):
        - **Absent** -> create it at `Version: 1.0.0` with `Ratified`/`Last-Amended`
          dates, the five native principles (delegate-first coordination, read-only
          role boundaries, governed persistence, multi-harness parity, evidence-led
          verification) each with Statement/Rationale/Gate Implications, and an empty
          `## Sync-Impact Report` section.
        - **Present** -> preserve the existing content AND its existing version
          unchanged; do NOT recreate or renumber it. This step is idempotent: a
          second `sdd-init` run on a repo whose `constitution.md` is at `2.1.0`
          leaves it at `2.1.0`.
        - **Semver bump policy** (manual, by whoever edits the constitution): MAJOR
          = a principle removed or redefined; MINOR = a principle added or guidance
          materially expanded; PATCH = clarification/wording. Each edit also appends
          a `## Sync-Impact Report` entry. No tooled auto-bump exists.
        - See `_shared/openspec-convention.md` (Constitution Governance) for the
          canonical artifact and gate semantics.

8. Never create placeholder SDD artifacts (`proposal.md`, `design.md`,
   `tasks.md`, or spec files) during initialization.
9. If the selected mode includes thoth-mem (`thoth-mem` or `hybrid`), persist
   the detected context and initialization status with:

   ```text
   Request the canonical provider-backed artifact outcome through installed
   provider guidance. Treat it as successful only when evidence confirms the
   complete artifact under its canonical `sdd/{change}/{artifact}` identity.

10. In `hybrid` mode, initialization is complete only when both OpenSpec setup
    and thoth-mem persistence succeed.

## Output Format

Return:

- `Project`
- `Mode`
- `Detected Context`: stack, architecture, testing, style, CI
- `OpenSpec Status`: initialized, already initialized, or skipped by mode
- `Created Paths`: list of directories/files created (if any)
- `Topic Key`: `sdd-init/{project-name}` when mode includes thoth-mem
- `Next Step`: usually `sdd-propose`

## Rules

- Realignment is strictly additive: when `openspec/` already exists, backfill
  only the absent pieces and NEVER overwrite a value that is already present.
- An existing `constitution.md` is never renumbered or recreated; create it
  only when absent and otherwise preserve its content and version unchanged.
- A re-run on a fully-aligned project is a reported no-op (no writes).
- In `thoth-mem` mode, never create `openspec/` directories or files.
- Keep `config.yaml` context concise (max 10 lines).
- Detect and include CI, test, and style conventions in the context summary.
- Never create placeholder spec/change files during init.
