# Tasks: Configure Model Effort by Harness

## Phase 1: Catalog foundation

- [x] 1.1 Author red tests for dynamic effort parsing and manual fallback — `src/cli/model-catalog/models-dev.test.ts`
  **[USN-1]** | Priority: P1
  **Spec:** `model-catalog/Dynamic effort discovery`
  **Spec:** `model-catalog/Manual catalog preservation`
  **Independent Test:** Fixtures prove exact effort extraction, missing effort metadata, manual-only models, and safe exclusion of toggle/budget-token controls before implementation exists.
  **Verification**:
  - Run: `pnpm exec vitest run src/cli/model-catalog/models-dev.test.ts`
  - Expected: New assertions execute and fail only for the unimplemented catalog behavior.

- [x] 1.2 Implement normalized catalog contracts and tolerant models.dev parsing — `src/cli/model-catalog/types.ts`, `src/cli/model-catalog/models-dev.ts`, `src/cli/model-catalog/index.ts`
  **[USN-1]** | Priority: P1
  **Spec:** `model-catalog/Dynamic effort discovery`
  **Spec:** `model-catalog/Manual catalog preservation`
  **Independent Test:** Parser tests pass without any harness writer changes.
  **Verification**:
  - Run: `pnpm exec vitest run src/cli/model-catalog/models-dev.test.ts`
  - Expected: Exact model efforts and manual fallbacks pass; unknown/toggle/budget-token metadata creates no selectable effort.

- [x] 1.3 Author red tests for ETag, validated LKG, and first-run offline behavior — `src/cli/model-catalog/cache.test.ts`
  **[USN-2]** | Priority: P1
  **Spec:** `model-catalog/Conditional refresh and resilient fallback`
  **Independent Test:** Temporary-directory tests cover 200, 304, malformed response, corrupt cache, and no-cache network failure.
  **Verification**:
  - Run: `pnpm exec vitest run src/cli/model-catalog/cache.test.ts`
  - Expected: New cache-path and fallback assertions fail before cache implementation.

- [x] 1.4 Implement asynchronous refresh and atomic cache promotion — `src/cli/model-catalog/cache.ts`, `src/cli/model-catalog/models-dev.ts`, `src/cli/model-catalog/index.ts`
  **[USN-2]** | Priority: P1
  **Spec:** `model-catalog/Conditional refresh and resilient fallback`
  **Independent Test:** Cache tests pass using mocked fetch and isolated filesystem paths.
  **Verification**:
  - Run: `pnpm exec vitest run src/cli/model-catalog/cache.test.ts src/cli/model-catalog/models-dev.test.ts`
  - Expected: 304 reuses LKG, invalid fresh data never replaces LKG, and no LKG returns the manual/native fallback.

## Phase 2: Shared CLI contracts

- [x] 2.1 Author red tests for neutral effort, state v1 compatibility, and `--role-effort` parsing — new `src/cli/model-effort.test.ts`, new `src/cli/managed-state-io.test.ts`, new `src/cli/parser.test.ts`, existing `src/cli/commands.test.ts`
  **[USN-3]** | Priority: P1
  **Spec:** `multi-harness-agent-pack/Neutral role effort configuration`
  **Spec:** `multi-harness-agent-pack/Non-interactive role effort configuration`
  **Spec:** `multi-harness-agent-pack/Backward-compatible state persistence`
  **Independent Test:** Tests cover inherit/default/null normalization, malformed and conflicting flags, atomic plan rejection, and legacy state without effort maps.
  **Verification**:
  - Run: `pnpm exec vitest run src/cli/model-effort.test.ts src/cli/managed-state-io.test.ts src/cli/parser.test.ts src/cli/commands.test.ts`
  - Expected: New effort assertions are red while existing model-only assertions remain green.

- [x] 2.2 Implement neutral effort transport, optional state maps, and non-interactive parsing — `src/cli/model-effort.ts`, `src/cli/operations/types.ts`, `src/cli/types.ts`, `src/cli/managed-state-io.ts`, `src/cli/parser.ts`, `src/cli/commands.ts`
  **[USN-3]** | Priority: P1
  **Spec:** `multi-harness-agent-pack/Neutral role effort configuration`
  **Spec:** `multi-harness-agent-pack/Non-interactive role effort configuration`
  **Spec:** `multi-harness-agent-pack/Backward-compatible state persistence`
  **Independent Test:** Shared CLI/state tests pass without harness serialization.
  **Verification**:
  - Run: `pnpm exec vitest run src/cli/model-effort.test.ts src/cli/managed-state-io.test.ts src/cli/parser.test.ts src/cli/commands.test.ts`
  - Expected: Repeatable role efforts plan atomically; absent optional effort maps remain valid v1 state.

## Phase 3: Codex adapter

- [x] 3.1 Author red Codex tests for exact per-model efforts and TOML removal — `src/cli/operations/codex.test.ts`, `src/cli/codex-install.test.ts`, `src/harness/adapters/codex.test.ts`, `src/harness/writers/codex-toml.test.ts`
  **[USN-4]** | Priority: P1
  **Spec:** `multi-harness-agent-pack/Codex effort contract`
  **Independent Test:** Fixtures prove conditional none/max/ultra, model-unadvertised and Codex-undocumented rejection, exact serialization, inherit removal, and model-only state compatibility.
  **Verification**:
  - Run: `pnpm exec vitest run src/cli/operations/codex.test.ts src/cli/codex-install.test.ts src/harness/adapters/codex.test.ts src/harness/writers/codex-toml.test.ts`
  - Expected: New dynamic-effort assertions fail before Codex changes; unrelated Codex tests pass.

- [x] 3.2 Implement Codex effort planning, persistence, and TOML parse/replace/remove — `src/cli/operations/codex.ts`, `src/cli/codex-install.ts`, `src/harness/adapters/codex.ts`, `src/harness/writers/codex-toml.ts`
  **[USN-4]** | Priority: P1
  **Spec:** `multi-harness-agent-pack/Codex effort contract`
  **Independent Test:** Codex focused suite passes using exact catalog records with no global effort enum.
  **Verification**:
  - Run: `pnpm exec vitest run src/cli/operations/codex.test.ts src/cli/codex-install.test.ts src/harness/adapters/codex.test.ts src/harness/writers/codex-toml.test.ts`
  - Expected: Published values round-trip unchanged; inherit omits the field; hardcoded generated role efforts are removed.

## Phase 4: OpenCode adapter

- [x] 4.1 Author red OpenCode tests for runtime confirmation and owned stale variant clearing — new `src/cli/opencode-effort.test.ts`, new `src/cli/managed-state-io.test.ts`, `src/cli/paths.test.ts`, `src/cli/operations/opencode.test.ts`
  **[USN-5]** | Priority: P1
  **Spec:** `multi-harness-agent-pack/OpenCode confirmed-variant contract`
  **Spec:** `multi-harness-agent-pack/Non-destructive regeneration`
  **Independent Test:** Tests cover confirmed provider/runtime values, gpt-5.6-sol max rejection, sidecar ownership round-trip, managed stale clearing, divergent user variant preservation/warning, and unrelated-field preservation.
  **Verification**:
  - Run: `pnpm exec vitest run src/cli/opencode-effort.test.ts src/cli/operations/opencode.test.ts`
  - Expected: New writable-effort and stale-clear assertions fail before implementation.

- [x] 4.2 Implement OpenCode catalog enrichment, conservative writable-effort adapter, and ownership sidecar — `src/cli/opencode-effort.ts`, `src/cli/tui/model-catalog.ts`, `src/cli/operations/opencode.ts`, `src/cli/managed-state-io.ts`, `src/cli/paths.ts`
  **[USN-5]** | Priority: P1
  **Spec:** `multi-harness-agent-pack/OpenCode confirmed-variant contract`
  **Spec:** `multi-harness-agent-pack/Non-destructive regeneration`
  **Independent Test:** OpenCode focused tests pass without adding a generic provider-options schema and only sidecar-owned variants are removed automatically.
  **Verification**:
  - Run: `pnpm exec vitest run src/cli/opencode-effort.test.ts src/cli/managed-state-io.test.ts src/cli/paths.test.ts src/cli/operations/opencode.test.ts src/cli/tui/model-catalog.test.ts`
  - Expected: Only confirmed variants are written, unsupported values return actionable errors, owned stale variants are deleted, and divergent user variants are preserved with warnings.

## Phase 5: Claude adapter coordination and implementation

- [x] 5.1 Reconcile the active Claude adapter interfaces and author red effort tests — `src/harness/writers/claude-code-subagent.test.ts`, `src/harness/adapters/claude-code.test.ts`, `src/cli/claude-code-install.test.ts`, `src/cli/operations/claude-code.test.ts`
  **[USN-6]** | Priority: P1
  **Spec:** `multi-harness-agent-pack/Claude Code official-effort intersection`
  **Independent Test:** Confirm current code from `add-claude-code-harness-adapter` is present, without editing its OpenSpec artifacts; tests cover aliases, concrete intersections, inherit omission, and frontmatter round-trip.
  **Verification**:
  - Run: `pnpm exec vitest run src/harness/writers/claude-code-subagent.test.ts src/harness/adapters/claude-code.test.ts src/cli/claude-code-install.test.ts src/cli/operations/claude-code.test.ts`
  - Expected: New effort assertions fail only for missing Claude effort support; existing alias behavior stays green.

- [x] 5.2 Implement Claude effort validation, frontmatter, state, and operations — `src/harness/writers/claude-code-subagent.ts`, `src/harness/adapters/claude-code.ts`, `src/cli/claude-code-install.ts`, `src/cli/operations/claude-code.ts`
  **[USN-6]** | Priority: P1
  **Spec:** `multi-harness-agent-pack/Claude Code official-effort intersection`
  **Spec:** `multi-harness-agent-pack/Non-destructive regeneration`
  **Independent Test:** Claude focused suite passes for official aliases and concrete model intersections while preserving unrelated frontmatter/body content.
  **Verification**:
  - Run: `pnpm exec vitest run src/harness/writers/claude-code-subagent.test.ts src/harness/adapters/claude-code.test.ts src/cli/claude-code-install.test.ts src/cli/operations/claude-code.test.ts`
  - Expected: Official values serialize unchanged, concrete values are intersected, and inherit removes only owned effort fields.

## Phase 6: Interactive TUI (designer implementation owner)

- [x] 6.1 Author red interaction tests for asynchronous catalog loading and effort selection — `src/cli/tui/App.test.tsx`, `src/cli/tui/operations.test.ts`, `src/cli/tui/model-catalog.test.ts`
  **[USN-7]** | Priority: P1 | Owner: designer
  **Spec:** `multi-harness-agent-pack/Interactive effort configuration`
  **Spec:** `multi-harness-agent-pack/Excluded controls`
  **Independent Test:** Tests cover loading/error states, model-then-effort navigation, inherit availability, effort-only dirty state, incompatible reset, and absence of toggle/budget-token controls.
  **Verification**:
  - Run: `pnpm exec vitest run src/cli/tui/App.test.tsx src/cli/tui/operations.test.ts src/cli/tui/model-catalog.test.ts`
  - Expected: New interaction assertions fail before UI implementation while existing model picker tests remain green.

- [x] 6.2 Implement asynchronous model/effort TUI flow — `src/cli/tui/App.tsx`, `src/cli/tui/operations.ts`, `src/cli/tui/components/ModelScreen.tsx`, `src/cli/tui/components/ModelChoiceScreen.tsx`, `src/cli/tui/model-catalog.ts`
  **[USN-7]** | Priority: P1 | Owner: designer
  **Spec:** `multi-harness-agent-pack/Interactive effort configuration`
  **Spec:** `multi-harness-agent-pack/Excluded controls`
  **Independent Test:** TUI focused suite passes and effort choices remain keyboard-accessible within existing interaction conventions.
  **Verification**:
  - Run: `pnpm exec vitest run src/cli/tui/App.test.tsx src/cli/tui/operations.test.ts src/cli/tui/model-catalog.test.ts`
  - Expected: Loading, selection, inherit reset, effort-only apply, and no-effort-capability flows pass.

## Phase 7: Cross-harness regression and release checks

- [x] 7.1 Add cross-harness preservation and excluded-control regressions — `src/cli/operations/codex.test.ts`, `src/cli/operations/opencode.test.ts`, `src/cli/operations/claude-code.test.ts`, `src/cli/codex-install.test.ts`, `src/cli/claude-code-install.test.ts`, `src/cli/tui/App.test.tsx`
  **[USN-8]** | Priority: P1
  **Spec:** `multi-harness-agent-pack/Non-destructive regeneration`
  **Spec:** `multi-harness-agent-pack/Excluded controls`
  **Independent Test:** Model-only/manual configurations round-trip across all harnesses and no output introduces toggle or budget-token controls.
  **Verification**:
  - Run: `pnpm test`
  - Expected: Full Vitest suite passes with legacy and new effort scenarios.

- [x] 7.2 Run repository pre-merge checks and inspect generated artifacts — all changed modules and fixtures
  **[USN-8]** | Priority: P1
  **Spec:** `model-catalog/Conditional refresh and resilient fallback`
  **Spec:** `multi-harness-agent-pack/Non-destructive regeneration`
  **Independent Test:** CI-equivalent commands validate formatting, types, build output, and all harness behavior.
  **Verification**:
  - Run: `pnpm run lint && pnpm run typecheck && pnpm run build && pnpm test`
  - Expected: Every command exits zero; generated Codex/Claude/OpenCode fixtures contain only supported owned effort fields.

## Phase 8: Confirmed defaults and installed-current regression

- [x] 8.1 Author red tests for the confirmed Codex and OpenCode OpenAI presets — `src/harness/adapters/codex.test.ts`, `src/cli/codex-install.test.ts`, `src/cli/providers.test.ts`, `src/cli/model-catalog/models-dev.test.ts`, `src/harness/adapters/claude-code.test.ts`
  **[USN-9]** | Priority: P1
  **Spec:** `multi-harness-agent-pack/Codex and OpenCode OpenAI installation presets`
  **Independent Test:** Fixtures assert all six exact model/effort pairs for fresh Codex output and the OpenCode `openai` preset, while Claude and unrelated providers remain unchanged.
  **Verification**:
  - Run: `pnpm exec vitest run src/harness/adapters/codex.test.ts src/cli/codex-install.test.ts src/cli/providers.test.ts src/cli/model-catalog/models-dev.test.ts src/harness/adapters/claude-code.test.ts`
  - Expected: New preset assertions fail before implementation and existing provider/Claude expectations remain green.

- [x] 8.2 Implement the shared confirmed defaults for Codex and OpenCode OpenAI — `src/config/constants.ts`, `src/harness/adapters/codex.ts`, `src/cli/providers.ts`
  **[USN-9]** | Priority: P1
  **Spec:** `multi-harness-agent-pack/Codex and OpenCode OpenAI installation presets`
  **Independent Test:** Focused preset tests pass and fresh Codex role TOML emits both model and effort without remote catalog access.
  **Verification**:
  - Run: `pnpm exec vitest run src/harness/adapters/codex.test.ts src/cli/codex-install.test.ts src/cli/providers.test.ts src/cli/model-catalog/models-dev.test.ts src/harness/adapters/claude-code.test.ts`
  - Expected: Codex and OpenCode OpenAI share the six confirmed assignments; Claude and other providers are byte-for-byte unaffected.

- [x] 8.3 Author red tests for installed-effort precedence and preservation — `src/cli/tui/operations.test.ts`, `src/cli/codex-install.test.ts`, `src/cli/claude-code-install.test.ts`, `src/cli/operations/opencode.test.ts`
  **[USN-10]** | Priority: P1
  **Spec:** `multi-harness-agent-pack/Installed effort is the authoritative current value`
  **Independent Test:** Temporary installed artifacts cover explicit manual effort with no sidecar entry, absent effort with stale sidecar data, divergent values, missing-artifact recommendations, and model-only/no-op preservation.
  **Verification**:
  - Run: `pnpm exec vitest run src/cli/tui/operations.test.ts src/cli/codex-install.test.ts src/cli/claude-code-install.test.ts src/cli/operations/opencode.test.ts`
  - Expected: Explicit installed effort wins without sidecar data; absent fields beat stale sidecar values as `inherit`; divergent values survive no-op/model-only planning; missing artifacts use renderer recommendations; OpenCode still reads actual variants.

- [x] 8.4 Read current Codex/Claude effort from installed artifacts and preserve it through planning — `src/cli/tui/operations.ts`, `src/cli/codex-install.ts`, `src/cli/claude-code-install.ts`
  **[USN-10]** | Priority: P1
  **Spec:** `multi-harness-agent-pack/Installed effort is the authoritative current value`
  **Independent Test:** Focused operations/install suites show the serialized artifact wins over `configuredEfforts`, absent fields resolve to `inherit`, and missing files use renderer recommendations.
  **Verification**:
  - Run: `pnpm exec vitest run src/cli/tui/operations.test.ts src/cli/codex-install.test.ts src/cli/claude-code-install.test.ts src/cli/operations/opencode.test.ts`
  - Expected: Manual and divergent installed efforts are displayed and preserved; absent fields remain `inherit`; sidecar metadata is ownership-only; missing artifacts use renderer recommendations; OpenCode behavior does not regress.

- [x] 8.5 Run focused and repository-wide regression checks — all affected modules
  **[USN-10]** | Priority: P1
  **Spec:** `multi-harness-agent-pack/Installed effort is the authoritative current value`
  **Spec:** `multi-harness-agent-pack/Codex and OpenCode OpenAI installation presets`
  **Independent Test:** Build output and the full test suite validate the updated defaults and legacy/manual configurations together.
  **Verification**:
  - Run: `pnpm run lint && pnpm run typecheck && pnpm run build && pnpm test`
  - Expected: Every command exits zero and no Claude/default-provider regression is introduced.

## Execution Order

Execute phases in order. Within each phase, complete the red test task before its implementation task. Phases 3–5 may be implemented as one batched deep-agent dispatch after Phase 2 stabilizes the shared contracts. Phase 6 is a separate designer dispatch after catalog and operation APIs are stable. Phase 7 is an independent verification pass. Execute the regression extension strictly as 8.1 → 8.2 → 8.3 → 8.4 → 8.5.
