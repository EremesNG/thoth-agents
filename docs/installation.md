# Installation

thoth-agents 0.3.0 supports OpenCode, Codex, and Claude Code. OpenCode remains
the default when no harness is selected.

## Requirements

- Node.js `>=22.13`
- Network access during installation for the mandatory external skills
- The selected harness installed separately

## Installation model

thoth-agents separates native plugin delivery from CLI-managed setup. A native
plugin can package agents, MCPs, settings, and other harness components, but it
cannot reliably install arbitrary standalone skill repositories or write every
user-level orchestration surface. Do not treat plugin-only installation as
complete.

| Harness | First install the native/plugin layer | Then run the CLI |
| --- | --- | --- |
| OpenCode | No separate command; the CLI adds the npm plugin entry. | `npx thoth-agents@latest install --agent=opencode` |
| Codex | Add `EremesNG/thoth-agents`, restart, then install/enable from `/plugins`. | `npx thoth-agents@latest install --agent=codex` |
| Claude Code | Add the marketplace and install `thoth-agents@thoth-agents` with the two native commands below. | `npx thoth-agents@latest install --agent=claude` |

Running `npx thoth-agents@latest` opens the harness selector in an interactive
TTY and defaults to OpenCode in non-interactive contexts. Explicit harness
commands are recommended for reproducible setup and documentation.

## Mandatory external skills

Every supported install runs the skills CLI for `simplify`, `tdd`,
`progressive-context-router`, and `architectural-grilling`. They are
requirements, not recommendations. Installation fails if a required skill
cannot be installed or confirmed.

| Harness | skills CLI agent | Global target |
| --- | --- | --- |
| OpenCode | `opencode` | `~/.config/opencode/skills` |
| Codex | `codex` | `~/.codex/skills` |
| Claude Code | `claude-code` | `~/.claude/skills` |

There is no skip flag. Dry-run prints the exact commands without executing them.
Browser and QA executables remain project-owned; thoth-agents does not install
`playwright-cli`, Playwright, or another runner.

The supported dependency-installation mechanism is the thoth-agents CLI. Codex
marketplace npm sources are downloaded without running lifecycle scripts, so a
package `postinstall` would not be reliable. Claude plugin dependencies identify
plugins rather than arbitrary standalone skills, and plugin startup does not
provide a general-purpose `postinstall` for them. A plugin-only install therefore
remains incomplete until the CLI confirms every required global skill.

## Common options

| Option | Meaning |
| --- | --- |
| `--agent=opencode\|codex\|claude` | Select the installation target. |
| `--dry-run` | Print the complete plan and skill commands without writing. |
| `--reset` | Repair thoth-agents-managed targets only. |
| `--no-tui` | Force the non-interactive path. |
| `--tmux=yes\|no` | Configure OpenCode tmux integration. It does not apply to Codex or Claude. |

Unknown legacy install options fail explicitly.

## OpenCode

```bash
npx thoth-agents@latest install --agent=opencode
npx thoth-agents@latest install --agent=opencode --dry-run
```

The installer:

1. merges `thoth-agents@latest` into the OpenCode plugin list;
2. writes the OpenAI-only ten-role thoth-agents configuration;
3. preserves unrelated OpenCode settings;
4. optionally configures tmux; and
5. installs all required skills under `~/.config/opencode/skills`.

Adding only this entry manually loads the npm plugin but cannot install the
required skills:

```json
{
  "plugin": ["thoth-agents@latest"]
}
```

Run the CLI afterward or use `sync --harness=opencode --apply`. Status reports
missing required skills as drift.

The generated preset is `openai`; no Kimi, Copilot, ZAI/GLM, or mixed-provider
preset is written.

## Codex

```bash
# Native plugin layer
codex plugin marketplace add EremesNG/thoth-agents

# Restart Codex, then install/enable thoth-agents from /plugins.

# CLI-managed orchestration layer
npx thoth-agents@latest install --agent=codex --dry-run
npx thoth-agents@latest install --agent=codex
```

The repository catalog is `.agents/plugins/marketplace.json`; it points to the
versioned `integrations/codex` package. The native plugin provides the packaged
research MCP configuration. It does not carry the root instructions, custom
agent TOMLs, user feature configuration, or external skills; those belong to the
CLI layer.

User-scope installation manages:

- `~/.codex/AGENTS.md`: one bounded thoth-agents root block;
- `~/.codex/agents/thoth-agents-{role}.toml`: nine specialist roles, including
  `sdd-specify`, `sdd-plan`, and `sdd-tasks`;
- `~/.codex/agents/.thoth-agents-managed-models.json`: model ownership state;
- `~/.codex/config.toml`: backed-up feature-gate merge; and
- `~/.codex/skills/{simplify,tdd,progressive-context-router,architectural-grilling}/`:
  required global skills.

The CLI does not copy a plugin into `~/.codex/plugins` or merge a personal
marketplace. Codex owns those snapshots and caches. The ambient Codex session is
the orchestrator, so no orchestrator child TOML is created. Restart Codex after
installation and review:

```text
/plugins
/hooks
```

Plugin registration and feature flags do not bypass Codex trust review or
higher-precedence project, profile, CLI, system, or admin configuration.

See [Codex Install](codex-install.md) for the detailed contract.

## Claude Code

Run the native marketplace commands before the thoth-agents CLI:

```bash
# Native plugin layer
claude plugin marketplace add EremesNG/thoth-agents --scope user
claude plugin install thoth-agents@thoth-agents --scope user

# CLI-managed dependency and verification layer
npx thoth-agents@latest install --agent=claude --dry-run
npx thoth-agents@latest install --agent=claude
```

The repository catalog `.claude-plugin/marketplace.json` points to
`integrations/claude-code`. Claude's native manager registers and caches the
plugin. Once those two commands succeed, the thoth-agents CLI treats the native
plugin as present and installs/verifies the required global skills. It may also
reconcile disabled or stale native state during repair, update, or sync, but the
documented first-install flow keeps marketplace trust and plugin installation
explicit.

The versioned plugin package contains:

- `.claude-plugin/plugin.json`;
- `agents/orchestrator.md`;
- nine specialist files under `agents/`, including the three SDD phase agents;
- `.mcp.json` for thoth-agents research MCPs; and
- `settings.json`, which activates the orchestrator as the main plugin agent.

Claude owns the installed cache. thoth-agents does not copy or mutate it, and
post-install per-role model rewrites are unsupported; model-default changes are
published as a new plugin package.

Required external skills are separate global Claude skills under
`~/.claude/skills/{simplify,tdd,progressive-context-router,architectural-grilling}/`;
they are not copied into the thoth-agents plugin manifest.

Restart Claude Code or run `/reload-plugins`, then confirm the plugin in
`/plugin`. Project-scope installation requires workspace trust.

See [Claude Code Install](claude-code-install.md) for troubleshooting and
[Claude Code Plugin Packaging](claude-code-plugin-packaging.md) for the package
contract.

## Capability and enforcement limitations

| Harness | Limitation |
| --- | --- |
| OpenCode | It is the strongest runtime-integrated path, but 0.3.0 ships only the OpenAI built-in model preset. |
| Codex | The ambient session is the root. Custom agents are native TOML layers, but runtime role matching and some permission boundaries remain instruction-level. Global `AGENTS.md` and user config can be overridden by more specific or higher-precedence configuration. |
| Claude Code | The manager owns installed cache files and packaged model defaults. Read-only roles use tool denylists, while `openspec/` path restriction is instruction-level. Background agents cannot handle interactive prompts like foreground agents. |

No harness install includes thoth-mem or project QA executables. Trust,
organization policy, and higher-precedence harness configuration remain in
force; thoth-agents does not bypass them.

## Status, update, and sync

```bash
npx thoth-agents@latest status
npx thoth-agents@latest status --harness=codex
npx thoth-agents@latest update --harness=claude
npx thoth-agents@latest sync --harness=opencode --apply
```

Status includes native manager state, harness configuration, and every required
global skill. Update and sync reconcile only thoth-agents-owned surfaces and
retain unrelated user content.

## Reset safety

`--reset` refreshes managed blocks, role files, model state, and managed
configuration keys. It does not rewrite native marketplace snapshots or plugin
caches, or delete unrelated skills, provider configuration, or harness
directories.
