# Memory provider boundary

thoth-mem is an independently installed provider/plugin. Published
thoth-agents installations invoke its public setup command; an explicit local
Pi package install omits that step and requires a separate local thoth-mem
install. thoth-mem remains authoritative for all resulting mutations, hooks,
MCP, installed skill, session lifecycle, prompt capture, compaction, receipts,
recovery, runtime state, persistence protocol, and storage.

thoth-agents owns only provider-neutral orchestration outcomes:

- invoking setup after thoth-agents-owned installation and mandatory skills;
- parsing and reporting confirmed setup evidence and manual actions;
- parent-scoped `none`, `recall`, or `observe` authorization;
- role mutation boundaries;
- truthful `supported`, `degraded`, or `unsupported` capability reporting;
- provider-confirmed semantic continuity outcomes when root owns them; and
- preserving provider assets during thoth-agents install, sync, reset, or removal.

## Product contract ownership

The product renders bounded memory authorization separately from workspace
permissions, reports missing or degraded evidence, and leaves provider effects
and lifecycle to thoth-mem. `.thoth/` project governance is distinct from provider
memory; unrelated implementation can continue when provider memory degrades.

Owner: `src/harness/core/memory-governance.ts`
(`getMemoryGovernanceContract`, `renderMemoryGovernanceInstructions`), rendered
by harness adapters. Tests: `src/harness/core/memory-governance.test.ts` and
`src/harness/provider-boundary.test.ts`. Provider mechanics belong to the
independently installed thoth-mem skill and implementation.
