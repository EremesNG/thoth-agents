# Persistence Contract

## Supported Persistence Modes

| Mode | Read order | Write targets | Use when |
| --- | --- | --- | --- |
| `thoth-mem` | thoth-mem only | thoth-mem only | The user wants no repo artifact changes |
| `openspec` | filesystem only | OpenSpec files only | The user wants visible repo artifacts without memory overhead |
| `hybrid` | thoth-mem, then filesystem fallback | thoth-mem and OpenSpec files | The change should survive compaction and exist in the repo |
| `none` | orchestrator prompt context only | nowhere (inline response only) | Ephemeral exploration, privacy-sensitive work, or no persistence backend available |

SDD skills must obey the selected artifact store mode.

## Mode Rules

### `thoth-mem`

1. Read SDD artifacts from thoth-mem only.
2. Write SDD artifacts to thoth-mem only.
3. Do not create or modify canonical `openspec/` artifacts.

### `openspec`

1. Read SDD artifacts from canonical OpenSpec paths only.
2. Write SDD artifacts to canonical OpenSpec paths only.
3. Do not call thoth-mem save or recovery tools.

### `none`

1. Read SDD artifacts from orchestrator prompt context only.
2. Do not persist artifacts to any external store.
3. Return all artifacts as inline text in the response.
4. Do not call thoth-mem save tools.
5. Do not create or modify OpenSpec files.
6. Recommend enabling `thoth-mem` or `openspec` for persistent work.

## Hybrid Rules

When running in `hybrid` mode:

1. Write the canonical OpenSpec artifact to the filesystem.
2. Persist the same full artifact to thoth-mem with deterministic `topic_key`.
3. Treat the operation as complete only when both writes succeed.
4. If filesystem and memory diverge, repair immediately from the freshest full
   artifact.

## Memory Ownership

Memory responsibilities are split by semantic role:

**Orchestrator owns general/root continuity memory:**
- decisions, discoveries, bug fixes, and user constraints
- root progress checkpoints and summaries (`mem_session(action="checkpoint"|"summary")`)
- prompt persistence (`mem_save(kind="prompt")`)

**Sub-agents write deterministic SDD artifacts when delegated:**
- canonical SDD artifacts using `sdd/{change}/{artifact}`
- includes proposal, spec, design, tasks, apply-progress, verify-report,
  archive-report, and state
- sub-agents may also write delegated durable implementation observations only
  when explicitly authorized under parent session/project
- sub-agents do not own session lifecycle operations and do not save prompts

In harnesses without hard enforcement, keep this as instruction-level
governance and disclose unsupported-capability limitations.

## Delegated Handoffs

Root/orchestrator handoffs are compaction boundaries. When root-owned summary or
checkpoint tools are available, root refreshes handoff continuity with
`mem_session(action="checkpoint"|"summary")` or root-owned
`mem_save(kind="session_summary")`.

Initial subagent prompts include task instructions, parent `session_id`,
project, persistence mode, memory permissions, and recovery instructions. They
must not include raw handoff bodies, transcripts, secrets, or generated prompts.
Subagents recover context through bounded recall before using memory as source
material.

If parent identity or root summary/checkpoint tooling is unavailable, report
that compaction could not be persisted and continue with explicit local context.
Subagents must not create fallback sessions.

## Retrieval Protocol

### Recall funnel for thoth-mem and hybrid modes

Always complete the recall funnel before using memory content as source
material:

1. `mem_recall(mode="compact")` — scan candidate IDs/titles with exact topic-key
   or focused query terms.
2. `mem_recall(mode="context")` — expand the strongest hits into retrieved text.
3. `mem_get(id=...)` — fetch full content; use
   `mem_get(include_timeline=true)` when chronology matters.

Use HyDE/fused hybrid recall (sentence + chunk vectors, FTS, KG enrichment) for
semantic or ambiguous searches; narrow with `topic_key`, `type`, `time_from`,
`time_to`, `scope`, `project`, and `session_id` filters; use
`mem_context(recall_query=...)` or bounded
`mem_project(action="graph"|"topics"|"topic")` for supplemental project
context. Supplemental context does not replace the recall funnel.

### Mode-specific retrieval

1. If mode is `thoth-mem`, use the recall funnel with exact SDD topic key.
2. If mode is `openspec`, read canonical OpenSpec files only.
3. If mode is `hybrid`, use the recall funnel first.
4. In `hybrid`, if nothing is found in thoth-mem, read canonical OpenSpec
   files as fallback.
5. In `hybrid`, if filesystem fallback succeeds, re-save the artifact to
   thoth-mem to converge both stores.
6. If mode is `none`, use orchestrator prompt context only.

## Artifact Ownership

- `sdd-propose` persists `sdd/{change-name}/proposal`
- `sdd-spec` persists `sdd/{change-name}/spec`
- `sdd-design` persists `sdd/{change-name}/design`
- `sdd-tasks` persists `sdd/{change-name}/tasks`
- `sdd-apply` persists `sdd/{change-name}/apply-progress` and re-persists
  updated `sdd/{change-name}/tasks`
- `sdd-verify` persists `sdd/{change-name}/verify-report`
- `sdd-archive` persists `sdd/{change-name}/archive-report`
- `state` persists `sdd/{change-name}/state`

## Governance Placement

- Artifact governance validator is report-only.
- It runs after `sdd-tasks` and before any `sdd-apply` entrypoint consumes the
  report.
- It does not replace `plan-reviewer` or `executing-plans`.
- Root-session memory/progress ownership remains orchestrator-owned.

## Pipeline Type Impact on Prerequisites

The orchestrator passes `pipeline-type` (`accelerated` or `full`) alongside
persistence mode, affecting required artifacts:

| Artifact | Full pipeline | Accelerated pipeline |
| --- | --- | --- |
| Proposal | Required by all phases | Required by all phases (acceptance reference) |
| Spec | Required by design, tasks, apply, verify, archive | Not produced; not required |
| Design | Required by tasks, apply, verify, archive | Not produced; not required |
| Tasks | Required by apply, verify, archive | Required by apply, verify, archive |
| Verify report | Required by archive | Required by archive |

In accelerated mode, proposal is the acceptance reference and must preserve
original intent, accepted scope, deferred areas, and justified exclusions.

## Recovery Notes

- Prefer exact topic-key queries over broad natural-language recall.
- Always apply the recall funnel (`mem_recall(mode="compact")` ->
  `mem_recall(mode="context")` -> `mem_get(...)`) before treating memory as
  source material.
- In `openspec`, repair missing/stale artifacts by rewriting canonical OpenSpec
  files.
- In `thoth-mem`, repair missing/stale artifacts by re-saving full artifacts via
  `mem_save`.
- In `hybrid`, use filesystem fallback only for recovery, then converge stores.
