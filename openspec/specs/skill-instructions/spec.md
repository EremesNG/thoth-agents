# Spec: Skill Instructions

## Requirements

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

### Requirement: Frame Harness-Specific Primitives as Bindings
Skill instructions MUST frame harness-specific primitives as harness bindings,
adapter mappings, or examples rather than as universal thoth-agents semantics.

#### Scenario: OpenCode primitives are scoped to OpenCode
- GIVEN skill instructions mention OpenCode-specific primitives such as the
  `question` tool, AGENTS.md autoloading behavior, `~/.config/opencode` paths,
  native task delegation, or `@role` dispatch syntax
- WHEN the instructions are updated for multi-harness readiness
- THEN those primitives MUST be presented as OpenCode bindings or examples
- AND the instructions MUST preserve the intended shared workflow in
  harness-neutral terms

#### Scenario: Codex primitives are scoped to Codex
- GIVEN skill instructions mention Codex-specific primitives such as
  `request_user_input`, plugin-bundled skills, Codex hooks, Codex root
  instructions, or Codex subagent files
- WHEN the instructions describe portable skill behavior
- THEN those primitives MUST be presented as Codex bindings, capability notes,
  or examples
- AND unsupported or instruction-only Codex behavior MUST be disclosed rather
  than implied as hard runtime enforcement

### Requirement: Preserve OpenCode Baseline Skill Behavior
The system MUST preserve the existing OpenCode baseline behavior for skills,
including SDD phase ordering, artifact prerequisites, persistence-mode
semantics, review gates, root-owned memory governance, and verification
expectations.

#### Scenario: OpenCode skill users retain explicit operational guidance
- GIVEN a user invokes skills through the OpenCode harness
- WHEN the skill instructions are rendered, bundled, or installed after this
  change
- THEN OpenCode-specific bindings MUST remain explicit where needed for correct
  operation
- AND the update MUST NOT weaken OpenCode SDD, delegation, memory, artifact, or
  verification guidance

#### Scenario: Portable wording does not remove OpenCode requirements
- GIVEN an existing OpenCode-only instruction is required for current behavior
- WHEN the instruction is made multi-harness-ready
- THEN the instruction MUST either remain in an OpenCode-specific section or be
  mapped from an equivalent harness-neutral requirement
- AND it MUST NOT be removed solely because another harness lacks equivalent
  runtime support

### Requirement: Prefer Plugin-Bundled Codex Skill Packaging
Codex-facing skill instructions and packaging guidance MUST prefer
plugin-bundled `skills/<skill>/` delivery, while treating `.agents/skills` as
fallback, development, or repo-local output only.

#### Scenario: Codex primary packaging points to plugin-local skills
- GIVEN Codex skill delivery is described by `src/skills/` instructions or
  related packaging guidance
- WHEN the instructions identify the primary Codex delivery location
- THEN they MUST identify plugin-bundled `skills/<skill>/` content as the
  preferred package form
- AND they MUST NOT present `.agents/skills` as the primary thoth-agents Codex
  install target

#### Scenario: Fallback skill output is explicitly bounded
- GIVEN instructions mention `.agents/skills`
- WHEN that location is used for Codex-related skill output
- THEN the instructions MUST classify it as fallback, development, or
  repo-local output
- AND they MUST warn or diagnose duplicate skill delivery when plugin-bundled
  and fallback copies could both apply

### Requirement: Preserve Canonical thoth-agents Identity
Skill instructions MUST use `thoth-agents` as the canonical identity for the
project, plugin, package, skill pack, managed artifacts, and generated guidance.

#### Scenario: Skill instructions avoid old project identities
- GIVEN an active skill instruction, shared support file, fixture, or generated
  skill artifact describes the current project identity
- WHEN the multi-harness-ready skill content is authored or verified
- THEN it MUST identify the project as `thoth-agents`
- AND it MUST NOT revive old names, dual-write aliases, or legacy managed
  identity references as active behavior

#### Scenario: Historical references remain non-canonical
- GIVEN a historical, archived, third-party, or migration note must mention an
  old project name
- WHEN that reference remains near skill documentation
- THEN the context MUST make clear that it is not the current canonical
  identity
- AND active skill behavior MUST NOT derive names, paths, plugin identifiers, or
  managed blocks from that old identity

### Requirement: Preserve Canonical Semantic Role Names
Skill instructions MUST preserve `explorer`, `librarian`, `oracle`, `designer`,
`quick`, and `deep` as canonical semantic role names while treating invocation
syntax as harness-bound.

#### Scenario: Role semantics remain stable across harnesses
- GIVEN a skill instruction assigns responsibilities to role specialists
- WHEN the instruction is made multi-harness-ready
- THEN the role names `explorer`, `librarian`, `oracle`, `designer`, `quick`,
  and `deep` MUST remain the canonical semantic roles
- AND their read-only or write-capable responsibility boundaries MUST remain
  aligned with the existing agent roster

#### Scenario: Role invocation syntax is harness-specific
- GIVEN a skill instruction describes how to dispatch or invoke a role
- WHEN the syntax differs between OpenCode, Codex, or another supported harness
- THEN the instruction MUST frame the syntax as a harness binding
- AND it MUST NOT require OpenCode `@role` syntax or any Codex-specific
  subagent syntax as a universal skill contract

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

### Requirement: SI-1 Remove Bundled Provider Guidance
thoth-agents MUST remove and MUST NOT bundle `src/skills/thoth-mem-agents` or an
equivalent consumer-owned copy of the provider's memory skill or protocol.
Generated and installed skill packages for OpenCode, Codex, and Claude Code MUST
omit that bundled skill and MUST treat installed provider guidance as the
authority for provider behavior.

#### Scenario: The bundled provider skill is removed
- GIVEN thoth-agents source and package registries are inspected
- WHEN skills are built, generated, or installed
- THEN `src/skills/thoth-mem-agents` and equivalent bundled provider guidance
  MUST be absent
- AND no supported harness package MAY recreate it under another consumer-owned
  path or name

#### Scenario: Installed provider guidance supplies memory protocol
- GIVEN a provider is installed for OpenCode, Codex, or Claude Code
- WHEN an agent needs provider operational guidance
- THEN the agent MUST rely on the installed provider skill or protocol
- AND thoth-agents guidance MUST remain limited to neutral orchestration and SDD
  obligations

#### Scenario: Provider guidance is absent
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

#### Scenario: Consumer guidance avoids lifecycle prescriptions
- GIVEN a thoth-agents-owned instruction describes a provider-dependent workflow
- WHEN the instruction is rendered or tested
- THEN it MUST state the required orchestration outcome without prescribing
  provider enrollment, start, prompt capture, recovery, compaction, or
  completion calls
- AND exact operational sequencing MUST remain in installed provider guidance

#### Scenario: Consumer guidance avoids exhaustive callable vocabulary
- GIVEN a thoth-agents-owned instruction refers to provider-backed persistence
  or recovery
- WHEN it identifies the provider dependency
- THEN it MAY refer generically to the installed provider capability
- AND it MUST NOT enumerate or define the provider's complete callable surface,
  actions, arguments, modes, filters, relations, or data shapes

#### Scenario: Missing capability does not create fallback guidance
- GIVEN a provider operation needed by a workflow is unavailable or not evidenced
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

#### Scenario: Role and gate rules remain portable
- GIVEN shared instructions are rendered for OpenCode, Codex, or Claude Code
- WHEN provider protocol detail is removed
- THEN role responsibilities, permission boundaries, delegation gates, review
  gates, and verification duties MUST remain explicit
- AND harness enforcement gaps MUST be disclosed rather than treated as hard
  enforcement

#### Scenario: SDD persistence identities remain canonical
- GIVEN an SDD skill selects a persistence mode
- WHEN it identifies artifacts governed by that mode
- THEN canonical OpenSpec names and applicable
  `sdd/{change}/{artifact}` identities MUST remain unchanged
- AND instructions MUST NOT define provider operations for persisting or
  recovering those identities

#### Scenario: Provider absence preserves valid non-provider modes
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

#### Scenario: Handoff guidance states required context
- GIVEN delegated work depends on accepted scope, decisions, permissions, or
  artifacts
- WHEN a skill describes the handoff
- THEN it MUST require that necessary context to remain available to the
  authorized delegate
- AND it MUST NOT prescribe the provider's calls, actions, filters, or recovery
  sequence

#### Scenario: Completion guidance preserves continuation
- GIVEN a provider-backed workflow reaches completion
- WHEN a skill describes continuity at that boundary
- THEN it MUST describe a provider-delegated summary or checkpoint outcome
- AND it MUST NOT describe permanent closure, termination, end-session behavior,
  or finalization

#### Scenario: Continuity support is degraded or unavailable
- GIVEN the active provider integration cannot evidence the required handoff or
  completion-continuity capability
- WHEN the skill handles that boundary
- THEN it MUST require degraded or unsupported reporting and MUST prohibit a
  false success claim
- AND unrelated valid orchestration MAY continue without fabricating persisted
  context

### Requirement: SI-5 Scope Harness Guidance and Capability Claims
Skill instructions MUST cover exactly OpenCode, Codex, and Claude Code for this
integration. Shared semantics MUST remain harness-neutral, harness bindings MUST
be scoped explicitly, and provider capability equality MUST NOT be assumed.

#### Scenario: All supported harnesses receive boundary-consistent guidance
- GIVEN skills are rendered or packaged for OpenCode, Codex, or Claude Code
- WHEN memory integration guidance is included
- THEN each harness MUST preserve the same provider ownership and consumer
  governance boundary
- AND each harness MUST report its own evidenced supported, degraded, or
  unsupported capability state

#### Scenario: Unsupported harness behavior is explicit
- GIVEN a requested harness binding or provider capability is not supported
- WHEN an instruction would otherwise imply universal behavior
- THEN it MUST require an explicit limitation, diagnostic, or stop condition
- AND it MUST NOT claim capability parity through best-effort prose

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
