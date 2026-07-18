---
name: requirements-interview
description: Mandatory step-0 requirements discovery for non-trivial work before any implementation or SDD routing decisions.
metadata:
  author: thoth-agents
  version: '1.0'
---

# Requirements Interview Skill

Use this skill as the mandatory step-0 entry point for non-trivial requests.
The goal is requirement clarity, scope calibration, and a user-approved
handoff path before implementation begins.

## Shared Conventions

- [../_shared/openspec-convention.md](../_shared/openspec-convention.md)
- [../_shared/persistence-contract.md](../_shared/persistence-contract.md)
- [../_shared/thoth-mem-convention.md](../_shared/thoth-mem-convention.md)

## HARD GATE

- Do not implement during the requirements interview.
- Do not write code.
- Do not patch files.
- Do not create formal SDD artifacts until the user approves the route.

## Root Session Bootstrap

This skill is normally loaded by the root/main orchestrator at the start of a
new root session. When provider-backed continuity is requested, installed provider guidance is authoritative for its mechanics. Preserve the real user
request, accepted interview decisions, scope, and constraints as authorized
continuity outcomes without treating subagent prompts, generated handoffs, or
interview scaffolding as user intent.

At the interview handoff boundary, request a resumable summary or checkpoint outcome when provider-backed continuity is evidenced.

If the required provider capability or authorization cannot be evidenced,
report the affected continuity as degraded or unsupported and continue only
with provider-independent work whose own prerequisites are satisfied.

## Blocking User Input Surface Requirement

- The interview flow MUST use the active harness blocking user input surface
  for user-input prompts.
- Do not embed interview questions as plain prose in normal response text when
  a blocking user input surface exists.
- Prefer one focused blocking input call at a time for the core interview loop.
- Use short headers (<=30 chars), concise option labels, and concrete
  descriptions.
- Put the recommended option first and include `(Recommended)` in that label.
- Do not add an `Other` option manually when the active harness already adds or
  supports custom input. Use the equivalent runtime option unless custom input
  must be disabled.
- Use multi-select only when multiple simultaneous selections are genuinely
  valid. Use the equivalent runtime option if one exists.

## Workflow

### Phase 1: Discovery Context Gathering

1. Always use the semantic explorer role for codebase context. Use the
   semantic librarian role for external APIs, dependency versions, library
   migration, or public documentation.
2. Collect only the minimum context needed to improve questions and reduce
   user repetition.
3. Prefer facts from the codebase and known references over asking the user
   for information the environment can answer.

### Phase 2: Requirements Interview

1. Ask each interview question through the blocking user input surface.
2. Ask 1 blocking input call at a time.
3. Ask at most 5 total questions.
4. Prefer multiple-choice questions when practical.
5. Stop early when clarity is already sufficient.
6. Focus on what the user truly needs, not only the first phrasing of the
   request.
7. Surface unstated assumptions and validate them with the user.
8. Guide the user toward potentially better options when appropriate, but never
   impose a decision.
9. Always ask and confirm; never choose on the user's behalf.
10. Do not ask for details that the codebase, task artifacts, or gathered
   context already answer.
11. Enforce scope faithfulness: scope calibration must not silently shrink the
    user's stated intent.
12. Alignment note: a genuine decision fork left unresolved at interview is not
    settled here — downstream it becomes either a `[NEEDS CLARIFICATION]`
    marker or a recorded entry in the spec's `## Assumptions` section
    (informed-guess-first). This note is alignment only; the interview does not
    own the clarification cap or the Assumptions gate.

### Phase 3: Complexity Assessment

Evaluate these 6 dimensions. Rate each as **Low**, **Medium**, or **High**:

| Dimension | Low | Medium | High |
| --- | --- | --- | --- |
| **Logic depth** | Copy, CSS, rename, simple wiring | Localized behavior tweak, validation, one workflow step | Algorithm, state-machine, or business-rule rewrite with many invariants |
| **Contract sensitivity** | Presentation only, internal refactor | User-visible behavior change in one flow | API, schema, data model, migration, auth, privacy, or public contract |
| **Context span** | Can be done in one bounded pass | Several dependent edits or choices to coordinate | Many sequential steps where earlier decisions must be remembered |
| **Discovery need** | Request and acceptance criteria are already clear | Some ambiguity, a few viable approaches | Goal is clear but solution requires investigation or tradeoff analysis |
| **Failure cost** | Mistakes are obvious and cheap to revert | Needs integration or regression checks | Subtle correctness bugs, customer-facing, data, or compliance impact |
| **Concern coupling** | Single concern | Two related concerns | Multiple independent concerns that could conflict |

### Phase 4: Approach Proposal

1. Present 2-3 viable options as recommendations, not decisions.
2. For each option, give the main trade-offs and when it is a good fit.
3. Mark one option as the current recommendation and explain why.
4. Use the active harness blocking user input surface to confirm the preferred
   approach before moving on.

### Phase 5: User Approval Gate

Present:

- Summary of understanding
- Broad user intent and product goal
- Accepted scope boundaries
- Deferred or unresolved affected areas that still belong to the accepted goal
- Explicit exclusions and why they are excluded
- Scope classification and why
- Recommended approach options
- Proposed handoff path

Then wait for explicit user confirmation.

Use the active harness blocking user input surface for this approval gate.

Nothing proceeds without explicit approval in this phase. The user is the sole
approver during requirements discovery. Do not request oracle review here.

### Phase 6: Handoff

Recommend a route based on the complexity assessment, then wait for the
user to confirm it:

**Direct implementation** — when all of:
- No dimensions rated High
- At most one dimension rated Medium
- Contract sensitivity is Low
- Failure cost is Low

**Accelerated SDD** (`sdd-explore -> propose -> tasks`) — when:
- 2-3 dimensions are Medium, or
- 1 dimension is High in logic depth, context span, or discovery need
- But contract sensitivity and failure cost are not High

**Full SDD** (`sdd-explore -> propose -> spec -> clarify -> design -> tasks`) — when any of:
- Contract sensitivity is High
- Failure cost is High
- 2 or more dimensions are High
- Discovery need is High and at least one other dimension is
  Medium or High
- Concern coupling is High with risk of conflicting decisions

Quick decision heuristics:

1. Cosmetic work routes direct regardless of file count.
2. Dense logic rewrites route to at least accelerated SDD regardless
   of file count.
3. End-to-end UX redesign across screens/workflows is usually full SDD when
   user-flow contracts, behavior contracts, or multiple concerns are involved.
4. External contracts (API, schema, migration, auth, privacy) usually
   need full SDD.
5. If the model must remember decisions across many steps, write them
   down — that means SDD.
6. Tie-breaker: unsure between direct and accelerated, choose
   accelerated. Unsure between accelerated and full, ask: 'Do we
   need a durable behavior contract?' If yes, full SDD.

Before any SDD generation starts, present the artifact store policy choice:

```text
How would you like to persist planning artifacts?
1. none — No persistence. Ephemeral exploration, privacy-sensitive work, or when no backend is available. Results are inline only and not saved across sessions.
2. thoth-mem — Memory only. Lightest token cost. No repo files.
3. openspec — Repo files only. Visible and reviewable.
4. hybrid — Both. Maximum durability, higher token cost.
Default: hybrid
```

Collect this choice with the active blocking user input surface rather than
plain prose.

When the user selects a mode that includes OpenSpec (`openspec` or `hybrid`),
verify that `openspec/` is initialized AND not stale. If it is not initialized,
or it exists but is stale (`config.yaml` missing one or more mechanism sections
/ toggles, or `openspec/memory/constitution.md` absent), recommend running the
`sdd-init` skill before proceeding so it can additively realign the project.

Once route, persistence mode, and initialization are confirmed, hand off to the
corresponding SDD pipeline phase. The handoff MUST include:
- `pipeline-type`: `accelerated` or `full` (matching the confirmed route)
- `persistence-mode`: the user's chosen artifact store mode
- `change-name`: derived from the approved scope

Hand off to:

- **Explore**: delegate read-only repository discovery to explorer before artifact-producing phases.
- **Propose**: [../sdd-propose/SKILL.md](../sdd-propose/SKILL.md)
- **Spec** (full SDD only): [../sdd-spec/SKILL.md](../sdd-spec/SKILL.md)
- **Clarify** (full SDD only): [../sdd-clarify/SKILL.md](../sdd-clarify/SKILL.md)
- **Design** (full SDD only): [../sdd-design/SKILL.md](../sdd-design/SKILL.md)
- **Tasks**: [../sdd-tasks/SKILL.md](../sdd-tasks/SKILL.md)

Do not silently choose the handoff route or artifact store mode. Recommend,
ask, and wait.

## Guardrails

- Maximum 5 interview questions.
- Ask only one blocking input call at a time.
- Do not ask what codebase context can answer.
- Do not skip explicit user approval.
- Do not auto-select the handoff route.
- Do not auto-select the persistence mode.
- Never convert recommendations into unilateral decisions.
- Do not replace blocking input prompts with plain-text interview questions
  when the harness exposes a blocking user input surface.
- Do not narrow accepted scope by omission; surface broad intent, accepted
  scope, deferred or unresolved affected areas, and explicit exclusions before
  SDD handoff.

## Anti-Patterns

- Question dumping
- Option inflation
- Premature implementation
- Silent route selection
- Silent persistence-mode selection
- Treating discovery as optional
