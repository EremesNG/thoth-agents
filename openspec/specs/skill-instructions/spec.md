# Spec: Skill Instructions

## Requirements

### Requirement: Express Shared Skill Semantics in Harness-Neutral Language
Skill instructions under `src/skills/` MUST describe shared workflow semantics,
artifact contracts, persistence modes, role responsibilities, safety rules, and
verification expectations in harness-neutral language wherever the behavior is
intended to apply across supported harnesses.

#### Scenario: Shared workflow text avoids universal harness assumptions
- GIVEN a skill instruction describes behavior shared by OpenCode and Codex
- WHEN the instruction names delegation, user input, artifact persistence,
  memory governance, review gates, visual QA, or verification behavior
- THEN it MUST express the shared behavior as a semantic responsibility
- AND it MUST NOT treat a harness-specific tool name, command syntax, path
  convention, or autoloading behavior as a universal requirement

#### Scenario: Harness examples remain clearly scoped
- GIVEN a skill instruction includes a concrete harness example
- WHEN the example uses OpenCode or Codex terminology
- THEN the text MUST identify the example as harness-specific guidance,
  binding, or adapter behavior
- AND the shared requirement MUST remain understandable without that example

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
Skill instructions MUST require unsupported harness behavior, missing capability
bindings, or unavailable runtime enforcement to fail or surface diagnostics
explicitly rather than implying support.

#### Scenario: Missing harness binding blocks universal claims
- GIVEN a skill requires a behavior such as delegated execution, blocking user
  input, root-owned memory tools, artifact persistence, visual QA, or hook
  enforcement
- WHEN a target harness lacks a supported binding for that behavior
- THEN the instruction MUST require an explicit unsupported-capability
  diagnostic, limitation note, or stop condition
- AND it MUST NOT describe the behavior as supported by best-effort prose alone

#### Scenario: Instruction-only governance is disclosed
- GIVEN a harness can preserve a governance rule only through instructions and
  cannot enforce it through documented runtime permissions or tool controls
- WHEN skill instructions are rendered or packaged for that harness
- THEN the limitation MUST be disclosed as instruction-level governance
- AND the instructions MUST NOT claim hard runtime enforcement for that rule
