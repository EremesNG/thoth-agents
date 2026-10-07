# Delta for Multi-Harness Agent Pack

## Assumptions

- "Provider evidence" means an observable result supplied by a documented
  thoth-mem or harness integration surface; package presence or consumer
  inference alone is not evidence of a working capability. A
  "provider-independent mode" is a selected persistence mode whose declared
  write target does not use thoth-mem.
- A provider-dependent capability may differ among OpenCode, Codex, and Claude
  Code. This stage establishes a common ownership boundary, not capability
  equality.
- Stage 2 cross-harness capability hardening and parity remains accepted
  downstream work and is not implemented by this stage 1 change.

## ADDED Requirements

### Requirement: MH-1 Establish Exclusive Provider Ownership

For exactly OpenCode, Codex, and Claude Code, thoth-mem MUST exclusively own
provider hooks, harness enrollment and session start, root prompt capture,
provider recovery and compaction behavior, installed memory protocol and skill,
exact MCP vocabulary and surface, runtime, state, and persistence. thoth-agents
MUST act only as a neutral orchestration consumer of those capabilities and
MUST NOT bundle, reimplement, shadow, or mutate provider-owned integration.

#### Scenario: MH-1.1 All three supported harnesses use the same ownership boundary

- GIVEN thoth-agents prepares or evaluates memory integration for OpenCode,
  Codex, or Claude Code
- WHEN the provider boundary is applied
- THEN thoth-mem MUST remain the exclusive owner of the provider capabilities
  named by MH-1
- AND thoth-agents MUST NOT assume those capabilities are equal across the three
  harnesses

#### Scenario: MH-1.2 Generated and installed outputs omit provider-owned assets

- GIVEN thoth-agents generates, packages, or installs output for a supported
  harness
- WHEN the output is inspected
- THEN it MUST omit provider runtime, hooks, enrollment wiring, prompt capture,
  recovery or compaction implementation, memory protocol or skill, exact MCP
  vocabulary or surface definitions, state, persistence, and other
  provider-owned assets
- AND it MUST NOT register or launch a consumer-owned substitute

#### Scenario: MH-1.3 A harness outside the accepted scope is rejected

- GIVEN a target other than OpenCode, Codex, or Claude Code
- WHEN thoth-agents is asked to provide this integration
- THEN it MUST report the harness as unsupported
- AND it MUST NOT generate a best-effort provider integration under another
  harness binding

### Requirement: MH-2 Report Provider-Dependent Capability Truthfully

thoth-agents MUST classify provider-dependent outcomes as supported, degraded,
or unsupported from provider or harness evidence. It MUST NOT infer successful
installation, setup, health, persistence, recovery, or capability from package
presence, consumer state, or an undocumented assumption, and MUST NOT invent a
fallback or recovery procedure when provider capabilities are missing.

#### Scenario: MH-2.1 Provider integration is absent

- GIVEN no usable provider integration is evidenced for the active supported
  harness
- WHEN a provider-dependent operation or status is requested
- THEN thoth-agents MUST report the relevant capability as unsupported or
  requiring provider installation or enablement
- AND it MUST NOT claim success or prescribe a consumer-owned substitute
  lifecycle

#### Scenario: MH-2.2 Provider integration is incomplete or degraded

- GIVEN evidence shows that some but not all requested provider capabilities
  are usable
- WHEN thoth-agents reports status or attempts the requested workflow
- THEN it MUST identify the evidenced capabilities and report the remainder as
  degraded or unsupported
- AND it MUST NOT convert incomplete evidence into a healthy or fully supported
  result

#### Scenario: MH-2.3 Unrelated orchestration remains usable

- GIVEN a provider-dependent capability is unavailable
- WHEN a role, gate, delegation, OpenSpec workflow, or other provider-independent
  orchestration behavior remains valid
- THEN thoth-agents MUST keep that unrelated behavior usable
- AND it MUST NOT silently change the selected persistence mode or fabricate
  memory-backed success

#### Scenario: MH-2.4 Installed provider guidance is authoritative

- GIVEN a compatible provider installation supplies its own operational
  guidance
- WHEN setup, enablement, diagnostics, recovery, or callable behavior must be
  explained
- THEN thoth-agents MUST refer to that installed provider guidance as
  authoritative
- AND it MUST NOT reproduce an exhaustive provider protocol in consumer output

### Requirement: MH-3 Preserve Neutral Orchestration and SDD Contracts

thoth-agents MUST preserve provider-neutral role and permission boundaries,
delegation and review gates, persistence-mode selection, canonical OpenSpec
artifact identities, canonical `sdd/{change}/{artifact}` topic-key identities
for provider-backed modes, and evidence-led verification. A missing provider
capability MUST affect only behavior that depends on it and MUST NOT redefine
these consumer-owned contracts.

#### Scenario: MH-3.1 Orchestration governance survives externalization

- GIVEN agent-pack output is rendered for any supported harness
- WHEN provider integration is externalized
- THEN role responsibilities, read-only and write-capable permissions,
  delegation gates, review gates, and verification obligations MUST remain
  intact
- AND any runtime enforcement gap MUST be reported rather than represented as
  enforced

#### Scenario: MH-3.2 Persistence modes preserve their declared semantics

- GIVEN an SDD workflow selects a persistence mode
- WHEN provider capability is available, degraded, or unsupported
- THEN the workflow MUST preserve the selected mode and its canonical artifact
  identities
- AND a provider-backed write or recovery MUST be reported unsuccessful when
  the necessary provider evidence is absent
- AND provider-independent modes MUST continue where their own prerequisites
  are satisfied

#### Scenario: MH-3.3 Canonical SDD identities remain stable

- GIVEN an SDD artifact is governed by thoth-agents
- WHEN it is represented in OpenSpec or through a provider-backed mode
- THEN its canonical OpenSpec name and applicable
  `sdd/{change}/{artifact}` identity MUST remain stable
- AND consumer guidance MUST NOT prescribe the provider's operational steps for
  storing or recovering that identity

### Requirement: MH-4 Preserve Handoff and Completion Continuity as Outcomes

thoth-agents MUST require the context needed by an authorized delegate or later
continuation to remain recoverable without prescribing provider calls. When
provider-backed continuity is available, completion continuity MUST be
delegated to the provider as a summary or checkpoint outcome and MUST NOT be
described as permanent closure, termination, end-session behavior, or
finalization.

#### Scenario: MH-4.1 Delegated handoff preserves required context

- GIVEN a root coordinator delegates work whose correct execution depends on
  prior decisions, scope, permissions, or artifacts
- WHEN the handoff is prepared
- THEN the delegate MUST receive or recover the context necessary for its
  authorized task
- AND thoth-agents MUST express this as a continuity outcome without dictating
  the provider's callable sequence

#### Scenario: MH-4.2 Completion preserves future continuity

- GIVEN provider-backed work reaches a completion boundary
- WHEN continuity is recorded
- THEN thoth-agents guidance MUST request a provider-delegated summary or
  checkpoint outcome
- AND it MUST NOT introduce permanent closure, terminal, end-session, or
  finalization semantics

#### Scenario: MH-4.3 Continuity capability is unavailable

- GIVEN the active harness lacks evidenced provider-backed continuity
- WHEN a handoff or completion boundary requires that capability
- THEN thoth-agents MUST report the continuity outcome as degraded or
  unsupported
- AND it MUST NOT fabricate a saved handoff or invent a consumer recovery path

### Requirement: MH-5 Keep Stage and Rollback Boundaries Explicit

thoth-agents MUST treat this change as stage 1 of the accepted externalization
program and MUST keep stage 2 capability hardening and parity visible as
downstream work. A thoth-agents rollback MUST NOT mutate provider runtime,
state, persistence, enrollment, or provider-owned assets.

#### Scenario: MH-5.1 Stage 1 does not claim parity

- GIVEN the exclusive provider boundary is implemented for all three supported
  harnesses
- WHEN the stage 1 result is reported
- THEN stage 2 capability hardening and parity MUST remain documented as an
  accepted downstream goal
- AND stage 1 MUST NOT claim capability equality among harnesses

#### Scenario: MH-5.2 Consumer rollback leaves provider ownership intact

- GIVEN the thoth-agents change or release is rolled back
- WHEN rollback guidance is applied
- THEN it MUST be limited to thoth-agents-owned artifacts and release behavior
- AND it MUST NOT restore an internal provider, manipulate provider-owned state,
  or prescribe provider cleanup outside provider guidance

## MODIFIED Requirements

### Requirement: Enforce thoth-mem Governance Across Harnesses

The system MUST preserve thoth-agents-owned authorization, role, persistence
mode, artifact identity, handoff outcome, and truthfulness rules across
OpenCode, Codex, and Claude Code. It MUST leave provider lifecycle and protocol
governance to the independently installed provider.

#### Scenario: Consumer and provider governance remain separated

- GIVEN shared governance is rendered for a supported harness
- WHEN memory-backed behavior is described
- THEN thoth-agents MUST state only its neutral authorization, orchestration,
  artifact, and reporting obligations
- AND provider-owned lifecycle, protocol, runtime, and persistence rules MUST
  come from installed provider guidance

### Requirement: Preserve SDD Skills Portability

The system MUST preserve full SDD semantics across OpenCode, Codex, and Claude
Code without assuming provider capability parity or embedding provider
operations in shared SDD guidance.

#### Scenario: SDD remains portable with truthful provider dependencies

- GIVEN an SDD phase is rendered for a supported harness
- WHEN the selected persistence mode depends on the provider
- THEN shared phase ordering, artifacts, gates, and verification MUST remain
  portable
- AND missing provider capability MUST be reported as degraded or unsupported
  without changing the phase contract or claiming success

### Requirement: Limit Rollout Scope Safely

The system MUST limit stage 1 integration scope to OpenCode, Codex, and Claude
Code and MUST report per-harness capability from evidence rather than assuming
parity.

#### Scenario: Supported harness scope and capability are distinct

- GIVEN all three harnesses are within the accepted stage 1 scope
- WHEN their provider integrations are evaluated
- THEN each harness MUST use the same ownership boundary
- AND each harness MUST retain its independently evidenced capability state

## REMOVED Requirements

### Requirement: Render Canonical thoth-mem Tool Surface Across Harness Surfaces

The system MUST remove this consumer requirement because provider-installed
guidance exclusively owns the exact callable surface and vocabulary.

#### Scenario: Legacy consumer tool-surface requirement is absent

- GIVEN the multi-harness contract is reconciled with this delta
- WHEN memory guidance is rendered for a supported harness
- THEN the former consumer-owned exact tool-surface requirement MUST be absent
- AND installed provider guidance MUST remain authoritative for callable
  vocabulary

### Requirement: Bootstrap Root thoth-mem Sessions Before Other Memory Operations

The system MUST remove this consumer requirement because provider enrollment,
session start, prompt capture, and provider recovery sequencing are
provider-owned behavior, not a consumer protocol.

#### Scenario: Legacy consumer bootstrap requirement is absent

- GIVEN the multi-harness contract is reconciled with this delta
- WHEN provider-backed session behavior is described
- THEN the former consumer bootstrap sequence MUST be absent
- AND thoth-agents MUST state only its neutral continuity and truthfulness
  outcomes

## handoffHints

- Design must preserve MH-1 through MH-5, especially the exclusive provider
  boundary, exact three-harness scope, and absence of consumer fallback.
- Design must preserve canonical OpenSpec and SDD topic-key identities without
  prescribing provider operations.
- Design must treat summary/checkpoint as continuity outcomes and must not add
  closure or finalization semantics.
- Design, tasks, and prior plan-review evidence are stale until reconciled with
  this delta.
