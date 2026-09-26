# Checkpoint and resume

Checkpoint replacement writes and syncs a temporary file, retains at most one
previous valid checkpoint, then renames the temporary file into place. Readers
fall back to that previous file if the latest file is torn or malformed. This is
bounded recovery, not a transaction with product source and not power-loss
immunity.

A checkpoint derives the unit's stored baseline and read/write scope from the
contract. It records writer identity, summary, completed and pending work,
structured check results, next action, read references, and current input/output
fingerprints. A stored unknown baseline remains unknown and makes recovery
degraded. The checkpoint grants no ownership and carries no acceptance authority.
It records the approved agreement identity and a digest of the unit definition so
technical replanning invalidates stale progress assumptions without changing
human agreement. It also records the canonical change id. Readers compare that
id with the normalized `.thoth/changes/<id>` directory and recompute the current
product agreement fingerprint, so copying a checkpoint or editing agreed product
scope cannot preserve its lineage.

Root first reads the compact planning record described in
[planning.md](planning.md), preserving explicit/fallback choices, unanswered
budgets and Stop. A process interruption is not a returned unanswered question.
The unit-context helper below does not project this root-owned record.

Resume is read-only. It projects one unit, the necessary transitive dependency
closure, its acceptance criteria, only context topics relevant to that unit, its
checkpoint, and separate content, evidence, and lineage freshness within an
explicit byte limit. A stale lineage or unknown baseline cannot be reported as
resumable. It reports liveness as unknown. The root must query native agent state
and treat unknown liveness as a blocker only for overlapping writes or resources.
