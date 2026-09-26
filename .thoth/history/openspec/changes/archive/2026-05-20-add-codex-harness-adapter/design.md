# Design: Add Codex Harness Adapter

## Technical Approach

Introduce a harness-neutral agent-pack core that owns the seven-agent roster
intent, delegate-first operating model, SDD workflow semantics, thoth-mem
governance, and verification reporting contract. Harness adapters render that
core into concrete artifacts for a selected target.

OpenCode remains the default runtime path and continues to use the current
plugin entrypoint in `src/index.ts`, agent config generation in `src/agents/`,
skill sync in `src/cli/custom-skills.ts` and `src/hooks/skill-sync.ts`, MCP
registration in `src/mcp/`, and thoth-mem hooks in
`src/hooks/thoth-mem/`. Codex is added as a configuration-first adapter: it
first records validated Codex surfaces, then generates only the confirmed
project-local configuration, agent definition, MCP, hook, permission, delegation,
context-injection, and skill-layout artifacts from the shared contracts. Any
unvalidated or unsupported Codex surface must produce diagnostics only, not
speculative files or fields.

The design intentionally follows the useful reference ideas from gentle-ai:
adapter interfaces, strategy-style config writers, exact-path skill registry
injection, and Codex TOML-first output. It does not adopt Engram replacement or
an installer-first architecture.

## Architecture Decisions

### Decision: Add a harness-neutral core before adding Codex output

**Choice**: Create shared modules for contracts and rendering input, then make
OpenCode and Codex adapters consume those contracts.

**Alternatives considered**:

- Generate Codex files directly from existing OpenCode SDK config objects.
- Fork the current `src/agents/` prompts into a separate Codex-only tree.

**Rationale**: Existing code mixes shared intent with OpenCode-specific SDK
types, permissions, plugin hooks, and config merge semantics. A neutral core
prevents Codex from importing OpenCode-only APIs, satisfies the spec isolation
requirement, and reduces drift between harnesses.

### Decision: Keep OpenCode as the compatibility adapter and default path

**Choice**: Treat the current `src/index.ts` plugin flow as the OpenCode adapter
until it can be progressively wrapped behind `HarnessAdapter` without changing
runtime behavior.

**Alternatives considered**:

- Rewrite `src/index.ts` immediately around a generic adapter loader.
- Make Codex the primary output and back-port OpenCode later.

**Rationale**: The spec requires existing OpenCode users to receive unchanged
plugin behavior. The safest rollout is additive: extract shared contracts first,
write tests that prove `getAgentConfigs()` and plugin MCP/hook behavior are
unchanged, then introduce Codex generation behind explicit selection.

### Decision: Make Codex MVP configuration-first and TOML-first

**Choice**: Implement Codex support as artifact generation, not as a runtime
plugin. The adapter writes only documented or explicitly validated Codex
surfaces, such as the validated agent-definition location/format, project/user
Codex TOML snippets, MCP configuration, hooks only if documented, and
copied/rendered skill content.

**Alternatives considered**:

- Depend on a programmable Codex runtime orchestration API.
- Package Codex support as a marketplace/plugin installer first.

**Rationale**: The spec states Codex runtime parity is unproven. A
configuration-first adapter preserves the agent-pack intent without relying on
undocumented APIs, and it keeps rollback limited to generated Codex artifacts.

### Decision: Gate Codex implementation on surface validation

**Choice**: Add a pre-implementation validation gate before Codex artifact
generation. The gate records the exact Codex fields, file locations, skills
directory convention, MCP/config shape, permission controls, delegation support,
and parent context injection mechanism that are backed by documentation or a
deliberate local validation note.

**Alternatives considered**:

- Keep Codex file paths and TOML fields as open questions while implementation
  proceeds.
- Generate best-effort TOML artifacts and adjust after failures are discovered.

**Rationale**: Implementation tasks cannot safely write Codex artifacts while the
Codex surface is unresolved. The adapter must use exact validated surfaces, and
for each unvalidated surface it must emit a diagnostic-only result so the MVP is
honest about unsupported capabilities.

### Decision: Represent capability gaps explicitly

**Choice**: Adapter generation returns diagnostics with unsupported or degraded
capabilities, such as background delegation, task session lifecycle hooks, or
runtime prompt injection if Codex cannot model them.

**Alternatives considered**:

- Hide gaps in instructions and claim parity.
- Block all Codex generation until every behavior is proven equivalent.

**Rationale**: The spec requires visible capability gaps. Diagnostics let users
adopt a useful MVP while keeping unsupported behavior auditable.

### Decision: Preserve thoth-mem as the memory backend and governance model

**Choice**: Codex prompts and configs include the same root/subagent memory
ownership rules currently represented in `src/agents/prompt-utils.ts`,
`src/agents/orchestrator.ts`, and `src/hooks/thoth-mem/protocol.ts`. Where Codex
exposes documented runtime permission controls, the adapter configures those
controls and tests them. Where Codex cannot enforce a rule, the adapter renders
instruction-level governance and emits an enforcement-gap diagnostic.

**Alternatives considered**:

- Use a Codex-specific memory store.
- Allow each Codex subagent to manage its own session memory.

**Rationale**: The spec forbids replacing thoth-mem. Governance must remain
strict: only the root orchestrator owns `mem_session_start`,
`mem_session_summary`, and `mem_save_prompt`; subagents require injected parent
`session_id` and `project`; read-only and write-capable roles get distinct
memory permissions; SDD topic keys remain deterministic. The implementation must
not claim runtime enforcement in Codex unless validation proves the required
permission primitives exist.

## Data Flow

```text
Plugin/config selection
  -> HarnessRegistry resolves target (`opencode` default, `codex` explicit)
  -> CodexSurfaceValidation supplies confirmed Codex fields/paths/capabilities
     or marks surfaces as diagnostic-only
  -> AgentPackCore loads shared contracts
     - roles: orchestrator, explorer, librarian, oracle, designer, quick, deep
     - permissions/mutation modes
     - delegate-first and SDD rules
     - thoth-mem governance and verification protocol
     - bundled skill registry and exact source paths
  -> HarnessAdapter.render(context)
     -> OpenCodeAdapter maps contracts to SDK AgentConfig, plugin hooks, MCPs,
        and OpenCode skill sync
      -> CodexAdapter maps contracts to TOML agents, TOML config/MCP snippets,
         Codex skill directories, and diagnostics
  -> ArtifactWriter writes only the selected harness layout
  -> Verification checks generated shape and baseline compatibility
```

OpenCode runtime flow remains unchanged for default use: `src/index.ts` creates
agents, MCPs, hooks, thoth-mem integration, tmux session lifecycle handling,
and OpenCode config merges. Codex flow is explicit generation and does not run
OpenCode hooks.

## File Changes

Planned implementation files:

- `src/harness/types.ts` — shared `HarnessId`, `HarnessAdapter`, render context,
  artifact, diagnostic, capability, and writer result types.
- `src/harness/core/agent-pack.ts` — harness-neutral roster, role intent,
  dispatch expectations, mutation modes, and verification protocol.
- `src/harness/core/memory-governance.ts` — shared thoth-mem root/subagent rules,
  parent context requirements, and `sdd/{change}/{artifact}` namespace rules.
- `src/harness/core/sdd.ts` — shared requirements-interview and SDD phase order,
  artifact prerequisites, plan-review gate, and execution confirmation rules.
- `src/harness/core/skills.ts` — skill registry entries derived from
  `src/cli/custom-skills.ts`, including exact source paths and allowed roles.
- `src/harness/adapters/opencode.ts` — OpenCode adapter mapping core contracts to
  current SDK `AgentConfig`, MCP config, and skill sync behavior.
- `src/harness/adapters/codex.ts` — Codex adapter mapping core contracts to
  Codex artifact descriptors and diagnostics.
- `src/harness/adapters/codex-surfaces.ts` — validated Codex surface registry
  consumed by the adapter; unvalidated fields or paths resolve to diagnostics
  instead of generated artifacts.
- `docs/codex-surface-validation.md` — implementation-time validation record for
  confirmed Codex agent/config/MCP/skill/permission/delegation/context surfaces
  and known enforcement gaps.
- `src/harness/writers/codex-toml.ts` — TOML writer for Codex agent/config/MCP
  artifacts.
- `src/harness/writers/skill-layout.ts` — reusable skill copy/render strategy
  for harness-specific skill directories.
- `src/harness/registry.ts` — supported harness lookup and explicit
  unsupported-harness errors.
- `src/config/schema.ts` — add optional harness selection/generation config
  without changing existing defaults.
- `src/index.ts` — later, consume OpenCode adapter without altering default
  externally visible behavior.
- `src/cli/*` — add explicit generation/install command options for Codex only
  after the adapter exists; do not make the current installer Codex-first.

Planned test files:

- `src/harness/adapters/opencode.test.ts` — proves OpenCode output matches
  current agent names, modes, permissions, descriptions, and prompt governance.
- `src/harness/adapters/codex.test.ts` — validates Codex artifacts,
  unsupported-harness diagnostics, TOML escaping, and capability-gap reporting.
- `src/harness/core/*.test.ts` — validates shared contracts for roster, SDD,
  verification, and thoth-mem governance.
- Existing `src/agents/index.test.ts`, `src/mcp/index.test.ts`,
  `src/hooks/thoth-mem/index.test.ts`, and skill-sync tests remain regression
  targets.

## Interfaces / Contracts

```ts
export type HarnessId = 'opencode' | 'codex';

export interface HarnessAdapter {
  id: HarnessId;
  displayName: string;
  capabilities: HarnessCapabilities;
  render(context: HarnessRenderContext): HarnessRenderResult;
}

export interface HarnessRenderContext {
  projectRoot: string;
  agentPack: AgentPackContract;
  skills: SkillRegistryEntry[];
  thoth: ThothMcpContract;
  options: HarnessRenderOptions;
}

export interface HarnessRenderResult {
  harness: HarnessId;
  artifacts: HarnessArtifact[];
  diagnostics: HarnessDiagnostic[];
}

export interface HarnessArtifact {
  path: string;
  kind:
    | 'agent-config'
    | 'harness-config'
    | 'mcp-config'
    | 'skill'
    | 'hook-config'
    | 'manifest';
  content: string | Uint8Array;
}

export interface HarnessDiagnostic {
  severity: 'info' | 'warning' | 'error';
  code: string;
  message: string;
  capability?: keyof HarnessCapabilities;
}
```

Core contracts should not import `@opencode-ai/sdk`, OpenCode plugin types, or
Codex-specific TOML writer types. The OpenCode adapter may import SDK types. The
Codex adapter may import TOML writer and filesystem artifact types only.

Codex MVP artifact contract:

- Seven Codex agent artifacts at the validated agent-definition location and
  format; `.codex/agents/*.toml` remains the expected candidate only if the
  validation gate confirms it.
- A Codex config TOML snippet/file for model, tool, and MCP settings only where
  validated.
- A Codex-compatible skills directory generated from the shared skill registry
  only where a project-local or user-level skills convention is validated.
- A generated manifest recording source skill paths and hashes, equivalent in
  spirit to `.skill-manifest.json`, but scoped to Codex output.
- Diagnostics for any unmapped OpenCode features: plugin hooks,
  `experimental.chat.*` transforms, tmux pane lifecycle, foreground fallback,
  background task behavior, context injection, delegation semantics, or
  unavailable permission primitives.

thoth-mem governance contract:

- Root orchestrator may own `mem_session_start`, `mem_session_summary`, and
  `mem_save_prompt`.
- Subagents must never call those root-only tools.
- Subagents may use thoth-mem only when dispatch includes parent `session_id`
  and `project`.
- Read-only subagents use only `mem_search -> mem_timeline ->
  mem_get_observation` and never write memory.
- Write-capable subagents may use `mem_save`, `mem_search`,
  `mem_get_observation`, `mem_timeline`, and `mem_suggest_topic_key` only as
  allowed by dispatch and active persistence mode.
- SDD artifacts use `sdd/{change}/{artifact}` topic keys only in modes that
  include thoth-mem; OpenSpec-only modes must not write SDD memory artifacts.
- Runtime permission controls are required only where the target harness exposes
  documented primitives; otherwise the adapter must include instruction-level
  rules plus diagnostics such as `codex.permission.memory.enforcement_gap`.

## Testing Strategy

- Add contract tests for the core roster to ensure all seven roles exist with
  stable intent, mode, dispatch, mutation, and verification metadata.
- Add OpenCode adapter golden/regression tests comparing generated OpenCode agent
  configs with existing `getAgentConfigs()` output for names, `mode`,
  permissions, descriptions, and key prompt sections.
- Add Codex adapter tests for generated agent paths/fields only where validated,
  TOML escaping, prompt inclusion, role-specific permissions where supported, and
  memory governance diagnostics where runtime enforcement is unsupported.
- Add unsupported-harness tests that assert explicit error diagnostics and no
  artifact writes.
- Add skill portability tests to verify all bundled SDD and requirements skills
  are registered from exact source paths and rendered/copied without OpenCode
  syntax leaking into skill bodies except adapter wrappers.
- Add thoth-mem governance tests that assert Codex subagent prompts include
  root-only prohibitions, parent context requirements, read-only/write-capable
  distinctions, protected SDD namespace guidance, generated runtime permission
  controls when available, and visible enforcement-gap diagnostics when Codex
  cannot enforce those rules.
- Run the standard verification set after implementation: `bun run check:ci`,
  `bun run typecheck`, and focused/full `bun test` depending on touched files.

## Migration / Rollout

1. Extract shared contracts from existing prompts and registries without changing
   `src/index.ts` behavior.
2. Add OpenCode adapter tests proving baseline parity.
3. Introduce `HarnessRegistry` with `opencode` as the default and explicit
   unsupported-harness failures for anything else.
4. Complete the Codex surface validation record and surface registry before
   writing Codex artifact rendering.
5. Implement Codex adapter artifact rendering behind explicit CLI/config
   selection; do not require Codex artifacts for OpenCode operation.
6. Add Codex TOML writer and skill-layout writer with dry-run/generate-first
   behavior before any installer path writes user config.
7. Add diagnostics for Codex capability gaps and document validated versus
   unvalidated surfaces.
8. Only after tests pass, consider exposing user-facing install/generate docs.
9. Rollback by disabling/removing Codex adapter registration and generated
   artifact command; OpenCode adapter and current plugin path remain intact.

## Validation Gate

Before Phase 3 implementation, record the confirmed answer for each Codex
surface in `docs/codex-surface-validation.md` and mirror machine-consumable
capability decisions in `src/harness/adapters/codex-surfaces.ts`:

- Agent definition fields and file locations.
- MCP settings, hooks, model selection, and per-agent permission fields.
- Project-local or user-level skills directory convention.
- Runtime delegation support and background task semantics.
- Parent `session_id` and `project` context injection support.

If a surface is not validated, the Codex adapter must not generate that field or
file. It must emit a diagnostic describing the unsupported capability and the
instruction-level fallback, if any.

## Open Questions

- Which future Codex surfaces can graduate from diagnostic-only to generated
  artifacts after validation updates?

## Non-Goals

- Do not implement Codex runtime orchestration via undocumented APIs.
- Do not add Claude, Antigravity, or any non-OpenCode/non-Codex harness adapter.
- Do not replace thoth-mem or introduce an alternative memory backend.
- Do not change OpenCode default behavior, plugin registration, or current skill
  sync behavior as part of Codex generation.
- Do not make the current installer Codex-first or require Codex for OpenCode
  users.
- Do not implement marketplace packaging, hosted plugin distribution, or hooks
  beyond documented Codex configuration surfaces in the MVP.
- Do not create SDD tasks or implementation code in this design phase.
