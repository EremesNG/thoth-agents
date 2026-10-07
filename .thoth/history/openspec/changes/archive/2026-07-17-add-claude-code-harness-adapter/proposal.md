# Proposal: Add Claude Code Harness Adapter

## Intent

Add **Claude Code** as the third supported harness in thoth-agents, alongside
OpenCode (the first-class default) and Codex (configuration-first). Unlike Codex,
Claude Code natively exposes every primitive the agent pack relies on —
auto-discovered subagents, harness-enforced hooks, MCP servers, skills, per-agent
tool permissions, and a first-class plugin package format. Claude Code is
therefore implemented as a **first-class adapter** (all capabilities `supported`,
no surface-validation gate, no capability-gap diagnostics), structurally closer to
the OpenCode adapter than to the Codex one.

## Scope

### In Scope

- Promote `HarnessId` to include `'claude'` and register a first-class
  Claude Code harness adapter and CLI operation adapter.
- Render the seven-agent roster for Claude Code as a single distributable
  **plugin package** (`.claude-plugin/`): `plugin.json` manifest, six specialist
  subagents under `agents/<role>.md`, an `agents/orchestrator.md` agent, bundled
  `skills/`, a `.mcp.json` server map, and a plugin-root `settings.json` that
  activates the orchestrator as the Claude Code main thread.
- Enforce role permissions through subagent frontmatter `tools` (read-only vs
  write-capable), and per-role model defaults through frontmatter `model`
  (`sonnet`/`opus`/`haiku`/`inherit`).
- Add a Claude Code prompt dialect and reuse the harness-neutral agent-pack,
  memory-governance, skills, and prompt-section contracts unchanged.
- Add a Claude Code install/operation layer (status/install/update/sync/model)
  that plans and applies the plugin package idempotently with backups.
- Preserve OpenCode and Codex behavior unchanged.

### Out of Scope

- Changing OpenCode or Codex default behavior, artifact paths, or capabilities.
- Replacing thoth-mem or its MCP-based governance model.
- Adding any harness beyond Claude Code (e.g. Antigravity).
- Porting the OpenCode runtime hook callbacks in `src/hooks/*` into Claude Code
  command hooks; the orchestrator is delivered as a main-thread agent, not hooks.
- Publishing to a hosted Claude Code marketplace (the package is checked into the
  repo and consumable as a plugin source; marketplace distribution is follow-up).

## Approach

Mirror the Codex adapter structure but in first-class form. The harness-neutral
core (`src/harness/core/*`) and the prompt-section pipeline
(`src/agents/prompt-sections.ts`) are reused as-is; only a new
`CLAUDE_CODE_PROMPT_DIALECT` and Claude-Code-specific writers are added. Because
Claude Code plugins auto-discover subagents, the dual artifact split Codex needed
(`.codex-plugin/` + `.codex/`) collapses into one `.claude-plugin/` package. The
root coordinator is delivered as a generated `orchestrator` agent activated as
the Claude Code main thread via the plugin `settings.json` `agent` key (replacing
the default system prompt), since a SessionStart `additionalContext` injection is
too weak to reliably drive the orchestrator behavior.

Lean on TypeScript strict mode: widening `HarnessId` makes every
`Record<HarnessId, …>` non-exhaustive and forces each downstream addition to be
covered.

## Affected Areas

- `src/harness/types.ts`, `src/harness/registry.ts` — harness id and registration.
- `src/harness/adapters/claude-code.ts` and new writers under
  `src/harness/writers/` — rendering.
- `src/agents/prompt-dialects.ts` — Claude Code dialect.
- `src/cli/operations/*`, `src/cli/claude-code-*.ts`, `src/cli/commands.ts`,
  `src/cli/parser.ts`, `src/cli/types.ts` — CLI selection, install, and dispatch.
- `src/config/schema.ts` + `thoth-agents.schema.json` — optional generation config.
- `README.md`, `docs/claude-code-*.md` — documentation.

## Risks

- The `commands.ts` dispatch ternaries route any non-`opencode` harness to the
  Codex path; without a refactor, `claude` would be silently swallowed.
- Claude Code `.mcp.json` requires `type: "http"` for URL-based servers, unlike
  Codex's bare `{url}`; a blind reuse of the Codex MCP builder would be wrong.
- The Codex writers and `skill-layout.ts` are welded to the surface gate and
  `harness: 'codex'` literals; reusing them would import the gate.

## Rollback Plan

Removing the `'claude'` registry entries and the Claude Code adapter/operation
modules restores the prior two-harness behavior with no impact on OpenCode or
Codex. The new modules are additive and isolated behind the harness id.

## Success Criteria

- `thoth-agents generate --harness=claude --dry-run` emits a complete,
  deterministic `.claude-plugin/` package.
- Subagent files restrict tools by role and set per-role model defaults.
- The plugin `settings.json` activates the orchestrator as the main thread.
- OpenCode and Codex tests remain green; new Claude Code tests pass.
- `pnpm run check:ci`, `typecheck`, `build`, and `test` pass.
