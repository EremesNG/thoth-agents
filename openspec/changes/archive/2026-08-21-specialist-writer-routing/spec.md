# Feature Specification: Predictable specialist-writer routing

**Change ID**: `specialist-writer-routing`<br>
**Route**: Full<br>
**Status**: Draft

## Intent and scope

**Why**: The adaptive root currently defaults every implementation phase to the
orchestrator, so explicit Full-route exploration and Oracle verification appear
reliably while `designer`, `quick`, and `deep` writers are rarely selected. The
agent pack needs predictable writer routing that preserves root decision ownership
while moving suitable implementation work to focused, lower-effort specialists.<br>
**Impact**: Direct micro-actions remain available to the root, but artifact-backed
and other non-trivial implementation work selects a specialist writer by surface
and correctness risk. Generated OpenCode, Codex, and Claude Code instructions,
role descriptions, effort defaults, capability disclosures, documentation, and
routing tests remain aligned.<br>
**Affected capabilities**: `multi-harness-agent-pack`, `adaptive-sdd`, `model-catalog`

## User stories

### US1 - Receive the right implementation specialist (Priority: P1)

As a user of thoth-agents, I can rely on the root to dispatch `designer`, `quick`,
or `deep` for suitable implementation work so that the most capable expensive
context coordinates the outcome without becoming the default writer.

**Independent test**: Render the canonical routing contracts and all three harness
root prompts, then prove that a visual change routes to `designer`, a narrow known
change routes to `quick`, a coupled or correctness-heavy change routes to `deep`,
and only an isolated low-risk Direct action remains root-owned.

**Covers**: FR-001, FR-002, FR-003, SC-001, SC-002

**Acceptance scenarios**:

1. **Given** an Accelerated or Full change has passed its planning gates, **When**
   implementation begins, **Then** the root selects at least one bounded specialist
   writer and does not present itself as the default implementation worker.
2. **Given** one isolated, clear, low-risk Direct action whose delegation overhead
   exceeds its execution cost, **When** implementation begins, **Then** the root may
   perform that action directly and still delegates final verification to Oracle.
3. **Given** UI/UX or visual-quality work, **When** the root selects the writer,
   **Then** `designer` owns the bounded user-facing surface and its visual QA.
4. **Given** a known, narrow, mechanical, low-risk surface, **When** the root selects
   the writer, **Then** `quick` receives exact targets and focused verification.
5. **Given** coupled multi-file behavior, shared contracts, migrations, concurrency,
   edge cases, or high failure cost, **When** the root selects the writer, **Then**
   `deep` owns the bounded implementation surface.

### US2 - Receive consistent routing across harnesses (Priority: P1)

As an operator, I can install any supported harness and receive the same role
selection semantics with truthful native-capability handling so that routing does
not depend on vague role names or stale platform assumptions.

**Independent test**: Generate the OpenCode, Codex, and Claude Code packages and
assert common use/do-not-use boundaries plus each harness's native explicit
selection mechanism or documented instruction-level fallback.

**Covers**: FR-003, FR-004, FR-005, SC-002, SC-003

**Acceptance scenarios**:

1. **Given** a harness exposes an explicit role selector, **When** the root delegates,
   **Then** its instructions require that selector and the selected canonical role.
2. **Given** a Codex host does not expose an explicit custom-role selector, **When**
   delegation is still available, **Then** the generated guidance uses a bounded
   role-prefixed fallback and reports selection enforcement as instruction-only.
3. **Given** any specialist description is rendered, **When** the harness uses it for
   automatic or manual dispatch, **Then** it states when to use the role, when not to
   use it, its mutation boundary, escalation condition, and expected result.

### US3 - Spend specialist effort proportionally (Priority: P2)

As an operator, I can use lower default reasoning effort for bounded specialists
while retaining stronger root and verification judgment so that delegation has a
credible quality, latency, and cost profile instead of merely multiplying tokens.

**Independent test**: Assert the built-in OpenAI and Claude role defaults and render
each generated specialist artifact to prove that supported effort metadata is
present, configurable, and lower than the root default where the role is bounded.

**Covers**: FR-005, FR-006, SC-004, SC-005

**Acceptance scenarios**:

1. **Given** the built-in OpenAI preset, **When** default roles are resolved, **Then**
   root remains the highest-effort coordinator while `explorer` and `quick` use low,
   `designer` and `deep` use medium, and `librarian` and `oracle` use high effort.
2. **Given** Claude Code supports effort frontmatter, **When** specialist agents are
   generated, **Then** every role receives its configured or canonical proportional
   effort rather than silently inheriting the main session's effort.
3. **Given** an operator configures a supported model or effort override, **When**
   artifacts are generated, **Then** the override wins without weakening role
   permissions or routing boundaries.

### US4 - Detect routing regressions without bloated prompts (Priority: P2)

As a maintainer, I can run focused routing and context-budget checks so that future
prompt changes cannot silently starve writers, duplicate work, or reintroduce
unnecessary always-loaded instructions.

**Independent test**: Run a table-driven cross-harness routing suite and the
progressive-context validator/budget tools against generated prompts and repository
entrypoints.

**Covers**: FR-006, FR-007, FR-008, SC-005, SC-006, SC-007

**Acceptance scenarios**:

1. **Given** the canonical role and SDD contracts change, **When** focused tests run,
   **Then** realistic root-direct, designer, quick, deep, explorer, librarian, and
   Oracle cases prove their expected owner and forbidden alternatives.
2. **Given** specialist prompts share lifecycle, memory, and return rules, **When**
   they are rendered, **Then** each semantic rule family has one canonical owner and
   duplicate boilerplate is absent.
3. **Given** repository instructions and routed documents, **When** context validation
   runs, **Then** links and routes pass and before/after estimated context measurements
   are reported without claiming unmeasured billing savings.

## Edge cases

- A change contains independent UI and backend surfaces that can use separate
  writers without overlapping files.
- A nominally mechanical change reveals shared-contract or migration risk and must
  escalate from `quick` to `deep` before expanding its write surface.
- Multiple apparently simple edits form one coupled compatibility chain; `deep`
  remains the single writer rather than parallelizing overlapping work.
- A supported harness lacks hard role selection, per-role effort, or permission
  enforcement and must disclose the exact instruction-only fallback.
- A runtime exposes a stronger selector than the static adapter capability table;
  generated instructions use it conditionally without claiming universal support.
- Visual QA by `designer` remains local implementation evidence and never replaces
  fresh Oracle final verification.
- Documentation-only or mechanical Direct work spans multiple files but remains
  completely understood and cheaper to execute in the root than to hand off.

## Functional requirements

- **FR-001 — Use adaptive-root delegation**: `[MODIFIED multi-harness-agent-pack]` The root MUST handle only an isolated, clear, low-risk Direct implementation action when delegation overhead exceeds execution; for Accelerated and Full it MUST remain the coordination owner and normally delegate each mutable product surface to exactly one selected specialist writer, while every implementation still receives fresh independent Oracle verification.
- **FR-002 — Select specialist writers deterministically**: `[ADDED adaptive-sdd]` The implementation phase MUST select `designer` for user-facing visual/UX work, `quick` for known narrow low-risk work, and `deep` for coupled multi-file, edge-case-heavy, or high-risk work; independent surfaces MAY use separate writers, but overlapping or compatibility-coupled surfaces MUST use one writer and ordered handoffs.
- **FR-003 — Expose routable role contracts**: `[ADDED multi-harness-agent-pack]` Every canonical role description and generated specialist prompt MUST state positive routing triggers, negative routing triggers, allowed mutation scope, escalation conditions, verification duty, and compact return expectations, and the root prompt MUST use those contracts when choosing an owner.
- **FR-004 — Use the strongest truthful native role selector**: `[ADDED multi-harness-agent-pack]` Each harness adapter MUST instruct the root to use an explicit canonical-role selector when the native runtime exposes one and MUST provide a bounded instruction-level fallback otherwise; capability metadata MUST NOT claim structural enforcement that the generated package cannot guarantee.
- **FR-005 — Apply proportionate specialist effort**: `[ADDED model-catalog]` The built-in role defaults MUST keep the root at the highest reasoning effort and set bounded specialists proportionally (`explorer`/`quick`: low, `designer`/`deep`: medium, `librarian`/`oracle`: high), while preserving valid operator overrides and rendering effort metadata in every harness that supports it.
- **FR-006 — Keep specialist prompts compact and canonical**: `[INTERNAL]` Shared prompt composition MUST define lifecycle, delegation-depth, blocking-input, memory-ownership, and return-contract rules once per generated specialist prompt; harness-specific deltas MUST remain local to their adapters and before/after context estimates MUST be recorded.
- **FR-007 — Verify dispatch behavior across harnesses**: `[INTERNAL]` Focused automated tests MUST cover the routing matrix for root Direct, designer, quick, deep, explorer, librarian, and Oracle across shared contracts and generated OpenCode, Codex, and Claude Code surfaces, including native-selector fallback, one-writer ownership, and no self-verification.
- **FR-008 — Synchronize operator and maintainer guidance**: `[INTERNAL]` Routed agent documentation, SDD pipeline guidance, provider/model documentation, bundled skills, generated plugin artifacts, and installation tests MUST describe the same writer-selection, effort, capability, and verification behavior without creating a second canonical policy.

## Success criteria

- **SC-001** `[buildable]`: Automated rendered-prompt assertions contain zero Accelerated or Full route summaries that name `implement (orchestrator role agent)` as the normal implementation owner, while Direct contains exactly one isolated low-risk root exception.
- **SC-002** `[buildable]`: Table-driven tests pass seven routing expectations—UI/visual → `designer`, narrow known low-risk → `quick`, coupled multi-file/high-risk → `deep`, Full discovery → `explorer`, current external evidence → `librarian`, root micro-action → `orchestrator`, and every final verify → fresh `oracle`—in shared and three-harness rendered contracts.
- **SC-003** `[buildable]`: All Codex prompt tests find an `agent_type` requirement when that parameter is exposed and a role-prefixed fallback when it is absent, while capability diagnostics contain zero unconditional claims of structural named-role enforcement.
- **SC-004** `[buildable]`: Canonical default tests and generated artifacts equal low/low/medium/medium/high/high effort for explorer/quick/designer/deep/librarian/oracle, root remains xhigh, and all six Claude specialist artifacts contain effort frontmatter.
- **SC-005** `[buildable]`: Prompt rendering tests report zero duplicated semantic rule families, the always-loaded repository estimate does not increase from its recorded baseline, and every generated specialist prompt estimate is lower than its pre-change measurement.
- **SC-006** `[buildable]`: Focused contract, adapter, prompt, configuration, skill, documentation, and generation tests pass, followed by exit code zero from `pnpm run check:ci`, `pnpm run typecheck`, `pnpm run build`, and `pnpm test` in pre-merge order.
- **SC-007** `[outcome]`: The next representative artifact-backed consumer SDD records at least one appropriate `designer`, `quick`, or `deep` implementation assignment and zero duplicate root implementations of that assigned surface.

## Assumptions

- The current seven-role roster remains complete; no new verifier, fixer, or worker
  role is required.
- Static generated packages can describe conditional runtime capability use even
  when they cannot guarantee which Codex collaboration schema a future host exposes.
- The existing one-writer, maximum-depth-one, fresh-boundary, root-artifact, and
  Oracle-independence contracts remain authoritative.
- Context-budget estimates use the repository's documented characters-divided-by-four
  heuristic and are not billing measurements.

## Dependencies

- Current native role-selection and effort primitives exposed by OpenCode, Codex,
  and Claude Code.
- Existing canonical agent-pack, SDD, prompt-rendering, harness-adapter, model-default,
  generation, skill-contract, and routed-documentation tests.
- Installed `tdd`, `simplify`, `progressive-context-router`, `thoth-sdd`, and
  `plan-reviewer` skills for the governed workflow.

## Out of scope

- Adding or renaming roles, allowing nested delegation, or running overlapping
  writers on the same mutable surface.
- Modifying thoth-mem provider behavior, consumer repositories such as
  RagasaGPT-Reuniones, or native harness implementations outside this repository.
- Claiming universal token, latency, cost, or quality improvements without
  representative before/after evaluation evidence.
- Preserving compatibility with legacy phase-only agents or obsolete harness
  assumptions.
