# Implementation Plan: Route-independent implementation ownership

## Technical context

The previous change corrected writer starvation but overcorrected by encoding
route-specific ownership. `src/harness/core/sdd.ts` returns
`adaptive-implementation` only for Direct and `selected-writer` for Accelerated
and Full. `src/harness/core/agent-pack.ts`, shared root prompts, `thoth-sdd`,
routed documentation, generated plugin output, and their tests repeat the same
coupling. The active repository `AGENTS.md` also unconditionally sends all visual
or UX work through `designer`, bypassing the required net-gain decision.

The project constitution already requires delegation only for net gain and does
not tie it to SDD route, so no constitution amendment is needed. Official OpenAI
multi-agent guidance recommends delegation for concrete independent bounded
workstreams and focused context, while preferring one agent for sequential chains
or shared mutable state. Official Anthropic guidance likewise chooses subagents
from task descriptions and context value, and prefers the main conversation when
planning, implementation, and testing share significant context. This change
restores those principles without changing models, role permissions, selectors,
SDD artifacts, or mandatory Oracle verification.

The workspace already contains the complete uncommitted archived predecessor
change. All implementation must preserve that work and layer only the new
route-independence correction on top of it.

## Constitution Check (pre-design)

- **Adaptive-root orchestration**: PASS — The principle already states that root may edit clear bounded work and delegates only for net gain; the current route-coupled implementation is the inconsistency being repaired.
- **Explicit role boundaries**: PASS — The seven roles and read/write boundaries remain unchanged; only implementation-owner eligibility becomes route-neutral.
- **Proportional Spec Kit-compatible SDD**: PASS — Direct, Accelerated, and Full retain their existing artifacts and gates; route selection remains user-owned.
- **Truthful multi-harness contracts**: PASS — One canonical owner policy will render through OpenCode, Codex, and Claude while preserving each harness's selector and enforcement limits.
- **Independent provider ownership**: PASS — No thoth-mem installation, lifecycle, persistence, or recovery behavior changes.
- **Evidence-led completion**: PASS — Behavior changes use TDD, all routes retain mandatory fresh Oracle verification, and the artifact-backed change closes only after PASS and archive.

## Design

### Canonical ownership decision

Extend the canonical orchestration contract with structured implementation
ownership policy rather than another route branch. The public policy will expose:

- eligible implementation owners: root, `designer`, `quick`, and `deep`;
- route independence: Direct, Accelerated, Full, or no-artifact execution is
  never sufficient to choose or reject an owner;
- delegation-benefit factors: specialization, focused context, independent
  bounded work, safe parallelism, measured quality/latency/total-cost gain;
- root-continuity factors: short work, one ordered reasoning chain, frequent
  shared-state writes, already-loaded context, rediscovery, coordination cost;
- explicit user direction as an ownership input within safety and mandatory
  verification boundaries; and
- insufficient signals: route name, file count alone, or cheaper model price
  without end-to-end evidence.

The existing specialist matrix remains conditional on a delegation decision:
UI/UX selects `designer`, known narrow low-risk work selects `quick`, and coupled
or high-risk work selects `deep`.

### Route-neutral SDD contract

Remove `selected-writer` from `SddPhaseOwner`. The implement phase uses
`adaptive-implementation` for all routes and retains the same eligible owner set.
`getSddPhaseOwner` becomes route-invariant for implement. Route rendering states
that artifacts/gates and implementation ownership are separate.

The implement protocol requires an owner decision plus task-shape/net-gain
evidence. When root owns implementation there is no child dispatch. When a
specialist owns it, root supplies the bounded dispatch envelope. Artifact-backed
tasks still have root-owned checkbox state; Direct/no-artifact work has none.

### Prompt and harness rendering

Shared prompt composition renders the structured decision factors once. All
three harness roots must say:

- the SDD route controls governance, not implementation ownership;
- root or a specialist may implement in every route;
- delegate only for demonstrated net gain;
- use the deterministic writer matrix only after deciding to delegate; and
- final Oracle verification remains independent.

Adapters retain only native selector, namespace, sandbox, permission, and
capability deltas. No adapter receives a separate ownership policy.

### Evaluation and documentation

Replace the route-coupled regression with a route/owner cross-product. It must
include Direct→designer, Direct→deep, Accelerated→root, Full→root, and a
route-neutral quick delegation, while continuing to test explorer, librarian,
Oracle, one-writer ownership, and no self-verification. The regression consumes
realistic routed fixtures and actual generated OpenCode, Codex, and Claude roots.

Update the active repository `AGENTS.md`, canonical `thoth-sdd` ownership and
implement guidance, routed delegation documentation, and the SDD pipeline owner
table. Regenerate the plugin from canonical sources. Preserve the archived
predecessor audit trail unchanged; this new change will transactionally modify
the two canonical requirements at its own archive.

### Implementation ownership for this change

Root is the implementation writer for this Accelerated change. The work is one
ordered, compatibility-coupled contract chain; planning, source edits, tests,
skills, documentation, and generation share significant context and mutable
state. A new implementation subagent would repeat discovery without providing
an independent workstream, so delegation has no demonstrated net gain. Root
will not verify its own work; a fresh Oracle remains mandatory. This decision is
task-shaped, not an Accelerated-route default.

### Requirement mapping

| Requirement | Technical decision | Files/interfaces | Verification seam |
| --- | --- | --- | --- |
| FR-001 | Add structured route-independent ownership factors to the canonical policy and root role. | `src/harness/core/agent-pack.ts` | Agent-pack contract tests reject route-only ownership. |
| FR-002 | Keep the writer matrix conditional on an explicit delegation decision. | `src/harness/core/agent-pack.ts`, `skills/thoth-sdd/references/phases/implement.md` | Writer-role cases pass in every route. |
| FR-003 | Use one `adaptive-implementation` phase owner for Direct, Accelerated, and Full. | `src/harness/core/sdd.ts` | SDD owner and protocol tests pass with no `selected-writer`. |
| FR-004 | Render delegation-benefit, root-continuity, user-direction, and insufficient-signal factors once. | `src/agents/prompt-sections.ts` | Shared and three-harness prompt assertions pass. |
| FR-005 | Add route/owner cross-product cases and consume realistic fixtures. | `src/harness/core/agent-routing.test.ts`, `docs/agent/routing-cases.json` | Exact owner/forbidden-condition matrix passes. |
| FR-006 | Update active instructions, skills/docs, and regenerate the plugin from canonical source. | `AGENTS.md`, `skills/thoth-sdd/`, `docs/`, `plugin/` | Stale-policy scans, integration parity, and progressive-context validation pass. |
| FR-007 | Preserve depth, one writer, permissions, handoffs, SDD state ownership, and fresh Oracle. | `src/harness/core/agent-pack.ts`, `src/harness/core/sdd.ts` | Focused safety-boundary and final verification checks pass. |

## Optional support artifacts

- `research.md`: Not needed; current official OpenAI and Anthropic pages answer the bounded orchestration question and the design records only their directly supported task-shape factors.
- `data-model.md`: Not needed; no persisted data or schema changes.
- `contracts/`: Not needed; the exported TypeScript ownership policy is the public contract and existing tests are its executable specification.
- `quickstart.md`: Not needed; operator behavior is covered by routed docs and realistic routing cases.

## Risks and migrations

- **Root overuse returns**: Route neutrality could again starve specialists. Mitigation: structured positive delegation factors, deterministic post-decision writer selection, explicit route/owner cross-product tests, and SC-007 telemetry.
- **Ceremonial subagents persist under new wording**: A generic “net gain” sentence can be ignored. Mitigation: make both benefit and overhead factors executable contract data and test their generated rendering.
- **Total-cost claims become misleading**: Cheaper subagent models can still increase total tokens through rediscovery. Mitigation: price alone is an explicitly insufficient signal and no percentage savings are claimed without measurement.
- **Cross-harness drift**: Adapter-local prose could reintroduce route coupling. Mitigation: shared prompt composition, adapter assertions, generated parity, and stale-phrase scans.
- **Dirty predecessor work is damaged**: The prior archived change is uncommitted. Mitigation: preserve all existing edits, never rewrite its archive, and review the final diff by the new change's exact surfaces.
- **Rollback**: Before archive, revert only this change's bounded diffs. After archive, the dated audit and declared MODIFIED deltas provide the recovery baseline; no compatibility layer is required.

## Constitution Check (post-design)

- **Adaptive-root orchestration**: PASS — One structured, route-independent owner decision now implements the constitution's net-gain rule and explicitly allows root or specialists in every route.
- **Explicit role boundaries**: PASS — Root and the three writers stay write-capable within one assigned surface; explorer, librarian, and Oracle remain read-only.
- **Proportional Spec Kit-compatible SDD**: PASS — The design changes ownership semantics only; route artifacts, gates, user selection, and archive remain intact.
- **Truthful multi-harness contracts**: PASS — Shared source owns the decision policy and adapters preserve only real native deltas, with cross-harness generated tests.
- **Independent provider ownership**: PASS — Memory provider behavior and authorization remain outside the change.
- **Evidence-led completion**: PASS — Test-first slices, proportional checks, fresh Oracle verification, convergence on failure, and transactional archive are explicit.
