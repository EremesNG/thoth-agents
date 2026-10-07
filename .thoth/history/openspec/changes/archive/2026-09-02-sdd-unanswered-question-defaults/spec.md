# Feature Specification: SDD unanswered-question defaults

**Change ID**: `sdd-unanswered-question-defaults`<br>
**Route**: Accelerated<br>
**Status**: Draft

## Intent and scope

**Why**: Timed Codex decision prompts can complete without a user answer, but the current SDD contract treats silence as a reason to skip the recommended Oracle review or stop progress.<br>
**Impact**: The three standard SDD decision points will retry unanswered prompts up to three total attempts and then accept the displayed recommended option. Route and implementation questions will include the requested context before prompting, and an automatically selected plan review will converge until Oracle approves.<br>
**Affected capabilities**: `adaptive-sdd`, `multi-harness-agent-pack`

## User stories

### US1 - Continue with the recommended route after silence (Priority: P1)

As an SDD user, I can understand the route recommendation before choosing and rely on that recommendation when timed prompts receive no answer so that the workflow does not stall or silently choose a different route.

**Independent test**: Render the root SDD prompt for each harness and verify that it requires a pre-question context summary, at most three total route-question attempts, and recommended-route fallback only after all three attempts are unanswered.

**Covers**: FR-001, FR-004, SC-001

**Acceptance scenarios**:

1. **Given** the request does not name a route, **When** the root is ready to ask Direct, Accelerated, or Full, **Then** it first gives the user a concise evidence-based scope/risk/context summary and identifies its recommendation.
2. **Given** a recommended route and no user answer, **When** the route prompt has completed unanswered three times, **Then** the recommendation counts as the selected route.
3. **Given** the user answers on any attempt, **When** the route is selected, **Then** that explicit selection wins and no fallback is applied.

### US2 - Default to Oracle review and converge to approval (Priority: P1)

As an Accelerated or Full SDD user, I can rely on the recommended pre-implementation review even when I miss timed prompts so that silence does not weaken plan quality.

**Independent test**: Validate the root prompt, SDD phase protocol, `thoth-sdd`, and `plan-reviewer` contracts for three-attempt review fallback plus repeated artifact correction, ready revalidation, and fresh Oracle review rounds until `[OKAY]`.

**Covers**: FR-002, FR-004, SC-002, SC-003

**Acceptance scenarios**:

1. **Given** an Accelerated or Full change passed `ready`, **When** the Oracle-review question completes unanswered three times, **Then** `Review plan with Oracle (Recommended)` is treated as selected.
2. **Given** Oracle returns `[REJECT]`, **When** the blockers are actionable within the accepted intent, **Then** root corrects the canonical planning artifacts, revalidates the affected gates, and starts a fresh Oracle plan-review round.
3. **Given** repeated review rounds, **When** Oracle returns `[OKAY]`, **Then** plan review is approved and the workflow advances to the implementation decision.
4. **Given** the user explicitly selects `Proceed without review`, **When** the answer is received, **Then** the review fallback is not applied and the existing no-review path remains available.

### US3 - Default to implementation after an approved-plan summary (Priority: P1)

As an SDD user, I can see what Oracle approved before deciding and rely on implementation as the recommended fallback so that an approved plan does not remain idle after timed prompts expire.

**Independent test**: Render and inspect the public workflow contracts to verify that `[OKAY]` is followed by a concise approved-plan summary, up to three total implement-or-stop attempts, and implementation only after an explicit choice or three unanswered attempts.

**Covers**: FR-003, FR-004, SC-004

**Acceptance scenarios**:

1. **Given** Oracle returned `[OKAY]`, **When** root prepares the implementation question, **Then** it first summarizes the approved scope, approach, ownership, verification, and material risks.
2. **Given** the approved-plan question completes unanswered three times, **When** no explicit choice exists, **Then** `Implement (Recommended)` is treated as selected.
3. **Given** the user selects stop on any attempt, **When** the answer is received, **Then** implementation does not start.

## Edge cases

- An empty, cancelled, expired, or otherwise answerless native question result counts as one unanswered attempt; a valid explicit answer stops retries immediately.
- The three-attempt rule applies only to the standard route, plan-review, and approved-plan implementation decisions. Missing secrets, destructive/security-sensitive actions, and unresolved human-owned product or architecture decisions retain their existing blocking behavior.
- A `[REJECT]` caused by a material decision outside the accepted intent remains blocking; the workflow must not invent a product decision merely to force approval.
- Every new Oracle approval round uses a fresh read-only Oracle instance; clarification of current findings may remain with the current reviewer but cannot issue a new approval judgment.
- Explicit user selections always override recommended defaults, including `Proceed without review` and stop.

## Functional requirements

- **FR-001 — Select the lightest safe route**: `[MODIFIED adaptive-sdd]` The system MUST assess intent, scope, clarity, contract risk, and failure cost; present a concise evidence-based context summary before asking; recommend Direct, Accelerated, or Full; and obtain the user's route selection before route-specific execution unless the user already named a route. It MUST make no more than three total attempts when the native question returns without an answer, after which the displayed recommendation MUST count as the selection. Any explicit user selection MUST win.
- **FR-002 — Offer user-controlled plan review**: `[MODIFIED adaptive-sdd]` After an Accelerated or Full change passes `ready`, the system MUST recommend Oracle plan review and let the user choose review or proceed without it before implementation; Direct MUST NOT activate this choice. It MUST make no more than three total attempts when the native question returns without an answer, after which `Review plan with Oracle (Recommended)` MUST count as selected. Once selected, actionable `[REJECT]` findings within the accepted intent MUST cause canonical planning-artifact correction, affected gate revalidation, and a fresh review round until `[OKAY]` or a material human-owned blocker is reached.
- **FR-003 — Execute and persist selected plan review**: `[MODIFIED adaptive-sdd]` When review is explicitly or automatically selected, the system MUST load `plan-reviewer`, delegate each approval round to a fresh read-only Oracle, preserve exact `[OKAY]`/`[REJECT]` semantics with at most three blockers, and let root persist freshness evidence. After `[OKAY]`, root MUST present a concise approved-plan summary before asking whether to implement or stop, with `Implement (Recommended)` first. It MUST make no more than three total attempts when that native question returns without an answer, after which implementation MUST count as selected. `[OKAY]` alone MUST NOT authorize implementation before that explicit choice or fallback completes.
- **FR-004 — Bundle the plan reviewer**: `[MODIFIED multi-harness-agent-pack]` Canonical workflow skills and generated root prompts MUST express the three standard SDD decisions through each harness's native blocking input surface, MUST distinguish explicit answers from no-answer results, MUST limit unanswered retries to three total attempts, and MUST identify and apply the specified recommended fallback after the third unanswered attempt.

## Success criteria

- **SC-001** `[buildable]`: All 3 supported harness root-prompt outputs pass assertions for the pre-route summary, three-total-attempt rule, recommended-route fallback, and explicit-selection precedence.
- **SC-002** `[buildable]`: Every affected public workflow contract passes assertions that the third unanswered ready-gate choice selects Oracle review rather than proceeding without review.
- **SC-003** `[buildable]`: Every affected public workflow contract passes assertions that actionable `[REJECT]` results trigger planning-artifact correction, affected gate revalidation, and fresh Oracle rounds until `[OKAY]`.
- **SC-004** `[buildable]`: Every affected public workflow contract passes assertions that `[OKAY]` is followed by an approved-plan summary and that the third unanswered implementation choice selects `Implement (Recommended)`, while an explicit stop remains authoritative.

## Assumptions

- Harness-native question tools can distinguish a valid answer from a result with no answer; enforcement remains instruction-level where the harness exposes no programmatic retry primitive.
- “Ask a maximum of three times” means three total attempts, not three retries after the first attempt.
- The recommended implementation fallback applies after Oracle approval; an explicit `Proceed without review` keeps its existing authorization semantics.

## Dependencies

- Existing native blocking-input primitives and the bundled `thoth-sdd` and `plan-reviewer` skills.
- Existing `ready` validator and fresh-Oracle work-boundary policy.

## Out of scope

- Adding a scheduler, timer, or new question runtime to thoth-agents.
- Auto-resolving missing secrets, destructive or security-sensitive actions, or material human-owned product/architecture decisions.
- Changing final Oracle verification requirements.
