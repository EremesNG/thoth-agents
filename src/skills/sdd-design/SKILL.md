---
name: sdd-design
description: Create `design.md` as a technical solution design with architecture decisions and file changes.
---

# SDD Design Skill

Create the technical solution design that explains how the approved spec will
be built. OpenSpec `design.md` is a technical approach artifact covering
implementation architecture, tradeoffs, and repository patterns.

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

- Proposal and specs exist and implementation planning needs technical depth
- A prior design needs to be revised after spec changes

This phase is not a UI/UX design task. Do not route this phase to the designer
agent because it is named `design`; the default implementation owner is a
technical write-capable role such as `deep`.

## Prerequisites

- `change-name`
- Proposal artifact
- Spec artifact
- Access to the repository code that will change

## Workflow

1. Read the shared conventions.
2. Recover `sdd/{change-name}/proposal` and `sdd/{change-name}/spec` using the
   retrieval protocol in
   the persistence contract.
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

   Use the memory tool binding for `mem_save` with the canonical SDD topic key
   and required metadata fields: `title`, `topic_key`, `type`, `project`,
   `scope`, and `content`.

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
- Do not route this phase to the designer agent. `sdd-design` itself always
  stays with the technical write-capable agent.
- Later `sdd-apply` tasks may route to the designer agent when the work is
  specifically user-facing UI, visual work, screenshots, or visual QA.
- Every architecture decision must include rationale.
- Use concrete file paths and interfaces.
- Keep implementation details aligned with the spec and repository patterns.
- Retrieve full dependencies with the protocol in the persistence contract.
