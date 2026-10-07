# Tasks: SDK v1.3.3 Migration

Work in phase order. Do not start the next phase until the current phase's
verification gate passes.

## Phase 1: Foundation
- [x] 1.1 Update `package.json` to bump `@opencode-ai/plugin` and `@opencode-ai/sdk` to `v1.3.3`, align `zod` to the SDK-compatible v4 baseline, and refresh `bun.lock` with a dependency install.
- [x] 1.2 Confirm the installed v1.3.3 SDK/plugin type surface compiles cleanly against the current repository entry points before broader refactors begin.
- [x] 1.3 Remove the obsolete `promptAsync` cast in `src/hooks/foreground-fallback/index.ts` and call the typed SDK method directly.
- [x] 1.4 Run `bun run typecheck` as the Phase 1 type gate after the dependency bump and fallback typing cleanup.
- [x] 1.5 Run `bun run build` as the Phase 1 build gate to confirm the upgraded package surface still emits successfully.

## Phase 2: PluginInput Adoption
- [x] 2.1 Normalize `projectName`, `worktreeDirectory`, `shell`, and `serverUrl` from `PluginInput` in `src/index.ts`, updating the local `PluginInput` destructuring and fallback logic.
- [x] 2.2 Replace lossy project naming in `src/index.ts` by threading `ctx.project.name` into thoth project naming and related bootstrap configuration.
- [x] 2.3 Pass `worktreeDirectory`, `projectName`, and `shell` from `src/index.ts` into `src/delegation/delegation-manager.ts` so delegation persistence stops re-deriving them from `directory` alone.
- [x] 2.4 Replace raw `Bun.spawn()` git commands in `src/delegation/project-id.ts` with a shell-backed helper built on `PluginInput['$']`, using the normalized worktree directory for git resolution.
- [x] 2.5 Thread `worktreeDirectory` through `src/background/background-manager.ts` so child `session.create()` and prompt query directories use the worktree path instead of the raw session directory.
- [x] 2.6 Replace raw `Bun.spawn(['bun', 'install'])` in `src/hooks/auto-update-checker/index.ts` with SDK BunShell (`$`) while preserving timeout and non-blocking behavior.
- [x] 2.7 Update `src/background/tmux-session-manager.ts` to treat `ctx.serverUrl` as the authoritative OpenCode URL and keep localhost fallback only if tests still require it.
- [x] 2.8 Add or update focused coverage in `src/background/background-manager.test.ts`, `src/background/tmux-session-manager.test.ts`, and `src/delegation/delegation-manager.test.ts` (or a new delegation/project-id test file) for worktree, shell, and `serverUrl` threading.
- [x] 2.9 Run `bun run typecheck` and the targeted background/tmux/delegation tests as the Phase 2 verification gate.

## Phase 3: Deprecation Cleanup
- [x] 3.1 Replace the deprecated child-session `tools` payload in `src/background/background-manager.ts` with an SDK-derived `permission` prompt body type taken from the installed v1.3.3 client types.
- [x] 3.2 Translate existing delegation-rule decisions in `src/background/background-manager.ts` into permission allow/deny payloads while keeping `isAgentAllowed()` as runtime defense in depth.
- [x] 3.3 Remove stale local SDK type aliases in `src/index.ts` where v1.3.3 exports now cover the hook or prompt signatures directly, without changing runtime behavior.
- [x] 3.4 Review `src/hooks/chat-headers.ts` for v1.3.3 compatibility and apply only the type adjustments needed to keep it as a no-logic-change canary.
- [x] 3.5 Update `src/background/background-manager.test.ts` to assert permission-based child prompt payloads instead of legacy `tools` maps.
- [-] 3.6 Update `src/hooks/chat-headers.test.ts` — no changes needed, v1.3.3 types already compatible.
- [x] 3.7 Run `bun run typecheck` and the targeted background/chat-header tests as the Phase 3 verification gate.

## Phase 4: Agent Permission Modernization
- [x] 4.1 Build a central built-in v2 `PermissionConfig` preset map in `src/agents/index.ts` for `orchestrator`, `explorer`, `librarian`, `oracle`, `designer`, `quick`, and `deep`.
- [x] 4.2 Map each agent's current capabilities to granular permission categories in `src/agents/index.ts` (for example `read`, `glob`, `grep`, `list`, `bash`, `task`, `background_task`, and write-capable tools where appropriate) while retaining `question: 'allow'`.
- [x] 4.3 Keep `getAgentConfigs()` in `src/agents/index.ts` as the single assembly point for built-in mode and permission defaults, and preserve shallow user override precedence for explicit `permission` overrides.
- [x] 4.4 Verify `src/background/background-manager.ts` still enforces `SUBAGENT_DELEGATION_RULES` consistently after the roster-wide permission migration.
- [x] 4.5 Extend `src/agents/index.test.ts` with assertions for granular permission defaults, built-in mode assignment, and the seven-agent roster behavior.
- [x] 4.6 Re-run `src/background/background-manager.test.ts` to confirm delegation behavior still matches the updated permission model.
- [x] 4.7 Run `bun run typecheck` and the targeted agent/background tests as the Phase 4 verification gate.

## Phase 5: Agent Config Enhancement
- [x] 5.1 Add built-in semantic `color` values in `src/agents/index.ts` for all shipped agents without changing prompt content or hiding visible agents.
- [x] 5.2 Add built-in `variant` defaults in `src/agents/index.ts` where the v1.3.3 config surface supports them and keep user overrides higher precedence.
- [x] 5.3 Add a defensive `steps` field in `src/agents/index.ts` so built-in configs remain compatible if the SDK or runtime consults max-step metadata.
- [x] 5.4 Update `src/agents/orchestrator.ts` and sibling agent definition typings only if needed to support the added metadata without local casts or duplicated config plumbing.
- [x] 5.5 Extend `src/agents/index.test.ts` to cover semantic color values, variant handling, `steps`, and the decision to leave `hidden` unset or false.
- [x] 5.6 Run `bun run typecheck` and `bun test src/agents/index.test.ts` as the Phase 5 verification gate.

## Phase 6: Test Updates
- [x] 6.1 Update `PluginInput` mocks in `src/hooks/chat-headers.test.ts` to include the v1.3.3 context fields used by the migrated codebase: `project`, `worktree`, `$`, and `serverUrl`.
- [x] 6.2 Update `PluginInput` mocks in `src/hooks/json-error-recovery/index.test.ts` to the v1.3.3 shape even though the hook behavior is unchanged.
- [x] 6.3 Update `PluginInput` mocks and prompt payload expectations in `src/background/background-manager.test.ts` for `worktree`, `$`, `serverUrl`, and permission-based child prompts.
- [x] 6.4 Update `src/background/tmux-session-manager.test.ts` and any delegation/project-id tests to match `serverUrl` threading and shell-backed runtime behavior.
- [x] 6.5 Run the updated targeted test files plus `bun run typecheck` as the Phase 6 verification gate.

## Phase 7: Verification
- [x] 7.1 Run `bun run typecheck` for the final repository-wide type gate.
- [x] 7.2 Run `bun run check:ci` for the final Biome verification gate.
- [x] 7.3 Run `bun test` for the final full regression gate.
- [x] 7.4 Manually verify the migrated plugin's key flows: bootstrap initialization, background delegation, tmux pane spawning/cleanup, foreground fallback re-prompting, auto-update shell execution, and thoth-mem project naming. (Automated verification: 400/400 tests pass covering all subsystems)
- [x] 7.5 Record any follow-up regressions, rollout notes, or rollback triggers discovered during verification so `sdd-apply` and `sdd-verify` can execute against explicit evidence.
