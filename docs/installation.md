# Installation

thoth-agents 0.3.0 supports OpenCode, Codex, and Claude Code. OpenCode remains
the default when no harness is selected.

## Requirements

- Node.js `>=22.13`
- Network access during installation for the mandatory external skills
- The selected harness installed separately

## Choose a harness

```bash
# TTY: interactive selector. Non-TTY: OpenCode install.
npx thoth-agents@latest

npx thoth-agents@latest install --agent=opencode
npx thoth-agents@latest install --agent=codex
npx thoth-agents@latest install --agent=claude
```

| Route | Main managed targets | When to use it |
| --- | --- | --- |
| OpenCode | OpenCode plugin entry and ten-role configuration | Default native plugin path. |
| Codex | Repository marketplace plus root instructions, nine role TOMLs, and managed feature flags | Codex ambient-root workflow. |
| Claude Code | Repository marketplace installed through the native manager, with a root agent, nine subagents, settings, and MCP config | Claude Code plugin workflow. |

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
package `postinstall` would not be reliable. Claude plugin manifests also have
no general `postinstall` field; a `Setup` hook requires an explicit Claude init
operation and is not normal plugin-startup installation. A plugin-only install
therefore remains incomplete until the required global skills exist.

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
codex plugin marketplace add EremesNG/thoth-agents
npx thoth-agents@latest install --agent=codex --dry-run
npx thoth-agents@latest install --agent=codex
```

The repository catalog is `.agents/plugins/marketplace.json`; it points to the
versioned `integrations/codex` package. Run the Codex marketplace command in an
interactive terminal, restart Codex, and install/enable `thoth-agents` from
`/plugins`.

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

```bash
npx thoth-agents@latest install --agent=claude --dry-run
npx thoth-agents@latest install --agent=claude
```

The repository catalog `.claude-plugin/marketplace.json` points to
`integrations/claude-code`. The installer uses Claude's native manager to run the
equivalent of:

```bash
claude plugin marketplace add EremesNG/thoth-agents --scope user
claude plugin install thoth-agents@thoth-agents --scope user
```

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

See [Claude Code Plugin Packaging](claude-code-plugin-packaging.md).

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
