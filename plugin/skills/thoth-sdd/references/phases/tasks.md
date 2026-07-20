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
only when mutable paths provably do not overlap and the Parallel execution
section names a concrete pairing. If there is no safe parallel work, use
`- None: <evidence-backed reason>` instead. Avoid ceremonial tasks.
