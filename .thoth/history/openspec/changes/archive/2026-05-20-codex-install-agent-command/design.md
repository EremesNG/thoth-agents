# Design: Codex Install Agent Command

## Technical Approach

Split the installer by target agent while leaving the current OpenCode path
unchanged. `parseInstallArgs` should accept `--agent=opencode|codex` and default
to `opencode`; `install(args)` should dispatch to the existing OpenCode
`runInstall(createInstallConfig(args))` branch or to a new Codex installer branch.

The Codex branch should use a two-step setup lifecycle: `buildCodexSetupPlan`
collects every target/action/diagnostic, and `applyCodexSetup` performs managed
writes only when not in dry-run mode. This mirrors the useful plan/apply pattern
from the companion `oh-my-codex` project while avoiding its destructive uninstall
behavior, JSON memory model, hardcoded product paths, and config-overwrite
defaults. The plan must be reusable by future doctor/repair flows.

The Codex setup plan should prepare the already-implemented `.codex-plugin/`
package through the Codex adapter/package writer; materialize Codex-specific root
instructions into `~/.codex/AGENTS.md`, role subagent TOML, skills, MCP/config,
and hook/app/interface plugin assets where applicable; and conservatively merge
managed settings into the user Codex config at `CODEX_HOME/config.toml` when
supported by project conventions/docs, otherwise `join(os.homedir(), '.codex',
'config.toml')`. On Windows this resolves to
`%USERPROFILE%\.codex\config.toml` through `os.homedir()`. The installer should
not write directly into `~/.codex/plugins/cache/...` because that cache is an
implementation detail, not a stable external CLI install API in the provided docs
context.

Config mutation is limited to feature gates and any future docs-backed plugin
entry that can be derived safely. The `.codex-plugin/plugin.json` manifest is
limited to documented package fields: `name`, `version`, `description`, `skills`,
`mcpServers`, `apps`, `hooks`, and `interface`; custom agents are not modeled as
plugin-bundled artifacts in v1. The required v1 behavior is to set
`[features].hooks = true` and `[features].plugin_hooks = true` after explicit
`install --agent=codex`, then print `/plugins` and `/hooks` instructions. If a
plugin entry is not safely implementable, the installer must not fake it; it
prints manual `/plugins` enablement steps instead. The Codex orchestrator is not
a selectable main custom agent: Codex-specific root orchestrator instructions are
composed into a managed block in `~/.codex/AGENTS.md` and explain how the root
session should invoke/use the packaged oh-my-opencode-lite plugin capabilities,
while exactly six role specialists are installed as subagents or equivalent
secondary role surfaces where Codex supports them.

Codex v1 deliberately does not add a broad destructive `--force`. Existing
OpenCode reset behavior must stay isolated to `agent=opencode`; for
`agent=codex`, `--reset` means managed-only repair of oh-my-opencode-lite owned
targets: managed TOML keys, managed instruction blocks, deterministic managed
role TOML files, and generated package assets. Unmanaged Codex config, unrelated
instructions, user-created role files, and Codex directories are never deleted or
whole-file overwritten by reset.

## Architecture Decisions

### Decision: Preserve OpenCode as default installer

**Choice**: Add `agent?: 'opencode' | 'codex'` to `InstallArgs` and keep omitted
`--agent` equivalent to `opencode`.

**Alternatives considered**:

- Introduce a separate `install-codex` command.
- Change `install` to infer Codex from local project files.

**Rationale**: The requested public contract is `install --agent=codex`; keeping
OpenCode default avoids breaking existing users and current tests.

### Decision: Use a dispatch wrapper instead of modifying OpenCode install internals

**Choice**: Rename or keep the current OpenCode implementation as an internal
`runOpenCodeInstall` path, and add `runCodexInstall` as a separate branch.

**Alternatives considered**:

- Thread Codex checks through the current `runInstall` steps.
- Duplicate all installer output code.

**Rationale**: Current `src/cli/install.ts` performs OpenCode detection,
OpenCode config JSON/JSONC updates, skill installation, and OpenCode next steps.
Codex has TOML config and plugin trust boundaries, so separation reduces
regression risk.

### Decision: Treat OpenCode and Codex writes as isolated harness adapters

**Choice**: `agent=opencode` may only touch the existing OpenCode plugin install
targets, while `agent=codex` may only touch Codex setup targets and generated
Codex package assets.

**Alternatives considered**:

- Let Codex install refresh OpenCode config because this package is currently an
  OpenCode plugin.
- Let OpenCode install opportunistically generate Codex package artifacts.

**Rationale**: The default OpenCode install contract is adding/loading the
`oh-my-opencode-lite@latest` plugin in `opencode.jsonc`. Codex install is a
different materialization flow; cross-mutating configs would surprise users and
make rollback/repair unsafe.

### Decision: Compose orchestrator into Codex root instead of making it a main custom agent

**Choice**: Install Codex-specific root orchestrator instructions into the
ambient/root Codex session surface at `~/.codex/AGENTS.md` and install
explorer/librarian/oracle/designer/quick/deep as role subagents or equivalent
secondary surfaces.

**Alternatives considered**:

- Create a selectable Codex `orchestrator` custom agent and ask users to invoke it.
- Model usage as direct `$deep-interview "prompt"` role commands.

**Rationale**: Codex users talk to the root session. The oh-my-opencode-lite
orchestrator is a coordination behavior for that root surface, not a separate
chat target. The Codex prompt must differ from the OpenCode prompt where needed
to describe Codex root behavior and packaged plugin usage. Role agents remain six
delegated specialists, and unsupported UX parity must be documented rather than
overpromised.

### Decision: Keep custom agents outside the `.codex-plugin` package

**Choice**: Validate `.codex-plugin/plugin.json` only against documented manifest
fields (`name`, `version`, `description`, `skills`, `mcpServers`, `apps`,
`hooks`, `interface`) and generate Codex role agents separately under
`.codex/agents/` or `~/.codex/agents/`.

**Alternatives considered**:

- Add custom agents to the plugin manifest as an undocumented extension.
- Make direct `@plugin_name` usage the primary UX and skip generated role TOML.

**Rationale**: Official plugin packaging covers skills, MCP servers,
apps/connectors, hooks, and interface/assets, not custom agents. Keeping agents
outside the package avoids overclaiming plugin capabilities while preserving a
reviewable plugin boundary.

### Decision: Build setup plans before applying Codex writes

**Choice**: Implement Codex install as `buildCodexSetupPlan(options) ->
applyCodexSetup(plan)` with shared target/action metadata for normal install,
`--dry-run`, and future doctor/repair flows.

**Alternatives considered**:

- Perform writes inline as each installer step discovers them.
- Copy the companion project's lifecycle wholesale, including uninstall/overwrite
  behavior.

**Rationale**: A plan/apply split makes dry-run complete, keeps diagnostics in one
place, and gives doctor/repair a stable model later. Only the lifecycle pattern is
adopted; destructive deletion, hardcoded paths, and overwrite-first behavior stay
out of scope.

### Decision: Prepare package artifacts but avoid plugin cache mutation

**Choice**: Codex install should call existing Codex package generation and write
or report `.codex-plugin/` artifacts, but should not copy into
`~/.codex/plugins/cache/...` by default.

**Alternatives considered**:

- Copy or symlink `.codex-plugin/` into the observed cache path.
- Only print instructions without generating package artifacts.

**Rationale**: The prior packaging change created deterministic reviewable
artifacts. Official docs findings mention cache location and `/plugins`, but not
a stable external cache-install API. Avoiding cache writes keeps the installer
safe and docs-backed.

### Decision: Implement Codex TOML IO as conservative merge with backup

**Choice**: Add a Codex-specific config IO module that parses TOML into a nested
object for supported scalar/table shapes, merges managed keys, writes via temp +
rename, and copies a `.bak` before mutation.

**Alternatives considered**:

- Add a TOML dependency immediately.
- Append raw TOML snippets to the end of the file.

**Rationale**: `package.json` currently has no TOML parser dependency. A minimal
internal parser/writer can satisfy the narrow managed keys if tests cover
profiles and unknown table preservation. If comment preservation is required, a
future implementation may add a comment-preserving library; otherwise it must
warn that comments/formatting may be rewritten and rely on backup/dry-run diff.

### Decision: Treat plugin enablement as conditional and transparent

**Choice**: Write `[plugins."..."].enabled = true` only if implementation can map
the local package to a documented plugin identifier without cache mutation;
otherwise emit `/plugins` instructions.

**Alternatives considered**:

- Always write a guessed plugin ID.
- Never support plugin entries.

**Rationale**: Docs show enabled state in `config.toml`, but safe use depends on
knowing the plugin key and install target. The spec requires safe docs-backed
behavior, not a brittle guess.

### Decision: Capability gaps are explicit install diagnostics

**Choice**: Generated Codex assets and install output must disclose when role
permissions, memory governance, hook behavior, or provider-per-agent settings are
instruction-only or user-managed because documented Codex runtime controls are
missing.

**Alternatives considered**:

- Treat prompt instructions as equivalent to runtime enforcement.
- Omit unsupported capability notes to keep output short.

**Rationale**: OpenCode plugin behavior can rely on OpenCode-specific runtime
hooks and tool access. Codex support must be honest about governance boundaries so
users do not assume hard enforcement where only instructions exist.

### Decision: Keep Codex v1 reset managed-only and exclude destructive force

**Choice**: Do not add a Codex `force` field or public `--force` semantics in v1.
`--agent=codex --reset` only refreshes oh-my-opencode-lite managed keys, managed
blocks, deterministic managed role TOML files, and generated package assets.

**Alternatives considered**:

- Add a broad `--force` that overwrites Codex config and regenerated assets.
- Reuse any existing OpenCode force-like reset behavior for Codex.

**Rationale**: Codex targets can contain user guidance, profiles, MCP servers,
trusted config, and role definitions outside this plugin's ownership. Broad force
would make v1 rollback and repair unsafe. A future destructive uninstall/reset can
be designed separately with explicit opt-in and review.

### Decision: Resolve Codex targets through an explicit scope-aware contract

**Choice**: Add a Codex target resolver that maps every setup-plan item to a
concrete managed destination before rendering or applying writes. Project scope
uses project-relative targets; user/global scope uses documented home targets.

**Alternatives considered**:

- Let each renderer choose output paths independently.
- Keep root instruction destination as an implementation-time open question.

**Rationale**: Root instruction and role TOML materialization affect user-owned
surfaces. A single resolver contract makes dry-run complete, enables no-cross-
harness tests, and prevents implementation tasks from guessing paths.

## Data Flow

```text
CLI args
  -> parseInstallArgs({ agent defaults to 'opencode' })
  -> install(args)
     -> opencode: createInstallConfig(args) -> existing OpenCode runInstall
     -> codex: createCodexInstallConfig(args)
        -> buildCodexSetupPlan(options)
            -> resolve Codex root/config/subagent/skill/plugin targets
            -> render managed ~/.codex/AGENTS.md root instructions
            -> render six role subagent TOML templates
           -> render/write or dry-run .codex-plugin package artifacts
           -> read + parse existing config.toml if present
           -> plan managed features/plugin entry merge if safe
           -> attach capability, trust, and precedence diagnostics
        -> dry-run: print plan without writes
        -> applyCodexSetup(plan): backup + atomic writes + managed-block merges
        -> print /plugins, /hooks, precedence, capability, and backup messages
```

## File Changes

Planned implementation files:

- `src/cli/types.ts` — add `InstallAgent = 'opencode' | 'codex'`, `agent` on
  `InstallArgs`, and Codex install result/config types if needed.
- `src/cli/index.ts` — parse `--agent=...`, reject unsupported values, update
  help/examples to include `install --agent=codex` and `--agent=opencode`.
- `src/cli/install.ts` — dispatch by agent, keep OpenCode install behavior as the
  default branch, and add Codex-specific status/next-step messaging.
- `src/cli/codex-paths.ts` (new) — resolve Codex home/config paths with
  `CODEX_HOME` handling and Windows-safe `os.homedir()` fallback.
- `src/cli/codex-config-io.ts` (new) — read/parse/merge/render/write
  `config.toml`, produce dry-run diffs/summaries, backup, and atomic writes.
- `src/cli/codex-install.ts` (new) — prepare package artifacts, call Codex config
  IO, build/apply setup plans, enforce dry-run/no-write behavior, and compose
  diagnostics.
- `src/cli/codex-setup-plan.ts` (new, optional if not kept inside
  `codex-install.ts`) — model setup targets/actions, managed-block metadata,
  doctor/repair-ready diagnostics, and apply results.
- `src/harness/writers/codex-plugin-package.ts`,
  `src/harness/writers/codex-toml.ts`, `src/harness/adapters/codex.ts`, and
  `src/harness/adapters/codex-surfaces.ts` — reuse existing Codex package,
  TOML, and surface rendering; add helpers only if the CLI needs file-writing or
  root-instruction/subagent materialization wrappers around returned artifacts.
- `src/cli/index.test.ts`, `src/cli/install.test.ts`, `src/cli/config-io.test.ts`
  or new `codex-*.test.ts` files — CLI and Codex IO coverage.
- `docs/codex-plugin-packaging.md` or new `docs/codex-install.md` — document the
  install command, trust review, plugin management, config precedence, and
  limitations.

No planned deletions. OpenCode config JSON/JSONC IO remains in `config-io.ts`.

## Interfaces / Contracts

```ts
export type InstallAgent = 'opencode' | 'codex';

export interface InstallArgs {
  tui: boolean;
  agent?: InstallAgent;
  tmux?: BooleanArg;
  skills?: BooleanArg;
  dryRun?: boolean;
  reset?: boolean;
}

export type CodexInstallScope = 'project' | 'user';

export interface CodexInstallConfig {
  dryRun?: boolean;
  reset: boolean;
  scope: CodexInstallScope;
  projectRoot?: string;
  packageRoot: string; // .codex-plugin
  codexConfigPath: string;
}

export type CodexSetupAction =
  | 'create'
  | 'merge-managed-block'
  | 'merge-toml'
  | 'refresh-package'
  | 'diagnose-only';

export interface CodexSetupPlanItem {
  targetPath: string;
  action: CodexSetupAction;
  description: string;
  requiresBackup: boolean;
  capabilityWarnings: string[];
}

export interface CodexSetupPlan {
  items: CodexSetupPlanItem[];
  diagnostics: string[];
  disclaimers: string[];
}

export type CodexTargetKind =
  | 'root-instructions'
  | 'role-subagent-toml'
  | 'skills-directory'
  | 'user-config'
  | 'project-config'
  | 'plugin-package';

export interface CodexResolvedTarget {
  kind: CodexTargetKind;
  scope: CodexInstallScope;
  targetPath: string;
  managedMarker?: string;
  role?: 'explorer' | 'librarian' | 'oracle' | 'designer' | 'quick' | 'deep';
}

export interface CodexConfigMergeResult {
  success: boolean;
  configPath: string;
  backupPath?: string;
  changed: boolean;
  diffSummary: string[];
  warnings: string[];
  error?: string;
}
```

Managed TOML keys for v1:

- `features.hooks = true`
- `features.plugin_hooks = true`
- Optional: `plugins.<documentedPluginId>.enabled = true` only if safely derived
  and docs-backed during implementation.

Managed Codex asset targets for v1 planning:

- Root instructions: merge Codex-specific oh-my-opencode-lite orchestrator
  guidance into one explicit ambient/root Codex instruction destination:
  `~/.codex/AGENTS.md`. Existing files
  are preserved through a managed-block merge, with backup before any lossy
  rewrite. The generated instructions explain how the Codex root session should
  invoke/use the packaged oh-my-opencode-lite plugin capabilities and must not be
  copied verbatim from the OpenCode orchestrator prompt. Managed markers are
  `oh-my-opencode-lite:codex-root:start` and
  `oh-my-opencode-lite:codex-root:end`.
- Role subagents: materialize explorer, librarian, oracle, designer, quick, and
  deep as Codex TOML role files named `oh-my-opencode-lite-{role}.toml`. Project
  scope resolves under `.codex/agents/`; user/global scope resolves under
  `~/.codex/agents/` or the documented Codex-home equivalent. Do not generate a
  selectable `orchestrator` TOML file in v1.
- Plugin package: refresh `.codex-plugin/` assets without mutating undocumented
  Codex cache internals.
- Skills/MCP/hooks/apps/interface: plugin-bundled skills, MCP servers, apps,
  hooks, and interface/assets are represented only through documented
  `.codex-plugin/plugin.json` fields. Custom agents are generated outside the
  plugin package. Skills resolve to `.agents/skills/` for project scope and
  `~/.agents/skills/` for user/global scope. MCP or provider-capable user config
  resolves to `~/.codex/config.toml` or the documented Codex-home equivalent;
  trusted project config resolves to `.codex/config.toml` only where applicable.
  Install plugin-bundled assets and config only where existing adapter renderers
  and Codex docs support them; otherwise emit capability notes.

## Testing Strategy

- CLI parser tests: default install has `agent: 'opencode'` or equivalent,
  `--agent=opencode`, `--agent=codex`, unsupported values, help examples.
- OpenCode regression tests: `createInstallConfig` and install dispatch preserve
  `--dry-run`, `--reset`, `--tmux`, `--skills`, bundled skill behavior, and no
  Codex side effects for default/OpenCode installs.
- Harness isolation tests: `--agent=codex` does not mutate OpenCode config or the
  existing `oh-my-opencode-lite@latest` plugin entry; `--agent=opencode` and bare
  install do not mutate Codex targets.
- Codex setup plan tests: dry-run emits `~/.codex/AGENTS.md` root instruction,
  six role subagent, `.codex-plugin/`, config, hook/plugin, backup, and
  diagnostic actions without writes; apply mode consumes the same plan.
- Codex target resolver tests: project-scope roots resolve role TOML under
  `.codex/agents/`, project skills under `.agents/skills/`, and optional project
  config under `.codex/config.toml`; user/global roots resolve role TOML under
  `~/.codex/agents/`, skills under `~/.agents/skills/`, user config under
  `~/.codex/config.toml`, and root instructions under `~/.codex/AGENTS.md`; no
  resolver path mutates OpenCode config or produces an `orchestrator` TOML.
- Codex reset tests: `--agent=codex --reset` refreshes only managed keys/blocks,
  deterministic managed role TOML, and generated package assets; no `force` field
  is accepted and no unmanaged Codex files/directories are deleted.
- Codex root/role tests: Codex-specific root orchestrator guidance is composed
  into `~/.codex/AGENTS.md`, uses managed markers/backups when the file exists,
  references packaged plugin capabilities, role specialists are exactly six
  subagent assets, and no selectable main Codex `orchestrator` or command-model
  UX is promised.
- Codex path tests: home resolution on POSIX/Windows-style homes and supported
  `CODEX_HOME` behavior.
- Codex TOML tests: empty config creation, existing `[features]` merge,
  idempotent repeated merge, existing profiles/MCP/plugin tables preserved,
  comment-loss warning when applicable, parse errors fail without writes.
- Dry-run tests: no config/package/backup/temp writes, but diff/summary includes
  `hooks` and `plugin_hooks` changes and post-install instructions.
- Backup/atomic tests: existing config creates `.bak`, temp file is renamed, write
  errors surface without claiming success.
- Package consumption tests: Codex install invokes or consumes
  `renderCodexPluginPackage` output, validates documented manifest fields only,
  reports package path, and proves custom agents are not bundled in
  `.codex-plugin/plugin.json`; stale/missing package behavior is deterministic.
- Messaging tests: output includes `/plugins` when automatic enablement is not
  docs-backed, `/hooks` trust review, plugin hooks are non-managed/trust-gated,
  config precedence warnings, instruction-only permission/memory-governance
  disclaimers, hook trust disclaimers, and no provider-per-agent overclaim.
- Full checks after implementation: `bun run check:ci`, `bun run typecheck`,
  focused `bun test src/cli src/harness/adapters/codex.test.ts src/harness/adapters/codex-surfaces.test.ts src/harness/writers/codex-plugin-package.test.ts`,
  then the full `bun test` suite.

## Migration / Rollout

1. Add parser/types tests for `--agent` and keep default OpenCode green.
2. Factor installer dispatch without changing OpenCode internals.
3. Add Codex setup-plan models and dry-run diagnostics, then validate harness
   isolation before any Codex writes.
4. Add Codex path and TOML IO modules with tests before wiring CLI mutation.
5. Add the Codex target resolver, then root instruction, role subagent, and
   package artifact write/dry-run wrappers around existing Codex render output.
6. Wire `install --agent=codex` to setup planning, apply-mode managed merges,
   backups, and post-install messaging.
7. Update docs/help and run regression checks.

## Open Questions

- Is `CODEX_HOME` officially supported by the Codex CLI or only acceptable as a
  project convention? Implementation must verify before honoring it silently.
- What documented identifier, if any, should be used for
  `[plugins."..."].enabled` for a locally generated `.codex-plugin/` package?
