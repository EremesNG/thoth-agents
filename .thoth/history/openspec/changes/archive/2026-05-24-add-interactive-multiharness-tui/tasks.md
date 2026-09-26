# Tasks: Add Interactive Multi-Harness TUI

> Assumptions for first-pass execution: no explicit public `thoth-agents tui`
> command is added unless review requests it; status/update/sync/model commands
> emit plain text first; OpenCode model configuration starts with role model
> overrides; non-TTY zero-argument legacy behavior stays quiet to preserve
> automation output.

## Phase 1: Parser, Runtime, and Compatibility Foundation

- [x] 1.1 Add TTY runtime detection — `src/cli/runtime.ts`
  **Verification**:
  - Run: `pnpm test -- -t "runtime"`
  - Expected: Tests cover interactive TTY, non-TTY, `TERM=dumb`, CI, and Windows
    platform contexts without mutating global process streams.

- [x] 1.2 Extract pure argument parsing — `src/cli/parser.ts`,
  `src/cli/types.ts`, `src/cli/index.ts`
  **Verification**:
  - Run: `pnpm test -- -t "parseCliArgs"`
  - Expected: Existing install/generate/help/error parse cases still pass, and
    zero-argument interactive TTY returns `command: 'tui'`.

- [x] 1.3 Preserve non-TTY zero-argument automation behavior —
  `src/cli/parser.ts`, `src/cli/index.test.ts`
  **Verification**:
  - Run: `pnpm test -- -t "zero args"`
  - Expected: Non-TTY, CI, redirected, and dumb-terminal contexts route to
    legacy OpenCode install with `tui: false`, do not block, and do not require
    interactive navigation.

- [x] 1.4 Keep explicit install and generate commands stable —
  `src/cli/parser.ts`, `src/cli/index.ts`, `src/cli/index.test.ts`
  **Verification**:
  - Run: `pnpm test -- -t "install|generate"`
  - Expected: `install --agent=opencode`, `install --agent=codex`,
    `--dry-run`, `--no-tui`, `--reset`, `--tmux=...`, `--skills=...`, and
    `generate --harness=codex --dry-run` retain existing behavior.

- [x] 1.5 Add command dispatch shell for new explicit operations —
  `src/cli/commands.ts`, `src/cli/index.ts`, `src/cli/types.ts`
  **Verification**:
  - Run: `pnpm test -- -t "commands"`
  - Expected: `status`, `list`, `update`, `sync`, and `model` parse and
    dispatch through command helpers while unknown commands preserve current
    diagnostics.

## Phase 2: Shared Operation Contracts

- [x] 2.1 Define shared operation types — `src/cli/operations/types.ts`
  **Verification**:
  - Run: `pnpm run typecheck`
  - Expected: `ManagedState`, status reports, action metadata, dry-run plans,
    model inputs, apply results, and capability disclaimers type-check without
    explicit `any`.

- [x] 2.2 Add operation registry and harness lookup —
  `src/cli/operations/index.ts`
  **Verification**:
  - Run: `pnpm test -- -t "operation registry"`
  - Expected: Registry lists only OpenCode and Codex as supported harnesses and
    exposes unsupported harnesses only as unavailable metadata when needed.

- [x] 2.3 Add plain command formatters for operation data —
  `src/cli/commands.ts`, `src/cli/operations/types.ts`
  **Verification**:
  - Run: `pnpm test -- -t "status|list|update|sync|model"`
  - Expected: Plain output distinguishes `installed`, `missing`, `drift`,
    `outdated`, and `unknown`, and identifies target harness before mutations.

- [x] 2.4 Ensure dry-run and preview are first-class in plans —
  `src/cli/operations/types.ts`, `src/cli/operations/*.test.ts`
  **Verification**:
  - Run: `pnpm test -- -t "OperationPlan"`
  - Expected: Mutation plans include target paths or managed surfaces, backup
    expectations, warnings, disclaimers, `dryRun`, and `canApply`.

## Phase 3: OpenCode Operation Adapter

- [x] 3.1 Implement OpenCode status classification —
  `src/cli/operations/opencode.ts`, `src/cli/config-io.ts`, `src/cli/paths.ts`
  **Verification**:
  - Run: `pnpm test -- -t "OpenCode status"`
  - Expected: Temporary config fixtures classify installed, missing, drift, and
    unknown states without inspecting OpenCode plugin cache internals.

- [x] 3.2 Implement OpenCode update and sync dry-run plans —
  `src/cli/operations/opencode.ts`, `src/cli/install.ts`
  **Verification**:
  - Run: `pnpm test -- -t "OpenCode.*plan"`
  - Expected: Plans reuse existing install/config helpers, preserve
    `plugin: ["thoth-agents@latest"]` messaging, and do not write during
    preview generation.

- [x] 3.3 Implement OpenCode model configuration planning —
  `src/cli/operations/opencode.ts`, `src/config/index.ts`
  **Verification**:
  - Run: `pnpm test -- -t "OpenCode.*model"`
  - Expected: Model plans preserve the seven-agent roster and map role model
    overrides to the supported plugin config shape.

- [x] 3.4 Implement OpenCode plan application path —
  `src/cli/operations/opencode.ts`
  **Verification**:
  - Run: `pnpm test -- -t "OpenCode.*apply"`
  - Expected: Apply requires an explicit plan with `canApply: true`, uses
    existing write helpers, and keeps drift/unknown states from implicit writes.

## Phase 4: Codex Operation Adapter

- [x] 4.1 Implement Codex status classification —
  `src/cli/operations/codex.ts`, `src/cli/codex-install.ts`,
  `src/cli/codex-paths.ts`
  **Verification**:
  - Run: `pnpm test -- -t "Codex status"`
  - Expected: Status reuses managed Codex setup surfaces and reports installed,
    missing, drift, outdated, or unknown without overclaiming root orchestration
    support.

- [x] 4.2 Implement Codex update and sync dry-run plans —
  `src/cli/operations/codex.ts`, `src/cli/codex-install.ts`
  **Verification**:
  - Run: `pnpm test -- -t "Codex.*plan"`
  - Expected: Plans wrap `buildCodexSetupPlan()` outputs, preserve diagnostics
    and disclaimers, and do not mutate generated TOML or state files in preview.

- [x] 4.3 Implement Codex model configuration planning —
  `src/cli/operations/codex.ts`, `src/cli/codex-install.ts`
  **Verification**:
  - Run: `pnpm test -- -t "Codex.*model"`
  - Expected: Plans only target supported generated subagent TOML model lines and
    `.thoth-agents-managed-models.json`; root/orchestrator and provider-per-role
    limitations are shown as guidance-only or unsupported.

- [x] 4.4 Implement Codex plan application path —
  `src/cli/operations/codex.ts`
  **Verification**:
  - Run: `pnpm test -- -t "Codex.*apply"`
  - Expected: Apply delegates to `applyCodexSetup()` or managed model helpers,
    requires an explicit apply action, and preserves user-owned config.

## Phase 5: Ink TUI Surface

- [x] 5.1 Add TUI dependencies and TSX build support — `package.json`,
  `pnpm-lock.yaml`, `tsup.config.ts`
  **Verification**:
  - Run: `pnpm run typecheck`
  - Expected: Ink/React TSX files compile under Node 22 ESM, and package
    `main` plus `bin.thoth-agents` surfaces remain unchanged.

- [x] 5.2 Add TUI entrypoint with dynamic import routing —
  `src/cli/tui/index.tsx`, `src/cli/index.ts`
  **Verification**:
  - Run: `pnpm test -- -t "interactive TUI"`
  - Expected: Interactive no-argument routing calls `runInteractiveTui()`, while
    non-interactive paths avoid loading the Ink renderer.

- [x] 5.3 Build root TUI navigation and harness selection —
  `src/cli/tui/App.tsx`, `src/cli/tui/components/*.tsx`,
  `src/cli/tui/theme.ts`
  **Verification**:
  - Run: `pnpm test -- -t "TUI.*menu"`
  - Expected: Initial TUI shows OpenCode and Codex actions, supports keyboard
    navigation, and does not show unsupported harnesses as installable targets.

- [x] 5.4 Build status, list, update, and sync screens —
  `src/cli/tui/App.tsx`, `src/cli/tui/components/*.tsx`
  **Verification**:
  - Run: `pnpm test -- -t "TUI.*status|TUI.*plan"`
  - Expected: Screens render operation data from mocked adapters, refresh safely,
    preview mutation plans, and never write on screen open or navigation.

- [x] 5.5 Build model configuration screen —
  `src/cli/tui/App.tsx`, `src/cli/tui/components/*.tsx`
  **Verification**:
  - Run: `pnpm test -- -t "TUI.*model"`
  - Expected: OpenCode role model controls preserve all seven roles, Codex
    limitations are visible, and changes produce preview plans before apply.

- [x] 5.6 Add plan preview, warning, and apply/cancel components —
  `src/cli/tui/components/*.tsx`
  **Verification**:
  - Run: `pnpm test -- -t "TUI.*preview|TUI.*apply"`
  - Expected: Preview displays target harness, paths, warnings, backups,
    disclaimers, Windows-flavored paths, and requires explicit apply.

- [x] 5.7 Add TUI component tests and snapshots —
  `src/cli/tui/*.test.tsx`, `src/cli/tui/components/*.test.tsx`
  **Verification**:
  - Run: `pnpm test -- -t "TUI"`
  - Expected: Ink tests cover initial menu, harness selection, status refresh,
    preview cancellation, explicit apply, and Windows path wrapping.

## Phase 6: Documentation, Package Messaging, and Release Checks

- [x] 6.1 Update install and CLI documentation — `README.md`,
  `docs/installation.md`, `docs/codex-install.md`
  **Verification**:
  - Run: `pnpm run check:ci`
  - Expected: Documentation distinguishes OpenCode plugin config from npm binary
    availability via global install, `npx`, or `pnpm dlx`.

- [x] 6.2 Update command help and user-facing messaging —
  `src/cli/commands.ts`, `src/cli/index.ts`, `src/cli/*.test.ts`
  **Verification**:
  - Run: `pnpm test -- -t "help|binary|plugin"`
  - Expected: CLI help and status output accurately describe plugin-vs-binary
    surfaces and do not imply OpenCode plugin install creates a global binary.

- [x] 6.3 Verify Windows and CI safety paths —
  `src/cli/runtime.ts`, `src/cli/tui/*.test.tsx`, `src/cli/operations/*.test.ts`
  **Verification**:
  - Run: `pnpm test -- -t "Windows|CI|TERM=dumb|non-TTY"`
  - Expected: Tests cover backslash paths, CI/non-TTY fallback, no shell-specific
    apply commands, and simple terminal fallback behavior.

- [x] 6.4 Run lint/format validation —
  all changed files
  **Verification**:
  - Run: `pnpm run check:ci`
  - Expected: Biome reports no formatting or lint issues.

- [x] 6.5 Run TypeScript validation —
  all changed files
  **Verification**:
  - Run: `pnpm run typecheck`
  - Expected: TypeScript reports no type errors.

- [x] 6.6 Run full test suite —
  all changed files
  **Verification**:
  - Run: `pnpm test`
  - Expected: Vitest suite passes, including parser, operation adapter, command,
    and Ink TUI tests.

- [x] 6.7 Run package build —
  package outputs
  **Verification**:
  - Run: `pnpm run build`
  - Expected: `dist/index.js`, `dist/cli/index.js`, declarations, schema
    generation, and package surfaces build successfully.
