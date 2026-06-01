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

### Requirement: Use Canonical thoth-mem MCP Surface in Skill Guidance
Skill instructions and shared skill support files that describe thoth-mem MCP
usage MUST use the supported MCP surface: `mem_save`, `mem_recall`,
`mem_context`, `mem_get`, `mem_project`, and `mem_session`. Guidance MUST
present `mem_save` with kinds `observation`, `prompt`, `session_summary`, and
`passive_learnings`; `mem_recall` with modes `compact` and `context`, HyDE, the
filters `project`, `session_id`, `scope`, `topic_key`, `type`, `time_from`, and
`time_to`, and limit values from 1 through 20; `mem_context` with
`recall_query`; `mem_get` with kinds `observation` and `prompt`,
`include_timeline`, `before`, `after`, `offset`, and `max_length`;
`mem_project` with actions `list`, `summary`, `graph`, `topics`, and `topic`
and graph relations `HAS_TYPE`, `IN_PROJECT`, `HAS_TOPIC_KEY`, `HAS_WHAT`,
`HAS_WHY`, `HAS_WHERE`, and `HAS_LEARNED`; and `mem_session` with actions
`start`, `checkpoint`, and `summary`. Guidance MUST NOT instruct agents to call
thoth-mem MCP tools outside that supported set.

#### Scenario: Skill guidance names only supported MCP tools
- GIVEN a skill instruction, shared support file, generated skill artifact, or
  skill test fixture describes thoth-mem MCP usage
- WHEN the guidance names a callable thoth-mem MCP operation
- THEN it MUST name only `mem_save`, `mem_recall`, `mem_context`, `mem_get`,
  `mem_project`, or `mem_session`
- AND it MUST keep action, kind, mode, filter, pagination, timeline, and graph
  relation wording aligned with the supported surface

#### Scenario: Non-MCP operations are not presented as MCP tools
- GIVEN documentation or skill guidance needs to mention thoth-mem operations
  that are available through non-MCP interfaces
- WHEN the text is rendered for agent instruction or governance
- THEN it MUST NOT present those operations as callable MCP tools
- AND it MUST keep MCP usage examples limited to the supported six-tool surface

### Requirement: Encode thoth-mem Lifecycle Ownership in Skill Guidance
Skill instructions MUST define thoth-mem lifecycle ownership for memory-backed
workflows. The root agent MUST call `mem_session(action="start")` as step 0
before any other thoth-mem call when thoth-mem identity and tools are available.
Before delegating memory-dependent work, the root MUST persist a recoverable
handoff with `mem_session(action="summary")` or
`mem_save(kind="session_summary")`. Delegated prompts MUST carry parent
`session_id`, project, permissions, and recovery instructions rather than the
handoff body.

#### Scenario: Root bootstraps memory before any other memory operation
- GIVEN a new root session starts a workflow with thoth-mem available
- WHEN the root begins memory-backed work
- THEN the instructions MUST require `mem_session(action="start")` before
  `mem_context`, `mem_save`, `mem_recall`, `mem_get`, `mem_project`, or any
  other `mem_session` action
- AND if required identity or tools are unavailable, the root MUST disclose that
  bootstrap could not run and MUST NOT claim memory was saved

#### Scenario: Root persists handoff before memory-dependent dispatch
- GIVEN the root is about to delegate work that depends on persisted memory
- WHEN the delegated task is prepared
- THEN the instructions MUST require the root to save or refresh a recoverable
  handoff with `mem_session(action="summary")` or
  `mem_save(kind="session_summary")` before dispatch
- AND the delegated prompt MUST include parent `session_id`, project, memory
  permissions, and the recall funnel `mem_recall(mode="compact")` to
  `mem_recall(mode="context")` to `mem_get(...)`
- AND the delegated prompt MUST NOT paste the handoff body

#### Scenario: Subagent memory permissions follow role capability
- GIVEN a read-only subagent such as explorer, librarian, or oracle receives
  parent `session_id`, project, and memory recovery instructions
- WHEN it needs persisted context for the delegated task
- THEN skill guidance MAY allow parent-scoped `mem_recall`, `mem_context`,
  `mem_get`, and bounded `mem_project` reads
- AND it MUST prohibit `mem_save`, session ownership, and prompt persistence
- GIVEN a write-capable subagent such as designer, quick, or deep receives an
  explicit memory-write delegation
- WHEN it saves memory for the delegated task
- THEN skill guidance MAY allow `mem_save(kind="observation")` for delegated
  durable observations or deterministic SDD artifacts only
- AND it MUST prohibit session start, checkpoint, summary ownership, and prompt
  persistence

### Requirement: Teach High-Signal thoth-mem Retrieval Decisions
Skill guidance MUST teach concise decision guidance for using thoth-mem's
retrieval and project-memory capabilities. The guidance MUST explain when to use
HyDE-assisted semantic search, fused hybrid recall, `mem_recall` filters,
knowledge-graph and topic navigation through `mem_project`, fused recent context
through `mem_context(recall_query=...)`, and timeline recovery through
`mem_get(include_timeline=true)`.

#### Scenario: Guidance selects retrieval features by information need
- GIVEN an agent needs persisted context for a task
- WHEN the guidance explains thoth-mem retrieval choices
- THEN it MUST recommend HyDE or fused hybrid recall for semantic or ambiguous
  searches
- AND it MUST recommend `topic_key`, `type`, `time_from`, `time_to`, `scope`,
  `project`, and `session_id` filters when narrowing by artifact, observation
  category, chronology, scope, project, or parent session
- AND it MUST recommend `mem_get(include_timeline=true)` when chronology around
  an observation matters

#### Scenario: Guidance uses project memory without replacing recall
- GIVEN an agent needs project-level topic or relationship context
- WHEN the guidance explains supplemental memory navigation
- THEN it MUST recommend bounded `mem_project(action="graph")`,
  `mem_project(action="topics")`, or `mem_project(action="topic")` for graph,
  topic-list, or topic-detail needs
- AND it MUST recommend `mem_context(recall_query=...)` for fused recent context
  when useful
- AND it MUST state that supplemental context does not replace the required
  recall funnel when a delegated handoff or SDD artifact must be recovered

### Requirement: Preserve thoth-mem Topic-Key Discipline
Skill instructions MUST protect the `sdd/*` namespace. Deterministic SDD
artifacts MUST use `sdd/{change}/{artifact}` topic keys, while general durable
observations MUST stay outside `sdd/*`.

#### Scenario: SDD artifacts use deterministic topic keys
- GIVEN a delegated SDD phase is allowed to persist an artifact to thoth-mem
- WHEN the artifact is saved
- THEN the guidance MUST require the topic key `sdd/{change}/{artifact}` for the
  assigned phase artifact
- AND repeated saves for the same phase MUST converge on the same topic key

#### Scenario: General observations stay outside SDD namespace
- GIVEN an agent saves a general durable observation that is not a deterministic
  SDD artifact
- WHEN it chooses a thoth-mem topic key
- THEN the guidance MUST prohibit saving that observation under `sdd/*`
- AND it MUST reserve `sdd/*` for deterministic SDD artifacts only

### Requirement: Use Canonical thoth-mem MCP Surface in Skill Guidance
Skill instructions and shared skill support files that describe thoth-mem MCP
usage MUST use the supported MCP surface: `mem_save`, `mem_recall`,
`mem_context`, `mem_get`, `mem_project`, and `mem_session`. Guidance MUST
present `mem_save` with kinds `observation`, `prompt`, `session_summary`, and
`passive_learnings`; `mem_recall` with modes `compact` and `context`, HyDE, the
filters `project`, `session_id`, `scope`, `topic_key`, `type`, `time_from`, and
`time_to`, and limit values from 1 through 20; `mem_context` with
`recall_query`; `mem_get` with kinds `observation` and `prompt`,
`include_timeline`, `before`, `after`, `offset`, and `max_length`;
`mem_project` with actions `list`, `summary`, `graph`, `topics`, and `topic`
and graph relations `HAS_TYPE`, `IN_PROJECT`, `HAS_TOPIC_KEY`, `HAS_WHAT`,
`HAS_WHY`, `HAS_WHERE`, and `HAS_LEARNED`; and `mem_session` with actions
`start`, `checkpoint`, and `summary`. Guidance MUST NOT instruct agents to call
thoth-mem MCP tools outside that supported set.

#### Scenario: Skill guidance names only supported MCP tools
- GIVEN a skill instruction, shared support file, generated skill artifact, or
  skill test fixture describes thoth-mem MCP usage
- WHEN the guidance names a callable thoth-mem MCP operation
- THEN it MUST name only `mem_save`, `mem_recall`, `mem_context`, `mem_get`,
  `mem_project`, or `mem_session`
- AND it MUST keep action, kind, mode, filter, pagination, timeline, and graph
  relation wording aligned with the supported surface

#### Scenario: Non-MCP operations are not presented as MCP tools
- GIVEN documentation or skill guidance needs to mention thoth-mem operations
  that are available through non-MCP interfaces
- WHEN the text is rendered for agent instruction or governance
- THEN it MUST NOT present those operations as callable MCP tools
- AND it MUST keep MCP usage examples limited to the supported six-tool surface

### Requirement: Encode thoth-mem Lifecycle Ownership in Skill Guidance
Skill instructions MUST define thoth-mem lifecycle ownership for memory-backed
workflows. The root agent MUST call `mem_session(action="start")` as step 0
before any other thoth-mem call when thoth-mem identity and tools are available.
Before delegating memory-dependent work, the root MUST persist a recoverable
handoff with `mem_session(action="summary")` or
`mem_save(kind="session_summary")`. Delegated prompts MUST carry parent
`session_id`, project, permissions, and recovery instructions rather than the
handoff body.

#### Scenario: Root bootstraps memory before any other memory operation
- GIVEN a new root session starts a workflow with thoth-mem available
- WHEN the root begins memory-backed work
- THEN the instructions MUST require `mem_session(action="start")` before
  `mem_context`, `mem_save`, `mem_recall`, `mem_get`, `mem_project`, or any
  other `mem_session` action
- AND if required identity or tools are unavailable, the root MUST disclose that
  bootstrap could not run and MUST NOT claim memory was saved

#### Scenario: Root persists handoff before memory-dependent dispatch
- GIVEN the root is about to delegate work that depends on persisted memory
- WHEN the delegated task is prepared
- THEN the instructions MUST require the root to save or refresh a recoverable
  handoff with `mem_session(action="summary")` or
  `mem_save(kind="session_summary")` before dispatch
- AND the delegated prompt MUST include parent `session_id`, project, memory
  permissions, and the recall funnel `mem_recall(mode="compact")` to
  `mem_recall(mode="context")` to `mem_get(...)`
- AND the delegated prompt MUST NOT paste the handoff body

#### Scenario: Subagent memory permissions follow role capability
- GIVEN a read-only subagent such as explorer, librarian, or oracle receives
  parent `session_id`, project, and memory recovery instructions
- WHEN it needs persisted context for the delegated task
- THEN skill guidance MAY allow parent-scoped `mem_recall`, `mem_context`,
  `mem_get`, and bounded `mem_project` reads
- AND it MUST prohibit `mem_save`, session ownership, and prompt persistence
- GIVEN a write-capable subagent such as designer, quick, or deep receives an
  explicit memory-write delegation
- WHEN it saves memory for the delegated task
- THEN skill guidance MAY allow `mem_save(kind="observation")` for delegated
  durable observations or deterministic SDD artifacts only
- AND it MUST prohibit session start, checkpoint, summary ownership, and prompt
  persistence

### Requirement: Teach High-Signal thoth-mem Retrieval Decisions
Skill guidance MUST teach concise decision guidance for using thoth-mem's
retrieval and project-memory capabilities. The guidance MUST explain when to use
HyDE-assisted semantic search, fused hybrid recall, `mem_recall` filters,
knowledge-graph and topic navigation through `mem_project`, fused recent context
through `mem_context(recall_query=...)`, and timeline recovery through
`mem_get(include_timeline=true)`.

#### Scenario: Guidance selects retrieval features by information need
- GIVEN an agent needs persisted context for a task
- WHEN the guidance explains thoth-mem retrieval choices
- THEN it MUST recommend HyDE or fused hybrid recall for semantic or ambiguous
  searches
- AND it MUST recommend `topic_key`, `type`, `time_from`, `time_to`, `scope`,
  `project`, and `session_id` filters when narrowing by artifact, observation
  category, chronology, scope, project, or parent session
- AND it MUST recommend `mem_get(include_timeline=true)` when chronology around
  an observation matters

#### Scenario: Guidance uses project memory without replacing recall
- GIVEN an agent needs project-level topic or relationship context
- WHEN the guidance explains supplemental memory navigation
- THEN it MUST recommend bounded `mem_project(action="graph")`,
  `mem_project(action="topics")`, or `mem_project(action="topic")` for graph,
  topic-list, or topic-detail needs
- AND it MUST recommend `mem_context(recall_query=...)` for fused recent context
  when useful
- AND it MUST state that supplemental context does not replace the required
  recall funnel when a delegated handoff or SDD artifact must be recovered

### Requirement: Preserve thoth-mem Topic-Key Discipline
Skill instructions MUST protect the `sdd/*` namespace. Deterministic SDD
artifacts MUST use `sdd/{change}/{artifact}` topic keys, while general durable
observations MUST stay outside `sdd/*`.

#### Scenario: SDD artifacts use deterministic topic keys
- GIVEN a delegated SDD phase is allowed to persist an artifact to thoth-mem
- WHEN the artifact is saved
- THEN the guidance MUST require the topic key `sdd/{change}/{artifact}` for the
  assigned phase artifact
- AND repeated saves for the same phase MUST converge on the same topic key

#### Scenario: General observations stay outside SDD namespace
- GIVEN an agent saves a general durable observation that is not a deterministic
  SDD artifact
- WHEN it chooses a thoth-mem topic key
- THEN the guidance MUST prohibit saving that observation under `sdd/*`
- AND it MUST reserve `sdd/*` for deterministic SDD artifacts only
