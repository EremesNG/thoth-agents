# Tasks: Repair OpenCode Drift During Trusted Apply

## Phase 1: Focused Regression Baseline

- [x] 1.1 Add failing OpenCode status fixtures for a parseable top-level `preset: "agents"` config, missing bundled thoth-agents skills, and missing recommended global skills in `src/cli/operations/opencode.test.ts`.
  **[USN-1]** | Priority: P1
  **Spec:** `proposal/Repairable managed roster drift`
  **Independent Test:** Run the new status cases against the current implementation; they must expose the roster blocker, bundled-skill blocker, and non-blocking recommended-skill diagnostic before implementation changes.
  **Verification**:
  - Run: `pnpm exec vitest run src/cli/operations/opencode.test.ts`
  - Expected: The new status assertions execute and fail only on the missing health/classification behavior (red baseline).

- [x] 1.2 Add failing plan/apply safety fixtures for `sync` and `install` repair eligibility, `model-config` health gating, dry-run no-write behavior, and rejection of unknown, malformed, unmanaged, or fabricated drift items in `src/cli/operations/opencode.test.ts`.
  **[USN-2]** | Priority: P1
  **Spec:** `proposal/Action-aware apply safety`
  **Independent Test:** Construct plans directly and assert `canApply`, rejection diagnostics, and unchanged fixture files without relying on live user paths.
  **Verification**:
  - Run: `pnpm exec vitest run src/cli/operations/opencode.test.ts`
  - Expected: The safety cases fail before implementation because drift is globally rejected and model-config can ignore incomplete managed health.

- [x] 1.3 Add failing repair lifecycle fixtures covering managed backup creation, preservation of unrelated parseable main-config fields, current `openai` seven-agent output, bundled-skill refresh for both sync/install, partial skill failure reporting, and healthy post-repair model-plan eligibility in `src/cli/operations/opencode.test.ts`.
  **[USN-3]** | Priority: P1
  **Spec:** `proposal/Bundled skill health and repair`
  **Independent Test:** Execute each repair against isolated temporary config/skill roots and inspect changed targets, backup paths, and follow-up status.
  **Verification**:
  - Run: `pnpm exec vitest run src/cli/operations/opencode.test.ts`
  - Expected: Lifecycle assertions fail at the current implementation (sync does not refresh bundled skills and health remains inconsistent).

## Phase 2: Managed Health and Trusted Apply

- [x] 2.1 Implement one managed-health classification path in `src/cli/operations/opencode.ts` (and `src/cli/operations/types.ts` only if required) that distinguishes healthy, repairable managed drift, missing managed surfaces, and unsafe/unknown state; emit explicit roster, plugin, bundled-skill, parse, and ownership diagnostics while retaining recommended global skills as minor/non-blocking.
  **[USN-1]** | Priority: P1
  **Spec:** `proposal/Repairable managed roster drift`
  **Independent Test:** Re-run the isolated status fixtures and compare state, diagnostic code/message, target state, and observed preset/role values without invoking apply.
  **Verification**:
  - Run: `pnpm exec vitest run src/cli/operations/opencode.test.ts`
  - Expected: Legacy `agents` preset and missing bundled skills are classified with blocking diagnostics; optional global skill absence remains minor.

- [x] 2.2 Make plan and apply validation action-aware in `src/cli/operations/opencode.ts`: allow only positively attributed managed roster/plugin/skill drift for `sync` and `install`, keep `model-config` blocked until managed health is complete, and continue fail-closed rejection for unknown, malformed, unrecognized, unmanaged, or fabricated items.
  **[USN-2]** | Priority: P1
  **Spec:** `proposal/Action-aware apply safety`
  **Independent Test:** Apply the safety fixture matrix and assert that only allowlisted managed repair plans cross validation; rejected results contain the concrete blocker code/message and target observation.
  **Verification**:
  - Run: `pnpm exec vitest run src/cli/operations/opencode.test.ts`
  - Expected: Trusted sync/install plans are apply-eligible for known drift; model-config and unsafe states remain rejected without writes.

- [x] 2.3 Extend trusted sync/install execution in `src/cli/operations/opencode.ts` to refresh bundled thoth-agents skills for both actions, preserve unrelated parseable main-config fields, write the current `openai` seven-agent roster, create managed `.bak` files before replacing existing configs, and report partial skill failures without claiming health.
  **[USN-3]** | Priority: P1
  **Spec:** `proposal/Bundled skill health and repair`
  **Independent Test:** Run sync and install against temporary fixtures, then inspect backup files, preserved fields, generated roster, skill files, changed targets, and failure status.
  **Verification**:
  - Run: `pnpm exec vitest run src/cli/operations/opencode.test.ts`
  - Expected: Both actions repair managed surfaces with backups; a simulated skill failure returns a precise unsuccessful result and leaves status unhealthy.

- [x] 2.4 Propagate structured blocker diagnostics through operation plans/results in `src/cli/operations/opencode.ts` and `src/cli/operations/types.ts` as needed, then update the existing plain/TUI presenters only where evidence shows detail loss: `src/cli/commands.ts`, `src/cli/commands.test.ts`, `src/cli/tui/components/StatusView.tsx`, and `src/cli/tui/components/PlanPreview.tsx`. Whenever `StatusView.tsx` or `PlanPreview.tsx` changes, add or update `src/cli/tui/App.test.tsx` to assert rendered diagnostic codes, messages, and target observations.
  **[USN-4]** | Priority: P2
  **Spec:** `proposal/Actionable blocker propagation`
  **Independent Test:** Format a blocked model plan/apply result containing multiple diagnostic codes and target observations and verify each code, message, and affected observation is visible in the consumer output.
  **Verification**:
  - Run: `pnpm exec vitest run src/cli/commands.test.ts`
  - Expected: Formatter tests pass with blocker codes and observed values rendered; no presenter redesign or unrelated harness changes are introduced.
  - Run: `pnpm exec vitest run src/cli/tui/App.test.tsx` (whenever `StatusView.tsx` or `PlanPreview.tsx` changes)
  - Expected: Rendered TUI diagnostics assert each blocker code, message, and target observation.

- [x] 2.5 Isolate native OpenCode model discovery from external plugin startup so a model preview cannot mutate managed skills; invoke the supported plugin-free catalog mode and retain user-configured provider/model discovery where OpenCode exposes it without external plugins.
  **[USN-2] [USN-6]** | Priority: P1
  **Spec:** `proposal/Action-aware apply safety`, `proposal/Live repair verification`
  **Independent Test:** Mock the OpenCode child invocation and prove the `models` command is launched in external-plugin-free mode; run an isolated fake-child regression that would write a marker unless isolation is present.
  **Verification**:
  - Run: `pnpm exec vitest run src/cli/tui/model-catalog.test.ts src/cli/commands.test.ts`
  - Expected: Model discovery preserves catalog parsing while never launching external plugins during preview.

## Phase 3: Automated Verification

- [x] 3.1 Run the focused OpenCode operation regression suite after implementation.
  **[USN-5]** | Priority: P1
  **Spec:** `proposal/Focused OpenCode operation coverage`
  **Independent Test:** Execute only the operation test file and inspect status, preview, apply, backup, failure, and post-repair assertions.
  **Verification**:
  - Run: `pnpm exec vitest run src/cli/operations/opencode.test.ts`
  - Expected: All focused OpenCode operation tests pass.

- [x] 3.2 Run presenter/command tests when task 2.4 changes a presenter or formatter; whenever `StatusView.tsx` or `PlanPreview.tsx` changes, add or update `src/cli/tui/App.test.tsx` and run its focused test.
  **[USN-4]** | Priority: P2
  **Spec:** `proposal/Actionable blocker propagation`
  **Independent Test:** Execute the command test file independently of live OpenCode state.
  **Verification**:
  - Run: `pnpm exec vitest run src/cli/commands.test.ts`
  - Expected: All command formatter and dispatch tests pass, including diagnostic-code and target-observation assertions; if no presenter code changed, record the skipped run with evidence in the apply report.
  - Run: `pnpm exec vitest run src/cli/tui/App.test.tsx` (whenever `StatusView.tsx` or `PlanPreview.tsx` changes)
  - Expected: All TUI presenter tests pass, asserting rendered diagnostic codes, messages, and target observations.

- [x] 3.3 Validate repository type safety, lint, and production build before any live mutation.
  **[USN-5]** | Priority: P1
  **Spec:** `proposal/Focused OpenCode operation coverage`
  **Independent Test:** Run each authoritative package script independently and require a clean exit.
  **Verification**:
  - Run: `pnpm run typecheck`
  - Expected: TypeScript completes with no errors.
  - Run: `pnpm run lint`
  - Expected: Biome reports no lint violations.
  - Run: `pnpm run build`
  - Expected: tsup, declaration generation, and schema generation complete successfully.

## Phase 4: Conditional Live Managed Repair (Historical and Deferred)

> Tasks 4.1 and 4.2 preserve completed live preview/apply history. The user-approved extension is code-only: no cache, config, skill, provider, or model mutation is authorized, and current read-only evidence remains version `0.2.2` with 12 bundled skills.

- [x] 4.1 Capture the current local OpenCode managed status and dry-run sync preview, including blocker codes, target observations, expected backup destinations, and the exact `openai` roster/skill repair plan.
  **[USN-6]** | Priority: P1
  **Spec:** `proposal/Live repair verification`
  **Independent Test:** Review command output only; no files may change during this task.
  **Verification**:
  - Run: `pnpm exec tsx src/cli/index.ts status --harness=opencode`
  - Expected: Pre-repair status records the known drift/skill blockers and affected observations.
  - Run: `pnpm exec tsx src/cli/index.ts sync --harness=opencode`
  - Expected: A dry-run plan is printed with `Dry run: yes`, `Can apply: yes` for allowlisted managed drift, and managed backup paths; no writes occur.

- [x] 4.2 Apply the reviewed local sync repair through the normal CLI apply path and record every changed target and backup path.
  **[USN-6]** | Priority: P1
  **Spec:** `proposal/Live repair verification`
  **Independent Test:** Confirm the command reports `Applied: yes`, changed managed config/skill targets, and retained `.bak` files before proceeding.
  **Verification**:
  - Run: `pnpm exec tsx src/cli/index.ts sync --harness=opencode --apply`
  - Expected: The command succeeds, reports changed managed surfaces and backup paths, and does not claim success if bundled skill refresh fails.

- [-] 4.3 Recover the stale OpenCode package/cache and skill state — skipped: the user approved code-only scope; current read-only evidence remains cache/package/manifest version `0.2.2` with 12 bundled skills, so no recovery is authorized or claimed.
  **[USN-6]** | Priority: P1
  **Spec:** `proposal/Deferred live recovery`
  **Independent Test:** Inspect this task and the proposal to confirm the former recovery scripts are absent and the unresolved `0.2.2`/12-skill state remains explicit.
  **Verification**:
  - Run: `git diff --check -- openspec/changes/repair-opencode-drift-apply/tasks.md`
  - Expected: The plan is whitespace-clean, records task 4.3 as skipped for code-only scope, and contains no active live recovery command or recovery-completion claim.

- [-] 4.4 Verify post-recovery live status and model-plan eligibility — skipped: the user approved code-only scope and no recovery occurred; current read-only evidence remains version `0.2.2` with 12 bundled skills, so post-recovery verification would be misleading.
  **[USN-6]** | Priority: P1
  **Spec:** `proposal/Deferred live recovery`
  **Independent Test:** Confirm no later task depends on a healthy/recovered live OpenCode state and that isolated code verification does not mutate live paths.
  **Verification**:
  - Run: `git diff --check -- openspec/changes/repair-opencode-drift-apply/tasks.md`
  - Expected: The plan is whitespace-clean, records task 4.4 as skipped, and retains live recovery/post-recovery verification as separately authorized follow-up work.

## Phase 5: Active Preset Resolution and Preservation

- [x] 5.1 Add focused regression tests in `src/cli/tui/operations.test.ts` and `src/cli/operations/opencode.test.ts` for the active-preset contract: a custom selected preset must beat conflicting `presets.openai` values; root `agents` must override model and variant field by field while untouched fields inherit from the active preset; absent or missing top-level presets must use only root overrides and existing role defaults with no silent `openai` fallback; and model apply must preserve the top-level `preset` plus the complete named `presets` map while updating only requested root `agents` entries and never creating `presets.agents`.
  **[USN-7]** | Priority: P1
  **Spec:** `proposal/Active-preset inheritance and model-apply preservation`
  **Independent Test:** Run both focused files before implementation. The new TUI custom/absent/missing-preset cases must provide the red baseline against the current hard-coded `presets.openai`; the apply-preservation regression may already pass and must lock that existing behavior without forcing an unnecessary source edit.
  **Verification**:
  - Run: `pnpm exec vitest run src/cli/tui/operations.test.ts src/cli/operations/opencode.test.ts`
  - Expected: Before task 5.2, failures are limited to the new TUI active-preset/no-fallback assertions; the model-apply preservation assertion executes and may already pass.

- [x] 5.2 Implement active-preset-aware role resolution only in `src/cli/tui/operations.ts`: read a base role layer from `presets[config.preset]` only when the top-level preset is a string naming an object entry, overlay root `agents` per `model`/`variant` field, and otherwise fall through to existing role defaults without consulting `presets.openai`. Do not edit `src/cli/operations/opencode.ts` unless task 5.1 proves the preservation contract is actually broken there; if that unexpected source expansion is required, stop and surface the bounded evidence before proceeding.
  **[USN-7]** | Priority: P1
  **Spec:** `proposal/Active-preset inheritance and root override precedence`
  **Independent Test:** Exercise the focused TUI fixtures with conflicting custom/openai/root values and confirm each field comes from the selected preset, explicit root override, or default as specified.
  **Verification**:
  - Run: `pnpm exec vitest run src/cli/tui/operations.test.ts src/cli/operations/opencode.test.ts`
  - Expected: All active-preset, no-fallback, field-precedence, and model-apply preservation tests pass without changing sync/install, provider, effort, model discovery, or live state.

## Phase 6: Current Code-only Verification

- [x] 6.1 Run the focused active-preset and OpenCode model-apply regression suite after task 5.2.
  **[USN-7]** | Priority: P1
  **Spec:** `proposal/Focused active-preset verification`
  **Independent Test:** Execute only the two modified test files against temporary/mocked configuration and inspect custom inheritance, absent/missing handling, field precedence, and full preset preservation.
  **Verification**:
  - Run: `pnpm exec vitest run src/cli/tui/operations.test.ts src/cli/operations/opencode.test.ts`
  - Expected: Both focused files pass completely and perform no live OpenCode cache/config/skill/provider/model mutation.

- [x] 6.2 Run fresh repository-wide tests and authoritative static/build gates for the code-only extension; keep Phase 3 results as historical evidence rather than treating them as current verification.
  **[USN-7]** | Priority: P1
  **Spec:** `proposal/Code-only preset verification`
  **Independent Test:** Run each command independently after focused tests pass and require every command to exit cleanly without invoking OpenCode.
  **Verification**:
  - Run: `pnpm test`
  - Expected: The complete Vitest suite passes, including the new active-preset and preservation regressions.
  - Run: `pnpm run typecheck`
  - Expected: TypeScript completes with no errors.
  - Run: `pnpm run lint`
  - Expected: Biome reports no lint violations.
  - Run: `pnpm run build`
  - Expected: tsup, declaration generation, and schema generation complete successfully.
  - Run: `git diff --check`
  - Expected: All repository changes are free of whitespace errors.

## Phase 7: Round 1 Critical Remediation

- [x] 7.1 Add a focused RED regression in `src/cli/operations/opencode.test.ts` for verify issue C1: a parseable config whose non-empty top-level `preset` names an existing object entry must produce an apply-eligible `model-config` plan, preserve the selected preset and complete named-preset map during apply, update only requested root `agents`, and create no `presets.agents`; missing named presets, legacy `preset: "agents"`, parse/shape failures, and managed-skill blockers must remain rejected.
  **[USN-7]** | Priority: P1
  **Spec:** `proposal/Active-preset inheritance and model-apply preservation`
  **Independent Test:** Change the preservation fixture to select `custom`, assert the pre-apply plan is eligible, and add bounded negative assertions for a missing selected entry and the legacy agents layout before implementation.
  **Verification**:
  - Run: `pnpm exec vitest run src/cli/operations/opencode.test.ts src/cli/tui/operations.test.ts`
  - Expected: Before task 7.2, only the new valid-custom model-plan eligibility/apply assertion fails; all negative safety assertions continue to pass.

- [x] 7.2 Implement the C1 remediation in `src/cli/operations/opencode.ts` with action-specific health semantics: positively identify only a selected named preset whose key resolves to a non-null, non-array object; distinguish that state from generic roster drift; allow `model-config` to ignore only that explicit diagnostic while retaining every other blocker; and preserve existing sync/install repair eligibility without broadening ownership of missing, legacy, malformed, unknown, or unrecognized shapes.
  **[USN-7]** | Priority: P1
  **Spec:** `proposal/Active-preset inheritance and model-apply preservation`
  **Independent Test:** Exercise valid custom, missing-entry, legacy-agents, malformed/unrecognized, and missing-bundled-skill fixtures and assert the action-specific `canApply` matrix plus unchanged apply preservation.
  **Verification**:
  - Run: `pnpm exec vitest run src/cli/operations/opencode.test.ts src/cli/tui/operations.test.ts`
  - Expected: Valid selected custom presets are model-apply eligible and preserved; all unsafe or incomplete states remain blocked, and sync/install semantics remain unchanged.

- [x] 7.3 Run fresh focused and repository-wide verification after the C1 remediation before dispatching formal SDD verification `round 2`.
  **[USN-7]** | Priority: P1
  **Spec:** `proposal/Code-only preset verification`
  **Independent Test:** Run each command independently after task 7.2 and require clean exits with no OpenCode/live-state invocation.
  **Verification**:
  - Run: `pnpm exec vitest run src/cli/operations/opencode.test.ts src/cli/tui/operations.test.ts`
  - Expected: Both focused files pass, including the C1 positive and negative matrix.
  - Run: `pnpm test`
  - Expected: The complete Vitest suite passes.
  - Run: `pnpm run typecheck`
  - Expected: TypeScript completes with no errors.
  - Run: `pnpm run lint`
  - Expected: Biome reports no lint violations.
  - Run: `pnpm run build`
  - Expected: tsup, declaration generation, and schema generation complete successfully.
  - Run: `git diff --check`
  - Expected: All repository changes are free of whitespace errors.

## Validation Gaps

| Target | Checks performed | Impact / task disposition | Next action |
| --- | --- | --- | --- |
| TUI component test coverage for `src/cli/tui/components/StatusView.tsx` and `src/cli/tui/components/PlanPreview.tsx` | Indexed and read both presenters; `src/cli/tui/App.test.tsx` exists as the executable TUI test target. Existing code drops warning codes and some config/skill observations. | Whenever either presenter changes, task 2.4 must add or update `src/cli/tui/App.test.tsx`; task 3.2 must run it and assert rendered diagnostic codes, messages, and target observations. | During task 2.4, update the TUI test for each changed presenter and run `pnpm exec vitest run src/cli/tui/App.test.tsx`; document the assertions in the apply/verify report. |
| Deferred live OpenCode recovery and post-recovery evidence | Current read-only evidence remains cache/package/manifest version `0.2.2` with 12 bundled skills; the user approved code-only source/test work and no live recovery command was run. | Tasks 4.3 and 4.4 are explicitly skipped and are not dependencies of Phases 5-6; isolated test success must not be reported as live recovery. | Obtain separate user authorization and create a refreshed bounded recovery/verification plan before any future cache, config, skill, provider, or model mutation. |
