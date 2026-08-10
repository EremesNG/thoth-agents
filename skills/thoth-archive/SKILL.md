---
name: thoth-archive
description: Close a passing artifact-backed thoth-agents change by transactionally synchronizing explicitly declared durable requirement deltas and moving the complete audit trail to a dated archive.
---

# Thoth Archive

Archive is the required terminal transition for Accelerated and Full routes.
Resolve `<skill-dir>` as the directory containing this `SKILL.md`, and resolve
`<skills-root>` as its parent directory. Bundled paths below are anchored to
those installed roots rather than the project or current working directory.

1. Confirm every task is `[x]`, `verify-report.md` records independent oracle
   `PASS`, its compliance matrix covers every FR and buildable SC, every outcome
   SC has observed PASS evidence or an explicit residual RISK, and no unresolved
   CRITICAL issue remains.
2. Prepare `archive-report.md` from
   `<skills-root>/thoth-sdd/templates/archive-report.md` with status `READY`,
   verification lineage, completed scope, deviations, residual warnings, and
   the pending canonical-sync line.
3. Run `node "<skills-root>/thoth-sdd/scripts/validate.mjs"` through `closeout`.
4. Run `node "<skill-dir>/scripts/archive.mjs" --change <path> --date YYYY-MM-DD --json`.
5. Return the dated archive path, updated capability specifications, and audit
   summary.

The script reads delta metadata directly from `spec.md`:

- `[ADDED capability]` creates a named canonical requirement.
- `[MODIFIED capability]` replaces the named requirement and its scenarios.
- `[REMOVED capability]` removes the named requirement.
- `[RENAMED capability FROM Previous title]` renames and replaces it.
- `[INTERNAL]` never changes `openspec/specs/`.

The SDD validator preflights these operations against the canonical requirement
titles from `specify` onward. Archive reuses the same ordered parser and
preflight as a final defense before staging writes, preserving stable
`SDD-SPEC-DELTA-*` incompatibility codes. An `ADDED` warning for an existing
nonempty capability requires semantic-overlap review because differently named
requirements cannot be proven distinct by exact-title tooling alone.

All delta targets are validated before any permanent specification changes. The
operation stages and rolls back the full canonical update if a delta, report
update, or final move raises a handled error in the active process. Report and
canonical recovery are attempted independently. It never merges undeclared
feature prose. No CLI, network access, or installation action is used during SDD
closeout.

This operation is not crash-atomic. Forced process or operating-system
termination between filesystem renames can leave `.spec.md.thoth-stage-*` or
`spec.md.thoth-backup-*` files. Inspect them and the canonical specification
before retrying archive.
