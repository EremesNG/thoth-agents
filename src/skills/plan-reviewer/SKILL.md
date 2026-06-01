---
name: plan-reviewer
description: Review SDD task plans for execution blockers and return [OKAY] or [REJECT].
metadata:
  author: thoth-agents
  version: '1.0'
---

# Plan Reviewer Skill

Verify that an SDD task plan is executable, references valid files, and is safe
to hand to implementation.

## Shared Conventions

- [../_shared/openspec-convention.md](../_shared/openspec-convention.md)
- [../_shared/persistence-contract.md](../_shared/persistence-contract.md)
- [../_shared/thoth-mem-convention.md](../_shared/thoth-mem-convention.md)

## Purpose

Review the tasks artifact for true execution blockers. Retrieve it according to
the persistence mode: read `openspec/changes/{change-name}/tasks.md` for
openspec/hybrid modes, use the thoth-mem recall funnel
(`mem_recall(mode="compact")` -> `mem_recall(mode="context")` ->
`mem_get(...)`) for thoth-mem/hybrid modes, or read from inline context for none
mode.

The artifact governance validator is not part of this review. Plan-reviewer is
only the pre-execution approval gate for the task plan; it does not run the
validator, enforce its findings, or manage the future pre-`sdd-apply` handoff.
Invoke the semantic oracle role through the available role dispatch surface.

Focus on whether the plan can be executed as written, not whether you would have
designed it differently.

## Inputs

- `change-name`
- `pipeline-type` (`accelerated` or `full`)
- `persistence-mode` (`thoth-mem`, `openspec`, `hybrid`, or `none`)
- Tasks artifact (retrieved per persistence mode: filesystem for openspec/hybrid,
  thoth-mem for thoth-mem/hybrid, inline for none)
- **Full pipeline**: related spec and design artifacts when needed for dependency checks
- **Accelerated pipeline**: proposal artifact when needed for dependency checks

## Task State Awareness

Recognize these checklist states in `tasks.md`:

- `- [ ]` pending
- `- [~]` in progress
- `- [x]` completed
- `- [-]` skipped with reason

Review executability of the remaining work. If a task is marked `- [-]`, ensure
the skip reason is explicit and does not hide a blocker.

## Review Checklist

Check only what affects executability:

1. Referenced file paths exist when they are supposed to already exist.
2. New-file tasks use exact intended paths.
3. Tasks reference exact file paths instead of vague areas.
4. Each task includes a `Verification` section.
5. Each `Verification` section includes both:
   - `Run:`
   - `Expected:`
6. Dependency order is valid.
7. The sequence is workable without hidden prerequisite steps.
8. In-scope success criteria from the accepted proposal/spec are represented by
   executable tasks.
9. Deferred or unresolved affected areas from the accepted proposal/spec have
   required discovery, coordination, follow-up tasks, or an explicit execution
   warning.
10. Task boundaries or non-goals do not contradict accepted proposal/spec
    scope.

## Decision Rules

- Default to `[OKAY]`.
- Use `[REJECT]` only for true blockers.
- A rejection may list at most 3 issues.
- Do not reject for style preferences or optional improvements.
- Preserve the exact `[OKAY]` and `[REJECT]` tokens across every runtime; they
  are portable review semantics, not runtime-specific syntax.

## Output Format

If the plan is executable:

```text
[OKAY]
- Brief confirmation that the plan is executable.
- Optional note on any non-blocking caution.
```

If the plan has blockers:

```text
[REJECT]
1. <blocking issue>
2. <blocking issue>
3. <blocking issue>
```

For each rejected issue, include:

- why it blocks execution
- the smallest concrete fix

## Anti-Patterns

- No nitpicking.
- No style opinions.
- No design questioning.
- No architecture redesign.
- No expanding the scope of review beyond blockers.
- Do not return more than 3 rejection issues.

## Review Standard

Approve when a competent implementer can execute the plan without guessing about
critical paths, missing files, or missing verification instructions.
