# Implementation Plan: [Feature name]

## Technical context

[Current behavior, constraints, and affected surfaces.]

## Constitution Check (pre-design)

Read `openspec/memory/constitution.md` and extract every active numbered
principle heading. Build one ordered name set and reuse it unchanged in both
Constitution Checks: do not add, remove, abbreviate, or rename a heading between
the pre-design and post-design lists.

Each entry must use the canonical form
`- **<exact principle heading>**: <PASS | JUSTIFIED EXCEPTION | FAIL> — <concrete evidence>`.
Placeholders are invalid, and any `FAIL` blocks task generation. Replace the
anchor below; do not append entries beside an example list.

<!-- PRE-DESIGN-CONSTITUTION-ENTRIES -->

## Design

### Requirement mapping

| Requirement | Technical decision | Files/interfaces | Verification seam |
| --- | --- | --- | --- |
| FR-001 | [Decision] | `[exact/path]` | [Public seam] |

## Optional support artifacts

- `research.md`: [reason or not needed]
- `data-model.md`: [reason or not needed]
- `contracts/`: [reason or not needed]
- `quickstart.md`: [reason or not needed]

## Risks and migrations

- [Risk, mitigation, rollback or migration.]

## Constitution Check (post-design)

Reuse the exact ordered principle names from the pre-design check and provide
fresh evidence about the completed design. Replace the anchor below; the two
checks must differ only in status/evidence, never in principle coverage.

<!-- POST-DESIGN-CONSTITUTION-ENTRIES -->
