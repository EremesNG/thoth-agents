# Installation

thoth-agents 0.3.0 supports OpenCode, Codex, and Claude Code. The distributions
share one seven-role and Spec Kit-compatible SDD contract. Installation uses the
CLI for every harness, while Codex additionally requires a CLI-managed global
orchestration layer that its plugin manifest cannot provide.

## Requirements

- Node.js `>=22.13`
- One supported harness installed separately
- Permission to install/trust the selected plugin
- Network access during installation for the plugin, external skills, and
  provider-owned thoth-mem setup

The five thoth-owned workflow skills are packaged. Codex and Claude discover
them through their native plugin managers; the OpenCode installer synchronizes
them into `~/.config/opencode/skills/`. The installer obtains the four mandatory
external skills from their canonical repositories with `npx skills add`, then
invokes thoth-mem's public setup command. Once installed, SDD phases load local
contracts and provider guidance without consuming either CLI or the network.

Nested package installation is non-interactive: the CLI confirms both `npx`
package acquisition and the `skills` operation explicitly. On Windows it passes
each complete `npx` command as one `cmd.exe /c` payload and invokes the
extension-neutral `codex` command, supporting both standalone `codex.exe` and
npm's `codex.cmd` shim. Linux and macOS execute those commands directly.

## Supported flow

| Harness | Native/plugin step | Required completion step |
| --- | --- | --- |
| OpenCode | `npx thoth-agents@latest install --agent=opencode` configures thoth-agents, globally synchronizes owned and external skills, and sets up thoth-mem | Restart, then `/thoth-init` in each repository to initialize `openspec/` |
| Codex | `npx thoth-agents@latest install --agent=codex` registers the marketplace and installs the plugin through Codex's native manager | The same command applies the global layer, external skills, and thoth-mem; restart, then `$thoth-init` per repository |
| Claude Code | Add marketplace and install `thoth-agents@thoth-agents` | `npx thoth-agents@latest install --agent=claude` installs external skills and thoth-mem; restart, then `/thoth-agents:thoth-init` per repository |

## Common CLI options

| Option | Meaning |
| --- | --- |
| `--agent=opencode\|codex\|claude` | Select the installation target. |
| `--dry-run` | Print native-manager and thoth-agents plans, then invoke thoth-mem with its zero-write `--plan` mode. |
| `--reset` | Repair only thoth-agents-managed targets; it never becomes thoth-mem `--force`. |
| `--no-tui` | Force the non-interactive path. |
| `--tmux=yes\|no` | Configure OpenCode tmux integration; it does not apply to Codex or Claude. |

## OpenCode

```bash
npx thoth-agents@latest install --agent=opencode --dry-run
npx thoth-agents@latest install --agent=opencode
```

The CLI adds `thoth-agents@latest` to OpenCode configuration, writes the
seven-role OpenAI preset, synchronizes all five packaged thoth-owned skills into
`~/.config/opencode/skills/`, and installs all four external skills with `npx
skills add`. Status and repair verify the resulting global discovery targets.
It then requires provider-owned thoth-mem setup to complete. Restart OpenCode
and invoke `/thoth-init`; it only preflights and synchronizes the minimum
`openspec/` governance structure while preserving existing constitutions. SDD
phases resolve templates directly from the globally installed `thoth-sdd` skill;
init leaves any legacy `openspec/templates/` tree untouched. No Kimi, Copilot,
ZAI/GLM, or mixed-provider preset is generated.

## Codex

Preview, then run the combined native-plugin and global-orchestration setup:

```bash
npx thoth-agents@latest install --agent=codex --dry-run
npx thoth-agents@latest install --agent=codex
```

The CLI inspects Codex's JSON manager state, registers `EremesNG/thoth-agents`
when absent, and installs or enables `thoth-agents@thoth-agents` with `codex
plugin add`. It fails closed for an unreadable manager state or a marketplace
with the same name from another source, and verifies the enabled plugin after
mutation. The repository catalog `.agents/plugins/marketplace.json` points to
the shared `plugin/` bundle.

The remaining CLI setup manages:

- `~/.codex/AGENTS.md`: one bounded orchestrator block;
- `~/.codex/agents/thoth-agents-{explorer,librarian,oracle,designer,quick,deep}.toml`;
- `~/.codex/agents/.thoth-agents-managed-models.json`;
- `~/.codex/config.toml`: the managed feature merge; and
- mandatory external skills in the Codex global skill root via `npx skills add`.

After those thoth-agents-owned operations, the CLI invokes thoth-mem's Codex
setup and preserves its diagnostics, manual actions, and receipt path.

The ambient Codex session is root, so no orchestrator child TOML exists. The CLI
does not copy a plugin into a personal manager cache or bypass Codex trust; it
delegates marketplace and plugin mutations to the native manager.

Restart Codex after the CLI step. In every target repository invoke
`$thoth-init`; this preflights and synchronizes only the minimum `openspec/`
governance. It does not install agents, global instructions, or project template
copies; the plugin's installed `thoth-sdd` skill remains the template source.

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
tree natively. The CLI installs and verifies the external skills, then invokes
thoth-mem's Claude setup. Init preflights and synchronizes only the minimum
`openspec/` governance; workflow templates remain in the installed plugin skill.

Claude owns marketplace snapshots, cache files, enablement, and packaged model
defaults; thoth-agents never edits that cache.

## Skill ownership

All harness distributions carry only thoth-owned workflow skills: `thoth-init`,
`thoth-sdd`, `thoth-constitution`, `thoth-archive`, and `plan-reviewer`.
OpenCode installation materializes these five under its global user skill root;
`thoth-init` never installs them or copies their workflow templates into a
project.

The CLI installs `simplify`, `tdd`, `progressive-context-router`, and
`architectural-grilling` from their canonical GitHub repositories using the
skills CLI. This deliberately avoids vendored copies and makes those
repositories the single source of truth. Browser, visual, integration, and
end-to-end QA executables remain project-owned.

## thoth-mem companion setup

`npx thoth-agents@latest install` delegates provider mutation to thoth-mem's
documented administrative surface after the harness layer and mandatory skills:

| Harness | Provider command invoked by thoth-agents |
| --- | --- |
| OpenCode | `npx -y thoth-mem@latest setup opencode --scope global --json` |
| Codex | `npx -y thoth-mem@latest setup codex --scope global --json` |
| Claude Code | `npx -y thoth-mem@latest setup claude --scope global --json` |

With `--dry-run`, thoth-agents adds `--plan` before `--json`. It does not pass
`--force`, even when thoth-agents itself receives `--reset`.

The provider result is authoritative:

| thoth-mem status | Combined install result |
| --- | --- |
| `complete` | Success when the process exit code agrees. |
| `failed` | Failure; inspect provider diagnostics. |
| `partial` | Incomplete; follow the printed manual actions and receipt. |
| `requires_user_action` | Incomplete; perform the provider-owned action and retry. |

thoth-mem owns its hooks, MCP, installed skill, lifecycle, persistence, receipts,
and recovery. thoth-agents only invokes the public setup command and reports its
evidence; reset, sync, or removal never edits or removes provider-owned assets.

During normal work, agents follow the installed thoth-mem skill. The root owns
stable session identity and lifecycle. Delegates may receive bounded `none`,
`recall`, or `observe` memory authorization independently of workspace write
permission. `openspec/` remains the canonical SDD store; phase artifacts are not
mirrored into thoth-mem.

## Limitations

| Harness | Limitation |
| --- | --- |
| OpenCode | CLI installation is required for global owned skills, external skills, and thoth-mem setup; npm plugins cannot declare package-relative native skill roots, and only the OpenAI built-in preset ships. |
| Codex | Plugin manifests cannot install custom agents or write `~/.codex/AGENTS.md`; the CLI layer and provider setup are mandatory. Installed-role selection and some permissions remain instruction-level. |
| Claude Code | Native marketplace/install steps must precede the CLI and provider setup. Native tool denials protect read-only roles, but fine-grained write-path restriction remains instruction-level. |

No distribution bundles thoth-mem or project QA executables. thoth-mem remains
an independently owned provider/plugin installed through its own public setup.

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
