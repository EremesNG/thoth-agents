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
2. Recover complete `sdd/{change-name}/proposal` and
   `sdd/{change-name}/spec` artifacts through the selected mode and installed
   provider guidance where applicable.
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

6. If the selected mode includes thoth-mem, request the full design outcome
   under `sdd/{change-name}/design` through installed provider guidance and
   require evidence before reporting success.

## Optional Sub-Artifacts

Beyond the always-present `design.md`, `sdd-design` MAY produce optional plan
sub-artifacts. They are gated by BOTH conditions, config as the hard floor and
author judgment within the gate:

- **Hard gate (config)**: `rules.design.sub_artifacts` MUST be `true`. When
  `false` or absent, NO sub-artifacts are ever produced (back-compat default).
- **Complexity gate (config threshold, author-evaluated)**: when enabled, the
  change MUST meet `rules.design.complexity_threshold` (e.g. `affected_domains`,
  `affected_files`, `external_research` — eligible when ANY trigger is met). The
  threshold is the reviewable hard floor; the author still selects which (if any)
  sub-artifacts add value within the gate. An eligible change MAY still produce
  zero sub-artifacts.

`design.md` is ALWAYS produced regardless of the gate. The optional types are:

- `research.md` — only when there is genuine unknown investigation.
- `data-model.md` — only when there is a non-trivial data shape.
- `contracts/` (subdir) — only when there are interfaces to pin; follow the
  `checklists/` subdir as the precedent for change-dir subdirectory layout.
- `quickstart.md` — only when a runnable smoke path helps.

Note: the `clarify` phase now precedes design (`spec -> clarify -> design`), so
design consumes the already-clarified spec.

## Constitution Check and Handoff Hints

    ### Consume upstream handoffHints

    At design start, surface the spec phase's `handoffHints` (recorded
    `## Assumptions` and `[NEEDS CLARIFICATION]` resolutions) and treat them as
    constraints the design must preserve. When the spec declared no hints, surface
    nothing. Surfacing is gated by `rules.handoffs.surface_hints`.

    ### Constitution Check self-review

    Before finalizing the design, run a Constitution Check self-review: evaluate the
    emerging design against EACH principle in `openspec/memory/constitution.md` —
    delegate-first coordination, read-only role boundaries, governed persistence,
    multi-harness parity, and evidence-led verification. Report any principle the
    design would violate.

    - On a detected violation, BLOCK finalization and surface the violated
      principle through the harness blocking-input surface (the
      AskUserQuestion-equivalent primitive). An explicit user override MUST be
      logged with the violated principle before proceeding. Gated by
      `rules.constitution.enforce_check`; when disabled, note the skip and do not
      block.
    - This self-review does not replace `plan-reviewer`'s independent Constitution
      Check; both run. See `_shared/openspec-convention.md` (Constitution
      Governance, Handoff Hints) for the canonical, harness-agnostic semantics.

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
