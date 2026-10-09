# Final Oracle review — round 2

Fresh native reviewer run: `1c3e8cc4-d1a4-40e7-a72f-9cb294498ac2`. Verdict: **REJECT**.

- P1: Recovery-journal and role write targets were only checked before the initial mutation. An earlier write could replace a pending target with a dangling symlink; writeTextWithBackup would then follow it outside the managed directory.
- P1: Retirement checked ownership-ledger bytes but not its path safety immediately before deletion. A replacement symlink pointing to identical bytes permitted deletion before later failure.

Oracle independently reproduced both using in-memory execution of actual transpiled apply code, passed 135 focused tests in 11 files and diff-check, and accepted roster/defaults/published schema. Resources remained rejected. Filesystem checks remain non-atomic; no atomic transaction guarantee is claimed.

## Root same-intent repair

Added parameterized public apply tests replacing journal, Worker or ledger targets during an earlier write via a spy on the existing IO boundary. All three tests reproduced failure before the patch (outside write / obsolete deletion / false success). Immediate safety and captured-snapshot checks now precede every journal, role and ledger write, and the ownership ledger is path-checked immediately before every obsolete deletion. No new writer or product decision was needed.

After repair: Codex install + operations 47/47; complete available suite 1019/1019 in 98 files; build and real packed Pi verification passed (five specialists). Removed a test-only non-null assertion and reran Codex 34/34, Biome 289 files without warnings, tsc and diff check. New fresh final verification remains pending.
