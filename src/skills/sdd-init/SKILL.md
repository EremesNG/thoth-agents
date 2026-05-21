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

- Shared references:
- `~/.config/opencode/skills/_shared/openspec-convention.md`
- `~/.config/opencode/skills/_shared/persistence-contract.md`
- `~/.config/opencode/skills/_shared/thoth-mem-convention.md`

## Persistence Mode

The orchestrator passes the artifact store mode (`thoth-mem`, `openspec`, or
`hybrid`). Follow
`~/.config/opencode/skills/_shared/persistence-contract.md` for read/write
rules per mode.

- `thoth-mem`: persist initialization context to thoth-mem only — do NOT create
  or modify `openspec/` files.
- `openspec`: create or update OpenSpec structure only — do NOT call thoth-mem
  save tools.
- `hybrid`: do both (default).

## When to Use

- SDD is needed but `openspec/` is not initialized
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
5. If all required OpenSpec paths already exist, report what exists and ask the
   orchestrator whether `config.yaml` should be updated. Do not overwrite by
   default.
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
     specs:
       - Use Given/When/Then format for scenarios
       - Use RFC 2119 keywords (MUST, SHALL, SHOULD, MAY)
     design:
       - Include sequence diagrams for complex flows
       - Document architecture decisions with rationale
     tasks:
       - Group tasks by phase (infrastructure, implementation, testing)
       - Use hierarchical numbering (1.1, 1.2, etc.)
       - Keep tasks small enough to complete in one session
     apply:
       - Follow existing code patterns and conventions
       tdd: false
       test_command: ''
     verify:
       test_command: ''
       build_command: ''
       coverage_threshold: 0
     archive:
       - Warn before merging destructive deltas
   ```

8. Never create placeholder SDD artifacts (`proposal.md`, `design.md`,
   `tasks.md`, or spec files) during initialization.
9. If the selected mode includes thoth-mem (`thoth-mem` or `hybrid`), persist
   the detected context and initialization status with:

   ```text
   thoth_mem_mem_save(
     title: "sdd-init/{project-name}",
     topic_key: "sdd-init/{project-name}",
     type: "config",
     project: "{project-name}",
     scope: "project",
     content: "What: ...\nWhy: ...\nWhere: ...\nLearned: ..."
   )
   ```

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

- Be idempotent: if OpenSpec already exists, report and ask before updates.
- In `thoth-mem` mode, never create `openspec/` directories or files.
- Keep `config.yaml` context concise (max 10 lines).
- Detect and include CI, test, and style conventions in the context summary.
- Never create placeholder spec/change files during init.
