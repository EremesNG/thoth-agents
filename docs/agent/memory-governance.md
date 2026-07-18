# Memory provider boundary

thoth-mem is an independently installed provider/plugin. It is authoritative for
its setup, hooks, MCP, session lifecycle, prompt capture, compaction, recovery,
runtime state, persistence protocol, and storage.

thoth-agents owns only provider-neutral orchestration outcomes:

- parent-scoped authorization;
- role mutation boundaries;
- truthful `supported`, `degraded`, or `unsupported` capability reporting;
- resumable summaries/checkpoints when provider evidence confirms them; and
- preserving provider assets during thoth-agents install, sync, reset, or removal.

## Invariants

- Never claim a provider effect without confirmed evidence.
- Missing, stale, contradictory, or insufficient context is reported.
- Read-only roles do not gain write authority from provider availability.
- No thoth-agents package bundles thoth-mem hooks, MCP, protocol text, or
  lifecycle implementation.
- `openspec/` remains the SDD coordination surface; any additional provider
  persistence follows the installed provider's own guidance.

The provider-neutral contract lives in
`src/harness/core/memory-governance.ts` and is rendered by harness adapters.
