# Tasks: Pin OpenCode Plugin and Unify Harness Updates

## Authoring contract

Task identifiers are globally sequential. Every implementation task follows a failing focused test, and root may mark a task complete only after its stated verification evidence exists.

## MVP scope

US1 is the MVP: an OpenCode install performed by a known thoth-agents release writes exactly that release into the plugin entry, safely replaces prior managed forms, and fails without mutation when package identity cannot be proven.

## Dependencies

T001 -> T003; T002 -> T004; T003 and T004 -> T005 -> T006; T007 -> T008 -> T009 -> T010 -> T011 -> T012; T013 -> T016; T014 -> T017; T015 -> T018; T010 and T016 through T018 -> T019 through T024 -> T025 through T030; T031 -> T032 through T035 -> T036; T037 and T038 -> T039 and T040; T039 and T040 -> T041 through T044; all implementation tasks -> T045 -> T046 -> T047 -> T048.

## Story US1 - Install the exact OpenCode plugin release

- [x] T001 [US1] Add failing source-layout, published-layout, stable, prerelease, and invalid package identity tests for FR-002/SC-002 in `src/cli/package-version.test.ts` | Verify: focused test fails because no authoritative executing-package resolver exists.
- [x] T002 [US1] Add failing exact-pin, managed-entry replacement, unrelated-plugin preservation, and no-latest tests for FR-001/SC-001 in `src/cli/config-io.test.ts` | Verify: focused test fails against the current hard-coded latest entry.
- [x] T003 [US1] Implement the typed fail-closed executing package identity resolver for FR-002/SC-002 in `src/cli/package-version.ts` | Verify: all package identity fixtures pass and invalid metadata returns no usable version.
- [x] T004 [US1] Require an explicit resolved plugin version and write one exact managed entry for FR-001/FR-002/SC-001 in `src/cli/config-io.ts` | Verify: config tests pass with stable and prerelease pins, preserved unrelated entries, and zero latest fallbacks.
- [x] T005 [US1] Add failing explicit OpenCode installer preflight and exact-version propagation tests for FR-001/FR-002/SC-001/SC-002 in `src/cli/install.test.ts` | Verify: installer test fails before implementation and observes no config mutation for unresolved identity.
- [x] T006 [US1] Preflight package identity before OpenCode installation and pass the approved version through config writes for FR-001/FR-002/SC-001/SC-002 in `src/cli/install.ts` | Verify: explicit install pins the executing release and rejects unresolved package identity before any managed write.

## Story US3 - Track the authoritative CLI-managed version

- [x] T007 [US3] Add failing schema, independent-harness, atomic-write, malformed-backup, and no-advance transition tests for FR-006/FR-007/SC-006/SC-007 in `src/cli/install-ledger.test.ts` | Verify: focused test fails because no CLI-managed installation ledger exists.
- [x] T008 [US3] Implement schema-v1 global ledger reads, atomic per-harness commits, and invalid-state repair for FR-006/FR-007/SC-006/SC-007 in `src/cli/install-ledger.ts` | Verify: 3 harness records remain independent and every preview or failed transition preserves the prior authoritative record.
- [x] T009 [US3] Add failing provider-complete and ledger-last finalization tests for FR-004/FR-006/SC-004/SC-006 in `src/cli/install-completion.test.ts` | Verify: focused test fails and demonstrates that provider or ledger failure must prevent a complete result.
- [x] T010 [US3] Implement shared provider validation and ledger-last install finalization for FR-004/FR-005/FR-006/SC-004/SC-005/SC-006 in `src/cli/install-completion.ts` | Verify: complete provider evidence records one harness only, while dry-run and every non-complete outcome write zero ledger changes.
- [x] T011 [US3] Extend explicit harness install tests with successful records and all no-advance failure paths for FR-006/FR-007/SC-006/SC-007 in `src/cli/install.test.ts` | Verify: tests fail until every harness uses shared finalization and records only after complete setup.
- [x] T012 [US3] Route all explicit harness installs through shared finalization and surface ledger failures truthfully for FR-004/FR-006/FR-007/SC-004/SC-006 in `src/cli/install.ts` | Verify: OpenCode, Codex, and Claude explicit installs record their executing version only after provider-complete success.
- [x] T013 [US3] Add failing OpenCode status cases for matching, mismatched, missing, malformed, and marketplace-independent ledger state for FR-007/SC-007 in `src/cli/operations/opencode.test.ts` | Verify: status test fails because recorded and executing CLI versions are not exposed.
- [x] T014 [US3] Add failing Codex status cases proving native marketplace state cannot advance the ledger for FR-007/SC-007 in `src/cli/operations/codex.test.ts` | Verify: status test fails because no independent CLI-managed version target exists.
- [x] T015 [US3] Add failing Claude status cases proving native marketplace state cannot advance the ledger for FR-007/SC-007 in `src/cli/operations/claude-code.test.ts` | Verify: status test fails because no independent CLI-managed version target exists.
- [x] T016 [US3] Add the authoritative CLI-version target and mismatch classification to OpenCode status for FR-007/SC-007 in `src/cli/operations/opencode.ts` | Verify: status reports recorded and executing versions without inferring either from package cache.
- [x] T017 [US3] Add the authoritative CLI-version target while preserving Codex native manager ownership for FR-007/SC-007 in `src/cli/operations/codex.ts` | Verify: simulated marketplace changes leave the recorded CLI-managed version unchanged.
- [x] T018 [US3] Add the authoritative CLI-version target while preserving Claude native manager ownership for FR-007/SC-007 in `src/cli/operations/claude-code.ts` | Verify: simulated marketplace changes leave the recorded CLI-managed version unchanged.

## Story US2 - Refresh complete harness installations from Update

- [x] T019 [US2] Add failing OpenCode install/update parity, full-preview, provider, ledger, and failure-order tests for FR-003/FR-004/FR-005/SC-003/SC-004/SC-005 in `src/cli/operations/opencode.test.ts` | Verify: tests expose the current plugin-entry-only Update behavior.
- [x] T020 [US2] Add failing Codex native-plugin-first, global-pack, skill, provider, ledger, and dry-run parity tests for FR-003/FR-004/FR-005/SC-003/SC-004/SC-005 in `src/cli/operations/codex.test.ts` | Verify: tests expose missing native plugin and provider steps in Update.
- [x] T021 [US2] Add failing Claude native-refresh, skill, provider, ledger, and dry-run parity tests for FR-003/FR-004/FR-005/SC-003/SC-004/SC-005 in `src/cli/operations/claude-code.test.ts` | Verify: tests expose missing provider finalization in Update.
- [x] T022 [US2] Add failing public update preview/apply and nonzero failure propagation tests for FR-003/FR-005/SC-003/SC-005 in `src/cli/commands.test.ts` | Verify: failed operation apply currently returns a successful command code.
- [x] T023 [US2] Add failing interactive operation dispatch tests for complete selected-harness Update parity for FR-003/FR-004/SC-003/SC-004 in `src/cli/tui/operations.test.ts` | Verify: TUI operation tests expose incomplete harness update plans or applies.
- [x] T024 [US2] Add failing confirmation and truthful result-copy tests for complete Update behavior for FR-003/FR-005/SC-003/SC-005 in `src/cli/tui/App.test.tsx` | Verify: UI test fails until Update is represented as a complete CLI refresh.
- [x] T025 [US2] Make OpenCode operation install/update use the approved exact version and complete config, owned-skill, external-skill, provider, and ledger sequence for FR-001/FR-003/FR-004/FR-005/SC-001/SC-003/SC-004/SC-005 in `src/cli/operations/opencode.ts` | Verify: OpenCode Update and Install share all required effects and preview remains non-mutating.
- [x] T026 [US2] Add native plugin-manager setup before Codex managed surfaces and shared provider/ledger finalization for FR-003/FR-004/FR-005/SC-003/SC-004/SC-005 in `src/cli/operations/codex.ts` | Verify: Codex Update follows native plugin, agent pack, external skills, provider, then ledger order and fails closed at each boundary.
- [x] T027 [US2] Add shared provider/ledger finalization after Claude native refresh and external skills for FR-003/FR-004/FR-005/SC-003/SC-004/SC-005 in `src/cli/operations/claude-code.ts` | Verify: Claude Update is explicit-install equivalent while native marketplace ownership remains intact.
- [x] T028 [US2] Return nonzero for failed update apply while preserving preview-by-default behavior for FR-003/FR-005/SC-003/SC-005 in `src/cli/commands.ts` | Verify: command tests pass for successful preview/apply and failing applied updates.
- [x] T029 [US2] Keep interactive install/update dispatch on the same complete operation services for FR-003/FR-004/SC-003/SC-004 in `src/cli/tui/operations.ts` | Verify: all 3 selected harnesses use the same complete plans and apply boundaries as public operation commands.
- [x] T030 [US2] Present complete update intent, confirmation, and failure results without claiming marketplace ownership for FR-003/FR-005/SC-003/SC-005 in `src/cli/tui/App.tsx` | Verify: TUI tests show complete-refresh copy and preserve confirmation before mutation.

## Story US4 - Keep release changes operator-controlled

- [x] T031 [US4] Add failing newer-release notification tests with write, cache, and package-manager mutation spies for FR-008/SC-008 in `src/hooks/auto-update-checker/index.test.ts` | Verify: test exposes current automatic config rewrite and install behavior.
- [x] T032 [US4] Convert the runtime update flow to actionable notification-only behavior for FR-008/SC-008 in `src/hooks/auto-update-checker/index.ts` | Verify: newer releases produce CLI guidance with zero config, cache, or install mutations.
- [x] T033 [US4] Remove the obsolete pinned-version mutation helper and retain only read/comparison behavior for FR-008/SC-008 in `src/hooks/auto-update-checker/checker.ts` | Verify: checker tests pass without any exported config-write operation.
- [x] T034 [US4] Remove obsolete package-cache invalidation implementation for FR-008/SC-008 in `src/hooks/auto-update-checker/cache.ts` | Verify: no production import or test expects runtime cache deletion.
- [x] T035 [US4] Remove obsolete cache invalidation regression coverage for FR-008/SC-008 in `src/hooks/auto-update-checker/cache.test.ts` | Verify: focused hook suite covers notification-only behavior with no dead mutation tests.
- [x] T036 [US4] Register the simplified notification-only hook without an auto-install option or shell dependency for FR-008/SC-008 in `src/index.ts` | Verify: runtime composition tests pass and expose no automatic installer path.
- [x] T037 [US4] Add failing help, status, exact-pin, ledger, native-marketplace, and explicit-update copy assertions for FR-009/SC-009 in `src/cli/commands.test.ts` | Verify: assertions fail against current latest-entry and narrow-update wording.
- [x] T038 [US4] Add failing interactive exact-version, official-ledger, and complete-update copy assertions for FR-009/SC-009 in `src/cli/tui/App.test.tsx` | Verify: assertions fail until the TUI describes the official CLI update contract.
- [x] T039 [US4] Align CLI help and formatted status/plan output with exact pins and official CLI-managed versions for FR-007/FR-009/SC-007/SC-009 in `src/cli/commands.ts` | Verify: help/status tests distinguish intentional latest CLI invocation from exact plugin entries.
- [x] T040 [US4] Align interactive status and action copy with complete CLI refresh and native marketplace independence for FR-007/FR-009/SC-007/SC-009 in `src/cli/tui/App.tsx` | Verify: TUI tests show recorded and executing versions and make no native ownership claim.
- [x] T041 [US4] Document exact OpenCode pins, complete per-harness updates, and the last successful CLI-managed version for FR-009/SC-009 in `README.md` | Verify: public overview names the CLI as the official supplemental-surface update path while retaining intentional latest invocation examples.
- [x] T042 [US4] Document the ledger location, first-run migration, failure semantics, and Codex/Claude marketplace independence for FR-006/FR-007/FR-009/SC-006/SC-007/SC-009 in `docs/installation.md` | Verify: installation guide explains all 3 harness records and never equates marketplace version with complete CLI setup.
- [x] T043 [US4] Update concise operator commands and update guidance for FR-009/SC-009 in `docs/quick-reference.md` | Verify: quick reference directs operators to rerun the latest CLI installer or apply complete Update.
- [x] T044 [US4] Update durable routed CLI invariants for exact pinning, the official ledger, and complete updates for FR-006/FR-007/FR-009/SC-006/SC-007/SC-009 in `docs/agent/cli-installation.md` | Verify: routed context matches implementation and preserves native manager/provider ownership boundaries.

## Parallel execution

- None: package identity, ledger finalization, per-harness operations, TUI dispatch, runtime notification, and documentation all consume sequentially refined shared contracts; one implementation writer avoids overlapping changes and parity drift.

## Final verification

- [x] T045 Run all focused package-version, ledger, config, install, harness-operation, command, TUI, and runtime-hook tests covering FR-001 through FR-009 and SC-001 through SC-009 from `package.json` | Verify: every focused Vitest file passes with no skipped required scenario.
- [x] T046 Apply the mandatory behavior-preserving simplification pass to the completed installation orchestration centered on `src/cli/install-completion.ts` | Verify: duplication and dead mutation code are removed without changing any passing behavior test.
- [x] T047 Run formatting, type, build, integration, and full-suite validation for FR-001 through FR-009 and SC-001 through SC-009 from `package.json` | Verify: check:ci, typecheck, build, integration verification, and the complete Vitest suite all pass.
- [x] T048 Review final scope, generated output, secrets, and unrelated changes against the canonical plan in `openspec/changes/pin-opencode-plugin-and-unify-updates/plan.md` | Verify: diff contains only planned source, test, documentation, and governed artifact changes with all residual risks declared for Oracle.
