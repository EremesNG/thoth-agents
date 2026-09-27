# Storage unit acceptance evidence

Root implemented and inspected the shared public read/save service and CLI integration. All filesystem tests use isolated temporary directories; no live user configuration changed.

TDD observations: initial service import failed before implementation; stale/unowned preflight test failed before protection; invalid effort test failed before validation; partial-save retry test failed before snapshot result; duplicate frontmatter test failed before rejection; CLI stale-preview test failed before shared snapshot integration. Each became green after its bounded implementation.

Latest focused command: `pnpm exec vitest run src/cli/pi-model-config.test.ts src/cli/operations/pi.test.ts` — 27 tests passed. `pnpm run typecheck` passed. Targeted Biome check/write passed for the five owned storage files. Existing sync preservation and restore tests passed alongside new coverage. Root simplify pass removed the duplicate CLI frontmatter writer and replaced a non-null assertion with a narrowed local snapshot.

## Accepted public handoff

`readPiModelConfig(piRoot, roles?)` returns `PiModelSnapshot`: absolute global piRoot, roles (ModelRoleInput), and original per-role file contents. Default is six canonical specialists. Strict owned name/managed-by checks, duplicate relevant frontmatter rejection and safe-path checks precede reads. Missing/unowned files throw actionable errors; do not automatically install or repair from the panel.

`savePiModelConfig(snapshot, roles)` returns `{ success, changedRoles, snapshot, error? }`. Full draft preflight checks supported roles, duplicates, nonempty models, supported/capability-filtered efforts and stale original content before writes. Rechecks each target before its atomic-per-file managed write. Never claims batch atomicity. Untouched roles do not write; existing prompts/other fields stay intact. Incoming snapshot and draft are not mutated.

Always replace the panel's baseline with `result.snapshot`, including failure. It updates only successful roles and lets a retry continue the same draft after a transient later-file failure. Display partial changedRoles on failure, retain draft. Stale/external edits require reopening; retry never silently adopts external contents. Successful save closes with saved-global confirmation; no active children or ambient model changes. The UI supplies `availableEfforts` when setting an explicit effort from the live model capability list. `max` is now a recognized Pi value. Inheritance model is explicit `inherit`; inherited thinking omits the frontmatter field and remains subject to runtime defaults/overrides.
