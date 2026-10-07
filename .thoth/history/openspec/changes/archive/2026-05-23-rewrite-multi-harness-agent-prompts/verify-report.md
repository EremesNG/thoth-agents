# Verification Report: Rewrite Multi-Harness Agent Prompts

## Completeness

All canonical full-pipeline artifacts were present in OpenSpec:

- Proposal: `openspec/changes/rewrite-multi-harness-agent-prompts/proposal.md`
- Spec: `openspec/changes/rewrite-multi-harness-agent-prompts/specs/multi-harness-agent-pack/spec.md`
- Design: `openspec/changes/rewrite-multi-harness-agent-prompts/design.md`
- Tasks: `openspec/changes/rewrite-multi-harness-agent-prompts/tasks.md`

The task checklist is complete: 17 checked tasks, 0 pending tasks, 0 in-progress
tasks, and 0 skipped tasks.

Memory recovery for `sdd/rewrite-multi-harness-agent-prompts/tasks`, `spec`,
`design`, and `apply-progress` returned no matching memories, so the canonical
OpenSpec artifacts were used as the verification source for hybrid fallback.

## Build and Test Evidence

Fresh verification run:

- `pnpm test -- src/agents/prompt-rendering.test.ts src/agents/prompt-dialects.test.ts src/harness/adapters/codex.test.ts src/config/loader.test.ts`
  - Result: passed, 4 test files / 104 tests.

Implementation-phase evidence provided by SDD apply and accepted as broader
regression coverage:

- `pnpm test -- src/agents/prompt-rendering.test.ts src/agents/prompt-dialects.test.ts`
  passed.
- `pnpm test -- src/agents/prompt-rendering.test.ts` passed.
- `pnpm test -- src/agents/prompt-dialects.test.ts src/harness/adapters/codex.test.ts src/config/loader.test.ts`
  passed.
- `pnpm run check:ci` passed.
- `pnpm run typecheck` passed.
- `pnpm test` passed: 55 files / 579 tests.

## Compliance Matrix

| Scenario | Evidence | Result |
| --- | --- | --- |
| Root prompt owns coordination boundaries | `src/agents/prompt-sections.ts` includes root coordinator, sequencing, blocking input, progress, root-session memory, and final reporting guidance; Codex wording includes the ambient Codex root session; covered by `src/agents/prompt-rendering.test.ts`. | Pass |
| Root prompt delegates bounded work | Roster and delegation boundaries are preserved in prompt sections and `AGENTS.md`; raw file dump prohibition is present; covered by prompt rendering tests. | Pass |
| Explorer prompt is local discovery only | Explorer prompt contract keeps read-only local discovery, anchors, constraints, risks, and verification targets; covered by prompt rendering tests. | Pass |
| Librarian prompt is external research only | Librarian prompt contract keeps external docs/public examples, version sensitivity, source attribution, and applicability notes; covered by prompt rendering tests. | Pass |
| Oracle prompt is advisory only | Oracle prompt contract remains read-only review/diagnosis/plan-review guidance and excludes artifact-producing phases or edits; covered by prompt rendering and Codex adapter tests. | Pass |
| Designer prompt owns user-facing visual work | Designer prompt owns UI/UX, visual QA, screenshots, browser verification, and responsive checks; covered by prompt rendering tests. | Pass |
| Quick prompt stays narrow and mechanical | Quick prompt is limited to bounded low-risk edits, working-tree preservation, git safety, and focused verification; covered by prompt rendering tests. | Pass |
| Deep prompt owns correctness-critical implementation | Deep prompt covers multi-file/correctness-critical work, local context validation, TDD/systematic debugging when relevant, edge cases, and automated verification; covered by prompt rendering tests. | Pass |
| Replacement prompt overrides generated content | Replacement precedence and placeholder expansion are covered by `src/agents/prompt-rendering.test.ts` and `src/config/loader.test.ts`. | Pass |
| Append prompt extends generated content | Append composition after generated guidance and placeholder expansion are covered by prompt rendering/config loader tests. | Pass |
| Model-family guidance composes before user append text | Model-family guidance ordering before append text is covered by prompt rendering tests. | Pass |
| Reference repos do not expand the roster | Tests and docs preserve only orchestrator, explorer, librarian, oracle, designer, quick, and deep; no reference repo roles are introduced. | Pass |
| Inspired prose remains behavior-compatible | Prompt sections preserve delegate-first orchestration, role boundaries, SDD gates, memory governance, and verification obligations. | Pass |
| All roles retain their semantic responsibilities | OpenCode and Codex prompt tests assert role nature and operating modes for all seven roles. | Pass |
| Harness limitations do not rewrite role identity | Codex prompt/adapter wording preserves intended roles while marking unsupported or instruction-level enforcement gaps; covered by Codex tests. | Pass |
| OpenCode wording is rendered from the OpenCode dialect | Dialect tests cover OpenCode terminology and role output; prompt rendering tests cover OpenCode delegation, user-question, progress, memory, visual QA, and verification wording. | Pass |
| Codex wording is rendered from the Codex dialect | Dialect and adapter tests cover Codex custom-agent task wording, request-user-input surface, instruction-level governance, tool access, and capability diagnostics. | Pass |
| Root-only memory tools remain restricted | Prompt sections and memory-governance guidance keep `mem_session_start`, `mem_session_summary`, and `mem_save_prompt` root-owned; subagent guidance requires parent `session_id` and project before memory use. | Pass |
| Runtime enforcement is used where available | Existing memory-governance and adapter tests cover generated controls/diagnostics where the harness exposes controls; no runtime enforcement expansion was needed for this prompt rewrite. | Pass |
| Enforcement gaps are diagnosed where unavailable | Codex adapter diagnostics and prompt wording expose instruction-level governance limitations; covered by `src/harness/adapters/codex.test.ts`. | Pass |
| SDD artifact writes use deterministic ownership | Prompt and memory-governance guidance preserve deterministic `sdd/{change}/{artifact}` topic keys and prohibit root-session summaries or prompt saves by subagents. | Pass |
| OpenCode rendering remains explicit and stable | Prompt rendering and dialect tests cover OpenCode tool, delegation, user-question, progress, memory, visual QA, verification, and seven-role mode wording. | Pass |
| Codex rendering uses Codex semantics without brittle adaptation | Dialect tests and Codex adapter tests cover Codex-specific terminology and guard against unsupported-harness/broad adaptation behavior. | Pass |
| Custom prompt composition remains covered | Replacement, append, placeholder, and model-family ordering coverage is present in focused tests. | Pass |
| Reporting evidence is required for completion | This report records focused tests, broader apply-phase checks, implementation files, and explicit issue status. | Pass |
| Unsupported harnesses remain out of scope for prompt rendering | Dialect tests guard supported harness terminology and unsupported harness handling without adding non-OpenCode/Codex prompt behavior. | Pass |
| Runtime behavior changes stay constrained to prompt contracts | Reviewed changed files show scope limited to prompt sections, Codex wording/diagnostics, tests, and AGENTS alignment; `README.md` and `src/harness/core/memory-governance.ts` were reviewed with no changes needed. | Pass |

## Design Coherence

The implementation follows the design boundary: prompt contracts remain generated
from the existing modular prompt-section and dialect architecture, Codex-specific
capability language stays in the Codex adapter/dialect layer, and tests lock the
semantic contracts without replacing the agent system with static prompt files.

The changed areas match the design plan:

- `src/agents/prompt-sections.ts` for root, read-only, and write-capable prompt
  sections.
- `src/harness/adapters/codex.ts` for Codex wrapper/diagnostic wording.
- `src/agents/prompt-rendering.test.ts`, `src/agents/prompt-dialects.test.ts`,
  `src/harness/adapters/codex.test.ts`, and `src/config/loader.test.ts` for
  focused contract coverage.
- `AGENTS.md` for user-facing role and harness guidance alignment.

## Issues Found

None.

Notes:

- Hybrid artifact recall found no prior thoth-mem SDD artifacts for this change,
  so verification used OpenSpec fallback as allowed by the persistence contract.
- The fresh focused test command passed. The full suite, typecheck, and Biome
  check are included as implementation-phase evidence rather than rerun in this
  verify step.

## Verdict

Pass. All 27 full-pipeline spec scenarios are compliant, all 17 implementation
tasks are complete, and the focused plus broader reported verification evidence
supports the change.
