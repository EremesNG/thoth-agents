# Verification Report: Repair OpenCode Drift During Trusted Apply

## Round

round 2

## Completeness

- Verified at: `2026-07-17T15:50:59.4406253Z`.
- OpenSpec preflight passed: `openspec/config.yaml`, `openspec/specs/`, `openspec/changes/`, and `openspec/memory/constitution.md` exist; all required mechanism sections are present.
- Pipeline: accelerated; `proposal.md` is the acceptance reference.
- Task state: 20 completed, 2 explicitly skipped, 0 pending.
- Tasks 4.3 and 4.4 correctly retain unauthorized live recovery and post-recovery verification as deferred work.
- Proposal success criteria mapped: 16/16.
- Proposal SHA-256: `dfee4c9fd310f8ecdce1d9dc3fff03262da876af2496b30b826625752cd8f4ee`.
- Tasks SHA-256: `a4a5cbe078ac5c02a9c6878d136289abaf064d9829f1299a91d19433e8951cfe`.
- The pre- and post-verification Git status are identical. The build’s schema formatter produced no net tracked change.
- Verification invoked no live OpenCode command and performed no live cache, config, skill, provider, or model mutation.

## Build and Test Evidence

| Command | Exit | Evidence |
| --- | ---: | --- |
| `pnpm exec vitest run src/cli/operations/opencode.test.ts src/cli/tui/operations.test.ts` | 0 | 2/2 files and 90/90 tests passed; reported duration 1.95s. |
| `pnpm test` | 0 | 76/76 files and 882/882 tests passed; reported duration 23.32s. |
| `pnpm run typecheck` | 0 | `tsc --noEmit` completed without errors. |
| `pnpm run lint` | 0 | Biome checked 234 files in 266ms; no fixes applied. |
| `pnpm run build` | 0 | tsup ESM build, declaration emission, and schema generation succeeded. The schema formatter reported one formatted file, but `git diff -- thoth-agents.schema.json` was empty and tracked status remained unchanged. |
| `git diff --check` | 0 | No whitespace errors. |

## Compliance Matrix

| ID | Proposal success criterion | Evidence | Status |
| --- | --- | --- | --- |
| SC-01 | Legacy `preset: "agents"` produces an explicit roster blocker and role observations. | `src/cli/operations/opencode.test.ts:306`; classifiers at `src/cli/operations/opencode.ts:504` and `:546`. | Compliant |
| SC-02 | Sync/install previews repair recognized drift; model-config remains blocked until health is restored. | `src/cli/operations/opencode.test.ts:474`; action-specific gate at `src/cli/operations/opencode.ts:660`; plan eligibility at `:1122`. | Compliant |
| SC-03 | Missing bundled skills are unhealthy, repairable by sync/install, and block model-config. | `src/cli/operations/opencode.test.ts:500`, `:1664`, `:1735`, and `:1766`. | Compliant |
| SC-04 | Missing recommended global skills remain minor and non-blocking. | `src/cli/operations/opencode.test.ts:257`, `:500`, `:1814`, and `:1835`. | Compliant |
| SC-05 | Native model discovery uses `opencode models --pure` on POSIX and Windows. | `src/cli/tui/model-catalog.ts:91`; regressions at `src/cli/tui/model-catalog.test.ts:194` and `:204`. | Compliant |
| SC-06 | Pure output retains parsing, deduplication, and catalog enrichment while excluding plugin-only discovery. | Parser at `src/cli/tui/model-catalog.ts:31`; regression at `src/cli/tui/model-catalog.test.ts:77`. | Compliant |
| SC-07 | External-plugin startup produces no marker; discovery failure returns an empty catalog without unsafe retry. | `src/cli/tui/model-catalog.test.ts:111` and `:137`. | Compliant |
| SC-08 | A selected custom preset beats conflicting `presets.openai`; root overrides win per field. | `src/cli/tui/operations.ts:197`; regression at `src/cli/tui/operations.test.ts:82`. | Compliant |
| SC-09 | Absent or missing active presets use root values/defaults without an `openai` fallback. | `src/cli/tui/operations.ts:208`; regressions at `src/cli/tui/operations.test.ts:135` and `:171`. | Compliant |
| SC-10 | Applying a model plan with `preset: "custom"` preserves that preset and every named preset, changes only requested root overrides, and creates no `presets.agents`. | Bounded named-preset recognition at `src/cli/operations/opencode.ts:521`; model-only diagnostic filtering at `:660`; root-only writer at `:1605`; executable custom-preset regression at `src/cli/operations/opencode.test.ts:1355`. | Compliant |
| SC-11 | Trusted repair creates backups, writes the seven-agent roster, refreshes bundled skills, preserves unrelated fields, and reports changed targets. | End-to-end regressions at `src/cli/operations/opencode.test.ts:1664`; apply implementation at `src/cli/operations/opencode.ts:1791`. | Compliant |
| SC-12 | Parse errors, unsafe or unrecognized shapes, unmanaged configuration, and fabricated drift remain rejected without writes and with diagnostics. | `src/cli/operations/opencode.test.ts:524`, `:601`, `:613`, `:647`, and `:663`; provenance/live validation at `src/cli/operations/opencode.ts:1492`. | Compliant |
| SC-13 | Successful repair produces healthy status and model-config eligibility. | End-to-end repair regression at `src/cli/operations/opencode.test.ts:1664`. | Compliant |
| SC-14 | Focused operation behavior and repository gates pass. | 90/90 focused tests; 882/882 full tests; typecheck, lint, build, and `git diff --check` all exited 0. | Compliant |
| SC-15 | Focused tests cover custom inheritance, absent/missing behavior, field precedence, preservation, and unchanged neighboring semantics. | `src/cli/tui/operations.test.ts:82`, `:135`, and `:171`; preservation regression at `src/cli/operations/opencode.test.ts:1355`; full suite passed. | Compliant |
| SC-16 | Verification performs no live mutation and the unresolved `0.2.2`/12-skill recovery remains deferred. | Explicit skips at `openspec/changes/repair-opencode-drift-apply/tasks.md:127` and `:135`; verification commands did not invoke OpenCode. | Compliant |

## Prior Issue Closure

- **[C1] Closed — valid selected custom presets now reach model apply without weakening fail-closed cases.**
  - `hasSelectedNamedPreset` at `src/cli/operations/opencode.ts:521` requires a non-empty, non-managed preset name, an own preset-map entry, and a non-null, non-array object value.
  - `opencode-active-preset-selected` is a dedicated diagnostic declared at `src/cli/operations/opencode.ts:562`.
  - `blockingDetails` at `src/cli/operations/opencode.ts:660` removes only that dedicated diagnostic for `model-config`; critical, roster, parse, main/plugin, and bundled-skill blockers remain effective.
  - Preview uses this gate through `planFromItems` at `src/cli/operations/opencode.ts:1122`.
  - Apply first revalidates the complete live-status digest at `src/cli/operations/opencode.ts:1492`, then recomputes status and applies the same health predicate at `:1791`.
  - The positive regression at `src/cli/operations/opencode.test.ts:1355` asserts `canApply: true`, successful apply, exact preservation of `preset`, `presets`, and unrelated root fields, requested root-agent changes only, and no `presets.agents`.
  - The negative matrix at `src/cli/operations/opencode.test.ts:524` covers missing, empty, null, array, incomplete managed-openai, and inherited-key preset shapes. Legacy agents, parse/unrecognized state, main/plugin blockers, and missing/outdated bundled skills retain their existing blockers.
  - Sync/install custom-preset behavior remains bounded and covered at `src/cli/operations/opencode.test.ts:576`.

## Issues Found

### Critical

- None.

### Warnings

- None.

## Constitution Suggestion

None. The governance-touched heuristic was not triggered: the change does not modify or reference the Constitution, its named principles, or `src/skills/_shared/openspec-convention.md`.

## Verdict

**pass**

All 16 proposal success criteria are compliant. Round-1 critical issue C1 is closed, and the remediation preserves the existing fail-closed boundaries.
