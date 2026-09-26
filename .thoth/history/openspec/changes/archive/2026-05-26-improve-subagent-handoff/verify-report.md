# Verification Report: Improve Subagent Handoff

## Completeness

The full-pipeline OpenSpec artifacts were recovered and reviewed:

- `openspec/changes/improve-subagent-handoff/proposal.md`
- `openspec/changes/improve-subagent-handoff/specs/multi-harness-agent-pack/spec.md`
- `openspec/changes/improve-subagent-handoff/design.md`
- `openspec/changes/improve-subagent-handoff/tasks.md`

All implementation and integrated verification tasks in `tasks.md` are marked complete. The specification defines 10 Given/When/Then scenarios across five added requirements. All 10 scenarios are covered by focused tests, broader checks, or this verification phase's governed memory-recovery execution.

## Build and Test Evidence

Fresh verification run during `sdd-verify`:

- `pnpm test -- src/agents/prompt-rendering.test.ts src/agents/index.test.ts src/harness/adapters/codex.test.ts src/harness/adapters/opencode.test.ts src/harness/core/memory-governance.test.ts src/harness/writers/skill-layout.test.ts`
  - Result: passed, 6 files, 130 tests.
- `pnpm run typecheck`
  - Result: passed, `tsc --noEmit` exited 0.
- `pnpm run check:ci`
  - Result: passed, Biome checked 207 files with no fixes applied.
- `pnpm test`
  - Result: passed, 65 files, 664 tests.

Root-provided evidence before this phase matched the fresh verification results: focused tests passed, typecheck passed, `check:ci` passed, and full tests passed.

Note: the local PowerShell host emitted `Import-Clixml` diagnostics before two command outputs. The underlying `pnpm` commands exited 0 and reported passing test/typecheck results, so these diagnostics are treated as non-blocking shell-environment noise.

## Compliance Matrix

| Requirement | Scenario | Evidence | Result |
| --- | --- | --- | --- |
| Treat Delegation Handoff as Root-Owned Compaction | Root preserves session context before delegation | `src/agents/prompt-rendering.test.ts` and `src/agents/index.test.ts` focused coverage; tasks 1.1, 2.1, and 4.1 complete; this verifier recovered the parent-session handoff summary through `mem_search` -> `mem_timeline` -> `mem_get_observation` before using it. | Compliant |
| Treat Delegation Handoff as Root-Owned Compaction | Root reports missing compaction capability | `src/agents/prompt-rendering.test.ts` coverage for missing tooling/identity disclosure and no fallback session creation; tasks 1.1 and 2.1 complete; focused suite passed. | Compliant |
| Provide Structured Handoff Summary and Recovery Instructions | Handoff summary includes decision-ready fields | `src/agents/prompt-rendering.test.ts` coverage for structured fields, parent `session_id`, project, persistence mode, memory permissions, 3-layer recall, non-goals, and escalation conditions; task 2.1 complete; recovered handoff included goal, instructions, discoveries, accomplished work, and relevant files. | Compliant |
| Provide Structured Handoff Summary and Recovery Instructions | Delegation prompt excludes the handoff body | `src/agents/prompt-rendering.test.ts`, `src/harness/adapters/codex.test.ts`, and `src/harness/adapters/opencode.test.ts` coverage for prompt-body exclusion, raw-context/secret exclusion, and generated prompt exclusion; tasks 1.1, 1.3, 2.1, 3.1, and 4.1 complete. | Compliant |
| Require Parent-Scoped Subagent Recall | Subagent recovers context through 3-layer recall | `src/agents/prompt-rendering.test.ts`, `src/agents/index.test.ts`, and memory governance tests cover the 3-layer recall chain and reporting stale/missing/contradictory context; this verification executed bounded parent-session recall with project `thoth-agents` and session `codex-2026-05-26-handoff-core`. | Compliant |
| Require Parent-Scoped Subagent Recall | Subagent does not use memory without parent identity | `src/agents/prompt-rendering.test.ts`, `src/agents/index.test.ts`, and `src/harness/core/memory-governance.test.ts` cover missing-parent prohibition and memory-governance limitation reporting; tasks 1.1, 1.2, 1.4, 2.2, and 2.3 complete. | Compliant |
| Deliver Handoffs Through Harness-Specific Binding Surfaces | OpenCode handoff uses shared prompt behavior | `src/harness/adapters/opencode.test.ts` and `src/agents/index.test.ts` cover shared root/subagent/thoth-mem/SDD semantics, absence of Codex-only tool names, and role roster preservation; tasks 1.2, 1.3, 3.2, and 4.1 complete. | Compliant |
| Deliver Handoffs Through Harness-Specific Binding Surfaces | Codex handoff uses spawn message recovery semantics | `src/harness/adapters/codex.test.ts` covers `multi_agent_v1.spawn_agent`, `message` carrying task instructions plus retrieval instructions, handoff-body exclusion from `message` and `items`, no simultaneous `message` and `items` for one handoff, reserved `items`, omitted/false `fork_context`, and instruction-level enforcement disclosure; tasks 1.3, 3.1, and 4.1 complete. | Compliant |
| Preserve Memory Governance Boundaries During Handoff | Root-owned session tools remain prohibited to subagents | `src/agents/prompt-rendering.test.ts`, `src/agents/index.test.ts`, `src/harness/core/memory-governance.test.ts`, and `src/harness/writers/skill-layout.test.ts` cover `mem_session_start`, `mem_session_summary`, and `mem_save_prompt` prohibitions, prompt-save prohibition, and instruction-level governance wording; tasks 1.4, 2.2, 2.3, 3.3, and 4.1 complete. | Compliant |
| Preserve Memory Governance Boundaries During Handoff | SDD artifact saves remain deterministic and delegated | `src/agents/index.test.ts`, `src/harness/core/memory-governance.test.ts`, and `src/harness/writers/skill-layout.test.ts` cover delegated `mem_save`, deterministic `sdd/{change}/{artifact}` topic keys, `sdd/` namespace protection, and explicit project-scoped read-tool permission; tasks 1.2, 1.4, 2.2, 3.3, 3.4, and 4.1 complete. | Compliant |

Compliance summary: 10 compliant / 10 total scenarios.

## Design Coherence

The implementation evidence aligns with the design:

- Shared prompt behavior is validated through prompt-rendering and generated-agent tests.
- Codex-specific delivery semantics are validated in the Codex adapter tests.
- OpenCode inheritance and absence of Codex-only wording are validated in the OpenCode adapter tests.
- Memory governance and packaged skill documentation are validated by governance and skill-layout tests.
- No new runtime API, role roster, thoth-mem tool, OpenSpec path, or SDD topic-key format change was required or reported.

## Issues Found

No critical issues found.

Non-blocking note: local PowerShell emitted unrelated `Import-Clixml` diagnostics before two `pnpm` command outputs, but all verification commands exited 0 and reported passing results.

## Verdict

Pass.
