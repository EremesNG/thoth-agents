# Delta for Multi-Harness Agent Pack

## ADDED Requirements
### Requirement: Render Canonical thoth-mem Tool Surface Across Harness Surfaces
The system MUST render agent prompts, governance constants and types including
`MemoryToolName`, hook protocol text, Codex adapter guidance, documentation, and
tests with the supported thoth-mem MCP surface: `mem_save`, `mem_recall`,
`mem_context`, `mem_get`, `mem_project`, and `mem_session`. The rendered surface
MUST express `mem_save` kinds `observation`, `prompt`, `session_summary`, and
`passive_learnings`; `mem_recall` modes `compact` and `context`, HyDE, filters
`project`, `session_id`, `scope`, `topic_key`, `type`, `time_from`, and
`time_to`, and limit values from 1 through 20; `mem_context(recall_query=...)`;
`mem_get` kinds `observation` and `prompt`, timeline controls, and pagination;
`mem_project` actions `list`, `summary`, `graph`, `topics`, and `topic` with
relations `HAS_TYPE`, `IN_PROJECT`, `HAS_TOPIC_KEY`, `HAS_WHAT`, `HAS_WHY`,
`HAS_WHERE`, and `HAS_LEARNED`; and `mem_session` actions `start`,
`checkpoint`, and `summary`. The system MUST NOT instruct agents to call
thoth-mem MCP tools outside that supported set.

#### Scenario: Rendered and governed tool vocabulary is consistent
- GIVEN OpenCode prompts, Codex prompts, hook protocol text, documentation,
  governance constants, or generated tests are rendered or evaluated
- WHEN a callable thoth-mem MCP operation is named
- THEN the output MUST name only `mem_save`, `mem_recall`, `mem_context`,
  `mem_get`, `mem_project`, or `mem_session`
- AND `MemoryToolName` and related governance fixtures MUST be limited to the
  same six supported tool names

#### Scenario: Tests reject unsupported MCP vocabulary
- GIVEN tests cover prompt rendering, governance constants, hook protocol text,
  Codex adapter guidance, and docs alignment
- WHEN those surfaces include thoth-mem MCP guidance
- THEN tests MUST assert the supported six-tool vocabulary and key actions,
  kinds, modes, filters, timeline controls, and graph relations
- AND tests MUST fail if rendered MCP guidance names a tool outside the supported
  surface

### Requirement: Bootstrap Root thoth-mem Sessions Before Other Memory Operations
The system MUST render root/orchestrator guidance for memory-backed workflows so
`mem_session(action="start")` is step 0 before any other thoth-mem operation
whenever thoth-mem identity and tools are available.

#### Scenario: Root starts memory session first
- GIVEN a new root session has thoth-mem available and the active project can be
  identified
- WHEN the root begins memory-backed orchestration
- THEN rendered guidance MUST require `mem_session(action="start")` before any
  `mem_context`, `mem_save`, `mem_recall`, `mem_get`, `mem_project`, or later
  `mem_session` operation
- AND the guidance MUST preserve the root as the owner of session lifecycle
  operations

#### Scenario: Root reports unavailable bootstrap
- GIVEN a new root session lacks required thoth-mem tools, project identity, or
  session identity
- WHEN memory-backed orchestration would otherwise begin
- THEN rendered guidance MUST require the root to disclose that bootstrap could
  not run
- AND it MUST NOT claim prompts, observations, summaries, or handoffs were saved
  to memory

### Requirement: Provide thoth-mem Capability-Leverage Decision Guidance
The system MUST render concise decision guidance that helps agents use thoth-mem
retrieval and project-memory capabilities without expanding their memory
permissions.

#### Scenario: Retrieval guidance selects the right memory feature
- GIVEN rendered root or subagent guidance explains how to recover persisted
  context
- WHEN it describes semantic search, artifact lookup, chronology, or scoped
  recovery
- THEN it MUST explain when to use HyDE-assisted `mem_recall`, fused hybrid
  recall, `topic_key`, `type`, `time_from`, `time_to`, `scope`, `project`, and
  `session_id` filters
- AND it MUST explain when to fetch timeline context through
  `mem_get(include_timeline=true)`

#### Scenario: Project-memory guidance stays bounded
- GIVEN rendered guidance explains project-level memory navigation
- WHEN an agent needs graph relationships, topic discovery, topic details, or a
  recent-context view
- THEN it MUST point to bounded `mem_project(action="graph")`,
  `mem_project(action="topics")`, `mem_project(action="topic")`, and
  `mem_context(recall_query=...)`
- AND it MUST keep those tools within the root or delegated parent-scoped
  permission model

## MODIFIED Requirements
### Requirement: Enforce thoth-mem Governance Across Harnesses
The system MUST preserve thoth-mem as the memory integration and MUST distinguish
runtime-enforced governance from instruction-level governance with visible
enforcement-gap diagnostics when a harness cannot enforce tool restrictions.
Root/orchestrator guidance MAY own `mem_session(action="start")`,
`mem_session(action="checkpoint")`, `mem_session(action="summary")`,
`mem_save(kind="prompt")`, and `mem_save(kind="session_summary")` according to
workflow needs. Subagent guidance MUST require parent `session_id` and project
before using thoth-mem, MUST keep reads parent-scoped, and MUST limit writes to
explicitly delegated durable observations or deterministic SDD artifacts.

#### Scenario: Root-only memory ownership remains restricted
- GIVEN an agent or subagent prompt is rendered for any supported harness
- WHEN memory tool guidance is included
- THEN only the root orchestrator role MAY own thoth-mem session lifecycle
  actions, prompt persistence, and session-summary persistence
- AND subagents MUST be instructed not to own session start, checkpoint, or
  summary actions and not to save prompts
- AND subagents MUST be instructed not to call thoth-mem tools at all when the
  dispatch lacks either parent `session_id` or project context

#### Scenario: Read-only and write-capable subagents receive different memory permissions
- GIVEN explorer, librarian, or oracle prompts are rendered with parent memory
  context
- WHEN thoth-mem guidance is included
- THEN those read-only subagents MAY use parent-scoped `mem_recall`,
  `mem_context`, `mem_get`, and bounded `mem_project` reads
- AND they MUST NOT save memory, own sessions, or persist prompts
- GIVEN designer, quick, or deep prompts are rendered with explicit delegated
  memory-write permission
- WHEN thoth-mem guidance is included
- THEN those write-capable subagents MAY use the same parent-scoped reads plus
  `mem_save(kind="observation")` for delegated durable observations or
  deterministic SDD artifacts
- AND they MUST NOT own sessions or persist prompts

#### Scenario: Runtime enforcement is used where available
- GIVEN a supported harness exposes documented per-agent tool, permission, or MCP
  allow/deny controls
- WHEN harness-specific prompts or configs are generated
- THEN the adapter MUST configure those controls to prevent subagents from using
  root-owned memory operations and disallowed memory writes
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
- AND general durable observations MUST NOT be saved under the `sdd/` namespace
- AND it MUST NOT write root-session summaries, user prompts, or ad hoc SDD topic
  keys

### Requirement: Treat Delegation Handoff as Root-Owned Compaction
The system MUST render root/orchestrator instructions that treat subagent
delegation as a deliberate handoff-as-compaction boundary when persistent memory
is available and parent session identity is known. The handoff MUST be persisted
through `mem_session(action="summary")` or `mem_save(kind="session_summary")`
before dispatch, and subagents MUST receive recovery instructions rather than the
handoff body.

#### Scenario: Root preserves session context before delegation
- GIVEN the root/orchestrator is about to delegate memory-dependent work to a
  subagent
- AND thoth-mem summary persistence is available to the root
- AND the active parent `session_id` and project are known
- WHEN the root prepares the delegation handoff
- THEN the root MUST save or refresh a concise root-owned handoff before
  dispatching the subagent
- AND the handoff MUST describe the current goal, completed decisions, relevant
  context, unresolved questions, verification state, and next focus
- AND the root MUST pass recovery instructions for that handoff rather than the
  handoff body in the initial subagent prompt

#### Scenario: Root reports missing compaction capability
- GIVEN the root/orchestrator is about to delegate memory-dependent work to a
  subagent
- AND summary persistence or required parent identity is unavailable
- WHEN the root prepares the delegation handoff
- THEN the root MUST disclose that root-owned compaction could not be persisted
- AND it MUST continue with explicit task instructions and local context instead
  of implying memory recovery will be available
- AND it MUST NOT invent a fallback session or ask the subagent to create one

### Requirement: Provide Structured Handoff Summary and Recovery Instructions
The system MUST render root/orchestrator instructions that require the handoff
body to live in root-owned thoth-mem memory while the initial subagent prompt
carries only task instructions, parent identity, permissions, and recovery
instructions.

#### Scenario: Handoff summary includes decision-ready fields
- GIVEN the root/orchestrator delegates a bounded task
- WHEN it saves or refreshes the root-owned handoff summary
- THEN the summary MUST include the goal, current state, completed decisions,
  evidence, scope, next steps, verification expectation, uncertainty, relevant
  files or symbols, suggested skills when applicable, and next focus
- AND the delegation prompt MUST include the parent `session_id`, project,
  persistence mode, memory permissions, and the recall funnel
  `mem_recall(mode="compact")` to `mem_recall(mode="context")` to `mem_get(...)`
  whenever memory recall or SDD artifact persistence is delegated
- AND the prompt MAY allow bounded `mem_context` or `mem_project` only when the
  delegated task explicitly permits supplemental project-scoped reads

#### Scenario: Delegation prompt excludes the handoff body
- GIVEN the root/orchestrator has access to a handoff summary, a long
  conversation, sensitive values, generated prompts, or unrelated context
- WHEN it prepares the initial subagent delegation prompt
- THEN it MUST include delegated task instructions and handoff recovery
  instructions
- AND it MUST NOT include the handoff summary body in `message` or `items`
- AND it MUST NOT include raw file dumps, entire conversation transcripts,
  secrets, credentials, irrelevant details, or generated subagent prompts as
  memory source material

### Requirement: Require Parent-Scoped Subagent Recall
The system MUST render subagent instructions that allow thoth-mem recall only
under the parent session and project supplied by the root/orchestrator, using the
recall funnel before memory content is treated as source material.

#### Scenario: Subagent recovers context through recall funnel
- GIVEN a subagent receives task instructions with parent `session_id`, project,
  memory permissions, and handoff recovery instructions
- WHEN it needs persisted context for the assigned task
- THEN it MUST use bounded recall with `mem_recall(mode="compact")`, then
  `mem_recall(mode="context")`, then `mem_get(...)` to recover the handoff or
  assigned SDD artifact before treating memory content as source material
- AND it MUST keep recall scoped to the delegated topic, project, parent session,
  and task
- AND it MUST report when recalled context is missing, stale, contradictory, or
  insufficient

#### Scenario: Subagent does not use memory without parent identity
- GIVEN a subagent receives task instructions without both parent `session_id`
  and project
- WHEN it evaluates whether to use thoth-mem
- THEN it MUST NOT call thoth-mem tools
- AND it MUST rely on explicit task instructions and local evidence only
- AND it MUST report the missing parent identity as a memory-governance
  limitation when relevant to the task outcome

### Requirement: Preserve Memory Governance Boundaries During Handoff
The system MUST keep root-session ownership, subagent memory permissions, SDD
artifact topic keys, and prompt-saving prohibitions intact when handoff guidance
is rendered for any supported harness.

#### Scenario: Root-owned session and prompt persistence remain prohibited to subagents
- GIVEN a subagent receives a delegated task with memory permissions and handoff
  recovery instructions
- WHEN the rendered prompt describes allowed thoth-mem behavior
- THEN it MUST prohibit the subagent from owning `mem_session` lifecycle actions
- AND it MUST prohibit the subagent from saving prompts or generated subagent
  prompts as user intent
- AND it MUST state that harnesses unable to hard-enforce this split still treat
  the boundary as instruction-level governance

#### Scenario: SDD artifact saves remain deterministic and delegated
- GIVEN a write-capable subagent is assigned an SDD artifact task in a mode that
  includes thoth-mem
- WHEN the rendered prompt permits memory writes
- THEN it MUST permit `mem_save(kind="observation")` only for the assigned
  durable observation or deterministic SDD artifact
- AND SDD artifact saves MUST use `sdd/{change}/{artifact}` topic keys
- AND general durable observations MUST NOT be saved under the `sdd/` namespace
- AND project-scoped read tools MUST be used only when explicitly allowed by the
  delegated task instructions

## REMOVED Requirements
