# Persistence Contract

## Supported Persistence Modes

| Mode | Read order | Write targets | Use when |
| --- | --- | --- | --- |
| `thoth-mem` | thoth-mem only | thoth-mem only | The user wants no repo artifact changes |
| `openspec` | filesystem only | OpenSpec files only | The user wants visible repo artifacts without memory overhead |
| `hybrid` | thoth-mem, then filesystem fallback | thoth-mem and OpenSpec files | The change should survive compaction and exist in the repo |
| `none` | orchestrator prompt context only | nowhere (inline response only) | Ephemeral exploration, privacy-sensitive work, or no persistence backend available |

SDD skills MUST obey the selected artifact store mode. Do not reference or rely
on engram.

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
2. Persist the same full artifact to thoth-mem with a deterministic `topic_key`.
3. Treat the operation as complete only when both writes succeed.
4. If filesystem and memory diverge, repair them immediately by rewriting the
   stale copy from the freshest full artifact.

## Memory Ownership

Memory responsibilities are split between orchestrator and sub-agents:

**Orchestrator owns general memory:**
- Decisions, discoveries, bug fixes, session summaries
- Progress checkpoints (SDD task state updates)
- User preferences and configuration notes

**Sub-agents write deterministic SDD artifacts:**
- Canonical SDD artifacts with topic_key matching `sdd/{change}/{artifact}`
- Includes: proposal, spec, design, tasks, apply-progress, verify-report,
  archive-report, state
- Sub-agents persist these directly when the active mode includes thoth-mem
- Sub-agents do NOT write general memory observations

This split preserves artifact nuance (sub-agents have full context when writing)
while keeping general memory centralized under orchestrator control.

## Retrieval Protocol

### 3-Layer Recall for thoth-mem and hybrid modes

Always complete the full 3-layer recall before using content as source material:

1. **Layer 1 (Compact Index):** `thoth_mem_mem_search(..., mode: "compact")` —
   scan the compact index of observation IDs and titles. This is the most
   token-efficient entry point.
2. **Layer 2 (Timeline Context):** `thoth_mem_mem_timeline(observation_id: {id})`
   — retrieve chronological context (before/after observations) to disambiguate
   or verify the correct artifact.
3. **Layer 3 (Full Body):** `thoth_mem_mem_get_observation(id: {id})` — retrieve
   the complete artifact body for use as source material.

**Mode guidance:**
- Use `mode: "compact"` (default) for most queries; it returns only IDs and
  titles.
- Use `mode: "preview"` only when compact results are insufficient to
  disambiguate between multiple candidates.

**Never treat `mem_search` output—compact or preview—as the artifact body.**
Always complete the 3-layer recall before using content as source material.

### Mode-specific retrieval

1. If the mode is `thoth-mem`, apply the 3-layer recall with the exact SDD
   topic key.
2. If the mode is `openspec`, read the canonical OpenSpec path from the
   filesystem only.
3. If the mode is `hybrid`, apply the 3-layer recall with the exact SDD topic
   key.
4. In `hybrid`, if nothing is found in thoth-mem, read the canonical OpenSpec
   path from the filesystem.
5. In `hybrid`, if filesystem recovery succeeds, re-save the artifact to
   thoth-mem so the two stores converge again.
6. If the mode is `none`, read artifacts from the orchestrator prompt context
   only. Do not attempt to retrieve from thoth-mem or filesystem.

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

- The artifact governance validator is **report-only**.
- It runs after `sdd-tasks` produces the canonical checklist and before any
  future `sdd-apply` entrypoint consumes the report.
- It does **not** replace `plan-reviewer` or `executing-plans`.
- It does **not** mark task state, enforce execution, or alter review gating.
- Root-session memory and progress checkpoints remain orchestrator-owned;
  sub-agents may surface governance findings, but they must stay within the
  active artifact store mode and delegate-first boundaries.

## Pipeline Type Impact on Prerequisites

The orchestrator passes `pipeline-type` (`accelerated` or `full`) alongside the
persistence mode. This affects which artifacts each skill requires:

| Artifact | Full pipeline | Accelerated pipeline |
| --- | --- | --- |
| Proposal | Required by all phases | Required by all phases (serves as acceptance reference) |
| Spec | Required by design, tasks, apply, verify, archive | Not produced; not required |
| Design | Required by tasks, apply, verify, archive | Not produced; not required |
| Tasks | Required by apply, verify, archive | Required by apply, verify, archive |
| Verify report | Required by archive | Required by archive |

In accelerated pipeline, the proposal serves as the acceptance reference where
specs would normally be used. Skills must adapt their retrieval, compliance
checks, and archive behavior accordingly.

## Recovery Notes

- Prefer exact topic-key queries over fuzzy natural-language search.
- Always use the 3-layer recall (`mem_search` → `mem_timeline` →
  `mem_get_observation`) before treating an artifact as source material.
- If multiple observations match in `mem_search`, use `mem_timeline` to inspect
  chronological context and disambiguate.
- In `openspec` mode, repair missing or stale artifacts by rewriting the
  canonical OpenSpec file only.
- In `thoth-mem` mode, repair missing or stale artifacts by re-saving the full
  artifact to thoth-mem only.
- In `hybrid` mode, use the filesystem copy only as fallback or repair input,
  then converge both stores.
