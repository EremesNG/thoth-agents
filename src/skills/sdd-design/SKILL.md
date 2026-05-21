---
name: sdd-design
description: Create `design.md` with architecture decisions and file changes.
---

# SDD Design Skill

Create the technical design that explains how the approved spec will be built.

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

- Proposal and specs exist and implementation planning needs technical depth
- A prior design needs to be revised after spec changes

## Prerequisites

- `change-name`
- Proposal artifact
- Spec artifact
- Access to the repository code that will change

## Workflow

1. Read the shared conventions.
2. Recover `sdd/{change-name}/proposal` and `sdd/{change-name}/spec` using the
   retrieval protocol in
   `~/.config/opencode/skills/_shared/persistence-contract.md`.
3. If revising work, recover `sdd/{change-name}/design` with the same
   mode-aware retrieval rules.
4. Read the actual code paths affected by the change before deciding on an
   approach.
5. If the selected mode includes OpenSpec, write
   `openspec/changes/{change-name}/design.md` using this structure. In
   `thoth-mem` mode, produce the same content without creating the file:

   ```md
   # Design: {Change Title}

   ## Technical Approach
   ## Architecture Decisions
   ### Decision: {Title}
   **Choice**:
   **Alternatives considered**:
   **Rationale**:
   ## Data Flow
   ## File Changes
   ## Interfaces / Contracts
   ## Testing Strategy
   ## Migration / Rollout
   ## Open Questions
   ```

6. If the selected mode includes thoth-mem, persist the design with:

   ```text
   thoth_mem_mem_save(
     title: "sdd/{change-name}/design",
     topic_key: "sdd/{change-name}/design",
     type: "architecture",
     project: "{project}",
     scope: "project",
     content: "{full design markdown}"
   )
   ```

## Output Format

Return:

- `Change`
- `Artifact`: `openspec/changes/{change-name}/design.md`
- `Topic Key`: `sdd/{change-name}/design`
- `Key Decisions`: concise bullet list
- `Files Planned`: created, modified, deleted paths
- `Next Step`: `sdd-tasks`

## Rules

- Base the design on the actual codebase, not generic assumptions.
- Every architecture decision must include rationale.
- Use concrete file paths and interfaces.
- Keep implementation details aligned with the spec and repository patterns.
- Retrieve full dependencies with the protocol in
  `~/.config/opencode/skills/_shared/persistence-contract.md`.
