# Tasks: Add Codex Harness Adapter

## Scope Notes

- OpenCode remains the default harness path throughout this change.
- Codex support is an explicit, configuration-first MVP; runtime plugin parity is
  not assumed.
- Deferred/non-goals: Claude, Antigravity, and other harness adapters; Codex
  runtime orchestration through undocumented APIs; replacement memory backends;
  marketplace/hosted packaging; Codex-first installer behavior.
- Every implementation result must include acceptance evidence: changed files,
  tests or diagnostics run, observed output, and any unsupported capability
  diagnostics introduced or confirmed.

## Phase 1: Harness Core Contracts and Capability Model

- [x] 1.1 Add harness type contracts — `src/harness/types.ts`
  - Define `HarnessId`, `HarnessAdapter`, render context/options, artifacts,
    diagnostics, capabilities, and writer result types.
  - Include explicit unsupported-harness and capability-gap diagnostic shapes.
  - Acceptance evidence: interface/type summary and how unsupported harnesses are
    represented without partial artifact generation.
  **Verification**:
  - Run: `bun run typecheck`
  - Expected: New harness types compile without importing OpenCode SDK or
    Codex-specific writer modules.

- [x] 1.2 Extract shared agent-pack contract —
  `src/harness/core/agent-pack.ts` and `src/harness/core/agent-pack.test.ts`
  - Model the seven roles, mutation/read-only modes, dispatch expectations,
    tool-governance intent, and verification reporting contract from existing
    agent prompts.
  - Keep role intent harness-neutral while preserving agent names and behavior
    required by the OpenCode baseline.
  - Acceptance evidence: all seven roles listed with mode, dispatch, and
    verification metadata.
  **Verification**:
  - Run: `bun test src/harness/core/agent-pack.test.ts`
  - Expected: Tests prove all seven roles exist with stable shared intent and no
    harness-specific imports in the core module.

- [x] 1.3 Extract shared SDD workflow contract —
  `src/harness/core/sdd.ts` and `src/harness/core/sdd.test.ts`
  - Represent requirements-interview routing, full SDD phase ordering,
    artifact prerequisites, plan-review gating, implementation confirmation,
    and verification expectations.
  - Preserve full-pipeline semantics from the spec: proposal, spec, design,
    tasks, apply, verify, archive.
  - Acceptance evidence: SDD phase matrix with prerequisites and gates.
  **Verification**:
  - Run: `bun test src/harness/core/sdd.test.ts`
  - Expected: Tests cover full-pipeline ordering, review gating, and refusal to
    bypass spec/design for full SDD work.

- [x] 1.4 Extract shared skill registry contract —
  `src/harness/core/skills.ts` and `src/harness/core/skills.test.ts`
  - Derive bundled skill entries and exact source paths from
    `src/cli/custom-skills.ts` without embedding OpenCode packaging behavior in
    the core layer.
  - Include requirements-interview, SDD skills, plan-reviewer, executing-plans,
    and shared skill support files.
  - Acceptance evidence: registry output showing exact source paths and allowed
    roles/purpose metadata.
  **Verification**:
  - Run: `bun test src/harness/core/skills.test.ts src/cli/custom-skills.test.ts`
  - Expected: Shared registry tests pass and existing custom skill tests remain
    unchanged.

- [x] 1.5 Add harness registry and default selection —
  `src/harness/registry.ts` and `src/harness/registry.test.ts`
  - Register `opencode` as the default supported harness and prepare explicit
    `codex` selection.
  - Return explicit unsupported-harness errors for non-OpenCode/non-Codex
    targets without generating artifacts.
  - Acceptance evidence: default resolution result and unsupported-harness error
    sample.
  **Verification**:
  - Run: `bun test src/harness/registry.test.ts`
  - Expected: Tests prove OpenCode is default, Codex is explicit, and Claude or
    Antigravity requests fail with no artifacts.

- [x] 1.6 Validate Codex surface contract before artifact implementation —
  `docs/codex-surface-validation.md`,
  `src/harness/adapters/codex-surfaces.ts`, and
  `src/harness/adapters/codex-surfaces.test.ts`
  - Record confirmed Codex agent/config/MCP/hook/model/permission fields, file
    locations, skills directory convention, delegation behavior, and parent
    context injection support before any Codex artifact writer is implemented.
  - Represent each surface as `validated`, `unsupported`, or `unknown`, with a
    diagnostic code and instruction-level fallback where applicable.
  - Require later Codex adapter tasks to generate only validated fields/paths;
    unsupported or unknown surfaces must emit diagnostics only.
  - Acceptance evidence: validation record summary and capability matrix showing
    which Codex surfaces are generated, diagnostic-only, or out of scope.
  **Verification**:
  - Run: `bun test src/harness/adapters/codex-surfaces.test.ts`
  - Expected: Tests prove unvalidated Codex surfaces cannot be treated as
    generated artifact targets and instead produce explicit diagnostics.

## Phase 2: OpenCode Compatibility Adapter and Regression Protection

- [x] 2.1 Wrap existing OpenCode agent behavior —
  `src/harness/adapters/opencode.ts` and
  `src/harness/adapters/opencode.test.ts`
  - Map shared contracts back to current OpenCode `AgentConfig` output while
    keeping SDK imports inside the adapter boundary.
  - Compare adapter output against existing `getAgentConfigs()` for names,
    modes, descriptions, permissions, and key prompt governance sections.
  - Acceptance evidence: parity table for current agent config fields.
  **Verification**:
  - Run: `bun test src/harness/adapters/opencode.test.ts src/agents/index.test.ts`
  - Expected: OpenCode adapter golden/parity tests and existing agent tests pass
    without changing externally visible defaults.

- [x] 2.2 Preserve OpenCode plugin entry behavior — `src/index.ts`
  - If `src/index.ts` is touched, introduce adapter consumption incrementally so
    current plugin creation, MCP registration, hooks, config merges, and tmux
    cleanup behavior remain unchanged.
  - Do not require Codex artifacts or configuration for OpenCode operation.
  - Acceptance evidence: list of plugin entrypoints confirmed unchanged or
    intentionally wrapped.
  **Verification**:
  - Run: `bun test src/plugin-node-runtime.test.ts src/mcp/index.test.ts src/hooks/skill-sync.test.ts`
  - Expected: Existing plugin runtime, MCP, and skill-sync regression tests pass
    with no Codex dependency on the OpenCode path.

- [x] 2.3 Preserve OpenCode skill sync and custom skill behavior —
  `src/cli/custom-skills.ts`, `src/hooks/skill-sync.ts`, and related tests
  - Keep current OpenCode skill registration and sync semantics intact while
    exposing shared skill metadata for adapters.
  - Acceptance evidence: before/after notes confirming OpenCode skill output
    paths and manifest behavior are preserved.
  **Verification**:
  - Run: `bun test src/cli/custom-skills.test.ts src/cli/skill-manifest.test.ts src/hooks/skill-sync.test.ts`
  - Expected: Existing OpenCode skill registration, manifest, and sync tests pass.

## Phase 3: Codex Configuration-First Adapter MVP

- [x] 3.1 Implement Codex adapter artifact planning —
  `src/harness/adapters/codex.ts` and
  `src/harness/adapters/codex.test.ts`
  - Consume the Phase 1.6 Codex surface registry before rendering artifacts.
  - Render artifact descriptors only for validated agent definition paths/fields,
    config/MCP snippets, skill layout, manifest output, and permission controls.
  - Represent unknown or unsupported runtime hooks, delegation, permissions, and
    context injection as diagnostics without generating speculative fields or
    files.
  - Acceptance evidence: generated artifact path list and diagnostic list for
    unmapped OpenCode features and unvalidated Codex surfaces.
  **Verification**:
  - Run: `bun test src/harness/adapters/codex.test.ts`
  - Expected: Tests cover seven generated agent artifacts only when the surface
    registry validates their paths/fields, config/MCP artifact descriptors only
    for validated surfaces, and visible diagnostics for unknown or unsupported
    capabilities.

- [x] 3.2 Add Codex TOML writer —
  `src/harness/writers/codex-toml.ts` and
  `src/harness/writers/codex-toml.test.ts`
  - Serialize only validated agent, config, and MCP TOML fields with
    deterministic ordering and safe escaping for prompts, paths, quotes,
    multiline text, and arrays.
  - Acceptance evidence: focused TOML fixture or snapshot summary showing agent
    prompt escaping and MCP configuration output.
  **Verification**:
  - Run: `bun test src/harness/writers/codex-toml.test.ts`
  - Expected: TOML writer tests pass for escaping, deterministic ordering,
    rejection of unvalidated fields, and invalid/unknown field diagnostics.

- [x] 3.3 Add Codex skill layout writer —
  `src/harness/writers/skill-layout.ts` and
  `src/harness/writers/skill-layout.test.ts`
  - Copy or render Codex-compatible skill directories from the shared registry
    only after the Phase 1.6 validation record confirms the target directory
    convention; otherwise emit a diagnostic and skip skill artifact writes.
  - Preserve exact source path provenance and emit a generated manifest with
    source hashes for generated skill artifacts.
  - Confine Codex-specific wrapper syntax to adapter packaging; keep skill bodies
    semantically equivalent to OpenCode SDD/requirements skills.
  - Acceptance evidence: skill manifest sample with source paths and hashes.
  **Verification**:
  - Run: `bun test src/harness/writers/skill-layout.test.ts src/harness/core/skills.test.ts`
  - Expected: Skill layout tests pass and prove bundled SDD/requirements skills
    are included only for validated Codex skill destinations, with diagnostics
    for unsupported destinations and no OpenCode-only syntax leaking into shared
    skill bodies.

- [x] 3.4 Add explicit Codex generation config/CLI surface —
  `src/config/schema.ts`, `src/cli/index.ts`, and focused CLI/config tests
  - Add optional harness selection or generation options without changing
    existing defaults or making installer behavior Codex-first.
  - Prefer dry-run/generate-first behavior before any command writes user config.
  - Acceptance evidence: CLI/config examples showing default OpenCode behavior
    and explicit Codex selection.
  **Verification**:
  - Run: `bun test src/config/loader.test.ts src/cli/install.test.ts src/cli/config-manager.test.ts`
  - Expected: Existing config and install tests pass, and new focused tests prove
    Codex generation is opt-in.

## Phase 4: thoth-mem Governance Across Harnesses

- [x] 4.1 Extract memory governance contract —
  `src/harness/core/memory-governance.ts` and
  `src/harness/core/memory-governance.test.ts`
  - Encode root-only ownership of `mem_session_start`, `mem_session_summary`,
    and `mem_save_prompt`; parent `session_id`/`project` requirements; read-only
    and write-capable subagent permissions; and SDD topic namespace protection.
  - Acceptance evidence: role-by-role memory permission matrix.
  **Verification**:
  - Run: `bun test src/harness/core/memory-governance.test.ts src/hooks/thoth-mem/index.test.ts`
  - Expected: Governance tests and existing thoth-mem hook tests pass.

- [x] 4.2 Render Codex subagent memory instructions —
  `src/harness/adapters/codex.ts` and
  `src/harness/adapters/codex.test.ts`
  - Ensure Codex agent TOML prompts include subagent prohibitions for root-only
    memory tools, parent context requirements, read-only/write-capable limits,
    and OpenSpec-only SDD artifact restrictions.
  - Configure Codex runtime permission controls for memory tools only when Phase
    1.6 validates a documented per-agent permission surface; otherwise emit
    enforcement-gap diagnostics such as
    `codex.permission.memory.enforcement_gap`.
  - Acceptance evidence: sampled prompt excerpts for explorer, quick, deep, and
    orchestrator memory rules plus permission-control or enforcement-gap
    diagnostic samples.
  **Verification**:
  - Run: `bun test src/harness/adapters/codex.test.ts -t "memory"`
  - Expected: Focused tests prove Codex subagent prompts preserve thoth-mem
    governance, runtime permission controls are generated only when validated,
    and unsupported enforcement emits visible diagnostics instead of claiming
    hard enforcement.

- [x] 4.3 Verify governance diagnostics for unsupported Codex enforcement —
  `src/harness/adapters/codex.test.ts` and
  `src/harness/core/memory-governance.test.ts`
  - Add tests for Codex surfaces where per-agent tool restriction, parent context
    injection, or write-permission enforcement is unavailable.
  - Assert the adapter reports instruction-level governance with documented
    enforcement gaps and does not represent prompt text alone as runtime
    enforcement.
  - Acceptance evidence: diagnostic examples for unsupported permission,
    context-injection, and memory-write enforcement.
  **Verification**:
  - Run: `bun test src/harness/adapters/codex.test.ts src/harness/core/memory-governance.test.ts -t "governance"`
  - Expected: Tests fail if unsupported Codex enforcement gaps are hidden, if
    subagents appear to receive root-owned memory operations, or if prompt text
    is counted as runtime enforcement.

## Phase 5: SDD/Skill Portability and Packaging Strategy

- [x] 5.1 Validate SDD skill portability through shared registry —
  `src/harness/core/skills.test.ts` and `src/harness/writers/skill-layout.test.ts`
  - Add tests that requirements-interview and all SDD phase skills retain phase
    responsibilities, persistence-mode rules, artifact prerequisites, and review
    gates when rendered for Codex.
  - Acceptance evidence: portability matrix for each bundled SDD skill.
  **Verification**:
  - Run: `bun test src/harness/core/skills.test.ts src/harness/writers/skill-layout.test.ts -t "SDD"`
  - Expected: Focused tests prove SDD/requirements skills are registered and
    packaged with equivalent semantics for Codex.

- [x] 5.2 Add generated Codex artifact fixtures or snapshots —
  `src/harness/__fixtures__/codex/` or inline snapshots in harness tests
  - Capture representative generated Codex agents, config/MCP TOML, skills
    layout manifest, and capability diagnostics.
  - Keep fixtures deterministic and scoped to Codex; do not add Claude,
    Antigravity, or other harness outputs.
  - Acceptance evidence: fixture/snapshot list and update policy.
  **Verification**:
  - Run: `bun test src/harness/adapters/codex.test.ts src/harness/writers/codex-toml.test.ts src/harness/writers/skill-layout.test.ts`
  - Expected: Generated Codex artifact fixtures or snapshots match expected
    deterministic output.

## Phase 6: Integration Verification and Release Readiness

- [x] 6.1 Run focused harness test suite — `src/harness/**`
  - Execute all new harness core, adapter, writer, registry, and fixture tests.
  - Acceptance evidence: command output summary with test files and pass count.
  **Verification**:
  - Run: `bun test src/harness`
  - Expected: All harness tests pass, including Codex artifact generation and
    OpenCode compatibility coverage.

- [x] 6.2 Run full repository verification — all touched modules
  - Run the required project checks after implementation is complete.
  - Include notes for any skipped checks only if blocked by environment, with the
    exact error and proposed follow-up.
  - Acceptance evidence: outputs for Biome, TypeScript, and Bun test suite.
  **Verification**:
  - Run: `bun run check:ci`
  - Run: `bun run typecheck`
  - Run: `bun test`
  - Expected: Biome check, TypeScript typecheck, and full Bun test suite pass.

- [x] 6.3 Confirm OpenCode rollback safety — `src/harness/registry.ts`,
  `src/index.ts`, and Codex generation entrypoints
  - Verify disabling or removing Codex adapter registration leaves OpenCode plugin
    operation independent of Codex artifacts or dependencies.
  - Acceptance evidence: rollback note identifying the Codex registration and
    generation surfaces that can be disabled without touching OpenCode runtime.
  **Verification**:
  - Run: `bun test src/harness/registry.test.ts src/plugin-node-runtime.test.ts src/agents/index.test.ts`
  - Expected: Tests prove OpenCode remains default and does not require Codex
    artifacts, configuration, or dependencies.
