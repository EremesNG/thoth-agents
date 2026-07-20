---
schema: thoth-agents/sdd-plan-review/v1
artifact: plan-review
change: <change-name>
gate: oracle-review
status: "[OKAY|REJECT]"
reviewer_role: oracle
reviewed_at: <ISO-8601 timestamp>
pipeline: <accelerated|full>
persistence_mode: openspec
override:
  occurred: false
  at: null
  surface: null
  context: null
reviewed_artifacts:
  - role: spec
    path: openspec/changes/<change-name>/spec.md
    required: true
    sha256: sha256:<digest>
  - role: plan
    path: openspec/changes/<change-name>/plan.md
    required: true
    sha256: sha256:<digest>
  - role: tasks
    path: openspec/changes/<change-name>/tasks.md
    required: true
    sha256: sha256:<digest>
---

# Plan Review: <change title>

**Status**: [OKAY|REJECT]

## Oracle Result

<[OKAY] or [REJECT]>

## Comments

- <coverage and executability evidence>

## Non-Blocking Notes

- None.

## Blockers

- None, or at most 3 actionable blockers with the smallest repair.

## User Override Context

None.

## Source SHA-256

- `openspec/changes/<change-name>/spec.md`: `sha256:<digest>`
- `openspec/changes/<change-name>/plan.md`: `sha256:<digest>`
- `openspec/changes/<change-name>/tasks.md`: `sha256:<digest>`
- Add every active checklist and constitution source reviewed by Oracle.

## Recovery Decision

This result satisfies only optional plan review while all source digests remain
unchanged. It does not authorize implementation or satisfy final Oracle verify.
