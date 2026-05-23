# Tasks: Rewrite Multi-Harness Agent Prompts

## Phase 1: Contract Tests First

- [x] 1.1 Add OpenCode and Codex role contract assertions - `src/agents/prompt-rendering.test.ts`
  **Covers**: Root prompt owns coordination boundaries; Root prompt delegates bounded work; All roles retain their semantic responsibilities; OpenCode rendering remains explicit and stable; Codex rendering uses Codex semantics without brittle adaptation.
  **Verification**:
  - Run: `pnpm test -- src/agents/prompt-rendering.test.ts`
  - Expected: New assertions fail before implementation or pass after implementation, and cover all seven roles for OpenCode and Codex terminology, roster preservation, raw-dump prohibition, root ownership, SDD gates, and role modes.

- [x] 1.2 Add read-only and write-capable boundary assertions - `src/agents/prompt-rendering.test.ts`
  **Covers**: Explorer prompt is local discovery only; Librarian prompt is external research only; Oracle prompt is advisory only; Designer prompt owns user-facing visual work; Quick prompt stays narrow and mechanical; Deep prompt owns correctness-critical implementation.
  **Verification**:
  - Run: `pnpm test -- src/agents/prompt-rendering.test.ts`
  - Expected: Tests assert mutation prohibitions for explorer/librarian/oracle, visual QA ownership for designer, narrow mechanical scope for quick, and correctness-critical verification duties for deep.

- [x] 1.3 Add dialect and unsupported-harness guards - `src/agents/prompt-dialects.test.ts`
  **Covers**: OpenCode wording is rendered from the OpenCode dialect; Codex wording is rendered from the Codex dialect; Unsupported harnesses remain out of scope for prompt rendering.
  **Verification**:
  - Run: `pnpm test -- src/agents/prompt-dialects.test.ts`
  - Expected: Tests verify explicit OpenCode and Codex terminology, Codex capability-disclosure language, and rejection of unsupported dialect ids.

- [x] 1.4 Add Codex adapter memory-governance diagnostics assertions - `src/harness/adapters/codex.test.ts`
  **Covers**: Runtime enforcement is used where available; Enforcement gaps are diagnosed where unavailable; Root-only memory tools remain restricted.
  **Verification**:
  - Run: `pnpm test -- src/harness/adapters/codex.test.ts`
  - Expected: Tests assert Codex artifacts preserve instruction-level governance and emit visible diagnostics for role permissions, parent context injection, and memory write enforcement gaps.

- [x] 1.5 Preserve custom prompt composition coverage - `src/agents/prompt-rendering.test.ts`, `src/config/loader.test.ts`
  **Covers**: Replacement prompt overrides generated content; Append prompt extends generated content; Model-family guidance composes before user append text.
  **Verification**:
  - Run: `pnpm test -- src/agents/prompt-rendering.test.ts src/config/loader.test.ts`
  - Expected: Tests verify placeholder expansion, replacement precedence over append, generated prompt before append, and model-family guidance before user append text.

## Phase 2: Shared Prompt Contract Rewrite

- [x] 2.1 Rewrite the orchestrator/root coordinator sections - `src/agents/prompt-sections.ts`
  **Covers**: Root prompt owns coordination boundaries; Root prompt delegates bounded work; SDD gates; root-session memory ownership; raw-dump prohibition.
  **Verification**:
  - Run: `pnpm test -- src/agents/prompt-rendering.test.ts`
  - Expected: OpenCode and Codex root prompts identify the ambient root coordinator, preserve explorer/librarian/oracle/designer/quick/deep delegation, assign sequencing/user input/progress/memory/final reporting to root, and prohibit raw file dumps from subagents.

- [x] 2.2 Rewrite read-only specialist sections - `src/agents/prompt-sections.ts`
  **Covers**: Explorer prompt is local discovery only; Librarian prompt is external research only; Oracle prompt is advisory only; read-only roles do not mutate or own durable session memory.
  **Verification**:
  - Run: `pnpm test -- src/agents/prompt-rendering.test.ts`
  - Expected: Explorer, librarian, and oracle prompts remain read-only, include role-specific evidence outputs, prohibit implementation and destructive git operations, and deny root-session memory ownership.

- [x] 2.3 Rewrite write-capable specialist sections - `src/agents/prompt-sections.ts`
  **Covers**: Designer prompt owns user-facing visual work; Quick prompt stays narrow and mechanical; Deep prompt owns correctness-critical implementation; Reporting evidence is required for completion.
  **Verification**:
  - Run: `pnpm test -- src/agents/prompt-rendering.test.ts`
  - Expected: Designer, quick, and deep prompts remain bounded by role, require preserving unrelated working-tree changes, and require focused verification before completion is reported.

- [x] 2.4 Preserve role factory assembly and compose ordering - `src/agents/orchestrator.ts`, `src/agents/explorer.ts`, `src/agents/librarian.ts`, `src/agents/oracle.ts`, `src/agents/designer.ts`, `src/agents/quick.ts`, `src/agents/deep.ts`, `src/agents/index.ts`
  **Covers**: All roles retain their semantic responsibilities; Prompt rewrite stays within approved scope; replacement and append semantics remain intact.
  **Verification**:
  - Run: `pnpm test -- src/agents/prompt-rendering.test.ts src/config/loader.test.ts`
  - Expected: Role factories still render through shared sections and `composeAgentPrompt`, keep existing role metadata and model handling, and do not introduce or remove any role.

## Phase 3: Harness Dialect, Adapter, and Governance Alignment

- [x] 3.1 Align typed dialect terminology for OpenCode and Codex - `src/agents/prompt-dialects.ts`
  **Covers**: Derive harness-specific wording from typed dialects and capabilities; OpenCode wording is rendered from the OpenCode dialect; Codex wording is rendered from the Codex dialect.
  **Verification**:
  - Run: `pnpm test -- src/agents/prompt-dialects.test.ts src/agents/prompt-rendering.test.ts`
  - Expected: Harness-specific terms such as `task`, `question`, `todowrite`, `request_user_input`, Codex custom-agent task, and Codex progress tracking surface come from dialect rendering rather than broad post-render adaptation.

- [x] 3.2 Refine Codex wrapper wording without changing artifact behavior - `src/harness/adapters/codex.ts`
  **Covers**: Codex root wording describes the ambient Codex session; Codex prompts identify instruction-level governance; runtime behavior changes stay constrained to prompt contracts.
  **Verification**:
  - Run: `pnpm test -- src/harness/adapters/codex.test.ts src/agents/prompt-rendering.test.ts`
  - Expected: Codex root and role artifacts align with rewritten contracts while TOML paths, model defaults, bundled MCP config, hook diagnostics, and packaging behavior remain unchanged.

- [x] 3.3 Clarify memory-governance instructions only if needed - `src/harness/core/memory-governance.ts`
  **Covers**: Root-only memory tools remain restricted; Enforcement gaps are diagnosed where unavailable; SDD artifact writes use deterministic ownership.
  **Verification**:
  - Run: `pnpm test -- src/harness/adapters/codex.test.ts`
  - Expected: Root-only memory tools remain root-owned, subagents require parent `session_id` and project before thoth-mem use, deterministic SDD topic-key limits remain explicit, and Codex diagnostics still identify unsupported enforcement.

- [x] 3.4 Check docs and generated guidance alignment - `README.md`, `AGENTS.md`
  **Covers**: Prompt behavior, role contracts, and harness wording remain user-facing accurate where docs quote or summarize them.
  **Verification**:
  - Run: `pnpm run check:ci`
  - Expected: Any docs changed for prompt behavior pass Biome checks; if no docs are changed, implementation notes explicitly state docs were reviewed and no user-facing doc update was needed.

## Phase 4: Scope Guards and Full Verification

- [x] 4.1 Guard against reference-role imports and unsupported harness expansion - `src/agents/prompt-rendering.test.ts`, `src/agents/prompt-dialects.test.ts`
  **Covers**: Reference repos do not expand the roster; Inspired prose remains behavior-compatible; Unsupported harnesses remain out of scope for prompt rendering.
  **Verification**:
  - Run: `pnpm test -- src/agents/prompt-rendering.test.ts src/agents/prompt-dialects.test.ts`
  - Expected: Tests fail if generated prompts, fixtures, or dialects introduce non-thoth roles, reference command models, or non-OpenCode/non-Codex harness support.

- [x] 4.2 Run focused prompt and adapter verification - prompt and harness test files
  **Covers**: OpenCode rendering, Codex rendering, memory governance, custom prompt composition, and capability disclosures.
  **Verification**:
  - Run: `pnpm test -- src/agents/prompt-rendering.test.ts`
  - Run: `pnpm test -- src/agents/prompt-dialects.test.ts src/harness/adapters/codex.test.ts src/config/loader.test.ts`
  - Expected: Focused suites pass and failures, skipped checks, or unsupported capability assertions are reported explicitly.

- [x] 4.3 Run repository quality checks - project root
  **Covers**: TypeScript correctness and formatting/lint stability for the prompt rewrite.
  **Verification**:
  - Run: `pnpm run check:ci`
  - Run: `pnpm run typecheck`
  - Expected: Biome check and TypeScript typecheck complete without errors.

- [x] 4.4 Run full test suite before completion - project root
  **Covers**: Prompt contracts across all affected generation paths and broad regression detection.
  **Verification**:
  - Run: `pnpm test`
  - Expected: Full Vitest suite passes; any failure is triaged against the approved scope before reporting completion.
