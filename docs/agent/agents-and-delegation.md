# Agents and delegation

## Canonical roster

The contract has six roles:

- adaptive root: `orchestrator`;
- read-only specialists: `explorer`, `librarian`, `oracle`; and
- implementation writers: `designer`, `worker`.

`src/harness/core/agent-pack.ts` is canonical. `src/agents/index.ts` builds role
definitions and applies overrides; harness adapters translate the same intent.

## Invariants

- Specialists perform discovery, external research and substantive implementation by default.
- Root directs and accepts work, owning goals, constraints, decisions,
  coordination and synthesis. Root retains known low-risk mechanical work
  (including reviewed commits). Explicit user direction controls ownership.
- Delegation depth is one and each mutable surface has one writer. Treat explicit
  safe user direction as an ownership input.
- Shape each retained or delegated unit across discovery, research, planning,
  implementation and verification around one independently acceptable outcome.
  Record its accepted upstream inputs, produced result, owned writes and interface
  boundary, focused check with pass evidence, and return milestone/stop condition.
  Split separately acceptable outcomes; keep cohesive tiny edits together. A
  dependency is a required upstream result, not a preferred order.
- Dispatch all admitted independent ready units before waiting; refill freed
  native capacity before another wait. Release each dependent consumer only
  after its required upstream result is terminal, fresh and accepted. Check
  compatible read assumptions, interfaces and shared resources, not only files.
- Unless the user directs root-owned investigation, unknown local source, flow, or responsibility
  goes to Explorer before root code search, reads or dependency traversal.
  Explorer may receive a bounded assignment whose origin is unknown.
  Root may make one bounded direct consultation only when both the source and
  question are known. If it exposes another discovery path, stop and delegate the
  remaining inquiry. The experimental cumulative allowance is at most two source
  code fragments and about 200 source lines per user request, whichever is reached
  first, across files, tools and subtasks. Required operating instructions and
  pertinent coordination artifacts are excluded; this never permits source/log
  dumps or duplicated specialist discovery. At the limit, route missing evidence
  to a specialist; the allowance never waives required verification. This is
  prompt guidance, not runtime enforcement. A full
  custom `orchestrator.prompt` replacement remains supported and may omit these
  bundled defaults. A fresh specialist must provide a concrete benefit.
- Explorer, librarian, and oracle never mutate the workspace.
- Every dispatch carries bounded thoth-mem `none|recall|observe` authorization
  independently of workspace mode. `observe` may permit a durable provider
  observation, but root lifecycle and real-user intent never transfer.
- Every change verifies. Persisted or materially risky work requires a fresh
  read-only Oracle. A writer cannot approve its result; optional plan review
  never substitutes for final verification.
- Route known sufficiently bounded implementation directly to its writer without
  a mandatory Explorer stage:

  | Signal | Writer | Escalation boundary |
  | --- | --- | --- |
  | Material user-facing UI/UX, interaction, accessibility, or visual quality | `designer` | Coupled backend contracts or non-visual correctness work move to `worker`. |
  | Bounded non-visual implementation, from exact low-risk edits through multi-file, shared-contract, migration, concurrency, edge-case-heavy, or high-risk work | `worker` | Material product/architecture choices return to root. |

  Proven independent surfaces may use separate writers with non-overlapping
  files. Overlapping or compatibility-coupled work stays with one `worker` writer
  and ordered handoffs. Roles are selected as needed, never as a mechanical
  Explorer-to-writer-to-Oracle pipeline. A known bounded implementation goes
  directly to its writer without a discovery relay.
- Root loads only the current work operation from bundled skills instead of
  delegating merely to change prompts.
- Children return conclusions, localized evidence, verification, uncertainty and
  open questions rather than raw dumps. Explorer and Librarian report facts only:
  no recommended fixes, designs, defaults or next actions; an open question they
  cannot settle lists its options and the facts for each without choosing one.
  Oracle adds independent judgment; Worker and Designer add the next
  implementation action. Root does not duplicate
  delegated discovery before, during or after the assignment; unsupported claims
  receive targeted evidence requests or bounded inspection of identified
  evidence. Mandatory independent verification remains intact.
- Delegation failure is reported truthfully and never silently authorizes
  unrestricted root execution. Instructions and coordination artifacts are not
  a loophole for source or log dumps.
- Instruction-only harness gaps must never be described as hard enforcement.

## Bounded execution and supervision

- Preserve operator-selected model and effort, including max. Latency remediation
  changes task shape and supervision, not operator configuration.
- Each assignment has one independently checkable outcome, exact known entrypoints
  and skill paths, owned writes, focused checks, and a return/stop condition. A
  broad label such as “all integration” is not a bound. Split by useful outcomes;
  coupled writes remain sequential, not artificial agents per file.
- Root reacts to native attention or a missed agreed milestone by inspecting the
  current result and steering, narrowing, or stopping safely. A timeout is only a
  safety ceiling. Two consecutive attempts with no new evidence or progress
  require a partial result and the smallest blocker, not another identical loop.
- Native notifications/waits own liveness; no polling, timers or new supervision
  machinery. If attention is unavailable, assign a smaller outcome that returns
  at an agreed milestone. Never replace a writer until termination is reconciled.
- Focused checks accompany edits; final validation waits for stable relevant
  inputs. Reuse fresh evidence, rerun only invalidated checks, and consolidate
  project-wide validation instead of running it for every child.
- If scope grows, a required interface is missing, ownership conflicts, or a new
  independent outcome appears, return bounded progress to root for reassessment
  before expanding the assignment.
- Reconcile owned background results before final return. A late event preserves
  the substantive handoff instead of replacing it with an acknowledgment.
- If the user forbids delegation, do the authorized work directly but disclose
  unavailable independent review. Do not invent an Oracle PASS or archive.

These are tested instruction contracts, not runtime enforcement or latency guarantees.

## Behavioral task shaping

Use semantic triggers, not role-name presence, to select the smallest diverse set
that can change the result:

- `explorer` handles unknown or uncertain local source, effective flow,
  responsibility or behavior and stays read-only. Known bounded implementation
  does not require an Explorer relay.
- `librarian` handles current, unfamiliar, version-sensitive, or externally
  sourced facts—for example, checking the current official API contract; stable
  facts already established locally do not trigger it.
- `oracle` handles independent judgment for material architecture, security,
  contradictory evidence, persistent diagnosis, high failure cost, and required
  final verification.
- `designer` owns material user-facing UI/UX, interaction, accessibility, or
  visual-quality work—for example, implementing and visually checking a new
  responsive settings panel.
- `worker` owns known bounded non-visual implementation regardless of complexity,
  from exact low-risk edits through coupled contracts, shared state, migrations,
  concurrency, edge cases, and high-risk work.

## Behavioral evaluation cases

Use these cases to check prompt behavior. They state expected decisions, not
observed model results:

| Case | Expected behavior |
| --- | --- |
| Source origin is unknown | Assign Explorer before root code reads; begin at zero consulted fragments. |
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

For Pi, use the `subagent_run` tool from `@thoth-agents/pi-subagents` once per
specialist, with a canonical `agent` and bounded `task`. Omit `mode` to follow
definition/configuration and the background fallback; use `mode: "task"` only
when the user explicitly asks to wait for completion. Launch separate ready
background tasks before collecting results. The root coordinates readiness,
dependencies, and acceptance. Use
`subagent_status`, `subagent_result`, and `subagent_cancel` with the known
`task_id`; terminal notifications wake the parent, so do not poll. A cancellation
acknowledgement alone is not proof of termination, and `enable_continue: false`
means continuation must not be assumed. These instructions are not runtime
permissions: the runtime provides no enforced delegation depth, tool allowlist,
or `PI_SUBAGENT_CHILD` marker. The required `session_resources: "lean"` setting
filters `before_agent_start` and `session_start` (except for trusted
`lifecycle_passthrough` packages, which keep their full lifecycle and may replace
the `before_provider_request` payload) but is not a
process or OS sandbox; project-local `subagents.json` can override the global setting. If a native primitive is
unavailable or unproven, report the degradation and use a truthful sequential
fallback; do not emulate another runtime.

## Subagent session lifecycle

A new objective, work phase, mutable surface, or independent judgment is a work
boundary and defaults to a fresh subagent instance. A completed agent with the
desired role is not a reusable role pool. Continue an existing session only to
steer, complete, or clarify the exact same bounded assignment; wait and status
operations only collect that active nonterminal assignment.

Every Oracle plan review, verification round, and approval or PASS judgment
uses a fresh Oracle instance. The prior Oracle session may be resumed only to
clarify its current findings without issuing a new judgment.

| Harness | Fresh work | Same-assignment continuation |
| --- | --- | --- |
| OpenCode | Call `task` without `task_id`. | Pass the prior `task_id`. |
| Codex | Call `collaboration.spawn_agent` with `fork_turns="none"`; set `agent_type` when the active schema exposes it, otherwise use a role-prefixed bounded fallback and report instruction-only selection. | Call `collaboration.followup_task` for the existing agent. |
| Claude Code | Use a normal `Agent` invocation and do not use `fork` for independent work. | Use `SendMessage` with the prior agent ID. |
| Pi | Call `subagent_run` with one canonical `agent`, bounded `task`, and explicit task or background mode; launch independent ready background tasks before collection. | Use `subagent_status`, `subagent_result`, and `subagent_cancel` with the known `task_id`; terminal notifications wake the parent. |

## Entrypoints and tests

- `src/harness/core/agent-pack.ts` and `.test.ts`
- `src/agents/index.ts` and `src/agents/index.test.ts`
- `src/agents/prompt-sections.ts` and prompt-rendering tests
- `src/harness/core/memory-governance.ts` and `sdd-protocol.test.ts`
- `src/config/constants.ts`, `schema.ts`, and config tests
- adapter tests for serialized harness output
