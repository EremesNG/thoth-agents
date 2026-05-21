# Delta for Multi-Harness Agent Pack

## ADDED Requirements

### Requirement: Render Agent Prompts from Harness-Neutral Semantic Policies
The system MUST model shared agent prompt policy as harness-neutral semantic
intent before rendering harness-specific text.

#### Scenario: Shared policy avoids OpenCode-only tool names
- GIVEN a prompt policy section is shared across supported harnesses
- WHEN the policy describes delegation, user-question, memory, visual QA,
  verification, or tool-governance behavior
- THEN the shared policy MUST describe the intended behavior without hardcoding
  OpenCode-only tool names such as `question` or `task`
- AND any explicit OpenCode tool name MUST be introduced only by an OpenCode
  dialect, renderer, or harness-specific prompt section

#### Scenario: Harness terminology remains representable
- GIVEN a supported harness has its own terminology for tools, delegation,
  user questions, memory, visual QA, or verification
- WHEN agent prompts are rendered for that harness
- THEN the rendering contract MUST provide harness-specific wording for those
  concepts
- AND the shared semantic policy MUST remain reusable without brittle prose edits
  to fit that harness

### Requirement: Preserve the Seven-Agent Role Nature Across Harnesses
The system MUST preserve the role nature, responsibilities, and operating modes of
the orchestrator, explorer, librarian, oracle, designer, quick, and deep agents
when prompts are rendered for any supported harness.

#### Scenario: All roles retain their semantic responsibilities
- GIVEN the seven-agent roster is rendered for OpenCode or Codex
- WHEN each role prompt is generated
- THEN orchestrator MUST remain the root coordinator and sequencing decision role
- AND explorer, librarian, and oracle MUST remain read-only specialist roles
- AND designer, quick, and deep MUST remain write-capable roles with their
  existing responsibility boundaries

#### Scenario: Harness limitations do not rewrite role identity
- GIVEN a supported harness cannot enforce a role rule with the same runtime
  mechanism as another harness
- WHEN the role prompt or related diagnostics are rendered
- THEN the system MUST preserve the role's intended responsibility as instruction
  or configuration where possible
- AND it MUST disclose the capability limitation rather than weakening, renaming,
  removing, or conflating the role

### Requirement: Derive Harness-Specific Wording from Typed Dialects and Capabilities
The system MUST derive harness-specific agent prompt wording from an explicit,
typed dialect and capability profile rather than from post-hoc string replacement
of another harness's prompt prose.

#### Scenario: OpenCode wording is rendered from the OpenCode dialect
- GIVEN OpenCode is selected as the target harness
- WHEN agent prompts are generated
- THEN OpenCode-specific wording such as native delegation tools, user-question
  tools, permission terminology, and verification instructions MUST be supplied by
  the OpenCode dialect or capability profile
- AND OpenCode-rendered prompts MUST preserve the current explicit OpenCode
  guidance for the seven-agent roster

#### Scenario: Codex wording is rendered from the Codex dialect
- GIVEN Codex is selected as the target harness
- WHEN agent prompts are generated
- THEN Codex-specific wording for delegation, user input, tool access, memory
  governance, visual QA, and verification MUST be supplied by the Codex dialect or
  capability profile
- AND Codex-rendered prompts MUST identify instruction-only governance or other
  capability gaps where Codex cannot provide equivalent runtime enforcement

### Requirement: Avoid Codex Prompt Adaptation by Exact OpenCode Prose Replacement
The Codex prompt generation path MUST NOT depend on replacing exact OpenCode prose
fragments to produce Codex wording.

#### Scenario: Codex generation survives OpenCode prose changes
- GIVEN a shared policy section has changed wording without changing semantic
  intent
- WHEN Codex prompts are generated
- THEN Codex output MUST still be produced from semantic sections and Codex
  dialect data
- AND generation MUST NOT require matching an exact previous OpenCode sentence or
  paragraph to produce correct Codex wording

#### Scenario: OpenCode-only phrases do not leak into Codex shared policy output
- GIVEN Codex prompts are generated for root and specialist roles
- WHEN the output describes shared delegation, user-question, memory, visual QA,
  verification, or tool-governance behavior
- THEN OpenCode-only terms MUST NOT appear unless they are explicitly framed as
  an OpenCode comparison or compatibility note
- AND the Codex wording MUST remain accurate for Codex's documented or declared
  capabilities

### Requirement: Verify OpenCode and Codex Prompt Contracts with Focused Tests
The implementation MUST include focused automated tests that cover both OpenCode
and Codex prompt rendering contracts for semantic policies, role preservation,
harness terminology, and capability disclosures.

#### Scenario: OpenCode rendering remains explicit and stable
- GIVEN the OpenCode harness is selected
- WHEN prompt rendering tests execute
- THEN tests MUST assert that OpenCode prompts include the expected OpenCode tool,
  delegation, user-question, memory, visual QA, and verification wording
- AND tests MUST assert that all seven role prompts preserve their role nature and
  operating modes

#### Scenario: Codex rendering uses Codex semantics without brittle adaptation
- GIVEN the Codex harness is selected
- WHEN prompt rendering tests execute
- THEN tests MUST assert that Codex prompts use Codex-specific terminology and
  capability-gap language
- AND tests MUST fail if Codex rendering depends on broad exact-fragment
  replacement of OpenCode prompt prose

### Requirement: Keep Harness-Agnostic Prompt Work Within Approved Scope
The system MUST limit this change to prompt-generation contracts for OpenCode and
Codex and MUST NOT expand the agent roster or add additional harness support.

#### Scenario: Unsupported harnesses remain out of scope for prompt rendering
- GIVEN a caller or test fixture requests harness-specific prompt rendering for a
  non-OpenCode and non-Codex harness
- WHEN this change is evaluated or implemented
- THEN the system MUST report that the harness is out of scope for this change
- AND it MUST NOT add generated prompts, fixtures, or runtime behavior that imply
  support for that harness

#### Scenario: Runtime behavior changes stay constrained to prompt contracts
- GIVEN prompt rendering is updated for OpenCode and Codex
- WHEN the implementation is planned or verified
- THEN the system MUST NOT change runtime delegation, memory, visual QA, or SDD
  execution behavior beyond what is necessary to keep generated prompt contracts
  accurate
- AND it MUST NOT change the seven-agent roster

## MODIFIED Requirements

## REMOVED Requirements
