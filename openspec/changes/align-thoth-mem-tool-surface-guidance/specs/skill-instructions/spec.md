# Delta for Skill Instructions

## ADDED Requirements
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

## MODIFIED Requirements

## REMOVED Requirements
