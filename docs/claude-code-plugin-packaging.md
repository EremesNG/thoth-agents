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
├── agents/                              # six auto-discovered subagents
│   ├── explorer.md  librarian.md  oracle.md
│   └── designer.md  quick.md  deep.md
├── .mcp.json                            # exa, context7, grep_app, thoth_mem
├── hooks/
│   ├── hooks.json                       # SessionStart root-coordinator injection
│   ├── inject-root-instructions.mjs     # emits additionalContext on SessionStart
│   └── root-instructions.md             # rendered root coordinator instructions
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
<rendered role prompt + thoth-mem governance>
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

## The orchestrator and the SessionStart hook

In Claude Code the orchestrator is the **main session**, not a generated
subagent. A plugin cannot edit your `CLAUDE.md`, so the root coordinator
instructions are injected through a `SessionStart` hook that emits them as
`additionalContext`. The hook runs `node "${CLAUDE_PLUGIN_ROOT}/hooks/inject-root-instructions.mjs"`,
which reads the rendered `hooks/root-instructions.md` and prints the
`additionalContext` envelope.

The main session delegates with
`Task(subagent_type: explorer|librarian|oracle|designer|quick|deep)` and asks
blocking questions with `AskUserQuestion`.

## MCP servers

`.mcp.json` declares the same four servers used across harnesses. URL-based
servers (`context7`, `grep_app`) use `{ "type": "http", "url": ... }`, while
`exa` and `thoth_mem` are stdio command servers. This differs from Codex, which
declares URL servers with a bare `url` field.
