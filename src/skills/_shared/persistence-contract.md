# Persistence Contract

## Supported Persistence Modes

| Mode | Read source | Write targets | Provider dependency |
| --- | --- | --- | --- |
| `thoth-mem` | installed provider | installed provider | required |
| `openspec` | canonical OpenSpec files | canonical OpenSpec files | none |
| `hybrid` | installed provider and canonical OpenSpec files | both targets | required for provider leg |
| `none` | authorized orchestrator context | none | none |

The selected mode is stable. Never silently switch modes or represent a
provider-dependent leg as successful when its required evidence is absent.

## Mode Rules

### `thoth-mem`

1. Recover and persist SDD artifacts through the installed provider guidance.
2. Use canonical `sdd/{change}/{artifact}` identities.
3. Do not create or modify canonical OpenSpec artifacts.
4. If the requested provider outcome cannot be evidenced, report it as degraded
   or unsupported without inventing a fallback.

### `openspec`

1. Read and write canonical OpenSpec paths only.
2. Do not require provider capability.
3. Preserve the canonical artifact names and phase contracts.

### `hybrid`

1. Write the canonical OpenSpec artifact and request the matching provider-backed
   outcome under `sdd/{change}/{artifact}`.
2. Completion requires evidence for both legs.
3. Report divergence or an unavailable provider leg truthfully; do not repair it
   with consumer-authored provider operations or redefine the mode as
   OpenSpec-only.

### `none`

1. Use authorized orchestrator context only.
2. Persist nowhere and return artifacts inline.
3. Do not create or modify OpenSpec files.

## Authorization and Continuity

- The root coordinator owns authorization and provider-neutral continuity
  outcomes for decisions, constraints, progress, and summaries.
- Delegates receive only authorized handoff context needed for their task.
- Read-only roles cannot gain write authority through a persistence mode.
- Write-capable roles may request only explicitly assigned durable outcomes.
- Installed provider guidance owns every provider operation and data shape.
- At handoff and completion boundaries, request a resumable summary or checkpoint
  outcome when evidenced; otherwise report degraded or unsupported continuity.

## Canonical Artifact Identities

- `sdd/{change}/proposal`
- `sdd/{change}/spec`
- `sdd/{change}/design`
- `sdd/{change}/tasks`
- `sdd/{change}/plan-review`
- `sdd/{change}/apply-progress`
- `sdd/{change}/verify-report`
- `sdd/{change}/archive-report`
- `sdd/{change}/state`

General observations remain outside protected `sdd/*`. Canonical OpenSpec paths
remain unchanged for modes that include OpenSpec.

## Failure Semantics

- `supported`: evidence confirms the requested outcome.
- `degraded`: partial evidence or an enforcement limitation prevents full
  assurance.
- `unsupported`: the required capability or guidance is absent.
- Never claim successful persistence, recovery, handoff, or continuity without
  evidence.
- Never invent a consumer fallback, provider lifecycle sequence, substitute
  protocol, or fabricated recovery path.
