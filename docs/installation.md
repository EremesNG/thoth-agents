# Installation

thoth-agents supports OpenCode, Codex, and Claude Code. The distributions share
one seven-role and Spec Kit-compatible SDD contract. Installation uses the CLI
for every harness, while Codex additionally requires a CLI-managed global
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
| Claude Code | Add the central marketplace and install `thoth-agents@thoth-plugins` | `npx thoth-agents@latest install --agent=claude` installs external skills and thoth-mem; restart, then `/thoth-agents:thoth-init` per repository |

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

`@latest` selects the CLI release to execute. The CLI resolves that package's
version before any managed write and puts the exact version in OpenCode
configuration, for example `thoth-agents@0.4.8`. It replaces bare, tagged, or
older thoth-agents entries with one exact entry while preserving unrelated
plugins. If package identity or version cannot be verified, installation fails
before changing configuration and never substitutes `latest`.

The CLI also writes the seven-role OpenAI preset, synchronizes all five packaged
thoth-owned skills into `~/.config/opencode/skills/`, and installs all four
external skills with `npx skills add`. Status and repair verify the resulting
global discovery targets. It then requires provider-owned thoth-mem setup to
complete. Restart OpenCode and invoke `/thoth-init`; it only preflights and
synchronizes the minimum `openspec/` governance structure while preserving
existing constitutions. SDD phases resolve templates directly from the globally
installed `thoth-sdd` skill; init leaves any legacy `openspec/templates/` tree
untouched. No Kimi, Copilot, ZAI/GLM, or mixed-provider preset is generated.

## Codex

Close Codex, preview, then run the combined native-plugin and
global-orchestration setup:

```bash
npx thoth-agents@latest install --agent=codex --dry-run
npx thoth-agents@latest install --agent=codex
```

The CLI inspects Codex's JSON manager state, registers
`https://github.com/EremesNG/thoth-plugins.git` as `thoth-plugins` when absent,
and installs or enables `thoth-agents@thoth-plugins` with `codex plugin add`.
It fails closed for an unreadable manager state or a marketplace with the same
name from another source, and verifies the enabled plugin after mutation. The
central catalog pins the shared `plugin/` bundle to an immutable product tag.
Only after verifying the executing-version central plugin does it remove the
registered legacy plugin IDs `thoth-agents@thoth-agents` and
`thoth-agents@thoth-agents-codex`, followed by marketplaces `thoth-agents` and
`thoth-agents-codex`, through official manager commands.

If an orphan remains, the only eligible paths are
`plugins/cache/{thoth-agents,thoth-agents-codex}` and
`.tmp/marketplaces/{thoth-agents,thoth-agents-codex}` below the resolved
`CODEX_HOME`. They must pass product-manifest, provenance, real-descendant,
directory, and non-link validation before mutation and again before deletion.
Sibling and unrelated paths remain untouched. A race or lock retains the
central plugin and asks the operator to keep Codex closed and retry. Restart is
needed for activation, not for cache garbage collection.

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
delegates normal marketplace and plugin mutations to the native manager and
owns only the bounded legacy-root fallback above.

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
claude plugin marketplace add https://github.com/EremesNG/thoth-plugins.git --scope user
claude plugin install thoth-agents@thoth-plugins --scope user
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

## Updates and authoritative install state

Rerunning the latest installer and applying Update are the two supported update
paths. Update previews by default; add `--apply` only after reviewing the plan:

```bash
npx thoth-agents@latest update --harness=opencode
npx thoth-agents@latest update --harness=opencode --apply
npx thoth-agents@latest update --harness=codex --apply
npx thoth-agents@latest update --harness=claude --apply
```

Applied Update is installation-equivalent for the selected harness:

| Harness | Complete refresh order |
| --- | --- |
| OpenCode | Exact plugin pin and managed configuration, global thoth-owned skills, required external skills, provider setup, then the CLI record |
| Codex | Native plugin-manager setup, global agent pack/configuration, required external skills, provider setup, then the CLI record |
| Claude Code | Native marketplace/plugin refresh, required external skills, provider setup, then the CLI record |

The versioned CLI-owned ledger is located at
`${XDG_CONFIG_HOME:-~/.config}/thoth-agents/install-state.json`. It keeps
independent `opencode`, `codex`, and `claude` records. Each record is the version
of the CLI release that most recently completed every required step for that
harness; it is not a native plugin version.

For existing installations, a missing ledger is expected until each harness
first completes installation or applied Update under this contract. Status
reports that harness's record as missing rather than inferring it from OpenCode
package state or a Codex/Claude marketplace. Rerun the latest installer or apply
Update once per harness to establish its record.

Existing native installations may still contain the bare `thoth-agents`
identity or the former `thoth-agents-codex` and `thoth-agents-claude`
identities. Native managers key marketplace/plugin state by catalog name, so
the current Codex installer verifies `thoth-agents@thoth-plugins` first and then
retires only its two documented Codex identities and four exact safe roots.
Claude installation continues to preserve its legacy entries and cache.

The CLI commits the selected harness record last using temporary-file
replacement. A preview, dry-run, cancellation, or failed native, managed,
required-skill, provider, or ledger step does not advance the record; the
previous completed version remains authoritative. A malformed ledger also
remains untouched after earlier failures. Once a complete operation is ready to
record success, the CLI preserves the malformed file as `install-state.json.bak`
and replaces it with valid schema-v1 state.

Codex and Claude marketplace managers continue to own native plugin versions,
trust, snapshots, and normal cache lifecycle. The bounded Codex legacy cleanup
does not change the ledger until every later CLI/provider step also succeeds. A
native marketplace update neither changes this ledger nor proves that the
CLI-managed global agents, skills, configuration, or provider setup were
refreshed. Use `status` to compare the executing CLI version with the recorded
complete-install version.

OpenCode runtime checks only notify when a newer release exists. They do not
rewrite the exact plugin entry, invalidate package state, or install packages in
the background. Follow the notification by rerunning
`npx thoth-agents@latest install --agent=opencode` or applying interactive or
command-line Update.

## Status, update, and repair

```bash
npx thoth-agents@latest status
npx thoth-agents@latest status --harness=codex
npx thoth-agents@latest update --harness=codex
npx thoth-agents@latest update --harness=codex --apply
npx thoth-agents@latest sync --harness=codex --apply
npx thoth-agents@latest model --harness=codex --role=deep --model=gpt-5.6-sol
```

Install is required for every harness; the other operations are optional
conveniences. `--reset` affects only bounded thoth-agents-managed targets; it
does not rewrite marketplace snapshots, plugin caches, unrelated skills, or
provider state.
