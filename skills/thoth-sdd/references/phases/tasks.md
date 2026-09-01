# Tasks contract

**Owner**: root<br>
**Output**: `openspec/changes/<feature>/tasks.md`

Start from `<skill-dir>/templates/tasks.md`, where `<skill-dir>` is the directory
containing the installed `thoth-sdd/SKILL.md`.

Every executable line uses exactly:

```text
- [ ] T### [P?] [US#?] description with FR-###/SC-### coverage in `exact/path` | Verify: observable outcome
```

IDs start at `T001` and remain unique and sequential across the entire file;
never reset numbering per story or section. `[P]`, when present, precedes
`[US#]`; omit `[US#]` only for shared setup or closeout. Before `| Verify:`, use
exactly one backtick span containing one literal repository-relative path and no
placeholder, glob, absolute path, URI, home path, or repository escape. Cover
every FR and **buildable** SC. Outcome SCs remain verification targets but do
not justify artificial implementation tasks.

Order test-first work before its implementation, group tasks by independently
deliverable story, identify the MVP, and state dependencies. `[P]` is permitted
only for tasks assigned to a declared lane whose mutable path union does not
overlap another lane in the same group. If there is no safe parallel work, use
`- None: <evidence-backed reason>` instead. Avoid ceremonial tasks.

## Parallel execution

Declare safe work with this exact grammar:

### Group P1

- Lane L1: T001 -> T002 | Owner: deep
- Lane L2: T003 -> T004 | Owner: quick
- Prerequisites: None
- Barrier: Final verification
- Rationale: Both lane path sets are disjoint and neither lane consumes peer output.

Groups and lanes are sequential and unique. Every `[P]` task belongs to exactly one lane; non-`[P]` tasks do not. Lane surfaces are the union of exact task
paths, and lanes in a group have disjoint surfaces and no cross-lane dependency.
Prerequisites name known tasks outside the group; the barrier is a downstream
task or `Final verification` after all lane members. If no group exists, use
only `- None: <evidence-backed reason>` and no task may use `[P]`.
