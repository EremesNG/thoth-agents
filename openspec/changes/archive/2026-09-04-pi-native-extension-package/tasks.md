# Tasks: Native Pi Extension Package

## Authoring contract

Implementation owner: one fresh `deep` specialist. Rationale: native package
manifest, runtime hooks, generated assets, package-manager provenance,
migration, status, and CLI/TUI flows share contracts and failure state; one
correctness-focused writer avoids competing ownership. Mutable surface: the
tasks below excluding root-owned OpenSpec artifacts. Requirements: FR-001
through FR-012 and buildable SC-001 through SC-006. Checks: focused tests first,
then the repository pre-merge sequence, packed verification, real Pi smoke, and
fresh read-only Oracle verification. Root retains task/gate state and synthesis.

## MVP scope

US1 is the MVP: the packed npm artifact declares and loads a native Pi extension,
and applied installation proves the exact first-party package is the first
post-preflight mutation before any external dependency.

## Dependencies

T001 -> T002 -> T003 -> T004 -> T005 -> T006 -> T007 -> T008 -> T009 -> T010 -> T011 -> T012 -> T013 -> T014 -> T015 -> T016 -> T017 -> T018; T018 -> T019 -> T020 -> T021 -> T022 -> T023 -> T024 -> T025 -> T026; T026 -> T027 -> T028 -> T029 -> T030 -> T031 -> T032 -> T033 -> T034 -> T035 -> T036; T036 -> T037 -> T038 -> T039 -> T040 -> T041 -> T042 -> T043 -> T044 -> T045 -> T046; T046 -> T047 -> T048 -> T049 -> T050 -> T051 -> T052.

## Story US1 - Install thoth-agents as the first native Pi package

- [x] T001 [US1] Add failing build-entry, packed-manifest, and inventory tests for FR-001, FR-003, FR-012 and SC-001 in `src/plugin-node-runtime.test.ts` | Verify: tests require exactly one Pi source ESM build entry, one native extension, one owned-skill root, six packaged specialist assets, and no external implementation trees
- [x] T002 [US1] Declare the Pi package manifest, published Pi assets, and required type dependencies for FR-001, FR-003, FR-012 and SC-001 in `package.json` | Verify: T001 package assertions pass and metadata pins the supported native resource shape without a second package name
- [x] T003 [US1] Add exactly one Pi ESM build entry for FR-001, FR-012 and SC-001 in `tsup.config.ts` | Verify: T001 build assertions pass, the existing three entries remain unchanged, and the build emits dist/pi.js
- [x] T004 [US1] Add failing native extension registration and root-hook tests for FR-001, FR-002, FR-006, FR-011 and SC-003 in `src/pi.test.ts` | Verify: a fake Pi API observes one hook-ready root injection, bounded degradation, and no import-time filesystem or process mutation
- [x] T005 [US1] Implement the native Pi extension entrypoint for FR-001, FR-002, FR-006, FR-011, FR-012 and SC-001/SC-003 in `src/pi.ts` | Verify: T004 passes and an unrelated-directory import loads the compiled entrypoint without network access
- [x] T006 [US1] Add failing adapter/writer tests for hook-native root output and six package-owned specialists covering FR-001, FR-002, FR-011 and SC-003 in `src/harness/adapters/pi.test.ts` | Verify: tests reject a persistent Pi root artifact, duplicate orchestrator child, missing ownership, or unstable rendering
- [x] T007 [US1] Refactor Pi root and specialist rendering behind the native package contract for FR-001, FR-002, FR-011 and SC-003 in `src/harness/adapters/pi.ts` | Verify: T006 and the existing writer/prompt suites pass with exactly six specialist artifacts
- [x] T008 [US1] Add failing deterministic Pi asset-generation and provenance tests for FR-001, FR-002, FR-012 and SC-001 in `src/harness/generate-integration-packages.test.ts` | Verify: generation expects six Pi Markdown assets and one stable first-party provenance manifest without altering Codex or Claude output
- [x] T009 [US1] Generate the native Pi asset package from canonical adapter output for FR-001, FR-002, FR-012 and SC-001 in `src/harness/generate-integration-packages.ts` | Verify: T008 passes and repeat generation is byte-identical
- [x] T010 [US1] Materialize the generated Pi asset provenance and specialist tree for FR-001, FR-002, FR-012 and SC-001 in `pi/.thoth-agents-assets.json` | Verify: generated files match canonical roles and are included by the packed inventory
- [x] T011 [US1] Add failing strict ownership-receipt parsing, atomic commit, source-state, and pre-mutation conflict tests for FR-003, FR-004, FR-008 and SC-002 in `src/cli/pi-package-receipt.test.ts` | Verify: malformed, unowned, ambiguous, project-local, and receipt-inconsistent sources are conflicts while npm identity and Pi-canonical local source plus command-safe absolute install source remain distinguishable
- [x] T012 [US1] Implement the authoritative Pi-package receipt schema and ownership state machine for FR-003, FR-004, FR-008 and SC-002 in `src/cli/pi-package-receipt.ts` | Verify: T011 passes with strict keys, configured source/install source/scope/version/digests, atomic commit, and no change to the last-complete ledger schema
- [x] T013 [US1] Add failing credential-free isolated native observation tests for FR-004, FR-006 and SC-002 in `src/cli/pi-native-probe.test.ts` | Verify: configured, loadable, observed, unobserved, unavailable, missing-marker, duplicate-marker, digest mismatch, process failure, and real-home isolation are distinct
- [x] T014 [US1] Implement the exact real-Pi local-provider observation contract for FR-004, FR-006 and SC-002 in `src/cli/pi-native-probe.ts` | Verify: T013 passes and the final provider request, not configuration or import alone, proves exactly one complete current root marker with matching digests
- [x] T015 [US1] Add failing exact first-party source, manifest, resource, scope, symlink, ambiguity, ownership, observation, receipt-commit, and compensation transaction tests for FR-003, FR-004, FR-006, FR-008 and SC-002 in `src/cli/pi-install.test.ts` | Verify: npm uses one exact source; a local absolute input is accepted only through Pi's canonical relative source and matching resolved absolute path; failures restore a receipt-owned command-safe source or remove a new source and preserve the prior receipt
- [x] T016 [US1] Add first-party planning, verification, receipt commit, and compensating rollback ahead of external specs for FR-003, FR-004, FR-006, FR-008 and SC-002 in `src/cli/pi-install.ts` | Verify: T015 passes for exact public and real Pi-normalized packed sources; all adversarial evidence fails closed and rollback-failed returns both errors plus manual recovery
- [x] T017 [US1] Add failing top-level dry-run, first-mutation ordering, ownership-receipt commit, partial failure, provider, and last-complete ledger tests for FR-004, FR-007, FR-008 and SC-002 in `src/cli/install.test.ts` | Verify: conflict checks and dry-run mutate nothing; `pi install <exact-first-party> --no-approve` is the first mutation; no external command runs before observed evidence and receipt commit; no complete ledger record is written before all setup succeeds
- [x] T018 [US1] Reorder complete Pi install/update execution around the native first-party package transaction for FR-004, FR-007, FR-008 and SC-002 in `src/cli/install.ts` | Verify: T017 passes; first-party ownership may remain receipt-complete after a later external failure while the last-complete ledger remains unchanged

## Story US2 - Run Thoth from its Pi extension boundary

- [x] T019 [US2] Add failing package-owned specialist synchronization tests for FR-002, FR-005, FR-009, FR-011 and SC-003 in `src/cli/pi-resources.test.ts` | Verify: six files converge deterministically while unowned conflicts and supported model/effort state are preserved
- [x] T020 [US2] Implement one shared Pi specialist resource synchronizer for CLI and extension use covering FR-002, FR-005, FR-009, FR-011 and SC-003 in `src/cli/pi-resources.ts` | Verify: T019 passes with global agents discovery, project-shadow diagnostics, and idempotent attributable updates
- [x] T021 [US2] Extend native lifecycle tests for session-start resource convergence and direct-install degradation covering FR-001, FR-005, FR-006 and SC-003 in `src/pi.test.ts` | Verify: missing specialists are materialized, unowned conflicts become diagnostics, and missing external packages do not reject a valid turn
- [x] T022 [US2] Wire the shared synchronizer and dependency diagnostics into the extension for FR-001, FR-005, FR-006, FR-011 and SC-003 in `src/pi.ts` | Verify: T021 passes without runtime package installation, network access, or orchestrator child creation
- [x] T023 [US2] Add failing manifest-discovery and duplicate-owned-skill retirement tests for FR-005, FR-012 and SC-003/SC-005 in `src/cli/owned-skills.test.ts` | Verify: Pi owned skills resolve from the package while OpenCode synchronization remains unchanged
- [x] T024 [US2] Replace Pi copied-owned-skill installation with package discovery and safe legacy evidence helpers for FR-005, FR-012 and SC-003/SC-005 in `src/cli/owned-skills.ts` | Verify: T023 passes and no new global Pi copy is created
- [x] T025 [US2] Add failing native-root capability, dependency, security, and ownership assertions for FR-006, FR-011 and SC-003 in `src/harness/adapters/pi.test.ts` | Verify: diagnostics distinguish extension, filesystem agents, external runtimes, credentials, and absence of an OS sandbox
- [x] T026 [US2] Align Pi capability metadata and root guidance with the native extension boundary for FR-006, FR-011 and SC-003 in `src/agents/prompt-dialects.ts` | Verify: T025 and shared prompt rendering tests pass without overstating package or permission guarantees

## Story US3 - Update, migrate, and diagnose native package state

- [x] T027 [US3] Add failing legacy root-block and copied-skill migration tests for FR-004, FR-005, FR-007, FR-009 and SC-005 in `src/cli/pi-migration.test.ts` | Verify: exact attributable legacy state is removable, unrelated bytes survive, and ambiguous or modified state requires manual action
- [x] T028 [US3] Implement atomic bounded Pi legacy migration with backups and rollback for FR-004, FR-005, FR-007, FR-009 and SC-005 in `src/cli/pi-migration.ts` | Verify: T027 passes under injected write/rename failures with original operator state restored
- [x] T029 [US3] Add failing migration-order and partial-state integration cases for FR-004, FR-007, FR-008 and SC-002/SC-005 in `src/cli/pi-install.test.ts` | Verify: legacy retirement begins only after first-party extension/resource verification and never advances the ledger on failure
- [x] T030 [US3] Integrate package-owned resources and legacy migration into the complete Pi setup plan for FR-004, FR-007, FR-008 and SC-002/SC-005 in `src/cli/pi-install.ts` | Verify: T029 passes and dry-run lists exact migration targets without mutation
- [x] T031 [US3] Add failing receipt/source/path/digest, configured, loadable, observed-at-install, unobserved, unavailable, native-root, packaged-skill, migration, direct-install, and partial-dependency status cases for FR-006, FR-007, FR-008, FR-009 and SC-004 in `src/cli/operations/pi.test.ts` | Verify: local ownership requires both Pi-canonical source and command-safe resolved install path; no weaker evidence is promoted; ownership and observation remain independent from external research and last-complete ledger state
- [x] T032 [US3] Extend Pi Status, Update, Sync, and model/effort plans with receipt-bound progressive native evidence for FR-006, FR-007, FR-008, FR-009 and SC-004 in `src/cli/operations/pi.ts` | Verify: T031 passes with canonical source plus resolved-path validation, no harness fallback, no implicit adoption, and installation-equivalent Update
- [x] T033 [US3] Add failing CLI dispatch/output cases for native package source, migration, repair, and unsupported actions covering FR-009, FR-010 and SC-004 in `src/cli/commands.test.ts` | Verify: CLI output names thoth-agents separately from four external packages and provider setup
- [x] T034 [US3] Surface the native first-party package across Pi CLI flows for FR-009, FR-010 and SC-004 in `src/cli/commands.ts` | Verify: T033 and parser/index tests pass with unchanged other-harness dispatch
- [x] T035 [US3] Add failing TUI target, preview, warning, and apply cases for native package state covering FR-007, FR-009, FR-010 and SC-004 in `src/cli/tui/operations.test.ts` | Verify: Install/Update/Sync screens show the first-party step before external dependencies and preserve unsupported-state warnings
- [x] T036 [US3] Align Pi TUI operation rendering and apply behavior with native package ownership for FR-007, FR-009, FR-010 and SC-004 in `src/cli/tui/operations.ts` | Verify: T035 and App tests pass without changing OpenCode, Codex, or Claude operations

## Story US4 - Preserve external ownership and existing harnesses

- [x] T037 [US4] Add failing provider-boundary and external-package inventory assertions for FR-003, FR-006, FR-011, FR-012 and SC-001/SC-006 in `src/harness/provider-boundary.test.ts` | Verify: packed Pi assets contain no thoth-mem, delegation, research, or external-skill implementation tree
- [x] T038 [US4] Add packed native Pi candidate installation, unrelated-directory load verification, and the credential-free final-provider-request observation for FR-001, FR-003, FR-006, FR-012 and SC-001/SC-006 in `scripts/verify-pi-package.mjs` | Verify: a disposable package/home executes the specified `--no-extensions` plus two explicit-extension Pi command, proves one complete root marker, and leaves the real Pi home unchanged
- [x] T039 [US4] Document the native first-party package and external ownership split for FR-010 and SC-006 in `README.md` | Verify: README shows thoth-agents first, four external Pi packages, four external skills, and provider-owned thoth-mem
- [x] T040 [US4] Update public install, dry-run, Update, migration, and recovery guidance for FR-010 and SC-006 in `docs/installation.md` | Verify: operator steps distinguish direct native installation from complete CLI-managed setup
- [x] T041 [US4] Record the native extension/root/resource boundary and gentle-ai-derived ownership pattern for FR-001, FR-003, FR-006 and SC-006 in `docs/agent/architecture.md` | Verify: architecture names manifest-supported assets and the filesystem-only specialist requirement
- [x] T042 [US4] Route first-party package ordering, provenance, migration, and ledger diagnostics for FR-004, FR-007, FR-008, FR-010 and SC-006 in `docs/agent/cli-installation.md` | Verify: implementation routing docs name exact files, configured/install source normalization, resolved-path states, and failure boundaries
- [x] T043 [US4] Document packed Pi manifest, generated assets, and publication verification for FR-001, FR-012 and SC-001/SC-006 in `docs/agent/harness-packaging.md` | Verify: packaging inventory includes dist/pi.js, skills, Pi agents, provenance, and excludes external code
- [x] T044 [US4] Document hook activation, dependency degradation, and security boundaries for FR-006, FR-011 and SC-006 in `docs/agent/runtime-integrations.md` | Verify: runtime docs separate before-agent-start injection from session-start synchronization and external lifecycle
- [x] T045 [US4] Distinguish package-declared Thoth skills from copied external skills and provider setup for FR-005, FR-010, FR-012 and SC-006 in `docs/skills-and-mcps.md` | Verify: documentation contains no claim that Pi copies the five owned skills globally
- [x] T046 [US4] Document focused, packed, real-host, and pre-merge verification commands for FR-010 and SC-006 in `docs/agent/testing.md` | Verify: testing route includes real Pi install/list normalization plus native observation and prohibits real-home mutation

## Parallel execution

- None: package manifest, extension hooks, canonical generated assets, shared resource synchronization, installer ordering, migration, status, and documentation consume one evolving native-package contract and overlap shared files; a single sequential writer avoids divergent package ownership and false verification.

## Final verification

- [x] T047 Run focused native manifest, extension, adapter, writer, generator, receipt, observation, resource, migration, installer, operation, CLI, TUI, provider, and ledger tests for FR-001 through FR-012 and SC-001 through SC-005 in `package.json` | Verify: every focused Vitest target passes with no skipped native-package contract case
- [x] T048 Run formatting/check, type checking, and build for FR-001, FR-011, FR-012 and SC-001/SC-006 in `package.json` | Verify: check:ci, typecheck, and build exit successfully and dist/pi.js is generated
- [x] T049 Run the full regression and shared integration verification for SC-006 in `package.json` | Verify: all tests and integration verification pass without unexplained Codex, Claude, or OpenCode drift
- [x] T050 Pack and inspect the current candidate from an unrelated directory for FR-001, FR-003, FR-006, FR-012 and SC-001/SC-006 in `scripts/verify-pi-package.mjs` | Verify: the real Pi package manager installs the extracted packed candidate into a disposable home, reports its canonical configured source and exact resolved path, and packed inventory/import/skills/agents/provenance/receipt-bound observation pass without the published registry release
- [x] T051 Execute an isolated real Pi 0.84.4 smoke for SC-007 in `openspec/changes/pi-native-extension-package/verify-report.md` | Verify: with disposable `PI_CODING_AGENT_DIR`, record first-party-before-external installation and exact list/path; execute `pi --mode json --no-session --no-approve --offline --no-extensions --extension <installed-dist-pi> --extension <temporary-observer> --provider thoth-observer --model thoth-observer/probe --print <probe-prompt>`; prove the final provider request contains one complete root marker plus 5 skills and 6 specialists, or record the exact unavailable/external blocker without mocked success
- [x] T052 Review the complete diff, generated output, package inventory, temporary/staging residue, and changed-file secrets for SC-006 in `openspec/changes/pi-native-extension-package/verify-report.md` | Verify: no unrelated, untracked generated, credential, real-home, or stale legacy-package change remains before fresh Oracle verification

## Convergence 1 - Final Oracle remediation

- [x] T053 [US3] Resolve F-PI-STATUS-001 [contradicts] with failing direct npm/local install, configured-unowned, malformed-receipt, project-shadow, source/path/version-drift, package-skill-root, Update applicability, CLI, and TUI status tests, then make the existing deep writer update the Pi status/operation surface for FR-006, FR-008, FR-009 and SC-004 in `src/cli/` | Verify: configured-unowned/conflicting state is explicit, Update cannot silently adopt it, and five packaged skills are attributed only to the single configured Pi package root rather than the executing CLI root
- [x] T054 [US4] Resolve RISK-SC-007-01 [partial] by making the existing deep writer extend the packed verifier and its focused contract assertions to observe Pi's actual five-skill discovery and the six session-materialized specialist definitions for SC-007 in `scripts/verify-pi-package.mjs` | Verify: the disposable Pi smoke fails if inventory exists but Pi does not discover five skills or the extension lifecycle does not materialize exactly six attributable specialists with no orchestrator child; the real Pi home remains untouched

## Convergence 2 - Operation skill-root remediation

- [x] T055 [US3] Resolve the remaining F-PI-STATUS-001 operation-surface gap [partial] by adding a divergent executing-versus-configured package-root fixture and removing every no-op global Pi owned-skill synchronization or executing-root attestation from Install, Update, Sync, CLI, and TUI operation evidence for FR-005, FR-009, FR-010 and SC-004 in `src/cli/` | Verify: preview, validation, apply results, changed targets, and user-facing output derive five owned skills only from the receipt-validated configured Pi package root, never report global copied skills, and return unavailable or blocked evidence when that root is not attributable

## Convergence 3 - Sync fail-closed remediation

- [x] T056 [US3] Resolve F-PI-SYNC-001 [missing] with apply-time root-loss and malformed-skill-contract regressions, then move live receipt, package-manager root, and all five skill-contract validations before any Sync write for FR-005, FR-006, FR-009 and SC-004 in `src/cli/operations/pi.ts` | Verify: a stale healthy preview followed by missing/conflicting configured root or any missing skill SKILL.md rejects with zero MCP, specialist, migration, receipt, ledger, or other mutation; status never labels a malformed skill installed; any later write failure reports every actually changed target truthfully

## Convergence 4 - Skill frontmatter boundary remediation

- [x] T057 [US3] Resolve F-PI-SYNC-002 [contradicts] with status and stale-plan body-bait regressions, then isolate a properly closed initial YAML frontmatter block and validate the exact skill name plus nonempty description only within that block for FR-005, FR-006, FR-009 and SC-004 in `src/cli/owned-skills.ts` | Verify: wrong or missing frontmatter fields cannot be satisfied by matching body text; status reports drift, Install/Update/Sync inspection fails closed, and stale Sync apply rejects before any MCP, specialist, migration, receipt, ledger, or other mutation
