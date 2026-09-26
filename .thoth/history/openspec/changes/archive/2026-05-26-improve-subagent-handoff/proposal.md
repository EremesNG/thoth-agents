# Proposal: Improve Subagent Handoff

## Intent
Improve subagent handoff delegation across OpenCode and Codex so delegated agents can recover parent-session context accurately without inheriting root-only memory ownership. The handoff should treat delegation like an intentional context-compaction boundary: the root/orchestrator saves or refreshes the handoff summary in thoth-mem as root-owned session context, then passes task instructions plus bounded recovery instructions using the parent session and project.

## Scope
### In Scope
- Shared root/orchestrator instructions for saving or refreshing concise root-owned handoff summaries before delegation.
- Shared subagent instructions for recovering prior context through delegated 3-layer thoth-mem recall.
- Codex-specific delivery mechanics for passing task instructions and handoff recovery instructions in `multi_agent_v1.spawn_agent` messages without embedding the handoff body.
- OpenCode-compatible shared prompt behavior inherited through existing prompt sections.
- thoth-mem governance wording in shared skills and prompt tests.

### Out of Scope
- Changing `multi_agent_v1`, OpenCode task APIs, or thoth-mem tool APIs.
- Adding new memory tools, role names, harnesses, or UI surfaces.
- Changing SDD phase ordering, OpenSpec artifact paths, topic-key formats, or review gates.
- Letting subagents own session tools such as prompt saves, session starts, or session summaries.

## Approach
Define handoff as a root-owned compaction workflow. Before delegation, the root/orchestrator should save or refresh the handoff body as a root-owned `mem_session_summary` when appropriate. The initial subagent prompt should include the delegated task instructions, parent `session_id`, project, memory permissions, and explicit 3-layer recall instructions; it must not include the handoff body in `message` or `items`. Subagents should use only delegated memory permissions: bounded 3-layer recall when both parent identifiers are present, deterministic SDD `mem_save` only when assigned, and no session or prompt tools.

Codex wording should explain that `message` carries task instructions plus handoff retrieval instructions, while `items` remains reserved for truly required structured attachments or mentions. Shared prompt and skill text should remain harness-neutral, with OpenCode and Codex framed as bindings and instruction-level ownership gaps disclosed where runtime enforcement is unavailable.

## Affected Areas
- `src/agents/prompt-sections.ts`
- `src/harness/adapters/codex.ts`
- `src/skills/thoth-mem-agents/`
- `src/skills/_shared/`
- Prompt, adapter, and skill packaging tests that lock memory governance and handoff wording.

## Risks
- Handoff recovery instructions could become too verbose or accidentally recreate raw context dumps in the delegation prompt.
- Codex guidance could overclaim hard enforcement for instruction-level memory boundaries.
- Subagent recall rules could conflict with current root-owned memory and SDD artifact ownership.
- OpenCode wording could regress if shared prompt changes become Codex-specific.

## Rollback Plan
Revert the prompt, adapter, skill, and test changes for this change. Because no data migration or API change is planned, rollback should restore previous generated handoff wording while leaving existing SDD artifacts intact or archived as superseded planning material.

## Success Criteria
- Root prompts describe root-owned handoff summary refresh before delegation.
- Subagent prompts require parent-scoped recall and prohibit session or prompt ownership.
- Codex handoff instructions require task instructions plus recovery instructions in `message`, with no handoff body in `message` or `items`, without overclaiming enforcement.
- Shared skills preserve harness-neutral memory governance and deterministic SDD topic keys.
- Focused tests cover OpenCode and Codex handoff summary recovery, prompt-body exclusion, recall, and memory-ownership wording.
