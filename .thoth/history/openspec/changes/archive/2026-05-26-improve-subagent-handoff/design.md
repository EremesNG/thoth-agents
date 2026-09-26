# Design: Improve Subagent Handoff

## Technical Approach

Implement handoff-as-compaction as prompt and governance wording, not as a new
runtime API. The existing architecture already centralizes shared role prompts
in `src/agents/prompt-sections.ts`, then lets harness adapters render those
sections through dialect-specific vocabulary. The change should extend that
source of truth so both OpenCode and Codex inherit the same semantic contract:
the root/orchestrator owns session compaction, saves or refreshes the handoff
body as a root-owned thoth-mem session summary, and delegates only bounded
memory recall or deterministic SDD artifact writes to subagents.

Codex needs one adapter-specific addition because its dispatch surface is
explicit: `multi_agent_v1.spawn_agent` receives task instructions plus handoff
retrieval instructions in `message`, while the handoff body stays out of both
`message` and `items`. `items` is reserved for truly required structured
attachments or mentions.
OpenCode should continue to rely on shared prompt sections and the existing
thin `opencodeAdapter`, avoiding Codex-only tool names in OpenCode output.

The implementation should keep memory governance as a layered contract:

- shared prompt rules in `src/agents/prompt-sections.ts` for day-to-day root and
  subagent behavior
- role-by-role governance text and diagnostics in
  `src/harness/core/memory-governance.ts`
- durable skill documentation in `src/skills/thoth-mem-agents/` and
  `src/skills/_shared/`
- Codex-only delivery instructions in `src/harness/adapters/codex.ts`

No thoth-mem tool, SDD artifact path, role roster, or delegation API changes
are required.

## Architecture Decisions

### Decision: Treat handoff as prompt-level compaction
**Choice**: Model delegation as a root-owned context-compaction boundary in
rendered instructions and skills, while keeping runtime APIs unchanged.

**Alternatives considered**: Add new handoff data structures, new thoth-mem
operations, or harness-specific dispatch wrappers.

**Rationale**: The spec is about rendered governance and delivery semantics.
`prompt-sections.ts` already emits the root `<internal-handoff>`, `<dispatch>`,
`<progress-memory>`, and subagent memory sections. Extending those instructions
preserves the existing architecture and avoids coupling the change to one
harness implementation.

### Decision: Keep root compaction ownership separate from subagent recall
**Choice**: Root prompts should say the root saves or refreshes a concise
session summary before delegation when tools and parent identity are available.
Subagent prompts should only permit memory recall when both parent
`session_id` and project are present and should prohibit session tools and
prompt saves.

**Alternatives considered**: Allow subagents to summarize sessions after
finishing work, or let subagents create fallback memory sessions when parent
identity is missing.

**Rationale**: Existing governance already treats `mem_session_start`,
`mem_session_summary`, and `mem_save_prompt` as root-owned. The design preserves
that boundary and prevents implicit `manual-save-{project}` session splits or
subagent prompt pollution.

### Decision: Store structured handoff fields in thoth-mem, not the prompt body
**Choice**: Expand the root-owned handoff summary contract to include goal,
current state, completed decisions, evidence, scope, next steps, verification
expectation, uncertainty, relevant files or symbols, suggested skills when
applicable, non-goals, and escalation conditions. The initial subagent prompt
includes the delegated task instructions, parent identity, persistence mode,
memory permissions, and recovery instructions, but not the handoff body.

**Alternatives considered**: Put a free-form handoff paragraph in the delegation
prompt, embed summary content directly in `message`, or fork the full
conversation context by default.

**Rationale**: The current prompt already names `Goal`, `Decision`, `Evidence`,
`Scope`, `Steps`, `Verification`, and `Uncertainty`. The corrected contract
keeps that body in thoth-mem as recoverable parent-session context, so the
implementation should extend the existing fields while explicitly requiring the
initial prompt to exclude the handoff body, secrets, credentials, generated
prompts, and unrelated context.

### Decision: Keep harness-neutral semantics in shared files and Codex mechanics in the Codex adapter
**Choice**: Put shared behavioral requirements in `prompt-sections.ts` and
shared skills. Put `multi_agent_v1.spawn_agent`, `message`, `items`, and
`fork_context` wording only in `src/harness/adapters/codex.ts`.

**Alternatives considered**: Add Codex terminology to shared prompt sections or
special-case OpenCode in the prompt renderer.

**Rationale**: OpenCode output is generated from the shared prompt sections via
`getAgentConfigs`, while Codex root instructions append
`codexInternalHandoffGuidance()`. Keeping delivery mechanics in the adapter
prevents OpenCode prompt regressions and satisfies the Codex scenario directly.

### Decision: Strengthen governance diagnostics only if wording gaps remain
**Choice**: Update `src/harness/core/memory-governance.ts` only where its
contract text or diagnostic messages need to mention parent-scoped handoff
recall, deterministic SDD writes, project-scoped read-tool permissions, or
instruction-level enforcement gaps more precisely.

**Alternatives considered**: Leave governance code untouched and rely only on
prompt text, or add new capability fields.

**Rationale**: The current contract already models root-owned tools,
read-recall chain, delegated writable tools, and `sdd/*` protection. Changes
should be textual and test-backed unless implementation discovery proves a
missing contract field is necessary.

## Data Flow

1. Root session starts with root-owned bootstrap according to
   `thoth-mem-agents`: load required skills, call `mem_session_start`, and save
   only the real user prompt with `mem_save_prompt` when identity and tools are
   available.
2. Before delegation, root performs bounded evidence gathering or uses prior
   agent findings, then saves or refreshes a concise `mem_session_summary` when
   root-owned compaction is available.
3. Root treats that session summary as the handoff body. It builds the initial
   subagent prompt with delegated task instructions, parent `session_id`,
   project, persistence mode, memory permissions, and explicit recovery
   instructions only when memory recall or SDD persistence is delegated.
4. Root dispatches:
   - OpenCode: through the existing shared task/delegation wording inherited
     from role prompts.
   - Codex: through `multi_agent_v1.spawn_agent` with task instructions plus
     handoff retrieval instructions in `message`; the handoff body is not
     included in `message` or `items`, and `items` is used only for required
     structured attachments or mentions.
5. Subagent treats the delegated task instructions as its assignment, recovers
   the handoff summary only when permitted, validates nearby code for its
   assigned scope, and does not redo broad discovery unless evidence contradicts
   the recovered context.
6. If authorized and both parent identifiers are present, subagent uses bounded
   3-layer recall: `mem_search` -> `mem_timeline` -> `mem_get_observation`.
   It reports missing, stale, contradictory, or insufficient recalled context.
7. If write-capable and explicitly assigned an SDD artifact or durable
   observation, subagent may call `mem_save` under the parent session/project
   only. Deterministic SDD artifacts use `sdd/{change}/{artifact}` topic keys;
   general observations stay outside `sdd/*`.
8. Subagent returns concise evidence, files, verification, and blockers. Root
   owns progress, final synthesis, later state checkpoints, and session summary.

## File Changes

- `src/agents/prompt-sections.ts`
  - Extend `<internal-handoff>` guidance to say the handoff body is saved or
    refreshed in root-owned thoth-mem session summary context, while the
    delegation prompt carries task instructions, parent identity, persistence
    mode, memory permissions, recovery instructions, non-goals, escalation
    conditions, and redaction requirements.
  - Extend `<dispatch>` or adjacent root guidance to say root-owned compaction
    should be persisted before delegation when tools and parent identity are
    available, and missing capability must be disclosed.
  - Strengthen `renderSubagentRules()` for read-only and writable agents so
    parent-scoped 3-layer recall, missing-parent prohibition, stale/contradictory
    recall reporting, prompt-save prohibition, project-scoped read-tool limits,
    and deterministic SDD `mem_save` wording are explicit.

- `src/harness/adapters/codex.ts`
  - Refine `codexInternalHandoffGuidance()` to say
    `multi_agent_v1.spawn_agent` `message` contains the delegated task
    instructions plus handoff retrieval instructions, not the handoff body.
  - Add or update assertions that the handoff body is absent from both
    `message` and `items`.
  - Keep the existing "do not pass both `message` and `items`" rule and clarify
    that `items` is only for required structured attachments or mentions.
  - Keep `fork_context` omitted or false by default and state that memory and
    permission boundaries are instruction-level unless the active runtime
    documents stronger enforcement.

- `src/harness/adapters/opencode.ts`
  - No functional change expected. Tests should confirm OpenCode continues to
    inherit shared handoff and governance semantics without Codex-only tool
    names.

- `src/harness/core/memory-governance.ts`
  - Likely text-only updates to role rules and diagnostics if prompt tests show
    governance gaps. Preserve the existing role matrix and capability model.

- `src/skills/thoth-mem-agents/SKILL.md`
  - Add a "handoff-as-compaction" section explaining root-owned summary refresh,
    recovery instructions instead of prompt-embedded handoff content,
    parent-scoped recall, prompt-save prohibition, and instruction-level
    enforcement reporting.
  - Keep session tools root-only and project-scoped read tools explicitly
    delegated.

- `src/skills/_shared/persistence-contract.md`
  - Clarify that hybrid SDD handoffs recover artifacts through 3-layer recall
    first and that subagents may save deterministic SDD artifacts only when the
    phase explicitly delegates that write.

- `src/skills/_shared/thoth-mem-convention.md`
  - Clarify parent `session_id`/project requirements for delegated recall and
    SDD artifact saves.

- `src/skills/_shared/openspec-convention.md`
  - No behavioral change expected. Touch only if wording is needed to cross-link
    handoff/compaction with canonical artifact recovery.

- Tests:
  - `src/agents/prompt-rendering.test.ts`
  - `src/agents/index.test.ts`
  - `src/harness/adapters/codex.test.ts`
  - `src/harness/adapters/opencode.test.ts`
  - `src/harness/core/memory-governance.test.ts`
  - `src/harness/writers/skill-layout.test.ts` or install/rendering tests only
    if packaged skill output assertions lock the changed skill text

## Interfaces / Contracts

- Root/orchestrator prompt contract:
  - MUST treat delegation as a handoff-as-compaction boundary when persistent
    memory and parent identity are available.
  - MUST save or refresh root-owned summary context before delegation when
    `mem_session_summary` is available.
  - MUST disclose missing session-summary tooling or parent identity instead of
    implying recoverable memory.
  - MUST pass task instructions plus recovery instructions, not the handoff
    body, raw transcripts, or file dumps.
  - MUST NOT ask subagents to call `mem_session_start`,
    `mem_session_summary`, or `mem_save_prompt`.

- Subagent prompt contract:
  - MUST treat the delegated task instructions as the assignment and use
    recovery instructions only for permitted parent-session context.
  - MUST NOT call thoth-mem unless both parent `session_id` and project are
    supplied.
  - MUST use `mem_search` -> `mem_timeline` -> `mem_get_observation` before
    relying on persisted memory.
  - MUST report missing, stale, contradictory, or insufficient memory context.
  - MUST NOT save generated subagent prompts as user intent.
  - MAY call `mem_save` only when write-capable and explicitly delegated a
    durable observation or deterministic SDD artifact under the parent
    session/project.

- Codex adapter contract:
  - MUST instruct root to use `multi_agent_v1.spawn_agent`.
  - MUST place delegated task instructions plus handoff retrieval instructions
    in `message`.
  - MUST NOT place the handoff body in `message` or `items`.
  - MUST NOT use both `message` and `items` for the same handoff.
  - MUST reserve `items` for structured attachments or mentions.
  - MUST disclose instruction-level enforcement gaps.

- SDD topic contract:
  - `sdd/{change}/{artifact}` remains reserved for deterministic SDD artifacts.
  - General durable observations remain outside `sdd/*`.
  - This design artifact is persisted as `sdd/improve-subagent-handoff/design`.

## Testing Strategy

Focused tests should be updated before or alongside prompt changes because this
feature is primarily rendered text and governance contracts.

- Prompt rendering:
  - Update `src/agents/prompt-rendering.test.ts` to assert both OpenCode and
    Codex root prompts mention handoff-as-compaction, root-owned summary
    refresh, prompt-body exclusion, handoff recovery instructions, and
    parent-scoped memory fields.
  - Assert OpenCode prompts do not contain `multi_agent_v1.spawn_agent`,
    `message`, `items`, or Codex-only wording.
  - Assert read-only and write-capable subagent prompts require parent
    `session_id`/project before thoth-mem use and require the full 3-layer
    recall chain.

- Agent config rendering:
  - Update `src/agents/index.test.ts` for generated OpenCode agent prompts,
    especially read-only and write-capable memory ownership rules.

- Codex adapter:
  - Update `src/harness/adapters/codex.test.ts` to assert root instructions use
    `multi_agent_v1.spawn_agent` `message` for task instructions plus handoff
    retrieval instructions, prohibit embedding the handoff body in `message` or
    `items`, prohibit `message` plus `items` for the same handoff, reserve
    `items` for attachments/mentions, include instruction-level enforcement
    language, and render subagent governance.

- OpenCode adapter:
  - Update `src/harness/adapters/opencode.test.ts` to assert the shared handoff
    sections are inherited and Codex-only dispatch names are absent.

- Memory governance:
  - Update `src/harness/core/memory-governance.test.ts` if
    `memory-governance.ts` text changes. Preserve the existing role matrix and
    diagnostic expectations around instruction-only fallback.

- Skill packaging/rendering:
  - Run focused tests that cover skill registry/layout if skill markdown changes
    affect generated Codex plugin or install artifacts.

Recommended verification commands after implementation:

```sh
pnpm vitest run src/agents/prompt-rendering.test.ts src/agents/index.test.ts src/harness/adapters/codex.test.ts src/harness/adapters/opencode.test.ts src/harness/core/memory-governance.test.ts
pnpm run typecheck
```

For broader confidence after focused tests pass, run `pnpm run check:ci` before
merge if the implementation touches skill packaging or generated harness
artifacts.

## Migration / Rollout

This is a prompt, documentation, and test update. No data migration, API
migration, or runtime configuration migration is required.

Rollout should be incremental:

1. Update shared prompts and tests so OpenCode and Codex inherit the same
   semantic handoff-summary recovery contract.
2. Update Codex adapter wording for `message` recovery instructions, prompt-body
   exclusion, and enforcement gaps.
3. Update shared thoth-mem skills and conventions to mirror the rendered
   contract.
4. Run focused prompt, adapter, governance, and packaging tests.
5. Run typecheck and broader CI when practical.

Rollback is a straight revert of prompt, adapter, skill, and test changes. No
existing thoth-mem observations or OpenSpec artifacts need data migration.

## Open Questions

- Whether `memory-governance.ts` needs code changes beyond wording depends on
  the implementation pass. Current structures appear sufficient, but tests
  should drive whether new contract fields are warranted.
- Some install or packaging tests may assert exact generated skill text. The
  implementation pass should run focused failures first and update only tests
  that lock intended output.
- The root-owned pre-delegation `mem_session_summary` requirement is rendered
  as instruction-level behavior in Codex. The runtime does not hard-enforce
  that ordering today, so Codex wording must continue to disclose that gap.
