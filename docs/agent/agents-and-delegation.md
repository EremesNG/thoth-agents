# Agents and delegation

## Canonical roster

The contract has six roles:

- adaptive root: `orchestrator`;
- read-only specialists: `explorer`, `librarian`, `oracle`; and
- implementation writers: `designer`, `worker`.

`src/harness/core/agent-pack.ts` is canonical. `src/agents/index.ts` builds role
definitions and applies overrides; harness adapters translate the same intent.

## Invariants

- Root retains goals, constraints, decisions, coordination, semantic acceptance
  and synthesis. Specialists perform discovery, external research and
  substantive implementation by default, independently of persistence mode.
  Root retains known low-risk mechanical work (including reviewed commits).
  Explicit direct-work or no-delegation instructions take precedence.
- Delegation depth is one and each mutable surface has one writer. Treat explicit
  safe user direction as an ownership input.
- Before substantive execution, shape the work into bounded units: record exact
  output dependencies, mutable ownership, specialist fit, and verification inputs.
  A dependency means a lane needs a concrete upstream artifact or decision; mere
  preference for an order is not a dependency.
- Dispatch all admitted independent ready units before waiting; refill freed
  native capacity before another wait. Accept terminal fresh outputs before
  releasing each dependent consumer, without a global wave barrier. Compatibility
  includes read assumptions, interfaces and shared resources, not only filenames.
- Unknown local source, effective flow or responsibility triggers Explorer before
  root repository search or dependency traversal unless the user requests direct
  investigation. Its bounded assignment may
  name an unknown location; root does not perform exploratory pre-reading to
  prepare it. The assigned investigator owns applicable discovery-tool fallback.
- Root may retain bounded known-source work with known scope and checks; another
  targeted search or file count does not force delegation. Reassess only when
  actual uncertainty, scope or risk increases. Do not restart discovery to commit
  already reviewed changes. A fresh specialist must provide a concrete benefit.
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
  Explorer-to-writer-to-Oracle pipeline.
- Root loads only the current work operation from bundled skills instead of
  delegating merely to change prompts.
- Children return conclusions, localized evidence, verification, uncertainty,
  open questions and next action rather than raw dumps. Root does not duplicate
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

For Pi, always use one direct `subagent` call per specialist, including when
multiple specialists are ready. Never use Pi subagent orchestration APIs such as
`workflow`, `workflowScript`, `workflowScriptPath`, or `runs.*`; the root
coordinates readiness, dependencies, and acceptance rather than delegating
orchestration. This is instruction-level policy, not runtime enforcement;
higher-priority Pi or extension instructions remain authoritative and conflicts
must be reported. Every direct specialist launch must explicitly supply an
`async` boolean chosen by root: use `async: false` for suitable intentional
foreground execution, and `async: true` when background concurrency or provider
loading requires it. Never omit `async` or rely on the overridable
`asyncByDefault`. Librarian launches explicitly request `async: true` because
the frontmatter and `asyncByDefault` values are overridable and foreground
children do not load ambient extensions. Provider loading and required-tool
registration are independent checks; verify both before claiming evidence.

Native harness execution and lifecycle are the sole authority for role selection,
fan-out, status/wait, steering, cancellation, and terminal results. If a native
primitive is unavailable or unproven, report the degradation and use a truthful
sequential fallback; do not emulate another runtime.

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
| Pi | Call `subagents_enable({})`, then on the next request call `subagent` with one canonical `agent`, a bounded `task`, and an explicit `async` boolean chosen by root. Thoth normally requests `context: "fresh"`; native `fork` and `profile` remain available when policy intentionally selects them. Use `async: false` for suitable intentional foreground execution or `async: true` when background concurrency or provider loading is needed, especially for librarian/MCP work; never omit `async` or rely on `asyncByDefault`. | Use native `subagent` actions with the known run `id`: `status`, `stop`, or `steer` (`mode: steer|follow_up|auto`). |

## Entrypoints and tests

- `src/harness/core/agent-pack.ts` and `.test.ts`
- `src/agents/index.ts` and `src/agents/index.test.ts`
- `src/agents/prompt-sections.ts` and prompt-rendering tests
- `src/harness/core/memory-governance.ts` and `sdd-protocol.test.ts`
- `src/config/constants.ts`, `schema.ts`, and config tests
- adapter tests for serialized harness output
