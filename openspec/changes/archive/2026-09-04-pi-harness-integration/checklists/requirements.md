# Requirements checklist: Pi Harness Integration

**Activation reason**: This Full change installs pinned third-party Pi extensions
with the invoking user's system permissions, changes shared global instruction
and MCP files, raises the repository runtime floor, and depends on external
provider and delegation contracts whose drift could create false completion or
credential/trust failures.

## Initial validation

- [x] CHK001 [Completeness] Do US1–US4 cover the operator, ambient root, six specialists, external provider, existing-harness user, install/dry-run/update/sync/status/model flows, partial failures, shadowing, credentials, and trust boundaries? Evidence: `spec.md` user stories, acceptance scenarios, edge cases, assumptions, dependencies, and out-of-scope sections name every actor and flow.
- [x] CHK002 [Clarity] Does each FR-001–FR-020 have one observable interpretation for ownership, ordering, package pins, path scope, fallback, and failure behavior? Evidence: `spec.md` Functional requirements uses normative MUST/MUST NOT language and exact selectors, packages, versions, paths, entry names, endpoint, and states where material.
- [x] CHK003 [Consistency] Are stories, requirements, criteria, assumptions, dependencies, and non-goals aligned on the selected Pi/runtime/research contracts? Evidence: all sections select Pi 0.84.4/Node 22.19, pi-subagents 1.5.9, native Context7/Exa, adapter-only grep.app, global scope, and provider-owned thoth-mem without a competing default.
- [x] CHK004 [Measurability] Can every functional requirement and SC-001–SC-009 be decided from objective evidence rather than intent? Evidence: `plan.md` maps all twenty FRs to exact interfaces and seams; buildable SCs specify tests/commands, while outcome SCs specify exact smoke registrations, counts, and lifecycle evidence.
- [x] CHK005 [Coverage] Is every US, FR, SC, constraint, and named failure mode assigned to implementation and verification work? Evidence: US1, US2, US3, and US4 map FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008, FR-009, FR-010, FR-011, FR-012, FR-013, FR-014, FR-015, FR-016, FR-017, FR-018, FR-019, and FR-020 to SC-001, SC-002, SC-003, SC-004, SC-005, SC-006, SC-007, SC-008, and SC-009; `plan.md` and `tasks.md` provide the corresponding implementation and verification seams.

## Domain lenses

- [x] CHK006 [Security] Do requirements state the extension permission model, absence of OS sandboxing, package trust, project trust, untrusted research output, credential ownership, and forbidden silent credential changes? Evidence: FR-007, FR-008, FR-019, FR-020 and Security and reliability consequences in `research.md` cover each boundary explicitly.
- [x] CHK007 [Migration] Do requirements identify every active Node-floor surface, existing harness compatibility, immutable archives, global shared-file migration, backups, and rollback/recovery behavior? Evidence: US4, FR-018, SC-006/SC-007, edge cases, and `plan.md` Risks and migrations provide the coordinated migration contract.
- [x] CHK008 [Reliability] Are dry-run non-mutation, complete ordering, atomic attributable writes, conflicts, package/version drift, partial native state, ledger gating, nonterminal fan-in, and remote failures distinguishable? Evidence: US1–US3 acceptance scenarios, FR-003–FR-013, FR-020, SC-002–SC-005, and edge cases define separate outcomes.
- [x] CHK009 [Provider ownership] Is thoth-mem ownership separated from thoth-agents setup and canonical OpenSpec artifacts? Evidence: FR-010, assumptions, dependencies, out-of-scope, and both Constitution Checks restrict integration to the provider's public setup/evidence contract.

## Revalidation

- [x] CHK010 [Coverage] Were affected requirements revalidated after selecting the hybrid research stack and adding the exact Exa and grep.app contracts? Evidence: FR-007–FR-009, FR-013, FR-019, FR-020 and SC-002, SC-005, SC-009 were updated, then the Full specification gate passed.
- [x] CHK011 [Consistency] Were downstream plan and task artifacts revalidated after the requirement change? Evidence: `plan.md` includes the exact four-package/configuration design and all twenty mappings; `tasks.md` includes research-provider tests/implementation/smoke work; both tasks and ready validators passed before this checklist was finalized.
- [x] CHK012 [Coverage] Were Oracle round-one blockers incorporated without changing product intent? Evidence: the plan and tasks now order adapter creation before registration, assign Pi Install in CLI/TUI plans and applies, add a test-first top-level install task, and update the two known exhaustive provider/runtime regression contracts before final verification.
