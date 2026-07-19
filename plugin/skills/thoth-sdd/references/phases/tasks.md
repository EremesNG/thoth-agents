# Tasks contract

**Owner**: root<br>
**Output**: `openspec/changes/<feature>/tasks.md`

Every executable line uses exactly:

```text
- [ ] T### [P?] [US#?] description with FR-###/SC-### coverage in `exact/path` | Verify: observable outcome
```

IDs are unique and sequential. `[P]` means the task can safely run in parallel
without overlapping mutable files. `[US#]` links story work; omit it only for
genuinely shared setup or closeout. Order tests before implementation for
behavior changes, group work by independently deliverable story, identify the
MVP story, state dependencies, and include concrete parallel execution examples.
Every FR/SC must map to one or more tasks and every task must state a verification
outcome. Avoid ceremonial tasks for trivial edits.
