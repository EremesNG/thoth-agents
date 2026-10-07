# Proposal: Align thoth-mem Tool Surface Guidance

## Intent
Ensure every rendered instruction, governance rule, hook protocol, adapter prompt, documentation page, and test fixture teaches correct thoth-mem MCP usage and helps agents make fuller use of thoth-mem's retrieval and project-memory capabilities. The goal is faithful to "uso correcto y aprovechar TODO el potencial": use only the supported MCP surface, make root and subagent ownership boundaries explicit, and guide agents toward high-signal context recovery.

## Scope
### In Scope
- Align all instruction, governance, documentation, hook, adapter, and test surfaces to the six thoth-mem MCP tools: `mem_save`, `mem_recall`, `mem_context`, `mem_get`, `mem_project`, and `mem_session`.
- Strengthen root bootstrap guidance so `mem_session(action="start")` is step 0 before any other thoth-mem call whenever the root owns a memory-backed workflow.
- Strengthen handoff-before-dispatch guidance so the root saves a recoverable handoff via `mem_session(action="summary")` or `mem_save(kind="session_summary")` before delegating memory-dependent work.
- Require delegated prompts to include parent `session_id` and `project`, plus explicit recovery instructions for the handoff and surrounding context through `mem_recall` compact/context retrieval, `mem_get`, and bounded `mem_context` or `mem_project` calls.
- Clarify the capability split: root agents own session start/checkpoint/summary and prompt persistence; subagents may recover observations and project context through delegated, parent-scoped reads, and may save only explicitly delegated non-prompt artifacts.
- Add capability-leverage guidance for HyDE-assisted semantic search, fused hybrid recall, knowledge-graph navigation through `mem_project(action="graph"|"topics"|"topic")`, `mem_context(recall_query=...)`, `mem_recall` filters, and timeline recovery through `mem_get(include_timeline=true)`.

### Deferred / Needs Discovery
- None for proposal scope. The spec/design phases should still confirm exact wording anchors and test assertions before implementation so generated prompts, governance constants, and docs stay synchronized.

### Out of Scope
- Modifying the thoth-mem repository itself.
- Documenting CLI, HTTP, dashboard, maintenance, observability, import/export, sync, graph/index rebuild, or visualization operations as MCP tools.
- Any behavioral code change beyond aligning instruction strings, the `MemoryToolName` governance type, and the narrow hook compaction-detector alignment that recognizes `mem_session(action="summary")`, to the supported six-tool MCP surface.
- Changing the thoth-mem MCP API, storage model, retrieval algorithm, or project-memory data.
- Changing SDD artifact schemas, phase ordering beyond memory bootstrap emphasis, or role delegation semantics unrelated to thoth-mem guidance.

## Approach
Treat thoth-mem guidance as a shared contract rendered into multiple surfaces rather than as isolated markdown. The proposal specifies one supported MCP vocabulary and applies it consistently wherever agents receive memory instructions.

Target contracts:

- Rendered prompts, governance constants, hooks, Codex adapter guidance, documentation, and tests name only `mem_save`, `mem_recall`, `mem_context`, `mem_get`, `mem_project`, and `mem_session`, so agents receive executable MCP guidance and test coverage catches unsupported identifiers.
- Root memory bootstrap is expressed as step 0: call `mem_session(action="start", project=...)` before any other thoth-mem operation in memory-backed workflows, so durable handoffs, summaries, and observations always have a session owner.
- Root handoff persistence and delegated recovery instructions form one contract: save the handoff, pass parent identifiers, then recover with the recall funnel and bounded supplemental context tools, so subagents have enough context without owning the root session.
- Capability guidance explains how HyDE, fused hybrid recall, topic/time/type/scope filters, graph/topic navigation, `recall_query`, and timeline inclusion improve context quality while staying within parent-scoped governance.

## Affected Areas
- `skill-instructions`: should own requirements for skill text and shared skill support files to express the supported thoth-mem MCP surface, harness-neutral memory responsibilities, and capability-leverage guidance without overclaiming runtime enforcement.
- `multi-harness-agent-pack`: should own requirements for rendered agent prompts, root/subagent governance, Codex adapter output, hook protocol wording, docs generated from agent-pack behavior, and tests that lock memory guidance across harnesses.

## Risks
- A broad wording pass could leave one rendered surface with unsupported MCP identifiers if tests do not cover prompt output, hooks, docs, and adapter guidance together.
- Emphasizing supplemental project-memory tools could be misread as permission for subagents to own sessions or save prompts unless the capability split is explicit.
- Harness adapters may differ in enforcement strength, so guidance must distinguish instruction-level governance from runtime-enforced behavior where applicable.
- Capability-leverage text could become too verbose for generated prompts unless it is written as concise decision guidance.

## Rollback Plan
Undo the proposal-following alignment edits to prompt sections, memory-governance constants, hook protocol text, adapter guidance, docs, and synchronized tests. Because the scope excludes thoth-mem API and data changes, rollback is limited to thoth-agents instruction and governance surfaces.

## Success Criteria
- All affected instruction, governance, hook, adapter, documentation, and test surfaces name only the six supported thoth-mem MCP tools.
- Root guidance states that `mem_session(action="start")` is step 0 before any other thoth-mem call in memory-backed orchestration.
- Handoff-before-dispatch guidance requires recoverable handoff persistence and delegated prompts with parent `session_id`/`project` plus explicit recovery steps.
- Subagent guidance permits parent-scoped context recovery and observation reads while excluding prompt persistence and session ownership.
- Guidance explains when to use HyDE, fused hybrid recall, knowledge-graph/topic navigation, `recall_query`, filters, and timeline inclusion.
- Specs for `skill-instructions` and `multi-harness-agent-pack` can receive delta requirements without expanding implementation beyond instruction/governance/test alignment.
