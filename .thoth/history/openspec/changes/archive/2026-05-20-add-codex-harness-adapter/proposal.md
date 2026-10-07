# Proposal: Add Codex Harness Adapter

## Intent

Evolve oh-my-opencode-lite from an OpenCode-only plugin into a multi-harness
agent-pack while preserving OpenCode as the baseline. Codex is the first target
because the user explicitly prioritized it, and because Codex already exposes
enough adjacent concepts—custom agents/subagents, skills, hooks, MCP, project
configuration, worktrees, and per-agent options—to justify an adapter-oriented
architecture exploration.

## Scope

### In Scope

- Define a harness adapter direction that separates shared agent-pack intent
  from OpenCode-specific plugin wiring.
- Add Codex as the first additional harness target for future implementation.
- Preserve the seven-agent delegate-first model, SDD pipeline, verification
  expectations, and root-owned thoth-mem governance as harness-agnostic value.
- Identify Codex capability gaps that must be validated before claiming parity,
  especially runtime orchestration and plugin-native graph behavior.
- Use adapter interfaces, configuration writer strategies, and skill registry
  concepts as the preferred design direction.

### Out of Scope

- Implementing code, specs, design, or tasks in this phase.
- Implementing Claude, Antigravity, or any other harness target.
- Replacing thoth-mem or changing its MCP-based integration model.
- Assuming one-to-one OpenCode plugin parity without Codex capability validation.
- Copying external memory layers or installer-first architecture from references.

## Approach

Treat the change as an architecture evolution: extract shared contracts for
agent roster intent, subagent rules, SDD workflow, memory ownership, and
verification, then map those contracts into harness-specific adapters. The
OpenCode adapter remains the source-compatible baseline around current plugin
entrypoints, prompt utilities, skill registration, and skill sync. The Codex
adapter should prefer generated/project configuration, skills, agents, hooks,
and MCP setup unless later design proves a documented runtime API exists.

## Affected Areas

- `src/index.ts` OpenCode plugin entry and runtime coupling.
- `src/agents/prompt-utils.ts` roster prompts and `SUBAGENT_RULES`.
- `src/cli/skills.ts` and `src/hooks/skill-sync.ts` skill registration/sync.
- SDD skills and thoth-mem governance language that currently names OpenCode.
- Future harness adapter/config writer modules and tests.

## Risks

- Codex may not provide a docs-backed programmable orchestration graph, so the
  adapter may need to be configuration-first rather than runtime-plugin-first.
- Memory governance can regress if Codex subagents are allowed to own root-only
  memory operations.
- Over-abstracting too early could break existing OpenCode behavior.

## Rollback Plan

Keep OpenCode behavior as the default and isolate Codex work behind new adapter
boundaries. If Codex validation fails, remove or disable the Codex adapter path
without changing the existing OpenCode plugin flow.

## Success Criteria

- The proposal establishes Codex as the first non-OpenCode harness target.
- Future spec/design phases can describe shared contracts separately from
  OpenCode and Codex-specific mappings.
- OpenCode compatibility is explicitly preserved.
- Codex uncertainty is captured as validation work rather than assumed parity.
