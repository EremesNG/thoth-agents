# Memory provider boundary

thoth-mem is an independently installed provider/plugin. thoth-agents invokes
its public setup command during every harness installation; thoth-mem remains
authoritative for all resulting mutations, hooks, MCP, installed skill, session
lifecycle, prompt capture, compaction, receipts, recovery, runtime state,
persistence protocol, and storage.

thoth-agents owns only provider-neutral orchestration outcomes:

- invoking setup after thoth-agents-owned installation and mandatory skills;
- parsing and reporting confirmed setup evidence and manual actions;
- parent-scoped `none`, `recall`, or `observe` authorization;
- role mutation boundaries;
- truthful `supported`, `degraded`, or `unsupported` capability reporting;
- provider-confirmed semantic continuity outcomes when root owns them; and
- preserving provider assets during thoth-agents install, sync, reset, or removal.

## Invariants

- Never claim a provider effect without confirmed evidence.
- Missing, stale, contradictory, or insufficient context is reported.
- Memory authorization is separate from workspace permission. `observe` may
  authorize a bounded durable provider observation for a read-only workspace
  role, but never file mutation or root lifecycle.
- Dispatch supplies project, stable root session identity or `unavailable`,
  authorization, and bounded context. It never invents identity.
- No thoth-agents package bundles thoth-mem hooks, MCP, protocol text, or
  lifecycle implementation.
- `openspec/` remains the canonical SDD coordination surface; phase artifacts
  are not mirrored into provider memory. Durable lessons and continuity follow
  the installed thoth-mem skill.
- A provider failure degrades memory but does not block unrelated implementation
  or verification.

The bounded orchestration contract lives in
`src/harness/core/memory-governance.ts` and is rendered by harness adapters.
