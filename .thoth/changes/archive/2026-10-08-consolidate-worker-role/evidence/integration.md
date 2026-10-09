# Worker consolidation — root integration evidence

## Intent and ownership

The user-approved contract removes Quick, renames Deep to Worker without tiered implementation routing, and ships five specialists plus the ambient orchestrator. Worker receives fresh GPT-6 Luna/max defaults in OpenCode, Codex and Pi, and sonnet/medium in Claude. No old-role customization migration, aliases, live global setup, provider calls, commits or publishing were performed.

Source implementation completed through terminal native runs `8b73c7df-bf3c-4ad4-823e-5344af72bda8` and resumed `811d3cb9-b40d-4100-a62c-3672a5927e5f`. The latter supplied retirement/race hardening and passed all non-documentation tests. Documentation-only work completed in terminal fresh run `91622cd9-dc7f-47d6-aac6-bebdbff7ab51`; root retains acceptance and final verification ownership. Installed `thoth-deep` was used without changing the live agent installation. Historical change records were not rewritten.

## Root review and corrections

- Normalized implementation-only CRLF formatting noise with Biome.
- Reviewed Codex plan/apply snapshots, path/ancestor checks and Pi deletion-time ownership/content checks.
- Added a regression reproducing replacement of an obsolete Codex role during current-role writes: initially failed because apply reported success and deleted the replacement. Added immediate role and managed-state snapshot revalidation before each deletion. The regression and all 24 Codex install tests then passed, preserving the replacement and reporting already-completed writes.
- Fixed a stale expected-list ordering in `scripts/verify-pi-package.mjs`: its inventory input is sorted, so Worker must appear after Oracle in the expected list. Native packed verification then passed with exactly five specialists.
- Updated root AGENTS.md roster and implementation owner wording; the documentation slice aligned active public docs, routing cases and current specs. Historical measured Quick/Deep context entries remain labeled historical.

## Observed checks

- `pnpm run check:ci`: pass, 289 files, no fixes needed.
- `pnpm run typecheck`: pass.
- `pnpm run build`: pass; see `build.log`.
- `pnpm run integration:verify`: pass, 12 tests.
- `env -u CODEX_HOME pnpm exec vitest run src/cli/codex-install.test.ts`: pass, 24 tests.
- Default-width available suite: 1003 passed, one built-Pi-runtime test exceeded its existing 5-second timeout under load (see `tests.log`).
- Isolated runtime rerun: 7/7 passed in 1.58 seconds total.
- `env -u CODEX_HOME pnpm exec vitest run --exclude src/harness/publish-marketplace.test.ts --maxWorkers=2`: pass, 1004/1004 tests across 98 files (see `tests-bounded.log`). No timeout limits or product semantics were weakened.
- `pnpm run verify:pi-package`: pass, real isolated native Pi load, exactly five specialists, five skills, no orchestrator child, one session-start observation (see `pi-package.log`). The package remains version 0.4.2 as inherited from baseline; version bump was not requested.
- `git diff --check`: pass.

## Oracle repair and final regression gates

Fresh Oracle round 1 rejected four concrete gaps (see `oracle-round-1.md`). Source continuation `1027ec7e-6432-4dfe-a840-2f2e8e21cb5a` added lstat-based presence/ancestor checks, exact fingerprint-bound interrupted-install recovery, complexity-neutral Worker scope, and JSON-schema-serializable forbidden role-key constraints. Root's next full suite exposed six integration regressions, recorded in `tests-round-2.log`: transient recovery-journal absence wrongly made Codex status missing, and broader Worker wording lost explicit correctness routing. Continuation `dc243ae3-ec6f-4efc-82c1-c865b82cc79f` fixed both public integration boundaries without restoring tiers.

Root subsequently reran `pnpm run build` successfully (`build-final.log`), `pnpm run verify:pi-package` successfully with five specialists/five skills/one session start (`pi-package-final.log`), and the entire available suite with CODEX_HOME unset and `--maxWorkers=2`: **1016/1016 tests across 98 files passed** (`tests-final.log`). Writer also supplied terminal Biome 289-file and TypeScript success. No writer remains active; a new independent Oracle will assess the repaired state.

## Final acceptance

Round 2 Oracle found two remaining during-apply symlink replacement windows. Root repaired them with immediate path and snapshot checks before each managed write and ledger path revalidation before each obsolete deletion. Three public regression cases were red before the fix and green afterward; details are in `oracle-round-2.md`. Final available suite: **1019/1019 across 98 files**, plus successful build and real packed Pi verification. Biome (289 files, no warnings), TypeScript, Codex install 34/34 and diff-check passed after the last test-only cleanup.

Fresh final Oracle run `be792259-f59d-4b63-848d-cf93a1ec8dc9` returned **PASS** for all four acceptance criteria, independently executing 125 tests across 11 files and checking published-schema constraints. Root accepts the implementation and active-documentation outputs against the approved intent; see `oracle-final.md`. No staged files, commit, live global install, provider call or push was performed.

## Limits

The four external marketplace-fixture tests remain excluded because the sibling thoth-plugins fixture is unavailable; inherited CODEX_HOME was unset for tests. No live provider execution or global installation was attempted. Fresh Oracle PASS is recorded; fingerprint-bound acceptance is recorded in work.yaml. Filesystem guards remain non-atomic and do not claim a transactional filesystem guarantee. Documentation baseline remains honestly recorded as unknown rather than fabricated retrospectively; source baseline was captured before dispatch.
