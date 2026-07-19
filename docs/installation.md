# Installation

thoth-agents 0.3.0 supports OpenCode, Codex, and Claude Code. The distributions
share one seven-role and Spec Kit-compatible SDD contract. Installation uses the
CLI for every harness, while Codex additionally requires a CLI-managed global
orchestration layer that its plugin manifest cannot provide.

## Requirements

- Node.js `>=22.13`
- One supported harness installed separately
- Permission to install/trust the selected plugin
- Network access during installation for the plugin and external skills

The four thoth-owned workflow skills are packaged. The installer obtains the
four mandatory external skills from their canonical repositories with `npx
skills add`. Once installed, SDD phases load local contracts and do not consume
the CLI or network.

## Supported flow

| Harness | Native/plugin step | Required completion step |
| --- | --- | --- |
| OpenCode | `npx thoth-agents@latest install --agent=opencode` | Restart, then `/thoth-init` in each repository |
| Codex | Add `EremesNG/thoth-agents`, restart, install/enable from `/plugins` | `npx thoth-agents@latest install --agent=codex`, restart, then `$thoth-init` per repository |
| Claude Code | Add marketplace and install `thoth-agents@thoth-agents` | `npx thoth-agents@latest install --agent=claude`, restart, then `/thoth-agents:thoth-init` per repository |

## Common CLI options

| Option | Meaning |
| --- | --- |
| `--agent=opencode\|codex\|claude` | Select the installation target. |
| `--dry-run` | Print the complete plan without writing. |
| `--reset` | Repair only thoth-agents-managed targets. |
| `--no-tui` | Force the non-interactive path. |
| `--tmux=yes\|no` | Configure OpenCode tmux integration; it does not apply to Codex or Claude. |

## OpenCode

```bash
npx thoth-agents@latest install --agent=opencode --dry-run
npx thoth-agents@latest install --agent=opencode
```

The CLI adds `thoth-agents@latest` to OpenCode configuration, writes the
seven-role OpenAI preset, and installs all four external skills with `npx skills
add`. Restart OpenCode and invoke `/thoth-init`; it copies the four thoth-owned
skills to `.agents/skills/` and creates missing `openspec/` governance while
preserving project-owned files. No Kimi, Copilot, ZAI/GLM, or mixed-provider
preset is generated.

## Codex

First install the native package:

```bash
codex plugin marketplace add EremesNG/thoth-agents
```

Restart Codex, open `/plugins`, and install or enable `thoth-agents`. The
repository catalog `.agents/plugins/marketplace.json` points to
the shared `plugin/` bundle, which contributes bundled owned skills and the
Codex MCP configuration.

Then apply the mandatory global orchestration layer from a terminal:

```bash
npx thoth-agents@latest install --agent=codex --dry-run
npx thoth-agents@latest install --agent=codex
```

The CLI manages:

- `~/.codex/AGENTS.md`: one bounded orchestrator block;
- `~/.codex/agents/thoth-agents-{explorer,librarian,oracle,designer,quick,deep}.toml`;
- `~/.codex/agents/.thoth-agents-managed-models.json`;
- `~/.codex/config.toml`: the managed feature merge; and
- mandatory external skills in the Codex global skill root via `npx skills add`.

The ambient Codex session is root, so no orchestrator child TOML exists. The CLI
does not copy a plugin into a personal manager cache or bypass `/plugins` trust.

Restart Codex after the CLI step. In every target repository invoke
`$thoth-init`; this creates only missing `openspec/` governance. It does not
install agents or global instructions.

Review `/plugins` and `/hooks`. Global instructions and configuration remain
subject to more specific project/subtree instructions, profiles, managed policy,
and organization controls.

## Claude Code

Run both native commands in a terminal:

```bash
claude plugin marketplace add EremesNG/thoth-agents --scope user
claude plugin install thoth-agents@thoth-agents --scope user
```

Only after those native steps, run:

```bash
npx thoth-agents@latest install --agent=claude --dry-run
npx thoth-agents@latest install --agent=claude
```

Restart Claude Code or run `/reload-plugins`, then invoke
`/thoth-agents:thoth-init` in each repository. Claude discovers the packaged
orchestrator, six namespaced subagents, MCP configuration, and thoth-owned skill
tree natively. The CLI installs and verifies the external skills. Init creates
missing `openspec/` governance only.

Claude owns marketplace snapshots, cache files, enablement, and packaged model
defaults; thoth-agents never edits that cache.

## Skill ownership

All harness distributions carry only thoth-owned workflow skills: `thoth-init`,
`thoth-sdd`, `thoth-constitution`, and `thoth-archive`.

The CLI installs `simplify`, `tdd`, `progressive-context-router`, and
`architectural-grilling` from their canonical GitHub repositories using the
skills CLI. This deliberately avoids vendored copies and makes those
repositories the single source of truth. Browser, visual, integration, and
end-to-end QA executables remain project-owned.

## Limitations

| Harness | Limitation |
| --- | --- |
| OpenCode | CLI installation is required for external skills; only the OpenAI built-in preset ships. |
| Codex | Plugin manifests cannot install custom agents or write `~/.codex/AGENTS.md`; the CLI layer is mandatory. Installed-role selection and some permissions remain instruction-level. |
| Claude Code | Native marketplace/install steps must precede the CLI. Native tool denials protect read-only roles, but fine-grained write-path restriction remains instruction-level. |

No distribution includes thoth-mem or project QA executables. thoth-mem remains
an independent provider/plugin.

## Status and repair

```bash
npx thoth-agents@latest status
npx thoth-agents@latest status --harness=codex
npx thoth-agents@latest sync --harness=codex --apply
npx thoth-agents@latest model --harness=codex --role=deep --model=gpt-5.6-sol
```

Install is required for every harness; the other operations are optional
conveniences. `--reset` affects only bounded thoth-agents-managed targets; it
does not rewrite marketplace snapshots, plugin caches, unrelated skills, or
provider state.
