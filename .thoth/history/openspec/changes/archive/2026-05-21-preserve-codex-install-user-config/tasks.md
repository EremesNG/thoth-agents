# Tasks: Preserve Codex Install User Configuration

## Phase 1: Managed Model State Foundation
- [x] 1.1 Add the Codex managed-model tracking target — `src/cli/codex-paths.ts`
  **Verification**:
  - Run: `bun test -t "Codex install setup plan"`
  - Expected: Codex setup plans expose `~/.codex/agents/.thoth-agents-managed-models.json` as a resolved Codex target alongside the existing agents directory targets without changing non-Codex install behavior.

- [x] 1.2 Define the managed-model state schema and helpers — `src/cli/codex-install.ts`
  **Verification**:
  - Run: `bun test -t "Codex install setup plan"`
  - Expected: Tests can serialize and read `~/.codex/agents/.thoth-agents-managed-models.json` as a versioned state artifact that records only the last thoth-agents-managed `model` value per generated Codex role TOML.

## Phase 2: Model Preservation Logic
- [x] 2.1 Parse existing generated role TOML model values during Codex setup/apply — `src/cli/codex-install.ts`
  **Verification**:
  - Run: `bun test -t "Codex install setup plan"`
  - Expected: Existing `model` values are detected for `thoth-agents-{role}.toml` files and missing, malformed, or legacy files fall back safely without crashing install.

- [x] 2.2 Preserve only user-customized role `model` values — `src/cli/codex-install.ts`
  **Verification**:
  - Run: `bun test -t "preserves user-customized Codex role model"`
  - Expected: When current installed `model` differs from the tracked last managed model, reinstall keeps the installed user value while refreshing generated non-model TOML fields.

- [x] 2.3 Apply managed default/config model upgrades when ownership is still managed — `src/cli/codex-install.ts`
  **Verification**:
  - Run: `bun test -t "updates managed Codex role model"`
  - Expected: When current installed `model` equals the tracked last managed model, reinstall writes the newly rendered managed model and updates the tracking artifact.

- [x] 2.4 Handle absent legacy tracking without misclassifying obvious user edits — `src/cli/codex-install.ts`
  **Verification**:
  - Run: `bun test -t "legacy Codex role model tracking"`
  - Expected: With no tracking artifact, existing role files that still match current rendered defaults are treated as managed, while non-default existing `model` values are preserved as user-owned.

## Phase 3: Install, Dry-Run, Reset, And Managed-Field Boundaries
- [x] 3.1 Keep non-model generated TOML fields installer-managed — `src/cli/codex-install.ts`
  **Verification**:
  - Run: `bun test -t "only preserves Codex role model"`
  - Expected: User edits to generated fields such as `developer_instructions`, `model_reasoning_effort`, `sandbox_mode`, `name`, or `description` are overwritten by generated content on reinstall.

- [x] 3.2 Ensure dry-run does not write or churn managed-model state — `src/cli/codex-install.ts`
  **Verification**:
  - Run: `bun test -t "dry-run reports complete managed plan and writes nothing"`
  - Expected: Dry-run reports the managed plan but creates no role TOMLs, plugin assets, config files, backups, or `~/.codex/agents/.thoth-agents-managed-models.json`.

- [x] 3.3 Define reset behavior for role TOMLs and managed-model state — `src/cli/codex-install.ts`
  **Verification**:
  - Run: `bun test -t "reset refreshes Codex managed model state"`
  - Expected: `reset` refreshes generated role TOMLs and `~/.codex/agents/.thoth-agents-managed-models.json` consistently while preserving the proposal's managed-only, non-destructive reset semantics.

## Phase 4: Regression Coverage For Existing Codex Preservation
- [x] 4.1 Preserve AGENTS.md user content and managed block merge behavior — `src/cli/codex-install.test.ts`
  **Verification**:
  - Run: `bun test -t "apply preserves root instructions"`
  - Expected: User text outside `<!-- thoth-agents:codex-root:start -->` / `end` markers remains intact and the managed block is refreshed.

- [x] 4.2 Preserve existing backup behavior for AGENTS.md and config-like writes — `src/cli/codex-install.test.ts`, `src/cli/codex-config-io.test.ts`
  **Verification**:
  - Run: `bun test -t "backup"`
  - Expected: Existing files receive `.bak` backups before apply writes, and unchanged files avoid unnecessary backup churn.

## Phase 5: Final Verification
- [x] 5.1 Run focused Codex installer tests — `src/cli/codex-install.test.ts`
  **Verification**:
  - Run: `bun test -t "Codex install setup plan"`
  - Expected: All Codex install plan/apply tests pass, including first install, reinstall, user model customization, managed model upgrade, dry-run, reset, backup, and legacy tracking cases.

- [x] 5.2 Run repository quality checks — all changed modules
  **Verification**:
  - Run: `bun run check:ci`
  - Expected: Biome reports no formatting or lint errors.
  - Run: `bun run typecheck`
  - Expected: TypeScript completes with no errors.

- [x] 5.3 Run the full automated test suite — all tests
  **Verification**:
  - Run: `bun test`
  - Expected: The full Bun test suite passes without regressions.
