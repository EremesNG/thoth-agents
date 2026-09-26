# Design: Add Interactive Multi-Harness TUI

## Technical Approach

Add an interactive terminal shell above the existing CLI command core without
moving installer side effects into presentation code. The current entrypoint in
`src/cli/index.ts` parses arguments and dispatches directly to `install()` or
Codex generation. This design keeps explicit commands stable, but changes
zero-argument routing so an interactive terminal opens a TUI and a non-TTY
keeps a deterministic legacy-compatible command path.

Use a small command-core layer that returns operation plans and status records,
then let both the TUI and command handlers consume the same functions. The TUI
is responsible for navigation, summaries, confirmation, and progress display;
the service layer remains responsible for resolving paths, classifying managed
state, creating dry-run plans, and applying mutations. This matches the current
Codex setup lifecycle in `src/cli/codex-install.ts`, where
`buildCodexSetupPlan()` and `applyCodexSetup()` are already separated.

The rich TUI should use Ink with React. Gentle-AI itself uses Charmbracelet
Bubble Tea, Bubbles, and Lip Gloss in Go; Ink is the closest practical
TypeScript/Node analogue for componentized terminal UIs, keyboard navigation,
layout primitives, and testable render output while preserving the package's
Node 22 ESM distribution. The first implementation should avoid extra widget
packages unless needed: implement menu/list panes with Ink's `Box`, `Text`,
`useInput`, and local state, and add `ink-testing-library` for focused tests.

No backup/restore system is introduced as a separate product feature. Existing
write helpers already create `.bak` files for OpenCode/Codex config mutations
where appropriate. New update/sync flows should report whether a target would
be backed up by the underlying plan item, but broader restore management stays
out of scope for the first TUI.

## Architecture Decisions

### Decision: Use Ink for the TypeScript TUI

**Choice**: Add Ink and React as runtime dependencies, plus test support for Ink
components. Build the TUI under `src/cli/tui/` as React components rendered only
from the CLI binary.

**Alternatives considered**:

- Port Gentle-AI's Bubble Tea approach by adding a Go binary.
- Use `@inquirer/prompts` for a prompt sequence.
- Use terminal-kit or blessed-style imperative widgets.

**Rationale**: Bubble Tea is the inspiration, but this package ships a Node ESM
CLI and OpenCode plugin from one npm package. Ink gives a component model close
to Bubble Tea's state/update/view loop without introducing a second language or
release artifact. Inquirer is good for forms, but it is less suitable for a
status dashboard with refreshable panels, persistent navigation, and preview
screens. Imperative terminal widgets would make snapshot and reducer testing
harder.

### Decision: Zero-argument routing is TTY-aware

**Choice**: `parseCliArgs` should accept an injectable runtime context
(`stdin.isTTY`, `stdout.isTTY`, `TERM`, and CI flags) and return a new
`command: 'tui'` only when there are no arguments and the terminal supports an
interactive UI. Zero-argument non-TTY invocations should keep the legacy
OpenCode install behavior with `tui: false` and stable output.

**Alternatives considered**:

- Always launch the TUI for no arguments.
- Always print help for no arguments.
- Require `thoth-agents tui` and leave no-arg behavior unchanged.

**Rationale**: The spec requires no-arg interactive terminals to open the rich
TUI instead of immediately applying the installer. It also requires non-TTY
usage to avoid blocking and remain automation-safe. Keeping the non-TTY path on
the existing install command preserves compatibility for scripts that relied on
the old no-arg installer, while explicit `install` remains the recommended
automation surface.

### Decision: Keep explicit commands as stable automation APIs

**Choice**: Preserve `install`, `generate`, flags, diagnostics, dry-run behavior,
and OpenCode default `--agent` handling. Add new explicit commands only as thin
wrappers over shared services: likely `status`, `list`, `update`, `sync`, and
`model`.

**Alternatives considered**:

- Make every operation TUI-only.
- Replace the current parser with a large command framework immediately.

**Rationale**: Current tests assert that `parseCliArgs([])` maps to install and
that `install --agent=opencode|codex` and `generate --harness=codex --dry-run`
remain supported. The implementation can evolve the parser incrementally by
moving it to pure command definitions and preserving exported parse behavior
through tests.

### Decision: Introduce a shared operation/state layer

**Choice**: Add `src/cli/operations/` with typed functions for harness listing,
status, update plan creation, sync plan creation, and model configuration plan
creation. Each operation returns serializable data that can be printed by CLI
commands or rendered by the TUI.

**Alternatives considered**:

- Let each TUI screen call low-level file helpers directly.
- Extend `install.ts` with more console-oriented branches.

**Rationale**: The TUI must not duplicate mutation behavior. A shared layer
makes dry-run, status taxonomy, and harness capability boundaries testable
without running a terminal renderer.

### Decision: Use harness adapters for capability-aware status and actions

**Choice**: Define a CLI-facing adapter interface separate from
`HarnessAdapter.render()`:

```ts
interface HarnessCliAdapter {
  id: HarnessId;
  displayName: string;
  listActions(): HarnessAction[];
  getStatus(context: OperationContext): Promise<HarnessStatusReport>;
  buildUpdatePlan(context: OperationContext): Promise<OperationPlan>;
  buildSyncPlan(context: OperationContext): Promise<OperationPlan>;
  buildModelPlan(input: ModelConfigInput): Promise<OperationPlan>;
  applyPlan(plan: OperationPlan): Promise<OperationApplyResult>;
}
```

The OpenCode implementation should wrap existing `config-io`, `paths`,
`system`, and provider config helpers. The Codex implementation should wrap
`buildCodexSetupPlan()`, `applyCodexSetup()`, `resolveCodexTargets()`,
`CODEX_ROLE_NAMES`, `codex-surfaces`, and managed model state behavior.

**Alternatives considered**:

- Reuse `HarnessAdapter` directly for runtime status/update.
- Add one generic filesystem scanner.

**Rationale**: `HarnessAdapter` currently renders installable artifacts, not
observed local state. Status/update/model operations need path resolution,
ownership tracking, drift classification, and apply behavior that belongs in a
CLI adapter, not a renderer.

### Decision: Status classification is explicit and conservative

**Choice**: Model managed state as
`installed | missing | drift | outdated | unknown`, with optional detail
records for target paths, versions, expected markers, observed markers, and
capability disclaimers.

**Alternatives considered**:

- Return boolean installed/not installed.
- Treat parse failures as missing.

**Rationale**: The spec requires drift, outdated, and unknown to remain
distinguishable. Unknown state must not be presented as repairable. Parse
failures, unsupported inspection, or user-owned config should produce `unknown`
or `drift` with a preview-only recommendation.

### Decision: TUI mutation flows are preview-first

**Choice**: Every TUI mutation screen first builds an `OperationPlan` in dry-run
mode, renders the targets and warnings, and requires an explicit apply action.
Opening, refreshing, navigating, or changing selection never writes files.

**Alternatives considered**:

- Apply immediately after menu selection.
- Reuse `install()` directly from the TUI for convenience.

**Rationale**: Existing command paths are already mutation-capable. The TUI adds
more exploratory navigation and therefore needs stronger safety boundaries than
one-shot commands.

### Decision: Model configuration respects harness boundaries

**Choice**: OpenCode model configuration edits the plugin config model override
surface for the seven-agent roster. Codex model configuration initially
operates only on managed role TOML model lines tracked by
`.thoth-agents-managed-models.json`, and it displays root/orchestrator and
provider-per-role limitations as instruction-level or user-managed unless the
Codex surface registry marks them supported.

**Alternatives considered**:

- Offer identical role-level model editing for OpenCode and Codex.
- Let Codex TUI edit every TOML field it finds.

**Rationale**: OpenCode has first-class plugin config and agent definitions for
the full roster. Codex has validated subagent TOML and project/user config
surfaces, but root orchestration remains ambient instruction behavior and some
permission/provider behavior is instruction-level. The TUI must not overclaim
unsupported role-level guarantees.

## Data Flow

1. `src/cli/index.ts` receives raw args and an injectable runtime context.
2. `parseCliArgs(args, context)` returns `tui`, `install`, `generate`, `status`,
   `list`, `update`, `sync`, `model`, `help`, or `error`.
3. For `tui`, `main()` dynamically imports `src/cli/tui/index.tsx` and calls
   `runInteractiveTui({ adapters, context })`. Dynamic import keeps React/Ink
   isolated from non-interactive startup and makes tests easier to mock.
4. TUI root loads `getHarnessSummaries()` from the operation layer and renders
   OpenCode and Codex cards/panes.
5. Selecting an action calls the matching adapter operation in dry-run/preview
   mode and renders the returned `OperationPlan`.
6. Applying a plan calls `adapter.applyPlan(plan)`, then refreshes status.
7. Explicit CLI commands call the same operation functions and format the same
   data as plain text or JSON where useful.

## File Changes

Planned new files:

- `src/cli/runtime.ts` - TTY/support detection and injectable CLI runtime
  context.
- `src/cli/parser.ts` - pure argument parsing moved out of `index.ts`.
- `src/cli/commands.ts` - command dispatch helpers for explicit command paths.
- `src/cli/operations/types.ts` - shared status, plan, and result types.
- `src/cli/operations/index.ts` - operation registry and harness lookup.
- `src/cli/operations/opencode.ts` - OpenCode status/update/sync/model adapter.
- `src/cli/operations/codex.ts` - Codex status/update/sync/model adapter.
- `src/cli/tui/index.tsx` - `runInteractiveTui()` entrypoint using Ink.
- `src/cli/tui/App.tsx` - root layout and navigation state.
- `src/cli/tui/components/*.tsx` - menu, status panel, plan preview, warnings,
  and model selection components.
- `src/cli/tui/theme.ts` - shared terminal colors and symbols with ASCII
  fallback.
- `src/cli/tui/*.test.tsx` - TUI behavior and snapshot tests.
- `src/cli/operations/*.test.ts` - service-level status and plan tests.

Planned modified files:

- `src/cli/index.ts` - slim entrypoint; route zero-arg TTY to TUI, preserve
  explicit commands, and export parser from the new module.
- `src/cli/types.ts` - add command variants and operation argument types.
- `src/cli/install.ts` - expose reusable OpenCode plan/status helpers where
  needed, while preserving `install(args)`.
- `src/cli/codex-install.ts` - expose managed model/status helpers without
  changing current plan/apply semantics.
- `src/cli/config-io.ts` and `src/cli/paths.ts` - add non-mutating status
  helpers only if existing functions are insufficient.
- `src/harness/types.ts` - optionally add shared status/capability metadata if
  operation types need harness-wide reuse.
- `package.json` - add Ink/React runtime dependencies, test dependencies, and
  keep `main` and `bin` surfaces unchanged.
- `tsup.config.ts` - keep `index` and `cli/index` entries; ensure TSX/React JSX
  compiles for the CLI entry without creating a second package surface.
- `docs/installation.md`, `docs/codex-install.md`, and README sections - update
  no-arg TUI behavior and plugin-vs-binary messaging.
- Existing tests under `src/cli/*.test.ts` and `src/harness/**/*.test.ts` -
  update expectations around no-arg routing and add new coverage.

No planned deleted files.

## Interfaces / Contracts

`CliParseResult` should gain explicit operation variants:

```ts
type CliParseResult =
  | { command: 'tui' }
  | { command: 'install'; installArgs: InstallArgs }
  | { command: 'generate'; generateArgs: GenerateArgs }
  | { command: 'status'; args: StatusArgs }
  | { command: 'list'; args: ListArgs }
  | { command: 'update'; args: MutationArgs }
  | { command: 'sync'; args: MutationArgs }
  | { command: 'model'; args: ModelArgs }
  | { command: 'help' }
  | { command: 'error'; message: string };
```

The TTY contract should be testable without mutating globals:

```ts
interface CliRuntimeContext {
  stdinIsTTY: boolean;
  stdoutIsTTY: boolean;
  term?: string;
  ci?: boolean;
  platform: NodeJS.Platform;
}
```

The status contract should be shared by TUI and plain commands:

```ts
type ManagedState = 'installed' | 'missing' | 'drift' | 'outdated' | 'unknown';

interface HarnessStatusReport {
  harness: HarnessId;
  state: ManagedState;
  targets: StatusTarget[];
  diagnostics: string[];
  nextActions: HarnessAction[];
}
```

The plan contract should make safety visible:

```ts
interface OperationPlan {
  harness: HarnessId;
  action: 'install' | 'update' | 'sync' | 'repair' | 'model-config';
  dryRun: boolean;
  items: OperationPlanItem[];
  warnings: string[];
  disclaimers: string[];
  canApply: boolean;
}
```

OpenCode contracts:

- Plugin config guidance continues to use `plugin: ["thoth-agents@latest"]`.
- OpenCode status may inspect `opencode.json`/`opencode.jsonc` and
  `thoth-agents.json`/`thoth-agents.jsonc` through existing path helpers.
- OpenCode model config uses the seven-agent roster and existing
  `PluginConfigSchema.agents` override shape.

Codex contracts:

- Codex install/update uses `buildCodexSetupPlan()` and `applyCodexSetup()`.
- Codex role model edits are limited to generated subagent TOML files and the
  managed model state file already used by `codex-install.ts`.
- Codex root/orchestrator model configuration is shown as unsupported or
  guidance-only unless a validated config surface is added later.

Package contracts:

- `package.json.main` remains `dist/index.js` for OpenCode plugin loading.
- `package.json.bin.thoth-agents` remains `./dist/cli/index.js` for shell usage.
- Documentation must state that OpenCode plugin auto-install does not place the
  npm binary on `PATH`; users need global install, `npx`, or `pnpm dlx` for the
  CLI.

## Testing Strategy

Parser and entry routing:

- Unit test zero args with interactive TTY returns `command: 'tui'`.
- Unit test zero args with non-TTY returns legacy `install` with `tui: false`
  and `agent: 'opencode'`.
- Unit test `install`, `generate`, `--help`, unsupported commands, and existing
  flags remain compatible.
- Unit test `TERM=dumb` and CI contexts do not launch TUI.

Operation layer:

- Test OpenCode status classifies `installed`, `missing`, `drift`, and
  `unknown` using temporary config files and parse failures.
- Test Codex status and update plans reuse `buildCodexSetupPlan()` outputs and
  preserve diagnostics/disclaimers.
- Test model configuration plans include OpenCode seven-agent roles and Codex
  supported subagent role models only.
- Test drift/unknown states produce `canApply: false` or require explicit repair
  command paths.

TUI:

- Use Ink component tests for initial menu, harness selection, status refresh,
  plan preview, cancellation, and explicit apply.
- Mock operation adapters so TUI tests do not write files.
- Include Windows-flavored paths in plan preview snapshots to catch path wrapping
  and separator issues.

Integration/verification:

- Run `pnpm run check:ci`.
- Run `pnpm run typecheck`.
- Run focused tests during implementation, then `pnpm test`.
- For future visual QA of the TUI, use terminal snapshot tests rather than
  browser screenshots.

## Migration / Rollout

1. Add parser/runtime tests first to lock compatibility and TTY routing.
2. Extract parser and operation types without changing behavior.
3. Add operation adapters around existing OpenCode and Codex helpers.
4. Add the Ink TUI and route no-arg interactive calls to it.
5. Add explicit status/list/update/sync/model commands as thin wrappers.
6. Update docs to clarify binary versus OpenCode plugin installation.

Backward compatibility:

- Existing explicit install/generate commands keep their syntax.
- OpenCode remains the default for explicit `install` when `--agent` is omitted.
- Non-TTY zero-arg invocation remains non-interactive and legacy-compatible.
- OpenCode plugin loading through `plugin: ["thoth-agents@latest"]` is unchanged.
- Codex setup remains managed-only; no destructive force/reset behavior is
  introduced.

Windows considerations:

- TTY detection must use Node stream `isTTY`, `TERM`, and CI flags rather than
  POSIX-only checks.
- Render paths through path-aware formatters so `C:\...` and backslashes do not
  get treated as escape sequences in TOML/JSON previews.
- Avoid shell-specific commands in TUI apply paths; use existing Node helpers.
- Handle terminals without alternate-screen/color support by rendering a simple
  list UI or falling back to help/install guidance.
- Keep dynamic TUI import out of non-interactive paths so CI and Windows shells
  that lack full terminal capabilities do not pay renderer startup cost.

## Open Questions

- Should explicit `thoth-agents tui` be added in the first implementation, or
  should the first public entry be no-arg TTY only?
- Should plain status/update commands emit JSON with `--json` in the first pass,
  or should that wait until the operation contracts stabilize?
- How far should OpenCode model configuration go in the first TUI: role model
  overrides only, or provider preset selection as well?
- Should non-TTY zero-arg legacy install print a deprecation note encouraging
  explicit `install`, or stay silent to avoid altering automation output?
