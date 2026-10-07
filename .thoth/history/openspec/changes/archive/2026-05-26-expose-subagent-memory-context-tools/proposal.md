# Proposal: Expose Subagent Memory Context Tools

## Intent
Close a governance/documentation gap where subagents need explicit, bounded guidance to use parent-scoped memory context tools (`mem_context`, `mem_project_summary`, `mem_project_graph`, `mem_topic_keys`) for handoff and project/session recovery without weakening root-owned session controls. The primary recall protocol remains the 3-layer path: `mem_search` → `mem_timeline` → `mem_get_observation`.

## Scope
### In Scope
- Update generated subagent memory-governance prompt guidance to explicitly allow bounded use of `mem_context`, `mem_project_summary`, `mem_project_graph`, and `mem_topic_keys` under parent `session_id` + `project` dispatch constraints.
- Update memory-governance modeling to include those tools in role/tool contracts where appropriate while preserving root-only session ownership boundaries.
- Update `thoth-mem-agents` skill wording so write-capable and read-only subagents may use the four context tools only under explicit delegated parent-scoped constraints, while preserving the 3-layer protocol as canonical retrieval.
- Update tests that lock memory-governance rules, prompt wording, and skill packaging anchors.
- Capture canonical OpenSpec impact in `multi-harness-agent-pack` and `skill-instructions` behavior expectations for instruction-level versus runtime enforcement claims.

### Out of Scope
- Changing thoth-mem APIs or introducing new memory tools.
- Changing ownership of `mem_session_start`, `mem_session_summary`, or `mem_save_prompt`.
- Allowing subagents to create/close sessions or save generated prompts.
- Replacing the primary 3-layer recall protocol with broad context calls.
- Behavior changes outside prompt/skill/governance modeling and associated tests.

## Approach
Model the four context tools as explicitly delegated, parent-scoped context reads that supplement (not replace) the 3-layer recall chain. Keep the retrieval decision rule explicit: subagents recover handoff context through `mem_search` → `mem_timeline` → `mem_get_observation` first, then use `mem_context`, `mem_project_summary`, `mem_project_graph`, or `mem_topic_keys` only when bounded project/session context is required by the dispatched task.

Preserve hard policy boundaries in both shared prompt output and skill docs:
- root-only ownership for `mem_session_start`, `mem_session_summary`, `mem_save_prompt`
- no prompt saving by subagents
- no implicit session fallback usage without dispatched parent identifiers
- deterministic SDD namespace protection (`sdd/{change}/{artifact}`)

Align tests with the updated contract so regressions are caught if wording/tool matrices drift.

## Affected Areas
- `src/agents/prompt-sections.ts` (subagent memory rules output)
- `src/harness/core/memory-governance.ts` (tool-name model, allowed/forbidden lists, rendered rules)
- `src/skills/thoth-mem-agents/SKILL.md` (subagent memory governance wording)
- `src/harness/core/memory-governance.test.ts`
- `src/cli/custom-skills.test.ts`
- `src/harness/writers/skill-layout.test.ts`
- `openspec/specs/multi-harness-agent-pack/spec.md` and/or `openspec/specs/skill-instructions/spec.md` (canonical spec alignment for governance wording and bindings)

## Risks
- Broadening tool allowlists could be misread as permission to bypass 3-layer recall or root-owned boundaries.
- Harness-specific wording could accidentally overclaim runtime enforcement where only instruction-level governance exists.
- Skill and generated-prompt text may diverge, causing inconsistent governance across delivery surfaces.
- Test fixtures/anchors may become brittle if phrasing changes are not synchronized.

## Rollback Plan
Revert proposal-following implementation changes to prompt sections, governance model, and skill text together with their associated tests. This restores prior memory-governance wording and tool matrices without data migrations or API rollbacks.

## Success Criteria
- Subagent guidance explicitly includes bounded use of `mem_context`, `mem_project_summary`, `mem_project_graph`, and `mem_topic_keys` under parent-scoped dispatch constraints.
- The canonical 3-layer recall path remains the primary mandated recovery protocol in prompts and skill instructions.
- Root-only ownership of `mem_session_start`, `mem_session_summary`, and `mem_save_prompt` remains unchanged and explicitly enforced in guidance/contracts.
- Updated tests verify the new context-tool guidance and continue to assert anti-pattern protections (no prompt saving, no session ownership transfer, protected `sdd/*` namespace).
- Governance text continues to disclose instruction-level enforcement limitations where runtime controls are unavailable.
