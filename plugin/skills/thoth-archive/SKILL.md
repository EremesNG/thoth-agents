---
name: thoth-archive
description: Transactionally apply declared .thoth/specs deltas and archive independently verified substantial SDD changes.
license: MIT
compatibility: Requires Node.js >=22.19 and installed sibling thoth-sdd skill.
metadata:
  author: thoth-agents
  version: "2.0"
---

# Thoth Archive

Root archives only after the implementation writer has terminated and a fresh
independent Oracle PASS has covered the actual change, diff, checks, and risks.
Structural closeout validation is not approval. The single record must have all
tasks complete, explicit plan-review disposition and implementation authorization,
every acceptance outcome's concrete PASS check/evidence, reviewed-record and
source digests, reviewed canonical baselines for every affected capability, and
`**Archive**: READY`. Each affected canonical spec is covered in that same record
by its SHA-256 `Source` entry or an explicit `absent` entry. Missing or stale
coverage blocks before canonical or archive changes. No verification or archive
report is required or allowed.

Run the installed sibling validator at `--through closeout`, then:

```text
node "<skill-dir>/scripts/archive.mjs" --change .thoth/changes/<id> --date YYYY-MM-DD --json
```

The shipped `--project <repository-root>` option is also accepted and checked
against the change location. JSON includes the stable change ID, archive path,
record path, and updated capabilities.

The script validates before creating the transaction, revalidates under its
exclusive transaction, and checks actual reviewed baselines again immediately
before mutation. It applies only declared ADDED/MODIFIED/REMOVED/RENAMED
exact-title requirements to `.thoth/specs/<capability>/spec.md`, preserving
unaffected requirements. It then moves the active
`.thoth/changes/<id>/<id>.md` record to
`.thoth/changes/archive/<date>-<id>/<id>.md`. The filename and identity remain
unchanged; the date appears only in the archive directory. Historical changes
are preserved.

It preflights canonical baselines and destination topology, captures displaced
original bytes, installs exclusively without overwriting concurrent creation,
verifies applied bytes, and rolls back handled failures. It rejects unsafe IDs,
symlink escapes, archive collisions, and unfinished transactions. Forced
termination is not crash-atomic; a retained
`.thoth/.archive-transaction/recovery.json` is a filesystem recovery aid, not
workflow state. Inspect real files, backups, and change/archive locations before
recovery; never blindly replay external effects. No installer or network access
is involved.
