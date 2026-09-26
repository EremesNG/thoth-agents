# Implementation Plan: SDD unanswered-question defaults

## Technical context

The SDD lifecycle is instruction-driven across shared TypeScript prompt rendering, typed SDD phase protocols, bundled workflow skills, repository guidance, and generated harness packages. Native harness question tools remain authoritative; thoth-agents can specify how root interprets an answerless result but does not own timers or a retry runtime. The current durable `adaptive-sdd` requirements and constitution 6.0.0 require explicit route/review selections, so this change includes a governance amendment to 7.0.0 and synchronized durable deltas. Implementation is a coupled textual contract change with one root writer; delegation would add rediscovery and reconciliation cost without producing an independent mutable lane. Final verification remains assigned to a fresh read-only Oracle.

## Constitution Check (pre-design)

- **Adaptive-root orchestration**: JUSTIFIED EXCEPTION — The accepted request explicitly replaces indefinite explicit route selection with a bounded three-attempt recommended fallback; constitution amendment to 7.0.0 is part of this change.
- **Explicit role boundaries**: PASS — Root retains SDD artifacts and contract edits, Oracle remains read-only, and no role boundary changes.
- **Proportional Spec Kit-compatible SDD**: JUSTIFIED EXCEPTION — The accepted request redefines user-selected plan review when all three native prompts return unanswered; the plan preserves explicit answers and amends this principle before closeout.
- **Truthful multi-harness contracts**: PASS — The design states instruction-level enforcement and does not claim thoth-agents owns harness timers or question execution.
- **Independent provider ownership**: PASS — No thoth-mem installation, lifecycle, hook, MCP, or persistence contract changes.
- **Evidence-led completion**: PASS — TDD, affected contract checks, fresh Oracle plan review, and fresh Oracle final verification remain required.

## Design

### Requirement mapping

| Requirement | Technical decision | Files/interfaces | Verification seam |
| --- | --- | --- | --- |
| FR-001 | Extend the shared orchestrator SDD routing prose with a pre-question context summary, three total answerless attempts, recommended-route fallback, and explicit-answer precedence. | `src/agents/prompt-sections.ts`; `AGENTS.md`; `skills/thoth-sdd/SKILL.md` | Rendered OpenCode, Codex, and Claude root prompts in `src/agents/prompt-rendering.test.ts`; bundled root output assertions in harness tests. |
| FR-002 | Define ready-gate review fallback as Oracle review after three answerless results and require `[REJECT]` correction/revalidation/fresh-review convergence until `[OKAY]` or a material human-owned blocker. | `src/agents/prompt-sections.ts`; `src/harness/core/sdd.ts`; `skills/thoth-sdd/SKILL.md`; `skills/plan-reviewer/SKILL.md` | `getSddPhaseProtocol('plan-review')` assertions in `src/harness/core/sdd-protocol.test.ts`; bundled skill assertions in `src/harness/bundled-skills.test.ts`. |
| FR-003 | Require an approved-plan summary before the implementation decision, make `Implement (Recommended)` explicit, retry an answerless result no more than three total attempts, and treat the third answerless result as implementation selection. | `src/agents/prompt-sections.ts`; `src/harness/core/sdd.ts`; `skills/plan-reviewer/SKILL.md`; `skills/thoth-sdd/SKILL.md` | Shared prompt rendering and bundled-skill public contract tests; explicit assertions that stop still wins and `[OKAY]` alone is insufficient before the decision resolves. |
| FR-004 | Propagate identical semantics to maintained instructions, public documentation, durable requirements, constitution, its initialization template, and generated integration packages while stating that enforcement may be instruction-level. | `openspec/memory/constitution.md`; `skills/thoth-constitution/templates/constitution.md`; `openspec/specs/adaptive-sdd/spec.md` after archive; `openspec/specs/multi-harness-agent-pack/spec.md` after archive; `docs/agent/sdd-and-skills.md`; `docs/sdd-pipeline.md`; `docs/skills-and-mcps.md`; `README.md`; generated `plugin/` outputs | Constitution validator; SDD validator; bundled-skill/template contract tests; `pnpm run integration:sync`; `pnpm run integration:verify`; documentation/prompt contract tests. |

### TDD slices and agreed public seams

1. Red: add shared rendered-root assertions for the route context and three-attempt recommended fallback; Green: update the shared orchestrator prompt contract.
2. Red: add typed plan-review protocol assertions for default review, `[REJECT]` convergence, and the approved-plan implementation decision; Green: update the typed phase protocol.
3. Red: add bundled-skill assertions for route/review defaults across both `thoth-sdd` and `plan-reviewer`, then update each skill's activation/convergence contract; separately add rendered-root assertions for review-choice fallback and approved-plan implementation fallback, plus bundled-reviewer assertions for post-`[OKAY]` behavior, before their respective shared and reviewer contract changes.
4. Red: add bundled constitutional-template assertions before amending the active constitution and synchronizing its initialization template.
5. After green, simplify duplicate wording without changing semantics, synchronize generated packages, and run proportional checks.

The user selected this Accelerated plan after the proposed public seams were disclosed; implementation confirmation after Oracle approval is the final confirmation of these seams before tests are written.

## Optional support artifacts

- `research.md`: Not needed; the relevant behavior and ownership are established by current repository contracts.
- `data-model.md`: Not needed; no persisted runtime data or schema changes.
- `contracts/`: Not needed; `spec.md`, the typed SDD protocol, and existing skill contracts are the canonical interfaces.
- `quickstart.md`: Not needed; no new operator workflow or command is introduced.

## Risks and migrations

- **Governance redefinition**: Constitution principles 1 and 3 currently require an explicit user choice, and the initialization template repeats that boundary. Mitigation: amend 6.0.0 to 7.0.0, update the Sync Impact Report and amendment history, synchronize `skills/thoth-constitution/templates/constitution.md`, propagate all affected instructions, and run constitution plus bundled-template validation. Rollback: revert the amendment, template, and all linked behavioral contracts together.
- **Ambiguous retry count**: “Three times” can mean three attempts or three retries. Mitigation: every contract says “three total attempts.”
- **Unsafe default expansion**: Generic blocking questions must not auto-resolve. Mitigation: scope fallback exclusively to route, ready-gate plan review, and post-`[OKAY]` implementation decisions; explicitly exclude secrets, destructive/security-sensitive actions, and human-owned product/architecture decisions.
- **False runtime guarantee**: thoth-agents does not implement Codex timers. Mitigation: describe native answerless-result interpretation and disclose instruction-only enforcement where no programmable primitive exists.
- **Oracle loop nontermination**: A reviewer may identify an external decision rather than an actionable artifact defect. Mitigation: iterate only actionable same-intent planning defects and stop on a material human-owned blocker; each approval round uses a fresh Oracle.
- **Generated drift**: Canonical prompt/skill edits can diverge from `plugin/`. Mitigation: run integration sync and verify, then inspect the diff for generated scope.
- **Migration**: No data migration. Published behavior changes on the next generated package/install refresh.

## Constitution Check (post-design)

- **Adaptive-root orchestration**: PASS — The design includes a 7.0.0 amendment that preserves explicit-answer precedence while defining the user-requested bounded fallback.
- **Explicit role boundaries**: PASS — One root writer owns coupled contracts; every approval judgment remains a fresh read-only Oracle assignment.
- **Proportional Spec Kit-compatible SDD**: PASS — The design keeps all three routes, conditional plan review choice, and proportional gates while specifying how three answerless results resolve each standard choice.
- **Truthful multi-harness contracts**: PASS — Shared prompts propagate semantics across harnesses and explicitly label instruction-level enforcement rather than inventing a runtime.
- **Independent provider ownership**: PASS — Memory provider boundaries remain unchanged and `openspec/` stays canonical.
- **Evidence-led completion**: PASS — Public-seam TDD, generated-package verification, constitution validation, SDD gates, and independent Oracle review/verification cover the change.
