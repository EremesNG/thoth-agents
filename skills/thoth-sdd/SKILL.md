---
name: thoth-sdd
description: Run thoth-agents Direct, Accelerated, or Full specification-driven development with Spec Kit-grade artifacts, OpenSpec-style durable deltas, fast-forward planning, and proportional independent verification.
license: MIT
compatibility: Requires Node.js >=22.13 for bundled validation scripts.
metadata:
  author: thoth-agents
  version: "1.0"
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
concrete risk. After `ready`, both artifact-backed routes offer
`Review plan with Oracle (Recommended)` or `Proceed without review`. Full uses
separate planning gates because uncertainty or failure cost justifies them.

An explicitly named route counts as the user's selection. Otherwise assess and
recommend Direct, Accelerated, or Full, first summarize the relevant request
context, scope, clarity, risk, and why the recommendation fits, then ask. When a
native route question returns answerless, make at most three total attempts;
after the third answerless result, treat the recommended route as selected. Any
explicit answer wins. A generic request to “use SDD” makes Accelerated the
minimum recommendation but does not force it.

At the post-`ready` review choice, an explicit answer wins, including
`Proceed without review`. When the native question returns answerless, make at
most three total attempts; after the third answerless result, treat
`Review plan with Oracle (Recommended)` as selected. Once review is selected,
repair actionable same-intent planning blockers, revalidate affected gates, and
use a fresh Oracle for every new approval round until `[OKAY]`; stop instead on
a material human-owned blocker.

These bounded fallbacks apply only to the route, plan-review, and implementation
questions. Never apply them to secrets, destructive or security-sensitive
actions, or material human-owned product or architecture decisions.

## Ownership

- Root owns sequential coordination artifacts, gate execution, and archive.
- Explorer owns Full-route repository discovery.
- SDD routes govern artifacts and gates, not implementation ownership. Root,
  `designer`, `quick`, or `deep` may implement in Direct, Accelerated, or Full.
- Root decides ownership from explicit safe user direction and demonstrated net
  gain. Delegation benefits include specialization, context isolation,
  independent bounded work, quality, latency, or total cost; root continuity
  benefits include short or sequential work, shared mutable state, accumulated
  context, rediscovery, and coordination overhead. Route, file count, or cheaper
  model price alone never selects an owner.
- Only after deciding to delegate implementation, select `designer` for UI/UX,
  `quick` for known narrow low-risk work, or `deep` for coupled, edge-case-heavy,
  migration, concurrency, shared-contract, or high-risk work.
- Each mutable surface has one writer; independent non-overlapping surfaces may
  split, while coupled surfaces use one `deep` writer and ordered handoffs.
- Oracle owns `plan-review` when review is explicitly selected or chosen by the
  bounded recommended fallback. Every route requires
  mandatory verification, but final-verification ownership is proportional:
  trivial deterministic Direct work may be verified by Root when Root is not
  self-approving its own implementation; materially risky Direct work and every
  Accelerated or Full final verify require a fresh read-only Oracle. The
  implementation writer never approves its own work.

## Progressive loading

Resolve `<skill-dir>` as the directory containing this `SKILL.md`, and resolve
`<skills-root>` as its parent directory. Every bundled path below is anchored to
one of those installed roots, never to the project or current working directory.

Use only installed local contracts during the pipeline. Never invoke the
thoth-agents CLI, `npx skills add`, or a network fetch to advance an SDD phase.
If a required contract or external skill is missing, stop and report an
incomplete installation instead of provisioning it mid-workflow.

Read only the current phase contract:

| Phase | Contract |
| --- | --- |
| explore | `<skill-dir>/references/phases/explore.md` |
| specify | `<skill-dir>/references/phases/specify.md` |
| clarify | `<skill-dir>/references/phases/clarify.md` |
| plan | `<skill-dir>/references/phases/plan.md` |
| checklist | `<skill-dir>/references/phases/checklist.md` |
| tasks | `<skill-dir>/references/phases/tasks.md` |
| plan-review | `<skills-root>/plan-reviewer/SKILL.md` |
| implement | `<skill-dir>/references/phases/implement.md` |
| verify | `<skill-dir>/references/phases/verify.md` |
| converge | `<skill-dir>/references/phases/converge.md` |
| archive | `<skills-root>/thoth-archive/SKILL.md` |

## Validation gates

Run the validator from its installed absolute path:

```text
node "<skill-dir>/scripts/validate.mjs" --change openspec/changes/<feature> --route <accelerated|full> --through <specify|plan|tasks|checklist|ready|closeout> --json
```

- **Accelerated**: `specify`, then `ready` after the fast-forward planning pass,
  then `closeout` after independent verification and an archive report marked
  `READY`.
- **Full**: `specify`, `plan`, `tasks`, then `ready` before the optional review
  choice or implementation, and `closeout` after independent verification.
- **Checklist**: run only when activated; the later `ready` gate includes it if
  present.

`ready` validates the artifacts needed before the explicit or bounded-default
`Review plan with Oracle (Recommended)` / `Proceed without review` choice.
Review approval remains separate from implementation confirmation and never
satisfies final verification.
`closeout` additionally requires completed tasks, independent oracle PASS,
complete FR/buildable-SC evidence, an observed PASS or explicit residual RISK
for every outcome SC, and an archive report ready for the transactional archive
transition.

When implementation evidence refines the same intent, root updates the canonical
artifact and revalidates only affected downstream artifacts/gates. A changed
intent starts a new change. Structural validation prevents malformed artifacts;
oracle still judges completeness, correctness, coherence, and evidence.
