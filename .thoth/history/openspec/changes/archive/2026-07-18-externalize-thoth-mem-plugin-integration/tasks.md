# Tasks: Externalize thoth-mem Plugin Integration

### Scope, prerequisites, and gates

- This is a refreshed Full-SDD stage-1 plan for `externalize-thoth-mem-plugin-integration`.
- The previous `plan-review.md` describes the superseded provider-owned boundary and is stale; it cannot authorize execution. A fresh oracle plan review and explicit user implementation approval are external gates before any task below is applied.
- The plan covers exactly OpenCode, Codex, and Claude Code. It never assigns thoth-agents provider setup, probing, health checks, acquisition, provider-state migration, cleanup of independently installed provider assets, or fallback/recovery procedures.
- Provider capability evidence is consumed only when already supplied by a documented provider or harness surface. No task adds a provider manager or operational protocol.
- All tasks start unchecked. `T001`–`T017` are implementation/verification work; `T018`–`T021` are the separately owned external post-apply SDD verification loop. Archive remains outside this plan.

## Phase 1: Red tests and neutral contract foundation

- [x] 1.1 **T001** Author red governance, evidence, and continuity tests — `src/harness/core/memory-governance.test.ts`, `src/agents/prompt-rendering.test.ts`, `src/agents/index.test.ts`, `src/cli/operations/types.test.ts`
  **[USN-1]** | Priority: P1 | Owner: deep
  **Depends on:** None. **Prerequisites:** Fresh plan review approval and user implementation approval; current test paths confirmed.
  **Spec:** `multi-harness-agent-pack/MH-2 Report Provider-Dependent Capability Truthfully`
  **Spec:** `multi-harness-agent-pack/MH-3 Preserve Neutral Orchestration and SDD Contracts`
  **Spec:** `multi-harness-agent-pack/MH-4 Preserve Handoff and Completion Continuity as Outcomes`
  **Spec:** `multi-harness-agent-pack/Enforce thoth-mem Governance Across Harnesses`
  **Spec:** `skill-instructions/SI-2 Prohibit Consumer Copies of Provider Protocol`
  **Spec:** `skill-instructions/SI-3 Preserve Neutral Orchestration and SDD Guidance`
  **Spec:** `skill-instructions/SI-4 Preserve Handoff and Completion Continuity Without Provider Calls`
  **Spec:** `skill-instructions/Express Shared Skill Semantics in Harness-Neutral Language`
  **Spec:** `skill-instructions/Fail Explicitly for Unsupported Harness Behavior`
  **Independent Test:** The new assertions are red against current protocol-heavy governance and prompts, and cover caller-supplied complete/partial/contradictory/stale evidence, omitted-evidence defaulting to unsupported, parent authorization, canonical identities, required handoff context, resumable completion, explicit capability gaps, and absence of consumer fallback/protocol sequencing.
  **Verification**:
  - Run: `pnpm test -- src/harness/core/memory-governance.test.ts src/agents/prompt-rendering.test.ts src/agents/index.test.ts src/cli/operations/types.test.ts`
  - Expected: New tests are collected and fail only on the superseded consumer-owned behavior.

- [x] 1.2 **T002** Add provider-neutral evidence and orchestration contracts — `src/harness/types.ts`, `src/harness/core/memory-governance.ts`, `src/cli/operations/types.ts`
  **[USN-1]** | Priority: P1 | Owner: deep
  **Depends on:** T001. **Prerequisites:** T001 identifies the retained consumer assertions; no provider operational API is introduced.
  **Spec:** `multi-harness-agent-pack/MH-2 Report Provider-Dependent Capability Truthfully`
  **Spec:** `multi-harness-agent-pack/MH-3 Preserve Neutral Orchestration and SDD Contracts`
  **Spec:** `multi-harness-agent-pack/MH-4 Preserve Handoff and Completion Continuity as Outcomes`
  **Spec:** `skill-instructions/SI-3 Preserve Neutral Orchestration and SDD Guidance`
  **Spec:** `skill-instructions/SI-4 Preserve Handoff and Completion Continuity Without Provider Calls`
  **Spec:** `skill-instructions/Preserve thoth-mem Topic-Key Discipline`
  **Independent Test:** Type-level and unit tests accept only caller/provider-or-harness-supplied supported/degraded/unsupported evidence, default omitted evidence to unsupported, keep reports ephemeral and separate from consumer-managed status, preserve `sdd/{change}/{artifact}` and `sdd/*` protection, and expose only outcome-level authorization/continuity/truthfulness fields without ambient discovery or state mutation.
  **Verification**:
  - Run: `pnpm test -- src/harness/core/memory-governance.test.ts src/cli/operations/types.test.ts`; `pnpm run typecheck`
  - Expected: Contract tests pass and TypeScript reports no new errors without provider tool/action/argument models.

- [x] 1.3 **T003** Author red runtime/config absence, hybrid artifact-loader, and task-validator contract tests — `src/plugin-node-runtime.test.ts`, `src/mcp/index.test.ts`, `src/config/loader.test.ts`, `src/hooks/thoth-mem/index.test.ts`, `src/thoth/client.test.ts`, `src/sdd/artifact-governance/artifact-loader.test.ts`, `src/sdd/artifact-governance/tasks-validator.test.ts`
  **[USN-1]** | Priority: P1 | Owner: deep
  **Depends on:** None (may run with T001). **Prerequisites:** Legacy paths exist and unrelated exa/context7/grep_app MCPs and phase hooks are identified as preservation fixtures.
  **Spec:** `multi-harness-agent-pack/MH-1 Establish Exclusive Provider Ownership`
  **Spec:** `multi-harness-agent-pack/MH-2 Report Provider-Dependent Capability Truthfully`
  **Spec:** `multi-harness-agent-pack/MH-3 Preserve Neutral Orchestration and SDD Contracts`
  **Spec:** `multi-harness-agent-pack/Limit Rollout Scope Safely`
  **Spec:** `skill-instructions/SI-1 Remove Bundled Provider Guidance`
  **Independent Test:** Negative tests fail while the bundled hook/client/launcher/config and lifecycle composition remain, while positive assertions protect unrelated hooks, MCPs, persistence-mode configuration, exactly three harness registrations, and red cases for partial OpenSpec-only/provider-only hybrids, unavailable hybrids, and diverged hybrids. Each red case pins the shared `complete`/`partial`/`unavailable`/`diverged` metadata, `inspectableSource`, `providerState`, `missingSources`, and canonical finding codes without silent authority/mode switching, fallback, or repair.
  **Verification**:
  - Run: `pnpm test -- src/plugin-node-runtime.test.ts src/mcp/index.test.ts src/config/loader.test.ts src/hooks/thoth-mem/index.test.ts src/thoth/client.test.ts src/sdd/artifact-governance/artifact-loader.test.ts src/sdd/artifact-governance/tasks-validator.test.ts`
  - Expected: New absence, loader, and validator cases are red before deletion/contract correction; partial, unavailable, and diverged outcomes expose any authority/mode switch, missing metadata, non-canonical finding, or repair expectation.

- [x] 1.4 **T004** Delete bundled provider implementation/configuration and replace loader/task-validator fallback, repair, and recoverable branches — `src/skills/thoth-mem-agents/SKILL.md`; `src/hooks/thoth-mem/index.ts`; `src/hooks/thoth-mem/protocol.ts`; `src/hooks/thoth-mem/index.test.ts`; `src/mcp/thoth.ts`; `src/thoth/client.ts`; `src/thoth/client.test.ts`; `src/thoth/index.ts`; `src/index.ts`; `src/hooks/index.ts`; `src/mcp/index.ts`; `src/config/constants.ts`; `src/config/schema.ts`; `src/config/index.ts`; `src/config/loader.ts`; `thoth-agents.schema.json`; `src/sdd/artifact-governance/artifact-loader.ts`; `src/sdd/artifact-governance/tasks-validator.ts`
  **[USN-1]** | Priority: P1 | Owner: deep
  **Depends on:** T002 and T003. **Prerequisites:** T003 red absence/preservation tests pass as expected; retain unrelated MCP/hook/config behavior and `ArtifactStoreModeSchema`.
  **Spec:** `multi-harness-agent-pack/MH-1 Establish Exclusive Provider Ownership`
  **Spec:** `multi-harness-agent-pack/MH-2 Report Provider-Dependent Capability Truthfully`
  **Spec:** `multi-harness-agent-pack/MH-3 Preserve Neutral Orchestration and SDD Contracts`
  **Spec:** `multi-harness-agent-pack/Render Canonical thoth-mem Tool Surface Across Harness Surfaces`
  **Spec:** `multi-harness-agent-pack/Bootstrap Root thoth-mem Sessions Before Other Memory Operations`
  **Spec:** `skill-instructions/SI-1 Remove Bundled Provider Guidance`
  **Spec:** `skill-instructions/SI-2 Prohibit Consumer Copies of Provider Protocol`
  **Spec:** `skill-instructions/Use Canonical thoth-mem MCP Surface in Skill Guidance`
  **Spec:** `skill-instructions/Encode thoth-mem Lifecycle Ownership in Skill Guidance`
  **Independent Test:** The deleted files are absent, no registry or import recreates them, the public schema no longer owns provider runtime/command state, unrelated integrations plus persistence modes still load, and loader/validator return the same `complete`/`partial`/`unavailable`/`diverged` metadata (`inspectableSource`, `providerState`, `missingSources`, canonical finding vocabulary) for OpenSpec-only, provider-only, unavailable, matching, and diverged hybrid cases. Obsolete `hybrid-fallback`, repair expectations, and `recoverable` semantics are absent; declared mode and authority never switch silently and completion is never fabricated.
  **Verification**:
  - Run: `pnpm test -- src/plugin-node-runtime.test.ts src/mcp/index.test.ts src/config/loader.test.ts src/sdd/artifact-governance/artifact-loader.test.ts src/sdd/artifact-governance/tasks-validator.test.ts`
  - Expected: Runtime/config, artifact-loader, and task-validator suites pass with no bundled provider launcher, hook, client, skill, fallback label, repair expectation, recoverable branch, authority/mode switch, or fabricated provider success.

## Phase 2: Harness-neutral prompts, skills, registry, and generated outputs

- [x] 2.1 **T005** Author red registry, prompt, skill-layout, adapter, writer, and fixture tests — `src/harness/registry.test.ts`, `src/harness/core/skills.test.ts`, `src/cli/custom-skills.test.ts`, `src/harness/writers/skill-layout.test.ts`, `src/harness/adapters/opencode.test.ts`, `src/harness/adapters/codex.test.ts`, `src/harness/adapters/claude-code.test.ts`, `src/harness/writers/codex-plugin-package.test.ts`, `src/harness/writers/codex-toml.test.ts`, `src/harness/writers/claude-code-plugin-package.test.ts`, `src/harness/generate-codex-plugin.test.ts`, `src/harness/__fixtures__/codex/agent-deep.toml`
  **[USN-2]** | Priority: P1 | Owner: deep
  **Depends on:** T003. **Prerequisites:** T004 deletion target is known; fixtures are updated only after owning adapter/writer behavior changes.
  **Spec:** `multi-harness-agent-pack/MH-1 Establish Exclusive Provider Ownership`
  **Spec:** `multi-harness-agent-pack/Limit Rollout Scope Safely`
  **Spec:** `skill-instructions/SI-1 Remove Bundled Provider Guidance`
  **Spec:** `skill-instructions/SI-2 Prohibit Consumer Copies of Provider Protocol`
  **Spec:** `skill-instructions/SI-5 Scope Harness Guidance and Capability Claims`
  **Spec:** `skill-instructions/Use Canonical thoth-mem MCP Surface in Skill Guidance`
  **Independent Test:** Tests are red for absence of the deleted bundled skill and provider-owned generated assets in OpenCode, Codex, and Claude Code, while unrelated integrations, SDD skills, and harness-specific limitations remain present.
  **Verification**:
  - Run: `pnpm test -- src/harness/registry.test.ts src/harness/core/skills.test.ts src/cli/custom-skills.test.ts src/harness/writers/skill-layout.test.ts src/harness/adapters/opencode.test.ts src/harness/adapters/codex.test.ts src/harness/adapters/claude-code.test.ts src/harness/writers/codex-plugin-package.test.ts src/harness/writers/codex-toml.test.ts src/harness/writers/claude-code-plugin-package.test.ts src/harness/generate-codex-plugin.test.ts`
  - Expected: New negative/preservation cases are collected and fail only on current provider entries or copies.

- [x] 2.2 **T006** Remove registry entries and rewrite shared governance, prompts, and SDD skills as neutral outcomes — `src/harness/core/skills.ts`, `src/cli/custom-skills.ts`, `src/harness/core/memory-governance.ts`, `src/agents/prompt-sections.ts`, `src/agents/orchestrator.ts`, `src/skills/_shared/thoth-mem-convention.md`, `src/skills/_shared/persistence-contract.md`, `src/skills/_shared/openspec-convention.md`, `src/skills/requirements-interview/SKILL.md`, `src/skills/executing-plans/SKILL.md`, `src/skills/plan-reviewer/SKILL.md`, `src/skills/sdd-init/SKILL.md`, `src/skills/sdd-propose/SKILL.md`, `src/skills/sdd-spec/SKILL.md`, `src/skills/sdd-clarify/SKILL.md`, `src/skills/sdd-design/SKILL.md`, `src/skills/sdd-tasks/SKILL.md`, `src/skills/sdd-apply/SKILL.md`, `src/skills/sdd-verify/SKILL.md`, `src/skills/sdd-archive/SKILL.md`, `src/skills/sdd-constitution/SKILL.md`, `src/harness/core/sdd.ts`, `src/harness/core/sdd.test.ts`
  **[USN-2]** | Priority: P1 | Owner: deep
  **Depends on:** T002, T004, and T005. **Prerequisites:** Preserve role/permission boundaries, SDD phase order/gates/handoff hints, canonical OpenSpec names, canonical `sdd/{change}/{artifact}` identities, and provider-independent modes.
  **Spec:** `multi-harness-agent-pack/MH-3 Preserve Neutral Orchestration and SDD Contracts`
  **Spec:** `multi-harness-agent-pack/MH-4 Preserve Handoff and Completion Continuity as Outcomes`
  **Spec:** `multi-harness-agent-pack/Enforce thoth-mem Governance Across Harnesses`
  **Spec:** `multi-harness-agent-pack/Preserve SDD Skills Portability`
  **Spec:** `skill-instructions/SI-2 Prohibit Consumer Copies of Provider Protocol`
  **Spec:** `skill-instructions/SI-3 Preserve Neutral Orchestration and SDD Guidance`
  **Spec:** `skill-instructions/SI-4 Preserve Handoff and Completion Continuity Without Provider Calls`
  **Spec:** `skill-instructions/SI-5 Scope Harness Guidance and Capability Claims`
  **Spec:** `skill-instructions/Express Shared Skill Semantics in Harness-Neutral Language`
  **Spec:** `skill-instructions/Fail Explicitly for Unsupported Harness Behavior`
  **Spec:** `skill-instructions/Preserve thoth-mem Topic-Key Discipline`
  **Spec:** `skill-instructions/Encode thoth-mem Lifecycle Ownership in Skill Guidance`
  **Spec:** `skill-instructions/Teach High-Signal thoth-mem Retrieval Decisions`
  **Independent Test:** Rendered guidance contains only consumer authorization, artifact, gate, handoff, continuity, evidence, and truthfulness outcomes; it delegates provider mechanics to installed guidance, preserves all SDD contracts, and never claims unsupported persistence or a substitute procedure.
  **Verification**:
  - Run: `pnpm test -- src/harness/core/memory-governance.test.ts src/agents/prompt-rendering.test.ts src/agents/index.test.ts src/cli/custom-skills.test.ts src/harness/core/sdd.test.ts`
  - Expected: Governance, prompt, registry, and SDD portability suites pass without exhaustive provider vocabulary or lifecycle/retrieval recipes.

- [x] 2.3 **T007** Strip provider-owned assets from all supported harness adapters, writers, manifests, and fixtures — `src/harness/registry.ts`, `src/harness/adapters/opencode.ts`, `src/harness/adapters/codex.ts`, `src/harness/adapters/claude-code.ts`, `src/harness/writers/skill-layout.ts`, `src/harness/writers/codex-plugin-package.ts`, `src/harness/writers/codex-toml.ts`, `src/harness/writers/claude-code-plugin-package.ts`, `src/harness/writers/claude-code-skill-layout.ts`, `src/harness/__fixtures__/codex/mcp.toml`, `src/harness/__fixtures__/codex/skill-manifest.json`, `src/harness/__fixtures__/codex/agent-deep.toml`
  **[USN-2]** | Priority: P1 | Owner: deep
  **Depends on:** T005 and T006. **Prerequisites:** Registry and prompt sources are neutral; preserve unrelated MCPs, hooks, manifests, package blocks, and exactly `opencode`, `codex`, `claude` adapter scope.
  **Spec:** `multi-harness-agent-pack/MH-1 Establish Exclusive Provider Ownership`
  **Spec:** `multi-harness-agent-pack/MH-2 Report Provider-Dependent Capability Truthfully`
  **Spec:** `multi-harness-agent-pack/Limit Rollout Scope Safely`
  **Spec:** `skill-instructions/SI-1 Remove Bundled Provider Guidance`
  **Spec:** `skill-instructions/SI-5 Scope Harness Guidance and Capability Claims`
  **Spec:** `skill-instructions/Use Canonical thoth-mem MCP Surface in Skill Guidance`
  **Independent Test:** Generated and installed outputs for all three harnesses omit provider launchers, hooks, lifecycle assets, runtime/state/configuration, bundled skill, and protocol copies; unsupported harness requests stop explicitly; unrelated integrations remain byte-for-byte or structurally preserved.
  **Verification**:
  - Run: `pnpm test -- src/harness/registry.test.ts src/harness/adapters/opencode.test.ts src/harness/adapters/codex.test.ts src/harness/adapters/claude-code.test.ts src/harness/writers/skill-layout.test.ts src/harness/writers/codex-plugin-package.test.ts src/harness/writers/codex-toml.test.ts src/harness/writers/claude-code-plugin-package.test.ts src/harness/generate-codex-plugin.test.ts`
  - Expected: Three-harness absence, scope, and preservation assertions pass.

## Phase 3: Evidence-aware CLI, install/status contracts, and TUI

- [x] 3.1 **T008** Author red operation, command, direct-install, and Codex/Claude packaging tests for separated consumer state, caller-supplied evidence, and provider-config preservation — `src/cli/operations/types.test.ts`, `src/cli/operations/opencode.test.ts`, `src/cli/operations/codex.test.ts`, `src/cli/operations/claude-code.test.ts`, `src/cli/commands.test.ts`, `src/cli/install.test.ts`, `src/cli/codex-install.test.ts`, `src/cli/claude-code-install.test.ts`, `src/cli/codex-config-io.test.ts`
  **[USN-3]** | Priority: P1 | Owner: deep
  **Depends on:** T002 and T007. **Prerequisites:** Evidence report is ephemeral; no test may require a consumer probe, setup runner, health checker, acquisition flow, migration, or fallback.
  **Spec:** `multi-harness-agent-pack/MH-2 Report Provider-Dependent Capability Truthfully`
  **Spec:** `multi-harness-agent-pack/MH-3 Preserve Neutral Orchestration and SDD Contracts`
  **Spec:** `multi-harness-agent-pack/MH-5 Keep Stage and Rollback Boundaries Explicit`
  **Spec:** `multi-harness-agent-pack/Limit Rollout Scope Safely`
  **Spec:** `skill-instructions/SI-3 Preserve Neutral Orchestration and SDD Guidance`
  **Spec:** `skill-instructions/Fail Explicitly for Unsupported Harness Behavior`
  **Independent Test:** Tests are red for caller-supplied complete/partial/absent/contradictory/stale evidence (with omitted evidence unsupported), separate consumer install state, unchanged persistence-mode selection, unsupported-harness diagnostics, provider-independent operation continuity, exact external evidence propagation without false success, and preservation of independently installed provider config outside managed blocks.
  **Verification**:
  - Run: `pnpm test -- src/cli/operations/types.test.ts src/cli/operations/opencode.test.ts src/cli/operations/codex.test.ts src/cli/operations/claude-code.test.ts src/cli/commands.test.ts src/cli/install.test.ts src/cli/codex-install.test.ts src/cli/claude-code-install.test.ts src/cli/codex-config-io.test.ts`
  - Expected: New state-separation, caller-evidence, and config-preservation cases are collected and fail only on bundled-provider claims, conflated status, or over-broad managed-block writes.

- [x] 3.2 **T009** Implement evidence-only operation/status and direct-install reporting — `src/cli/operations/types.ts`, `src/cli/operations/opencode.ts`, `src/cli/operations/codex.ts`, `src/cli/operations/claude-code.ts`, `src/cli/commands.ts`, `src/cli/install.ts`, `src/cli/codex-install.ts`, `src/cli/claude-code-install.ts`
  **[USN-3]** | Priority: P1 | Owner: deep
  **Depends on:** T008. **Prerequisites:** Consume already-observed provider/harness evidence only; keep consumer-managed status separate; preserve OpenSpec/provider-independent workflows and three-harness scope.
  **Spec:** `multi-harness-agent-pack/MH-2 Report Provider-Dependent Capability Truthfully`
  **Spec:** `multi-harness-agent-pack/MH-3 Preserve Neutral Orchestration and SDD Contracts`
  **Spec:** `multi-harness-agent-pack/MH-5 Keep Stage and Rollback Boundaries Explicit`
  **Spec:** `skill-instructions/SI-3 Preserve Neutral Orchestration and SDD Guidance`
  **Spec:** `skill-instructions/Fail Explicitly for Unsupported Harness Behavior`
  **Independent Test:** Operation and install reports consume caller/provider-or-harness evidence only, default omission to `unsupported`, render consumer changes separately from provider capability (`supported`, `degraded`, `unsupported`), never infer capability from package/consumer state, never mutate provider state, never silently switch persistence mode, and identify stage/rollback limits.
  **Verification**:
  - Run: `pnpm test -- src/cli/operations/types.test.ts src/cli/operations/opencode.test.ts src/cli/operations/codex.test.ts src/cli/operations/claude-code.test.ts src/cli/commands.test.ts src/cli/install.test.ts src/cli/codex-install.test.ts src/cli/claude-code-install.test.ts src/cli/codex-config-io.test.ts`; `pnpm run typecheck`
  - Expected: Focused CLI/operation suites and typecheck pass with truthful caller-supplied evidence diagnostics, no provider lifecycle implementation, and preserved external config.

- [x] 3.3 **T010** Author red TUI interaction and snapshot tests for separate capability dimensions — `src/cli/tui/operations.test.ts`, `src/cli/tui/App.test.tsx`, `src/cli/tui/__snapshots__/App.test.tsx.snap`
  **[USN-3]** | Priority: P1 | Owner: designer
  **Depends on:** T008. **Prerequisites:** TUI consumes the neutral status contract; visual states must not imply provider ownership or unsupported success.
  **Spec:** `multi-harness-agent-pack/MH-2 Report Provider-Dependent Capability Truthfully`
  **Spec:** `multi-harness-agent-pack/MH-3 Preserve Neutral Orchestration and SDD Contracts`
  **Spec:** `skill-instructions/SI-5 Scope Harness Guidance and Capability Claims`
  **Independent Test:** Red tests cover loading, supported/degraded/unsupported evidence, consumer/provider separation, diagnostics and manual provider-guidance pointers, disabled actions, retry/back, stale completion suppression, and preservation of synchronous model paths.
  **Verification**:
  - Run: `pnpm test -- src/cli/tui/operations.test.ts src/cli/tui/App.test.tsx`
  - Expected: New interaction and snapshot cases are collected and fail only because the evidence-aware UI is not implemented.

- [x] 3.4 **T011** Implement and visually QA evidence-aware TUI status/plan/apply views — `src/cli/tui/operations.ts`, `src/cli/tui/App.tsx`, `src/cli/tui/components/StatusView.tsx`, `src/cli/tui/components/PlanPreview.tsx`, `src/cli/tui/__snapshots__/App.test.tsx.snap`
  **[USN-3]** | Priority: P1 | Owner: designer
  **Depends on:** T009 and T010. **Prerequisites:** Keep operations single-flight and stale-safe; show consumer actions separately from provider evidence; no provider setup/probe/health/acquisition implementation.
  **Spec:** `multi-harness-agent-pack/MH-2 Report Provider-Dependent Capability Truthfully`
  **Spec:** `multi-harness-agent-pack/MH-3 Preserve Neutral Orchestration and SDD Contracts`
  **Spec:** `skill-instructions/SI-5 Scope Harness Guidance and Capability Claims`
  **Independent Test:** TUI renders supported/degraded/unsupported and unavailable states with explicit diagnostics, preserves consumer status, disables invalid actions, and presents resumable continuation outcomes without terminal/finalization semantics.
  **Verification**:
  - Run: `pnpm test -- src/cli/tui/operations.test.ts src/cli/tui/App.test.tsx`
  - Expected: Interaction tests and reviewed snapshots pass for all evidence states, retry/back, stale responses, and single-flight behavior.

## Phase 4: Documentation, staged rollback boundary, and focused regression matrix

- [x] 4.1 **T012** Create the cross-platform provider-boundary regression, record it red, then update metadata, root guidance, and routed documentation — new `src/harness/provider-boundary.test.ts`; `package.json`, `README.md`, `AGENTS.md`, `docs/installation.md`, `docs/skills-and-mcps.md`, `docs/sdd-pipeline.md`, `docs/quick-reference.md`, `docs/codex-install.md`, `docs/claude-code-plugin-packaging.md`, `docs/agent/index.md`, `docs/agent/routing-cases.json`, `docs/agent/architecture.md`, `docs/agent/cli-installation.md`, `docs/agent/harness-packaging.md`, `docs/agent/runtime-integrations.md`, `docs/agent/memory-governance.md`, `docs/agent/sdd-and-skills.md`, `docs/agent/agents-and-delegation.md`
  **[USN-4]** | Priority: P2 | Owner: quick
  **Depends on:** T006, T007, and T009. **Prerequisites:** Document only provider-owned installation/guidance as authoritative; preserve exact three-harness scope, evidence states, no fallback/migration, resumable summary/checkpoint continuity, consumer-only rollback, and stage 2 as accepted follow-up.
  **Closed read-only scan manifest:** `documentationAndMetadata` contains every T012 metadata/documentation target: `package.json`, `README.md`, `AGENTS.md`, `docs/installation.md`, `docs/skills-and-mcps.md`, `docs/sdd-pipeline.md`, `docs/quick-reference.md`, `docs/codex-install.md`, `docs/claude-code-plugin-packaging.md`, `docs/agent/index.md`, `docs/agent/routing-cases.json`, `docs/agent/architecture.md`, `docs/agent/cli-installation.md`, `docs/agent/harness-packaging.md`, `docs/agent/runtime-integrations.md`, `docs/agent/memory-governance.md`, `docs/agent/sdd-and-skills.md`, and `docs/agent/agents-and-delegation.md`; `lifecycleFixtures` contains exactly `src/harness/__fixtures__/codex/agent-deep.toml`, `src/harness/__fixtures__/codex/mcp.toml`, and `src/harness/__fixtures__/codex/skill-manifest.json`; `consumerSurfaces` contains exactly `src/harness/registry.ts`, `src/harness/core/skills.ts`, `src/harness/core/memory-governance.ts`, `src/harness/adapters/opencode.ts`, `src/harness/adapters/codex.ts`, `src/harness/adapters/claude-code.ts`, `src/harness/writers/codex-plugin-package.ts`, `src/harness/writers/codex-toml.ts`, `src/harness/writers/claude-code-plugin-package.ts`, `src/hooks/index.ts`, and `src/mcp/index.ts`. Fixture/source entries are scan inputs only and MUST NOT be edited by T012; their implementation ownership remains T004/T006/T007.
  **Spec:** `multi-harness-agent-pack/MH-1 Establish Exclusive Provider Ownership`
  **Spec:** `multi-harness-agent-pack/MH-2 Report Provider-Dependent Capability Truthfully`
  **Spec:** `multi-harness-agent-pack/MH-5 Keep Stage and Rollback Boundaries Explicit`
  **Spec:** `skill-instructions/SI-1 Remove Bundled Provider Guidance`
  **Spec:** `skill-instructions/SI-2 Prohibit Consumer Copies of Provider Protocol`
  **Spec:** `skill-instructions/SI-4 Preserve Handoff and Completion Continuity Without Provider Calls`
  **Spec:** `skill-instructions/SI-5 Scope Harness Guidance and Capability Claims`
  **Independent Test:** Create `src/harness/provider-boundary.test.ts` first and record its red result against stale repository-relative content; then make it green through T012-owned metadata/routing/documentation cleanup. The read-only cross-platform Vitest resolves the repository root from `import.meta.url`, joins paths with `node:path`, normalizes enumerated paths to `/`, flattens the single closed manifest without filtering or optional skips, and reads every entry. Any absent or unreadable entry fails. Applicable deleted-path, bundled-provider-asset, and consumer-owned lifecycle/protocol negatives run against every entry; grouped positive assertions preserve unrelated hook/MCP/SDD integrations and explicit external-provider references. It never invokes generators, edits source/fixture scan inputs, rewrites fixtures, or updates snapshots.
  **Verification**:
  - Run: `pnpm test -- src/harness/provider-boundary.test.ts`
  - Expected: The new test is recorded red before cleanup and green after updates; every closed-manifest entry exists, is readable, and receives its negative checks, while positive preservation assertions pass and T004/T006/T007-owned source/fixture inputs remain unmodified by T012.

- [x] 4.2 **T013** Run focused cross-harness absence, preservation, governance, CLI, hybrid-loader, task-validator, provider-boundary, provider-config, routing, and TUI regression suites — `src/harness/registry.test.ts`, `src/harness/provider-boundary.test.ts`, adapter/writer/generator suites, `src/harness/core/memory-governance.test.ts`, prompt/skill suites, `src/cli/operations/types.test.ts`, operation/install/command suites, `src/cli/codex-config-io.test.ts`, `src/sdd/artifact-governance/artifact-loader.test.ts`, `src/sdd/artifact-governance/tasks-validator.test.ts`, `AGENTS.md`, `docs/agent/index.md`, `docs/agent/routing-cases.json`, and TUI suites
  **[USN-4]** | Priority: P1 | Owner: deep
  **Depends on:** T004, T007, T009, T011, and T012. **Prerequisites:** All implementation batches are complete; generated fixtures are refreshed from their source writers, never edited as source of truth.
  **Spec:** `multi-harness-agent-pack/MH-1 Establish Exclusive Provider Ownership`
  **Spec:** `multi-harness-agent-pack/MH-2 Report Provider-Dependent Capability Truthfully`
  **Spec:** `multi-harness-agent-pack/MH-3 Preserve Neutral Orchestration and SDD Contracts`
  **Spec:** `multi-harness-agent-pack/MH-4 Preserve Handoff and Completion Continuity as Outcomes`
  **Spec:** `multi-harness-agent-pack/Limit Rollout Scope Safely`
  **Spec:** `skill-instructions/SI-1 Remove Bundled Provider Guidance`
  **Spec:** `skill-instructions/SI-2 Prohibit Consumer Copies of Provider Protocol`
  **Spec:** `skill-instructions/SI-3 Preserve Neutral Orchestration and SDD Guidance`
  **Spec:** `skill-instructions/SI-4 Preserve Handoff and Completion Continuity Without Provider Calls`
  **Spec:** `skill-instructions/SI-5 Scope Harness Guidance and Capability Claims`
  **Independent Test:** One focused matrix reruns `src/harness/provider-boundary.test.ts` over the same closed manifest, proving every manifest entry remains present/readable and checked; all three generated outputs omit provider-owned assets and consumer protocol copies, registry scope remains exactly three harnesses, unrelated integrations and independently installed provider config survive, SDD semantics and loader/validator hybrid outcomes match, and caller-supplied evidence states report independently without false success.
  **Verification**:
  - Run: `pnpm test -- src/harness/registry.test.ts src/harness/provider-boundary.test.ts src/harness/core/skills.test.ts src/cli/custom-skills.test.ts src/harness/writers/skill-layout.test.ts src/harness/adapters/opencode.test.ts src/harness/adapters/codex.test.ts src/harness/adapters/claude-code.test.ts src/harness/writers/codex-plugin-package.test.ts src/harness/writers/codex-toml.test.ts src/harness/writers/claude-code-plugin-package.test.ts src/harness/generate-codex-plugin.test.ts src/harness/core/memory-governance.test.ts src/agents/prompt-rendering.test.ts src/agents/index.test.ts src/cli/operations/types.test.ts src/cli/commands.test.ts src/cli/install.test.ts src/cli/codex-install.test.ts src/cli/claude-code-install.test.ts src/cli/codex-config-io.test.ts src/sdd/artifact-governance/artifact-loader.test.ts src/sdd/artifact-governance/tasks-validator.test.ts src/cli/tui/operations.test.ts src/cli/tui/App.test.tsx`
  - Expected: Focused suites and stale-path inspection pass with no provider launcher/hook/client/config/skill/protocol copy, no deleted router paths, no unrelated hook/MCP/SDD/config regression, and matching truthful hybrid/evidence outcomes.

## Phase 5: Repository validation and handoff evidence

- [x] 5.1 **T014** Run repository static and type validation — full changed tree
  **[USN-5]** | Priority: P1 | Owner: deep
  **Depends on:** T013. **Prerequisites:** Focused matrix is green; preserve unrelated working-tree changes when attributing failures.
  **Spec:** `multi-harness-agent-pack/MH-1 Establish Exclusive Provider Ownership`
  **Spec:** `multi-harness-agent-pack/MH-3 Preserve Neutral Orchestration and SDD Contracts`
  **Spec:** `skill-instructions/SI-3 Preserve Neutral Orchestration and SDD Guidance`
  **Independent Test:** Each repository gate is run independently against the completed tree, and any failure is attributable to this change or explicitly separated as a pre-existing dirty-baseline issue.
  **Verification**:
  - Run: `pnpm run check:ci`; `pnpm run typecheck`
  - Expected: Repository static checks and TypeScript validation pass; any baseline failure is recorded separately with evidence.

- [x] 5.2 **T015** Build declarations and generated package artifacts — full project
  **[USN-5]** | Priority: P1 | Owner: deep
  **Depends on:** T014. **Prerequisites:** Source and fixtures are stable; build output is verification evidence only and is not hand-edited.
  **Spec:** `multi-harness-agent-pack/MH-1 Establish Exclusive Provider Ownership`
  **Spec:** `multi-harness-agent-pack/Limit Rollout Scope Safely`
  **Spec:** `skill-instructions/SI-1 Remove Bundled Provider Guidance`
  **Independent Test:** The build completes from source and generated declarations/packages are reproducible without hand-edited generated output or provider-owned assets.
  **Verification**:
  - Run: `pnpm run build`
  - Expected: Build and declaration generation succeed, and generated outputs contain only the three supported harnesses with provider-owned assets absent.

- [x] 5.3 **T016** Run the full test suite, including artifact governance — full project; `src/sdd/artifact-governance/artifact-loader.test.ts`, `src/sdd/artifact-governance/tasks-validator.test.ts`
  **[USN-5]** | Priority: P1 | Owner: deep
  **Depends on:** T015. **Prerequisites:** Build is green; no test may rely on a provider mutation or synthesized fallback.
  **Spec:** `multi-harness-agent-pack/MH-2 Report Provider-Dependent Capability Truthfully`
  **Spec:** `multi-harness-agent-pack/MH-3 Preserve Neutral Orchestration and SDD Contracts`
  **Spec:** `multi-harness-agent-pack/MH-4 Preserve Handoff and Completion Continuity as Outcomes`
  **Spec:** `skill-instructions/SI-3 Preserve Neutral Orchestration and SDD Guidance`
  **Spec:** `skill-instructions/SI-4 Preserve Handoff and Completion Continuity Without Provider Calls`
  **Independent Test:** The full suite runs without provider mutation, consumer fallback, or silent persistence-mode changes, while all preserved SDD and harness contracts remain green.
  **Verification**:
  - Run: `pnpm test`
  - Expected: The complete Vitest suite passes, including preserved unrelated integrations, SDD gates, all three harness outputs, and matching artifact-loader/task-validator complete/partial/unavailable/diverged outcomes.

- [x] 5.4 **T017** Review final diff for scope, secrets, generated output, and ownership violations — repository diff
  **[USN-5]** | Priority: P1 | Owner: deep
  **Depends on:** T016. **Prerequisites:** All checks are complete; inspect rather than rewrite unrelated user-owned changes.
  **Spec:** `multi-harness-agent-pack/MH-1 Establish Exclusive Provider Ownership`
  **Spec:** `multi-harness-agent-pack/MH-5 Keep Stage and Rollback Boundaries Explicit`
  **Spec:** `skill-instructions/SI-1 Remove Bundled Provider Guidance`
  **Spec:** `skill-instructions/SI-2 Prohibit Consumer Copies of Provider Protocol`
  **Independent Test:** Diff review finds only intended provider-boundary changes; no provider receipt/state, secret, generated-source edit, legacy runtime, fourth harness, fallback, migration, or unrelated MCP/hook removal is present.
  **Verification**:
  - Run: `git diff --check`
  - Expected: No whitespace errors; manual scope/secret/generated-output review is recorded with any pre-existing dirty-baseline differences separated.

## Phase 6: Post-apply SDD verification gate (archive excluded)

- [x] 6.1 **T018** Perform Oracle read-only `sdd-verify` review for round 1 — proposal/spec/design/tasks and applied implementation evidence
  **[USN-6]** | Priority: P1 | Owner: oracle
  **Depends on:** T017 and successful apply of implementation tasks. **Prerequisites:** Fresh plan review approval, explicit user implementation approval, and completed T001–T017; Oracle may read but must not write artifacts, mutate provider state, or broaden scope.
  **Spec:** `multi-harness-agent-pack/MH-1 Establish Exclusive Provider Ownership`
  **Spec:** `multi-harness-agent-pack/MH-2 Report Provider-Dependent Capability Truthfully`
  **Spec:** `multi-harness-agent-pack/MH-3 Preserve Neutral Orchestration and SDD Contracts`
  **Spec:** `multi-harness-agent-pack/MH-4 Preserve Handoff and Completion Continuity as Outcomes`
  **Spec:** `multi-harness-agent-pack/MH-5 Keep Stage and Rollback Boundaries Explicit`
  **Spec:** `skill-instructions/SI-1 Remove Bundled Provider Guidance`
  **Spec:** `skill-instructions/SI-2 Prohibit Consumer Copies of Provider Protocol`
  **Spec:** `skill-instructions/SI-3 Preserve Neutral Orchestration and SDD Guidance`
  **Spec:** `skill-instructions/SI-4 Preserve Handoff and Completion Continuity Without Provider Calls`
  **Spec:** `skill-instructions/SI-5 Scope Harness Guidance and Capability Claims`
  **Independent Test:** Oracle returns a strictly read-only pass, fail, or pass-with-warnings verdict mapping all 21 normative requirements and all 40 GWT scenarios separately, with file/scenario remediation anchors; no report or task status is persisted by Oracle, and archive is never advanced automatically.
  **Verification**:
  - Run: `git diff --check`
  - Expected: Oracle inspects already persisted T014–T017 evidence, hashes, diffs, and artifacts, records separate coverage for all 21 requirements and all 40 GWT scenarios, and returns an explicit round-1 verdict without executing tests/build/formatters or writing any artifact.

- [x] 6.2 **T019** Persist each Oracle verify report and update task status — `openspec/changes/externalize-thoth-mem-plugin-integration/verify-report.md`, `openspec/changes/externalize-thoth-mem-plugin-integration/tasks.md`
  **[USN-6]** | Priority: P1 | Owner: quick
  **Depends on:** T018; re-enter only when the orchestrator dispatches it after a later Oracle review round. **Prerequisites:** Oracle has returned a verdict/evidence payload; persist only the report and relevant checkbox/status fields, never implementation or provider state.
  **Spec:** `multi-harness-agent-pack/MH-2 Report Provider-Dependent Capability Truthfully`
  **Spec:** `multi-harness-agent-pack/MH-3 Preserve Neutral Orchestration and SDD Contracts`
  **Spec:** `multi-harness-agent-pack/MH-5 Keep Stage and Rollback Boundaries Explicit`
  **Independent Test:** The canonical report records the current round, verdict, separate evidence rows for all 21 requirements and all 40 GWT scenarios, and file/scenario anchors exactly as returned by Oracle; task status changes are limited to relevant checkboxes and no provider protocol is added.
  **Verification**:
  - Run: `git diff --check`
  - Expected: `verify-report.md` and task-status edits are present, scoped to SDD evidence for all 21 requirements and all 40 GWT scenarios, and preserve Oracle's read-only result without unrelated implementation or provider-state changes.

- [x] 6.3 **T020** Apply only Oracle-anchored remediation after a failed round — files/scenarios named by T018/T021
  **[USN-6]** | Priority: P1 | Owner: deep
  **Depends on:** T019 and either (a) a failed verdict with rounds remaining or (b) an explicit user choice to iterate on pass-with-warnings; skip when Oracle passes cleanly or when round 3 is exhausted. **Prerequisites:** Oracle anchors identify exact files/scenarios, warning iteration has explicit user authorization, and deep must not broaden re-apply scope or write `verify-report.md`.
  **Spec:** `multi-harness-agent-pack/MH-1 Establish Exclusive Provider Ownership`
  **Spec:** `multi-harness-agent-pack/MH-2 Report Provider-Dependent Capability Truthfully`
  **Spec:** `multi-harness-agent-pack/MH-3 Preserve Neutral Orchestration and SDD Contracts`
  **Spec:** `multi-harness-agent-pack/MH-4 Preserve Handoff and Completion Continuity as Outcomes`
  **Spec:** `skill-instructions/SI-2 Prohibit Consumer Copies of Provider Protocol`
  **Spec:** `skill-instructions/SI-3 Preserve Neutral Orchestration and SDD Guidance`
  **Independent Test:** Only the anchored files/scenarios are changed after a failed verdict or explicit warning-iteration choice, their focused tests pass, and no unscoped implementation, provider-state mutation, report rewrite, fallback, or closure semantics are introduced; the current round remains bounded below 3.
  **Verification**:
  - Run: `pnpm test`; `pnpm run typecheck`
  - Expected: Anchored remediation tests and typecheck pass; the diff contains no files outside Oracle's remediation anchors.

- [x] 6.4 **T021** Perform Oracle read-only re-review for rounds 2–3 and enforce bounded user gates — applied change and current `verify-report.md`
  **[USN-6]** | Priority: P1 | Owner: oracle
  **Depends on:** T020 after targeted remediation; re-review only while the current round is below 3. **Prerequisites:** Re-enter T019 after every Oracle result; a round-3 failure, pass-with-warnings, or advancement decision is escalated to the user, and archive remains excluded.
  **Spec:** `multi-harness-agent-pack/MH-1 Establish Exclusive Provider Ownership`
  **Spec:** `multi-harness-agent-pack/MH-2 Report Provider-Dependent Capability Truthfully`
  **Spec:** `multi-harness-agent-pack/MH-3 Preserve Neutral Orchestration and SDD Contracts`
  **Spec:** `multi-harness-agent-pack/MH-4 Preserve Handoff and Completion Continuity as Outcomes`
  **Spec:** `multi-harness-agent-pack/MH-5 Keep Stage and Rollback Boundaries Explicit`
  **Spec:** `skill-instructions/SI-1 Remove Bundled Provider Guidance`
  **Spec:** `skill-instructions/SI-2 Prohibit Consumer Copies of Provider Protocol`
  **Spec:** `skill-instructions/SI-3 Preserve Neutral Orchestration and SDD Guidance`
  **Spec:** `skill-instructions/SI-4 Preserve Handoff and Completion Continuity Without Provider Calls`
  **Spec:** `skill-instructions/SI-5 Scope Harness Guidance and Capability Claims`
  **Independent Test:** Each re-review is strictly read-only, inspects persisted T014–T017 evidence plus the anchored remediation diff, separately rechecks all 21 requirements and all 40 GWT scenarios, increments the round marker to at most 3, returns pass/fail/warnings plus anchors, and never auto-archives; T019 persists the result and any warning, round-bound, or advancement decision remains an explicit user gate.
  **Verification**:
  - Run: `git diff --check`
  - Expected: Oracle performs read-only inspection only, records separate evidence for all 21 requirements and all 40 GWT scenarios, and the bounded loop stops on pass, escalates round-3 failure, or requests user direction on warnings/advancement without Oracle artifact mutation.

### Traceability and execution summary

- **MH coverage:** MH-1 (T003–T007, T012–T021), MH-2 (T001–T004, T007–T021), MH-3 (T001–T002, T004, T006, T008–T021), MH-4 (T001–T002, T006, T013, T016, T018, T020–T021), MH-5 (T008–T009, T012, T017–T021); modified governance/SDD/rollout requirements are named in T001–T021; removed tool-surface/bootstrap requirements are named as absence constraints in T004, T006, T007, T012–T021.
- **SI coverage:** SI-1 (T003–T007, T012–T021), SI-2 (T001, T004–T007, T012–T021), SI-3 (T001–T002, T006, T008–T009, T013–T021), SI-4 (T001–T002, T006, T012, T018, T020–T021), SI-5 (T005–T007, T010–T013, T018–T021); modified neutrality/failure/topic requirements are named in T001–T002, T006, T008–T009, T012–T021; removed callable-surface/lifecycle/retrieval requirements are named as deletion/absence constraints in T004, T006, T007, T012–T021.
- **Role batches:** deep owns foundation, runtime deletion, governance/registry, adapters/writers, evidence-aware CLI, focused regression, repository validation, diff review, and Oracle-anchored remediation T020; designer owns T010–T011 including visual QA; quick owns documentation T012 and verify-report/task-status persistence T019; Oracle owns read-only T018/T021. No provider setup/probe/health/acquisition/migration/fallback task exists.
- **Execution DAG plus bounded loop:** T001/T003 → T002/T004/T005 → T006/T007 → T008/T009 and T010/T011 → T012/T013 → T014 → T015 → T016 → T017 → Oracle T018 → quick T019 → conditional deep T020 → Oracle T021; after each Oracle result, the orchestrator explicitly dispatches quick T019, and only failed rounds below 3 or an explicit user-approved warning iteration re-enter deep T020 then Oracle T021. Pass, pass-with-warnings, round-3 failure, and advancement remain explicit user gates; archive is excluded.
- **Verification evidence contract:** `verify-report.md` must distinguish coverage of all 21 normative requirements from coverage of all 40 GWT scenarios; neither count may be substituted for the other.
