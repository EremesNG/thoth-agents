# Proposal: Migrate @opencode-ai/plugin and @opencode-ai/sdk to v1.3.3

## Intent
Upgrade oh-my-opencode-lite from `@opencode-ai/plugin` and
`@opencode-ai/sdk` v1.2.6 to v1.3.3 so the plugin stays aligned with the
current SDK surface, removes deprecated API usage, and adopts additive
configuration improvements without changing the product's delegation-first
behavior.

## Scope
### In Scope
- Bump plugin and SDK dependencies to v1.3.3 and verify compatibility,
  including the current `zod` integration surface.
- Remove stale or deprecated SDK usage, including the unnecessary
  `promptAsync` cast and `tools`-based child-session gating.
- Adopt v1.3.3 `PluginInput` fields where they improve correctness:
  `project`, `worktree`, `$`, and `serverUrl`.
- Upgrade agent definitions to the newer permission model, including
  `PermissionConfig` v2 and additive agent metadata such as `hidden`,
  semantic `color`, `variant`, and defensive `steps` handling.
- Implement hard tool visibility enforcement through the `tool.definition`
  hook if it fits the existing architecture without regressing agent
  behavior.
- Update affected tests and mocks so the new SDK input shape and runtime
  behavior are covered.

### Out of Scope
- Redesigning the delegation architecture, tmux lifecycle model, or
  thoth-mem integration beyond migration-driven API updates.
- Introducing new end-user features unrelated to the v1.3.3 migration.
- Reworking stable hooks and tools already verified as compatible unless
  required by the version bump.
- Adopting optional APIs such as `Session.fork()`, `Session.getUsage()`, or
  `SyncEvent` unless they become necessary to complete the migration safely.

## Approach
Execute the migration as an incremental compatibility upgrade with clear
rollback points. First, bump dependencies and verify there are no hard API
blockers. Next, replace deprecated or redundant usage with v1.3.3-native
patterns: remove obsolete casts, move child-session permission gating to the
new `permission` model, and consume `PluginInput` fields directly instead of
re-deriving project, worktree, shell, or server information. Then update agent
definitions to use the additive v1.3.3 configuration surface while preserving
current behavior and internal role boundaries. Finally, refresh test mocks and
run typecheck, test, and Biome verification to confirm background delegation,
tmux session management, foreground fallback, chat headers, and thoth-mem
integration remain stable.

## Affected Areas
- `package.json` for dependency upgrades.
- `src/index.ts` for `PluginInput` adoption and stale local type cleanup.
- `src/agents/index.ts` and agent definition files for permission and metadata
  updates.
- `src/background/background-manager.ts` for child-session permission gating
  and `worktree` usage.
- `src/background/tmux-session-manager.ts` for `serverUrl` adoption.
- `src/hooks/foreground-fallback/index.ts` for typed `promptAsync` cleanup.
- `src/hooks/auto-update-checker/index.ts` and
  `src/delegation/project-id.ts` for BunShell (`$`) adoption and git-root
  resolution updates.
- Test files that mock `PluginInput` or assert migration-sensitive behavior.

## Risks
- `zod@4.1.8` compatibility may surface type or runtime issues if the current
  code still assumes `zod` v3 behavior.
- `PermissionConfig` v2 may interact with OpenCode permission merging in ways
  that differ from the current coarse-grained gating.
- The `tool.definition` hook introduces a stronger enforcement layer and could
  accidentally hide tools needed by internal agents if wired incorrectly.
- BunShell adoption may change shell escaping or command failure behavior
  relative to direct `Bun.spawn()` calls.

## Rollback Plan
Revert the dependency bump back to `@opencode-ai/plugin` and
`@opencode-ai/sdk` v1.2.6, then restore any migration-specific API changes
that depend on v1.3.3-only behavior. Because the planned work is incremental,
individual phases such as permission changes, `PluginInput` adoption, or hook
enforcement can also be reverted independently if verification identifies a
runtime regression.

## Success Criteria
- `bun run typecheck` passes with zero errors.
- `bun test` passes all existing tests after mock updates.
- `bun run check:ci` passes.
- No runtime regressions are introduced in background delegation, tmux pane
  lifecycle, foreground fallback, chat headers, or thoth-mem integration.
- Deprecated SDK usage is removed or replaced with supported v1.3.3 patterns.
- New `PluginInput` fields are used where they improve correctness and reduce
  local re-derivation.
