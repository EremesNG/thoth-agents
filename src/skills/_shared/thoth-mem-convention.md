# thoth-mem Convention

## Harness Scope

This convention defines harness-neutral thoth-mem semantics for SDD artifacts.
Tool names are adapter bindings, not universal semantics. Use the thoth-mem
operation names (`mem_search`, `mem_timeline`, `mem_get_observation`,
`mem_save`, `mem_update`) as the portable vocabulary and map them to the
callable tool names exposed by the active binding surface.

If a needed thoth-mem operation is not available, treat it as an
unsupported-capability, disclose the limitation, and do not pretend
persistence or recovery succeeded.

Governance that a harness cannot hard-enforce remains instruction-level:
semantic role ownership, parent session/project scoping, prompt-save
prohibitions, and SDD topic-key namespace protection still apply.

Root-owned delegation handoffs use the same convention: the handoff body lives
in a root-owned `mem_session_summary` when available, while subagent prompts
carry task instructions plus parent-scoped recovery instructions. Do not place
the handoff body in the initial subagent prompt or structured attachment
payload.

## Mode Scope

This convention applies only when the artifact store mode includes thoth-mem:
`thoth-mem` and `hybrid`.

- In `openspec` mode, skip thoth-mem saves.
- In `openspec` mode, skip thoth-mem recovery and use filesystem artifacts
  instead.

## Tool Names

Use the thoth-mem operation names through the active binding surface. Prefer
the callable names actually exposed by the runtime.

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
  apply-progress: false
  verify-report: false
  archive-report: false
last_updated: {ISO 8601 timestamp}
```

Save with the memory tool binding for `mem_save`, using the canonical SDD
topic key and the required metadata fields:
`title`, `topic_key`, `type`, `project`, `scope`, and `content`.

Recovery: `mem_search("sdd/{change-name}/state")` using the active binding
surface → `mem_timeline(id)` when needed for chronology →
`mem_get_observation(id)` → parse YAML → restore phase state.

## Three-Layer Recall Protocol

For delegated handoffs, subagents may use this protocol only when the dispatch
includes both parent `session_id` and `project`. The first recalled source
should be the parent-session handoff summary or exact SDD topic assigned by the
orchestrator; if recall is missing, stale, contradictory, or insufficient,
report that limitation instead of inventing context.

1. **Scan compact index** by exact topic key:

Use the memory tool binding for `mem_search` with
`query: "topic_key:sdd/{change-name}/{artifact}"`, `project`, and
`mode: "compact"`.

Use `mode: "compact"` (the default) for token efficiency. Switch to `mode: "preview"`
only when compact results are insufficient to disambiguate between multiple results.

2. **Get chronological context** around the found observation:

Use the memory tool binding for `mem_timeline` with `observation_id`,
`before`, and `after`.

This shows related observations in the same session, helping you understand the
artifact's evolution and dependencies.

3. **Retrieve full artifact content**:

Use the memory tool binding for `mem_get_observation` with the observation ID.

Search returns compact results (IDs + titles) by default. Neither compact nor
preview mode returns the full artifact body. Always complete the 3-layer recall
to get the actual content.

## Save Contract

**CRITICAL:** The orchestrator MUST persist the state artifact after each SDD
phase transition. This is the canonical checkpoint for resume/recovery.

Persist SDD artifacts with a stable topic key so repeated saves upsert instead
of creating duplicates:

Use the memory tool binding for `mem_save` with the canonical SDD topic key
and the full artifact markdown in `content`.

For `sdd-apply`, save the progress report under `apply-progress` and re-save the
updated task list under `tasks` after checkboxes change.

Write-capable subagents may call `mem_save` only when the task explicitly
delegates a durable implementation observation or deterministic SDD artifact
write under the parent session/project. General observations must use topic
keys outside `sdd/*`; deterministic SDD artifacts keep the canonical
`sdd/{change-name}/{artifact}` format.
