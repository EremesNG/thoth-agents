# Delta for Multi-Harness Agent Pack

## ADDED Requirements

### Requirement: Define Root Coordinator Prompt Contract
The system MUST render the orchestrator/root coordinator prompt as the
delegate-first decision and sequencing contract for the ambient root session.

#### Scenario: Root prompt owns coordination boundaries
- GIVEN OpenCode or Codex root instructions are rendered
- WHEN the orchestrator prompt is composed
- THEN it MUST identify the role as the root coordinator, orchestrator, or
  ambient root decision engine
- AND it MUST assign user-facing synthesis, task sequencing, blocking user
  input, progress ownership, root-session memory, and final outcome reporting to
  the root role
- AND it MUST NOT present the orchestrator as an optional specialist that the
  user must invoke instead of the active root session

#### Scenario: Root prompt delegates bounded work
- GIVEN the root prompt describes delegate-first operation
- WHEN it explains how work is assigned
- THEN it MUST preserve the current roster of explorer, librarian, oracle,
  designer, quick, and deep subagents
- AND it MUST describe subagents as evidence, review, implementation, or
  verification owners for bounded assignments
- AND it MUST prohibit requesting raw file dumps from subagents when findings,
  anchors, diffs, verification evidence, or blockers are sufficient

### Requirement: Define Read-Only Subagent Prompt Contract
The system MUST render explorer, librarian, and oracle prompts as read-only
specialist contracts with role-specific evidence outputs.

#### Scenario: Explorer prompt is local discovery only
- GIVEN the explorer prompt is rendered for any supported harness
- WHEN it describes the explorer role
- THEN it MUST require read-only local codebase discovery, symbol or file
  anchors, constraints, risks, and verification targets
- AND it MUST NOT permit implementation, repository mutation, destructive git
  operations, or durable session-memory ownership

#### Scenario: Librarian prompt is external research only
- GIVEN the librarian prompt is rendered for any supported harness
- WHEN it describes the librarian role
- THEN it MUST require read-only external documentation, public examples, version
  sensitivity, source attribution, and applicability notes
- AND it MUST NOT permit repository mutation, undocumented API invention, or
  broad implementation work

#### Scenario: Oracle prompt is advisory only
- GIVEN the oracle prompt is rendered for any supported harness
- WHEN it describes review, diagnosis, or plan review duties
- THEN it MUST require findings, risks, assumptions, and accept/reject style
  conclusions where the delegated task asks for them
- AND it MUST NOT permit artifact-producing SDD phases, implementation edits, or
  workspace mutation

### Requirement: Define Write-Capable Subagent Prompt Contract
The system MUST render designer, quick, and deep prompts as bounded
implementation contracts with verification and reporting obligations.

#### Scenario: Designer prompt owns user-facing visual work
- GIVEN the designer prompt is rendered for any supported harness
- WHEN it describes UI, UX, browser, screenshot, or visual verification work
- THEN it MUST make designer the owner of user-facing UI implementation, visual
  QA, screenshots, and responsive interaction checks
- AND it MUST require visual verification evidence when the task changes
  user-facing screens

#### Scenario: Quick prompt stays narrow and mechanical
- GIVEN the quick prompt is rendered for any supported harness
- WHEN it describes implementation work
- THEN it MUST limit quick to clear, bounded, low-risk, mechanical edits
- AND it MUST require preserving unrelated working-tree changes, avoiding
  destructive git commands, and reporting focused verification

#### Scenario: Deep prompt owns correctness-critical implementation
- GIVEN the deep prompt is rendered for any supported harness
- WHEN it describes implementation work
- THEN it MUST assign deep to correctness-critical, multi-file, backend, data
  flow, API, refactor, or edge-case-heavy changes
- AND it MUST require local context validation, appropriate test-first or
  systematic-debugging behavior, edge-case consideration, and sufficient
  automated verification before completion is reported

### Requirement: Preserve Custom Prompt Replacement and Append Semantics
The system MUST preserve configured prompt replacement and append behavior while
rewriting generated prompt contracts.

#### Scenario: Replacement prompt overrides generated content
- GIVEN a role has a configured replacement prompt and a configured append prompt
- WHEN the role prompt is composed
- THEN the replacement prompt MUST be used after placeholder expansion
- AND the generated base prompt and append prompt MUST NOT be included in the
  final prompt

#### Scenario: Append prompt extends generated content
- GIVEN a role has no replacement prompt and has a configured append prompt
- WHEN the role prompt is composed
- THEN the generated prompt MUST be rendered first with placeholder expansion
- AND the append prompt MUST be appended after placeholder expansion without
  removing generated role, dialect, memory, safety, or verification guidance

#### Scenario: Model-family guidance composes before user append text
- GIVEN model-family guidance is applicable and an append prompt is configured
- WHEN a role prompt is composed
- THEN model-family guidance SHOULD remain part of the generated prompt
- AND user append text SHOULD appear after generated model-family guidance

### Requirement: Preserve Reference-Inspired Style Without Importing Roles
The system MUST allow prompt structure and tone to be inspired by external
reference repositories only when the canonical thoth-agents roster and behavior
contracts remain unchanged.

#### Scenario: Reference repos do not expand the roster
- GIVEN Gentle-AI or oh-my-opencode-slim is used as prompt inspiration
- WHEN prompts, tests, or docs are updated
- THEN the system MUST preserve only orchestrator, explorer, librarian, oracle,
  designer, quick, and deep as thoth-agents roles
- AND it MUST NOT add, rename, or expose reference-repo roles, command models, or
  permission assumptions as thoth-agents behavior

#### Scenario: Inspired prose remains behavior-compatible
- GIVEN reference style influences prompt organization
- WHEN generated prompts are compared against thoth-agents contracts
- THEN the prompts MUST preserve delegate-first orchestration, read-only versus
  write-capable role boundaries, SDD gates, memory governance, and verification
  expectations
- AND differences from reference repositories MUST be adapted into current
  thoth-agents terminology instead of copied verbatim when semantics differ

## MODIFIED Requirements

### Requirement: Preserve the Seven-Agent Role Nature Across Harnesses
The system MUST preserve the role nature, responsibilities, and operating modes
of the orchestrator, explorer, librarian, oracle, designer, quick, and deep
agents when prompts are rendered for any supported harness.

#### Scenario: All roles retain their semantic responsibilities
- GIVEN the seven-agent roster is rendered for OpenCode or Codex
- WHEN each role prompt is generated
- THEN orchestrator MUST remain the root coordinator and sequencing decision
  role
- AND explorer, librarian, and oracle MUST remain read-only specialist roles
- AND designer, quick, and deep MUST remain write-capable roles with their
  existing responsibility boundaries
- AND generated prompts, docs, and tests MUST NOT introduce an additional role
  or remove a current role

#### Scenario: Harness limitations do not rewrite role identity
- GIVEN a supported harness cannot enforce a role rule with the same runtime
  mechanism as another harness
- WHEN the role prompt or related diagnostics are rendered
- THEN the system MUST preserve the role's intended responsibility as instruction
  or configuration where possible
- AND it MUST disclose the capability limitation rather than weakening,
  renaming, removing, or conflating the role

### Requirement: Derive Harness-Specific Wording from Typed Dialects and Capabilities
The system MUST derive harness-specific agent prompt wording from an explicit,
typed dialect and capability profile rather than from post-hoc string
replacement of another harness's prompt prose.

#### Scenario: OpenCode wording is rendered from the OpenCode dialect
- GIVEN OpenCode is selected as the target harness
- WHEN agent prompts are generated
- THEN OpenCode-specific wording such as native delegation tools, user-question
  tools, permission terminology, progress tracking, and verification
  instructions MUST be supplied by the OpenCode dialect or capability profile
- AND OpenCode-rendered prompts MUST preserve the current explicit OpenCode
  guidance for the seven-agent roster

#### Scenario: Codex wording is rendered from the Codex dialect
- GIVEN Codex is selected as the target harness
- WHEN agent prompts are generated
- THEN Codex-specific wording for custom-agent task execution, user input,
  tool access, memory governance, visual QA, and verification MUST be supplied by
  the Codex dialect, Codex adapter, or capability profile
- AND Codex-rendered prompts MUST identify instruction-level governance or other
  capability gaps where Codex cannot provide equivalent runtime enforcement
- AND Codex root wording MUST describe the ambient Codex session as the root
  coordinator surface

### Requirement: Enforce thoth-mem Governance Across Harnesses
The system MUST preserve thoth-mem as the memory integration and MUST
distinguish runtime-enforced governance from instruction-level governance with
visible enforcement-gap diagnostics when a harness cannot enforce tool
restrictions.

#### Scenario: Root-only memory tools remain restricted
- GIVEN an agent or subagent prompt is rendered for any supported harness
- WHEN memory tool guidance is included
- THEN only the root orchestrator role MAY own `mem_session_start`,
  `mem_session_summary`, and `mem_save_prompt`
- AND subagents MUST be instructed not to call those tools
- AND subagents MUST be instructed not to call thoth-mem tools at all when the
  dispatch lacks either parent `session_id` or project context

#### Scenario: Runtime enforcement is used where available
- GIVEN a supported harness exposes documented per-agent tool, permission, or MCP
  allow/deny controls
- WHEN harness-specific prompts or configs are generated
- THEN the adapter MUST configure those controls to prevent subagents from using
  root-only memory operations and disallowed memory writes
- AND tests MUST verify the generated controls in addition to rendered prompt
  text

#### Scenario: Enforcement gaps are diagnosed where unavailable
- GIVEN a supported harness does not expose documented runtime controls for a
  memory-governance rule
- WHEN the adapter renders artifacts for that harness
- THEN it MUST preserve the governance rule as instruction-level guidance
- AND it MUST emit a visible diagnostic identifying the unsupported enforcement
  capability and the resulting instruction-only limitation

#### Scenario: SDD artifact writes use deterministic ownership
- GIVEN an SDD artifact-producing subagent is allowed to use thoth-mem by the
  selected persistence mode and dispatch limits
- WHEN it saves an SDD artifact
- THEN it MUST save only the deterministic artifact topic key assigned to that
  phase, such as `sdd/{change}/{artifact}`
- AND it MUST NOT write root-session summaries, user prompts, unrelated durable
  observations, or ad hoc SDD topic keys

### Requirement: Verify OpenCode and Codex Prompt Contracts with Focused Tests
The implementation MUST include focused automated tests that cover both OpenCode
and Codex prompt rendering contracts for semantic policies, role preservation,
harness terminology, custom prompt composition, memory governance, and
capability disclosures.

#### Scenario: OpenCode rendering remains explicit and stable
- GIVEN the OpenCode harness is selected
- WHEN prompt rendering tests execute
- THEN tests MUST assert that OpenCode prompts include expected OpenCode tool,
  delegation, user-question, progress, memory, visual QA, and verification
  wording
- AND tests MUST assert that all seven role prompts preserve their role nature
  and operating modes

#### Scenario: Codex rendering uses Codex semantics without brittle adaptation
- GIVEN the Codex harness is selected
- WHEN prompt rendering tests execute
- THEN tests MUST assert that Codex prompts use Codex-specific terminology and
  capability-gap language
- AND tests MUST fail if Codex rendering depends on broad exact-fragment
  replacement of OpenCode prompt prose

#### Scenario: Custom prompt composition remains covered
- GIVEN prompt composition supports replacement and append inputs
- WHEN prompt composition tests execute
- THEN tests MUST verify placeholder expansion for generated, replacement, and
  append prompts
- AND tests MUST verify replacement prompt precedence over append prompts
- AND tests SHOULD verify generated model-family guidance remains before user
  append text when both are present

#### Scenario: Reporting evidence is required for completion
- GIVEN prompt rewrite implementation is complete
- WHEN verification is reported
- THEN the report MUST identify the focused tests or diagnostics that checked
  OpenCode rendering, Codex rendering, memory governance, custom prompt
  composition, and docs alignment where changed
- AND failures, skipped checks, or unsupported capability assertions MUST be
  reported explicitly

### Requirement: Keep Harness-Agnostic Prompt Work Within Approved Scope
The system MUST limit this change to prompt-generation contracts, dialect
rendering, Codex adapter wording, focused tests, and aligned documentation for
OpenCode and Codex, and MUST NOT expand the agent roster or add additional
harness support.

#### Scenario: Unsupported harnesses remain out of scope for prompt rendering
- GIVEN a caller or test fixture requests harness-specific prompt rendering for
  a non-OpenCode and non-Codex harness
- WHEN this change is evaluated or implemented
- THEN the system MUST report that the harness is out of scope for this change
- AND it MUST NOT add generated prompts, fixtures, docs, or runtime behavior that
  imply support for that harness

#### Scenario: Runtime behavior changes stay constrained to prompt contracts
- GIVEN prompt rendering is updated for OpenCode and Codex
- WHEN the implementation is planned or verified
- THEN the system MUST NOT change runtime delegation, memory, visual QA, SDD
  execution, installer, or plugin packaging behavior beyond what is necessary to
  keep generated prompt contracts accurate
- AND it MUST NOT change SDD artifact semantics, OpenSpec paths, memory
  topic-key formats, review gates, or the seven-agent roster

## REMOVED Requirements
