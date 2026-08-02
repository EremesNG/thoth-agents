# Data Model: CLI-Managed Installation Ledger

## Location and ownership

The CLI owns one global state file:

```text
${XDG_CONFIG_HOME:-~/.config}/thoth-agents/install-state.json
```

The path is independent of OpenCode, Codex, Claude Code, and thoth-mem native state. Test and embedded callers may inject the home/config root, but harness-specific environment variables do not relocate this cross-harness ledger.

## Schema v1

```json
{
  "schemaVersion": 1,
  "harnesses": {
    "opencode": { "version": "0.4.8" },
    "codex": { "version": "0.4.8" },
    "claude": { "version": "0.4.8" }
  }
}
```

Rules:

- `schemaVersion` is exactly `1`.
- Harness keys are limited to `opencode`, `codex`, and `claude`.
- Each record contains only the exact package version that most recently completed the full CLI installation contract for that harness.
- A harness key may be absent when that harness has never completed installation through a ledger-aware CLI.
- No native marketplace version, provider state, receipt, secret, timestamp, or inferred cache version is stored.

## State transitions

| Existing state | Operation outcome | Result |
| --- | --- | --- |
| Missing ledger | Full non-dry-run success for harness H at version V | Create schema v1 with `H.version = V`. |
| Valid ledger | Full non-dry-run success for harness H at version V | Preserve every other harness record and atomically replace `H.version`. |
| Valid ledger | Preview, dry-run, cancellation, or any failed required step | Preserve the file byte-for-byte. |
| Malformed/unsupported ledger | Status | Report CLI-managed version as unknown and do not infer a replacement. |
| Malformed/unsupported ledger | Full non-dry-run success | Back up the invalid CLI-owned file, initialize schema v1, and commit only the newly proven harness record. |
| Any state | Native Codex/Claude marketplace update outside the CLI | No ledger transition. |

## Atomicity and failure semantics

1. Resolve and validate the executing package identity and version before any harness mutation.
2. Complete native-manager, CLI-managed surface, required-skill, and provider setup steps.
3. Serialize the next ledger to a sibling temporary file.
4. Preserve an invalid prior ledger as a backup when repair is required.
5. Rename the temporary file into place.
6. Report overall installation failure if the ledger cannot be committed; retain the previous authoritative record and make retry the recovery path.

The transaction is atomic only for the ledger file. External manager, filesystem, skill, and provider effects are not rolled back after they have independently succeeded.

## Status interpretation

- **Recorded equals executing version**: the last complete CLI refresh used this CLI release; ordinary managed-surface checks still determine drift.
- **Recorded differs from executing version**: show both values and offer a complete update. Do not silently classify marketplace state as the recorded value.
- **Record missing or invalid**: show the CLI-managed version as unknown/missing and recommend a complete CLI update.
- A Codex or Claude marketplace plugin may be newer or older than the ledger without changing this interpretation.
