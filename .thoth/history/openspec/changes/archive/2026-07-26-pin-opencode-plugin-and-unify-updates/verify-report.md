# Verification Report: Pin OpenCode Plugin and Unify Harness Updates

**Reviewer**: oracle<br>
**Independent from implementer**: Yes<br>
**Verdict**: PASS

## Review dimensions

- **Completeness**: PASS — FR-001 through FR-009 and SC-001 through SC-009 are implemented and exercised; all implementation and verification tasks have evidence.
- **Correctness**: PASS — Exact-version resolution, fail-closed writes, ordered three-harness completion, ledger-last semantics, non-mutating previews, truthful failures, and notification-only runtime behavior passed repository-wide validation.
- **Coherence**: PASS — Specification, plan, tasks, implementation, tests, TUI copy, public documentation, and provider/native-manager boundaries agree. The optional plan review was inspected but not treated as verification.

## Compliance matrix

| Requirement | Implementation evidence | Executed check | Result |
| --- | --- | --- | --- |
| FR-001 | Exact plugin replacement in `src/cli/config-io.ts:95-167`; OpenCode propagation in `src/cli/operations/opencode.ts:1234-1341,1899-2122`. | Config I/O and OpenCode operation suites; built CLI resolved `thoth-agents@0.3.8` with no plugin-entry `@latest`. | PASS |
| FR-002 | Package identity and SemVer validation in `src/cli/package-version.ts:31-124`; installer preflight in `src/cli/install.ts:420-529`. | Package-version 8/8 and install 18/18; built-layout exact-pin diagnostic. | PASS |
| FR-003 | Shared complete install/update builders in all harness adapters; command dispatch in `src/cli/commands.ts:512-566`; TUI dispatch in `src/cli/tui/operations.ts:238-293`. | Harness operation suites, commands 23/23, TUI operations 16/16. | PASS |
| FR-004 | Ordered native/config, managed surfaces, required skills, provider, and ledger flows in `src/cli/operations/opencode.ts:1899-2122`, `codex.ts:915-1113`, and `claude-code.ts:691-813`. | Harness suites, completion 7/7, install 18/18, provider-boundary 8/8. | PASS |
| FR-005 | Dry-run plans, `applied: false` failures, command exit mapping in `src/cli/commands.ts:512-530`, and TUI confirmation/results in `src/cli/tui/components/PlanPreview.tsx:35-57,137-167`. | Preview/apply tests across commands, TUI, and all harness adapters. | PASS |
| FR-006 | Schema-v1 ledger, strict records, sibling-temp rename, malformed backup, and independent records in `src/cli/install-ledger.ts:13-190`; record-last finalizer in `src/cli/install-completion.ts:52-116`. | Ledger 10/10, completion 7/7, install 18/18. | PASS |
| FR-007 | Official status target derives only from executing metadata and ledger in `src/cli/operations/types.ts:117-157` and is included by all harness adapters. | Harness status, commands 23/23, TUI App 48/48. | PASS |
| FR-008 | Notification-only runtime flow in `src/hooks/auto-update-checker/index.ts:70-120`; cache/config mutation and installer paths removed. | Runtime notifier 1/1, checker 8/8, full suite, static search. | PASS |
| FR-009 | CLI help in `src/cli/commands.ts:266-346`, TUI copy, README, installation guide, quick reference, and routed CLI guide. | Commands/TUI suites, Biome, full diff and forbidden-guidance search. | PASS |
| SC-001 `[buildable]` | Tests cover stable/prerelease pins, all managed entry forms, unrelated order, and no plugin-entry `@latest`. | Config I/O and OpenCode operation suites. | PASS |
| SC-002 `[buildable]` | Source/published layouts plus missing, malformed, mismatched, empty, and invalid metadata; install tests assert no mutation. | Package-version 8/8 and install 18/18. | PASS |
| SC-003 `[buildable]` | Three harness suites verify ordered install/update parity; command and TUI share operation services. | Harness, command, and TUI operation suites. | PASS |
| SC-004 `[buildable]` | Native-manager, managed setup, skill, provider, and ledger failures return incomplete results and nonzero command status. | Harness, completion, command, and install suites. | PASS |
| SC-005 `[buildable]` | Preview/dry-run spies observe zero mutations while plans contain every required stage. | Harness preview/apply and runtime mutation-spy tests. | PASS |
| SC-006 `[buildable]` | Three independent records, atomic replacement, malformed repair, ledger-last ordering, and no advancement after dry-run/failure. | Ledger 10/10 and completion 7/7. | PASS |
| SC-007 `[buildable]` | Matching, mismatched, missing, and invalid records remain independent of Codex/Claude marketplace state. | Harness status, commands, and TUI status suites. | PASS |
| SC-008 `[buildable]` | Newer release emits actionable notification with zero writes, cache deletion, or install invocation. | Runtime notifier and checker suites. | PASS |
| SC-009 `[buildable]` | CLI help, status, TUI, and public/routed docs consistently describe exact pins, ledger authority, marketplace independence, and explicit updates. | Commands/TUI suites, documentation assertions, full diff review. | PASS |

## Executed commands

| Command or check | Result |
| --- | --- |
| `pnpm run check:ci` | PASS — 237 files checked, no fixes. |
| `pnpm run typecheck` | PASS. |
| `pnpm run build` | PASS — integration sync, tsup, declarations, and schema generation completed with no new tracked/generated diff. |
| `pnpm run integration:verify` | PASS — 2 files, 12/12 tests. |
| `pnpm test` | PASS — 81 files, 939/939 tests. |
| Built CLI exact-pin assertion | PASS — built CLI resolved package metadata to `thoth-agents@0.3.8`; no plugin-entry `@latest`. |
| IDE diagnostics | PASS — no problems in package-version, ledger, completion, or three operation adapters. |
| Final diff, whitespace, generated output, and secrets review | PASS — planned source/test/docs/artifact scope only; no changed-secret indicator. |

## Findings

| ID | Severity | Dimension | Evidence | Remediation anchor |
| --- | --- | --- | --- | --- |
| W-001 | Warning | Coherence | TUI preview renders five item details and summarizes remaining items as a count in `src/cli/tui/components/PlanPreview.tsx:96-113`; the underlying plan and CLI preview enumerate every stage. | None required; retain concise TUI preview unless product requirements change. |

## Critical issues

- None.

## Residual risks

- R-001: Native manager, external skill, and provider behavior is verified through isolated/mocked seams; live manager/provider integration was intentionally not invoked.
- R-002: Ledger replacement is atomic, but previously completed native/config/skill/provider effects are not rolled back if final ledger commit fails; this matches `data-model.md` and retry is the recovery path.
- R-003: Build emitted documented nonfatal Codex enforcement-gap notices; these are existing truthful harness capability disclosures, not regressions.
