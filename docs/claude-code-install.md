# Claude Code Install

Claude Code receives a native plugin containing the orchestrator, six namespaced
specialists, MCP configuration, and the four workflow skills owned by
thoth-agents. The CLI remains a required installation step for the four external
skills, but agents do not consume it during SDD phases.

## Requirements

- Node.js `>=22.13` for bundled scripts
- Claude Code with native plugin marketplace commands
- Permission to add and trust `EremesNG/thoth-agents`
- Network access during installation for the external skill repositories

## 1. Register the marketplace

Run in a terminal:

```bash
claude plugin marketplace add EremesNG/thoth-agents --scope user
```

The marketplace name is `thoth-agents`; its catalog is
`.claude-plugin/marketplace.json`.

## 2. Install the plugin

```bash
claude plugin install thoth-agents@thoth-agents --scope user
```

Claude copies `integrations/claude-code` into its manager-owned cache.
thoth-agents never edits that cache directly.

## 3. Install the external skills

After the two native commands succeed, preview and run the CLI layer:

```bash
npx thoth-agents@latest install --agent=claude --dry-run
npx thoth-agents@latest install --agent=claude
```

The installer invokes `npx skills add` for `simplify`, `tdd`,
`progressive-context-router`, and `architectural-grilling`, targeting the global
Claude skill root. A missing external skill makes the installation incomplete.

## 4. Reload and initialize the project

Restart Claude Code or run `/reload-plugins`, then open the target repository and
invoke:

```text
/thoth-agents:thoth-init
```

Init creates missing `openspec/memory/constitution.md`, SDD templates, and
initialization metadata. Claude discovers agents and thoth-owned phase contracts
from the plugin; external execution skills come from the preceding CLI step.
Project initialization is offline, idempotent, and preserves project-owned
files.

## Packaged surfaces

| Surface | Contents |
| --- | --- |
| `agents/` | Main `orchestrator` plus `explorer`, `librarian`, `oracle`, `designer`, `quick`, and `deep` generated from canonical source |
| `skills/` | Owned SDD/init/constitution/archive skills only |
| `.mcp.json` | Packaged thoth-agents research MCP configuration |
| `settings.json` | Activates the orchestrator as the main plugin agent |

Namespaced delegation uses `thoth-agents:<role>`. Children never delegate.
Read-only `oracle` always owns Full analysis and every verification, regardless
of who implemented the change.

## Verification

```bash
claude plugin marketplace list --json
claude plugin list --json
```

Inside Claude Code, inspect `/plugin`. A healthy install shows the canonical
marketplace, an enabled `thoth-agents@thoth-agents` plugin, and all mandatory
external skills reported by the CLI:

```bash
npx thoth-agents@latest status --harness=claude
```

## Limitations

- Claude owns marketplace snapshots, cache files, and packaged model defaults;
  publish a new plugin version to change them.
- Explorer, librarian, and oracle deny `Write` and `Edit`. Fine-grained
  `openspec/` path restrictions are instruction-level because Claude's plugin
  permission map is not a path-pattern sandbox.
- Background agents cannot surface interactive permission or clarification
  prompts like the foreground session.
- Organization `strictKnownMarketplaces` policy can block registration or
  updates; thoth-agents cannot bypass it.
- Project-scope use requires workspace trust.
- thoth-mem and project QA executables remain separate.

## Troubleshooting

If `claude plugin` is unavailable, update Claude Code and restart the terminal.
For a marketplace-name conflict, inspect `claude plugin marketplace list --json`
and resolve the conflicting native source. If policy blocks the marketplace, ask
the Claude administrator to allow the repository.

## Upstream references

- [Discover and install Claude Code plugins](https://code.claude.com/docs/en/discover-plugins)
- [Create and distribute a Claude Code marketplace](https://code.claude.com/docs/en/plugin-marketplaces)
- [Claude Code plugin reference](https://code.claude.com/docs/en/plugins-reference)
- [Claude Code subagents](https://code.claude.com/docs/en/sub-agents)
