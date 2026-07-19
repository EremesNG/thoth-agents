---
name: thoth-archive
description: Archive a passing thoth-agents artifact-backed SDD change with a durable audit report and no implicit specification merge.
---

# Thoth Archive

Archive is a required terminal transition for Accelerated and Full routes.

1. Confirm every task is `[x]`, `verify-report.md` records oracle `PASS`, and no
   unresolved CRITICAL issue remains.
2. Create `archive-report.md` from the bundled thoth-sdd template with completed
   scope, verification lineage, deviations, residual warnings, and follow-up.
3. Run `scripts/archive.mjs --change <path> --date YYYY-MM-DD --json`.
4. Return the dated archive path and audit summary.

The archive operation never merges feature content into `openspec/specs/`.
Durable specification or documentation updates must be explicit implementation
tasks before verification.
