# Tasks: Bound Subagent Session Reuse

## Authoring contract

Task identifiers are unique and sequential. Every implementation slice begins with a failing public-seam test, followed by the smallest change that makes it pass. Root alone advances task state after observing evidence.

## MVP scope

US1 is the MVP: after T001 through T008, all supported root prompts default to a fresh specialist at a work boundary, prohibit role-based pooling, and require fresh Oracle judgment, with the canonical contract and prompt seams passing focused tests.

## Dependencies

`T001 -> T002 -> T003 -> T004 -> T005 -> T006 -> T007 -> T008 -> T009 -> T010 -> T011 -> T012 -> T013 -> T014`; the lifecycle dialect must exist before prompt rendering can consume it, canonical policy follows the proven prompt behavior, and generated synchronization follows all canonical source changes.

## Story US3

- [x] T001 [US3] Add failing dialect-contract assertions for native fresh delegation, same-assignment continuation, and independent-context wording with FR-005/SC-003 coverage in `src/agents/prompt-dialects.test.ts` | Verify: focused dialect tests fail only because the three lifecycle fields are absent or incorrect
- [x] T002 [US3] Extend lifecycle nomenclature for Codex, OpenCode, and Claude Code with FR-005/SC-003 coverage in `src/agents/prompt-dialects.ts` | Verify: focused dialect tests pass with exact native operations and no cross-harness wording

## Story US1

- [x] T003 [US1] Add a failing cross-dialect root-prompt test for fresh work boundaries, no completed-role pooling, and fresh Oracle judgments with FR-001/FR-003/SC-001 coverage in `src/agents/prompt-rendering.test.ts` | Verify: focused prompt tests fail because the lifecycle policy is not rendered
- [x] T004 [US1] Render compact fresh-boundary, independent-context, and Oracle-judgment guidance through lifecycle placeholders with FR-001/FR-003/SC-001 coverage in `src/agents/prompt-sections.ts` | Verify: the US1 prompt test passes for all three dialects within existing prompt-size budgets

## Story US2

- [x] T005 [US2] Add a failing root-prompt test that limits continuation to the same bounded assignment and separates status collection from later reuse with FR-002/FR-004/SC-002 coverage in `src/agents/prompt-rendering.test.ts` | Verify: focused prompt tests fail because continuation and status boundaries are not yet rendered
- [x] T006 [US2] Render same-assignment continuation, clarification limits, and nonterminal status semantics with FR-002/FR-004/SC-002 coverage in `src/agents/prompt-sections.ts` | Verify: all shared lifecycle prompt tests pass for running steering, completed clarification, and status-only collection
- [x] T007 [US2] Add failing canonical orchestration-policy assertions for fresh-by-default and bounded continuation with FR-001/FR-002/FR-003/FR-004/SC-001/SC-002 coverage in `src/harness/core/agent-pack.test.ts` | Verify: focused agent-pack tests fail because canonical rules do not yet expose the lifecycle contract
- [x] T008 [US2] Add the portable lifecycle rules to the canonical orchestration policy with FR-001/FR-002/FR-003/FR-004/SC-001/SC-002 coverage in `src/harness/core/agent-pack.ts` | Verify: focused agent-pack tests pass and returned policy clones preserve the new rules

## Harness conformance

- [x] T009 [US3] Assert OpenCode root output uses task without task_id for fresh work and prior task_id only for the same assignment with FR-005/SC-003 coverage in `src/harness/adapters/opencode.test.ts` | Verify: OpenCode adapter tests pass and reject Codex or Claude continuation terminology
- [x] T010 [US3] Assert Codex root output uses spawn_agent with fork_turns none for fresh work and followup_task only for the same assignment with FR-005/SC-003 coverage in `src/harness/adapters/codex.test.ts` | Verify: Codex adapter tests pass and reject OpenCode or Claude continuation terminology
- [x] T011 [US3] Assert Claude Code root output uses normal Agent for fresh work, SendMessage for same-assignment continuation, and no fork for independent work with FR-005/SC-003 coverage in `src/harness/adapters/claude-code.test.ts` | Verify: Claude Code adapter tests pass and reject Codex or OpenCode continuation terminology
- [x] T012 [US3] Document the portable lifecycle invariant and native mappings with FR-001/FR-002/FR-003/FR-004/FR-005 coverage in `docs/agent/agents-and-delegation.md` | Verify: routed documentation distinguishes work boundaries, continuation, status collection, and fresh Oracle judgment for all three harnesses

## Parallel execution

- None: prompt tests and implementations modify the same canonical rendering surfaces in strict red-green order, adapter assertions consume those results, and generated output must follow the completed source changes.

## Final verification

- [x] T013 Synchronize and verify generated integration artifacts with FR-005/SC-003 coverage in `plugin/agents/orchestrator.md` | Verify: integration sync completes and integration verify reports no stale generated output
- [x] T014 Run focused lifecycle suites followed by check, typecheck, build, and full tests for FR-001/FR-002/FR-003/FR-004/FR-005/SC-001/SC-002/SC-003 coverage in `package.json` | Verify: all selected commands pass or every residual failure is reported with attributable evidence
