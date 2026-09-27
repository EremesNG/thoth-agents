# Windows managed-write verification

## Diagnosis

User setup:pi:local log shows successful build and seven package steps followed by EPERM from settings.json temporary-file rename. Current implementation used a single rename attempt. Live file inspection (no writes) found normal Archive attributes, owner full-control ACL and successful r+ open. This does not identify which process held the file at failure time.

Root reproduced Windows EPERM in a disposable directory by holding a .NET FileStream with FileShare.ReadWrite (not Delete): rename failed with EPERM and preserved the original; after release the same rename succeeded. This proves a relevant Windows failure mechanism, not the identity of the user's lock holder.

## TDD and implementation

Public seam: writePiManagedText, as approved in the direct implementation plan. Initial transient-lock test failed with EPERM before code change, then passed. Implementation retries only Windows EPERM/EACCES/EBUSY, at most 11 attempts with 100ms waits (approximately one second of retry waits). Every attempt revalidates safe paths and the original target snapshot. No unlink/truncation fallback; original backup preserved and temporary data cleaned. Persistent errors name the path/code and suggest closing holding applications, checking permissions and retrying setup.

Focused simplification retained existing helpers and backup flow, adding only one bounded loop around replacement. No shared updater or new dependency was introduced.

## Checks executed by root

- pnpm exec vitest run src/cli/pi-managed-write.test.ts src/cli/pi-install.test.ts src/cli/pi-resources.test.ts: 45 tests passed.
- Native disposable Windows probe via pnpm exec tsx .thoth/changes/pi-windows-managed-write/evidence/native-lock-probe.mjs: real lock released after 400ms, replacement succeeded in 438ms; lock held 1800ms, bounded failure after 1097ms preserved original and removed temporary data.
- pnpm run check:ci: passed without warnings after removal of a test non-null assertion.
- pnpm run typecheck: passed.
- pnpm run build: passed.
- env -u CODEX_HOME pnpm test: 987 passed in 97 files. CODEX_HOME excluded for previously identified unrelated Codex fixture path assumptions.
- git diff --check: passed (Git reports only CRLF normalization warnings on regenerated but content-unchanged plugin skills).

Current committed tests cover transient lock release, persistent EPERM/EACCES/EBUSY, concurrent content edit, unsafe non-file target on retry, fail-fast non-Windows/other codes and identical-content no-op. No claim of identifying the live locking process or successful rerun of the user's global installation. No global settings, permissions or processes were mutated.
