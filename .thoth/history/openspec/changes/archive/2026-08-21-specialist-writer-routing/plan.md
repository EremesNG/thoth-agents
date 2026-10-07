# Implementation Plan: Predictable specialist-writer routing

## Technical context

The canonical SDD phase contract currently assigns `implement` to
`defaultAgentRole: 'orchestrator'` in `src/harness/core/sdd.ts`, and
`src/agents/prompt-sections.ts` renders that fixed owner into every route summary.
The same prompt says child agents are preferred for read-heavy work, while the
three writer roles are only listed as eligible. Codex and Claude descriptions use
only `role.responsibility`; their adapter-specific operational blocks repeat role,
permission, question, lifecycle, and memory rules already present in the shared
prompt. Codex guidance assumes named-role selection is always instruction-only even
though some current hosts expose `agent_type`; Claude's writer supports `effort`
frontmatter but the adapter never supplies it.

The design keeps the seven-role roster, maximum delegation depth one, one writer
per mutable surface, root-owned OpenSpec state, and fresh Oracle verification. It
introduces no product data, migration, network dependency, provider-memory change,
or compatibility shim. Pre-change measurements from the audit are approximately
1,366–1,533 tokens per installed Codex specialist TOML and 2,117 estimated tokens
for the repository's always-loaded `AGENTS.md` plus `CLAUDE.md`; estimates use
characters divided by four and are not billing measurements.

## Constitution Check (pre-design)

- **Adaptive-root orchestration**: PASS — The accepted scope preserves bounded Direct root work, depth one, one writer per surface, and Oracle-owned verification while correcting the artifact-backed root default.
- **Explicit role boundaries**: PASS — The seven existing roles remain unchanged and the design makes each role's use, non-use, mutation, escalation, and verification boundary more explicit.
- **Proportional Spec Kit-compatible SDD**: PASS — The user selected Full, the specification passed its gate, and writer selection changes only the implement phase without adding ceremony or phase-only roles.
- **Truthful multi-harness contracts**: PASS — Shared policy remains canonical while OpenCode, Codex, and Claude adapters render only their evidenced selector, effort, permission, and fallback differences.
- **Independent provider ownership**: PASS — thoth-mem implementation and lifecycle remain out of scope; prompt consolidation preserves provider authorization and root ownership rather than reimplementing them.
- **Evidence-led completion**: PASS — TDD seams, focused cross-harness tests, proportional checks, fresh Oracle final verification, and transactional archive remain required.

## Design

### Canonical role routing contract

Extend `AgentRoleContract` in `src/harness/core/agent-pack.ts` with concise,
structured `useWhen`, `doNotUseWhen`, and `escalateWhen` fields. Populate all seven
roles and expose one renderer for auto-dispatch descriptions. The root contract will
state that it is not the normal artifact-backed writer; read-only roles will reject
known narrow questions that need no isolated context; writers will encode the exact
designer/quick/deep matrix. `ORCHESTRATION_POLICY` will prefer specialist writers
for non-trivial implementation while retaining the explicit Direct micro-action
exception.

### SDD implementation ownership

Generalize the SDD phase owner type in `src/harness/core/sdd.ts` so `implement` can
declare a selected implementation writer instead of lying through a fixed
orchestrator default. Preserve `eligibleAgentRoles` for root's Direct exception and
the three writers, but render Direct as adaptive implementation with the bounded
root exception and render Accelerated/Full as selected `designer | quick | deep`
ownership. The implement protocol will require the root to record the chosen writer,
exact mutable surface, requirements, and verification before dispatch. Coupled
surfaces use one `deep` writer; proven independent surfaces may have separate
writers with non-overlapping ownership.

### Shared prompt composition

`src/agents/prompt-sections.ts` will render the structured role routing contract and
the SDD writer-selection matrix. Child prompts will keep one canonical owner for
no-delegation, blocking questions, memory authorization, response budget, and return
shape. Remove equivalent role and memory prose appended by Codex and Claude adapters;
retain only genuine harness deltas such as native invocation, sandbox/frontmatter,
and capability limitations. The standalone memory-governance contract remains
available for diagnostics and focused tests even when adapters no longer duplicate
it in every generated prompt.

### Harness-native selection and descriptions

- OpenCode continues using its native named `task` subagents and permission presets;
  generated role descriptions come from the shared routing renderer.
- Codex root guidance requires `collaboration.spawn_agent(agent_type=<role>,
  fork_turns="none")` when the active schema exposes `agent_type`; otherwise it uses
  a role-prefixed task name plus the canonical bounded envelope and calls the gap
  instruction-only. Static capability diagnostics remain conservative because the
  package cannot guarantee the active host schema.
- Claude continues using namespaced `Agent(subagent_type: ...)`, generated
  descriptions come from the shared renderer, and each specialist receives effort
  frontmatter derived from a valid role override or the canonical Claude effort map.

### Proportional effort defaults

Update `CONFIRMED_OPENAI_SUBAGENT_PRESET` in `src/config/constants.ts` to:

| Role | Model | Effort |
| --- | --- | --- |
| explorer | gpt-5.6-luna | low |
| quick | gpt-5.6-luna | low |
| designer | gpt-5.6-sol | medium |
| deep | gpt-5.6-sol | medium |
| librarian | gpt-5.6-luna | high |
| oracle | gpt-5.6-sol | high |

Keep the OpenCode root at `gpt-5.6-sol` xhigh. Add the equivalent Claude effort map
without changing its current model aliases. A configured role `variant` supplies
Claude effort; unsupported or absent overrides fall back to the canonical map.
Codex keeps its existing rule that a custom model without confirmed effort metadata
does not receive an invented default effort.

### Verification strategy and TDD seams

The user confirms these seams by authorizing implementation after the ready/review
gate:

1. `getSddWorkflowContract`, `getSddPhaseOwner`, and rendered route summaries are the
   public SDD ownership seam.
2. `getAgentPackContract`, `getAgentRole`, and the shared description renderer are
   the public role-routing seam.
3. `renderConfiguredRolePrompt` and generated role prompts are the instruction and
   duplication seam.
4. `createCodexHarnessPackage`, `createClaudeCodeHarnessPackage`, and OpenCode agent
   config generation are the harness artifact seams.
5. Exported OpenAI/Claude default maps and generated frontmatter/TOML are the
   model-effort seam.
6. Routed documentation tests, generated-plugin consistency tests, progressive
   context validation, and context-budget output are the drift seam.

Implementation follows vertical red/green slices: first make one public-seam test
fail, implement only enough policy/rendering to pass it, then proceed to the next
seam. Tests assert observable contracts and generated artifacts, not private helper
calls or duplicated algorithm logic.

### Requirement mapping

| Requirement | Technical decision | Files/interfaces | Verification seam |
| --- | --- | --- | --- |
| FR-001 | Make artifact-backed root coordination explicit and retain one Direct micro-action exception. | `src/harness/core/agent-pack.ts`, `src/agents/prompt-sections.ts` | Agent-pack and rendered-root prompt tests |
| FR-002 | Represent `implement` as selected-writer ownership and render the designer/quick/deep matrix. | `src/harness/core/sdd.ts`, `skills/thoth-sdd/references/phases/implement.md` | SDD contract/protocol and route-rendering tests |
| FR-003 | Add structured use/non-use/escalation fields and derive dispatch descriptions from them. | `src/harness/core/agent-pack.ts`, `src/agents/prompt-sections.ts`, `src/agents/index.ts` | Role-contract and generated-description tests |
| FR-004 | Use conditional Codex `agent_type`, native OpenCode/Claude names, and truthful fallbacks. | `src/harness/adapters/codex.ts`, `src/harness/adapters/codex-surfaces.ts`, `src/harness/adapters/claude-code.ts`, `src/harness/adapters/opencode.ts` | Three harness-package tests and capability diagnostics |
| FR-005 | Lower bounded specialist defaults and render Claude effort with override precedence. | `src/config/constants.ts`, `src/harness/adapters/claude-code.ts`, `src/harness/writers/claude-code-subagent.ts` | Constants, Claude frontmatter, Codex/OpenCode config tests |
| FR-006 | Remove repeated child question/delegation/memory/role prose while retaining one canonical rule family. | `src/agents/prompt-sections.ts`, `src/harness/adapters/codex.ts`, `src/harness/adapters/claude-code.ts` | Prompt semantic-occurrence and before/after budget tests |
| FR-007 | Add a realistic cross-harness dispatch matrix and regression assertions. | `src/harness/core/agent-routing.test.ts`, existing core/adapter tests | Table-driven role ownership and forbidden-owner assertions |
| FR-008 | Synchronize canonical skills, generated bundle, routed docs, model docs, and install snapshots. | `skills/thoth-sdd/`, `plugin/`, `docs/agent/`, `docs/sdd-pipeline.md`, `docs/provider-configurations.md`, `docs/codex-model-customization.md` | Skill-contract, docs, build/generation, and context-router tests |

## Optional support artifacts

- `research.md`: Not needed; the accepted specification captures the prior official and open-source audit conclusions without creating a second evidence narrative.
- `data-model.md`: Not needed; no persisted product data or schema changes.
- `contracts/`: Not needed; the typed TypeScript role and SDD contracts are the public implementation seams.
- `quickstart.md`: Not needed; installation commands and operator workflow do not change.

## Risks and migrations

- **Adaptive-root regression**: Strong writer language could prohibit useful Direct
  micro-actions. Mitigation: preserve one explicit low-risk/low-overhead root route
  and test it beside artifact-backed writer cases. Rollback: restore the prior owner
  descriptor without changing artifacts or data.
- **Overrouting to deep**: A fixed default would simply replace root starvation with
  deep overuse. Mitigation: selected-writer owner plus structured matrix, never a
  static deep default.
- **Static Codex capability drift**: `agent_type` varies by host/schema. Mitigation:
  conditional instruction and conservative capability metadata; never claim universal
  structural support.
- **Effort compatibility**: Claude may reject unknown effort values or custom models
  may not support defaults. Mitigation: canonical known values, override precedence,
  current writer serialization tests, and no invented Codex effort for custom models.
- **Prompt compaction loss**: Removing duplicate prose could drop a safety or memory
  boundary. Mitigation: semantic-occurrence tests for every retained rule family and
  focused memory-governance tests before deleting adapter appendices.
- **Generated drift**: `plugin/` and installed-surface fixtures are derived outputs
  that can diverge. Mitigation: use the existing generation command, review the diff,
  and run generation/install tests; never edit installed global files as source.
- **No data migration**: This is a source, generated-package, instruction, and
  documentation migration only. Reinstall/update is required for consumers to receive
  new generated global agents.

## Constitution Check (post-design)

- **Adaptive-root orchestration**: PASS — The selected-writer owner removes root as the artifact-backed default while preserving the tested Direct exception, depth one, and non-overlapping writers.
- **Explicit role boundaries**: PASS — Structured routing fields strengthen all seven existing roles without adding aliases or phase-only agents.
- **Proportional Spec Kit-compatible SDD**: PASS — The implement owner becomes adaptive by surface/risk inside the existing Full/Accelerated/Direct pipeline and adds no new phase or user pause.
- **Truthful multi-harness contracts**: PASS — Shared semantics have one owner and each adapter renders only native selector, effort, permission, and fallback facts it can support.
- **Independent provider ownership**: PASS — Provider code remains untouched and prompt consolidation retains authorization semantics through the shared child contract and provider-owned skill.
- **Evidence-led completion**: PASS — Six confirmed public seams, vertical TDD slices, full pre-merge checks, fresh Oracle verification, and transactional archive provide proportional evidence.
