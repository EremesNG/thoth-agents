# Claude Code Plugin Packaging

thoth-agents installs Claude Code support as one plugin package under the Claude
skills-directory discovery surface.

```bash
npx thoth-agents@latest install --agent=claude --dry-run
npx thoth-agents@latest install --agent=claude
```

User scope targets `~/.claude/skills/thoth-agents`; project scope targets
`<project>/.claude/skills/thoth-agents`.

## Layout

```text
thoth-agents/
├── .claude-plugin/
│   ├── plugin.json
│   └── .thoth-agents-plugin-assets.json
├── agents/
│   ├── orchestrator.md
│   ├── explorer.md
│   ├── librarian.md
│   ├── oracle.md
│   ├── sdd-specify.md
│   ├── sdd-plan.md
│   ├── sdd-tasks.md
│   ├── designer.md
│   ├── quick.md
│   └── deep.md
├── .mcp.json
├── settings.json
└── .thoth-agents-managed-models.json
```

Only `plugin.json` and provenance live under `.claude-plugin/`. Claude plugin
components remain at the plugin root.

## Adaptive root

`settings.json` activates `orchestrator` as the main thread. It is an adaptive
root: it handles clear bounded work directly and invokes a plugin-namespaced
specialist only when delegation provides a net gain.

The orchestrator uses `model: inherit` and does not restrict its tool set.
Specialists cannot delegate further, and the root keeps one writer per mutable
surface.

## Subagent permissions

- `explorer`, `librarian`, and `oracle` deny `Write` and `Edit` in frontmatter.
- `sdd-specify`, `sdd-plan`, and `sdd-tasks` may write, but their
  `openspec/`-only scope remains instruction-level because Claude Code cannot
  restrict those tools to a per-agent path pattern.
- `designer`, `quick`, and `deep` are write-capable within the assigned surface.

Default specialist models are:

| Roles | Model |
| --- | --- |
| `explorer`, `sdd-tasks`, `quick` | `haiku` |
| `librarian`, `sdd-specify`, `sdd-plan`, `designer`, `deep` | `sonnet` |
| `oracle` | `opus` |

## Required external skills

`simplify`, `tdd`, `progressive-context-router`, and `architectural-grilling`
are mandatory but are not plugin components. The installer places them in the
global Claude skill root:

```text
~/.claude/skills/simplify/SKILL.md
~/.claude/skills/tdd/SKILL.md
~/.claude/skills/progressive-context-router/SKILL.md
~/.claude/skills/architectural-grilling/SKILL.md
```

Claude plugin `dependencies` identifies other plugins, not arbitrary standalone
skills. Claude also has no general plugin `postinstall`. A `Setup` hook requires
an explicit initialization flow, so it cannot guarantee dependency installation
on ordinary plugin startup. The thoth-agents CLI is therefore the mandatory
install and repair surface.

## MCP and memory boundary

`.mcp.json` contains the thoth-agents research MCPs (`exa`, `context7`, and
`grep_app`). It does not contain thoth-mem. The independently installed
thoth-mem plugin owns its own MCP, hooks, lifecycle, persistence, and recovery.

## Activation and trust

Restart Claude Code or run `/reload-plugins`, then confirm thoth-agents in
`/plugin`. Project-scope installation requires accepting workspace trust.

While enabled, `settings.json` makes the thoth-agents orchestrator the main
thread for that plugin scope.
