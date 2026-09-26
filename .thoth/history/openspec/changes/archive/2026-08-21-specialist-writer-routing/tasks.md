# Tasks: Predictable specialist-writer routing

## Authoring contract

Task identifiers are globally sequential. Every behavior slice starts with a
public-seam failing test, followed by the smallest implementation that makes that
slice pass. Each line names one literal repository-relative path and a concrete
verification outcome.

## MVP scope

US1 is the independently testable MVP: the canonical role and SDD contracts select
designer, quick, or deep for non-trivial implementation, preserve the Direct root
micro-action exception, and keep every final verification Oracle-owned. Completion
evidence is the focused agent-pack, SDD, protocol, and prompt-rendering suite.

## Dependencies

`T001 -> T002 -> T003 -> T004 -> T005 -> T006 -> T007 -> T008 -> T009 -> T010`;
US2 depends on US1's canonical routing seam; US3 depends on the canonical role
descriptions and harness renderers; US4 depends on all behavioral slices before
documentation, generation, simplification, and repository-wide verification.

## Story US1

- [x] T001 [US1] Add failing public role-routing cases for root Direct, designer, quick, deep, read-only non-use, escalation, one-writer ownership, and compact return expectations covering FR-001, FR-003, FR-007 and SC-002 in `src/harness/core/agent-routing.test.ts` | Verify: The focused test fails because canonical roles do not yet expose deterministic use, non-use, and escalation contracts.
- [x] T002 [US1] Extend the seven canonical role contracts and orchestration policy with routable use, non-use, escalation, mutation, verification, and artifact-backed writer rules covering FR-001, FR-003 and SC-002 in `src/harness/core/agent-pack.ts` | Verify: Agent routing and agent-pack tests pass with root limited to the Direct micro-action exception and all seven roles retaining their boundaries.
- [x] T003 [US1] Add failing SDD ownership cases for selected implementation writers, the Direct root exception, Accelerated and Full non-root defaults, and fresh Oracle verification covering FR-001, FR-002, FR-007, SC-001 and SC-002 in `src/harness/core/sdd.test.ts` | Verify: The focused test fails while implement remains fixed to orchestrator.
- [x] T004 [US1] Replace fixed implement ownership with an adaptive selected-writer contract and route-aware owner rendering while preserving phase eligibility and gate order covering FR-001, FR-002, SC-001 and SC-002 in `src/harness/core/sdd.ts` | Verify: SDD ownership tests pass and zero Accelerated or Full contracts name orchestrator as the normal implement owner.
- [x] T005 [US1] Add failing implement-protocol cases requiring exact writer choice, owned mutable surface, requirement anchors, escalation, and non-overlapping handoffs covering FR-002, FR-007 and SC-002 in `src/harness/core/sdd-protocol.test.ts` | Verify: The focused test fails because the protocol does not yet encode writer-selection evidence.
- [x] T006 [US1] Strengthen the implement dispatch protocol with designer, quick, and deep selection rules plus root task-state ownership covering FR-002 and SC-002 in `src/harness/core/sdd.ts` | Verify: SDD protocol tests pass and child writers remain unable to mutate OpenSpec task state.
- [x] T007 [US1] Add failing root-prompt assertions for adaptive Direct ownership, artifact-backed writer selection, the full role matrix, and no self-verification covering FR-001, FR-002, FR-003, FR-007, SC-001 and SC-002 in `src/agents/prompt-rendering.test.ts` | Verify: The focused test fails against the current implement-orchestrator route text and terse role directory.
- [x] T008 [US1] Render selected-writer route summaries and canonical role routing contracts in shared root and child prompts covering FR-001, FR-002, FR-003, SC-001 and SC-002 in `src/agents/prompt-sections.ts` | Verify: Prompt-rendering tests pass for Direct, Accelerated, Full, every specialist, and fresh Oracle verification.
- [x] T009 [US1] Update the installed-source implement phase guidance to require root-selected writer, exact ownership, bounded evidence, and escalation without changing root OpenSpec state ownership covering FR-002, FR-008 and SC-002 in `skills/thoth-sdd/references/phases/implement.md` | Verify: The phase contract names designer, quick, and deep selection criteria and preserves one writer per mutable surface.
- [x] T010 [US1] Align the thoth-sdd ownership summary with artifact-backed specialist writers and the Direct root exception covering FR-001, FR-008 and SC-001 in `skills/thoth-sdd/SKILL.md` | Verify: Skill guidance no longer leaves root and writers as undifferentiated implementation alternatives.

## Story US2

- [x] T011 [US2] Add failing Codex artifact cases for capability-sensitive agent_type selection, role-prefixed fallback, routable descriptions, and zero unconditional enforcement claims covering FR-003, FR-004, FR-007, SC-002 and SC-003 in `src/harness/adapters/codex.test.ts` | Verify: The focused test fails on the stale claim that Codex has no hard custom-role selector.
- [x] T012 [US2] Render shared dispatch descriptions and conditional explicit Codex role selection while retaining a bounded instruction-only fallback and fresh-context lifecycle covering FR-003, FR-004, SC-002 and SC-003 in `src/harness/adapters/codex.ts` | Verify: Codex adapter tests pass for both selector-present and selector-absent guidance without claiming universal structural support.
- [x] T013 [US2] Add capability-diagnostic assertions that distinguish static package guarantees from runtime-exposed named-role selectors covering FR-004, FR-007 and SC-003 in `src/harness/adapters/codex-surfaces.test.ts` | Verify: Capability tests reject both unconditional support and the claim that stronger runtime selection can never exist.
- [x] T014 [US2] Clarify Codex named-role capability and fallback diagnostics without upgrading instruction-only package enforcement covering FR-004 and SC-003 in `src/harness/adapters/codex-surfaces.ts` | Verify: Capability diagnostics pass and remain truthful for static packages and stronger active hosts.
- [x] T015 [US2] Add failing Claude package cases for namespaced explicit selection and shared use, non-use, escalation, mutation, and verification descriptions covering FR-003, FR-004, FR-007 and SC-002 in `src/harness/adapters/claude-code.test.ts` | Verify: The focused test fails while Claude frontmatter uses responsibility-only descriptions.
- [x] T016 [US2] Render canonical routable descriptions and keep namespaced Agent subagent_type invocation as the Claude native selector covering FR-003, FR-004 and SC-002 in `src/harness/adapters/claude-code.ts` | Verify: Claude package tests pass for all six namespaced specialists and their permission boundaries.
- [x] T017 [US2] Add failing OpenCode cases proving native named selection receives the same canonical routing descriptions and writer boundaries covering FR-003, FR-004, FR-007 and SC-002 in `src/agents/index.test.ts` | Verify: The focused test fails where OpenCode-local descriptions drift from the canonical role contract.
- [x] T018 [US2] Derive OpenCode specialist descriptions and routing behavior from the canonical role contract without changing native permission presets covering FR-003, FR-004 and SC-002 in `src/agents/index.ts` | Verify: OpenCode agent tests pass with native named roles, leaf writers, and unchanged read-only enforcement.

## Story US3

- [x] T019 [US3] Change the canonical default assertions to low effort for explorer and quick, medium for designer and deep, high for librarian and Oracle, and xhigh for root covering FR-005, FR-007 and SC-004 in `src/config/constants.test.ts` | Verify: The focused test fails against the current quick, librarian, and Oracle xhigh defaults.
- [x] T020 [US3] Apply the proportional built-in OpenAI specialist effort defaults while preserving model identities and root xhigh covering FR-005 and SC-004 in `src/config/constants.ts` | Verify: Constants and effective-agent configuration tests pass with the exact six-role effort matrix.
- [x] T021 [US3] Add failing Claude frontmatter cases for all six canonical efforts and configured variant precedence covering FR-005, FR-007 and SC-004 in `src/harness/adapters/claude-code.test.ts` | Verify: The focused test fails because generated Claude specialists omit effort frontmatter.
- [x] T022 [US3] Add Claude effort resolution from valid role variant overrides or canonical proportional defaults and pass it to every generated subagent covering FR-005 and SC-004 in `src/harness/adapters/claude-code.ts` | Verify: Claude adapter and subagent-writer tests pass with six effort fields and override precedence.
- [x] T023 [US3] Update effective OpenCode role expectations for the proportional preset without weakening model, steps, or permissions coverage covering FR-005, FR-007 and SC-004 in `src/agents/index.test.ts` | Verify: OpenCode effective-agent tests pass with exact default effort variants for all seven roles.
- [x] T024 [US3] Update Codex installation expectations for proportional TOML efforts and custom-model no-invented-effort behavior covering FR-005, FR-007 and SC-004 in `src/cli/codex-install.test.ts` | Verify: Codex install tests pass with low quick, high librarian and Oracle, and unchanged explicit override semantics.

## Story US4

- [x] T025 [US4] Add failing semantic-occurrence and prompt-size baseline assertions for child delegation, blocking questions, memory ownership, role identity, and return rules covering FR-006, FR-007, SC-005 and SC-006 in `src/agents/prompt-rendering.test.ts` | Verify: The focused test fails on duplicated child and adapter rule families or unchanged pre-audit prompt estimates.
- [x] T026 [US4] Consolidate shared child delegation, question, memory, role, and response rules into one canonical prompt composition covering FR-006, SC-005 and SC-006 in `src/agents/prompt-sections.ts` | Verify: Shared prompt tests pass with one occurrence per semantic rule family and a lower specialist prompt estimate.
- [x] T027 [US4] Remove repeated Codex role and provider-memory boilerplate while retaining only native sandbox, selector, invocation, and capability deltas covering FR-006, SC-003 and SC-005 in `src/harness/adapters/codex.ts` | Verify: Codex generated TOMLs preserve every boundary and are smaller than their recorded pre-change estimates.
- [x] T028 [US4] Remove repeated Claude role and provider-memory boilerplate while retaining only frontmatter permissions, namespace, selector, and effort deltas covering FR-006, SC-004 and SC-005 in `src/harness/adapters/claude-code.ts` | Verify: Claude generated agents preserve every boundary and prompt semantic-occurrence tests pass.
- [x] T029 [US4] Add realistic routing-regression cases for narrow Direct, UI, multi-file correctness, external research, verification, and unfamiliar fallback tasks covering FR-007, FR-008, SC-002 and SC-005 in `docs/agent/routing-cases.json` | Verify: Routing-case tests pass with each task loading only the necessary agent and SDD guidance.
- [x] T030 [US4] Update routed delegation guidance with the canonical writer matrix, root exception, selector truthfulness, and one-writer handoff rules covering FR-001, FR-002, FR-003, FR-004 and FR-008 in `docs/agent/agents-and-delegation.md` | Verify: Maintainer guidance has one canonical matrix and links to the SDD and harness overlays instead of duplicating them.
- [x] T031 [US4] Update the SDD pipeline owner table and route diagrams to show selected specialist implementation and fresh Oracle verification covering FR-001, FR-002, FR-008 and SC-001 in `docs/sdd-pipeline.md` | Verify: Documentation contains zero artifact-backed implement-orchestrator defaults and preserves the Direct root exception.
- [x] T032 [US4] Update provider configuration guidance with the proportional six-role effort matrix and override limitations covering FR-005, FR-008 and SC-004 in `docs/provider-configurations.md` | Verify: Provider documentation matches exported defaults and distinguishes model price assumptions from measured total task cost.
- [x] T033 [US4] Update Codex customization guidance for conditional agent_type selection, fallback semantics, proportional effort, and reinstall requirements covering FR-004, FR-005, FR-008, SC-003 and SC-004 in `docs/codex-model-customization.md` | Verify: Codex documentation matches generated root guidance and never claims universal hard selection.
- [x] T034 Apply the installed simplify skill to the completed source changes without altering behavior covering FR-006 and SC-006 in `src` | Verify: Focused routing, SDD, prompt, adapter, configuration, and installation tests remain green after simplification.
- [x] T035 Regenerate the shared plugin bundle from canonical sources and inspect the diff for duplicate or stale agent and skill instructions covering FR-008, SC-001, SC-003, SC-004 and SC-005 in `plugin` | Verify: Generated orchestrator, six agents, skills, manifests, and snapshots match canonical source with no unrelated output.
- [x] T036 Run progressive instruction validation and record before/after always-loaded plus specialist prompt estimates covering FR-006, FR-008 and SC-005 in `docs/agent/index.md` | Verify: Context routing validation reports zero errors and warnings, always-loaded context does not increase, and every specialist prompt estimate is below baseline.

Outcome SC-007 remains a consumer telemetry target after release and does not create
an artificial implementation task in this repository.

## Parallel execution

- None: canonical role contracts feed SDD ownership, prompts, every harness adapter,
  model expectations, generated plugin output, and routed documentation; one
  sequential deep writer avoids prompt drift, conflicting snapshots, and mixed
  routing semantics. Read-only Oracle verification remains independently delegated.

## Final verification

- [x] T037 Run the focused agent-pack, SDD, protocol, prompt, adapter, configuration, installation, documentation, generation, and context-router suites covering FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008, SC-001, SC-002, SC-003, SC-004 and SC-005 in `package.json` | Verify: Every focused suite exits zero and demonstrates the six confirmed public seams without external network access.
- [x] T038 Run check:ci, typecheck, build, and the full test suite in pre-merge order covering FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008 and SC-006 in `package.json` | Verify: All four repository commands exit zero and the final diff contains no unrelated, generated-stale, or secret changes.
- [x] T039 Hand the unchanged candidate to a fresh Oracle and persist its independent FR-001–FR-008 and SC-001–SC-006 verdict covering all buildable requirements in `openspec/changes/specialist-writer-routing/verify-report.md` | Verify: Verify-report records Oracle PASS or actionable FAIL, while SC-007 remains explicit post-release outcome evidence.

## Convergence round 1

Oracle verification returned `FAIL`. V-001 is `partial`, V-002 is `missing`,
V-003 is `contradicts`, and SC-007 remains an `unrequested` post-release outcome
risk with no repository remediation task.

- [x] T040 [CONV1] [V-001] Add the missing seven-row routing matrix for UI→designer, narrow-known→quick, coupled/high-risk→deep, Full discovery→explorer, external evidence→librarian, Direct micro-action→orchestrator, and final verify→fresh Oracle, asserting exact owners and forbidden alternatives through the shared contract plus rendered OpenCode, Codex, and Claude surfaces covering FR-007 and SC-002 in `src/harness/core/agent-routing.test.ts` | Verify: The focused regression contains seven explicit rows, exercises all four routing surfaces, rejects every forbidden owner, and exits zero.
- [x] T041 [CONV1] [V-002] Add an explicit realistic narrow-known task whose deterministic owner is quick and whose forbidden alternatives include root, designer, and deep covering FR-007 and SC-002 in `docs/agent/routing-cases.json` | Verify: Routed-document and cross-harness regression tests consume the quick case and exit zero.
- [x] T042 [CONV1] [V-003] Narrow broad root direct-work wording to the isolated low-risk Direct micro-action exception, first capturing a failing focused prompt assertion, covering FR-001 and SC-001 in `src/agents/prompt-sections.ts` | Verify: Prompt-rendering tests reject broad artifact-backed root ownership, preserve bounded Direct micro-actions, and pass after the wording change.
- [x] T043 [CONV1] Hand the corrected unchanged candidate to a new fresh Oracle and persist its independent verdict over V-001–V-003, FR-001–FR-008, and SC-001–SC-007 in `openspec/changes/specialist-writer-routing/verify-report.md` | Verify: The replacement verification report records PASS or a new actionable FAIL without reusing the first Oracle.
