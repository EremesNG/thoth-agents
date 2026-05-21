# thoth-mem Convention

## Mode Scope

This convention applies only when the artifact store mode includes thoth-mem:
`thoth-mem` and `hybrid`.

- In `openspec` mode, skip thoth-mem saves.
- In `openspec` mode, skip thoth-mem recovery and use filesystem artifacts
  instead.

## Tool Names

Use the thoth-mem tool names exactly as exposed by the plugin:

- `thoth_mem_mem_search`
- `thoth_mem_mem_timeline`
- `thoth_mem_mem_get_observation`
- `thoth_mem_mem_save`
- `thoth_mem_mem_update` (optional when you already have an observation ID)

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

The orchestrator persists a lightweight state checkpoint after each SDD phase
transition to enable recovery:

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

Save with:

```text
thoth_mem_mem_save(
  title: "sdd/{change-name}/state",
  topic_key: "sdd/{change-name}/state",
  type: "architecture",
  project: "{project}",
  scope: "project",
  content: "{YAML state content}"
)
```

Recovery: `thoth_mem_mem_search("sdd/{change-name}/state")` → `thoth_mem_mem_get_observation(id)` → parse YAML → restore phase state.

## Three-Layer Recall Protocol

1. **Scan compact index** by exact topic key:

```text
thoth_mem_mem_search(
  query: "topic_key:sdd/{change-name}/{artifact}",
  project: "{project}",
  mode: "compact"
)
```

Use `mode: "compact"` (the default) for token efficiency. Switch to `mode: "preview"`
only when compact results are insufficient to disambiguate between multiple results.

2. **Get chronological context** around the found observation:

```text
thoth_mem_mem_timeline(
  observation_id: {id},
  before: 5,
  after: 5
)
```

This shows related observations in the same session, helping you understand the
artifact's evolution and dependencies.

3. **Retrieve full artifact content**:

```text
thoth_mem_mem_get_observation(id: {observation-id})
```

Search returns compact results (IDs + titles) by default. Neither compact nor
preview mode returns the full artifact body. Always complete the 3-layer recall
to get the actual content.

## Save Contract

**CRITICAL:** The orchestrator MUST persist the state artifact after each SDD
phase transition. This is the canonical checkpoint for resume/recovery.

Persist SDD artifacts with a stable topic key so repeated saves upsert instead
of creating duplicates:

```text
thoth_mem_mem_save(
  title: "sdd/{change-name}/{artifact}",
  topic_key: "sdd/{change-name}/{artifact}",
  type: "architecture",
  project: "{project}",
  scope: "project",
  content: "{full artifact markdown}"
)
```

For `sdd-apply`, save the progress report under `apply-progress` and re-save the
updated task list under `tasks` after checkboxes change.
