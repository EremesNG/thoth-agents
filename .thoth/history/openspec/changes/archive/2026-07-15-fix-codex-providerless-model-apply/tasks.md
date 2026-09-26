# Tasks: Fix Codex Providerless Model Apply

## Scope Guard

This accelerated checklist is limited to the Codex model planning/application boundary and its focused regressions. Do not modify shared catalog normalization, OpenCode model serialization, Claude flows, or unrelated Codex install/sync/plugin behavior. Production code and tests are intentionally unchanged by this planning phase.

## Phase 1: Focused Regression Coverage First (Red Before Implementation)

- [x] 1.1 Add Codex planning regressions for model-only and model-plus-effort inputs — `src/cli/operations/codex.test.ts`
  **Verification**:
  - Run: `pnpm test -- src/cli/operations/codex.test.ts`
  - Expected: The command initially exits nonzero because the new providerless assertions fail on the precise `openai/<model>` preview mismatch in both model-only and model-plus-effort cases; existing effort-validation and unrelated Codex assertions remain passing. After the Phase 2 planning fix, this same command must exit 0.

- [x] 1.2 Add Codex persistence regressions for role TOML and managed state — `src/cli/codex-install.test.ts`
  **Verification**:
  - Run: `pnpm test -- src/cli/codex-install.test.ts`
  - Expected: The command initially exits nonzero only for the new providerless persistence assertions because the current implementation writes the prefixed model; existing backup, explicit-effort, inherit, and user-owned-TOML assertions remain healthy. After the Phase 2 persistence fix, this same command must exit 0.

- [x] 1.3 Resolve and encode managed-state ownership semantics before changing state writes — `src/cli/codex-install.ts`, `src/cli/codex-install.test.ts`
  **Verification**:
  - Run: `pnpm test -- src/cli/codex-install.test.ts -t "updates managed Codex role model|preserves user-customized Codex role model|model-only Codex override"`
  - Expected: The regression contract explicitly preserves `models` as the rendered managed baseline and `configuredModels` as the applied override, requires providerless Codex IDs in either map when they hold Codex model values, keeps the maps distinct, and leaves user-owned-model tracking behavior unchanged; before implementation, only the newly added providerless expectations may fail.

## Phase 2: Codex-Only Normalization and Application (Turn Red Green)

- [x] 2.1 Normalize the outbound Codex model at the planning boundary without changing catalog identity — `src/cli/operations/codex.ts`, `src/cli/model-catalog/models-dev.ts`
  **Verification**:
  - Run: `pnpm test -- src/cli/operations/codex.test.ts src/cli/tui/model-catalog.test.ts`
  - Expected: Exit code 0; the formerly red planning regressions now pass with providerless Codex previews and override inputs, while catalog IDs remain `openai/<model>` for exact effort lookup and catalog/effort tests pass.

- [x] 2.2 Apply providerless Codex values to role TOML and managed-state writes while preserving the resolved map semantics — `src/cli/codex-install.ts`
  **Verification**:
  - Run: `pnpm test -- src/cli/codex-install.test.ts src/cli/operations/codex.test.ts`
  - Expected: Exit code 0; the formerly red persistence regressions pass, role TOML and both applicable managed-state maps contain bare Codex model IDs, `models` remains the rendered baseline, `configuredModels` remains the applied override, explicit effort and inherit behavior remain correct, user-owned fields are preserved, and managed `.bak` files remain.

- [x] 2.3 Keep the TUI provider-forwarding contract metadata-only for Codex effort selection — `src/cli/tui/App.tsx`, `src/cli/tui/operations.ts`
  **Verification**:
  - Run: `pnpm test -- src/cli/tui/operations.test.ts src/cli/tui/model-catalog.test.ts src/cli/operations/codex.test.ts`
  - Expected: Exit code 0; TUI model selections with and without effort metadata produce equivalent providerless Codex runtime model inputs, while OpenCode provider-qualified behavior remains represented by its existing operation tests.

## Phase 3: Cross-Harness and Repository Verification

- [x] 3.1 Verify OpenCode provider-qualified behavior and the complete focused Codex regression set — `src/cli/operations/opencode.test.ts`, `src/cli/operations/codex.test.ts`, `src/cli/codex-install.test.ts`, `src/cli/tui/operations.test.ts`
  **Verification**:
  - Run: `pnpm test -- src/cli/operations/codex.test.ts src/cli/codex-install.test.ts src/cli/operations/opencode.test.ts src/cli/tui/operations.test.ts`
  - Expected: Exit code 0; all formerly failing Codex regression files pass, Codex outputs and persisted values are providerless, and OpenCode provider-qualified output is unchanged.

- [x] 3.2 Run type safety after the focused implementation — `package.json`
  **Verification**:
  - Run: `pnpm run typecheck`
  - Expected: TypeScript completes with exit code 0 and reports no type errors.

- [x] 3.3 Run repository lint after the focused implementation — `package.json`
  **Verification**:
  - Run: `pnpm run lint`
  - Expected: Biome completes with exit code 0 and reports no lint violations.

- [x] 3.4 Build the package only after focused tests, typecheck, and lint pass — `package.json`
  **Verification**:
  - Run: `pnpm run build`
  - Expected: tsup, declaration generation, and schema generation complete successfully and produce the normal `dist`/schema build artifacts without modifying the scoped behavior.
