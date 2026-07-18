# Claude Code Plugin Packaging

thoth-agents ships Claude Code support as a single, distributable **plugin
package**. Unlike Codex — whose plugins cannot carry subagents, so it needs both
`.codex-plugin/` and `.codex/` artifacts — Claude Code plugins auto-discover
subagents, so everything lives under one plugin root.

## Generate the package

```bash
npx thoth-agents@latest generate --harness=claude --dry-run
```

This renders the package artifacts (dry-run prints them as JSON). To write them
to disk as an installed plugin, use the install command:

```bash
npx thoth-agents@latest install --agent=claude --dry-run
npx thoth-agents@latest install --agent=claude
```

The plugin is installed as a **skills-directory plugin** under
`~/.claude/skills/thoth-agents` (user scope) or `<project>/.claude/skills/thoth-agents`
(project scope). A folder under a Claude Code *skills directory* that contains
`.claude-plugin/plugin.json` auto-loads as `thoth-agents@skills-dir` on the next
session — there is **no marketplace and no install step**, and the plugin is
discovered in place rather than copied to the `~/.claude/plugins/cache`. Restart
Claude Code or run `/reload-plugins` to activate it; confirm in `/plugin` →
Installed. User-scope plugins load hooks and MCP servers without extra approval;
project-scope requires accepting the workspace trust dialog.

> Note: `~/.claude/plugins/` is **not** a discovery path — it is the internal
> cache for marketplace installs. Dropping a plugin folder there does nothing.

## Package layout

```text
thoth-agents/
├── .claude-plugin/
│   ├── plugin.json                      # manifest: name, version, description, author
│   └── .thoth-agents-plugin-assets.json # provenance (paths + sha256)
├── agents/                              # seven auto-discovered agents
│   ├── explorer.md  librarian.md  oracle.md
│   ├── designer.md  quick.md  deep.md
│   └── orchestrator.md                  # main-thread agent (no tools restriction)
├── .mcp.json                            # bundled research MCPs
├── settings.json                        # { "agent": "orchestrator" } → main thread
├── skills/                              # bundled requirements + SDD skills
└── .thoth-agents-managed-models.json    # managed model ownership state
```

Only `plugin.json` sits under `.claude-plugin/`; every other component is a
plugin-root sibling, which is how Claude Code auto-discovers them.

## Subagents and role permissions

Each specialist role is a subagent file with YAML frontmatter:

```markdown
---
name: explorer
description: Find workspace facts fast ...
model: sonnet
tools: "Read, Grep, Glob"
---
<rendered role prompt + provider-neutral continuity governance>
```

The `tools` allowlist is the enforcement mechanism for role permissions:

- Read-only roles (`explorer`, `librarian`, `oracle`) get read/search tools only
  — no `Write`, `Edit`, or write `Bash`.
- Write-capable roles (`designer`, `quick`, `deep`) get the full mutation set.

Per-role model defaults: `oracle` uses `opus`; `librarian`, `designer`, and
`deep` use `sonnet`; `explorer` and `quick` use `haiku`. Models accept only
`sonnet`, `opus`, `haiku`, or `inherit`. Override them with:

```bash
npx thoth-agents@latest model --harness=claude --role=deep --model=sonnet
```

## The orchestrator (main-thread agent)

In Claude Code the orchestrator is the **main thread**. The package ships an
`agents/orchestrator.md` agent whose body is the root coordinator system prompt,
and a plugin-root `settings.json` containing `{ "agent": "orchestrator" }`. Per
the Claude Code docs, this `agent` key "activates one of the plugin's custom
agents as the main thread, applying its system prompt, tool restrictions, and
model" — it **replaces the default system prompt entirely**.

This is deliberately much stronger than a `SessionStart` hook that emits
`additionalContext`: that injection is low-priority context the model can ignore,
so it does not reliably drive delegate-first behavior or provider enrollment.
The orchestrator agent therefore omits `tools` (so it inherits every tool — Task,
AskUserQuestion, TodoWrite, MCP, edit tools) and uses `model: inherit` to keep
your chosen session model.

The orchestrator delegates with
`Task(subagent_type: explorer|librarian|oracle|designer|quick|deep)`, asks
blocking questions with `AskUserQuestion`; provider installation and lifecycle
remain owned by the independently installed provider guidance.

> Caveat: while the plugin is enabled, the orchestrator is the default agent for
> every session in scope. At user scope (`~/.claude/skills/`) that is every
> project; disable the plugin (`/plugin disable thoth-agents@skills-dir`) for
> sessions where you want plain Claude Code.

## MCP servers

`.mcp.json` declares the bundled research servers used on this surface.
URL-based servers (`context7`, `grep_app`) use `{ "type": "http", "url": ... }`, while
`exa` is a stdio command server. This differs from Codex, which
declares URL servers with a bare `url` field.
