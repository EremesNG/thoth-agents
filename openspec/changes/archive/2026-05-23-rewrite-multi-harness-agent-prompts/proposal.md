# Proposal: Rewrite Multi-Harness Agent Prompts

## Intent

Rewrite the generated prompt guidance for the thoth-agents seven-agent roster so
it is clearer, more role-first, and consistently multi-harness aware while
preserving the existing delegate-first operating model. The change covers the
root coordinator/orchestrator and the six subagents: explorer, librarian,
oracle, designer, quick, and deep.

The current prompts are assembled from shared TypeScript factories and dialect
renderers, which is the right architecture, but the prompt language has grown
through several rounds of feature work. It now needs a deliberate pass that
separates harness-neutral semantics from OpenCode and Codex bindings, sharpens
role boundaries, improves subagent output contracts, and preserves recent
multi-harness normalization decisions.

Full SDD is justified because this is a correctness-sensitive prompt-system
change across shared generation code, harness adapters, custom prompt extension
behavior, tests, and documentation expectations. A weak rewrite could silently
change delegation, memory governance, SDD routing, or verification behavior for
one harness while appearing to improve prose for another.

## Scope

### In Scope

- Analyze and rewrite prompts for the current thoth-agents roster:
  orchestrator/root coordinator, explorer, librarian, oracle, designer, quick,
  and deep.
- Preserve the canonical seven-agent model as orchestrator plus six subagents;
  use Gentle-AI and oh-my-opencode-slim as inspiration only, not as role schemas
  to import 1:1.
- Improve prompt clarity around root-owned decisions, bounded subagent work,
  read-only versus write-capable roles, verification expectations, safety rules,
  memory governance, SDD gates, and harness capability disclosures.
- Keep prompt construction modular and generated from the existing source
  architecture rather than replacing it with unrelated static prompt files.
- Preserve custom prompt extension behavior for configured per-role prompt
  additions.
- Preserve multi-harness rendering for OpenCode and Codex, including dialect
  terminology and adapter-specific wrapper behavior.
- Update tests or snapshots needed to lock the intended prompt text,
  cross-harness parity, and role terminology.
- Update documentation only where prompt behavior, role contracts, or harness
  wording changes need user-facing alignment.

### Out of Scope

- Adding, removing, or renaming agent roles.
- Replacing the shared prompt-generation architecture with copied prompt files
  from reference repositories.
- Implementing new delegation transports, task tools, MCP tools, browser flows,
  or thoth-mem features.
- Changing SDD artifact semantics, OpenSpec paths, memory topic-key formats, or
  review gates except where prompt wording needs to describe existing behavior
  more accurately.
- Reworking installer behavior, plugin packaging, or harness adapters beyond the
  prompt text and rendering behavior needed for this change.
- Treating OpenCode-only or Codex-only runtime primitives as universal policy.

## Approach

Use the existing prompt-generation pipeline as the implementation boundary:
`createOrchestratorPromptSections`, `createReadOnlySubagentPromptSections`,
`createWriteCapableSubagentPromptSections`, `renderRolePrompt`,
`composeAgentPrompt`, the per-role agent entrypoints, and the prompt dialect and
Codex adapter rendering layers.

The rewrite should define a cleaner shared semantic contract first, then render
that contract into harness-specific wording where needed. OpenCode and Codex
examples should remain scoped as bindings or capability notes. The final prompts
should make role ownership explicit: the root coordinator owns sequencing,
decisions, user questions, root-session memory, and progress synthesis; read-only
subagents return evidence and recommendations; write-capable subagents implement
bounded changes and verify them.

Reference repositories should inform style and structure: Gentle-AI contributes
strong root-coordinator boundaries, SDD checkpoints, and safety framing;
oh-my-opencode-slim contributes modular role definitions, role-first subagent
contracts, explicit output schemas, and first-class permission/tool surfaces.
Those ideas should be adapted into thoth-agents language and current harness
contracts rather than copied verbatim.

## Affected Areas

- `src/agents/prompt-sections.ts` for orchestrator, read-only subagent, and
  write-capable subagent prompt section factories.
- `src/agents/orchestrator.ts` and the six role entrypoints under
  `src/agents/` if assembly inputs, role descriptions, or section selection need
  adjustment.
- `src/agents/prompt-utils.ts` for prompt composition and custom prompt
  extension behavior, only if the rewrite reveals a composition issue.
- `src/agents/prompt-dialects.ts` for OpenCode and Codex terminology rendering.
- `src/harness/adapters/codex.ts` for Codex wrapper and adapter wording if
  role prompts need Codex-specific capability disclosures.
- `src/agents/prompt-rendering.test.ts` for generated prompt assertions,
  OpenCode/Codex parity checks, and protected terminology.
- `src/config/loader.test.ts` only if custom prompt override or extension
  behavior changes.
- User-facing docs or generated artifacts that quote or summarize the active
  role prompts.

## Risks

- Prompt wording could accidentally weaken root-owned memory governance or allow
  subagents to own session summaries, prompt saves, or progress checkpoints.
- Harness-neutral language could remove OpenCode operational details that remain
  required for current users.
- Codex-specific wording could overclaim enforcement for behavior that is only
  instruction-level in the Codex runtime.
- Imported inspiration from reference repositories could distort the canonical
  seven-agent roster or introduce roles, names, permissions, or assumptions that
  do not belong in thoth-agents.
- Broad prompt rewrites can create brittle tests if assertions focus on exact
  prose instead of durable behavioral terms.
- Custom prompt extension behavior could be broken if prompt composition is
  refactored carelessly.

## Rollback Plan

Because the change should remain limited to generated prompt text, prompt
composition, tests, and aligned documentation, rollback can restore the previous
prompt factories, dialect text, adapter wrapper wording, and prompt-rendering
test expectations from version control. If only one harness regresses, revert the
harness-specific dialect or adapter wording first while preserving shared prompt
improvements that pass both harness test suites.

No data migration is expected. If SDD artifacts for this change become stale,
archive or supersede this OpenSpec change rather than modifying unrelated specs.

## Success Criteria

- The generated prompts preserve the canonical seven-agent roster as
  orchestrator/root coordinator plus explorer, librarian, oracle, designer,
  quick, and deep.
- The prompts clearly separate shared thoth-agents semantics from OpenCode and
  Codex bindings, examples, and capability limitations.
- Root coordinator ownership is explicit for decisions, sequencing, user input,
  root-session memory, progress tracking, and synthesis.
- Subagent prompts are role-first, bounded, and include actionable output
  expectations without asking for raw file dumps.
- Read-only agents remain read-only in prompt guidance, and write-capable agents
  retain verification obligations before reporting completion.
- SDD, thoth-mem, and verification guidance remains aligned with current
  OpenSpec specs and does not reintroduce OpenCode-only assumptions as universal
  policy.
- Existing per-role custom prompt extension behavior remains covered by tests.
- Prompt rendering tests cover OpenCode and Codex output for key role,
  delegation, memory-governance, and capability-disclosure terms.
- The smallest sufficient automated verification passes, expected to include
  `pnpm run check:ci`, `pnpm run typecheck`, and focused prompt-rendering and
  config-loader tests, with `pnpm test` considered if prompt changes have broad
  snapshot or suite impact.
