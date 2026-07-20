---
name: thoth-sdd
description: Run thoth-agents Direct, Accelerated, or Full specification-driven development with Spec Kit-grade artifacts, OpenSpec-style durable deltas, fast-forward planning, and oracle-only analysis and verification.
---

# Thoth SDD

Assess the work, recommend the lightest route that preserves correctness, and
let the user select:

- **Direct**: `implement -> verify`
- **Accelerated**: `specify -> plan -> tasks -> implement -> verify -> archive`
- **Full**: `explore -> specify -> plan -> tasks -> implement -> verify -> archive`

Conditional phases are `clarify`, `checklist`, `plan-review`, and `converge`. Direct creates no
SDD artifacts and may cover multiple documentation or mechanical files when the
intent is clear and risk is low.

Accelerated is a **fast-forward** route: root writes `spec.md`, `plan.md`, and
`tasks.md` in one uninterrupted pass and creates optional artifacts only for a
concrete risk. After `ready`, both artifact-backed routes pause once to offer
`Review plan with Oracle (Recommended)` or `Proceed without review`. Full uses
separate planning gates because uncertainty or failure cost justifies them.

An explicitly named route counts as the user's selection. Otherwise assess and
recommend Direct, Accelerated, or Full, then wait for the user to choose; the
recommendation is not the decision. A generic request to “use SDD” makes
Accelerated the minimum recommendation but does not force it.

## Ownership

- Root owns sequential coordination artifacts, gate execution, and archive.
- Explorer owns Full-route repository discovery.
- Designer, quick, deep, or root may implement according to scope.
- Oracle owns `plan-review` when the user selects it and **every** `verify`. The
  implementation writer never approves its own work.

## Progressive loading

Use only installed local contracts during the pipeline. Never invoke the
thoth-agents CLI, `npx skills add`, or a network fetch to advance an SDD phase.
If a required contract or external skill is missing, stop and report an
incomplete installation instead of provisioning it mid-workflow.

Read only the current phase contract:

| Phase | Contract |
| --- | --- |
| explore | `references/phases/explore.md` |
| specify | `references/phases/specify.md` |
| clarify | `references/phases/clarify.md` |
| plan | `references/phases/plan.md` |
| checklist | `references/phases/checklist.md` |
| tasks | `references/phases/tasks.md` |
| plan-review | bundled `plan-reviewer` skill |
| implement | `references/phases/implement.md` |
| verify | `references/phases/verify.md` |
| converge | `references/phases/converge.md` |
| archive | bundled `thoth-archive` skill |

## Validation gates

Run the validator from this skill directory:

```text
node scripts/validate.mjs --change openspec/changes/<feature> --route <accelerated|full> --through <specify|plan|tasks|checklist|ready|closeout> --json
```

- **Accelerated**: `specify`, then `ready` after the fast-forward planning pass,
  then `closeout` after independent verification and an archive report marked
  `READY`.
- **Full**: `specify`, `plan`, `tasks`, then `ready` before the optional review
  choice or implementation, and `closeout` after independent verification.
- **Checklist**: run only when activated; the later `ready` gate includes it if
  present.

`ready` validates the artifacts needed before the user chooses
`Review plan with Oracle (Recommended)` or `Proceed without review`. Review
approval remains separate from implementation confirmation and never satisfies
final verification.
`closeout` additionally requires completed tasks, independent oracle PASS,
complete FR/buildable-SC evidence, an observed PASS or explicit residual RISK
for every outcome SC, and an archive report ready for the transactional archive
transition.

When implementation evidence refines the same intent, root updates the canonical
artifact and revalidates only affected downstream artifacts/gates. A changed
intent starts a new change. Structural validation prevents malformed artifacts;
oracle still judges completeness, correctness, coherence, and evidence.
