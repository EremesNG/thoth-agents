# Tasks: Codex Hooks Surface Validation

## Phase 1: Surface Model Foundation
- [x] 1.1 Add documented Codex hook surface records — `src/harness/adapters/codex-surfaces.ts`
  **Verification**:
  - Run: `bun test src/harness/adapters/codex-surfaces.test.ts`
  - Expected: Surface tests include validated hook config surfaces while `runtimeHooks` remains distinct and unknown.

- [x] 1.2 Add hook event and handler validation helpers — `src/harness/adapters/codex-surfaces.ts`
  **Verification**:
  - Run: `bun test src/harness/adapters/codex-surfaces.test.ts`
  - Expected: `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PermissionRequest`, `PostToolUse`, and `Stop` with `command` handlers validate; prompt handlers, agent handlers, async hooks, unsupported output fields, and full tool interception return diagnostics.

- [x] 1.3 Preserve generic runtime hook uncertainty — `src/harness/adapters/codex.ts`
  **Verification**:
  - Run: `bun test src/harness/adapters/codex.test.ts`
  - Expected: `CODEX_CAPABILITIES.runtimeHooks` remains `unknown`, and hook support is reported through hook-specific surface diagnostics rather than runtime-enforcement capability claims.

## Phase 2: Adapter Diagnostics and Artifact Planning
- [x] 2.1 Update Codex capability diagnostics for hook trust and feature gates — `src/harness/adapters/codex.ts`
  **Verification**:
  - Run: `bun test src/harness/adapters/codex.test.ts`
  - Expected: Diagnostics mention project trust, plugin hook trust review, `features.hooks`, and `features.plugin_hooks` where required.

- [x] 2.2 Keep hook artifact generation conservative — `src/harness/adapters/codex.ts`
  **Verification**:
  - Run: `bun test src/harness/adapters/codex.test.ts`
  - Expected: Render planning does not generate speculative hook scripts or imply hard permission enforcement; any generated/config-planned hook artifacts are limited to docs-backed config surfaces.

- [x] 2.3 Refresh deterministic Codex fixtures — `src/harness/__fixtures__/codex/*`
  **Verification**:
  - Run: `bun test src/harness/adapters/codex.test.ts src/harness/writers/skill-layout.test.ts`
  - Expected: Fixture snapshots match updated diagnostics and existing agent, config, MCP, and skill outputs remain deterministic.

## Phase 3: Documentation and Use Cases
- [x] 3.1 Document Codex hook support matrix — `docs/codex-surface-validation.md`
  **Verification**:
  - Run: `bun run check:ci`
  - Expected: Documentation passes Biome checks and names events, command handler support, unsupported handlers/fields, trust requirements, and plugin feature gates.

- [x] 3.2 Document safe hook use cases and limitations — `docs/codex-surface-validation.md`
  **Verification**:
  - Run: `bun run check:ci`
  - Expected: Docs recommend context/guidance, guardrail diagnostics, memory governance reminders, SDD completion/check reminders, and verification reminders, while rejecting tmux cleanup, subagent orchestration graphs, skill sync automation, and hard permission enforcement as hook mappings.

- [x] 3.3 Record future installer consent path — `docs/codex-surface-validation.md`
  **Verification**:
  - Run: `bun run check:ci`
  - Expected: Docs state a future CLI installer may mutate `~/.codex/config.toml` only with user consent to enable `[features].hooks=true` and `plugin_hooks=true`.

## Phase 4: Regression Verification
- [x] 4.1 Run focused harness regression tests — `src/harness/adapters/codex-surfaces.test.ts`, `src/harness/adapters/codex.test.ts`, `src/harness/writers/skill-layout.test.ts`
  **Verification**:
  - Run: `bun test src/harness/adapters/codex-surfaces.test.ts src/harness/adapters/codex.test.ts src/harness/writers/skill-layout.test.ts`
  - Expected: Focused Codex surface, adapter, fixture, and skill layout tests pass.

- [x] 4.2 Run repository quality gates — all modules
  **Verification**:
  - Run: `bun run typecheck && bun run check:ci && bun test`
  - Expected: TypeScript typecheck, Biome CI check, and full Bun test suite pass with no regressions.
