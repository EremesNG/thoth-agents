# Delta for Skill Instructions

## Assumptions

- "Installed provider guidance" is the memory protocol and skill delivered by
  the independently installed thoth-mem provider for the active harness. An
  "evidenced capability" has an observable result supplied by a documented
  provider or harness integration surface; package presence or consumer
  inference alone is insufficient.
- Neutral orchestration guidance may name canonical SDD artifacts and topic-key
  identities, but it does not define how the provider stores, retrieves, or
  manages them.
- Outcome-level handoff guidance states what context must remain available; it
  does not prescribe provider calls, actions, filters, or recovery sequences.

## ADDED Requirements

### Requirement: SI-1 Remove Bundled Provider Guidance

thoth-agents MUST remove and MUST NOT bundle `src/skills/thoth-mem-agents` or an
equivalent consumer-owned copy of the provider's memory skill or protocol.
Generated and installed skill packages for OpenCode, Codex, and Claude Code
MUST omit that bundled skill and MUST treat installed provider guidance as the
authority for provider behavior.

#### Scenario: SI-1.1 The bundled provider skill is removed

- GIVEN thoth-agents source and package registries are inspected
- WHEN skills are built, generated, or installed
- THEN `src/skills/thoth-mem-agents` and equivalent bundled provider guidance
  MUST be absent
- AND no supported harness package MAY recreate it under another consumer-owned
  path or name

#### Scenario: SI-1.2 Installed provider guidance supplies memory protocol

- GIVEN a provider is installed for OpenCode, Codex, or Claude Code
- WHEN an agent needs provider operational guidance
- THEN the agent MUST rely on the installed provider skill or protocol
- AND thoth-agents guidance MUST remain limited to neutral orchestration and SDD
  obligations

#### Scenario: SI-1.3 Provider guidance is absent

- GIVEN installed provider guidance is unavailable in the active harness
- WHEN an agent needs provider-specific instructions
- THEN thoth-agents MUST report the guidance capability as unsupported or
  requiring provider installation or enablement
- AND it MUST NOT synthesize replacement provider instructions

### Requirement: SI-2 Prohibit Consumer Copies of Provider Protocol

thoth-agents skills, shared support files, prompts, fixtures, and generated
guidance MUST NOT manually require provider enrollment, session start, root
prompt capture, recovery, compaction, or completion procedures. They MUST NOT
reproduce exhaustive provider tool, action, argument, mode, filter, relation,
or data-shape vocabulary, and MUST NOT invent fallback or substitute procedures
when provider capabilities are unavailable.

#### Scenario: SI-2.1 Consumer guidance avoids lifecycle prescriptions

- GIVEN a thoth-agents-owned instruction describes a provider-dependent
  workflow
- WHEN the instruction is rendered or tested
- THEN it MUST state the required orchestration outcome without prescribing
  provider enrollment, start, prompt capture, recovery, compaction, or
  completion calls
- AND exact operational sequencing MUST remain in installed provider guidance

#### Scenario: SI-2.2 Consumer guidance avoids exhaustive callable vocabulary

- GIVEN a thoth-agents-owned instruction refers to provider-backed persistence
  or recovery
- WHEN it identifies the provider dependency
- THEN it MAY refer generically to the installed provider capability
- AND it MUST NOT enumerate or define the provider's complete callable surface,
  actions, arguments, modes, filters, relations, or data shapes

#### Scenario: SI-2.3 Missing capability does not create fallback guidance

- GIVEN a provider operation needed by a workflow is unavailable or not
  evidenced
- WHEN skill guidance handles that condition
- THEN it MUST require truthful degraded or unsupported reporting
- AND it MUST NOT prescribe a consumer-owned fallback, legacy runtime,
  substitute protocol, or fabricated recovery path

### Requirement: SI-3 Preserve Neutral Orchestration and SDD Guidance

thoth-agents skill instructions MUST preserve canonical semantic roles and
permissions, delegation and review gates, persistence modes, canonical OpenSpec
artifact names, canonical `sdd/{change}/{artifact}` topic-key identities when a
mode uses the provider, parent-scoped authorization outcomes, and evidence-led
verification. They MUST express these as provider-neutral consumer contracts.

#### Scenario: SI-3.1 Role and gate rules remain portable

- GIVEN shared instructions are rendered for OpenCode, Codex, or Claude Code
- WHEN provider protocol detail is removed
- THEN role responsibilities, permission boundaries, delegation gates, review
  gates, and verification duties MUST remain explicit
- AND harness enforcement gaps MUST be disclosed rather than treated as hard
  enforcement

#### Scenario: SI-3.2 SDD persistence identities remain canonical

- GIVEN an SDD skill selects a persistence mode
- WHEN it identifies artifacts governed by that mode
- THEN canonical OpenSpec names and applicable
  `sdd/{change}/{artifact}` identities MUST remain unchanged
- AND instructions MUST NOT define provider operations for persisting or
  recovering those identities

#### Scenario: SI-3.3 Provider absence preserves valid non-provider modes

- GIVEN provider-backed persistence is unsupported for the active harness
- WHEN a selected workflow does not depend on the provider and its own
  prerequisites are satisfied
- THEN that provider-independent workflow MUST remain usable
- AND guidance MUST NOT silently switch a provider-dependent selection to a
  different mode or claim provider-backed success

### Requirement: SI-4 Preserve Handoff and Completion Continuity Without Provider Calls

Skill instructions MUST require authorized delegates to receive or recover the
context needed for their tasks while leaving the mechanism to the installed
provider. Completion continuity, when provider-backed, MUST be described only
as a provider-delegated summary or checkpoint outcome and MUST NOT use permanent
closure, terminal, end-session, or finalization semantics.

#### Scenario: SI-4.1 Handoff guidance states required context

- GIVEN delegated work depends on accepted scope, decisions, permissions, or
  artifacts
- WHEN a skill describes the handoff
- THEN it MUST require that necessary context to remain available to the
  authorized delegate
- AND it MUST NOT prescribe the provider's calls, actions, filters, or recovery
  sequence

#### Scenario: SI-4.2 Completion guidance preserves continuation

- GIVEN a provider-backed workflow reaches completion
- WHEN a skill describes continuity at that boundary
- THEN it MUST describe a provider-delegated summary or checkpoint outcome
- AND it MUST NOT describe permanent closure, termination, end-session
  behavior, or finalization

#### Scenario: SI-4.3 Continuity support is degraded or unavailable

- GIVEN the active provider integration cannot evidence the required handoff or
  completion-continuity capability
- WHEN the skill handles that boundary
- THEN it MUST require degraded or unsupported reporting and MUST prohibit a
  false success claim
- AND unrelated valid orchestration MAY continue without fabricating persisted
  context

### Requirement: SI-5 Scope Harness Guidance and Capability Claims

Skill instructions MUST cover exactly OpenCode, Codex, and Claude Code for this
integration. Shared semantics MUST remain harness-neutral, harness bindings
MUST be scoped explicitly, and provider capability equality MUST NOT be assumed.

#### Scenario: SI-5.1 All supported harnesses receive boundary-consistent guidance

- GIVEN skills are rendered or packaged for OpenCode, Codex, or Claude Code
- WHEN memory integration guidance is included
- THEN each harness MUST preserve the same provider ownership and consumer
  governance boundary
- AND each harness MUST report its own evidenced supported, degraded, or
  unsupported capability state

#### Scenario: SI-5.2 Unsupported harness behavior is explicit

- GIVEN a requested harness binding or provider capability is not supported
- WHEN an instruction would otherwise imply universal behavior
- THEN it MUST require an explicit limitation, diagnostic, or stop condition
- AND it MUST NOT claim capability parity through best-effort prose

## MODIFIED Requirements

### Requirement: Express Shared Skill Semantics in Harness-Neutral Language

Skill instructions MUST describe shared orchestration, SDD, authorization,
continuity outcomes, safety, and verification semantics in harness-neutral
language. Provider-specific operations MUST be delegated to installed provider
guidance, and harness-specific bindings MUST be identified as bindings rather
than universal contracts.

#### Scenario: Shared wording separates consumer outcomes from provider operations

- GIVEN a shared instruction applies across supported harnesses
- WHEN it describes memory-dependent orchestration
- THEN it MUST state the consumer-owned outcome and capability dependency
- AND it MUST NOT embed provider protocol or treat a harness binding as
  universal

### Requirement: Fail Explicitly for Unsupported Harness Behavior

Skill instructions MUST require truthful supported, degraded, or unsupported
reporting when a harness or provider capability cannot be evidenced, and MUST
prohibit false success or invented consumer fallback.

#### Scenario: Capability gaps remain visible without disabling unrelated behavior

- GIVEN a target harness lacks a required provider capability
- WHEN skill guidance evaluates the requested workflow
- THEN it MUST identify the affected behavior as degraded or unsupported from
  evidence
- AND provider-independent orchestration MAY remain usable where valid
- AND the instruction MUST NOT fabricate provider success or recovery

### Requirement: Preserve thoth-mem Topic-Key Discipline

Skill instructions MUST preserve `sdd/{change}/{artifact}` as the canonical
identity for deterministic SDD artifacts in provider-backed persistence modes
and MUST keep general observations outside `sdd/*`. They MUST NOT prescribe how
the provider implements, stores, or retrieves those identities.

#### Scenario: Canonical identity is preserved without protocol duplication

- GIVEN a provider-backed SDD mode identifies a deterministic artifact
- WHEN skill guidance names that artifact's persistence identity
- THEN it MUST use `sdd/{change}/{artifact}`
- AND it MUST leave storage and recovery mechanics to installed provider
  guidance

## REMOVED Requirements

### Requirement: Use Canonical thoth-mem MCP Surface in Skill Guidance

Skill instructions MUST remove this consumer requirement because exact callable
vocabulary and its arguments belong exclusively to installed provider guidance.

#### Scenario: Exact callable-surface guidance is removed

- GIVEN skill instructions are reconciled with this delta
- WHEN provider-backed behavior is described
- THEN the former exhaustive callable-surface requirement MUST be absent
- AND the installed provider guidance MUST remain authoritative

### Requirement: Encode thoth-mem Lifecycle Ownership in Skill Guidance

Skill instructions MUST remove this consumer requirement because
consumer-authored lifecycle calls and sequencing conflict with the exclusive
provider boundary.

#### Scenario: Consumer lifecycle sequencing is removed

- GIVEN skill instructions are reconciled with this delta
- WHEN provider-backed lifecycle behavior is described
- THEN the former consumer-owned lifecycle sequence MUST be absent
- AND only outcome-level orchestration guidance MAY remain

### Requirement: Teach High-Signal thoth-mem Retrieval Decisions

Skill instructions MUST remove this consumer requirement because provider
retrieval modes, filters, navigation, and decision guidance belong to the
installed provider protocol.

#### Scenario: Consumer retrieval protocol is removed

- GIVEN skill instructions are reconciled with this delta
- WHEN provider-backed recovery is described
- THEN the former consumer-authored retrieval decision guide MUST be absent
- AND recovery mechanics MUST remain in installed provider guidance

## handoffHints

- Design must remove `src/skills/thoth-mem-agents` and all equivalent bundled or
  generated copies for OpenCode, Codex, and Claude Code.
- Design must preserve SI-1 through SI-5 and the three modified neutral
  requirements without reintroducing exact provider vocabulary.
- Handoff and completion guidance must remain outcome-level; summary/checkpoint
  preserves continuation and never means closure or finalization.
- Design, tasks, and prior plan-review evidence are stale until reconciled with
  this clarified delta.
