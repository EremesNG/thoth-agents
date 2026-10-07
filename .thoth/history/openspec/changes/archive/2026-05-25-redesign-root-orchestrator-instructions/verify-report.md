# Verification Report: Redesign Root Orchestrator Instructions

## Completeness

Verdict: PASS.

All 10 full-pipeline scenarios in `openspec/changes/redesign-root-orchestrator-instructions/specs/multi-harness-agent-pack/spec.md` are covered by implementation evidence in `src/agents/prompt-sections.ts` and focused regression tests. The implemented diff is limited to the approved prompt contract and tests:

- `src/agents/prompt-sections.ts`
- `src/agents/prompt-rendering.test.ts`
- `src/harness/adapters/codex.test.ts`
- `src/cli/codex-install.test.ts`
- `src/agents/index.test.ts`

`src/agents/prompt-dialects.ts` was inspected and did not need changes because the existing OpenCode/Codex dialect placeholders already express the new semantics.

## Build and Test Evidence

- Ran `pnpm test -- src/agents/prompt-rendering.test.ts src/harness/adapters/codex.test.ts src/cli/codex-install.test.ts`.
- Result: PASS, 3 test files passed, 60 tests passed.
- IDE diagnostics for `src/agents/prompt-sections.ts`: 0 problems, 0 build errors.
- `pnpm run typecheck` was not required by the approved design because no exported TypeScript contracts, dialect types, or shared interfaces changed.
- `pnpm run build` was not required by the approved design because no generated artifacts, exports, package rendering pipeline, or build behavior changed.

## Compliance Matrix

| Scenario | Result | Evidence |
| --- | --- | --- |
| Root performs bounded direct checks | Compliant | `src/agents/prompt-sections.ts` permits small bounded local inspection, named examples, narrow evidence-led checks, and forbids becoming the default discovery/implementation/verification worker. Covered by `src/agents/prompt-rendering.test.ts` and `src/agents/index.test.ts`. |
| Root delegates broad or risky work | Compliant | Root prompt requires delegation for broad search, multi-file edits, risky verification, UI visual QA, independent review, correctness-heavy debugging, and implementation-heavy work; roster remains explorer/librarian/oracle/designer/quick/deep. Covered by prompt rendering and Codex tests. |
| Root verifies claims before acting | Compliant | Added `<epistemic-rigor>` requiring material claim verification through bounded direct checks, delegated discovery, or authoritative external documentation; allows only low-risk non-critical assumptions. Covered by focused prompt tests. |
| Root corrects mistaken assumptions with evidence | Compliant | Prompt requires correcting disproven assumptions with evidence, tradeoffs, viable alternatives, and warm/direct/concise communication. Covered by focused prompt tests. |
| Root chooses between direct action and delegation | Compliant | Added `<delegation-economics>` requiring selection by net quality, speed, cost, and reliability and discouraging delegation overhead above bounded direct checks. Covered by prompt rendering, Codex adapter, Codex install, and agent index tests. |
| Root parallelizes independent work only | Compliant | Prompt preserves independent parallel delegation, dependent reconciliation, same-role retry, capability-gap disclosure, and root-owned synthesis. Covered by prompt contract assertions and unchanged dispatch rules. |
| Root prompt owns coordination boundaries | Compliant | Root role remains delegate-first coordinator/decision engine with user-facing synthesis, sequencing, blocking input, progress, root-session memory, final reporting, validation accountability, and no selectable Codex orchestrator TOML. Covered by prompt rendering, Codex adapter, and Codex install tests. |
| Root prompt delegates bounded work | Compliant | Canonical subagent roster preserved; subagents are evidence/review/implementation/verification owners; prompt prohibits raw file dumps and requires delegation for broad/risky/specialist work. Covered by prompt rendering tests. |
| Reference repos do not expand the roster | Compliant | Tests define canonical roles and assert no reference-role leaks such as architect/builder/critic/fixer/researcher/planner/tester; implementation adds no new roles. |
| Inspired prose remains behavior-compatible | Compliant | Tests assert no Gentle-AI/oh-my-opencode-slim/command-model leaks, preserve harness-specific OpenCode/Codex tool terms, and keep SDD/memory/role governance intact. |

## Design Coherence

- The implementation follows the design's primary target: `createOrchestratorPromptSections()` in `src/agents/prompt-sections.ts`.
- No new root prompt builder, role roster, SDD topic key, OpenSpec path, Codex managed marker, or install target behavior was introduced.
- Harness-specific wording remains in dialect/rendering surfaces: OpenCode assertions check `task`, `question`, and `todowrite`; Codex assertions check `Codex custom-agent task`, `request_user_input`, and `Codex progress tracking surface`.
- Codex managed root installation behavior is preserved: tests assert the managed root block is native root instructions and that no `.codex/agents/thoth-agents-orchestrator.toml` is generated.
- Tests use semantic marker assertions rather than full prompt snapshots, matching the design goal of stable but non-brittle prompt contract coverage.

## Issues Found

None blocking.

Residual risks:

- Prompt-contract tests validate required marker phrases rather than every possible behavioral interpretation, so future wording changes should keep these semantic markers or replace them with equivalent focused assertions.
- Typecheck and build were reasonably skipped for this diff shape, but a later change touching dialect types, exports, or package rendering should run them.

## Verdict

PASS. The implementation satisfies the approved SDD proposal, spec, design, and completed task checklist. Archive is recommended.
