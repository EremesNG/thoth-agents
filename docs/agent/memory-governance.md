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

Root proactively recalls prior project memory with task key terms before
exploring, planning, or dispatching non-trivial work, unprompted; trivial and
conversational turns are skipped. Memory recall is not source discovery and
precedes dispatch, exempt from the delegate-before-first-read/search/shell rule.

Root saves durable knowledge as soon as verified, unprompted: decisions,
discoveries and findings, bugs with root cause and fix, what worked and failed,
non-obvious conventions, and lessons from accepted specialist results. When a
recovered handoff's pending action is done, root records its outcome. The
installed `thoth-mem` skill owns the protocol; agents must never invent it.

Root retains verified identity, lifecycle, real-user intent, and authorization.
Dispatch grants `none`, `recall`, or `observe` separately from workspace
permissions and carries verified project and root session identity (or
`unavailable`) verbatim. Children use only dispatch-supplied identity verbatim,
never derive it, and report memory unavailable if identity is missing. Memory
authorization never transfers root lifecycle or real-user-intent ownership.

Contract model: `src/harness/core/memory-governance.ts`
(`getMemoryGovernanceContract`). Its `renderMemoryGovernanceInstructions` helper
has no production callers; harness adapters render shared role instructions
from `src/agents/prompt-sections.ts` and dispatch/ownership guidance from
`src/harness/core/agent-pack.ts`. Tests: `src/agents/prompt-rendering.test.ts`,
`src/harness/core/memory-governance.test.ts`, and
`src/harness/provider-boundary.test.ts`. Provider mechanics belong to the
independently installed thoth-mem skill.
