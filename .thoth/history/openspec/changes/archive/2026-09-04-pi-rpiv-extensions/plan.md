# Implementation Plan: Pi interaction and web extensions

## Technical context

Pi installs four external native packages via PI_PACKAGE_SPECS after verified first-party setup. Root dialect incorrectly assumes ask_user and has no progressTool. Only librarian receives research tools. User selected Accelerated. Frozen research.md resolves exact new version/tool contracts.

## Constitution Check (pre-design)

- **Adaptive-root orchestration**: PASS — Root owns artifacts and synthesis; one deep writer, fresh Oracle review.
- **Explicit role boundaries**: PASS — Seven roles retained; root alone owns user interaction/progress and librarian web tools.
- **Proportional Spec Kit-compatible SDD**: PASS — User selected Accelerated; specify/ready/closeout gates and archive planned.
- **Truthful multi-harness contracts**: PASS — Native external extensions supply tools/state; no executor, vendoring, or phase network.
- **Independent provider ownership**: PASS — No thoth-mem changes or credential writes; existing provider setup remains external.
- **Evidence-led completion**: PASS — TDD at public installer/rendering seams, proportional checks and fresh Oracle final judgment.

## Design

### Requirement mapping

| Requirement | Technical decision | Files/interfaces | Verification seam |
| --- | --- | --- | --- |
| FR-001 / SC-001 | Add three 2.9.0 native pins to existing required package loop; reuse exact-source proof and fail-closed completion. No npm runtime dependencies. | src/cli/pi-install.ts, src/cli/operations/pi.ts | isolated plan/apply/status and Install/Update tests |
| FR-002 / SC-002 | Pi dialect uses ask_user_question; root explains 1-4 questions/2-4 options, cancellation, partial/no-UI fallback. Child rendered instructions route questions to root, never direct unavailable tools. | src/agents/prompt-dialects.ts, src/agents/prompt-sections.ts, src/harness/adapters/pi.ts | render full root plus all six children, preserve other dialects |
| FR-003 / SC-002 | Pi progress tool maps to todo for root; use for meaningful multi-step plans and update real progress. Child guidance reports to root; no todo allowlist or scheduler/status conflation. | src/agents/prompt-dialects.ts, src/agents/prompt-sections.ts, src/harness/adapters/pi.ts | rendered ownership/no-UI/task-lifecycle contract |
| FR-004 / SC-003 | Add exact web_search/web_fetch to librarian allowlist and root/librarian guidance; preserve existing research allowlist and all other roles. | src/harness/writers/pi-agent.ts, src/harness/adapters/pi.ts | generated definition/prompt tests |
| FR-005 / SC-001 / SC-004 | Existing status lists added packages independently; document capabilities and no-live-probe distinction, adjust stale package counts. | README.md, docs/installation.md, docs/skills-and-mcps.md, docs/agent/cli-installation.md | operator docs and status regression |
| FR-001 to FR-005 / SC-004 | Regenerate canonical outputs; offline tests/build. | pi/.thoth-agents-assets.json, pi/agents/thoth-librarian.md, src/harness/provider-boundary.test.ts | artifact inventory and full checks |

### Ownership and dependencies

Root owns openspec change artifacts/gates/docs synthesis and archive. One fresh deep owns all product code, tests, routed docs, and generated resources; coupled dialect/rendering/install/status contracts benefit from one writer. It must use installed tdd/simplify and progressive-context-router if changing agent guidance.
Librarian preflight is complete. Explorer unnecessary: local owners known. Designer unnecessary: upstream owns UI and we do not implement visual components. Quick unsuitable for coupled contracts; deep selected. Fresh Oracle owns plan review if chosen and mandatory final verification. No new product lane starts before ready/review decision. No parallel mutable lanes because tests and generated resources consume common prompt/package contracts.

### File changes and verification seams

Primary: src/cli/pi-install.ts, src/cli/operations/pi.ts, src/agents/prompt-dialects.ts, src/agents/prompt-sections.ts, src/harness/adapters/pi.ts, src/harness/writers/pi-agent.ts.
Tests: src/cli/pi-install.test.ts, src/cli/install.test.ts, src/cli/operations/pi.test.ts, src/agents/prompt-dialects.test.ts, src/agents/prompt-rendering.test.ts, src/harness/adapters/pi.test.ts, src/harness/writers/pi-agent.test.ts, src/harness/provider-boundary.test.ts, src/harness/core/memory-governance.test.ts.
Docs: README.md, docs/installation.md, docs/skills-and-mcps.md; minimally reconcile docs/agent/cli-installation.md, docs/agent/harness-packaging.md and docs/agent/architecture.md where package-count statements become stale.
Generated: pi/agents/thoth-explorer.md, pi/agents/thoth-librarian.md, pi/agents/thoth-oracle.md, pi/agents/thoth-designer.md, pi/agents/thoth-quick.md, pi/agents/thoth-deep.md, pi/.thoth-agents-assets.json; any shared plugin output must preserve other-harness behavior.

Execution refinement: the writer found a stale native-dependency count in docs/agent/architecture.md. Its bounded documentation update preserves the approved intent; the sixth generated specialist path is enumerated explicitly above. No behavioral scope change or renewed implementation decision is needed. The pre-implementation review remains historical evidence; its plan/task hashes naturally predate these execution refinements.

Verification refinement: the full suite identified one expected Pi wording change in src/harness/core/memory-governance.test.ts (progress now names todo). Update the test expectation for the accepted tool mapping; no memory-governance implementation behavior changes.
Agreed public TDD seams for implementation choice: installer/apply/status, rendered full prompt/allowlists, generated inventories. Each slice red -> implementation -> green, not bulk imagined tests.
Run focused tests, check:ci, typecheck, build, full pnpm test with inherited CODEX_HOME removed only from test child environment, and integration:verify. No network/CLI installations during SDD; real interactive/credentialed SC-005 remains explicitly RISK unless existing offline environment enables truthful observation.

## Optional support artifacts

- research.md: freezes exact external contracts and source evidence to prevent phase-time network research.
- data-model.md: not needed; no thoth-owned new persistence.
- contracts/: not needed; upstream owns tools and research.md supplies exact identifiers.
- quickstart.md: not needed; routed operator documentation is sufficient.

## Risks and migrations

- No migration or compatibility shims; replace Pi ask_user references with real name, preserving other harness mappings.
- Wildcard upstream Pi peer versions do not certify current-host compatibility; distinguish manifest/schema checks from interactive observations.
- Cancellation must not become bounded-default approval; question availability is conditional. If tool unavailable, root states limitation and asks textually, preserving unresolved decisions.
- Partial package failures reuse existing error/ledger behavior. Rollback source changes by reverting this diff; do not uninstall or modify user packages automatically.
- Externally owned todo stores session-local progress, not shared work scheduling. No child writable todo exposure.
- No web credentials are copied or requested by installer; provider failures stay explicit.
- Canonical ADDED warnings reviewed against existing titles: concrete RPIV package and root-interaction/progress/web contracts are new refinements, not replacements of existing hybrid research and native lifecycle requirements.

## Constitution Check (post-design)

- **Adaptive-root orchestration**: PASS — Root owns artifacts and synthesis; one deep writer, fresh Oracle review.
- **Explicit role boundaries**: PASS — Seven roles retained; root alone owns user interaction/progress and librarian web tools.
- **Proportional Spec Kit-compatible SDD**: PASS — User selected Accelerated; specify/ready/closeout gates and archive planned.
- **Truthful multi-harness contracts**: PASS — Native external extensions supply tools/state; no executor, vendoring, or phase network.
- **Independent provider ownership**: PASS — No thoth-mem changes or credential writes; existing provider setup remains external.
- **Evidence-led completion**: PASS — TDD at public installer/rendering seams, proportional checks and fresh Oracle final judgment.
