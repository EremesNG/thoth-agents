# Claude Code Plugin Packaging

thoth-agents ships a native Claude Code marketplace and installs through the
Claude plugin manager. It never copies a plugin into `~/.claude/skills` or edits
Claude's manager-owned plugin cache.

## Repository marketplace

```text
.claude-plugin/marketplace.json
integrations/claude-code/
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
└── settings.json
```

The catalog source is `./integrations/claude-code`. Both paths are included in
the npm package and synchronized from the Claude adapter. Agent Markdown is not
maintained independently: `claudeCodeAdapter` renders the role contracts and
harness-specific dialect from the canonical prompt implementation under
`src/agents/`.

## Native installation

The supported path also installs mandatory external skills:

```bash
npx thoth-agents@latest install --agent=claude --dry-run
npx thoth-agents@latest install --agent=claude
```

Internally, the CLI inspects native JSON manager state and, when needed, runs:

```bash
claude plugin marketplace add EremesNG/thoth-agents --scope user
claude plugin install thoth-agents@thoth-agents --scope user
```

It enables an installed-but-disabled plugin instead of copying or reinstalling
cache files. Conflicting marketplace names or unreadable manager state fail
closed. Restart Claude Code or run `/reload-plugins`, then inspect `/plugin`.

## Adaptive root

`settings.json` activates `orchestrator` as the main plugin agent. It handles
clear bounded work directly and invokes a namespaced specialist only when
delegation provides a net gain. The orchestrator uses `model: inherit`, children
do not delegate, and the root keeps one writer per mutable surface.

## Subagent permissions and defaults

- `explorer`, `librarian`, and `oracle` deny `Write` and `Edit`.
- `sdd-specify`, `sdd-plan`, and `sdd-tasks` may write, but their
  `openspec/`-only boundary remains instruction-level.
- `designer`, `quick`, and `deep` are write-capable within the assigned surface.

| Roles | Model |
| --- | --- |
| `explorer`, `sdd-tasks`, `quick` | `haiku` |
| `librarian`, `sdd-specify`, `sdd-plan`, `designer`, `deep` | `sonnet` |
| `oracle` | `opus` |

These defaults are package-owned. The thoth-agents CLI does not rewrite models
inside Claude's installed cache; change the adapter defaults and publish a new
plugin version instead.

## Required external skills

`simplify`, `tdd`, `progressive-context-router`, and `architectural-grilling`
are mandatory but separate from the plugin package. The installer places them
in the global Claude skill root. A native plugin-only install is incomplete until
the CLI confirms all four skills.

Claude plugin dependencies identify plugins, not arbitrary standalone skills,
and there is no ordinary plugin `postinstall` lifecycle for this purpose. The
thoth-agents CLI therefore owns required-skill installation and repair.

## MCP and memory boundary

`.mcp.json` contains the thoth-agents research MCPs (`exa`, `context7`, and
`grep_app`). It does not contain thoth-mem. The independently installed
thoth-mem plugin owns its own MCP, hooks, lifecycle, persistence, and recovery.

## Generation and verification

```bash
pnpm run build
pnpm run integration:verify
```

`build` runs `integration:sync` before compiling. The sync command remains
available when only generated packages need refreshing. `release:patch`,
`release:minor`, and `release:major` use npm's `version` lifecycle to regenerate
and verify the Codex manifest, Claude manifest, and Claude marketplace entry
after the root package version changes and before npm creates the release commit
and tag.

Generated provenance and package files, including `agents/*.md`, should be
changed through their owning prompt source, adapter, or writer, not edited
directly.
