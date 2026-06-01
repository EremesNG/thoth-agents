# Design: Align thoth-mem Tool Surface Guidance

## Technical Approach

Align the rendered guidance contract at the source strings that feed OpenCode
prompts, Codex prompts, hook-injected protocol text, docs, and tests. The
implementation should not add runtime policy behavior beyond one required hook
surface alignment: the compaction follow-up detector must recognize
`mem_session` calls with `action="summary"` instead of a separate summary tool
name.

The supported callable MCP vocabulary is exactly `mem_save`, `mem_recall`,
`mem_context`, `mem_get`, `mem_project`, and `mem_session`. Action, kind, mode,
filter, graph, timeline, and pagination details are modeled as parameters or
operation descriptors, not as separate tool identifiers.

Replacement wording must be present-tense and direct. Shipped prompts/docs
should describe the expected workflow without meta commentary.

## Architecture Decisions

### Decision: Model governance by tool plus operation parameters

**Choice**: Keep `MemoryToolName` as the six callable MCP tools and add typed
operation descriptors for root-owned and recall-chain semantics.

```ts
export type MemoryToolName =
  | 'mem_save'
  | 'mem_recall'
  | 'mem_context'
  | 'mem_get'
  | 'mem_project'
  | 'mem_session';

export type MemSaveKind =
  | 'observation'
  | 'prompt'
  | 'session_summary'
  | 'passive_learnings';
export type MemSessionAction = 'start' | 'checkpoint' | 'summary';
export type MemRecallMode = 'compact' | 'context';
export type MemProjectAction = 'list' | 'summary' | 'graph' | 'topics' | 'topic';

export type MemoryOperation =
  | { tool: 'mem_session'; action: MemSessionAction }
  | { tool: 'mem_save'; kind: MemSaveKind }
  | { tool: 'mem_recall'; mode: MemRecallMode }
  | { tool: 'mem_get'; includeTimeline?: boolean }
  | { tool: 'mem_context'; recallQuery?: boolean }
  | { tool: 'mem_project'; action: MemProjectAction };

export type RootOwnedMemoryOperation =
  | { tool: 'mem_session'; action: MemSessionAction }
  | { tool: 'mem_save'; kind: 'prompt' | 'session_summary' };
```

Constants should become:

```ts
const ROOT_OWNED_OPERATIONS: RootOwnedMemoryOperation[] = [
  { tool: 'mem_session', action: 'start' },
  { tool: 'mem_session', action: 'checkpoint' },
  { tool: 'mem_session', action: 'summary' },
  { tool: 'mem_save', kind: 'prompt' },
  { tool: 'mem_save', kind: 'session_summary' },
];

const READ_RECALL_CHAIN: MemoryOperation[] = [
  { tool: 'mem_recall', mode: 'compact' },
  { tool: 'mem_recall', mode: 'context' },
  { tool: 'mem_get' },
];

const PARENT_SCOPED_READ_TOOLS: MemoryToolName[] = [
  'mem_recall',
  'mem_context',
  'mem_get',
  'mem_project',
];

const WRITE_CAPABLE_DELEGATED_TOOLS: MemoryToolName[] = [
  ...PARENT_SCOPED_READ_TOOLS,
  'mem_save',
];

const ALL_MEMORY_TOOLS: MemoryToolName[] = [
  'mem_save',
  'mem_recall',
  'mem_context',
  'mem_get',
  'mem_project',
  'mem_session',
];
```

`RoleMemoryGovernance` and `MemoryGovernanceContract` should expose operation
semantics separately from callable tool names:

```ts
export interface RoleMemoryGovernance {
  role: AgentRoleName;
  rootOwnedOperations: RootOwnedMemoryOperation[];
  allowedTools: MemoryToolName[];
  forbiddenTools: MemoryToolName[];
  requiresParentContext: boolean;
  mayReadProjectMemory: boolean;
  mayWriteDurableObservations: boolean;
  protectsSddNamespace: boolean;
  rules: string[];
}

export interface MemoryGovernanceContract {
  rootOwnedOperations: RootOwnedMemoryOperation[];
  readRecallChain: MemoryOperation[];
  writeCapableDelegatedTools: MemoryToolName[];
  protectedTopicNamespaces: string[];
  roles: RoleMemoryGovernance[];
}
```

**Alternatives considered**: Keeping standalone operation-like names in
`MemoryToolName`; keeping `rootOwnedTools` as a six-tool list with explanatory
comments only.

**Rationale**: `mem_save` and `mem_session` are not wholly root-owned; ownership
depends on `kind` or `action`. Modeling parameterized operations avoids
over-forbidding delegated `mem_save(kind="observation")` while still making
root-owned prompt/session-summary behavior testable.

### Decision: Root handoff body lives in memory; delegated prompts carry recovery only

**Choice**: Root guidance says `mem_session(action="start")` is step 0 before
any other thoth-mem call. Before memory-dependent dispatch, the root saves the
handoff with `mem_session(action="summary")` or
`mem_save(kind="session_summary")`. Delegated prompts carry parent
`session_id`, project, persistence mode, permissions, and recovery instructions
only.

**Alternatives considered**: Paste compact handoff bodies into delegated
prompts; ask subagents to create their own session state.

**Rationale**: The spec requires root-owned lifecycle and prompt persistence.
Keeping the body in memory prevents raw-context leakage and keeps subagents
bounded to parent-scoped recovery.

### Decision: Capability guidance is concise and permission-scoped

**Choice**: Add short decision guidance wherever recovery is described:
HyDE/fused recall for semantic or ambiguous search; `topic_key`, `type`,
`time_from`, `time_to`, `scope`, `project`, and `session_id` filters for
narrowing; `mem_get(include_timeline=true)` for chronology;
`mem_context(recall_query=...)` for fused recent context; and bounded
`mem_project(action="graph"|"topics"|"topic")` for relationship and topic
navigation.

**Alternatives considered**: Keep only the recall funnel; add a long tool manual
to every prompt.

**Rationale**: The goal is better use of thoth-mem without expanding memory
permissions or bloating prompts.

## Data Flow

1. Root session starts and, when identity/tools are available, calls
   `mem_session(action="start")` before any other thoth-mem operation.
2. Root saves real user intent with `mem_save(kind="prompt")` and owns later
   `mem_session(action="checkpoint"|"summary")` or
   `mem_save(kind="session_summary")` continuity writes.
3. Before memory-dependent delegation, root persists the handoff body and sends
   only recovery instructions plus parent identity and permissions.
4. Subagents recover through `mem_recall(mode="compact")` ->
   `mem_recall(mode="context")` -> `mem_get(...)`, optionally adding bounded
   `mem_context(recall_query=...)` or `mem_project(...)` only when the dispatch
   allows supplemental project-scoped reads.
5. Write-capable subagents may use `mem_save(kind="observation")` only for
   explicit durable observations or deterministic SDD artifacts under the
   parent session/project.

## File Changes

### `src/agents/prompt-sections.ts`

- `<session-bootstrap>` anchor around lines 285-287 currently names separate
  session-start and prompt-save operations. Replace with wording that says:
  "At the start of a new root session, when thoth-mem tools and
  session/project identity are available, load `thoth-mem-agents` and
  `requirements-interview`, then call `mem_session(action="start")` as step 0
  before any other thoth-mem call. Save only the real user request with
  `mem_save(kind="prompt")`; never save generated sub-agent prompts, handoffs,
  summaries, or tool scaffolding as user intent. If tools or identity are
  unavailable, disclose that memory bootstrap could not run and continue
  without claiming memory was saved."
- `<internal-handoff>` anchor around line 323 currently saves the handoff with a
  root-owned standalone summary name. Replace with:
  "When thoth-mem summary persistence and parent session/project identity are
  available, save or refresh that handoff body with root-owned
  `mem_session(action="summary")` or `mem_save(kind="session_summary")` before
  dispatch. If tooling or identity is unavailable, disclose that root-owned
  compaction could not be persisted and continue with explicit task
  instructions and local context; do not invent a fallback session or ask a
  sub-agent to create one."
- `<progress-memory>` anchor around lines 385-388 currently describes the
  recall protocol and session close with non-parameterized names. Replace the
  recall line with:
  "Targeted recall funnel: `mem_recall(mode="compact")` ->
  `mem_recall(mode="context")` -> `mem_get(...)` only for records needed in
  full; use `mem_get(include_timeline=true)` when chronology matters."
  Replace close/compaction lines with `mem_session(action="summary")` or
  root-owned `mem_save(kind="session_summary")`, and add one concise line for
  filters, HyDE/fused recall, `mem_context(recall_query=...)`, and bounded
  `mem_project(action="graph"|"topics"|"topic")`.
- `renderSubagentRules()` readonly block around lines 583-593 should allow only
  parent-scoped reads: `mem_recall`, `mem_context`, `mem_get`, and bounded
  `mem_project`; prohibit `mem_save`, `mem_session(...)`, and prompt
  persistence. It should require the recall funnel before treating memory as
  source material, report stale/missing/contradictory/insufficient recall, and
  state supplemental `mem_context(recall_query=...)`/`mem_project(...)` does not
  replace the funnel.
- `renderSubagentRules()` writable block around lines 598-612 should list only
  the six tools and clarify: reads use the same funnel, bounded project reads
  require explicit dispatch permission, `mem_save(kind="observation")` is only
  for delegated durable observations or deterministic SDD artifacts, subagents
  never own `mem_session` lifecycle actions, and generated prompts are never
  saved as user intent.

### `src/harness/core/memory-governance.ts`

- Replace the `MemoryToolName` union at lines 5-17 with the six-tool union and
  add the operation descriptor types from the architecture decision.
- Replace `ROOT_OWNED_TOOLS` with `ROOT_OWNED_OPERATIONS`; replace
  `READ_RECALL_CHAIN` with parameterized `MemoryOperation` entries for compact
  recall, context recall, and full fetch; replace bounded context constants
  with `PARENT_SCOPED_READ_TOOLS` using `mem_context` and `mem_project`.
- `roleAllowedTools()` should return all six tools for orchestrator;
  `mem_recall`, `mem_context`, `mem_get`, and `mem_project` for read-only
  roles; and those plus `mem_save` for write-capable roles. Subagent
  `forbiddenTools` should include `mem_session`; read-only subagents should also
  forbid `mem_save`.
- `roleRules()` should render operation-aware prose. Root rules name
  `mem_session(action="start"|"checkpoint"|"summary")`,
  `mem_save(kind="prompt")`, and `mem_save(kind="session_summary")`. Subagent
  rules name the `mem_recall` -> `mem_recall` -> `mem_get` funnel,
  parent-scoped supplemental `mem_context(recall_query=...)` and
  `mem_project(action="graph"|"topics"|"topic")`, and role-specific write
  permissions.
- Diagnostics can keep current enforcement-gap codes and messages, but wording
  should refer to root-owned memory operations and delegated write limits rather
  than root-only tool names.

### `src/hooks/thoth-mem/protocol.ts`

- `FIRST_ACTION_INSTRUCTION`, `SESSION_SUMMARY_TEMPLATE`,
  `buildCompactionReminder()`, and `buildCompactorInstruction()` should use
  `mem_session(action="summary")` for compaction continuity and mention
  `mem_context(recall_query=...)` plus the `mem_recall` compact/context ->
  `mem_get(...)` funnel.
- `buildMemoryInstructions()` should render `### CORE TOOLS` as the six-tool
  list only. The protocol should state the current session/project are passed to
  tools that accept them, root owns `mem_session(action="start"|"checkpoint"|"summary")`
  and `mem_save(kind="prompt"|"session_summary")`, and subagent handoff prompts
  carry parent identity and recovery instructions only.
- Save guidance should use `mem_save` with the supported `kind` values and
  structured observation content. Topic-key choice should be described as using
  a stable `topic_key` directly rather than a separate suggestion tool.
- Search guidance should be renamed to the recall funnel and should describe
  `mem_recall(mode="compact")`, `mem_recall(mode="context")`, `mem_get(...)`,
  HyDE/fused recall, filters, timeline inclusion, `mem_context(recall_query=...)`,
  and bounded `mem_project(...)` navigation.

### `src/hooks/thoth-mem/index.ts`

- Update `isSessionSummaryTool()` to recognize `mem_session` and MCP-prefixed
  variants of `mem_session`. It should inspect `input.args` and return true
  only when the call carries `action: "summary"`; if args are unavailable or not
  an object, keep the compaction follow-up flag in place.
- `tool.execute.after` should pass `input.args` to this detector. The mem-save
  detector can continue tracking `mem_save` because that callable name remains
  supported.

### `src/harness/adapters/codex.ts`

- `codexInternalHandoffGuidance()` lines 270-284 already preserves handoff-body
  exclusion and Codex enforcement-gap diagnostics. Add one sentence requiring
  the message to include parent `session_id`, project, permissions, and the
  `mem_recall(mode="compact")` -> `mem_recall(mode="context")` -> `mem_get(...)`
  recovery funnel when memory recovery is delegated.
- `renderCodexRootInstructions()` runtime block around lines 330-332 should say
  the ambient Codex root calls `mem_session(action="start")` as step 0, then
  saves the real user prompt with `mem_save(kind="prompt")`. Pre-delegation
  compaction should use `mem_session(action="summary")` or
  `mem_save(kind="session_summary")`. Preserve the existing instruction-level
  enforcement caveat where Codex runtime controls are absent.

### `src/skills/**`

- Confirmed current skill guidance uses the six-tool surface in the audited
  `src/skills` files.
- Tighten generic phrasing only where helpful:
  - `src/skills/plan-reviewer/SKILL.md`: replace "3-layer recall" mentions
    with "recall funnel (`mem_recall(mode="compact")` ->
    `mem_recall(mode="context")` -> `mem_get(...)`)".
  - `src/skills/executing-plans/SKILL.md`: keep the existing exact funnel;
    optionally add "use `mem_get(include_timeline=true)` when task chronology
    matters" under load/recovery.
  - `src/skills/_shared/persistence-contract.md` and
    `src/skills/_shared/thoth-mem-convention.md`: keep the existing funnel and
    add concise capability guidance for HyDE/fused recall, filters,
    `mem_context(recall_query=...)`, and bounded `mem_project` graph/topics/topic
    navigation.

### `docs/sdd-pipeline.md`

- Replace the Thoth Topic Keys recall list around lines 296-300 with:
  1. `mem_recall(mode="compact")` — scan candidate IDs and titles with focused
     topic-key/query filters.
  2. `mem_recall(mode="context")` — expand the strongest hits into retrieved
     context.
  3. `mem_get(id=..., include_timeline=true)` — fetch full content and timeline
     context when chronology matters.
- Add one sentence: use HyDE/fused recall for semantic or ambiguous searches;
  narrow with `topic_key`, `type`, `time_from`, `time_to`, `scope`, `project`,
  and `session_id`; use bounded `mem_context(recall_query=...)` or
  `mem_project(action="graph"|"topics"|"topic")` for supplemental project
  context.

### `docs/quick-reference.md`

- Replace the Artifact Store Policy recall list around lines 219-223 with the
  same three-step funnel and capability sentence used in `docs/sdd-pipeline.md`,
  shortened for quick reference.

### `README.md`

- Align any user-facing thoth-mem retrieval wording to the same recall funnel
  (`mem_recall(mode="compact")` -> `mem_recall(mode="context")` -> `mem_get(...)`)
  and the concise capability guidance: HyDE/fused recall, `topic_key`/`type`/
  `time_from`/`time_to`/`scope` filters, `mem_context(recall_query=...)`, and
  bounded `mem_project(action="graph"|"topics"|"topic")` navigation.

## Interfaces / Contracts

- Public prompt-rendering output changes to parameterized six-tool thoth-mem
  guidance. Tests should assert key strings rather than exact paragraphs.
- `MemoryToolName` becomes a six-tool callable vocabulary. Tests that require
  root ownership should assert `rootOwnedOperations`, not standalone tool-name
  entries.
- `readRecallChain` becomes a `MemoryOperation[]` with compact recall, context
  recall, and full fetch entries.
- Hook compaction follow-up clearing depends on `tool === mem_session` and
  `args.action === "summary"`; prefix-normalization should continue to support
  MCP wrapper names such as `mcp_thoth_mem_mem_session`.

## Testing Strategy

Update implementation and tests in the same change.

- `src/agents/index.test.ts`: replace `mem_save_prompt` assertions with
  `mem_save(kind="prompt")`; replace recall assertions with
  `mem_recall(mode="compact")`, `mem_recall(mode="context")`, and `mem_get`;
  replace project context tool assertions with `mem_project`; replace subagent
  prohibitions with "never own `mem_session` lifecycle actions" and "never save
  prompts". Keep SDD namespace and generated-prompt prohibitions.
- `src/agents/prompt-rendering.test.ts`: update orchestrator bootstrap, root
  memory ownership, handoff, subagent recall, and Codex dialect assertions to
  the parameterized six-tool vocabulary. Update prompt length ceilings only if
  concise capability guidance increases rendered size.
- `src/harness/core/memory-governance.test.ts`: assert `MemoryToolName` outputs
  only the six names; assert `rootOwnedOperations` equals the five operation
  descriptors; assert `readRecallChain` equals compact recall, context recall,
  and full fetch; assert role `allowedTools`/`forbiddenTools` at callable-tool
  granularity and root/subagent rules at operation granularity.
- `src/harness/adapters/codex.test.ts`: update subagent governance assertions to
  the six-tool vocabulary; update root runtime assertions to
  `mem_session(action="start")`, `mem_save(kind="prompt")`, and
  `mem_session(action="summary")`/`mem_save(kind="session_summary")`; preserve
  enforcement-gap diagnostic assertions.
- `src/hooks/thoth-mem/index.test.ts`: rename the compaction follow-up test to
  `mem_session action="summary"`; call `runToolExecuteAfter()` with
  `mcp_thoth_mem_mem_session` and `{ action: 'summary' }`; add or update a
  negative assertion that `mem_session` with a non-summary action does not clear
  the reminder. Update protocol text assertions to six tools, `mem_save` kinds,
  recall funnel, filters, timeline, `mem_context(recall_query=...)`, and
  `mem_project`.
- `src/cli/custom-skills.test.ts`: existing thoth-mem skill assertions already
  use supported vocabulary; add HyDE/filter/`mem_project` capability anchors only
  if the skill text is tightened there.
- `src/harness/writers/skill-layout.test.ts`: existing skill layout anchors are
  aligned; update/add anchors if shared skill files gain capability guidance.

Verification commands:

1. `pnpm run typecheck`
2. `pnpm run lint`
3. `pnpm vitest run src/agents/index.test.ts src/agents/prompt-rendering.test.ts src/harness/core/memory-governance.test.ts src/harness/adapters/codex.test.ts src/hooks/thoth-mem/index.test.ts src/cli/custom-skills.test.ts src/harness/writers/skill-layout.test.ts`
4. `pnpm test`
5. Unsupported callable-name check for active source/docs surfaces:
   `rg -n "\\b(mem_search|mem_timeline|mem_get_observation|mem_session_start|mem_session_summary|mem_save_prompt|mem_capture_passive|mem_project_summary|mem_project_graph|mem_topic_keys|mem_suggest_topic_key|mem_update)\\b" src docs README.md`
   Expected: no matches.

## Sequencing / Dependencies

1. Update `memory-governance.ts` types/constants/rules first because Codex and
   governance tests consume that contract.
2. Update prompt strings in `prompt-sections.ts` and Codex runtime guidance.
3. Update hook protocol text plus the `mem_session(action="summary")` detector
   in `src/hooks/thoth-mem/index.ts`.
4. Tighten skill/docs text.
5. Update all string assertions and operation-shape assertions together.
6. Run the verification sequence and the unsupported callable-name check last.

## Rollout

This change is safe to ship as a coordinated prompt/governance/docs/test update.
There is no thoth-mem API or storage change in this repository. The only runtime
behavior adjustment is the hook detector recognizing the supported `mem_session`
summary call shape for compaction follow-up state.

## Open Questions

- Whether prompt length ceilings need small increases after adding capability
  guidance. Mitigation: keep replacements concise, then adjust only failing
  prompt budget expectations with evidence.
- Whether hook `tool.execute.after` always receives parsed MCP args. Mitigation:
  make summary detection conservative; only clear follow-up when
  `action === "summary"` is visible.
