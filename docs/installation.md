# Installation Guide

Complete installation instructions for thoth-agents across supported harnesses.
OpenCode is the stable default path. Codex is an explicit setup path with its
own trust review and runtime caveats.

The OpenCode plugin entry and the npm binary are different surfaces. OpenCode
loads the plugin from config such as `plugin: ["thoth-agents@latest"]`; that
does not install a global `thoth-agents` command. Run the installer or
interactive TUI through a globally installed binary, `npx thoth-agents@latest`,
or `pnpm dlx thoth-agents@latest`.

## Table of Contents

- [Choose a Harness](#choose-a-harness)
- [OpenCode Setup](#opencode-setup)
- [Codex Setup](#codex-setup)
- [For LLM Agents](#for-llm-agents)
- [Troubleshooting](#troubleshooting)
- [Uninstallation](#uninstallation)

---

## Choose a Harness

| Harness | Command | Writes to | Best when |
| --- | --- | --- | --- |
| Interactive TUI | `npx thoth-agents@latest` in a TTY | Only when you choose an apply action | You want status/list/update/sync/model previews across supported harnesses. |
| OpenCode default | `npx thoth-agents@latest install` | OpenCode plugin config, optional skills, optional tmux config | You want the stable native plugin flow. |
| OpenCode explicit | `npx thoth-agents@latest install --agent=opencode` | Same as default OpenCode setup | You want to be explicit in automation. |
| Codex explicit | `npx thoth-agents@latest install --agent=codex` | Codex AGENTS block, six role TOMLs, Personal plugin source, marketplace entry, managed feature flags | You want Codex role agents and bundled skills. |
| Claude Code explicit | `npx thoth-agents@latest install --agent=claude` | One `.claude-plugin/` package: six subagents, `.mcp.json`, bundled skills, SessionStart root-injection hook | You want a native Claude Code plugin with auto-discovered subagents. |

Use `--dry-run` before Codex or Claude Code install when you want to inspect the
target plan and backups before writing files.

## OpenCode Setup

### Prerequisites

- [OpenCode](https://opencode.ai/docs)
- Node.js `>=22.13`
- Corepack with `pnpm@11.2.2`

### Quick Install

Run the no-argument TUI in an interactive terminal:

```bash
corepack enable
corepack prepare pnpm@11.2.2 --activate
npx thoth-agents@latest
```

Or run the OpenCode installer directly:

```bash
corepack enable
corepack prepare pnpm@11.2.2 --activate
npx thoth-agents@latest install
```

Or make the OpenCode target explicit:

```bash
npx thoth-agents@latest install --agent=opencode
```

For non-interactive mode:

```bash
npx thoth-agents@latest install --no-tui --tmux=no --skills=yes
```

In CI, redirected streams, and `TERM=dumb` terminals, the no-argument binary
keeps the legacy automation-safe fallback and routes to OpenCode install with
the TUI disabled.

### What OpenCode Install Sets Up

The OpenCode path prepares the delegate-first seven-agent roster, generated
provider presets, optional tmux integration, and plugin registration.

When skills are enabled, it also installs or copies:

- Bundled `requirements-interview`
- Bundled `plan-reviewer`
- Bundled `executing-plans`
- Bundled SDD pipeline skills:
  `sdd-init`, `sdd-propose`, `sdd-spec`, `sdd-clarify`, `sdd-design`,
  `sdd-tasks`, `sdd-apply`, `sdd-verify`, `sdd-archive`, `sdd-constitution`
- Recommended external skills such as `simplify` and `playwright-cli`

### Configuration Options

| Option | Description |
| --- | --- |
| `--agent=opencode|codex` | Select the harness target explicitly |
| `--tmux=yes|no` | Enable tmux integration for OpenCode |
| `--skills=yes|no` | Install recommended external skills and bundled repo skills |
| `--no-tui` | Run without the interactive installer UI |
| `--dry-run` | Simulate install without writing files |
| `--reset` | Refresh managed generated files and config blocks |

## Interactive and Explicit Commands

Use the no-argument TUI for interactive status, list, update, sync, and model
preview flows:

```bash
npx thoth-agents@latest
```

The CLI help also exposes explicit command names:

```bash
npx thoth-agents@latest status
npx thoth-agents@latest list
npx thoth-agents@latest update
npx thoth-agents@latest sync
npx thoth-agents@latest model
```

Preview flows describe managed targets and backup expectations before any apply
step. OpenCode update/sync messaging refers to the plugin config entry
`plugin: ["thoth-agents@latest"]`; it should not be read as evidence that a
global npm binary exists.

### After OpenCode Installation

Authenticate with your OpenCode provider:

```bash
opencode auth login
```

Then start OpenCode and verify the roster:

```bash
opencode
```

Inside OpenCode:

```text
ping all agents
```

The generated OpenCode config can be edited at:

- `~/.config/opencode/thoth-agents.json`
- `~/.config/opencode/thoth-agents.jsonc`

For alternative OpenCode providers and mixed-model presets, see
[Provider Configurations](provider-configurations.md).

## Codex Setup

Codex install is separate from the OpenCode plugin install:

```bash
npx thoth-agents@latest install --agent=codex --dry-run
npx thoth-agents@latest install --agent=codex
```

The Codex path writes only managed Codex targets:

- `~/.codex/AGENTS.md` managed thoth-agents root guidance block
- `~/.codex/agents/thoth-agents-{role}.toml` for `explorer`, `librarian`,
  `oracle`, `designer`, `quick`, and `deep`
- `~/.codex/plugins/thoth-agents/` Personal plugin source
- `~/.agents/plugins/marketplace.json` Personal marketplace entry
- Managed feature flags in `~/.codex/config.toml`, when consented

Restart Codex after install, then review:

```text
/plugins
/hooks
```

Codex install does not create a selectable orchestrator TOML and does not bypass
Codex trust review. Role permissions, memory governance, provider-per-agent
settings, and hook behavior remain instruction-level or user-managed unless
Codex documents hard controls for those surfaces.

See [Codex Install](codex-install.md),
[Codex Plugin Packaging](codex-plugin-packaging.md), and
[Codex Model Customization](codex-model-customization.md) for the focused Codex
details.

## Claude Code Setup

Claude Code install writes one auto-discovered plugin package:

```bash
npx thoth-agents@latest install --agent=claude --dry-run
npx thoth-agents@latest install --agent=claude
```

The plugin is installed as a **skills-directory plugin** under
`~/.claude/skills/thoth-agents` with `.claude-plugin/plugin.json`, seven agents
in `agents/` (six specialists + an `orchestrator`), an `.mcp.json` server map,
bundled `skills/`, and a plugin-root `settings.json` with
`{ "agent": "orchestrator" }`. That `agent` key activates the orchestrator as
the Claude Code **main thread** (replacing the default system prompt), so the
session starts in delegate-first mode and bootstraps thoth-mem on its first
turn. It auto-loads as `thoth-agents@skills-dir` on the next session (no
marketplace, no install step) — restart Claude Code or run `/reload-plugins` to
activate it, and confirm in `/plugin` → Installed. To use plain Claude Code in a
project, disable the plugin there (`/plugin disable thoth-agents@skills-dir`).

Claude Code is a first-class harness: role permissions are enforced by each
subagent frontmatter `tools` allowlist, hooks are harness-run, and delegation
uses the native `Task(subagent_type: ...)` flow. Subagent models accept only
`sonnet`, `opus`, `haiku`, or `inherit`.

See [Claude Code Plugin Packaging](claude-code-plugin-packaging.md) for the
focused details.

## Non-Destructive Behavior

By default, the installer avoids overwriting unmanaged user content. When a
managed file or block is refreshed, backups are created where the installer
supports them.

Use `--reset` to repair or refresh managed generated targets:

```bash
npx thoth-agents@latest install --reset
```

For Codex, `--reset` refreshes managed blocks and generated targets; it does
not delete unrelated plugins, marketplaces, config directories, or user files.

## For LLM Agents

If you are helping a user set up thoth-agents, first identify the target
harness.

### OpenCode Path

```bash
opencode --version
npx thoth-agents@latest install --agent=opencode --no-tui --tmux=no --skills=yes
```

Ask the user to authenticate if interaction is required:

```bash
opencode auth login
```

Then ask the user to verify with:

```text
ping all agents
```

### Codex Path

```bash
npx thoth-agents@latest install --agent=codex --dry-run
npx thoth-agents@latest install --agent=codex
```

Ask the user to restart Codex and complete `/plugins` and `/hooks` trust review.

### Follow-Up Docs

- [README orientation](../README.md)
- [Provider Configurations](provider-configurations.md)
- [Quick Reference](quick-reference.md)
- [SDD Pipeline](sdd-pipeline.md)
- [Skills and MCPs](skills-and-mcps.md)

---

## Troubleshooting

### Installer Fails

Check available options:

```bash
npx thoth-agents@latest install --help
```

### Agents Not Responding In OpenCode

1. Check auth status:

   ```bash
   opencode auth status
   ```

2. Verify the OpenCode plugin config exists:

   - `~/.config/opencode/thoth-agents.json`
   - `~/.config/opencode/thoth-agents.jsonc`

3. Confirm the provider is configured in OpenCode.

### Codex Roles Or Skills Not Available

1. Restart Codex after install.
2. Review plugin state with `/plugins`.
3. Review hook state with `/hooks`.
4. Confirm the install was run with `--agent=codex`.

### Editor Validation

Add a `$schema` reference for autocomplete and inline validation:

```jsonc
{
  "$schema": "https://unpkg.com/thoth-agents@latest/thoth-agents.schema.json"
}
```

### Tmux Integration Not Working

Tmux integration is OpenCode-scoped. Run OpenCode with a port that matches
`OPENCODE_PORT`:

```bash
tmux
export OPENCODE_PORT=4096
opencode --port 4096
```

See the [Tmux Integration Guide](tmux-integration.md) for more detail.

---

## Uninstallation

### OpenCode

1. Remove `"thoth-agents"` from the `plugin` array in
   `~/.config/opencode/opencode.json` or `opencode.jsonc`.
2. Optionally remove generated config files:
   `~/.config/opencode/thoth-agents.json`,
   `~/.config/opencode/thoth-agents.jsonc`, and any managed backup next to
   those files.

3. Optionally remove recommended external skills:

   ```bash
   npx skills remove simplify
   npx skills remove playwright-cli
   ```

### Codex

Remove the managed thoth-agents block from `~/.codex/AGENTS.md`, remove the
generated `~/.codex/agents/thoth-agents-{role}.toml` files, remove the Personal
plugin source at `~/.codex/plugins/thoth-agents/`, and remove the matching
Personal marketplace entry if you no longer use it.
