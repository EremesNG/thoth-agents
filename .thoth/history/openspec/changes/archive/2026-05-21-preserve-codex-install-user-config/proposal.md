# Proposal: Preserve Codex Install User Configuration

## Intent
Make `install --agent=codex` safe for repeated installs and updates by
preserving user-owned Codex configuration while still allowing thoth-agents to
upgrade fields it has previously managed.

## Scope
### In Scope
- Preserve all user content outside the thoth-agents managed block in
  `~/.codex/AGENTS.md`, with existing backup behavior retained before writes.
- Preserve user-customized `model` values in generated Codex subagent TOMLs
  when the installed model differs from the last model value tracked as managed
  by thoth-agents.
- Allow future default model upgrades when the current file value still matches
  the tracked thoth-agents-managed model.
- Add the tracking/versioning artifact
  `~/.codex/agents/.thoth-agents-managed-models.json`, which records only the
  last thoth-agents-managed `model` value per generated Codex role TOML.
- Add focused tests for first install, repeated install, user model
  customization, managed model upgrade, AGENTS content preservation, backup
  creation, dry-run behavior, and reset behavior.

### Out of Scope
- Preserve user edits to generated TOML fields other than `model`.
- Add broad uninstall, destructive force, or whole-file merge semantics.
- Change OpenCode installation behavior or non-Codex harness behavior.
- Treat provider-per-agent runtime behavior as guaranteed beyond Codex file
  materialization.

## Approach
Keep `~/.codex/AGENTS.md` on the existing managed-block merge path and confirm
tests cover preservation outside markers plus `.bak` creation. For each Codex
role TOML, compare the existing `model` value, the newly rendered default, and
the tracked last-managed value from
`~/.codex/agents/.thoth-agents-managed-models.json`. Represent this state file
as a resolved Codex target in the same path/target plumbing as the existing
Codex agents directory targets, because the generated subagent TOMLs also live
under `~/.codex/agents/`. If existing equals tracked, write the new default and
update tracking. If existing differs from tracked, preserve the existing user
value and update only non-model generated fields. If no tracking exists, treat
generated files that match current defaults as managed and treat non-default
existing model values as user-owned.

## Affected Areas
- Codex install planning/apply flow.
- Codex subagent TOML rendering and model selection.
- Codex install state/manifest tracking for managed model values at
  `~/.codex/agents/.thoth-agents-managed-models.json`.
- Installer tests and fixtures around Codex user-home targets.

## Risks
- Missing or stale tracking could misclassify ownership; tests should cover
  absent tracking, legacy installs, and changed defaults.
- Tracking writes must follow existing backup/atomic conventions where
  appropriate and must not create noisy churn during dry-runs.

## Rollback Plan
Remove the model tracking artifact and fall back to regenerating TOMLs from the
current adapter defaults. Existing backups continue to provide file-level user
recovery for AGENTS and config-like writes.

## Success Criteria
- Re-running `install --agent=codex` preserves `~/.codex/AGENTS.md` user content
  outside managed markers and keeps backup semantics intact.
- User-edited subagent `model` values survive reinstall/update when they differ
  from the last tracked managed value.
- thoth-agents default model changes are applied when the prior installed value
  was still managed.
- Only `model` receives user-vs-managed preservation logic; other generated
  subagent TOML fields remain installer-managed.
- Tests verify the expected install, update, dry-run, reset, backup, and legacy
  tracking cases.
