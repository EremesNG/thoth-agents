# Tasks: Route-independent implementation ownership

## Authoring contract

Task identifiers are globally sequential. Every behavioral slice begins with a
failing public-seam test and then applies the smallest implementation that makes
the slice pass. Every task names one literal repository-relative ownership path
and a concrete observable result.

## MVP scope

US1 is the independently testable MVP: all three SDD routes expose the same
adaptive implementation owner set, and both root and specialists remain eligible
from task-shape/net-gain evidence rather than route. Completion evidence is the
focused agent-pack, SDD, protocol, and prompt-rendering suite.

## Dependencies

`T001 -> T002 -> T003 -> T004 -> T005 -> T006 -> T007`; the route/owner matrix
depends on those canonical seams, harness checks depend on shared rendering,
and skills/docs/generation follow all behavioral slices.

## Story US1

- [x] T001 [US1] Add failing canonical ownership-policy cases for eligible root and specialist owners in every route, delegation-benefit factors, root-continuity factors, explicit user direction, insufficient route/price signals, one-writer ownership, and FR-001/FR-004/FR-007 plus SC-002/SC-004 coverage in `src/harness/core/agent-pack.test.ts` | Verify: The focused test fails because the current policy restricts root to one Direct micro-action and normally forces artifact-backed specialists.
- [x] T002 [US1] Replace route-coupled root and orchestration rules with a structured route-independent implementation ownership policy covering FR-001, FR-002, FR-004, FR-007 and SC-002/SC-004 in `src/harness/core/agent-pack.ts` | Verify: Agent-pack tests pass with root, designer, quick, and deep eligible in every route and route/model price rejected as sufficient owner signals.
- [x] T003 [US1] Add failing implementation-owner cases proving Direct, Accelerated, and Full return one adaptive owner contract with no selected-writer branch covering FR-003 and SC-001 in `src/harness/core/sdd.test.ts` | Verify: The focused test fails against the current Direct-versus-artifact-backed branch.
- [x] T004 [US1] Add failing protocol cases for route-independent owner rationale, root-owned and delegated execution, artifact-backed task state, no-artifact work, and fresh Oracle verification covering FR-001/FR-003/FR-007 and SC-001/SC-004 in `src/harness/core/sdd-protocol.test.ts` | Verify: The focused test fails while protocol inputs require a selected specialist for artifact-backed routes and limit Direct root work.
- [x] T005 [US1] Collapse implementation ownership to one adaptive phase contract and encode task-shape/net-gain owner evidence without changing route gates or eligible roles covering FR-001/FR-003/FR-007 and SC-001/SC-004 in `src/harness/core/sdd.ts` | Verify: SDD and protocol tests pass for root or specialist ownership in every route, unchanged gate order, one writer, and fresh Oracle.

## Story US2

- [x] T006 [US2] Add failing shared-root prompt cases requiring route/owner orthogonality, both delegation and root-continuity factors, explicit user direction, deterministic post-decision specialist selection, and stale-phrase rejection covering FR-001/FR-004/FR-006/FR-007 and SC-002/SC-004 in `src/agents/prompt-rendering.test.ts` | Verify: The focused test fails on Direct-only root and artifact-backed selected-writer prose.
- [x] T007 [US2] Render one compact route-independent implementation decision from the canonical ownership policy across all root dialects covering FR-001/FR-003/FR-004/FR-006/FR-007 and SC-001/SC-002/SC-004 in `src/agents/prompt-sections.ts` | Verify: Shared prompt tests pass with identical owner semantics for Direct, Accelerated, and Full and no duplicated decision rules.

## Story US3

- [x] T008 [US3] Add failing table-driven route/owner orthogonality cases for Direct designer/deep, Accelerated root, Full root, route-neutral quick, explorer, librarian, and fresh Oracle through shared and generated harness surfaces covering FR-002/FR-005/FR-007 and SC-003 in `src/harness/core/agent-routing.test.ts` | Verify: The matrix fails because current fixtures and phase-owner expectations encode Direct root and artifact-backed specialists.
- [x] T009 [US3] Replace route-coupled realistic examples with explicit task-shape/net-gain fixtures consumed by the ownership matrix covering FR-005/FR-006 and SC-003/SC-005 in `docs/agent/routing-cases.json` | Verify: Routing fixtures include justified Direct specialist and Accelerated/Full root cases, reject route-only rationales, and the matrix passes.
- [x] T010 [US3] Add Codex rendered-root assertions for route-independent ownership while retaining conditional agent_type selection and instruction-only fallback covering FR-004/FR-005/FR-006 and SC-002/SC-003 in `src/harness/adapters/codex.test.ts` | Verify: Codex tests pass with task-shaped ownership under every route and unchanged capability truthfulness.
- [x] T011 [US3] Add Claude rendered-root assertions for route-independent ownership while retaining namespaced role selection, permissions, and effort frontmatter covering FR-004/FR-005/FR-006 and SC-002/SC-003 in `src/harness/adapters/claude-code.test.ts` | Verify: Claude tests pass with task-shaped ownership under every route and unchanged native deltas.
- [x] T012 [US3] Add OpenCode effective-root assertions for route-independent ownership while preserving named roles, models, efforts, and permissions covering FR-004/FR-005/FR-006 and SC-002/SC-003 in `src/agents/index.test.ts` | Verify: OpenCode tests pass with the same ownership policy and unchanged specialist registrations.

## Story US4

- [x] T013 [US4] Replace Direct-only root and mandatory Accelerated/Full writer ownership with the route-independent net-gain contract covering FR-001/FR-002/FR-003/FR-006/FR-007 and SC-002/SC-005 in `skills/thoth-sdd/SKILL.md` | Verify: The canonical skill states that routes govern artifacts/gates and that root or a specialist may implement in every route.
- [x] T014 [US4] Update implement-phase guidance for root-owned or delegated execution, owner rationale, conditional dispatch, artifact-backed task state, and no-artifact work covering FR-001/FR-002/FR-003/FR-006/FR-007 and SC-002/SC-005 in `skills/thoth-sdd/references/phases/implement.md` | Verify: The phase contract contains no mandatory specialist-by-route rule and preserves one writer, TDD, bounded evidence, and escalation.
- [x] T015 [US4] Replace the Direct exception and artifact-backed always-delegate invariant with one route-independent decision matrix and official task-shape tradeoffs covering FR-001/FR-002/FR-004/FR-006/FR-007 and SC-002/SC-004/SC-005 in `docs/agent/agents-and-delegation.md` | Verify: Maintainer guidance distinguishes SDD governance from owner choice and documents both main-context and subagent cases.
- [x] T016 [US4] Update the pipeline ownership table and route prose so implement is adaptive in Direct, Accelerated, and Full while route artifacts and Oracle verification remain unchanged covering FR-001/FR-003/FR-006/FR-007 and SC-001/SC-002/SC-005 in `docs/sdd-pipeline.md` | Verify: Pipeline docs contain zero route-coupled implementation-owner defaults and preserve all existing phase gates.
- [x] T017 [US4] Replace unconditional visual/UX delegation with conditional post-net-gain designer selection and include the active instruction in stale-policy checks covering FR-002/FR-006/FR-007 and SC-002/SC-005 in `AGENTS.md` | Verify: Repository instructions permit root-owned UI/UX work when delegation has no demonstrated net gain and still require `designer` when the root chooses to delegate that surface.
- [x] T018 Apply the installed simplify skill to the completed source changes without altering ownership behavior covering FR-004/FR-007 and SC-004 in `src` | Verify: Focused agent-pack, SDD, protocol, prompt, routing, and adapter tests remain green after simplification.
- [x] T019 Regenerate the shared plugin from canonical sources and inspect every generated root and thoth-sdd asset for stale route-coupled ownership covering FR-006/FR-007 and SC-002/SC-005 in `plugin` | Verify: Integration parity passes and generated OpenCode/Codex/Claude assets match canonical source with no unrelated output.
- [x] T020 Run progressive instruction validation and record before/after always-loaded plus routed prompt estimates covering FR-004/FR-006 and SC-005 in `docs/agent/index.md` | Verify: Validator reports zero errors/warnings and always-loaded context does not exceed 8,465 characters or approximately 2,117 estimated tokens.

Outcome SC-007 remains a consumer-observation target after release and does not
create an artificial repository implementation task.

## Parallel execution

- None: canonical ownership policy feeds SDD contracts, shared prompts, every
  harness rendering, skills, routed fixtures, documentation, and generated
  output in one compatibility-coupled chain. Root retains the already-loaded
  planning context as the single implementation writer; parallel writers would
  duplicate discovery and contend over the same semantic surface.

## Final verification

- [x] T021 Run the focused agent-pack, SDD, protocol, prompt, route/owner matrix, adapter, skill, documentation, generation, active-instruction, and context-router suites covering FR-001–FR-007 and SC-001–SC-005 in `package.json` | Verify: Every focused suite exits zero and demonstrates route-independent ownership without network access, including active repository instruction stale-policy rejection.
- [x] T022 Run check:ci, typecheck, build, and the full test suite in pre-merge order covering FR-001–FR-007 and SC-006 in `package.json` | Verify: All four commands exit zero and the final diff contains no unrelated, generated-stale, or secret-bearing changes.
- [x] T023 Hand the unchanged candidate to a fresh Oracle and persist its independent FR-001–FR-007 and SC-001–SC-007 verdict covering every buildable requirement in `openspec/changes/route-independent-implementation-ownership/verify-report.md` | Verify: Verify-report records Oracle PASS or actionable FAIL, with SC-007 represented by observed evidence or an explicit residual risk.
