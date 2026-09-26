# Implementation Plan: Behavioral Agent Orchestration

## Technical context

The canonical seven-role pack is already shared by OpenCode, Codex, and Claude Code, and every harness already owns dispatch, concurrency, status, waiting, steering, cancellation, and terminal results. The defect is in root task shaping: `src/harness/core/agent-pack.ts` describes roles and broad net-gain rules, while `src/agents/prompt-sections.ts` renders mostly declarative guidance. It does not give the root a compact ordered procedure for splitting work, distinguishing dependencies from accidental sequence, assigning one writer per surface, selecting all specialists with equal salience, dispatching every ready lane before waiting, or joining native results.

The current SDD contract also assigns every final verification to Oracle. That makes a one-line or similarly deterministic Direct change pay the same review ceremony as an artifact-backed or high-risk change. The accepted behavior keeps verification mandatory but makes the owner proportional: Accelerated and Full retain fresh Oracle verification, while Direct uses Oracle only for material risk or uncertainty and otherwise permits focused root verification. This semantically redefines Constitution principles 1 and 6, so the implementation includes a governed MAJOR amendment from `5.0.0` to `6.0.0` before activating the new gate.

No executor, scheduler, job board, task database, projection, trace collector, lifecycle state, observer, or orchestration tool is introduced. The implementation changes policy, rendered root instructions, deterministic gate logic, fixtures, and documentation; native harness results remain authoritative.

## Constitution Check (pre-design)

- **Adaptive-root orchestration**: JUSTIFIED EXCEPTION — The accepted change replaces unconditional Oracle ownership of Direct final verification with risk-proportionate ownership; `openspec/memory/constitution.md` must receive a 5.0.0 → 6.0.0 MAJOR amendment before the behavior is activated.
- **Explicit role boundaries**: PASS — The design retains exactly the existing seven roles, depth one, read-only discovery/review roles, bounded writers, root-owned SDD artifacts, and one writer per mutable surface.
- **Proportional Spec Kit-compatible SDD**: PASS — The design removes ceremony that has no decision or risk value while preserving user route selection, optional plan review, artifact-backed gates, convergence, and archive.
- **Truthful multi-harness contracts**: PASS — The shared policy shapes work only; OpenCode, Codex, and Claude Code continue to execute exclusively through their documented native primitives and expose truthful degradation.
- **Independent provider ownership**: PASS — The change does not alter thoth-mem installation, lifecycle, persistence, hooks, MCP ownership, or dispatch authorization.
- **Evidence-led completion**: JUSTIFIED EXCEPTION — Verification remains mandatory, but the accepted change narrows independent Oracle ownership to Accelerated, Full, and materially risky Direct work; the same 6.0.0 amendment and propagated contracts resolve the exception.

## Design

### 1. Canonical task-shaping contract

Extend `OrchestrationPolicy` in `src/harness/core/agent-pack.ts` with one compact, harness-neutral decision procedure and explicit native coordination invariants:

1. identify bounded work units and their concrete outputs;
2. record exact information dependencies and mutable ownership;
3. separate ready lanes from blocked lanes;
4. evaluate specialist fit across `explorer`, `librarian`, `oracle`, `designer`, `quick`, and `deep` before retaining root ownership;
5. dispatch all valuable, conflict-free ready lanes through native harness primitives before waiting;
6. accept completion only from terminal native evidence; and
7. fan results in against user intent, dependencies, ownership, conflicts, and verification needs.

The contract will encode dependency, write-conflict, duplication, bounded-width, and truthful-degradation rules but no executable lifecycle state. Role contracts will gain equally salient positive and negative triggers so `quick`, `librarian`, and `designer` are first-class choices rather than footnotes.

### 2. Compact root rendering

Refactor `src/agents/prompt-sections.ts` to render the canonical procedure once and a compact complete specialist directory derived from the role contracts. Harness adapters will continue to append only native syntax and capability guidance:

- OpenCode uses its native task/background/status surfaces;
- Codex uses the ambient root plus native collaboration surfaces; and
- Claude Code uses its native Agent/subagent surfaces.

The renderer will instruct fan-out before the first blocking wait, terminal-evidence fan-in, fresh sessions at work boundaries, one writer per surface, and sequential fallback when native concurrency is unavailable. It will not claim that prompt text itself proves runtime dispatch. Character-budget tests will compare each generated root with a checked pre-change baseline and cap the harness-neutral increase at 2,500 characters.

### 3. Proportionate verification decision

Add a pure SDD verification decision contract in `src/harness/core/sdd.ts`. The input will contain route plus explicit material-risk signals; the output will state whether Oracle is required and the bounded reason:

- Accelerated and Full: fresh read-only Oracle is mandatory for final verification;
- Direct with architecture, security, cross-cutting regression, persistent diagnosis, contradictory evidence, high failure cost, or comparable uncertainty: fresh read-only Oracle is mandatory;
- trivial deterministic Direct with focused checks and no material signal: root performs mandatory focused verification without Oracle.

The decision changes verification ownership only. It does not make verification optional, let an implementation writer issue an Oracle verdict, or let optional plan review replace final verification.

### 4. Governance and durable contract propagation

Amend `openspec/memory/constitution.md` from 5.0.0 to 6.0.0, preserving ratification, setting the amendment date to 2026-08-31, updating the Sync Impact Report and history, and redefining principles 1 and 6 only as required. Propagate the rule to:

- `skills/thoth-sdd/SKILL.md` and affected phase references;
- `skills/plan-reviewer/SKILL.md`;
- `skills/thoth-constitution/templates/constitution.md`;
- `AGENTS.md` and routed agent guidance;
- `README.md` and SDD/install/packaging quick-reference documentation.

Generated `plugin/` copies will be produced only through the existing `pnpm run integration:sync` path and verified for parity; they are not separate hand-maintained policy sources.

### 5. Behavior fixtures and evidence

Evolve `docs/agent/routing-cases.json` from name-presence coverage into at least 15 structured orchestration decisions. Fixtures will cover every specialist, at least two positive cases each for `quick`, `librarian`, and `designer`, independent fan-out, a true dependency, overlapping writes, duplicate research, root-continuity Direct work, bounded native width, timeout remaining nonterminal, trivial Direct without Oracle, risky Direct with Oracle, and Accelerated/Full Oracle verification.

Focused tests will validate the typed policy and generated roots rather than merely searching for role names:

- `src/harness/core/agent-pack.test.ts` — canonical procedure, full roster, ownership and no-runtime invariants;
- `src/harness/core/agent-routing.test.ts` — fixture coverage, decision-specific positive/negative signals, ready/blocked semantics, and cross-harness rendering;
- `src/harness/core/sdd.test.ts` — route/risk verification decisions and phase ownership;
- `src/agents/prompt-rendering.test.ts` — one ordered procedure, complete directory, proportional Oracle wording, native dialects, and size budget;
- `src/harness/sdd-constitution.test.ts` and `src/harness/bundled-skills.test.ts` — constitution/skill propagation;
- affected adapter and integration-package tests — generated package parity without new public tools or runtime assets.

Live OpenCode, Codex, and Claude smoke tests remain outcome evidence. They will use semantically diagnostic prompts and report actual native task IDs, dispatch order, selected roles, waits, terminal results, and absence of Oracle on trivial Direct cases. Build tests must not claim those model outcomes are guaranteed.

### Requirement mapping

| Requirement | Technical decision | Files/interfaces | Verification seam |
| --- | --- | --- | --- |
| FR-001 | Add an ordered task-shaping and native fan-out/fan-in policy with ready/blocked lanes and one-writer ownership. | `src/harness/core/agent-pack.ts`, `src/agents/prompt-sections.ts` | Agent-pack contract tests, structured routing fixtures, rendered-root tests, live native smoke evidence. |
| FR-002 | Render the full specialist directory from canonical positive and negative role triggers with equal root salience. | `src/harness/core/agent-pack.ts`, `src/agents/prompt-sections.ts`, `docs/agent/routing-cases.json` | Every role covered; at least two positive `quick`, `librarian`, and `designer` fixtures; all harness roots contain the same semantics. |
| FR-003 | Keep writer choice route-independent and make `designer`/`quick`/`deep` boundaries explicit after the net-gain decision. | `src/harness/core/agent-pack.ts`, `src/harness/core/agent-routing.test.ts` | Positive/forbidden-owner fixtures, escalation cases, one-writer conflict cases. |
| FR-004 | Introduce a typed route/risk decision for Oracle versus root verification and propagate the durable governance change. | `src/harness/core/sdd.ts`, `openspec/memory/constitution.md`, `skills/thoth-sdd/SKILL.md`, `skills/plan-reviewer/SKILL.md` | SDD decision table tests, constitution validator, skill parity tests, Direct/Accelerated/Full prompt assertions. |
| FR-005 | Keep the feature as shared policy and rendered instructions; explicitly reject execution and observation surfaces. | `src/harness/core/agent-pack.ts`, `src/agents/prompt-sections.ts`, harness adapters and package generation | Public registry/schema/artifact assertions show zero new orchestration runtime surfaces; generated package parity passes. |
| SC-001 | Use a structured behavior corpus with quantitative role and orchestration coverage. | `docs/agent/routing-cases.json`, `src/harness/core/agent-routing.test.ts` | Fixture counts and required scenario categories fail deterministically when coverage regresses. |
| SC-002 | Generate the same ordered policy for all three roots while preserving native-only execution authority. | `src/agents/prompt-sections.ts`, harness adapter tests | Cross-harness semantic equality plus absence of new tools, schemas, hooks, stores, or job-board assets. |
| SC-003 | Encode and test proportional Oracle gates. | `src/harness/core/sdd.ts`, `src/harness/core/sdd.test.ts`, `src/agents/prompt-rendering.test.ts` | Full route/risk truth table and optional-plan-review separation. |
| SC-004 | Validate real specialist selection and fan-out/fan-in in each harness. | Smoke-test prompts and reports outside product runtime | Outcome evidence only; actual native dispatch is observed, not inferred from IDs or prompt text. |
| SC-005 | Keep root guidance compact and non-duplicated. | `src/agents/prompt-sections.ts`, prompt-rendering tests | Character delta ≤ 2,500 per root and exactly one harness-neutral orchestration block. |

## Optional support artifacts

- `research.md`: Not needed; the two supplied reports, prior repository research, current primary-source harness evidence, and local CodeGraph exploration already resolved the design questions.
- `data-model.md`: Not needed; the feature adds immutable policy/decision types and test fixtures, not persisted domain state.
- `contracts/`: Not needed; the TypeScript agent-pack and SDD contracts are the owned interfaces and no external protocol is added.
- `quickstart.md`: Not needed; existing installation and smoke-test documentation will be updated in place.

## Risks and migrations

- **Prompt-only compliance risk**: deterministic tests can prove explicit policy and coverage, not that an LLM will always dispatch correctly. Mitigation: keep SC-004 as live outcome evidence with native lifecycle observations and no false guarantee.
- **Instruction bloat**: a complete roster and procedure can crowd the root prompt. Mitigation: derive one compact block from canonical data, reject duplicated harness-neutral prose, and enforce the 2,500-character delta budget.
- **Over-delegation**: a graph-oriented root could spawn agents for trivial work. Mitigation: retain the net-gain test, direct root-continuity case, duplicate-evidence filter, and bounded width.
- **Unsafe parallel writes**: superficially independent lanes may share state. Mitigation: exact output dependencies and one-writer ownership are evaluated before readiness; overlapping writers serialize or consolidate.
- **Review underreach**: relaxing Direct Oracle could hide meaningful regressions. Mitigation: enumerate material risk signals, keep verification mandatory, and test conservative escalation; Accelerated and Full remain Oracle-owned.
- **Constitution drift**: changing runtime policy without governance would leave contradictory instructions. Mitigation: a 6.0.0 MAJOR amendment and validator precede generated-package synchronization.
- **Generated package drift**: canonical and `plugin/` copies may diverge. Mitigation: use `pnpm run integration:sync` and existing parity tests, never manual duplicate edits.
- **Concurrent marketplace work**: unrelated publishing changes share the worktree. Mitigation: do not edit marketplace surfaces, preserve all existing changes, and review only this change's owned paths.
- **Rollback**: revert the canonical policy, verification decision, governance amendment, fixtures, and generated package delta as one change. There is no runtime state or migration to unwind.

## Constitution Check (post-design)

- **Adaptive-root orchestration**: JUSTIFIED EXCEPTION — The design confines the semantic change to proportional Direct verification and requires the 5.0.0 → 6.0.0 constitution amendment before implementation enables it; all other adaptive-root, depth, ownership, and user-route rules remain intact.
- **Explicit role boundaries**: PASS — The technical design preserves exactly seven roles, read-only and writer boundaries, root-owned artifacts, depth one, fresh judgment, and single-writer surfaces while improving selection salience.
- **Proportional Spec Kit-compatible SDD**: PASS — Direct loses only valueless unconditional Oracle ceremony; Accelerated/Full artifacts, optional plan review, mandatory final Oracle, convergence, and archive remain unchanged.
- **Truthful multi-harness contracts**: PASS — Shared policy is rendered once and adapters name only proven native primitives; unavailable concurrency degrades sequentially instead of invoking a thoth executor.
- **Independent provider ownership**: PASS — No design surface changes provider-owned memory, persistence, hooks, setup, receipts, or recovery.
- **Evidence-led completion**: JUSTIFIED EXCEPTION — The design keeps every route's verification mandatory and supplies deterministic risk-gate tests plus live outcome evidence, while the planned 6.0.0 amendment authorizes root-owned verification only for trivial deterministic Direct work.
