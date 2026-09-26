# Verification Report: Preserve Codex Install User Configuration

## Completeness

The accelerated SDD implementation is complete against the proposal and the
task checklist. The OpenSpec structure is initialized, the proposal and tasks
artifacts were recovered from canonical OpenSpec paths, and all tasks are marked
complete in `tasks.md`.

Implementation evidence:
- `src/cli/codex-paths.ts` exposes
  `~/.codex/agents/.thoth-agents-managed-models.json` through
  `managedModelsPath`.
- `src/cli/codex-install.ts` defines versioned managed-model state as
  `{ version: 1, models }`, reads malformed or absent state safely, and writes
  a stable JSON state plan item.
- `src/cli/codex-install.ts` preserves only role TOML `model` values that are
  user-owned, while regenerating all other TOML fields from adapter output.
- `applyCodexSetup` returns before filesystem mutation in dry-run mode.
- Reset mode refreshes generated role TOMLs and managed-model state.
- Existing AGENTS managed-block merge and backup behavior remains covered.

## Build and Test Evidence

- `bun test -t "Codex install setup plan"`: passed, 11 tests.
- `bun test -t "preserves user-customized Codex role model"`: passed.
- `bun test -t "updates managed Codex role model"`: passed.
- `bun test -t "legacy Codex role model tracking"`: passed.
- `bun test -t "only preserves Codex role model"`: passed.
- `bun test -t "dry-run reports complete managed plan and writes nothing"`:
  passed.
- `bun test -t "reset refreshes Codex managed model state"`: passed.
- `bun test -t "apply preserves root instructions"`: passed.
- `bun test -t "backup"`: passed, 2 tests.
- `bun run check:ci`: passed, Biome checked 175 files with no fixes applied.
- `bun run typecheck`: passed, `tsc --noEmit` completed.
- `bun test`: passed, 554 tests, 0 failures, 2197 expectations.

## Compliance Matrix

| Proposal success criterion | Evidence | Status |
| --- | --- | --- |
| Re-running `install --agent=codex` preserves `~/.codex/AGENTS.md` user content outside managed markers and keeps backup semantics intact. | `mergeManagedBlock` still merges only the managed marker block; `writeTextWithBackup` backs up changed existing files. Focused tests `apply preserves root instructions` and `backup` passed. | Compliant |
| User-edited subagent `model` values survive reinstall/update when they differ from the last tracked managed value. | `resolveRoleTomlContent` compares current, rendered, and tracked model values and replaces only the generated model line when user-owned. Focused test `preserves user-customized Codex role model` passed. | Compliant |
| thoth-agents default model changes are applied when the prior installed value was still managed. | `resolveRoleTomlContent` writes the rendered model and updates next state when current equals tracked. Focused test `updates managed Codex role model` passed. | Compliant |
| Only `model` receives user-vs-managed preservation logic; other generated subagent TOML fields remain installer-managed. | The implementation regenerates full role TOML content and conditionally replaces only the `model` line. Focused test `only preserves Codex role model` passed. | Compliant |
| Tests verify the expected install, update, dry-run, reset, backup, and legacy tracking cases. | Focused tests cover first/repeated setup, user model customization, managed update, legacy absent tracking, dry-run no-write behavior, reset refresh, AGENTS preservation, and backups. Full suite passed. | Compliant |

## Issues Found

No blocking implementation issues found.

Warnings:
- The project instruction asks to use `webstorm-index` and `mcp-steroid` MCP
  tools for navigation, but those tools were not exposed in this Codex runtime.
  Verification used available filesystem search/read tools instead.

## Verdict

Pass. The implementation satisfies all accelerated proposal success criteria and
all required focused and repository-wide checks passed.
