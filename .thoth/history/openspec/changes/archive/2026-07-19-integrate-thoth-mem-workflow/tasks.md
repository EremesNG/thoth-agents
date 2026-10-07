# Tasks: Integrate thoth-mem into the thoth-agents workflow

## MVP scope

US1 is the MVP: all three `npx thoth-agents install` paths invoke the official thoth-mem setup command last and refuse to claim complete installation without consistent provider `complete` evidence.

## Dependencies

`T001 -> T002 -> T003 -> T004 -> T005 -> T006 -> T007 -> T008 -> T009 -> T010 -> T011 -> T012 -> T013 -> T014 -> T015 -> T016`; US2 builds on the shared provider outcome vocabulary from US1, and US3 documents only tested behavior.

## Story US1

- [x] T001 [US1] Add failing command, JSON-envelope, status, malformed-output, and exit-mismatch tests for FR-001, FR-002, FR-003, SC-001, and SC-002 in `src/cli/thoth-mem-install.test.ts` | Verify: the focused test fails because the provider setup adapter does not exist
- [x] T002 [US1] Implement the bounded official provider setup adapter for FR-001, FR-002, FR-003, SC-001, and SC-002 in `src/cli/thoth-mem-install.ts` | Verify: `pnpm exec vitest run src/cli/thoth-mem-install.test.ts` passes with no implicit force or provider file mutation
- [x] T003 [US1] Replace the existing OpenCode-only dry-run expectation with failing shared branch orchestration assertions for FR-001, FR-002, SC-003 in `src/cli/install.test.ts` | Verify: the focused test fails because one or more harness branches do not complete mandatory provider setup
- [x] T004 [US1] Integrate provider setup last in every harness installation and render confirmed/manual outcome evidence for FR-001, FR-002, SC-003 in `src/cli/install.ts` | Verify: `pnpm exec vitest run src/cli/install.test.ts src/cli/thoth-mem-install.test.ts` passes and every non-complete provider result returns nonzero

## Story US2

- [x] T005 [US2] Add failing provider ownership, authorization, and OpenSpec canonicality assertions for FR-004, FR-005, FR-006, SC-004, and SC-005 in `src/harness/core/memory-governance.test.ts` | Verify: the focused test fails on obsolete role-write coupling or SDD mirroring semantics
- [x] T006 [US2] Add failing root and child thoth-mem routing assertions for FR-004, FR-005, FR-006, and SC-004 in `src/agents/prompt-rendering.test.ts` | Verify: the focused test fails on missing skill triggers, lifecycle ownership, or degradation behavior
- [x] T007 [US2] Add failing MEMORY envelope assertions for FR-005, FR-006, and SC-005 in `src/harness/core/sdd-protocol.test.ts` | Verify: the focused test fails because canonical dispatch lacks provider identity and authorization
- [x] T008 [US2] Implement the provider-owned, dispatch-scoped memory governance contract for FR-004, FR-005, FR-006, SC-004, and SC-005 in `src/harness/core/memory-governance.ts` | Verify: governance tests pass without provider call sequencing or workspace-write escalation
- [x] T009 [US2] Implement compact root and child thoth-mem routing for FR-004, FR-005, FR-006, and SC-004 in `src/agents/prompt-sections.ts` | Verify: prompt rendering tests pass and the root remains below its size budget
- [x] T010 [US2] Align shared prompt utility exports with dispatch-scoped memory for FR-005 and SC-005 in `src/agents/prompt-utils.ts` | Verify: typecheck accepts every prompt consumer without read-only/write-capable memory coupling
- [x] T011 [US2] Implement and validate the canonical MEMORY dispatch block for FR-005, FR-006, and SC-005 in `src/harness/core/sdd.ts` | Verify: SDD protocol tests pass with stable identity or explicit unavailable state

## Story US3

- [x] T012 [US3] Add failing closed-boundary and public-guidance assertions for FR-003, FR-007, and SC-006 in `src/harness/provider-boundary.test.ts` | Verify: the focused test fails until the setup adapter and documented ownership flow are covered
- [x] T013 [US3] Update the primary combined-install and ownership guidance for FR-007 and SC-006 in `README.md` | Verify: README names all three provider setup mappings, dry-run planning, and non-complete handling
- [x] T014 [US3] Update routed operator and agent guidance for FR-007 and SC-006 in `docs/` | Verify: documentation contract tests pass and no guide claims thoth-agents owns provider assets or runtime protocol

## Parallel execution

- None: one writer must update overlapping canonical prompt, generator, documentation, and test surfaces in dependency order; generated plugin output depends on all canonical changes.

## Final verification

- [x] T015 Regenerate the shared plugin from canonical sources and verify FR-004, FR-005, FR-006, SC-004, and SC-005 in `plugin/` | Verify: `pnpm run build` succeeds and generated assets contain the new memory contract without copied thoth-mem assets
- [x] T016 Map FR-001 through FR-007 and buildable SC-001 through SC-006 evidence in `openspec/changes/integrate-thoth-mem-workflow/verify-report.md` | Verify: independent oracle records PASS after focused tests, `pnpm run check:ci`, `pnpm run typecheck`, `pnpm run build`, and `pnpm test`

## Convergence

- [x] T017 [US3] Resolve TMEM-VERIFY-001 by correcting the durable delta from an impossible modification to an addition for FR-007 and SC-006 in `openspec/changes/integrate-thoth-mem-workflow/spec.md` | Verify: the Accelerated ready validator passes and independent oracle confirms the change is archivable against the current canonical specification set
- [x] T018 [US1] Resolve TMEM-VERIFY-002 by adding a finite provider-process timeout with bounded truthful failure evidence for FR-002 in `src/cli/thoth-mem-install.ts` | Verify: the focused thoth-mem installer tests cover timeout options and a timed-out process without false success
- [x] T019 [US2] Resolve TMEM-VERIFY-003 by making OpenSpec canonicality and the no-mirroring boundary explicit in every child prompt for FR-006 and SC-004 in `src/agents/prompt-sections.ts` | Verify: prompt tests inspect every child role independently and reject a missing canonicality boundary
