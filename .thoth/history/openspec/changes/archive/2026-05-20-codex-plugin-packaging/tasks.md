# Tasks: Codex Plugin Packaging

## Scope Notes

- This plan implements Codex plugin package artifacts only; it does not implement
  `install --agent=codex` or mutate user Codex configuration.
- OpenCode behavior must remain unchanged throughout the change.
- Existing Codex `.codex/agents/*.toml` and `.codex/config.toml` generation must
  remain stable unless a task explicitly documents a boundary change.
- Every hook task must preserve the distinction between packaging hooks and
  enabling/trusting hooks at runtime.

## Phase 1: Codex Plugin Surface Model

- [x] 1.1 Register Codex plugin package surfaces —
  `src/harness/adapters/codex-surfaces.ts` and
  `src/harness/adapters/codex-surfaces.test.ts`
  - Add validated records for `.codex-plugin/plugin.json`, plugin-root
    `./skills/`, and plugin-root hook bundles such as `./hooks/hooks.json`.
  - Include fields for official manifest keys (`name`, `version`,
    `description`, `skills`, `mcpServers`, `apps`, `hooks`, `interface`) and
    fail closed on unvalidated plugin paths or fields.
  - Keep existing project-local Codex agent/config/hook records intact.
  **Verification**:
  - Run: `bun test src/harness/adapters/codex-surfaces.test.ts`
  - Expected: Tests prove plugin manifest/skills/hooks surfaces are validated,
    unregistered plugin fields produce diagnostics, and existing Codex surface
    tests still pass.

- [x] 1.2 Update Codex packaging documentation —
  `docs/codex-surface-validation.md` and `docs/codex-plugin-packaging.md`
  - Document plugin-bundled skills as the primary Codex delivery strategy.
  - Document `.agents/skills` as fallback/dev/repo-local mode.
  - Document hook feature gates, trust review, and the unresolved skill precedence
    risk for duplicate plugin and `.agents/skills` scopes.
  **Verification**:
  - Run: `bun run check:ci`
  - Expected: Biome accepts the added/updated markdown and no formatting issues
    are reported.

## Phase 2: Plugin Package Writer

- [x] 2.1 Add deterministic plugin package writer —
  `src/harness/writers/codex-plugin-package.ts` and
  `src/harness/writers/codex-plugin-package.test.ts`
  - Render `.codex-plugin/plugin.json` with stable JSON ordering and official
    fields only.
  - Normalize all manifest asset references to plugin-root relative `./` paths.
  - Return diagnostics instead of manifest entries for unvalidated assets or
    paths outside `.codex-plugin/`.
  **Verification**:
  - Run: `bun test src/harness/writers/codex-plugin-package.test.ts`
  - Expected: Tests pass for deterministic `plugin.json`, `./skills/` and
    `./hooks/hooks.json` references, official-field filtering, and fail-closed
    diagnostics.

- [x] 2.2 Add plugin package fixtures — `src/harness/__fixtures__/codex/`
  - Add representative fixtures for `plugin.json`, plugin skill provenance, and
    optional plugin hook configuration.
  - Keep fixtures deterministic and scoped to Codex plugin packaging only.
  **Verification**:
  - Run: `bun test src/harness/writers/codex-plugin-package.test.ts -t "fixture"`
  - Expected: Fixture comparison proves repeated package renders produce stable
    output.

## Phase 3: Skill Bundling and Fallback Mode

- [x] 3.1 Parameterize Codex skill layout output —
  `src/harness/writers/skill-layout.ts` and
  `src/harness/writers/skill-layout.test.ts`
  - Add an output mode for primary plugin packaging that writes
    `.codex-plugin/skills/<skill>/...`.
  - Keep `.agents/skills/<skill>/...` generation available only through an
    explicit fallback/dev/repo-local mode.
  - Preserve recursive file collection, deterministic sorting, SHA-256 hashes,
    source-path provenance, and missing-source diagnostics.
  **Verification**:
  - Run: `bun test src/harness/writers/skill-layout.test.ts`
  - Expected: Tests prove primary output uses `.codex-plugin/skills`, fallback
    mode is explicit, missing sources are diagnosed, and source manifests remain
    deterministic.

- [x] 3.2 Preserve SDD skill semantics in plugin-bundled assets —
  `src/harness/writers/skill-layout.test.ts` and `src/harness/core/skills.test.ts`
  - Update portability tests so requirements-interview and SDD skills are checked
    under plugin-bundled paths.
  - Assert phase responsibilities, persistence-mode rules, artifact
    prerequisites, and review gates remain present in bundled skill content.
  **Verification**:
  - Run: `bun test src/harness/writers/skill-layout.test.ts src/harness/core/skills.test.ts -t "SDD"`
  - Expected: Focused tests prove plugin-bundled SDD skills retain existing
    semantic anchors and registry metadata.

- [x] 3.3 Diagnose duplicate plugin and fallback skill scopes —
  `src/harness/writers/skill-layout.ts` and
  `src/harness/writers/skill-layout.test.ts`
  - Emit a diagnostic when the same skill names are rendered or selected for both
    plugin-bundled and `.agents/skills` fallback output.
  - Message the unresolved runtime precedence risk without claiming a verified
    ordering.
  **Verification**:
  - Run: `bun test src/harness/writers/skill-layout.test.ts -t "duplicate"`
  - Expected: Duplicate skill scope tests return a visible diagnostic and still
    identify plugin-bundled skills as primary package content.

## Phase 4: Hook Packaging Diagnostics

- [x] 4.1 Add conservative plugin hook bundling —
  `src/harness/writers/codex-plugin-package.ts`,
  `src/harness/adapters/codex-surfaces.ts`, and related tests
  - Bundle hook configuration under `.codex-plugin/hooks/hooks.json` only for
    hook definitions that pass existing Codex hook validation.
  - Reference hook configuration from `plugin.json` using a plugin-root `./` path.
  - Skip unsupported events, handler types, async execution, unsupported output
    fields, or tool-interception hooks with diagnostics.
  **Verification**:
  - Run: `bun test src/harness/adapters/codex-surfaces.test.ts src/harness/writers/codex-plugin-package.test.ts -t "hook"`
  - Expected: Tests prove valid command hooks can be packaged and unsupported
    hook surfaces produce diagnostics without hook artifacts.

- [x] 4.2 Preserve hook trust and feature-gate diagnostics —
  `src/harness/adapters/codex.ts` and `src/harness/adapters/codex.test.ts`
  - Ensure generated results state that bundled plugin hooks require
    `features.plugin_hooks` and trust review before activation.
  - Ensure hook package diagnostics do not claim automatic activation or hard
    permission enforcement.
  **Verification**:
  - Run: `bun test src/harness/adapters/codex.test.ts -t "hook"`
  - Expected: Tests prove diagnostics mention `features.plugin_hooks`, trust
    review, and no hard enforcement claims.

## Phase 5: Codex Adapter Integration and Regression Protection

- [x] 5.1 Compose plugin package artifacts in the Codex adapter —
  `src/harness/adapters/codex.ts` and `src/harness/adapters/codex.test.ts`
  - Include `.codex-plugin/plugin.json` and plugin-local skill artifacts in the
    primary Codex render result.
  - Preserve existing `.codex/agents/*.toml`, `.codex/config.toml`, MCP snippets,
    model defaults, memory governance prompts, and capability diagnostics.
  - Emit fallback `.agents/skills` only when explicit fallback/dev/repo-local
    options are selected.
  **Verification**:
  - Run: `bun test src/harness/adapters/codex.test.ts`
  - Expected: Tests prove plugin package artifacts are present by default,
    `.agents/skills` is not primary output, and existing Codex agent/config
    fixture expectations remain stable or are intentionally updated.

- [x] 5.2 Protect OpenCode behavior — `src/harness/adapters/opencode.test.ts`,
  `src/plugin-node-runtime.test.ts`, and existing OpenCode tests
  - Add or update regression assertions only if shared types or adapter plumbing
    changes could affect OpenCode.
  - Confirm OpenCode skill sync and plugin runtime do not consume
    `.codex-plugin/` package artifacts.
  **Verification**:
  - Run: `bun test src/harness/adapters/opencode.test.ts src/plugin-node-runtime.test.ts src/hooks/skill-sync.test.ts`
  - Expected: OpenCode adapter, plugin runtime, and skill sync tests pass without
    requiring Codex plugin package artifacts.

## Phase 6: End-to-End Verification

- [x] 6.1 Run focused harness and writer suite — `src/harness/**`
  - Execute all Codex surface, writer, adapter, fixture, and OpenCode regression
    tests touched by the implementation.
  **Verification**:
  - Run: `bun test src/harness`
  - Expected: All harness tests pass, including plugin package fixtures,
    skill-bundling fallback behavior, hook diagnostics, and Codex/OpenCode
    regressions.

- [x] 6.2 Run repository checks — all touched modules
  - Run the standard project verification after implementation is complete.
  - Capture any environment blockers with exact command output and follow-up.
  **Verification**:
  - Run: `bun run check:ci`
  - Run: `bun run typecheck`
  - Run: `bun test`
  - Expected: Biome check, TypeScript typecheck, and the full Bun test suite pass.

- [x] 6.3 Confirm installer boundary remains deferred — Codex docs and adapter
  result diagnostics
  - Verify no task added `install --agent=codex`, user config mutation, automatic
    plugin enablement, or hook trust automation.
  - Ensure docs describe the future installer as a consumer of the generated
    plugin package.
  **Verification**:
  - Run: `bun test src/harness/adapters/codex.test.ts -t "install"`
  - Expected: Focused tests or documented assertions prove packaging exists
    without install/activation side effects.
