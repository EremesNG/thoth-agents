# Implementation Plan: Bound Subagent Session Reuse

## Technical context

The seven-role and adaptive-root contract is canonical in `src/harness/core/agent-pack.ts`. Root instructions are assembled in `src/agents/prompt-sections.ts` and translated through `HarnessPromptDialect` in `src/agents/prompt-dialects.ts`; OpenCode consumes that prompt directly, Claude Code renders it through its adapter, and Codex installation materializes the Codex-dialect root block. Existing lifecycle nomenclature covers waiting and terminal status but does not distinguish fresh delegation from deliberate continuation.

This change extends the existing lifecycle dialect rather than adding a parallel policy layer. The shared prompt will define work boundaries and Oracle independence once, while each dialect supplies its native fresh, continuation, and independent-context wording. Public verification seams are the canonical agent-pack contract, prompt rendering, and generated/installed root instructions for OpenCode, Claude Code, and Codex.

## Constitution Check (pre-design)

- **Adaptive-root orchestration**: PASS — The design preserves adaptive root ownership, delegation only for net gain, depth one, one writer, and strengthens the required independent Oracle boundary.
- **Explicit role boundaries**: PASS — No role, permission, phase owner, or mutation boundary changes; only root lifecycle guidance is refined.
- **Proportional Spec Kit-compatible SDD**: PASS — The user selected Accelerated SDD, optional artifacts remain off because the behavior and seams are already known, and Oracle review remains user-selected after `ready`.
- **Truthful multi-harness contracts**: PASS — One shared semantic policy is translated into distinct native Codex, OpenCode, and Claude Code operations without claiming runtime equivalence beyond their exposed primitives.
- **Independent provider ownership**: PASS — The change does not modify thoth-mem setup, lifecycle, storage, hooks, or provider protocol.
- **Evidence-led completion**: PASS — TDD covers public rendering seams, final verification remains Oracle-owned, and generated integration output will be checked before archive.

## Design

### Requirement mapping

| Requirement | Technical decision | Files/interfaces | Verification seam |
| --- | --- | --- | --- |
| FR-001 | Add canonical fresh-at-work-boundary and no-role-pooling rules to the orchestration contract and rendered root lifecycle block. | `src/harness/core/agent-pack.ts`; `src/agents/prompt-sections.ts` | `getAgentPackContract()` and rendered root prompts for all dialects |
| FR-002 | Define continuation as an explicit exception limited to steering, completing, or clarifying the same bounded assignment. | `OrchestrationPolicy.rules`; `LifecycleNomenclature`; root prompt lifecycle block | Agent-pack and prompt-rendering tests |
| FR-003 | Render a fresh-instance requirement for every Oracle plan review, verification round, or approval/PASS judgment; permit same-session clarification only. | `src/agents/prompt-sections.ts` | Cross-dialect prompt-rendering tests plus adapter/install assertions |
| FR-004 | Keep existing status terminology and explicitly state that wait/status probes collect only the active nonterminal assignment. | `LifecycleNomenclature.sameSessionProbe`; root prompt lifecycle block | Dialect lifecycle tests and shared prompt assertions |
| FR-005 | Extend lifecycle dialect data with native fresh, continuation, and independent-context wording for Codex, OpenCode, and Claude Code. | `src/agents/prompt-dialects.ts`; `src/agents/prompt-sections.ts` placeholder rendering | `src/agents/prompt-dialects.test.ts`, `src/harness/adapters/opencode.test.ts`, `src/harness/adapters/codex.test.ts`, `src/harness/adapters/claude-code.test.ts` |

The new lifecycle fields will remain strings owned by each dialect because they are prompt nomenclature, not runtime invocation APIs. `renderRoleText` will resolve three new placeholders. The orchestrator prompt will use a compact `<delegation-lifecycle>` block so existing root prompt size budgets remain meaningful.

After focused tests pass, `pnpm run integration:sync` will refresh generated `plugin/` artifacts from canonical sources and `pnpm run integration:verify` will confirm they are synchronized. Generated files will not be edited directly.

## Optional support artifacts

- `research.md`: Not needed; current native lifecycle behavior was confirmed from official documentation and the exact OpenCode 1.18.2 task implementation before specification.
- `data-model.md`: Not needed; no persisted data or schema changes.
- `contracts/`: Not needed; the typed dialect and prompt interfaces are the existing contract boundary.
- `quickstart.md`: Not needed; there is no new operator workflow or command.

## Risks and migrations

- Prompt growth could exceed existing compactness thresholds. Mitigation: one short lifecycle block and existing prompt-length tests; rollback is removal of the block and fields.
- Native wording could drift or leak between harnesses. Mitigation: exact dialect literals and negative cross-harness assertions at adapter seams.
- Overly strict freshness could prevent useful same-task continuity. Mitigation: explicitly allow running-task steering, same-assignment completion, and clarification while reserving fresh instances for new boundaries and judgments.
- Generated plugin output may become stale. Mitigation: run integration sync/verify and review generated diffs; no data migration is required.

## Constitution Check (post-design)

- **Adaptive-root orchestration**: PASS — The design makes context isolation and independent review concrete while retaining root judgment for bounded same-assignment continuation.
- **Explicit role boundaries**: PASS — The proposed fields and prompt block apply only to root orchestration; specialist roles and write scopes remain unchanged.
- **Proportional Spec Kit-compatible SDD**: PASS — The plan maps every FR to existing typed and rendered seams without optional-artifact ceremony or route expansion.
- **Truthful multi-harness contracts**: PASS — Native terminology is dialect-owned and verified separately for all three supported harnesses, including inherited-context restrictions where applicable.
- **Independent provider ownership**: PASS — No design surface touches provider memory or claims persistence effects.
- **Evidence-led completion**: PASS — Red/green tests, integration synchronization, proportional static checks, and fresh Oracle verification provide explicit evidence before closeout.
