# Design: Externalize thoth-mem Plugin Integration

## Technical Approach

Remove every thoth-mem provider implementation and provider-protocol copy owned
by thoth-agents, then narrow the remaining memory-related code to neutral
orchestration outcomes. The independently installed thoth-mem plugin is the sole
owner of hooks, enrollment and session lifecycle, root-prompt capture,
compaction and recovery, its installed skill and protocol, exact MCP surface,
runtime, state, and persistence.

This design does not add a thoth-agents provider manager, setup command runner,
health probe, compatibility policy, acquisition workflow, or fallback. Those
would reproduce provider behavior or guess contracts that the proposal leaves
to provider-owned guidance and later discovery. thoth-agents only:

1. packages its own roles, SDD skills, and harness artifacts;
2. describes role authorization, persistence modes, artifact identities,
   gates, handoff outcomes, and evidence requirements in provider-neutral terms;
3. classifies a requested provider-dependent outcome as supported, degraded, or
   unsupported only from evidence explicitly supplied by the caller after a
   documented provider or harness surface produced it; and
4. keeps unrelated orchestration usable when provider-dependent behavior is not.

OpenCode, Codex, and Claude Code retain one shared semantic contract, but each
harness retains its independently evidenced capability state. Stage 1 removes
split ownership; it does not claim stage 2 capability parity.

### Upstream Handoff Constraints

- Delete `src/skills/thoth-mem-agents`; no renamed or generated consumer copy is
  permitted.
- Preserve canonical OpenSpec filenames, persistence modes, and
  `sdd/{change}/{artifact}` identities without specifying provider calls.
- A handoff must preserve accepted scope, decisions, permissions, and artifact
  context as an outcome. Provider-installed guidance owns the mechanism.
- Completion continuity is a resumable summary/checkpoint outcome. It never
  closes or finalizes a session.
- Missing provider evidence never becomes success and never triggers a legacy,
  internal, or consumer-authored recovery path.
- `tasks.md` is reconciled with this corrected design. The prior plan-review
  result remains stale: a fresh Oracle `[OKAY]` and separate explicit user
  implementation approval are both still pending, so no implementation is
  authorized.

## Architecture Decisions

### Decision: Delete provider implementation instead of wrapping it

**Choice**: Remove the OpenCode thoth-mem hook and protocol injection, local
client, built-in MCP launcher/registration, provider command configuration, and
generated Codex/Claude provider MCP entries. Remove only provider-owned assets;
retain unrelated hooks, MCPs, and harness writers.

**Alternatives considered**: Keep dormant modules; wrap the provider executable;
introduce a compatibility/setup service; retain OpenCode as an internal fallback.

**Rationale**: Any retained launcher, lifecycle hook, client, or setup wrapper
leaves thoth-agents as a second provider owner. Direct deletion implements MH-1,
MH-2, and SI-2 and prevents accidental fallback.

### Decision: Remove the bundled memory skill from the canonical registry

**Choice**: Delete `src/skills/thoth-mem-agents/SKILL.md`, remove its entry from
`BUNDLED_SKILL_REGISTRY`, and update registry, custom-skill, writer, manifest,
and installation tests so it is absent from OpenCode, Codex, and Claude Code
outputs. Existing managed OpenCode copies are removed only through the current
manifest-scoped obsolete-skill cleanup; no provider-installed skill location is
touched.

**Alternatives considered**: Keep the skill as a shim; rename it; package a
pointer-only skill; exclude it from one harness but retain it in another.

**Rationale**: A shim or pointer remains a consumer-owned memory skill and can
drift from the provider. Registry-level removal gives every harness the same
source-of-truth behavior and satisfies SI-1.

### Decision: Convert memory governance from protocol vocabulary to outcomes

**Choice**: Refactor `src/harness/core/memory-governance.ts` so it no longer
models provider tool names, actions, kinds, modes, filters, or ordered recovery
calls. Retain only consumer-owned facts:

- semantic role and permission boundaries;
- parent-scoped authorization for delegated provider use;
- protected `sdd/*` identity discipline;
- required handoff and completion-continuity outcomes;
- no false persistence/recovery success; and
- evidence-based capability reporting.

`renderMemoryGovernanceInstructions` remains the shared renderer but emits
provider-neutral prose and directs operational behavior to installed provider
guidance. `memoryGovernanceDiagnostics` reports enforcement and provider-evidence
gaps without presenting instruction text as runtime enforcement.

**Alternatives considered**: Move the current exhaustive protocol into another
shared file; keep exact types but hide them from prompts; delete all governance.

**Rationale**: Moving or hiding the vocabulary preserves duplicate ownership;
deleting all governance would lose MH-3/SI-3 role, gate, artifact, and
truthfulness rules. The outcome contract keeps the consumer boundary precise.

### Decision: Use a small evidence report, not provider discovery

**Choice**: Add a provider-neutral report shape to the harness/CLI contract:

```ts
type ProviderCapabilityState = 'supported' | 'degraded' | 'unsupported';

interface ProviderCapabilityEvidence {
  state: ProviderCapabilityState;
  source: 'provider' | 'harness' | 'none';
  basis: string[];
}

interface ProviderEvidenceInput {
  providerEvidence?: ProviderCapabilityEvidence;
}
```

The classifier is pure. A caller may inject evidence that a documented provider
or harness surface already produced; thoth-agents never acquires that evidence
ambiently. Omitted `providerEvidence` defaults to `unsupported` for the requested
provider-dependent outcome. Partial caller-supplied evidence maps to `degraded`;
complete caller-supplied evidence maps to `supported`. The seam performs no
discovery, process launch, filesystem/package inference, setup, health check,
acquisition, provider management, or state mutation. The report is shown
separately from thoth-agents installation state and is never persisted.

**Alternatives considered**: Probe an executable; inspect provider files;
assume a generated MCP entry proves support; reuse thoth-agents managed state.

**Rationale**: Presence is not capability evidence, and persisting provider
observations would create stale consumer-owned state. This realizes MH-2 and
SI-5 while leaving the provider's authoritative evidence transport open for
later provider contract discovery.

### Decision: Keep persistence modes and SDD identities independent of protocol

**Choice**: Preserve `thoth-mem`, `openspec`, `hybrid`, and `none` mode
semantics in `src/skills/_shared/persistence-contract.md` and the SDD skills.
Preserve canonical OpenSpec paths and `sdd/{change}/{artifact}` identities.
For a provider-backed mode, instructions require the installed provider
guidance and evidence of the requested save/recovery outcome; they do not name
the provider's operation sequence. An unavailable provider blocks only the
provider-dependent leg. There is no silent mode switch.

`src/sdd/artifact-governance/artifact-loader.ts` and
`src/sdd/artifact-governance/tasks-validator.ts` must remove the current
`recoverable`, `artifact-loader.hybrid-fallback`, repairable-gap, and consumer
repair semantics. Both consume one comparison contract and canonical finding
vocabulary:

| Outcome | Meaning | Snapshot use | Finding |
| --- | --- | --- | --- |
| `complete` | every source required by the declared mode is present and hybrid sources match | normal | none |
| `partial` | one hybrid leg is present and one is absent | available leg may be inspected, but hybrid remains incomplete | `persistence.hybrid-partial` |
| `unavailable` | no source required by the declared mode is available | none | `persistence.source-unavailable` |
| `diverged` | both hybrid legs exist but contents differ | no automatic authoritative choice or completeness claim | `persistence.hybrid-diverged` |

For hybrid mode, comparison outcome and provider capability remain orthogonal:

| Available hybrid legs | Outcome | `providerState` | `inspectableSource` |
| --- | --- | --- | --- |
| matching OpenSpec and provider legs | `complete` | `supported` | OpenSpec (content is identical) |
| OpenSpec leg only | `partial` | `unsupported` | OpenSpec |
| provider leg only | `partial` | `supported` | provider |
| neither leg | `unavailable` | `unsupported` | `null` |
| differing OpenSpec and provider legs | `diverged` | `supported` | `null` |

For `partial` with a valid OpenSpec snapshot and missing provider snapshot, the
loader may expose the OpenSpec snapshot only as the valid OpenSpec leg while the
declared mode remains `hybrid` and `providerState` is `unsupported`. The result
must not become OpenSpec mode, a fallback, a completed hybrid result, or a repair
instruction. The reverse case is also `partial`: the provider leg may be
available, but the missing OpenSpec leg keeps hybrid incomplete. `diverged`
never selects a source for repair; it reports both source references and leaves
resolution outside consumer protocol. Loader and validator tests must assert
the same outcome, `inspectableSource`, `providerState`, `missingSources`, and
finding codes.

**Alternatives considered**: Remove provider-backed modes; embed provider calls
in every SDD skill; silently fall back to OpenSpec.

**Rationale**: Modes and artifact identities are thoth-agents-owned SDD
contracts, while execution mechanics belong to thoth-mem. This separates SI-3
from the removed legacy protocol requirements and preserves truthful OpenSpec
outcomes without redefining hybrid as OpenSpec-only.

### Decision: Preserve read-only post-apply verification ownership

**Choice**: After apply, Oracle performs only independent read-only verification
and returns the verdict plus file/scenario remediation anchors. A quick
write-capable persistence helper writes `verify-report.md` and updates the
relevant task status. Deep is dispatched only for remediation bounded to those
anchors, followed by another Oracle review round. User decisions for warnings,
round-bound exhaustion, and advancement remain external gates. Archive is not
part of this design correction or implementation plan.

**Alternatives considered**: Let Oracle persist the report; let deep rewrite the
report or perform unscoped re-application; auto-archive on a passing verdict.

**Rationale**: This preserves the constitution's read-only Oracle boundary and
the bounded verify loop while preventing verification from expanding
implementation scope or bypassing user gates.

### Decision: Make continuity resumable and outcome-based

**Choice**: Rewrite root and subagent prompts, handoff helpers, and SDD skills to
state the context that must remain available. When provider-backed continuity is
evidenced, guidance requests a provider-delegated summary/checkpoint outcome.
Remove consumer-authored start, prompt-capture, ordered recovery, compaction,
end-of-session, and finalization instructions.

**Alternatives considered**: Preserve the current lifecycle sequence; replace
it with a shorter consumer sequence; remove continuity obligations entirely.

**Rationale**: The first two alternatives retain provider ownership in the
consumer; the third loses MH-4/SI-4. Outcome wording preserves resumability
without dictating provider internals.

### Decision: Generated packages contain no provider asset

**Choice**: Codex and Claude Code adapters continue to package thoth-agents
agents, SDD skills, unrelated MCPs/hooks, manifests, and harness bindings, but
omit thoth-mem MCP configuration, provider hooks, provider skill content, and
manual lifecycle prose. OpenCode runtime composition omits the built-in provider
hook and MCP. Adapter diagnostics state that provider-dependent capability is
external and report only evidenced supported/degraded/unsupported state.

**Alternatives considered**: Keep launcher snippets as convenience; emit
provider configuration but call it external; make only OpenCode retain fallback.

**Rationale**: A generated launcher or hook is still bundled integration.
Uniform omission implements MH-1 across exactly three harnesses without
assuming equal runtime capabilities.

### Decision: Separate thoth-agents status from provider capability status

**Choice**: Extend existing `HarnessStatusReport` output with an optional
provider-capability report rather than folding provider state into
`ManagedState`. `getOpenCodeStatus`, `getCodexStatus`, and
`getClaudeCodeStatus` continue to classify thoth-agents-owned artifacts.
`formatHarnessStatusReport` and TUI status views render provider capability as a
separate evidence section. Install/update/sync never acquire, configure, repair,
or clean provider state.

**Alternatives considered**: Mark thoth-agents missing when the provider is
missing; store provider status in managed-model state; add provider setup to
install/sync.

**Rationale**: Consumer installation and provider capability are different
facts. Separating them prevents false health/success and preserves unrelated
orchestration under MH-2.3.

## Data Flow

### Harness generation and installation

1. `resolveHarness` accepts only `opencode`, `codex`, or `claude`.
2. The selected adapter renders thoth-agents-owned roles, SDD skills, manifests,
   and unrelated integrations.
3. The canonical skill registry excludes `thoth-mem-agents`; skill layout
   writers therefore cannot emit it.
4. Adapter/writer output contains no thoth-mem launcher, hook, runtime, or exact
   protocol copy.
5. Install/update/sync writes only thoth-agents-managed artifacts. Existing
   independent provider configuration and state are not inspected or mutated.

### Provider-dependent orchestration

1. A workflow selects its persistence mode and required outcome.
2. The caller explicitly supplies any evidence already produced through a
   documented provider or harness integration surface; absent evidence defaults
   to unsupported.
3. Supported evidence permits the workflow to rely on installed provider
   guidance; partial evidence reports degradation; absent evidence reports the
   requested provider-dependent capability as unsupported.
4. The agent follows installed provider guidance for the mechanism.
5. thoth-agents records success only when outcome evidence exists. It never
   fabricates persistence/recovery or silently selects another mode.

For hybrid artifact reads, an available OpenSpec artifact remains usable as the
OpenSpec leg of the declared hybrid result. A missing provider leg makes the
hybrid result partial and degraded/unsupported; it does not convert the mode to
OpenSpec, imply provider success, or authorize consumer repair.

### Handoff and completion

1. The coordinator identifies scope, decisions, permissions, artifacts, and
   other context required by the delegate or later continuation.
2. If provider-backed continuity is evidenced, the provider supplies the
   handoff or summary/checkpoint mechanism under its installed guidance.
3. The delegate receives or recovers only authorized context.
4. If continuity is degraded or unsupported, thoth-agents reports that state;
   unrelated work may continue only when it does not depend on missing context.
5. Completion remains resumable and never triggers permanent closure.

### Status and diagnostics

1. Existing CLI status functions compute thoth-agents `ManagedState` from
   consumer-owned files and manifests.
2. A pure classifier maps documented provider/harness evidence to supported,
   degraded, or unsupported.
3. CLI and TUI render both dimensions without substituting one for the other.
4. Missing evidence produces a provider-capability diagnostic and no setup,
   health, acquisition, recovery, or fallback instruction.

## File Changes

### Deleted

- `src/skills/thoth-mem-agents/SKILL.md` — bundled provider protocol skill.
- `src/hooks/thoth-mem/index.ts` — OpenCode enrollment, prompt capture,
  compaction/recovery, and lifecycle hook.
- `src/hooks/thoth-mem/protocol.ts` — injected exact provider protocol.
- `src/hooks/thoth-mem/index.test.ts` — tests for deleted consumer lifecycle.
- `src/mcp/thoth.ts` — built-in provider MCP launcher.
- `src/thoth/client.ts`, `src/thoth/client.test.ts`, `src/thoth/index.ts` — local
  provider client/runtime surface.

### Neutral refactor

- `src/harness/core/memory-governance.ts` and
  `src/harness/core/memory-governance.test.ts` — replace exact provider
  vocabulary and lifecycle types with outcome, authorization, topic-key,
  evidence, and truthfulness contracts.
- `src/agents/prompt-sections.ts`, `src/agents/orchestrator.ts`,
  `src/agents/index.test.ts`, and `src/agents/prompt-rendering.test.ts` — remove
  bundled-skill loading, manual provider lifecycle/prompt-capture/recovery
  sequences, and closure wording; retain role, handoff-context, SDD, and no-false
  success outcomes.
- `src/skills/_shared/thoth-mem-convention.md` — become a provider-boundary and
  canonical-identity convention, not a provider tool manual.
- `src/skills/_shared/persistence-contract.md` — retain mode/read-write outcome
  semantics and artifact ownership while delegating provider mechanics to
  installed guidance.
- `src/sdd/artifact-governance/artifact-loader.ts`,
  `src/sdd/artifact-governance/artifact-loader.test.ts`,
  `src/sdd/artifact-governance/tasks-validator.ts`, and
  `src/sdd/artifact-governance/tasks-validator.test.ts` — replace fallback,
  repair, and `recoverable` branches with the shared complete/partial/
  unavailable/diverged contract and canonical persistence finding codes.
- `src/skills/{requirements-interview,executing-plans,plan-reviewer,sdd-init,
  sdd-propose,sdd-spec,sdd-clarify,sdd-design,sdd-tasks,sdd-apply,sdd-verify,
  sdd-archive}/SKILL.md` — remove exact provider calls, ordered
  recovery recipes, and terminal/finalization guidance; retain OpenSpec paths,
  SDD keys, gates, handoff hints, evidence, and role ownership.
- `src/harness/types.ts` — add the provider-neutral three-state evidence report
  without adding a fourth harness or serializing provider state.
- `src/harness/adapters/opencode.ts`, `src/harness/adapters/codex.ts`,
  `src/harness/adapters/claude-code.ts` and their colocated tests — render
  neutral guidance and per-harness evidence diagnostics; remove static claims
  that thoth-agents bundles or enforces the provider.
- `src/cli/operations/types.ts`, `src/cli/operations/opencode.ts`,
  `src/cli/operations/codex.ts`, `src/cli/operations/claude-code.ts` and their
  colocated tests — expose provider capability separately from thoth-agents
  managed state; perform no provider mutation or fallback.
- `src/cli/operations/types.test.ts` — pin caller-supplied evidence, absent-
  evidence defaulting, ephemeral reports, and consumer/provider state
  separation.
- `src/cli/commands.ts`, `src/cli/commands.test.ts`, `src/cli/install.ts`, and
  `src/cli/install.test.ts` — render truthful boundary/status/install messaging
  and remove bundled-memory success claims.
- `src/cli/tui/operations.ts`, `src/cli/tui/operations.test.ts`,
  `src/cli/tui/components/StatusView.tsx`, `src/cli/tui/App.test.tsx`, and the
  existing snapshot — show separate evidence state. TUI implementation and
  visual QA are designer-owned during apply.
- `src/config/constants.ts`, `src/config/schema.ts`, `src/config/index.ts`,
  `src/config/loader.test.ts`, and `thoth-agents.schema.json` — remove the
  consumer-owned provider command/runtime configuration while retaining
  persistence-mode configuration and unrelated MCP settings.
- `src/index.ts`, `src/hooks/index.ts`, `src/mcp/index.ts`,
  `src/mcp/index.test.ts`, and `src/plugin-node-runtime.test.ts` — remove only
  provider hook/client/MCP composition and verify unrelated runtime integrations.

### Registry, packaging, and fixtures

- `src/harness/core/skills.ts`, `src/harness/core/skills.test.ts`,
  `src/cli/custom-skills.ts`, and `src/cli/custom-skills.test.ts` — remove the
  skill registry entry and assert source/registry parity without it.
- `src/harness/registry.test.ts` — preserve exactly OpenCode, Codex, and Claude
  Code resolution and explicit rejection of unsupported harnesses.
- `src/harness/provider-boundary.test.ts` — add a read-only, cross-platform
  Vitest boundary regression over repository-relative governance, routing,
  registry, writer, fixture, and manifest surfaces. It rejects deleted
  provider-owned paths/assets and consumer lifecycle/protocol copies while
  preserving unrelated integrations and references to the external provider.
- `src/harness/writers/skill-layout.test.ts` — replace legacy provider-skill and
  protocol-anchor expectations with absence checks plus neutral SDD convention
  checks.
- `src/harness/writers/codex-plugin-package.test.ts`,
  `src/harness/writers/codex-toml.test.ts`, and generated package tests — assert
  provider entries are absent while unrelated integrations remain.
- `src/harness/__fixtures__/codex/mcp.toml`,
  `src/harness/__fixtures__/codex/skill-manifest.json`, and
  `src/harness/__fixtures__/codex/agent-deep.toml` — refresh exact expected
  provider-free generated output.
- `src/cli/codex-install.ts`, `src/cli/codex-install.test.ts`,
  `src/cli/claude-code-install.ts`, and
  `src/cli/claude-code-install.test.ts` — install only consumer-owned package
  artifacts and emit external-provider diagnostics without setup instructions.
- `src/cli/codex-config-io.test.ts` — preserve independently installed provider
  configuration outside thoth-agents-managed blocks while removing only
  consumer-owned generated entries.

### Documentation

- `package.json` description, `README.md`, `docs/installation.md`,
  `docs/skills-and-mcps.md`, `docs/sdd-pipeline.md`,
  `docs/quick-reference.md`, `docs/codex-install.md`,
  `docs/claude-code-plugin-packaging.md`, `docs/agent/index.md`,
  `docs/agent/routing-cases.json`, `docs/agent/memory-governance.md`, and
  `docs/agent/runtime-integrations.md` — remove bundled provider claims, deleted
  internal paths, exact lifecycle vocabulary, and consumer lifecycle ownership;
  document separate provider installation, caller-supplied evidence states, no
  fallback, resumable completion, rollback limits, and stage 2 follow-up. Router
  cases must point memory-boundary work to the retained neutral governance path,
  never deleted `src/thoth/`, `src/hooks/thoth-mem/`, or `src/mcp/thoth.ts` paths.
- Root `AGENTS.md` — remove the stale `src/thoth/` ownership route and consumer
  lifecycle ownership. Require a stale-path scan across `src/thoth/`,
  `src/hooks/thoth-mem/`, `src/mcp/thoth.ts`, and
  `src/skills/thoth-mem-agents`, including generated artifacts and fixtures.

### Preserved behavior

- `src/harness/core/sdd.ts` phase order, prerequisites, role routing, plan-review
  gate, bounded verify loop, and `handoffHints` contract remain unchanged.
- `src/harness/registry.ts` keeps OpenCode as the default and keeps exactly the
  OpenCode, Codex, and Claude Code adapters.
- `src/skills/_shared/openspec-convention.md` and canonical OpenSpec paths remain
  authoritative; only provider-specific operational wording is neutralized
  where encountered.
- Existing role names, read-only/write-capable boundaries, delegation behavior,
  verification requirements, and unrelated MCP/hook integrations remain.
- `ArtifactStoreModeSchema` and SDD topic-key identities remain; only the legacy
  consumer provider command/runtime schema is removed.

No generated output is edited as a source of truth. Fixtures are updated only
after their owning adapter/writer changes.

## Interfaces / Contracts

### Provider-neutral capability evidence

The caller supplies provider evidence explicitly; thoth-agents does not discover
it. Absent caller input defaults to unsupported.

`ProviderCapabilityEvidence` is deliberately small. A caller supplies it
explicitly through `ProviderEvidenceInput` only after a documented provider or
harness surface has produced the observation. There is no default discovery
implementation or ambient lookup. `basis` contains bounded, human-readable
evidence references; it never contains provider state, receipts, secrets, or a
copied protocol. The classifier rules are:

| Evidence | Reported state | Consumer behavior |
| --- | --- | --- |
| complete evidence for the requested outcome | `supported` | rely on installed provider guidance |
| only part of the requested outcome is evidenced | `degraded` | identify the missing part; no false success |
| no usable evidence | `unsupported` | report provider dependency; no fallback |

The report is ephemeral and must not be stored in thoth-agents managed-model or
configuration state. An omitted input is equivalent to no usable evidence.

### Hybrid artifact-loading contract

The loader and task validator share this metadata shape:

```ts
type PersistenceComparisonOutcome =
  | 'complete'
  | 'partial'
  | 'unavailable'
  | 'diverged';

interface ArtifactComparisonMetadata {
  outcome: PersistenceComparisonOutcome;
  inspectableSource: ArtifactSnapshotSource | null;
  providerState: 'supported' | 'degraded' | 'unsupported' | 'not-applicable';
  missingSources: readonly ArtifactSnapshotSource[];
  metadata: Readonly<{ comparedSources: readonly ArtifactSnapshotSource[] }>;
}
```

`ArtifactComparisonMetadata.recoverable` is removed. `partial` with only an
OpenSpec leg uses `inspectableSource: 'openspec'` solely for inspecting that snapshot,
`providerState: 'unsupported'`, and a missing provider source. `unavailable`
uses a null source and unsupported provider state. A provider-only partial uses
the provider snapshot solely for inspection and reports supported provider
capability while the hybrid artifact remains incomplete. `diverged` uses a null
source to prevent an automatic authoritative choice and reports supported
provider capability because both legs are available; divergence describes the
artifact comparison, not provider availability. The task validator switches on
`outcome` and emits the same canonical persistence finding codes as the loader;
it never emits repair advice or treats a partial/diverged result as complete.

`inspectableSource` replaces the authority-bearing `sourceOfTruth` name. It only
identifies which single snapshot the loader may expose for read-only inspection;
it never changes the declared persistence mode or authorizes fallback, repair,
write-back, reconciliation, or a completeness claim. For a matching hybrid pair,
OpenSpec is the deterministic representation because the contents are equal, not
because the provider leg has been demoted.

### Task artifact heading contract

The live task validator accepts level-2 execution headings only in the exact
form `## Phase N: Title`. `sdd-tasks` generation must normalize scope notes,
external gates, verification notes, and other non-phase sections to level 3 or
plain prose so every `##` heading is a numbered phase. Validator tests preserve
`tasks.unrecognized-phase-header` and `tasks.missing-phase-headers` behavior.

### Memory orchestration contract

The refactored shared contract exposes outcomes, not provider operations:

```ts
interface MemoryOrchestrationContract {
  providerOwnership: 'external';
  protectedTopicNamespaces: readonly ['sdd/*'];
  canonicalTopicKey: 'sdd/{change}/{artifact}';
  requiresParentAuthorization: boolean;
  handoffOutcome: 'authorized-context-available';
  completionOutcome: 'resumable-summary-or-checkpoint';
  prohibitsFalseSuccess: true;
  prohibitsConsumerFallback: true;
}
```

Role and permission rendering remains derived from the shared agent-pack
contract. No interface in thoth-agents enumerates provider tools, lifecycle
actions, retrieval modes, filters, relations, response shapes, or setup exits.

### Harness and status contracts

- `HarnessId`, `HARNESS_ADAPTERS`, `SUPPORTED_HARNESSES`, and
  `OPERATION_HARNESSES` remain exactly `opencode`, `codex`, and `claude`.
- Existing `HarnessCapabilities` continues to describe thoth-agents/harness
  enforcement. Provider capability is a separate evidence report and does not
  convert instruction-only governance into runtime support.
- `HarnessStatusReport.state` continues to describe consumer-managed artifacts.
  An optional provider-capability field is rendered separately.
- `ArtifactStoreModeSchema` retains provider-backed modes. Selecting one does
  not prove that provider integration is available.

## Requirement Traceability

| Requirement group | Design decisions and surfaces |
| --- | --- |
| MH-1 exclusive ownership | Delete provider runtime/hook/client/MCP; remove generated assets; provider-free adapters |
| MH-2 truthful capability | Pure evidence classifier; separate status dimension; no probe, mutation, or fallback |
| MH-3 neutral orchestration/SDD | Outcome governance contract; persistence modes; OpenSpec and SDD identities |
| MH-4 handoff/completion continuity | Outcome-based prompts and skills; resumable summary/checkpoint; no closure semantics |
| MH-5 stage/rollback boundary | Breaking migration; provider-safe rollback; stage 2 remains explicit |
| SI-1 bundled skill removal | Registry deletion; custom-skill cleanup; writer/manifest absence tests |
| SI-2 no copied provider protocol | Neutral prompt/governance/skill refactor; exact-vocabulary absence scans |
| SI-3 neutral SDD guidance | Shared persistence contract and canonical identities without provider calls |
| SI-4 continuity without calls | Required-context and continuation outcomes only |
| SI-5 harness scope/capability | Exact registry scope and per-harness evidence reports |
| Modified multi-harness governance/portability/scope | Outcome governance, preserved SDD contract, exact registry scope, explicit capability gaps |
| Modified skill neutrality/failure/topic discipline | Neutral renderers, evidence diagnostics, canonical topic identity without provider mechanics |
| Removed legacy tool/lifecycle/retrieval requirements | Deleted bundled skill/runtime protocol and negative packaging/prompt tests |
| MH-2.3/MH-3.2 hybrid partial behavior | Loader and task validator share complete/partial/unavailable/diverged metadata; valid OpenSpec leg remains inspectable while provider leg is unsupported |
| Task artifact grammar | Exact `## Phase N: Title` validator contract; generation normalizes every non-phase level-2 section |
| Post-apply verification governance | Oracle read-only review of persisted T014–T017 evidence; quick persistence; anchored deep remediation; explicit warning and round-bound user gates |

Verification traceability must cover all 21 normative requirements and all 40
GWT scenarios across the two delta specs; requirement-level coverage alone is
insufficient.

## Testing Strategy

1. **Skill deletion and registry** — update
   `src/harness/core/skills.test.ts`, `src/cli/custom-skills.test.ts`, and
   `src/harness/writers/skill-layout.test.ts` to prove the deleted skill is not
   registered, copied, manifested, or emitted for any harness. Update
   `src/harness/registry.test.ts` to preserve the exact three-harness boundary.
   Preserve source directory/registry parity and all SDD skill packaging.
2. **Runtime deletion** — update `src/mcp/index.test.ts`,
   `src/plugin-node-runtime.test.ts`, and hook composition tests to prove no
   provider launcher/hook/client remains while exa, context7, grep_app, phase
   reminders, and unrelated hooks still work.
3. **Prompt and governance neutrality** — update
   `src/agents/index.test.ts`, `src/agents/prompt-rendering.test.ts`, and
   `src/harness/core/memory-governance.test.ts` to assert role permissions,
   parent authorization, topic keys, handoff outcomes, evidence requirements,
   and no false success. Add absence assertions for manual lifecycle sequences,
   exhaustive provider vocabulary, and closure/finalization guidance.
4. **All three generated harnesses** — update adapter/writer tests and fixtures
   for OpenCode, Codex, and Claude Code. Assert no provider MCP entry, hook,
   memory skill, runtime asset, or protocol copy; assert unrelated assets and
   harness-specific limitations remain.
5. **Capability classification** — unit-test complete, partial, absent,
   contradictory, and stale caller-supplied evidence in
   `src/cli/operations/types.test.ts`. Verify supported/degraded/unsupported
   output, omitted-evidence defaulting to unsupported, no discovery or
   package-presence inference, no persisted provider report, and no fallback
   instruction.
6. **CLI/status** — update operation, command, install, and TUI tests so
   consumer install state and provider capability render separately. Verify an
   unsupported provider does not disable valid provider-independent
   orchestration and never produces a success claim.
7. **SDD contracts** — inspect rendered shared skills for preserved modes,
   OpenSpec paths, topic-key identities, gates, and phase ordering without exact
   provider operation recipes.
8. **Hybrid artifact loading and validation** — update
   `src/sdd/artifact-governance/artifact-loader.test.ts` and
   `src/sdd/artifact-governance/tasks-validator.test.ts` to replace current
   fallback/repair branches with identical complete, partial, unavailable, and
   diverged expectations. The OpenSpec leg remains inspectable when valid, the
   missing provider leg is unsupported, the mode remains hybrid, and no success,
   authoritative divergence choice, or repair is fabricated.
9. **Provider-config preservation** — update
   `src/cli/codex-config-io.test.ts` to prove independently installed provider
   configuration outside thoth-agents-managed blocks survives install/update/
   sync and removal of consumer-generated provider entries.
10. **Executable provider-boundary, routing, and stale-path safety** — add
   `src/harness/provider-boundary.test.ts`, discovered by the existing
   `src/**/*.test.ts` Vitest pattern. Resolve the repository root with
   `fileURLToPath(new URL('../..', import.meta.url))`; access files with
   `node:path` joins and normalize any enumerated relative paths to `/` before
   assertions, never assuming a platform separator. One table-driven manifest
   is the complete scan boundary and explicitly enumerates:

   ```ts
   const PROVIDER_BOUNDARY_TARGETS = {
     documentationAndMetadata: [
       'package.json',
       'README.md',
       'AGENTS.md',
       'docs/installation.md',
       'docs/skills-and-mcps.md',
       'docs/sdd-pipeline.md',
       'docs/quick-reference.md',
       'docs/codex-install.md',
       'docs/claude-code-plugin-packaging.md',
       'docs/agent/index.md',
       'docs/agent/routing-cases.json',
       'docs/agent/architecture.md',
       'docs/agent/cli-installation.md',
       'docs/agent/harness-packaging.md',
       'docs/agent/runtime-integrations.md',
       'docs/agent/memory-governance.md',
       'docs/agent/sdd-and-skills.md',
       'docs/agent/agents-and-delegation.md',
     ],
     lifecycleFixtures: [
       'src/harness/__fixtures__/codex/agent-deep.toml',
       'src/harness/__fixtures__/codex/mcp.toml',
       'src/harness/__fixtures__/codex/skill-manifest.json',
     ],
     consumerSurfaces: [
       'src/harness/registry.ts',
       'src/harness/core/skills.ts',
       'src/harness/core/memory-governance.ts',
       'src/harness/adapters/opencode.ts',
       'src/harness/adapters/codex.ts',
       'src/harness/adapters/claude-code.ts',
       'src/harness/writers/codex-plugin-package.ts',
       'src/harness/writers/codex-toml.ts',
       'src/harness/writers/claude-code-plugin-package.ts',
       'src/hooks/index.ts',
       'src/mcp/index.ts',
     ],
   } as const;
   ```

   The test flattens this manifest without filtering or optional skips and reads
   every target. Any missing or unreadable target fails the suite. It applies
   the applicable deleted-path, bundled-provider-asset, and consumer-owned
   lifecycle/protocol negative assertions to every manifest entry, rather than
   treating an unscanned file as clean. Positive assertions on the relevant
   manifest groups preserve unrelated hook/MCP/SDD integrations and explicit
   external-provider references. Filesystem diagnostics use normalized `/`
   repository-relative paths. The suite is read-only: it uses file reads only
   and never invokes a generator, rewrites a fixture, or updates a snapshot.
11. **Task heading contract** — update task-generation and
   `src/sdd/artifact-governance/tasks-validator.test.ts` so every level-2 task
   heading matches `## Phase N: Title`; normalize non-phase sections below level
   2 before validation.
12. **Scenario traceability** — the persisted verification evidence maps all 21
   requirements and all 40 GWT scenarios to focused tests or inspections.
13. **Focused execution order** — run the changed registry/skill-layout tests,
   prompt/governance tests, adapter/writer tests, runtime tests, and CLI/status
   tests, including `src/cli/operations/types.test.ts`,
   `src/harness/registry.test.ts`, `src/harness/provider-boundary.test.ts`,
   artifact-loader, and tasks-validator tests first. Write-capable apply owners
   then persist T014–T017 evidence from
   `pnpm run check:ci`, `pnpm run typecheck`, `pnpm run build`, and `pnpm test`
   before Oracle review.

### TDD execution notes

- The first red governance/evidence run includes
  `src/harness/core/memory-governance.test.ts`,
  `src/agents/prompt-rendering.test.ts`, `src/agents/index.test.ts`, and
  `src/cli/operations/types.test.ts`; the same set is rerun green after the
  neutral governance and evidence implementation.
- The registry red/green run includes `src/harness/registry.test.ts` alongside
  `src/harness/core/skills.test.ts`, `src/cli/custom-skills.test.ts`, and
  `src/harness/writers/skill-layout.test.ts` so the exact three-harness boundary
  and bundled-skill removal are both evidenced in each state.
- `src/harness/provider-boundary.test.ts` is authored and run red against the
  pre-removal source, routing, documentation, metadata, and committed fixtures,
  then rerun green after their updates. Both runs use the same exhaustive
  manifest; neither run generates or mutates output during verification.

### Post-apply verification ownership

- Oracle performs strictly read-only review of already persisted T014–T017
  evidence and may run only read-only inspection. It must not execute
  write-producing commands such as `pnpm run build` or persist any artifact.
- Quick persists `verify-report.md` and updates task status.
- On `fail`, deep performs only remediation anchored to Oracle findings; it does
  not broaden re-apply scope or persist the review artifact.
- On `pass with warnings`, only an explicit user choice to iterate authorizes
  deep warning-anchored remediation, followed by Oracle read-only re-review and
  quick persistence. This remains within rounds 1–3.
- There is no automatic warning loop, automatic advancement, or archive. Clean
  pass advancement, warning handling, and round-bound exhaustion remain
  external user gates.
- Archive is excluded from this implementation and verification scope.

## Migration / Rollout

- Ship as a breaking stage 1 release. Users who need provider-backed modes must
  install and enable thoth-mem through provider-owned guidance.
- Existing provider runtime, state, persistence, receipts, sessions, and
  provider-installed skills/configuration are never read, migrated, cleaned, or
  deleted by thoth-agents.
- Existing thoth-agents-managed copies of `thoth-mem-agents` may be removed by
  the current managed-skill manifest cleanup because they are consumer assets.
  Cleanup must remain scoped to the thoth-agents manifest and must not target an
  independently installed provider skill.
- Update/sync rewrites thoth-agents-managed Codex/Claude package artifacts
  without provider MCP entries. It preserves unrelated user/provider config
  outside the managed package or managed block; preservation is pinned by
  `src/cli/codex-config-io.test.ts`.
- Legacy thoth-agents `thoth` command/runtime configuration is removed from the
  public schema and has no effect. It is not translated into provider state.
- Supported rollback reverts thoth-agents-owned release artifacts while
  preserving the external-provider boundary. Installing an arbitrary
  pre-boundary release that restores bundled provider behavior is unsupported.
- Stage 2 records capability gaps discovered across OpenCode, Codex, and Claude
  Code; stage 1 does not claim parity beyond shared semantics.

## Compatibility Consequences

- Provider-backed persistence no longer works merely because thoth-agents is
  installed. Provider installation/enablement is an independent prerequisite.
- OpenCode loses its built-in fallback hook/client/MCP path by design.
- Codex and Claude Code generated packages no longer contain provider launchers
  or the consumer memory skill.
- Existing consumers of removed `ThothConfig`, provider launcher exports, or
  bundled-skill registry entries receive a compile-time or packaging break and
  must move to provider-owned integration.
- OpenSpec-only and other provider-independent orchestration remains available
  when its own prerequisites are met.

## Constitution Check

- **Principle 1 — Delegate-first coordination: PASS.** The design preserves the
  root coordinator and role-specialized implementation/review routing.
- **Principle 2 — Read-only role boundaries: PASS.** Apply work remains assigned
  only to write-capable roles. Oracle reviews already persisted T014–T017
  evidence without executing write-producing commands such as build or
  persisting artifacts; quick persists reports/task status, and deep performs
  only anchored remediation.
- **Principle 3 — Governed persistence: PASS.** OpenSpec remains the design
  store, SDD identities remain governed, and no consumer provider-state store is
  introduced.
- **Principle 4 — Multi-harness parity: PASS.** Shared semantics apply once to
  exactly three harnesses; capability differences remain explicit rather than
  being asserted equal.
- **Principle 5 — Evidence-led verification: PASS.** Capability claims require
  evidence and completion is gated by focused absence/preservation tests plus
  repository checks.

No constitution violation was found; design finalization is not blocked.

## Open Questions

- The provider's authoritative evidence surface for each harness remains
  provider-owned and was explicitly deferred by the proposal. Until a
  documented surface supplies evidence to a caller and that caller explicitly
  passes it through the seam, thoth-agents reports the requested
  provider-dependent capability as unsupported; implementation must not invent
  discovery or a probe.
- Exact setup, health, compatibility, acquisition, and marketplace UX remains
  downstream discovery. This stage may link to provider guidance but may not
  copy or simulate those contracts.
- The downstream `tasks.md` is reconciled with this corrected design. A fresh
  Oracle plan-review `[OKAY]` and separate explicit user implementation approval
  are still pending; until both gates succeed, neither the tasks nor this design
  authorize implementation.
