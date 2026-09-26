# Delta for Multi-Harness Agent Pack

## ADDED Requirements
### Requirement: Treat Delegation Handoff as Root-Owned Compaction
The system MUST render root/orchestrator instructions that treat subagent
delegation as a deliberate handoff-as-compaction boundary when persistent memory
is available and parent session identity is known.

#### Scenario: Root preserves session context before delegation
- GIVEN the root/orchestrator is about to delegate work to a subagent
- AND thoth-mem session-summary tooling is available to the root
- AND the active parent `session_id` and project are known
- WHEN the root prepares the delegation handoff
- THEN the root MUST save or refresh a concise root-owned session summary before
  dispatching the subagent
- AND the summary MUST describe the current goal, completed decisions, relevant
  context, unresolved questions, verification state, and next focus
- AND the root MUST pass recovery instructions for that summary rather than the
  summary body in the initial subagent prompt
- AND the root MUST NOT ask the subagent to call `mem_session_summary`,
  `mem_session_start`, or `mem_save_prompt`

#### Scenario: Root reports missing compaction capability
- GIVEN the root/orchestrator is about to delegate work to a subagent
- AND session-summary tooling or required parent identity is unavailable
- WHEN the root prepares the delegation handoff
- THEN the root MUST disclose that root-owned compaction could not be persisted
- AND it MUST continue with explicit task instructions and local context instead
  of implying memory recovery will be available
- AND it MUST NOT invent a fallback session or ask the subagent to create one

### Requirement: Provide Structured Handoff Summary and Recovery Instructions
The system MUST render root/orchestrator instructions that require the handoff
body to live in a root-owned thoth-mem session summary while the initial
subagent prompt carries only the task instructions and recovery instructions.

#### Scenario: Handoff summary includes decision-ready fields
- GIVEN the root/orchestrator delegates a bounded task
- WHEN it saves or refreshes the root-owned handoff summary
- THEN the summary MUST include the goal, current state, completed decisions,
  evidence, scope, next steps, verification expectation, uncertainty, relevant
  files or symbols, suggested skills when applicable, and next focus
- AND the delegation prompt MUST include the parent `session_id`, project,
  persistence mode, memory permissions, and 3-layer recall instructions whenever
  memory recall or SDD artifact persistence is delegated
- AND the task instructions or retrieved summary MUST keep non-goals and
  escalation conditions explicit enough that the subagent does not guess through
  architecture tradeoffs

#### Scenario: Delegation prompt excludes the handoff body
- GIVEN the root/orchestrator has access to a long conversation, sensitive
  values, generated prompts, or unrelated context
- WHEN it prepares the initial subagent delegation prompt
- THEN it MUST include the delegated task instructions and handoff recovery
  instructions
- AND it MUST NOT include the handoff summary body in `message` or `items`
- AND it MUST NOT include raw file dumps, entire conversation transcripts,
  secrets, credentials, irrelevant details, or generated subagent prompts as
  memory source material

### Requirement: Require Parent-Scoped Subagent Recall
The system MUST render subagent instructions that allow thoth-mem recall only
under the parent session and project supplied by the root/orchestrator.

#### Scenario: Subagent recovers context through 3-layer recall
- GIVEN a subagent receives task instructions with parent `session_id`, project,
  memory permissions, and handoff recovery instructions
- WHEN it needs persisted context for the assigned task
- THEN it MUST use bounded 3-layer recall with `mem_search`, `mem_timeline`, and
  `mem_get_observation` to recover the handoff summary before treating memory
  content as source material
- AND it MUST keep recall scoped to the delegated topic, project, and task
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

### Requirement: Deliver Handoffs Through Harness-Specific Binding Surfaces
The system MUST preserve the same handoff semantics across supported harnesses
while describing each harness delivery surface accurately.

#### Scenario: OpenCode handoff uses shared prompt behavior
- GIVEN OpenCode prompts or task delegation instructions are rendered
- WHEN handoff-as-compaction guidance is included
- THEN OpenCode output MUST inherit the shared root, subagent, thoth-mem, and
  SDD governance semantics
- AND it MUST describe OpenCode delegation in OpenCode-appropriate terms without
  adding Codex-only tool names as required OpenCode behavior
- AND it MUST preserve the existing role roster and read-only versus
  write-capable specialist split

#### Scenario: Codex handoff uses spawn message recovery semantics
- GIVEN Codex root instructions are rendered
- WHEN they explain how to delegate to a role subagent
- THEN they MUST say that `multi_agent_v1.spawn_agent` `message` carries the
  delegated task instructions plus handoff retrieval instructions
- AND they MUST say the handoff body MUST NOT be included in `message` or
  `items`
- AND they MUST say not to pass both `message` and `items` for the same handoff
- AND they MUST reserve `items` for structured attachments or mentions that are
  truly required
- AND they MUST disclose instruction-level memory and permission enforcement
  gaps when Codex cannot hard-enforce a boundary

### Requirement: Preserve Memory Governance Boundaries During Handoff
The system MUST keep root-session ownership, subagent memory permissions, SDD
artifact topic keys, and prompt-saving prohibitions intact when handoff guidance
is rendered for any supported harness.

#### Scenario: Root-owned session tools remain prohibited to subagents
- GIVEN a subagent receives a delegated task with memory permissions and
  handoff recovery instructions
- WHEN the rendered prompt describes allowed thoth-mem behavior
- THEN it MUST prohibit the subagent from calling `mem_session_start`,
  `mem_session_summary`, and `mem_save_prompt`
- AND it MUST prohibit saving generated subagent prompts as user intent
- AND it MUST state that harnesses unable to hard-enforce this split still treat
  the boundary as instruction-level governance

#### Scenario: SDD artifact saves remain deterministic and delegated
- GIVEN a write-capable subagent is assigned an SDD artifact task in a mode that
  includes thoth-mem
- WHEN the rendered prompt permits memory writes
- THEN it MUST permit `mem_save` only for the assigned durable observation or
  deterministic SDD artifact
- AND SDD artifact saves MUST use `sdd/{change}/{artifact}` topic keys
- AND general durable observations MUST NOT be saved under the `sdd/` namespace
- AND project-scoped read tools MUST be used only when explicitly allowed by the
  delegated task instructions

## MODIFIED Requirements

## REMOVED Requirements
