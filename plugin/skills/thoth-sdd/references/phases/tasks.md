# Tasks contract

**Owner**: root<br>
**Output**: `openspec/changes/<feature>/tasks.md`

Every executable line uses exactly:

```text
- [ ] T### [P?] [US#?] description with FR-###/SC-### coverage in `exact/path` | Verify: observable outcome
```

IDs are unique and sequential. `[US#]` links story work; omit it only for shared
setup or closeout. Cover every FR and **buildable** SC. Outcome SCs remain
verification targets but do not justify artificial implementation tasks.

Order test-first work before its implementation, group tasks by independently
deliverable story, identify the MVP, and state dependencies. `[P]` is permitted
only when mutable paths provably do not overlap and the Parallel execution
section names a concrete pairing. If there is no safe parallel work, use
`- None: <evidence-backed reason>` instead. Avoid ceremonial tasks.
