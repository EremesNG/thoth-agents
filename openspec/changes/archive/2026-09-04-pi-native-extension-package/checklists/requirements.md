# Requirements checklist: Native Pi Extension Package

**Activation reason**: This Full change makes the published npm artifact execute
as a native Pi extension with user privileges, changes package and resource
ownership, migrates existing global files, installs multiple external packages,
and gates the authoritative ledger on exact provenance across partial failures.

## Initial validation

- [x] CHK001 [Completeness] Do US1–US4 cover the operator, native extension, ambient root, six specialists, owned skills, external packages/skills/provider, existing-harness users, install/dry-run/Update/Sync/status/model flows, direct install, migration, partial failures, trust, and publication? Evidence: `spec.md` stories, acceptance scenarios, edge cases, assumptions, dependencies, and non-goals name every actor and flow.
- [x] CHK002 [Clarity] Does each FR-001–FR-012 have one observable interpretation for package identity, manifest fields, first-party ordering, runtime hook, agent discovery, skill ownership, migration, external ownership, status, and ledger behavior? Evidence: normative requirements name the exact package source shape, native hook, supported manifest surfaces, filesystem discovery boundary, ordering, and fail-closed states.
- [x] CHK003 [Consistency] Are stories, requirements, criteria, assumptions, research, and non-goals aligned on one `thoth-agents` package rather than a second Pi package or CLI-only activation? Evidence: all artifacts select the main npm artifact, one native extension, manifest-owned skills, package-owned agents, and later external dependencies.
- [x] CHK004 [Measurability] Can every FR and SC be decided from exact package, manifest, hook, file-count, source/version, order, mutation, status, migration, test, or smoke evidence? Evidence: SC-001–SC-006 are buildable with explicit counts/commands and SC-007 names concrete real-host observations or residual risk.
- [x] CHK005 [Coverage] Is every story, requirement, buildable criterion, outcome criterion, failure mode, and affected capability assigned to plan and task evidence? Evidence: `plan.md` and `tasks.md` explicitly map US1, US2, US3, US4; FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008, FR-009, FR-010, FR-011, FR-012; and SC-001, SC-002, SC-003, SC-004, SC-005, SC-006, SC-007 across implementation and verification.

## Domain lenses

- [x] CHK006 [Security] Do requirements state native extension privileges, trust, lack of OS sandboxing/signatures, credential/network access, untrusted project resources, and forbidden silent external installation from hooks? Evidence: FR-006, FR-011, edge cases, assumptions, non-goals, and `research.md` preserve each boundary.
- [x] CHK007 [Migration] Do requirements separate legacy attributable root/skill state from user-owned modifications and define preservation, manual action, backups, rollback, duplicate prevention, and specialist continuity? Evidence: US3, FR-004, FR-005, FR-007, SC-005, edge cases, and plan migration design cover each state.
- [x] CHK008 [Supply chain] Do requirements pin the executing first-party package, verify name/version/source/path/manifest/resources/loadability, retain external pins, and reject project-local, ambiguous, malformed, or unowned provenance? Evidence: US1, FR-001, FR-003, FR-004, SC-001, SC-002, and edge cases define exact evidence.
- [x] CHK009 [Reliability] Are dry-run purity, first-failure downstream blocking, partial external state, receipt/ledger authority, idempotency, hook degradation, duplicate injection, and real-home isolation explicit? Evidence: US1–US3, FR-004–FR-009, SC-002–SC-005, SC-007, and plan risks define separate outcomes.
- [x] CHK010 [Provider ownership] Does the first-party package exclude thoth-mem implementation and keep provider setup/evidence after owned and external assets? Evidence: US4, FR-003, FR-004, FR-006, dependencies, and out-of-scope preserve the provider boundary.

## Revalidation

- [x] CHK011 [Coverage] Were requirements revalidated after official Pi evidence proved that packages cannot declare agents and root injection requires an extension hook? Evidence: FR-001, FR-002, FR-005, SC-001, SC-003, and the plan use manifest skills, `before_agent_start`, and explicit global specialist synchronization.
- [x] CHK012 [Consistency] Were the gentle-ai first-party ownership pattern and the user correction propagated without copying an unavailable implementation or rewriting the prior archive? Evidence: `research.md`, `spec.md`, and `plan.md` select the pattern as architecture, retain thoth-agents-native code ownership, and explicitly exclude archive rewrites.
- [x] CHK013 [Buildability] Does the plan assign the compiled Pi entry to the actual build surface? Evidence: `plan.md` and T001–T003 require exactly one `pi: "src/pi.ts"` ESM entry in `tsup.config.ts`, retain the existing entries, and verify `dist/pi.js` in the packed candidate.
- [x] CHK014 [Ownership] Is one authoritative first-party receipt schema separated from last-complete setup, with pre-mutation conflicts, a commit point, and verified compensation? Evidence: FR-003, FR-004, FR-008, SC-002, `data-model.md`, and T011–T018 define strict receipt states, reject implicit adoption, retain the prior receipt until verified commit, and restore/remove Pi sources on failure.
- [x] CHK015 [Observation] Is native root execution distinguished from configuration and importability with a deterministic real-Pi mechanism? Evidence: FR-006, SC-004, SC-007, `plan.md`, `data-model.md`, T013–T016, T038, and T050–T051 define configured/loadable/observed/unobserved/unavailable states plus the exact offline local-provider probe command and one-marker assertion.
- [x] CHK016 [Runtime source identity] Was the real Pi 0.84.4 discovery that absolute local inputs are stored relative to the user package base propagated without weakening public npm exactness? Evidence: SC-007, assumptions, `data-model.md`, `plan.md`, and reopened T011–T016/T050 separate command-safe install source, Pi-canonical configured source, and resolved absolute package path for verification and rollback.
