# Proposal: Codex Hooks Surface Validation

## Intent
Deepen Codex hooks support by separating documented Codex hook surfaces from the existing generic `runtimeHooks` capability. The adapter should validate and diagnose `hooks.json`, inline `[hooks]`, `[features].hooks`, `[features].plugin_hooks`, and plugin hook bundles without claiming undocumented OpenCode-style runtime hook parity.

## Scope
### In Scope
- Model documented Codex hook events: `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PermissionRequest`, `PostToolUse`, and `Stop`.
- Record command handlers as supported and prompt handlers, agent handlers, async hooks, unsupported output fields, and full tool interception as diagnostic-only or unsupported.
- Emit diagnostics for trust requirements, project-local hooks, plugin hook bundles, and `features.plugin_hooks`/trust-review requirements.
- Update Codex adapter diagnostics, artifact planning, tests, fixtures, and documentation to explain safe use cases and limitations.
- Preserve `runtimeHooks: 'unknown'` for undocumented programmable runtime APIs.

### Out of Scope
- Generating speculative hook scripts or implementing hard permission enforcement through hooks.
- Installing or mutating `~/.codex/config.toml`; future CLI install may do so only with explicit user consent.
- Mapping tmux/session cleanup, subagent orchestration graphs, skill sync automation, or full SDD automation to Codex hooks.
- Changing OpenCode adapter behavior.

## Approach
Extend the Codex surface registry with hook-specific capability records and helper validation for hook events, handlers, fields, trust, and plugin feature gates. Update adapter capability diagnostics to report documented hook surfaces separately from `runtimeHooks`. Refresh tests and fixtures to assert command-handler support, diagnostic-only unsupported surfaces, and no generated hook artifacts unless backed by validated config surfaces. Update docs with recommended hook use cases: context/guidance at session and prompt entry points, guardrail and memory-governance diagnostics around permission/tool/stop events, and verification or SDD completion reminders.

## Affected Areas
- `src/harness/adapters/codex-surfaces.ts`
- `src/harness/adapters/codex.ts`
- `src/harness/adapters/codex-surfaces.test.ts`
- `src/harness/adapters/codex.test.ts`
- `src/harness/writers/skill-layout.test.ts`
- `src/harness/__fixtures__/codex/*`
- `docs/codex-surface-validation.md`

## Risks
- Overstating hook power could imply runtime enforcement that Codex hooks do not provide.
- Validating hook surfaces too broadly could generate unsafe or nonportable artifacts.
- Fixture updates may mask diagnostic regressions if they are not paired with precise assertions.

## Rollback Plan
Revert the hook-specific surface records, diagnostics, documentation, tests, and fixture changes. Keep the current `inline-hooks` unknown diagnostic and leave Codex hooks diagnostic-only until docs-backed validation is reintroduced.

## Success Criteria
- Codex documented hook surfaces are represented separately from generic `runtimeHooks`.
- Tests prove supported command-handler hook events and unsupported hook handlers/fields/trust gaps are diagnosed accurately.
- Adapter output does not generate speculative hook scripts or claim hooks provide hard runtime enforcement.
- Documentation names supported events, command handlers, trust/feature gates, intended use cases, limitations, and the future installer consent path.
