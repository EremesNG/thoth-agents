# Feature Specification: Restore user-controlled SDD gates

**Change ID**: `restore-user-controlled-sdd-gates`<br>
**Route**: Full<br>
**Status**: Draft

## Intent and scope

**Why**: Version 0.3 removed two user-owned decisions that existed in 0.2.11:
choosing the SDD route after an agent recommendation, and choosing whether to
request an Oracle plan review after planning is complete. Restoring those
decisions keeps ceremony and review under explicit human control.<br>
**Impact**: The root recommends but does not select Direct, Accelerated, or Full
when the user has not already named a route. Accelerated and Full pause after the
`ready` gate to offer an optional Oracle plan review backed by a bundled
`plan-reviewer` skill. Post-implementation Oracle verification remains mandatory.<br>
**Affected capabilities**: `adaptive-sdd`, `multi-harness-agent-pack`

## User stories

### US1 - Choose the SDD route (Priority: P1)

As a user, I can choose Direct, Accelerated, or Full after seeing the agent's
evidence-based recommendation so that workflow ceremony and risk posture remain
my decision.

**Independent test**: Classify representative low-, moderate-, and high-risk
requests through the public SDD routing function and render each harness root
prompt; every unselected route is presented as a recommendation requiring user
confirmation, while every explicitly selected route is preserved.

**Covers**: FR-001, SC-001

**Acceptance scenarios**:

1. **Given** the user has not named an SDD route, **When** the root assesses the
   request, **Then** it recommends one route with reasons and waits for the user
   to choose Direct, Accelerated, or Full before route-specific work begins.
2. **Given** the user explicitly chooses a route, **When** risk assessment would
   recommend a different route, **Then** the root explains relevant risk but
   follows the user's selected route.
3. **Given** the original request already names Direct, Accelerated, or Full,
   **When** routing starts, **Then** that request counts as the user's choice and
   no duplicate route-selection prompt is required.

### US2 - Decide whether Oracle reviews the plan (Priority: P1)

As a user, I can request the recommended Oracle review after all required SDD
planning artifacts are ready, or proceed without that review, so that independent
pre-implementation review is available without becoming compulsory.

**Independent test**: Query the public phase graph and render every harness root
prompt; Accelerated and Full expose a conditional `plan-review` phase after
`tasks`, both present the two user choices, and implementation remains reachable
when review is declined. Direct exposes no plan-review choice.

**Covers**: FR-002, FR-003, FR-004, SC-002, SC-003, SC-005

**Acceptance scenarios**:

1. **Given** an Accelerated or Full change whose required planning artifacts pass
   `ready`, **When** planning completes, **Then** the root offers “Review plan
   with Oracle (Recommended)” and “Proceed without review” through the harness's
   blocking user-input surface.
2. **Given** the user chooses to proceed without review, **When** the root handles
   the choice, **Then** it does not dispatch Oracle for plan review and may begin
   implementation under the selected route.
3. **Given** the user chooses review, **When** Oracle applies `plan-reviewer`,
   **Then** it returns `[OKAY]` or `[REJECT]`, reports no more than three true
   blockers, remains read-only, and the root persists any review artifact.
4. **Given** Oracle returns `[REJECT]`, **When** the user has not overridden the
   review, **Then** the root repairs only planning blockers and reruns the review;
   the user may explicitly choose to proceed without further review.
5. **Given** Oracle returns `[OKAY]`, **When** the root presents the approved-plan
   overview, **Then** it asks whether to implement or stop; review approval alone
   is not implementation authorization.
6. **Given** implementation completes with or without plan review, **When** final
   verification starts, **Then** read-only Oracle performs `verify`; a prior
   `[OKAY]` never satisfies that mandatory verification.

### US3 - Receive the same choices in every harness (Priority: P1)

As a user of OpenCode, Codex, or Claude Code, I receive the same route and plan
review choices and a locally available plan-review skill so that the restored
workflow is not harness-specific.

**Independent test**: Generate the shared plugin and render all three root
prompts, then assert that the canonical and generated bundles contain
`plan-reviewer`, native user-input names are rendered, and all prompts preserve
the same route/review/verification distinction.

**Covers**: FR-005, FR-006, SC-004, SC-006

**Acceptance scenarios**:

1. **Given** any supported harness, **When** its root prompt is rendered, **Then**
   it tells the root to recommend a route, wait for the user's choice, and offer
   optional Oracle plan review after `ready`.
2. **Given** a generated or initialized thoth-agents installation, **When** owned
   skills are inspected, **Then** `plan-reviewer/SKILL.md` is present alongside
   the existing thoth-owned workflow skills.
3. **Given** Codex or Claude uses a harness-specific blocking input primitive,
   **When** either user decision is requested, **Then** the generated prompt names
   that native primitive without changing the decision semantics.

## Edge cases

- An explicitly selected Direct route receives mandatory Oracle verification but
  creates no planning artifacts and therefore receives no plan-review prompt.
- A recommendation may be Full while the user chooses Direct; the root records
  the risk in its response but does not silently substitute another route.
- If the harness lacks a blocking input primitive, the root reports the
  capability gap and asks directly rather than auto-selecting a route or review.
- A missing, malformed, rejected, or stale `plan-review.md` never counts as
  `[OKAY]`; changed `spec.md`, `plan.md`, `tasks.md`, or an active requirements
  checklist requires a new review only when the user still wants review.
- Skipping plan review does not weaken test-first implementation, final Oracle
  verification, closeout validation, or archive requirements.

## Functional requirements

- **FR-001 — Select the lightest safe route**: `[MODIFIED adaptive-sdd]` The system MUST assess intent, scope, clarity, contract risk, and failure cost, present an evidence-based Direct, Accelerated, or Full recommendation, and obtain the user's explicit route selection before route-specific execution unless the user already named a route; the user's selected route MUST win.
- **FR-002 — Offer user-controlled plan review**: `[ADDED adaptive-sdd]` After an Accelerated or Full change passes the `ready` gate, the system MUST recommend Oracle plan review and MUST let the user choose that review or proceed without it before implementation; Direct MUST NOT activate this choice.
- **FR-003 — Execute and persist selected plan review**: `[ADDED adaptive-sdd]` When the user selects review, the system MUST load the bundled `plan-reviewer` contract, delegate read-only review to Oracle, preserve exact `[OKAY]`/`[REJECT]` semantics with at most three blockers, and let the root persist `openspec/changes/<feature>/plan-review.md` with SHA-256 freshness data for the reviewed planning artifacts. A declined review MUST NOT block implementation, and `[OKAY]` MUST NOT itself authorize implementation.
- **FR-004 — Require independent oracle judgment**: `[MODIFIED adaptive-sdd]` Pre-implementation `plan-review` MUST be conditional on the user's choice and owned by read-only Oracle when selected. Every post-implementation `verify` MUST remain owned by read-only Oracle for Direct, Accelerated, and Full, and no implementation writer or plan-review approval MAY satisfy final verification.
- **FR-005 — Bundle the plan reviewer**: `[ADDED multi-harness-agent-pack]` The canonical thoth-owned skill bundle and every generated or initialized harness distribution MUST include `plan-reviewer`, while generated root prompts MUST express route selection and review selection through each harness's native blocking input surface.
- **FR-006 — Align active governance**: `[INTERNAL]` The repository constitution, initialization constitution template, SDD instructions, prompts, tests, and user documentation MUST consistently state that the user selects the route, plan review is recommended but optional, and final Oracle verification remains mandatory.

## Success criteria

- **SC-001** `[buildable]`: Focused routing tests prove that 100% of unselected representative routes require user confirmation and all three explicit route selections are preserved.
- **SC-002** `[buildable]`: All phase-contract tests prove `plan-review` is conditional and reachable only after planning for Accelerated and Full, implementation remains reachable when it is skipped, and Direct cannot enter it.
- **SC-003** `[buildable]`: All prompt and skill tests prove every supported harness renders both review choices and `plan-reviewer` enforces `[OKAY]`, `[REJECT]`, a three-blocker maximum, read-only Oracle ownership, and freshness-aware OpenSpec persistence.
- **SC-004** `[buildable]`: Every integration generation and init test proves the canonical and shared plugin skill trees contain `plan-reviewer` without vendoring provider-owned persistence behavior.
- **SC-005** `[buildable]`: All ownership tests prove final `verify` resolves to Oracle for Direct, Accelerated, and Full regardless of plan-review choice.
- **SC-006** `[buildable]`: Constitution validation, focused SDD/prompt/bundle tests, `check:ci`, typecheck, build, and the full test suite all pass.

## Assumptions

- “Same behavior as 0.2.11” refers to the two user decisions, the
  `[OKAY]`/`[REJECT]` blocker-focused review, and the separation between review
  approval and implementation confirmation; it does not restore the removed
  requirements-interview, executing-plans, or legacy phase-agent architecture.
- `openspec/` remains the canonical SDD store. The restored skill does not mirror
  `plan-review.md` into thoth-mem because version 0.3 established provider-owned
  memory boundaries and forbids mirroring SDD phase artifacts.
- The user's “Proceed without review” choice authorizes implementation; after an
  accepted review, the root separately asks whether to implement or stop, matching
  the prior interaction.

## Dependencies

- Existing canonical SDD contracts, prompt dialect rendering, shared plugin
  generator, `thoth-init`, and Oracle role.
- No new package or network dependency.

## Out of scope

- Restoring the complete 0.2.11 requirements-interview pipeline, phase-only
  agents, executing-plans skill, or thoth-mem plan-review persistence.
- Making post-implementation Oracle verification optional.
- Supporting harnesses other than OpenCode, Codex, and Claude Code.
- Backward-compatible aliases for the removed v0.2 SDD implementation.
