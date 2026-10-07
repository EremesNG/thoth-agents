# Proposal: Codify the SDD Verify Phase as an Autonomous Verify-Loop

## Intent

The SDD pipeline currently documents the IMPLEMENTATION → VERIFY → ARCHIVE
sequence as a linear happy path. The plan-review phase already has a real
control-flow loop: it blocks until `oracle` returns `[OKAY]`, with an explicit
reject branch. The verify phase has no such loop. `sdd-verify` can return
`fail` or `pass with warnings`, but the encoded workflow only describes the
clean-pass continuation ("delegate sdd-verify, then sdd-archive when
verification passes"). There is no defined fail branch, no remediation-and-
re-verify cycle, and no termination/escalation rule.

This change codifies the verify phase as an AUTONOMOUS, BOUNDED verify-loop
that mirrors the plan-review loop's discipline: on `fail`, dispatch a targeted
fix and re-verify; on `pass with warnings`, escalate a decision to the user; on
clean `pass`, proceed to the existing user gate then archive. The loop is
bounded to 3 rounds and escalates to the user on exhaustion.

## Scope

### In Scope

- **Verify-loop control flow** in the unified orchestrator SDD wording
  (`src/agents/prompt-sections.ts`, `createOrchestratorPromptSections`,
  `<sdd>` section). Replace the single linear post-execution line (~L377) with
  an explicit branch set:
  - `fail` → dispatch a TARGETED fix (re-run `sdd-apply`) scoped by verify's
    Critical Issues, then re-verify.
  - `pass with warnings` → ESCALATE a decision to the user (advance to archive
    vs re-iterate to clear warnings) via the harness blocking input surface
    (`AskUserQuestion` / `{{userQuestionTool}}`). No auto-advance, no auto-loop.
  - clean `pass` → proceed to the existing user gate, then `sdd-archive`.
- **Bound and escalation**: max 3 rounds total = initial apply→verify plus up
  to 2 fix→re-verify rounds. On exhaustion, escalate to the user via the
  blocking input surface rather than looping indefinitely.
- **Phase contract** (`src/harness/core/sdd.ts`, `SDD_PHASES`): model the
  `verify` phase (order 10) as an iterative gate, and represent the round bound
  in the contract so it is a machine-readable invariant rather than only prose.
  This likely requires extending the `gate` union (currently
  `'oracle-review' | 'user-confirmation'`) and/or adding a bound field on
  `SddPhaseContract`; see Risks for the contract-shape decision.
- **`sdd-verify` skill** (`src/skills/sdd-verify/SKILL.md`): emit ACTIONABLE
  remediation targets (file and/or scenario anchors) instead of prose-only
  Critical Issues, so the targeted fix dispatch has sharpened scope. Add
  retry/round semantics, including a `round N` marker in the report so the
  round counter is traceable across iterations.
- **`executing-plans` skill** (`src/skills/executing-plans/SKILL.md`,
  Phase 5 completion ~L183-191): describe the verify-loop phase rather than a
  single-shot "next step: sdd-verify" handoff.
- **Round-counter tracking**: define how the round number is carried across
  iterations (verify reports already use "round N" naming; reuse that as the
  source of truth) and surfaced in the verify report and progress tracking.

### Deferred / Needs Discovery

- Exact `SddPhaseContract` shape change (new `gate` enum member such as
  `iterative-verify` and/or a numeric bound field) is an implementation
  decision to settle during tasks/apply; the proposal commits to representing
  the loop and bound in the contract, not to a specific field name.
- Whether the `pass with warnings` escalation should be modeled as its own
  gate value or handled inline in orchestrator prose.

### Out of Scope

- Any change to the plan-review loop or its `[OKAY]`/`[REJECT]` semantics.
- Any change to `sdd-archive`'s blocking rule; it already refuses to archive on
  unresolved critical failures and stays as-is.
- Per-harness duplication: the SDD pipeline is a unified single source across
  OpenCode / ClaudeCode / Codex. No harness-specific verify-loop variants are
  introduced.
- Changing the clean-pass user gate that already precedes archive.

## Approach

Encode the loop in the existing UNIFIED source so all harnesses inherit it:

1. **Orchestrator prose** (`prompt-sections.ts`) becomes the control-flow
   narrative: it defines the three verdict branches, the 3-round bound, the
   targeted-fix re-dispatch using Critical Issues as scope, and the escalation
   to the blocking input surface on warnings and on round exhaustion. This
   mirrors the plan-review loop's "complete only after [OKAY]" pattern.
2. **Phase contract** (`sdd.ts`) makes the loop machine-readable: the `verify`
   phase is marked iterative and the round bound is represented in the
   contract, so the invariant is not prose-only.
3. **`sdd-verify` SKILL** upgrades output: Critical Issues become actionable
   remediation targets (file/scenario anchors), and the report carries an
   explicit `round N` marker plus retry semantics so the orchestrator can track
   iteration state from the artifact.
4. **`executing-plans` SKILL** documents the verify-loop as the post-apply
   phase so executors expect iteration, not a single verify shot.

## Affected Areas

| Area | File | Change |
| --- | --- | --- |
| Orchestrator SDD wording | `src/agents/prompt-sections.ts` (~L344-378) | Add fail/warnings branches, bound, escalation; replace linear L377 |
| Phase contract | `src/harness/core/sdd.ts` (`SDD_PHASES` ~L189-201, types ~L19-40) | Model verify as iterative gate; represent round bound |
| Verify skill | `src/skills/sdd-verify/SKILL.md` (~L81-99) | Actionable remediation targets; round/retry semantics |
| Executing-plans skill | `src/skills/executing-plans/SKILL.md` (~L183-191) | Verify-loop phase wording |
| Archive skill | `src/skills/sdd-archive/SKILL.md` (~L49-50) | No change (confirmed unchanged) |

## Risks

- **Contract-shape ambiguity** (`From`: `gate?: 'oracle-review' |
  'user-confirmation'` with no iteration/bound field; `To`: an iterative-verify
  representation plus a round bound; `Reason`: make the loop a machine-readable
  invariant; `Impact`: type and any consumers of `SddPhaseContract.gate` must
  handle the new shape). Mitigation: keep the bound representation additive and
  enumerate consumers during tasks.
- **Prose/contract drift**: the round bound lives in both orchestrator prose
  and the contract; they must agree (3 rounds). Mitigation: single canonical
  number, cross-referenced in both.
- **Over-broad refixes**: if Critical Issues are not actionable, targeted fixes
  regress to full re-apply. Mitigation: the `sdd-verify` output upgrade is in
  scope precisely to prevent this.
- **Escalation surface portability**: Codex may differ from OpenCode on the
  blocking input primitive. Mitigation: reference the harness-neutral blocking
  input surface and report unsupported-capability if a harness lacks it.

## Rollback Plan

All changes are edits to unified prompt/contract/skill source files with no
data migration. Roll back by reverting the four edited files
(`prompt-sections.ts`, `sdd.ts`, `sdd-verify/SKILL.md`,
`executing-plans/SKILL.md`) to restore the prior linear post-execution wording
and the prior `gate` union. No archived artifacts or runtime state are altered.

## Success Criteria

1. Orchestrator SDD wording defines all three verify verdict branches (`fail`,
   `pass with warnings`, clean `pass`) with explicit next actions.
2. The verify-loop is bounded to 3 rounds (initial + 2 fix/re-verify) and
   escalates to the user on exhaustion via the blocking input surface.
3. `fail` triggers a targeted `sdd-apply` re-run scoped by verify's Critical
   Issues, followed by re-verify.
4. `pass with warnings` escalates an advance-vs-iterate decision to the user;
   it never auto-advances and never auto-loops.
5. The round counter is tracked across iterations and visible in the verify
   report (`round N`) and progress tracking.
6. The `verify` phase contract in `sdd.ts` represents the loop and the round
   bound in a machine-readable form.
7. `sdd-verify` emits actionable remediation targets (file/scenario anchors),
   not prose-only bullets.
8. No change is made to the plan-review loop or to `sdd-archive`'s refusal to
   archive on unresolved critical failures.
9. All changes live in the unified source; no per-harness verify-loop
   duplication is introduced.
