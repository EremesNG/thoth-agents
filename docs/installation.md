# Installation Guide

Complete installation instructions for thoth-agents across supported harnesses.
OpenCode is the stable default path. Codex is an explicit setup path with its
own trust review and runtime caveats.

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
| OpenCode default | `npx thoth-agents@latest install` | OpenCode plugin config, optional skills, optional tmux config | You want the stable native plugin flow. |
| OpenCode explicit | `npx thoth-agents@latest install --agent=opencode` | Same as default OpenCode setup | You want to be explicit in automation. |
| Codex explicit | `npx thoth-agents@latest install --agent=codex` | Codex AGENTS block, six role TOMLs, Personal plugin source, marketplace entry, managed feature flags | You want Codex role agents and bundled skills. |

Use `--dry-run` before Codex install when you want to inspect the target plan
and backups before writing files.

## OpenCode Setup

### Prerequisites

- [OpenCode](https://opencode.ai/docs)
- Node.js `>=22.13`
- Corepack with `pnpm@11.2.2`

### Quick Install

Run the interactive installer:

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

### What OpenCode Install Sets Up

The OpenCode path prepares the delegate-first seven-agent roster, generated
provider presets, optional tmux integration, and plugin registration.

When skills are enabled, it also installs or copies:

- Bundled `requirements-interview`
- Bundled `plan-reviewer`
- Bundled `executing-plans`
- Bundled SDD pipeline skills:
  `sdd-init`, `sdd-propose`, `sdd-spec`, `sdd-design`, `sdd-tasks`,
  `sdd-apply`, `sdd-verify`, `sdd-archive`
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

   ```bash
   rm -f ~/.config/opencode/thoth-agents.json
   rm -f ~/.config/opencode/thoth-agents.jsonc
   rm -f ~/.config/opencode/thoth-agents.json.bak
   ```

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
