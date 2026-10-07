# Implementation Plan: Preflight Durable Delta Intent

## Technical context

The current validator parses durable metadata but checks only grammar and affected-capability coverage. Canonical title existence is first evaluated inside the archive executable after planning, implementation, and Oracle verification. The archive logic is safe because it validates before writes, but the late and duplicated decision point permits inverse `ADDED`/`MODIFIED` mistakes to survive every earlier gate. The public TDD seams confirmed by the user are the installed validator and archive CLIs.

## Constitution Check (pre-design)

- **Adaptive-root orchestration**: PASS — the user accepted the recommended Accelerated route and confirmed the validator/archive CLI seams; root retains sequential artifact ownership.
- **Explicit role boundaries**: PASS — root owns specification, planning, implementation coordination, and archive; a fresh Oracle will own final verification.
- **Proportional Spec Kit-compatible SDD**: PASS — this change strengthens durable delta governance without adding a new phase or unrelated artifact.
- **Truthful multi-harness contracts**: PASS — canonical skill sources remain authoritative and generated plugin assets will be synchronized through the existing integration generator.
- **Independent provider ownership**: PASS — the change does not alter provider memory installation, lifecycle, or persistence.
- **Evidence-led completion**: PASS — both public executables receive focused behavioral tests, followed by integration and repository validation plus independent Oracle verification.

## Design

### Requirement mapping

| Requirement | Technical decision | Files/interfaces | Verification seam |
| --- | --- | --- | --- |
| FR-001, SC-003 | Add an explicit canonical-baseline truth table to specification guidance, template commentary, root phase instructions, and public SDD documentation. | `skills/thoth-sdd/references/phases/specify.md`, `skills/thoth-sdd/templates/spec.md`, `src/harness/core/sdd.ts`, `docs/sdd-pipeline.md` | Integration package verification and direct inspection of canonical/generated skill assets |
| FR-002, SC-001 | Extract canonical parsing and declaration-ordered title preflight into a local shared ESM module; have the validator load `openspec/specs/` from the active change root and translate structured issues/warnings into stable SDD diagnostics at every artifact gate. | `skills/thoth-sdd/scripts/durable-deltas.mjs`, `skills/thoth-sdd/scripts/validate.mjs` | Validator CLI exit status and JSON error/warning codes in `src/harness/sdd-validator.test.ts` |
| FR-003, SC-002 | Replace archive's duplicate metadata/canonical semantic checks with the shared preflight while retaining rendering, staging, rollback, report update, and move logic. | `skills/thoth-archive/scripts/archive.mjs` | Archive CLI stderr codes and filesystem invariants in `src/harness/sdd-archive.test.ts` |
| FR-001, FR-002, FR-003, SC-003 | Regenerate the plugin skill tree, including the new shared module and updated asset manifest. | `plugin/skills/`, `plugin/.claude-plugin/.thoth-agents-plugin-assets.json` | `pnpm run integration:sync` followed by `pnpm run integration:verify` |

The shared module will expose metadata parsing, canonical requirement parsing, and a pure ordered preflight result. It will not perform filesystem writes. Validator supplies a baseline loaded from the project; archive consumes the same result before its existing staging transaction.

Stable deterministic diagnostics will distinguish at least: added title already exists, operation requires a missing capability/title, rename source missing, and rename destination collision. A nonblocking warning will flag a valid exact-title addition to an existing nonempty capability for semantic-overlap review.

## Optional support artifacts

- `research.md`: Not needed; current source, tests, archived evidence, and canonical contracts establish the failure mode.
- `data-model.md`: Not needed; the title set and structured preflight issues are local script values rather than persisted application data.
- `contracts/`: Not needed; the CLI JSON/stderr behavior is specified directly by FRs and tests.
- `quickstart.md`: Not needed; there is no new operator workflow or command.

## Risks and migrations

- Existing active changes with incorrect durable metadata will begin failing earlier. This is intentional migration behavior; diagnostics must name the capability and title so correction is actionable.
- Valid `ADDED` deltas into an existing capability will emit a warning because differently named semantic overlap is not deterministically decidable. The warning must not make the gate invalid.
- The archive skill imports a sibling thoth-sdd script. This preserves the existing bundled-skill dependency already used for templates and validation; integration tests must prove the generated bundle contains the module.
- Sequential multi-delta evaluation must match archive application order. Shared preflight tests and existing mixed-operation archive tests mitigate drift.
- Rollback is code reversion only; no persistent migration or canonical rewrite occurs before successful archive.

## Constitution Check (post-design)

- **Adaptive-root orchestration**: PASS — the design keeps root coordination bounded and uses no unnecessary implementation delegation.
- **Explicit role boundaries**: PASS — one root writer owns the shared validator/archive surfaces and Oracle remains the independent verifier.
- **Proportional Spec Kit-compatible SDD**: PASS — early canonical preflight directly strengthens existing specify/ready/closeout gates without new ceremony.
- **Truthful multi-harness contracts**: PASS — one canonical implementation is copied to all harness bundles and integration verification detects stale generated assets.
- **Independent provider ownership**: PASS — no provider-owned surface is read, modified, or claimed by the implementation.
- **Evidence-led completion**: PASS — the design maps every FR/buildable SC to public CLI evidence, generated-asset verification, and final Oracle judgment.
