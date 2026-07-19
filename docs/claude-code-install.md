# Claude Code Install

Claude Code installation has two required layers: the native marketplace plugin
and the thoth-agents CLI setup. Install the plugin first, then run the CLI. The
plugin supplies the Claude-native agents and MCP configuration; the CLI installs
the mandatory external skills and verifies the complete state.

## Requirements

- Node.js `>=22.13`
- A current Claude Code installation with the `claude plugin` commands
- Git access to `EremesNG/thoth-agents`
- Permission to add a user-scope marketplace and plugin
- Network access for the mandatory external skills

## 1. Register the marketplace

Run this in a normal terminal before invoking the thoth-agents CLI:

```bash
claude plugin marketplace add EremesNG/thoth-agents --scope user
```

The marketplace name is `thoth-agents` and its catalog lives at
`.claude-plugin/marketplace.json` in the repository.

## 2. Install the native plugin

```bash
claude plugin install thoth-agents@thoth-agents --scope user
```

Claude Code copies the versioned package under `integrations/claude-code` into
its manager-owned plugin cache. thoth-agents never edits that cache directly.

## 3. Run the mandatory CLI setup

Inspect the zero-write plan, then apply it:

```bash
npx thoth-agents@latest install --agent=claude --dry-run
npx thoth-agents@latest install --agent=claude
```

The CLI recognizes the marketplace and enabled plugin as already installed. It
then installs and verifies these global Claude skills:

```text
~/.claude/skills/simplify/
~/.claude/skills/tdd/
~/.claude/skills/progressive-context-router/
~/.claude/skills/architectural-grilling/
```

These skills are standalone repositories, not plugin components. Claude plugin
dependencies and plugin startup do not provide a general-purpose `postinstall`
for them, so the CLI step has no supported replacement.

## 4. Reload and verify

Restart Claude Code or run:

```text
/reload-plugins
/plugin
```

For terminal-readable state and thoth-agents drift checks:

```bash
claude plugin marketplace list --json
claude plugin list --json
npx thoth-agents@latest status --harness=claude
```

A healthy installation has the canonical marketplace, an enabled
`thoth-agents@thoth-agents` user plugin, and all four required global skills.

## What each layer provides

| Layer | Provides | Does not provide |
| --- | --- | --- |
| Native Claude plugin | Main `orchestrator` agent, nine namespaced subagents, `settings.json`, and research MCPs | Standalone global skills, project QA tools, or thoth-mem |
| thoth-agents CLI | Required global skills, native-state verification, enable/update repair, status, and sync | Direct edits to Claude's plugin cache or post-install role-model rewrites |

The documented first-install path performs the two native commands explicitly.
The CLI can reconcile an absent, disabled, or stale native plugin during repair,
update, and sync operations, but it cannot bypass Claude trust, organization
policy, source conflicts, or an unreadable manager state.

## Limitations

- Claude owns marketplace snapshots and the versioned plugin cache. Publish a
  new thoth-agents version to change packaged agents or their default models.
- `explorer`, `librarian`, and `oracle` deny `Write` and `Edit`, but exact
  permission parity with OpenCode is not claimed.
- The `openspec/`-only boundary for SDD coordination agents is
  instruction-level because Claude permissions do not restrict Edit/Write to a
  path pattern per agent.
- Subagents cannot delegate further. The plugin orchestrator is the main thread
  and keeps delegation depth at one.
- Background agents cannot surface interactive permission or clarification
  prompts in the same way as foreground agents.
- thoth-mem remains an independent plugin/provider and must be installed
  separately.
- Browser, visual, integration, and end-to-end QA executables remain
  project-owned.

## Troubleshooting

### `claude plugin` is unavailable

Update Claude Code, restart the terminal, and confirm `claude --version`. The
native marketplace flow requires a Claude Code release with plugin management.

### Marketplace name conflict

Run `claude plugin marketplace list --json`. If another source is already
registered as `thoth-agents`, resolve it through Claude Code before rerunning the
CLI. thoth-agents fails closed instead of replacing a conflicting source.

### Organization policy blocks the marketplace

Managed `strictKnownMarketplaces` policy can prevent registration or updates.
The CLI cannot override that policy; ask the Claude administrator to allow the
repository source.

### Plugin is installed but skills are missing

Rerun the CLI setup or apply sync:

```bash
npx thoth-agents@latest sync --harness=claude --apply
```

## Upstream references

- [Discover and install Claude Code plugins](https://code.claude.com/docs/en/discover-plugins)
- [Create and distribute a Claude Code marketplace](https://code.claude.com/docs/en/plugin-marketplaces)
- [Claude Code plugin reference](https://code.claude.com/docs/en/plugins-reference)
- [Claude Code subagents](https://code.claude.com/docs/en/sub-agents)

See [Claude Code Plugin Packaging](claude-code-plugin-packaging.md) for the
published package layout and generation contract.
