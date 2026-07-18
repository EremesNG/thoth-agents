# External Provider Continuity Convention

## Ownership Boundary

The independently installed provider exclusively owns its callable surface,
runtime, lifecycle, persistence, storage, and recovery mechanics. thoth-agents
owns only provider-neutral orchestration outcomes: authorization, role
boundaries, persistence-mode selection, artifact identity, handoff context,
continuity, and truthful reporting.

Use installed provider guidance whenever a provider-dependent outcome is
requested. If that guidance or the required capability is unavailable, report
the affected outcome as degraded or unsupported. Never synthesize replacement
operations, claim success without evidence, or silently switch persistence
modes.

## Parent-Scoped Authorization

- Provider-dependent access requires explicit parent-scoped authorization.
- Delegates receive only the accepted scope, decisions, permissions, artifacts,
  project scope, and constraints needed for the assigned task.
- Read-only and write-capable role boundaries remain unchanged.
- Missing, stale, contradictory, or insufficient context is reported instead of
  guessed through.
- Generated subagent prompts are never treated as user intent.

## Canonical SDD Identity

Deterministic SDD artifacts use this identity in provider-backed modes:

```text
sdd/{change}/{artifact}
```

Canonical artifact names include `proposal`, `spec`, `design`, `tasks`,
`plan-review`, `apply-progress`, `verify-report`, `archive-report`, and `state`.
General observations stay outside the protected `sdd/*` namespace.

The identity is a thoth-agents contract. Installed provider guidance determines
how it is stored or recovered.

## Handoff and Completion Continuity

A handoff keeps accepted scope, decisions, permissions, artifact context,
verification expectations, non-goals, and escalation conditions available to
the authorized delegate. Provider mechanics remain external.

At meaningful handoff and completion boundaries, request a resumable summary or
checkpoint outcome when provider-backed continuity is evidenced. This outcome
preserves later continuation; it does not permanently close, terminate, or
finalize work.

When continuity cannot be evidenced, report it as degraded or unsupported and
do not fabricate saved context or a recovery path. Provider-independent work
may continue only when its own prerequisites are satisfied.

## Truthfulness Rules

- Capability state is `supported`, `degraded`, or `unsupported` from evidence.
- Provider-backed persistence or recovery is successful only with evidence of
  the requested outcome.
- No consumer fallback, substitute protocol, provider setup, health probe,
  acquisition workflow, migration, or cleanup is permitted.
- Harness enforcement gaps are disclosed as instruction-level limitations.
