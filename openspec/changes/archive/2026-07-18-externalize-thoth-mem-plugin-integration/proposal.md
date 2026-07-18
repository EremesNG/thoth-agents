# Proposal: Externalize thoth-mem Plugin Integration

## Intent

Make `thoth-mem` an independently installed provider plugin and keep
thoth-agents a neutral orchestration consumer across exactly OpenCode, Codex,
and Claude Code. The provider owns the complete memory integration boundary:
hooks, harness enrollment and session start, root prompt capture,
compaction/recovery behavior, its installed memory skill and protocol, its
exact MCP surface, runtime, state, and persistence.

thoth-agents will stop bundling or restating that provider integration. It will
retain its own delegate-first and SDD responsibilities: roles, permissions,
gates, persistence-mode selection, canonical SDD artifact identities, governed
handoff continuity, and truthful reporting when a requested capability is
supported, degraded, or unsupported.

This remains stage 1 of the accepted staged program. Stage 1 establishes the
exclusive provider boundary and removes conflicting consumer-owned behavior.
Stage 2 remains an accepted downstream goal for cross-harness capability
hardening and parity after the external provider contract is established.

## Scope

### In Scope

- Establish `thoth-mem` as the sole owner and source of memory integration for
  OpenCode, Codex, and Claude Code, including hooks, enrollment/start,
  root-prompt capture, compaction and recovery, installed memory guidance,
  callable memory tools, runtime, state, and persistence.
- Remove bundled provider runtime, hooks, MCP launch/registration assets,
  lifecycle wiring, and other provider-owned integration artifacts from
  thoth-agents and its generated or installed harness outputs.
- Remove the bundled `src/skills/thoth-mem-agents` skill and consumer-authored
  instructions that manually require provider lifecycle operations such as
  session start or root prompt saving.
- Remove exhaustive copies of provider tool names, arguments, modes, filters,
  actions, and protocol details from thoth-agents guidance; provider-installed
  guidance is authoritative for its exact callable surface and behavior.
- Preserve neutral thoth-agents orchestration rules: role and permission
  boundaries, delegation gates, parent-scoped authorization, and no false
  claims of successful persistence or recovery.
- Preserve SDD persistence modes and canonical OpenSpec artifact names and,
  when a mode uses the provider, canonical SDD topic-key identities, without
  duplicating the provider's operational protocol.
- Preserve handoff and context-continuity requirements as outcome-level
  orchestration obligations. Completion continuity is a summary or checkpoint,
  never permanent session closure, and must not introduce terminal, end, or
  finalization semantics.
- Keep install, setup, status, health, capability, CLI, TUI, documentation, and
  generated-harness surfaces in the affected scope so each reflects the
  provider/consumer boundary and reports supported, degraded, or unsupported
  behavior from evidence.
- Keep stage 2 cross-harness capability hardening and parity visible as an
  accepted downstream goal rather than silently dropping it.

### Deferred / Needs Discovery

- The provider's authoritative public installation, compatibility, setup,
  status, and health contracts for each of the three supported harnesses,
  including which provider-owned surface supplies evidence to thoth-agents.
- The precise thoth-agents UX for presenting provider-owned setup outcomes,
  compatibility, diagnostics, and user actions without copying provider
  protocol or claiming ownership of its mutations and state.
- The exact neutral abstraction needed for persistence-mode and handoff
  orchestration when provider functionality is unavailable, while preserving
  explicit degraded or unsupported reporting and avoiding fallback
  instructions.
- Claude Code boundaries among thoth-agents installation, provider marketplace
  acquisition, enablement, trust, and provider-owned harness enrollment.
- The detailed stage 2 capability/parity plan after stage 1 establishes the
  provider boundary.

### Out of Scope

- Adding or supporting harnesses other than OpenCode, Codex, and Claude Code.
- Changes to the thoth-mem repository, package internals, installed skill,
  tool protocol, runtime, database, retrieval behavior, synchronization, or
  persistence design.
- Reimplementing, wrapping, shadowing, or copying provider-owned hooks,
  enrollment/start, prompt capture, compaction/recovery, memory skill/protocol,
  exact tool surface, runtime, state, or persistence in thoth-agents.
- Consumer-side fallback instructions or substitute lifecycle procedures that
  compensate for missing provider integration in a harness.
- A legacy internal runtime fallback, dual-provider mode, or assisted migration
  of provider or legacy memory data, receipts, state, or configuration.
- Permanent session closure, terminal completion, end-session, or finalization
  behavior; continuity at completion is limited to a summary/checkpoint.
- Completing stage 2 cross-harness parity hardening in this stage 1 change.

## Approach

Move to an exclusive provider/consumer contract. thoth-mem supplies and governs
the memory integration it installs in each supported harness. thoth-agents
removes provider-owned assets and procedures, then expresses only the neutral
orchestration outcomes it owns: who may delegate or persist, which SDD mode and
artifact identity applies, what context must survive a handoff, which gates
must pass, and how capability limitations are reported without false success.

The ownership change is intentionally breaking:

- **From:** thoth-agents bundles provider runtime and integration assets and
  prescribes provider lifecycle and tool behavior in its own skills and prompts.
- **To:** thoth-mem exclusively owns its installed integration and protocol;
  thoth-agents retains provider-neutral orchestration and SDD contracts and
  consumes only evidence exposed by supported provider integration.
- **Reason:** a single authoritative provider boundary prevents duplicated or
  conflicting lifecycle, prompt-capture, recovery, tool, and persistence rules.
- **Impact:** installations need a compatible provider integration for
  memory-backed modes. Missing or incomplete integration is reported as
  degraded or unsupported; thoth-agents does not synthesize a replacement
  procedure, claim success, or silently select a fallback.

The full SDD pipeline remains required. Delta specs, clarification, design, and
tasks must realign all affected surfaces to this proposal before execution.
Because this revision changes the accepted ownership boundary, the existing
plan-review approval and its artifact digests are stale and cannot authorize
implementation.

## Affected Areas

- Multi-harness contracts and adapters for OpenCode, Codex, and Claude Code,
  including generated packages, manifests, hooks, MCP configuration, prompts,
  and capability disclosures.
- CLI and TUI installation, setup, status, health, compatibility, diagnostics,
  and reporting surfaces that currently coordinate or describe thoth-mem.
- Internal thoth-mem runtime, hook, MCP, lifecycle, config, packaging, and
  provider-asset modules owned today by thoth-agents.
- Bundled skills, shared conventions, role prompts, requirements interview,
  SDD instructions, handoff guidance, fixtures, and tests that prescribe
  provider lifecycle or reproduce its exact protocol.
- SDD persistence-mode contracts, canonical artifact names/topic keys,
  completion continuity, gate behavior, and truthful failure/degradation rules.
- Documentation, release guidance, compatibility policy, rollback guidance,
  and tests that imply bundled memory availability or provider ownership.
- Delta specs, design, tasks, checklist, and plan-review evidence for this
  change, which require downstream reconciliation under the Full SDD route.
- Main OpenSpec domains for the multi-harness agent pack and skill
  instructions, whose current lifecycle/tool requirements must be reconciled
  without narrowing the accepted three-harness and stage 2 goals.

## Risks

- Removing duplicated instructions can expose real provider or harness gaps;
  masking those gaps with consumer-side procedures would recreate split
  ownership.
- Over-neutralizing guidance could accidentally weaken thoth-agents-owned role,
  permission, gate, SDD artifact, persistence-mode, or handoff requirements.
- Retaining detailed provider vocabulary in prompts, skills, fixtures, or docs
  could leave thoth-agents coupled to a stale provider protocol.
- Install/status UX could conflate thoth-agents state with provider state or
  turn missing evidence into a false success claim.
- Completion language could accidentally imply permanent session closure and
  destroy continuity needed for later work.
- OpenCode, Codex, and Claude Code may expose unequal provider capabilities;
  those differences must remain explicit until stage 2 hardens parity.
- Existing specs, design, tasks, and review evidence describe the superseded
  boundary and must not be executed without full-pipeline realignment and a
  fresh plan review.

## Rollback Plan

Rollback means reverting the thoth-agents change or release through the normal
thoth-agents release process. It does not select a dormant internal provider,
restore consumer-owned lifecycle instructions, or mutate provider-owned hooks,
runtime, state, receipts, sessions, or persistence.

Provider rollback or cleanup remains governed by thoth-mem's own supported
integration. thoth-agents reports any resulting capability state truthfully and
does not invent recovery or fallback steps.

## Success Criteria

- OpenCode, Codex, and Claude Code thoth-agents outputs contain no bundled
  thoth-mem hooks, enrollment/start behavior, prompt capture, compaction or
  recovery implementation, memory skill/protocol, exact tool-surface copy,
  runtime, state, persistence, or provider assets.
- `src/skills/thoth-mem-agents` is no longer bundled, and thoth-agents prompts,
  skills, docs, fixtures, and tests do not manually require provider lifecycle
  start/prompt-save operations or reproduce exhaustive provider vocabulary.
- Role/permission governance, delegation gates, persistence modes, canonical
  SDD artifact names/topic keys, parent-scoped authorization, and handoff
  context requirements remain portable across exactly the three supported
  harnesses.
- Completion continuity is expressed only as summary/checkpoint behavior; no
  permanent closure, terminal/end-session, or finalization semantic is added.
- Provider-dependent outcomes are reported as supported, degraded, or
  unsupported from evidence, and no unavailable save, recovery, setup, health,
  or capability is reported as successful.
- No consumer-side fallback procedure, substitute provider protocol, legacy
  runtime, dual-provider mode, or assisted migration path is shipped.
- Install, setup, status, health, compatibility, CLI, TUI, documentation, and
  generated-harness behavior consistently preserve the exclusive ownership
  boundary without narrowing the accepted scope.
- Full SDD delta specs, clarification, design, tasks, and a fresh plan review
  are completed against this revised proposal before implementation begins.
- Stage 2 cross-harness capability and parity hardening remains documented as an
  accepted downstream goal with this stage 1 boundary as its prerequisite.
