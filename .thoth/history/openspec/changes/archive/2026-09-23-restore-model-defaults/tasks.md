# Tasks: Restore model defaults

## MVP scope

US1: restore preview and explicit apply for writable harnesses; truthful blocked preview for Claude.

## Dependencies

T001 -> T002 -> T003 -> T004 -> T005 -> T006 -> T007 -> T008 -> T009 -> T010 -> T011. Persistence tests consume the completed defaults/plan contract; documentation consumes implemented behavior.

## Story US1

- [x] T001 [US1] Add failing shipped-default and restore-plan tests covering FR-001, FR-003, SC-001 in `src/cli/tui/operations.test.ts` | Verify: All four role sets resolve independently of installed customizations; missing metadata remains blocked.
- [x] T002 [US1] Implement shipped-default projection covering FR-001, SC-001 in `src/cli/model-defaults.ts` | Verify: Exact models, efforts, provider formats and root exclusions match canonical presets.
- [x] T003 [US1] Wire restore plans and canonical Codex fallback covering FR-001, FR-003, SC-001 in `src/cli/tui/operations.ts` | Verify: Existing builders receive defaults and real catalog metadata, including Claude blocked result.
- [x] T004 [US1] Add failing menu navigation and cancellation tests covering FR-001, FR-002, FR-003, SC-001 in `src/cli/tui/App.test.tsx` | Verify: Restore previews all roles; no writes before Apply; Back preserves draft; blocked plan cannot apply.
- [x] T005 [US1] Implement menu action and restore preview covering FR-001, FR-002, FR-003, SC-001 in `src/cli/tui/App.tsx` | Verify: All four menus expose restoration using normal preview/apply navigation.
- [x] T006 [US1] Verify Codex restoration persistence covering FR-002, SC-002 in `src/cli/operations/codex.test.ts` | Verify: All six models and efforts replace overrides while unrelated TOML fields survive.
- [x] T007 [US1] Verify OpenCode restoration persistence covering FR-002, SC-002 in `src/cli/operations/opencode.test.ts` | Verify: Seven role models/variants restore and unrelated config survives.
- [x] T008 [US1] Verify Pi restoration persistence covering FR-002, SC-002 in `src/cli/operations/pi.test.ts` | Verify: Six model/effort frontmatter fields restore with ownership guards intact.
- [x] T009 [US1] Verify Claude blocked restoration covering FR-003, SC-002 in `src/cli/operations/claude-code.test.ts` | Verify: Default preview has canApply false and cache remains untouched.
- [x] T010 [US1] Document restoration and harness limits covering FR-001, FR-002, FR-003, SC-001, SC-002 in `docs/installation.md` | Verify: Guide explains explicit replacement, preview, cancellation and Claude restriction.

## Parallel execution

- None: One root writer owns the coupled TUI/default-plan contract; persistence and documentation consume that output, and Oracle verification waits for complete evidence.

## Final verification

- [x] T011 Run simplify, checks and fresh Oracle final verification covering FR-001, FR-002, FR-003, SC-001, SC-002 in `openspec/changes/restore-model-defaults/verify-report.md` | Verify: Independent PASS records focused tests, check:ci, typecheck, build and suite evidence.

## Execution evidence

- T001-T005: Red/green default resolver, catalog blockers and menu tests; 78 TUI tests pass.
- T006-T009: Isolated native plan/apply tests pass for all four harnesses; combined focused run: 6 files, 146 tests passed.
- T010: Installation guide documents the menu, explicit effort replacement, local build and Claude restriction.
- T011: Simplify removed obsolete Codex fallback and redundant lookup; check:ci and typecheck pass. Build passed; full suite: 94 files, 1177 tests passed. Fresh independent Oracle verification PASS; see verify-report.md.
