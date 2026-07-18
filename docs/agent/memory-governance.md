# Memory Governance

## Responsibility

This route documents the boundary between thoth-agents orchestration and the
independently installed thoth-mem provider. The external provider is
authoritative for installation, hooks, session lifecycle, root prompt capture,
compaction/recovery, runtime state, and persistence mechanics.

thoth-agents owns only outcome-level coordination: parent-scoped authorization,
role permissions, resumable summaries or checkpoints, canonical SDD artifact
identity, and truthful capability reporting. A completion boundary never means
permanent session closure.

## Invariants and risks

- Provider-dependent work requires authorized parent context; missing, stale,
  contradictory, or insufficient evidence is reported explicitly.
- Capability states are `supported`, `degraded`, or `unsupported`; consumer
  guidance never fabricates provider success.
- Deterministic SDD artifacts use `sdd/{change}/{artifact}`. General
  observations remain outside `sdd/*`.
- Read-only roles cannot gain durable-write authority from provider access.
- Rollback/removal covers only consumer-managed thoth-agents assets and
  preserves independently installed provider configuration.
- Stage 2 cross-harness capability hardening remains an accepted follow-up; it
  is not silently implemented by this route.

## Routing and verification

- `src/harness/core/memory-governance.ts` defines the provider-neutral contract
  and diagnostics.
- Harness adapters render the same ownership and continuity outcomes while
  preserving harness-specific bindings.
- Focused governance tests verify ownership, authorization, continuity, and
  truthful degraded/unsupported reporting.
- Provider protocol details must be read from the installed provider guidance,
  not copied into this repository.

## Related routes

- [`sdd-and-skills.md`](sdd-and-skills.md) for SDD phase ordering and artifact
  governance.
- [`runtime-integrations.md`](runtime-integrations.md) for consumer hooks and
  MCP composition.
- [`harness-packaging.md`](harness-packaging.md) for generated harness assets.
