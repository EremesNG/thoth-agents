# Agents and delegation

## Canonical roster

The contract has six roles:

- root coordinator: `orchestrator`;
- read-only specialists: `explorer`, `librarian`, `oracle`; and
- implementation writers: `designer`, `worker`.

`src/harness/core/agent-pack.ts` is canonical. `src/agents/index.ts` builds role
definitions and applies overrides; harness adapters translate the same intent.

## Product contract ownership

The product coordinates specialist discovery, implementation, and independent
judgment through bounded work units. Role selection, ownership exceptions,
concurrency, supervision, and session boundaries are prompt contracts, not OS
isolation or latency guarantees.

Owners: `src/harness/core/agent-pack.ts` (`AGENT_ROLES`,
`ORCHESTRATION_POLICY`, ownership/task-shaping policies, `AGENT_RETURN_CONTRACT`,
`VERIFICATION_PROTOCOL`); `src/agents/prompt-sections.ts` and
`src/agents/prompt-dialects.ts` render harness-specific guidance.
Tests: `src/harness/core/agent-pack.test.ts`,
`src/harness/core/agent-routing.test.ts`, and prompt-rendering tests.

## Behavioral evaluation cases

Use these cases to check prompt behavior. They state expected decisions, not
observed model results:

| Case | Expected behavior |
| --- | --- |
| Source origin is unknown | Assign Explorer before any root code search, file read, shell/git inspection or CodeGraph query; no preliminary discovery, even when navigation instructions name root. |
| A known-source lookup reveals another path | Stop the direct lookup and delegate the new discovery question. |
| Specialist report has sufficient localized evidence | Accept it without repeating discovery. If a claim lacks support, request that specific evidence from the specialist. |
| Tiny question has a known source and answer boundary | Root may consult only the needed fragment and stop within the cumulative allowance. |
| Implementation is known and bounded | Assign Worker or Designer directly; do not insert Explorer. |
| Two Explorer questions have separate outcomes and no shared evidence | They may run in parallel within native capacity; do not split one cohesive inquiry mechanically. |
| One Explorer question depends on another's finding | Hold it until the upstream result is terminal, fresh and accepted. |
| Writer assignment contains several independently acceptable outcomes | Split along outcome/interface boundaries; keep coupled writes with one writer and ordered handoffs. |
| Edit is tiny and cohesive | Keep it as one bounded unit rather than fragmenting by file or check. |

For comparative evaluation, use the same cases and outcome rubric where
practical, and record root source fragments/lines consulted, duplicated evidence,
outcome quality, elapsed latency and cost; mark unavailable measures as such.
This documentation change reports no measurements and claims no gains or model
compliance.

## Pi runtime integration

Pi delegation runs through `@thoth-agents/pi-subagents`, with native task
notifications, results, cancellation, and root/child messaging. Its registry
filters child tools; instruction-level role boundaries and lean lifecycle
resources do not provide an OS sandbox. The tools panel and user-question UI
are separate runtime surfaces, described in
[harness packaging](harness-packaging.md).

Owners: `pi-packages/pi-subagents/src/`, `src/agents/prompt-dialects.ts`,
`src/cli/pi-tool-config.ts`, and `pi-packages/pi-questions-user/`.
Tests: `src/harness/adapters/pi.test.ts` and the corresponding Pi package tests.

## Entrypoints and tests

- `src/harness/core/agent-pack.ts` and `.test.ts`
- `src/agents/index.ts` and `src/agents/index.test.ts`
- `src/agents/prompt-sections.ts` and prompt-rendering tests
- `src/harness/core/memory-governance.ts` and `sdd-protocol.test.ts`
- `src/config/constants.ts`, `schema.ts`, and config tests
- adapter tests for serialized harness output
