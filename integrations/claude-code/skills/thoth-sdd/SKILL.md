---
name: thoth-sdd
description: Run thoth-agents Direct, Accelerated, or Full specification-driven development with Spec Kit-compatible artifacts and oracle-only analysis and verification.
---

# Thoth SDD

Select the lightest route that preserves correctness:

- **Direct**: `implement -> verify`
- **Accelerated**: `specify -> plan -> tasks -> implement -> verify -> archive`
- **Full**: `explore -> specify -> plan -> tasks -> analyze -> implement -> verify -> archive`

Conditional gates are `clarify`, `checklist`, and `converge`. Direct creates no
SDD artifacts. Accelerated retains the fast pipeline but uses the same canonical
formats and structural validator as Full.

## Ownership

- Root executes sequential coordination: specify, clarify, plan, checklist,
  tasks, converge, persistence of review reports, and archive.
- Explorer owns Full-route repository discovery.
- Designer, quick, deep, or root may implement according to scope.
- Oracle always owns `analyze` and **every** `verify`, including Direct and
  Accelerated. The implementation writer never reviews itself.

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
| analyze | `references/phases/analyze.md` |
| implement | `references/phases/implement.md` |
| verify | `references/phases/verify.md` |
| converge | `references/phases/converge.md` |
| archive | use the bundled `thoth-archive` skill |

Use templates from `templates/`. Before advancing an artifact-backed phase, run:

```text
node scripts/validate.mjs --change openspec/changes/<feature> --route <accelerated|full> --through <specify|plan|tasks|checklist|final> --json
```

Use the gate that has just completed: `specify` after the specification, `plan`
after planning, `tasks` after decomposition, `checklist` after a conditional
checklist pass, and `final` before implementation/analysis and again before
archive. Planning and later gates require the project Constitution; the
checklist gate also requires a completed plan and checked checklist. A gate
never requires artifacts from a later phase.

Structural validation does not replace oracle judgment. It prevents malformed
artifacts; oracle challenges correctness and evidence.
