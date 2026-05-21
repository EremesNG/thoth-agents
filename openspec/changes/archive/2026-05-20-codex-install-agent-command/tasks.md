# Tasks: Codex Install Agent Command

## Phase 1: CLI Contract and OpenCode Regression

- [x] 1.1 Add installer agent selection types — `src/cli/types.ts`
  **Verification**:
  - Run: `bun run typecheck`
  - Expected: `InstallArgs` and related installer types compile with
    `agent: 'opencode' | 'codex'` and no TypeScript errors.

- [x] 1.2 Parse `--agent=opencode|codex` and update help text —
  `src/cli/index.ts`, `src/cli/index.test.ts`
  **Verification**:
  - Run: `bun test src/cli/index.test.ts`
  - Expected: Tests cover bare install defaulting to OpenCode, explicit
    `--agent=opencode`, explicit `--agent=codex`, unsupported agent diagnostics,
    and examples for both public commands.

- [x] 1.3 Refactor install dispatch while preserving OpenCode behavior —
  `src/cli/install.ts`, `src/cli/install.test.ts`
  **Verification**:
  - Run: `bun test src/cli/install.test.ts`
  - Expected: Existing OpenCode install config behavior remains unchanged for
    bare install and `--agent=opencode`, including `--dry-run`, `--reset`,
    `--tmux`, `--skills`, and bundled skill defaults.

- [x] 1.4 Add harness isolation regression coverage — `src/cli/install.test.ts`,
  `src/cli/config-io.test.ts`
  **Verification**:
  - Run: `bun test src/cli/install.test.ts src/cli/config-io.test.ts`
  - Expected: `--agent=codex` does not mutate OpenCode config or an existing
    `oh-my-opencode-lite@latest` plugin entry; bare install and
    `--agent=opencode` do not create or mutate Codex targets.

## Phase 2: Codex Setup Planning, Paths, and TOML Merge Safety

- [x] 2.1 Model Codex setup plans and dry-run diagnostics —
  `src/cli/codex-install.ts`, optional `src/cli/codex-setup-plan.ts`,
  `src/cli/codex-install.test.ts`
  **Verification**:
  - Run: `bun test src/cli/codex-install.test.ts`
  - Expected: `buildCodexSetupPlan` reports root instruction, role subagent,
    `.codex-plugin/`, config, hook/plugin, backup, capability, and trust-review
    actions; `--dry-run` prints the plan and writes no package/config/backup/temp
    files.

- [x] 2.2 Model managed-only Codex reset semantics — `src/cli/types.ts`,
  `src/cli/codex-install.ts`, `src/cli/codex-install.test.ts`
  **Verification**:
  - Run: `bun test src/cli/codex-install.test.ts && bun run typecheck`
  - Expected: Codex install types expose no `force` field; `--agent=codex
    --reset` is modeled as managed-only repair for managed TOML keys, managed
    instruction blocks, deterministic managed role files, and generated package
    assets, with tests proving unmanaged Codex files and directories are not
    deleted or whole-file overwritten.

- [x] 2.3 Implement Codex config path resolution — `src/cli/codex-paths.ts`,
  `src/cli/codex-paths.test.ts`
  **Verification**:
  - Run: `bun test src/cli/codex-paths.test.ts`
  - Expected: Tests prove default home-based `.codex/config.toml` resolution,
    Windows-style home handling, and documented/project-approved `CODEX_HOME`
    behavior without hardcoded product paths.

- [x] 2.4 Implement conservative Codex TOML parse/merge/render helpers —
  `src/cli/codex-config-io.ts`, `src/cli/codex-config-io.test.ts`
  **Verification**:
  - Run: `bun test src/cli/codex-config-io.test.ts`
  - Expected: Tests cover empty config creation, `[features].hooks = true`,
    `[features].plugin_hooks = true`, idempotent repeated merges, and semantic
    preservation of existing profiles, MCP servers, plugins, and unknown tables.

- [x] 2.5 Add backup, atomic write, dry-run diff, and comment-loss warning paths —
  `src/cli/codex-config-io.ts`, `src/cli/codex-config-io.test.ts`
  **Verification**:
  - Run: `bun test src/cli/codex-config-io.test.ts`
  - Expected: Existing configs create a backup before write, writes use temp +
    rename, dry-run writes no files, parse/write failures report errors without
    success, and formatting/comment preservation limitations are disclosed.

- [x] 2.6 Implement scope-aware Codex target resolver —
  `src/cli/codex-paths.ts`, `src/cli/codex-install.ts`,
  `src/cli/codex-paths.test.ts`, `src/cli/codex-install.test.ts`
  **Verification**:
  - Run: `bun test src/cli/codex-paths.test.ts src/cli/codex-install.test.ts`
  - Expected: Tests cover role TOML under
    `.codex/agents/oh-my-opencode-lite-{role}.toml` or
    `~/.codex/agents/oh-my-opencode-lite-{role}.toml`, skills under
    `.agents/skills/` or `~/.agents/skills/`, config under
    `~/.codex/config.toml`, and root instructions under `~/.codex/AGENTS.md`
    with markers `oh-my-opencode-lite:codex-root:start` and
    `oh-my-opencode-lite:codex-root:end`; no fallback generated instruction file
    and no selectable `orchestrator` TOML target are produced.

## Phase 3: Codex Asset Materialization and Installer Flow

- [x] 3.1 Add a CLI-facing Codex package artifact writer/consumer —
  `src/cli/codex-install.ts`, `src/harness/writers/codex-plugin-package.ts`,
  `src/harness/writers/codex-plugin-package.test.ts`
  **Verification**:
  - Run: `bun test src/harness/writers/codex-plugin-package.test.ts`
  - Expected: Existing deterministic `.codex-plugin/` package fixture tests stay
    green, documented manifest fields (`name`, `version`, `description`,
    `skills`, `mcpServers`, `apps`, `hooks`, `interface`) are validated, custom
    agents are not emitted in `plugin.json`, and any added CLI wrapper coverage
    proves missing/stale package preparation uses the package writer rather than
    hand-written artifacts.

- [x] 3.2 Add root instruction composition for the ambient Codex session —
  `src/cli/codex-install.ts`, `src/harness/adapters/codex-surfaces.ts`,
  `src/harness/adapters/codex-surfaces.test.ts`, `src/cli/codex-install.test.ts`
  **Verification**:
  - Run: `bun test src/harness/adapters/codex-surfaces.test.ts src/cli/codex-install.test.ts`
  - Expected: Setup planning/apply mode merges Codex-specific oh-my-opencode-lite
    orchestrator guidance into `~/.codex/AGENTS.md` with managed markers,
    preserves unrelated user instructions, creates backups when the file exists
    before lossy rewrites, references packaged plugin capabilities, and never
    emits a selectable main Codex `orchestrator` agent requirement.

- [x] 3.3 Materialize role subagents and capability disclaimers —
  `src/cli/codex-install.ts`, `src/harness/adapters/codex.ts`,
  `src/harness/writers/codex-toml.ts`, `src/harness/adapters/codex.test.ts`,
  `src/cli/codex-install.test.ts`
  **Verification**:
  - Run: `bun test src/harness/adapters/codex.test.ts src/cli/codex-install.test.ts`
  - Expected: Explorer, librarian, oracle, designer, quick, and deep are planned
    as the only six deterministic Codex subagent/equivalent role assets named
    `oh-my-opencode-lite-{role}.toml` in the resolver-selected project or
    user/global agents directory; no seventh `orchestrator` TOML is generated;
    unsupported runtime permission, memory-
    governance, provider-per-agent, or hook-enforcement controls are reported as
    instruction-only or user-managed limitations.

- [x] 3.4 Implement `install --agent=codex` orchestration —
  `src/cli/codex-install.ts`, `src/cli/install.ts`, `src/cli/install.test.ts`
  **Verification**:
  - Run: `bun test src/cli/install.test.ts`
  - Expected: Codex install prepares package artifacts, merges managed Codex
    config only outside dry-run, respects managed-only Codex reset semantics with
    no broad `--force`, applies setup-plan actions through backups/atomic writes,
    and does not
    execute OpenCode checks or OpenCode config mutation.

- [x] 3.5 Gate plugin config enablement on safe docs-backed identifiers —
  `src/cli/codex-install.ts`, `src/cli/codex-config-io.ts`,
  `src/cli/codex-config-io.test.ts`
  **Verification**:
  - Run: `bun test src/cli/codex-config-io.test.ts src/cli/install.test.ts`
  - Expected: Tests prove `[plugins."..."].enabled = true` is written only when
    a safe documented plugin identifier is supplied; otherwise installer output
    directs the user to `/plugins` without writing guessed plugin entries.

## Phase 4: Trust, Diagnostics, and Documentation

- [x] 4.1 Add Codex post-install and dry-run messaging — `src/cli/codex-install.ts`,
  `src/cli/install.test.ts`
  **Verification**:
  - Run: `bun test src/cli/install.test.ts`
  - Expected: Output includes `/plugins` when manual enablement is required,
    `/hooks` trust review, explicit `features.plugin_hooks` limitations, and
    warnings about profile/CLI/project/system/admin precedence, instruction-only
    governance limits, and provider-per-agent non-guarantees where undocumented.
    Output does not present direct `@plugin_name` invocation as the primary UX.

- [x] 4.2 Document Codex install behavior and limitations —
  `docs/codex-install.md`, `docs/codex-plugin-packaging.md`
  **Verification**:
  - Run: `bun run check:ci`
  - Expected: Biome check passes and docs describe `install --agent=codex`,
    `install --agent=opencode`, dry-run, backups, TOML merge behavior, package
    artifact consumption, ambient/root Codex orchestration, role subagents,
    `.codex-plugin` manifest scope, custom agents being generated outside the
    plugin package, `/plugins`, `/hooks`, capability disclaimers, and non-goals.

- [x] 4.3 Update public CLI examples and package-facing docs — `README.md`,
  `src/cli/index.ts`, `src/cli/index.test.ts`
  **Verification**:
  - Run: `bun test src/cli/index.test.ts && bun run check:ci`
  - Expected: Help and README examples include both public install commands and
    avoid claiming a selectable main Codex orchestrator, `$deep-interview` command
    UX, provider setup/per-agent providers, hook trust bypass, tmux cleanup
    mapping, or non-Codex harness support.

## Phase 5: Full Verification

- [x] 5.1 Run type checking after installer integration — all changed TypeScript
  files
  **Verification**:
  - Run: `bun run typecheck`
  - Expected: TypeScript completes with no errors.

- [x] 5.2 Run focused CLI and Codex harness tests — `src/cli/`,
  `src/harness/writers/codex-plugin-package.test.ts`
  **Verification**:
  - Run: `bun test src/cli src/harness/adapters/codex.test.ts src/harness/adapters/codex-surfaces.test.ts src/harness/writers/codex-plugin-package.test.ts`
  - Expected: Focused installer, config IO, path, and package writer tests all
    pass, including setup-plan, root instruction, role subagent, and capability
    disclaimer coverage.

- [x] 5.3 Run full project checks — repository root
  **Verification**:
  - Run: `bun run check:ci && bun run typecheck && bun test`
  - Expected: Formatting/lint check, TypeScript typecheck, and the full Bun test
    suite pass without regressions.
