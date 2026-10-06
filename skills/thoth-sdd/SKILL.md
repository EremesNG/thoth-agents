---
name: thoth-sdd
description: Apply proportional understanding and risk-aware SDD classification, with one ID-named record for substantial changes.
license: MIT
compatibility: Requires Node.js >=22.19 for bundled product validation.
metadata:
  author: thoth-agents
  version: "2.0"
---

# Thoth SDD

Every change begins with three proportional reasoning steps, in order:

1. **Explore** enough repository and user context to understand the current
   behavior, constraints, and uncertainty.
2. **Specify** the intended outcome, non-goals, and observable acceptance in
   concise working notes.
3. **Clarify** material uncertainty. Use evidence or a safe bounded assumption
   when it preserves the user's intent; ask only when a material human-owned
   decision cannot safely be inferred. An unresolved material decision blocks
   classification and implementation.

The root orchestrator owns completing these steps at a scale appropriate to the
change; discovery ownership follows the root delegation policy. The sequence
does not itself force a saved document, specialist-agent dispatch, or interview;
the root delegation policy determines staffing. The understanding sequence is
mandatory. Only after all three steps are complete does the orchestrator classify
using scope, uncertainty, and risk. Scope or risk that increases during implementation
reopens understanding and classification before further work. Never silently
resolve material product, architecture, security, or destructive choices.

## Proportional classification

- **Small** means local impact, clear intent, and low risk. Local work may touch
  several files within one area; file count alone never increases scope. Use
  test-first implementation and focused verification; create no persistent
  change record.
- **Substantial** means coordinated impact across multiple areas, cross-cutting
  contract changes, material uncertainty, or elevated failure/contract risk. A
  small patch can still be substantial when its risk demands planning. Persist
  one record, plan and validate before implementation, then independently
  verify and archive.

A user request cannot bypass the understanding sequence or material clarification.
Do not auto-increment package versions. Use native harness lifecycle and status;
never build a scheduler, state mirror, or process tooling.

## Ownership and decisions

Root owns user intent, scope, material decisions, classification, and final
acceptance. Root also owns completing understanding, while the specific discovery
ownership policy determines who gathers evidence; that policy takes precedence
over generic permission for root to inspect directly. Choose an implementation
owner from the actual task shape after classification, following
specialist-default ownership and bounded direct-work exceptions.
Root retains known low-risk mechanical work, including reviewed commits, without
rediscovery.
Explicit direct-work or no-delegation instructions win. Preserve operator-selected
model and effort, including max. Keep one writer per mutable surface.

Every orchestrator choice with a meaningful recommended action states that
recommendation. Track confirmed answerless native returns separately per
question: after the first and second, repeat the same question without starting
dependent work; after the third, select the recommendation. Explicit answers win
and explicit `Stop` always wins. Pending, unavailable, failed, interrupted, or
host-prohibited attempts do not count. Report higher-priority host limits
accurately; do not claim three returns or an explicit user choice when they did
not occur. Never invent missing facts or secrets. When a human-owned choice
remains unresolved, a safe deferral can be the recommendation and leaves the
decision open.

At substantial `ready`, first show the user a concise plan summary (goal,
acceptance, key decisions, units, risks, record path), then always offer
`Review plan with Oracle (Recommended)` or `Proceed without review`, even when implementation was already authorized.
Silence is never an explicit review skip; run a fresh read-only review only when
selected. After a selected `[OKAY]`, separately offer `Implement (Recommended)` /
`Stop`; prior explicit authorization remains valid, while an explicit later
`Stop` supersedes it. Record the plan-review selection as
`EXPLICIT_REVIEW`, `EXPLICIT_SKIP`, or `DEFAULT_REVIEW_AFTER_3`; `SKIPPED`
requires `EXPLICIT_SKIP`, and `OKAY` requires an explicit review or the third-
return review default. A review result does not authorize implementation. Final
verification is always required: small low-risk work can use focused root
verification, while substantial or materially risky work requires a fresh
independent Oracle. An implementation writer never approves its own work. If the
user forbids delegation, perform authorized work directly but report unavailable
independent review; never claim independent PASS or archive.

## Bounded execution

Apply these rules across all workflow stages. Each assignment names one
independently acceptable outcome, exact known entrypoints and skill paths,
concrete accepted inputs and dependencies, its produced result, owned writes and
interface boundaries, focused checks with pass evidence, and a meaningful return
milestone and stop condition. A task row names one outcome and may repeat an
`AC-n` when useful; split phases with separately acceptable outcomes and keep
tiny cohesive mechanical edits together. Independent, precise Explorer questions
may run in parallel within native capacity; dependent questions wait until root
accepts the named upstream output. Do not duplicate discovery. Missing inputs or
interfaces, conflicting ownership, a new independent outcome, or material scope
growth returns bounded progress to root for reassessment before expansion. Root reacts to
native attention or a missed agreed milestone; a timeout is not a progress plan.
After two consecutive attempts without new evidence or progress, return the
smallest blocker rather than looping. Use native notifications/waits without
polling or custom timers. Freeze relevant inputs before final validation, reuse fresh checks,
and preserve substantive handoffs across late notifications. Load the
[implementation phase](references/phases/implement.md) for the concrete procedure.

## The sole substantial-change record

After substantial classification, create only
`.thoth/changes/<id>/<id>.md` from
`<skill-dir>/templates/change.md`. Use a safe lowercase kebab-case ID; reject
Windows-reserved names and unsafe path components. The record covers grounded
exploration, intent, non-goals, acceptance, material clarifications and settled
decisions, declared durable deltas, technical plan, tasks, authorization,
verification, and closeout. The record is the only per-change artifact. Do not
create sidecar specifications, plans, task lists, checklists, review or
verification reports, evidence directories, worker reports, scripts, execution
wrappers, or evidence generators, including temporary ones.

A durable delta uses `- \`ADDED capability\` **Exact title** — Normative statement.`
(or `MODIFIED`, `REMOVED`, `RENAMED capability FROM Previous title`). Every
non-removal includes `  - GIVEN ...; WHEN ...; THEN ... .` Before review, verify
the exact canonical baseline under `.thoth/specs/<capability>/spec.md`. In the
same change record's Verification section, include exactly one reviewed source
entry for every affected capability: the existing file's `sha256:<digest>` or
`absent` if no canonical spec exists. `ADDED` may target either an existing or
absent capability; other operations require an existing matching baseline. The
validator checks each digest or reviewed absence at closeout, not semantic
quality.

Archiving moves the same record to
`.thoth/changes/archive/YYYY-MM-DD-<id>/<id>.md`; the date prefixes only the
directory and never changes the record filename or identity. Preserve historical
changes and fail closed on collisions or symlinked ancestors.

## Progressive phase loading

Resolve `<skill-dir>` as this SKILL.md's directory and `<skills-root>` as its
parent. Read only the current phase under
`<skill-dir>/references/phases/{explore,specify,clarify,plan,checklist,tasks,implement,verify,converge}.md`;
plan review and archive are sibling skill contracts. Use installed local assets
only; do not provision skills or run a network installer mid-workflow.

## Gates and CLI

```text
node "<skill-dir>/scripts/validate.mjs" --change .thoth/changes/<id> --through <explore|specify|clarify|plan|tasks|checklist|ready|closeout> --json
```

The early gates validate the one record proportionally. `plan` validates without
requiring tasks. `tasks` and `ready` require concrete coverage of every accepted
outcome. `ready` requires settled material decisions before the mandatory
plan-review offer or implementation authorization. `closeout` requires complete
tasks, review disposition plus `**Plan review selection**` provenance
(`EXPLICIT_REVIEW`, `EXPLICIT_SKIP`, or `DEFAULT_REVIEW_AFTER_3`) and
implementation authorization, a fresh independent Oracle PASS, every acceptance
outcome with concrete PASS check/evidence, a matching record SHA-256 and reviewed
source SHA-256 digests. The initial `PENDING` selection placeholder is allowed
before closeout only. `SKIPPED` requires `EXPLICIT_SKIP`; `OKAY` requires an
explicit review or `DEFAULT_REVIEW_AFTER_3`. Every canonical spec affected
by a durable delta must have exactly one `Source` entry in the same record:
`- Source: .thoth/specs/<capability>/spec.md | sha256:<digest>` when present, or
`- Source: .thoth/specs/<capability>/spec.md | absent` when absent. Missing or
stale coverage blocks closeout and archive. Calculate the record hash from exact
UTF-8 bytes preceding `## Verification`; update it only after a fresh independent
review if that prefix changes. Structural validation is not human authorization
or independent approval. Oracle examines the actual diff and checks, not just
listed file digests.

Archive with the installed sibling `thoth-archive` only after closeout passes.
