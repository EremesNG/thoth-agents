# thoth-mem Convention

## Harness Scope

This convention defines harness-neutral thoth-mem semantics for SDD artifacts.
Use the thoth-mem MCP surface as the portable vocabulary:
`mem_recall`, `mem_save`, `mem_context`, `mem_get`, `mem_project`, and
`mem_session`.

If a needed operation is unavailable in the active runtime, report the
unsupported capability and do not pretend persistence/recovery succeeded.

Governance that a harness cannot hard-enforce remains instruction-level:
role ownership, parent session/project scoping, prompt-save prohibitions, and
SDD namespace protection.

Root-owned delegation handoffs follow the same rule: handoff bodies stay in
root-owned summary/checkpoint memory when available; subagent prompts carry only
task instructions plus parent-scoped recovery instructions.

## Mode Scope

This convention applies only when the artifact store mode includes thoth-mem:
`thoth-mem` and `hybrid`.

- In `openspec` mode, skip thoth-mem saves.
- In `openspec` mode, skip thoth-mem recovery and use filesystem artifacts.

## Tool Names

Use callable names exposed by the active runtime, mapped to the six-tool MCP
surface above.

## Topic Key Format

All SDD artifacts use this deterministic pattern:

```text
sdd/{change-name}/{artifact}
```

Supported artifact names:

- `proposal`
- `spec`
- `design`
- `design-brief`
- `tasks`
- `plan-review`
- `apply-progress`
- `verify-report`
- `archive-report`
- `state`

Use the same value for `title` and `topic_key` unless there is a strong reason
not to.

## State Artifact Format

The orchestrator semantic role persists a lightweight state checkpoint after
each SDD phase transition to enable recovery:

```yaml
change: {change-name}
phase: {last-completed-phase}
mode: {thoth-mem|openspec|hybrid|none}
pipeline: {accelerated|full}
artifacts:
  proposal: true
  spec: false       # always false in accelerated pipeline
  design: false     # always false in accelerated pipeline
  tasks: false
  plan-review: false
  apply-progress: false
  verify-report: false
  archive-report: false
last_updated: {ISO 8601 timestamp}
```

Persist with `mem_save` using canonical SDD topic keys and required metadata:
`title`, `topic_key`, `type`, `project`, `scope`, and `content`.

Recovery path for state artifacts:
`mem_recall(mode="compact", query="topic_key:sdd/{change-name}/state")` ->
`mem_recall(mode="context", query="topic_key:sdd/{change-name}/state")` when needed ->
`mem_get(id=...)` (or `mem_get(include_timeline=true)` when chronology matters) ->
parse YAML -> restore phase state.

## Recall Funnel Protocol

For delegated handoffs, subagents may use recall only when dispatch includes
both parent `session_id` and `project`.

1. `mem_recall(mode="compact")` with exact topic-key query for token-efficient
   IDs and ranking.
2. `mem_recall(mode="context")` to expand strongest hits into retrieved text.
3. `mem_get(id=...)` to retrieve full artifact content; use
   `mem_get(include_timeline=true)` when chronology matters.

Use HyDE/fused hybrid recall (sentence + chunk vectors, FTS, KG enrichment) for
semantic or ambiguous searches; set `mem_recall` `limit` from 1 to 20; narrow
with `topic_key`, `type`, `time_from`, `time_to`, `scope`, `project`, and
`session_id` filters. Use `mem_get` with `kind="observation"|"prompt"`,
`include_timeline=true` plus `before`/`after`, and `offset`/`max_length` for
large content. Use `mem_context(recall_query=...)` or bounded
`mem_project(action="graph"|"topics"|"topic")` for supplemental project
context; `mem_project(action="graph")` relations are `HAS_TYPE`, `IN_PROJECT`,
`HAS_TOPIC_KEY`, `HAS_WHAT`, `HAS_WHY`, `HAS_WHERE`, and `HAS_LEARNED`.
Supplemental context does not replace the recall funnel.

## Save Contract

**CRITICAL:** The orchestrator must persist the `state` artifact after each SDD
phase transition for recovery.

Persist SDD artifacts with stable deterministic topic keys so repeated saves
upsert instead of duplicating. For `sdd-apply`, save `apply-progress` and
re-save updated `tasks` after checkbox changes.

Write-capable subagents may call `mem_save` only when dispatch explicitly
permits delegated durable implementation observations or deterministic SDD
artifact writes under parent session/project. General observations stay outside
`sdd/*`; deterministic SDD artifacts keep `sdd/{change-name}/{artifact}`.
