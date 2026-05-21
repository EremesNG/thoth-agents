# Design: SDK v1.3.3 Migration

## Technical Approach

Implement the migration as four independently verifiable phases so each SDK
surface change can be validated before the next one lands:

1. **Dependency and type-surface alignment** — bump
   `@opencode-ai/plugin`/`@opencode-ai/sdk` to `v1.3.3`, align the direct `zod`
   dependency to the SDK-compatible v4 baseline, and replace stale local type
   assumptions with SDK-derived method signatures where practical.
2. **Runtime context adoption** — stop re-deriving project/worktree/shell/server
   values from `directory` or environment fallbacks, and instead consume
   `PluginInput.project`, `PluginInput.worktree`, `PluginInput.$`, and
   `PluginInput.serverUrl` in the subsystems that already need them.
3. **Permission migration** — move child-session tool gating from deprecated
   `tools` prompt payloads to the SDK `permission` payload, and migrate the full
   seven-agent roster to v2 `PermissionConfig` in one pass so agent capability
   enforcement is consistent.
4. **Compatibility hardening** — refresh tests/mocks, preserve current behavior
   for tmux/background delegation/foreground fallback, and verify the migration
   with `check:ci`, `typecheck`, and targeted unit coverage before the full test
   run.

No OpenSpec delta spec was present in hybrid storage during design authoring, so
this design is grounded in the recovered proposal plus the current repository
implementation.

## Architecture Decisions

### Decision: Replace background child prompt `tools` payloads with SDK `permission`
**Choice**:
Use the v1.3.3 session prompt `permission` field in
`src/background/background-manager.ts` instead of the deprecated `tools` field.
Keep the existing `isAgentAllowed()` runtime guard in the `background_task` tool
as a second enforcement layer.

**Alternatives considered**:
- Keep the deprecated `tools` map until a later cleanup
- Rely only on per-agent default permissions from `getAgentConfigs()`
- Adopt `tool.definition` immediately for dynamic tool hiding

**Rationale**:
Background child sessions need per-session delegation limits based on the agent
being spawned, not only static agent defaults. Moving this logic to the SDK
`permission` payload removes the deprecation, preserves today’s nested
delegation behavior, and keeps the existing tool-side allowlist as defense in
depth when a model still attempts a disallowed delegation.

### Decision: Defer `tool.definition` hook adoption for this migration
**Choice**:
Do not wire `tool.definition` during the v1.3.3 migration. Use v2
`PermissionConfig` for agent defaults and prompt-body `permission` for spawned
background sessions first.

**Alternatives considered**:
- Adopt `tool.definition` for all tools in the same migration
- Adopt `tool.definition` only for plugin-defined background tools

**Rationale**:
The migration already has two concrete enforcement upgrades: agent-level v2
permissions and child-session prompt permissions. `tool.definition` would add a
third enforcement path that depends on reliable per-request tool context and may
affect both built-in and plugin tools in harder-to-test ways. Deferring it keeps
the migration bounded and lower risk while still removing the current
prompt-only/soft-enforcement gap.

### Decision: Normalize PluginInput runtime values once, then pass only what each subsystem needs
**Choice**:
Resolve the following values near `src/index.ts` bootstrap time:
- `projectName` from `ctx.project.name` with a directory fallback only for
  defensive compatibility
- `worktreeDirectory` from `ctx.worktree`
- `shell` from `ctx.$`
- `serverUrl` from `ctx.serverUrl`

Pass those normalized values into subsystems that currently re-derive or guess
them, especially `DelegationManager`, `BackgroundTaskManager`,
`TmuxSessionManager`, and the thoth hook configuration.

**Alternatives considered**:
- Keep deriving values locally from `ctx.directory` and environment variables
- Pass the full `PluginInput` everywhere and let each module normalize its own
  copy
- Introduce a mutable singleton runtime context

**Rationale**:
The current code has three correctness issues caused by local re-derivation:
lossy `basename(directory)` project naming, localhost tmux URL fallback, and raw
`Bun.spawn()` command execution instead of the SDK-provided shell. Normalizing
once at bootstrap keeps the code deterministic, reduces duplicate fallback code,
and avoids broad coupling to the entire `PluginInput` shape.

### Decision: Migrate all built-in agents to v2 granular PermissionConfig in one sweep
**Choice**:
Build a central built-in permission preset map in `src/agents/index.ts` and
apply it to all seven shipped agents (`orchestrator`, `explorer`, `librarian`,
`oracle`, `designer`, `quick`, `deep`) when composing `SDKAgentConfig`.

**Alternatives considered**:
- Migrate only orchestrator and background agents first
- Keep prompt-based restrictions for write-capable specialists
- Spread permission defaults across individual agent files

**Rationale**:
`getAgentConfigs()` already materializes the entire roster in one place, so a
one-pass migration is both low churn and easier to reason about than mixed old
and new enforcement models. Centralizing the defaults also keeps agent prompt
files focused on role instructions instead of capability plumbing.

### Decision: Keep the repository on conservative zod v4 APIs and align the direct dependency to the SDK baseline
**Choice**:
Do not redesign schema validation. Keep `src/config/schema.ts` on conservative
zod v4 constructs that are compatible with the SDK’s zod version, and align the
direct dependency in `package.json` to the SDK-compatible v4 baseline used by
the v1.3.3 stack.

**Alternatives considered**:
- Keep the current direct zod version without checking SDK alignment
- Refactor config validation away from zod
- Depend only on the SDK’s transitive zod copy

**Rationale**:
The current schema code already uses standard v4 features (`z.object`,
`z.enum`, `z.record`, `superRefine`) and does not require a validator rewrite.
Aligning the direct dependency minimizes version skew while keeping the current
schema generator and config loader intact.

### Decision: Do not mark the shipped seven-agent roster as `hidden`
**Choice**:
Leave `hidden` unset or false for the current built-in agents in this migration.

**Alternatives considered**:
- Hide all subagents and expose only orchestrator
- Hide only background-only agents (`explorer`, `librarian`)
- Hide specialists now and document them later

**Rationale**:
The seven-agent roster is already user-visible in project docs, prompts, tests,
and workflow guidance. Hiding those agents would be a product-level behavior
change, not a compatibility migration. `hidden` remains available for future
internal-only helper agents if the plugin later adds them.

## Data Flow

The migration keeps `src/index.ts` as the composition root and changes how SDK
runtime values are sourced and propagated:

```text
PluginInput
  ├─ directory
  │   ├─ config loading
  │   └─ fallback-only defensive path handling
  ├─ project.name
  │   ├─ thoth hook project identifier
  │   └─ non-lossy project naming fallback
  ├─ worktree
  │   ├─ background child-session query.directory
  │   └─ delegation/project-id git command cwd
  ├─ $
  │   ├─ auto-update checker bun install
  │   └─ delegation/project-id git commands
  ├─ serverUrl
  │   └─ tmux pane OpenCode URL
  └─ client
      ├─ background manager
      ├─ tmux session manager
      ├─ foreground fallback
      └─ hooks
```

Operationally the important flows become:

### Background delegation flow
```text
background_task tool
  -> BackgroundTaskManager.launchBackgroundTask()
  -> session.create(query.directory = worktreeDirectory)
  -> session.prompt(body.permission = derived child-session permission)
  -> session.status(idle)
  -> extract result + notify parent
```

### Foreground fallback flow
```text
session error / retry event
  -> ForegroundFallbackManager.tryFallback()
  -> client.session.messages()
  -> client.session.abort()
  -> client.session.promptAsync()  // directly typed in v1.3.3
```

### Delegation persistence/project identity flow
```text
index.ts normalized runtime values
  -> DelegationManager({ worktreeDirectory, projectName, shell, ... })
  -> getProjectId(worktreeDirectory, shell, projectName)
  -> git root / root commit when available
  -> deterministic persisted delegation namespace
```

### Tmux pane flow
```text
session.created event
  -> TmuxSessionManager.onSessionCreated()
  -> spawnTmuxPane(..., serverUrl.toString())
  -> session.status()/session.deleted cleanup
```

## File Changes

### `package.json`
- Bump `@opencode-ai/plugin` and `@opencode-ai/sdk` to `v1.3.3`
- Align `zod` to the SDK-compatible v4 baseline
- Refresh the lockfile as part of the dependency migration

### `src/index.ts`
- Replace `basename(ctx.directory)` project naming with `ctx.project.name`
  fallback logic
- Normalize `worktree`, `$`, and `serverUrl` once near plugin bootstrap
- Pass normalized runtime values to managers/hooks that currently guess or
  re-derive them
- Keep the existing composition order for hooks and managers so behavioral
  regressions stay localized

### `src/agents/index.ts`
- Add a central built-in permission preset map using v2 `PermissionConfig`
- Keep `question: 'allow'` while migrating other permissions to the granular
  model
- Apply built-in `mode`, `steps`, and presentation metadata centrally when
  converting `AgentDefinition` to `SDKAgentConfig`
- Update merge comments/behavior so user-supplied `permission` is treated as the
  override surface instead of legacy `tools`

### `src/agents/orchestrator.ts`
- Keep the prompt structure intact
- Update shared `AgentDefinition` typing only if needed to support the centrally
  assigned v2 metadata without local casts

### `src/background/background-manager.ts`
- Replace the local `PromptBody.tools` shape with the SDK-compatible prompt-body
  `permission` shape
- Keep delegation-rule computation, but translate it into allow/deny permission
  payloads instead of booleans
- Use `ctx.worktree` (threaded through the manager) for child-session
  `query.directory` values instead of always using the raw session directory
- Prefer SDK-derived method/body types over handwritten request-body copies when
  possible

### `src/background/tmux-session-manager.ts`
- Treat `ctx.serverUrl` as the authoritative OpenCode URL
- Convert to string only when calling `spawnTmuxPane()`
- Retain a minimal localhost fallback only if required for defensive test
  compatibility

### `src/hooks/foreground-fallback/index.ts`
- Remove the `promptAsync` cast and call `client.session.promptAsync()` directly
- Reuse SDK-derived parameter types where helpful so the method signature cannot
  drift again

### `src/hooks/auto-update-checker/index.ts`
- Replace raw `Bun.spawn(['bun', 'install'])` with the SDK-provided shell
  (`ctx.$`) while preserving timeout behavior and non-blocking execution
- Keep the existing toast/update orchestration unchanged

### `src/delegation/project-id.ts`
- Replace raw `Bun.spawn()` git calls with a shell-backed helper built on the
  injected `ctx.$`
- Prefer the normalized worktree directory for git resolution
- Use normalized project metadata for non-lossy fallback naming when git data is
  unavailable

### `src/config/schema.ts`
- Verify that current schema helpers remain compatible with the aligned zod v4
  baseline
- Avoid introducing migration-unrelated config shape churn unless a dependency
  update forces it

### `src/hooks/chat-headers.ts`
- No production logic change is expected
- Keep this file as a compatibility canary because it already depends on newly
  typed `client.session.message()` in a way confirmed to be valid in v1.3.3

### `src/agents/explorer.ts` (and sibling agent files if needed)
- No prompt rewrite is planned
- Touch only if local agent definitions need lightweight metadata alignment that
  is cleaner to keep beside the prompt source than in the central map

### `src/hooks/chat-headers.test.ts`
- Update mock `PluginInput` shape to include the new v1.3.3 fields used across
  the codebase (`project`, `worktree`, `$`, `serverUrl`) so tests model the real
  runtime more closely

### `src/hooks/json-error-recovery/index.test.ts`
- Refresh `PluginInput` mocks for the v1.3.3 context shape even though the hook
  behavior itself is unchanged

### `src/background/background-manager.test.ts`
- Update background manager mocks to provide `worktree`, `$`, and `serverUrl`
- Add assertions for permission-based child prompt payloads instead of legacy
  `tools` maps
- Add/adjust coverage for worktree-based session query behavior where relevant

## Interfaces / Contracts

### Normalized runtime context

Implementation should normalize, but not necessarily export, a bootstrap-level
runtime view equivalent to:

```ts
type NormalizedRuntimeContext = {
  directory: string;
  worktreeDirectory: string;
  projectName: string;
  shell: PluginInput['$'];
  serverUrl: URL;
};
```

This is the contract `src/index.ts` uses when passing context to subsystems that
should no longer guess these values.

### Background prompt payload contract

`src/background/background-manager.ts` should stop maintaining a handwritten
prompt body that includes `tools?: { [key: string]: boolean }`. The local helper
type should instead be derived from the SDK prompt API and include the v1.3.3
`permission` field used for child-session tool gating.

Conceptually:

```ts
type BackgroundPromptBody = Parameters<
  PluginInput['client']['session']['prompt']
>[0]['body'];
```

### Delegation manager constructor surface

`DelegationManager` needs additional runtime dependencies so it can stop using
raw `Bun.spawn()` and lossy directory-derived names.

Conceptually:

```ts
type DelegationManagerOptions = {
  directory: string;
  worktreeDirectory: string;
  projectName: string;
  shell: PluginInput['$'];
  config?: DelegationConfig;
  getActiveTaskIds?: (rootSessionId: string) => Iterable<string>;
};
```

### Agent config assembly contract

`getAgentConfigs()` remains the only place that converts internal
`AgentDefinition` objects into SDK-facing agent configs. After the migration it
should own:
- built-in mode assignment (`primary` vs `subagent`)
- built-in permission defaults
- built-in steps/presentation metadata
- shallow user override precedence

That keeps individual agent files responsible for prompt + base temperament, not
permission plumbing.

## Testing Strategy

### Phase 1: dependency/type validation
- Run `bun run typecheck` after the dependency bump and removal of stale casts
- Confirm `foreground-fallback` compiles with direct `promptAsync()` typing

### Phase 2: runtime context adoption
- Extend `src/background/background-manager.test.ts` to verify worktree-based
  session query usage and permission payload generation
- Add/adjust delegation project-id coverage so shell-backed git resolution and
  fallback naming remain deterministic
- Verify tmux manager tests or targeted assertions cover `serverUrl` threading

### Phase 3: agent permission migration
- Run `src/agents/index.test.ts` to assert roster/mode/permission defaults
- Verify `background_task` runtime allowlist behavior still matches
  `SUBAGENT_DELEGATION_RULES`

### Phase 4: regression coverage
- Run `bun test`
- Run `bun run check:ci`
- Re-run `bun run typecheck`

The smallest useful verification set during implementation is:
1. targeted unit tests for changed modules,
2. full `typecheck`,
3. full test suite,
4. Biome CI check.

## Migration / Rollout

### Phase 1: Version bump and typing cleanup
- Update `package.json` dependencies
- Remove the obsolete `promptAsync` cast
- Replace handwritten SDK request-body assumptions where they are already known
  to drift

**Verification gate**: `bun run typecheck`

### Phase 2: Runtime context threading
- Normalize `projectName`, `worktreeDirectory`, `shell`, and `serverUrl` in the
  bootstrap path
- Thread them into background, tmux, delegation, and update-check flows

**Verification gate**: targeted manager/hook tests for background, tmux,
auto-update, and delegation helpers

### Phase 3: Permission migration
- Convert background child prompt payloads from `tools` to `permission`
- Apply v2 `PermissionConfig` defaults to all built-in agents

**Verification gate**: `src/agents/index.test.ts` and
`src/background/background-manager.test.ts`

### Phase 4: Mock refresh and full regression pass
- Update tests that fabricate `PluginInput`
- Run the full repository verification stack

**Verification gate**: `bun run check:ci`, `bun run typecheck`, `bun test`

Rollback remains phase-local: dependency bumps, runtime context threading,
permission migration, and test refreshes can each be reverted independently if a
gate fails.

## Open Questions

- The v1.3.3 permission payload shape should be taken from the installed SDK
  types during implementation rather than copied from this document; the design
  intentionally specifies the direction, not a guessed literal shape.
- No delta spec artifact was present in hybrid storage during design authoring.
  If a spec is added later, tasks should reconcile it with this proposal-led
  design before implementation starts.
