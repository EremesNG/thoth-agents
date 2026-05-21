---
name: thoth-mem-agents
description: Mandatory thoth-mem workflow contract for orchestrator/subagent memory ownership, parent session_id/project dispatch, prompt-save prohibitions, project-scoped read tools, session-summary ownership, and durable observation rules. Use whenever work mentions thoth-mem, persistent memory, orchestrator/subagents, session_id, project, saved prompts, session summaries, or project-level memory context.
metadata:
  author: thoth-agents
  version: '1.0'
---

# thoth-mem Agents Skill

Use this skill whenever memory work crosses the orchestrator/subagent boundary.
Its job is to prevent silent ownership bugs such as prompt pollution,
implicit `manual-save-{project}` sessions, or subagents writing session-level
artifacts that belong to the orchestrator.

## Shared References

Read these first instead of re-inventing conventions:

- `~/.config/opencode/skills/_shared/persistence-contract.md`
- `~/.config/opencode/skills/_shared/thoth-mem-convention.md`

This skill ADDS the orchestrator/subagent split that those files imply. Do not
duplicate their SDD persistence details unless needed to make a decision.

## Hard Ownership Split

### Orchestrator-only tools

ONLY the orchestrator owns these tools:

- `mem_session_start`
- `mem_session_summary`
- `mem_save_prompt`

Subagents MUST NOT call them.

Why:

- `mem_session_start` defines the session boundary.
- `mem_session_summary` closes or repairs that boundary.
- `mem_save_prompt` is only valid for real user requests, and subagent prompts
  are orchestration artifacts, not user intent.

## Project-Scoped Read Tools

These tools are read/context only, not session-owned artifacts:

- `mem_project_summary`
- `mem_project_graph`
- `mem_topic_keys`

Use them only when the dispatch includes parent `session_id` and `project`,
and only for bounded project/topic context that helps before the usual
3-layer recall.

Rules:

- Treat them as safer alternatives to broad session context for project-scoped
  discovery.
- Keep them bounded with project/topic filters and explicit limits.
- Do not use them to create, close, or summarize sessions.
- Do not use them to save prompts or durable observations.

## Prompt Saving Rule

- Never save a subagent prompt.
- Never ask a subagent to save its prompt.
- Treat the subagent prompt as generated execution scaffolding from the
  orchestrator.

If a workflow says “save the prompt for future context,” that applies to the
root user conversation only.

## Dispatch Contract

When a subagent is allowed to touch thoth-mem, the orchestrator MUST pass:

- parent `session_id`
- `project`
- any thoth-mem limits or ownership constraints relevant to the task

If a subagent does NOT receive both `session_id` and `project`, it MUST NOT call
any thoth-mem tool.

Reason: thoth-mem can create implicit fallback sessions such as
`manual-save-{project}`. That splits history away from the root workflow.

## Capability Split by Agent Type

### Read-only subagents

Agents: `explorer`, `librarian`, `oracle`

Allowed pattern only:

1. `mem_search`
2. `mem_timeline`
3. `mem_get_observation`
4. `mem_project_summary` when project overview is needed
5. `mem_project_graph` when relationship/lineage investigation is needed
6. `mem_topic_keys` when topic-key discovery or inspection is needed

Rules:

- Use the parent `session_id` and `project` from dispatch.
- Do not call `mem_save`, `mem_update`, `mem_session_start`,
  `mem_session_summary`, or `mem_save_prompt`.
- Do not treat `mem_search` output as the artifact body.
- Keep project-scoped read tools bounded by project/topic filters and the task
  scope.

### Write-capable subagents

Agents: `deep`, `quick`, `designer`

Allowed thoth-mem behavior:

- same 3-layer recall as read-only agents when reading
- project-scoped read tools when a broader project/topic context is explicitly
  needed
- `mem_save` for delegated durable observations that arise from their
  implementation work

Rules:

- Use the parent `session_id` and `project` from dispatch on every thoth-mem
  call.
- Do not call `mem_context`; writable subagents stay on the same bounded
  3-layer recall path, using project-scoped read tools only when explicitly
  granted in dispatch.
- Never create or close sessions.
- Never save prompts.
- You do not own durable memory of your own. Any `mem_save` is a delegated
  write under the orchestrator's session/project, not a subagent-owned
  session.
- Save only durable information: decisions, bugfixes, patterns,
  configuration changes, discoveries, and explicitly assigned SDD artifacts.

## Memory Types and Topic Keys

Prefer stable, non-colliding topic keys.

### General durable observations

Use keys outside the SDD namespace, for example:

- `decision/thoth-mem/subagent-ownership`
- `bugfix/thoth-mem/prompt-pollution`
- `pattern/thoth-mem/parent-session-dispatch`
- `config/thoth-mem/root-hook`
- `discovery/thoth-mem/manual-save-fallback`

### SDD artifacts

Use the shared deterministic format from the convention files:

`sdd/{change}/{artifact}`

Never reuse the `sdd/...` namespace for general notes. That causes artifact
collisions and corrupts recovery assumptions.

## Orchestrator Checklist

Before dispatching subagents in a thoth-mem workflow, verify all of this:

- `mem_session_start` has already run for the root session before any later
  `mem_session_summary`.
- The dispatch includes parent `session_id` and `project`.
- The dispatch states whether the subagent may read memory only or may also
  `mem_save` delegated observations under the parent session/project, and
  whether project-scoped read tools (`mem_project_summary`, `mem_project_graph`,
  `mem_topic_keys`) are allowed.
- The dispatch does NOT ask the subagent to save prompts.
- The dispatch does NOT ask the subagent to write session summaries.
- If the work is SDD-related, the dispatch preserves the shared topic-key rules
  and avoids collisions with `sdd/{change}/{artifact}`.

## Anti-Patterns

Reject these patterns immediately:

- Subagent calls `mem_save_prompt`.
- Subagent calls `mem_session_start` or `mem_session_summary`.
- Subagent uses thoth-mem without parent `session_id` and `project`.
- Writable subagent calls `mem_context` instead of the bounded 3-layer recall.
- Subagent uses project-scoped read tools without explicit permission in the
  dispatch.
- Read-only subagent writes memory.
- General observation saved under `sdd/...`.
- Orchestrator asks a subagent to “remember this user request” by saving the
  generated dispatch prompt.

## Dispatch Examples

### Correct

```text
Load skill thoth-mem-agents and follow it.
Parent session_id: ses_root_123
Project: thoth-agents
Memory limits: read-only recall only; do not write memory.
Task: inspect prior thoth-mem ownership decisions for the hook redesign.
```

```text
Load skill thoth-mem-agents and follow it.
Parent session_id: ses_root_123
Project: thoth-agents
Memory limits: you may mem_save durable implementation observations, but never
save prompts or call session tools.
Task: implement the prompt ownership fix and persist any durable bugfix notes.
```

### Incorrect

```text
Check memory and save your prompt for traceability.
```

Why wrong: no parent `session_id`/`project`, and it asks the subagent to save a
generated prompt.

```text
Use mem_session_summary when done so we keep the session updated.
```

Why wrong: session summaries are orchestrator-owned.

## Response Standard

When you apply this skill, be explicit about:

- which agent owns the memory operation
- which thoth-mem tools are allowed for this task
- whether parent `session_id` and `project` were provided
- whether project-scoped read tools are allowed and which ones
- whether a proposed topic key is safe or collides with `sdd/...`

If any of those are missing, stop using thoth-mem and continue only with local
context unless the orchestrator provides the missing ownership data.
