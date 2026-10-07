# Proposal: Redesign Root Orchestrator Instructions

## Intent
Redesign the thoth-agents root/orchestrator instruction contract so the root remains the accountable coordinator and decision engine while no longer behaving as an artificially blind router. The new contract should synthesize the strongest reference ideas: cost/speed/quality-aware delegation, evidence-led pushback, bounded direct checks, concise communication, and root-owned validation.

## Scope
### In Scope
- Root/orchestrator prompt semantics rendered for OpenCode and Codex.
- Delegation policy that permits small bounded local checks when cheaper than delegation.
- Explicit epistemic rigor: verify technical and user claims before relying on them, and correct mistaken assumptions with evidence and tradeoffs.
- Preservation of SDD governance, thoth-mem ownership, role roster, and multi-harness dialect overlays.
- Focused prompt rendering and Codex install tests that lock the new contract.

### Out of Scope
- Source implementation in this planning change.
- New agents, renamed roles, or new harness support.
- Runtime delegation engine, installer side effects, memory storage semantics, or OpenSpec lifecycle changes.
- Verbatim copying of external prompts or importing their command models.

## Approach
Replace the current absolute root prohibition on workspace inspection with a calibrated coordination contract: the root may perform small, bounded, local checks when they reduce overhead, but delegates broad search, multi-file edits, risky verification, UI visual QA, independent review, and implementation. Keep common semantic sections in `src/agents/prompt-sections.ts`, with harness wording supplied by `src/agents/prompt-dialects.ts` and Codex overlays where needed.

## Affected Areas
- `src/agents/prompt-sections.ts`
- `src/agents/prompt-dialects.ts`
- `src/agents/prompt-rendering.test.ts`
- `src/harness/adapters/codex.test.ts`
- `src/cli/codex-install.test.ts`
- Codex root rendering through `src/harness/adapters/codex.ts` if overlay expectations need adjustment.

## Risks
- Weakening delegate-first governance if bounded root checks are phrased too broadly.
- Reintroducing OpenCode-only wording into shared semantic sections.
- Conflicting with existing SDD and root-owned memory rules.
- Brittle tests if they assert prose too narrowly.

## Rollback Plan
Revert the prompt-section and test changes from the implementation commit, then rerun focused prompt and Codex install tests to confirm the previous root contract is restored.

## Success Criteria
- Root prompts preserve coordinator accountability while allowing bounded direct inspection.
- Delegation rules explicitly optimize for quality, speed, cost, and reliability.
- Prompts require claim verification, evidence-led correction, and tradeoff alternatives.
- OpenCode and Codex render harness-appropriate terminology without reference repo leakage.
- Focused tests pass for prompt rendering and Codex install surfaces.
