---
name: thoth-archive
description: Close independently verified Thoth work by applying explicit reviewed durable updates and preserving the change in a dated archive.
license: MIT
compatibility: Requires Node.js >=22.19 and the installed sibling thoth-work skill.
metadata:
  author: thoth-agents
  version: "2.0"
---

# Thoth Archive

Root closes a persisted change only after native writers have terminated, each
unit and acceptance criterion has fresh accepted evidence, and a fresh read-only
Oracle has returned PASS against the actual agreement, diff and checks. A
structural validation result is not independent approval. Existing execution
authorization includes routine closeout within the agreed scope.

1. Record unit/acceptance results and independent verification in `work.yaml`.
   Record definition and evidence fingerprints, relevant input/output digests,
   and the agreement/technical fingerprints covered by final verification.
2. Review `durableUpdates`: explicit capability additions, replacements, removals
   or renames under `.thoth/specs/<capability>/spec.md`. For replacements preserve
   unaffected requirements. Verify sources and raw-byte SHA-256 digests.
3. Run the installed sibling `thoth-work/scripts/work.mjs` validator through
   `closeout`. Fix stale or incomplete evidence; do not weaken acceptance.
4. Resolve `<skill-dir>` to this installed skill's directory and run:

```text
node "<skill-dir>/scripts/archive.mjs" --project <repository-root> --change .thoth/changes/<id> --date YYYY-MM-DD --json
```

Return the archive path and durable files updated. No separate archive report
is required. The complete change directory moves to
`.thoth/changes/archive/<date>-<id>/`. Historical references retain their original
repository-relative basis; map the original change root to this archive when
inspecting old evidence. Active resume operates on current changes only.

The script acquires a shared archive transaction with atomic directory creation,
then revalidates closeout evidence and preflights all targets under that lock.
It captures displaced originals and verifies their bytes, and installs new files
exclusively without overwriting a concurrent creation. Additions never overwrite
existing files; replacements, removals and
renames require `expectedDigest`. Sources require `sourceDigest`. No undeclared
specification changes are applied. Handled failures restore changed targets;
concurrent edits are preserved and reported rather than overwritten by rollback.

Forced process/OS termination is not crash-atomic. A retained
`.thoth/.archive-transaction/recovery.json` holds bounded before/after content and paths.
The helper refuses another archive while an unfinished transaction exists.
Inspect actual durable files, the original and archive directories, and these
backups before deciding to complete or restore it; never blindly replay a
partially applied external effect. Unmanaged changes to directory topology during
execution are outside this guarantee. This backup is a filesystem transaction aid,
not an agent lifecycle, scheduler or event log.

This operation is offline. Do not invoke installers, download skills, modify
provider memory, or infer native completion from a checkpoint.
