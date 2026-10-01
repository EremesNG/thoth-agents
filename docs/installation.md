# Installation

thoth-agents supports OpenCode, Codex, Claude Code, and Pi. The distributions share
one six-role and AI-first execution contract. Installation uses the CLI
for every harness, while Codex additionally requires a CLI-managed global
orchestration layer that its plugin manifest cannot provide.

## Requirements

- Node.js `>=22.19`
- One supported harness installed separately
- Permission to install/trust the selected plugin
- Network access during installation for the plugin, external skills, and
  provider-owned thoth-mem setup

The five thoth-owned workflow skills are packaged. Codex and Claude discover
them through their native plugin managers; the OpenCode installer synchronizes
them into `~/.config/opencode/skills/`. The installer obtains the four mandatory
external skills from their canonical repositories with `npx skills add`, then
published installs invoke thoth-mem's public setup command. An explicit local Pi
package install omits that provider step. Once installed, workflow operations load local
contracts and provider guidance without consuming either CLI or the network.

Nested package installation is non-interactive: the CLI confirms both `npx`
package acquisition and the `skills` operation explicitly. On Windows it passes
each complete `npx` command as one `cmd.exe /c` payload and invokes the
extension-neutral `codex` command, supporting both standalone `codex.exe` and
npm's `codex.cmd` shim. Linux and macOS execute those commands directly.

## Supported flow

| Harness | Native/plugin step | Required completion step |
| --- | --- | --- |
| OpenCode | `npx thoth-agents@latest install --agent=opencode` configures thoth-agents, globally synchronizes owned and external skills, and sets up thoth-mem | Restart, then `/thoth-init` in each repository for minimum `.thoth/` governance |
| Codex | `npx thoth-agents@latest install --agent=codex` registers the marketplace and installs the plugin through Codex's native manager | The same command applies the global layer, external skills, and thoth-mem; restart, then `$thoth-init` per repository |
| Claude Code | Add the central marketplace and install `thoth-agents@thoth-plugins` | `npx thoth-agents@latest install --agent=claude` installs external skills and thoth-mem; restart, then `/thoth-agents:thoth-init` per repository |
| Pi | `npx thoth-agents@latest install --agent=pi` installs and proves the executing first-party package before `npm:@thoth-agents/pi-subagents@>=1.0.0` and the research packages | The package injects one bounded adaptive-root block, configures lean child resources with continuation disabled, synchronizes five Thoth specialist definitions, exposes its owned skills, and the CLI invokes provider-owned `thoth-mem setup pi` |

## Common CLI options

| Option | Meaning |
| --- | --- |
| `--agent=opencode\|codex\|claude\|pi` | Select the installation target. |
| `--local-package-root=PATH` | Install a built local package root for Pi; the normalized path must be absolute, requires `--agent=pi`, and omits thoth-mem setup. |
| `--local-pi-runtime-root=PATH` | Use a local checkout of the Pi delegation runtime; the normalized path must be absolute and requires `--agent=pi`. Intended for local development. |
| `--dry-run` | Print native-manager and thoth-agents plans; published installs also invoke thoth-mem with its zero-write `--plan` mode. |
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

The CLI also writes the six-role OpenAI preset, synchronizes all five packaged
thoth-owned skills into `~/.config/opencode/skills/`, and installs all four
external skills with `npx skills add`. Status and repair verify the resulting
global discovery targets. It then requires provider-owned thoth-mem setup to
complete. Restart OpenCode and invoke `/thoth-init`; it only preflights and
initializes missing `.thoth/` governance, including `.thoth/constitution.md`
and `.thoth/specs/`, while preserving existing project-owned content. It refuses
a legacy active OpenSpec tree rather than creating a duplicate store. SDD phases
resolve references, templates and validators directly from the globally
installed `thoth-sdd` skill.
An older globally materialized `thoth-work` skill may remain after upgrade and
may still appear in native discovery. Inspect it and explicitly retire it if
appropriate; setup never deletes unknown or modified global content. No Kimi,
Copilot, ZAI/GLM, or mixed-provider preset is generated.

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
- `~/.codex/agents/thoth-agents-{explorer,librarian,oracle,designer,worker}.toml`;
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
`$thoth-init`; this preflights and creates only missing `.thoth/` governance,
preserving existing project-owned content. It does not install agents, global
instructions, or project template copies; the installed `thoth-sdd` skill
supplies the record template.

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
orchestrator, five namespaced subagents, MCP configuration, and thoth-owned skill
tree natively. The CLI installs and verifies the external skills, then invokes
thoth-mem's Claude setup. Init preflights and synchronizes only the minimum
`.thoth/` governance; SDD templates remain in the installed plugin skill.

Claude owns marketplace snapshots, cache files, enablement, and packaged model
defaults; thoth-agents never edits that cache.

## Pi

Pi requires `@earendil-works/pi-coding-agent` `0.86.1` or a compatible
evidenced release and Node.js `>=22.19`. Preview the complete global setup
before applying it:

```bash
npx thoth-agents@latest install --agent=pi --dry-run
npx thoth-agents@latest install --agent=pi
```

For local development, install checkout dependencies with `pnpm install`, then
run this command from the checkout (the Pi equivalent of `setup:codex:local`):

```bash
pnpm run setup:pi:local
```

It builds first, then runs the built CLI with `--agent=pi`, the checkout's
absolute `--local-package-root`, and the fork's absolute `--local-pi-runtime-root`
(`pi-packages/pi-subagents`), including paths with spaces. This installs the
checked-out runtime directly and does not require publishing it to npm. Installer
failures propagate to the command. Restart Pi and open a new session after
successful setup.

To preview installation, use `pnpm run setup:pi:local --dry-run`. This still
builds local artifacts, but the installer does not change global Pi state.
Existing package conflicts still require explicit manual recovery; this shortcut
does not remove packages or install thoth-mem.

The equivalent explicit commands remain available:

```bash
pnpm run build
node dist/cli/index.js install \
  --agent=pi \
  --local-package-root="<absolute-path-to-checkout>" \
  --local-pi-runtime-root="<absolute-path-to-checkout>/pi-packages/pi-subagents"
```

The local first-party package is installed from the checkout path, and the local
runtime path supplies the fork in place of its npm source. The flow performs the
same receipt verification, remaining external package and skill installation,
and final ledger commit as the public form, but deliberately omits thoth-mem
setup. Install thoth-mem from its own local checkout as a separate command:

```bash
node <absolute-thoth-mem-root>/dist/index.js setup pi --local-package-root="<absolute-thoth-mem-root>"
```

The CLI installs and verifies these Pi packages in order:

1. the exact executing `npm:thoth-agents@<version>` first-party package, or the
   explicit local package root selected by `--local-package-root`;
2. `npm:@thoth-agents/pi-subagents@>=1.0.0` for native direct specialist
   execution and task-ID lifecycle control (package version `1.0.0`; local
   development can provide the fork path through `--local-pi-runtime-root`);
3. `@upstash/context7-pi@0.1.2` as a native Context7 extension;
4. `pi-web-access@0.27.0` as the native web extension exposing the default
   `web_search`, `fetch_content`, `get_search_content`, and `source_check` tools;
5. `pi-mcp-adapter@2.32.1` only for the anonymous grep.app MCP endpoint;
6. `@juicesharp/rpiv-ask-user-question@2.9.0` for the root's interactive
   `ask_user_question` dialog;

Task/progress extensions are optional and operator-owned. Thoth uses an available
task tool according to its actual name and schema, or lightweight written progress
if none is available; missing tooling never blocks the workflow. Setup and update
do not install or remove task extensions, and status does not require them.
Previously installed `@juicesharp/rpiv-todo` remains untouched; users decide whether
to keep it. Progress tracking never replaces native delegation or `.thoth/`
change records.

The incumbent `pi-subagents` runtime and the former `pi-subagents-j0k3r`
package are not supported beside `@thoth-agents/pi-subagents`. When setup detects
either legacy source, it stops before mutation and prints a manual Pi package
manager recovery action; it never deletes a user package or silently loads both
runtimes. Review ownership, remove the conflicting package explicitly with
Pi's package manager, and rerun setup.

Before running complete setup on an installation that has either replaced web
package, remove both with Pi's native package manager:

```bash
pi remove npm:@juicesharp/rpiv-web-tools@2.9.0 --no-approve
pi remove npm:@feniix/pi-exa@5.1.1 --no-approve
```

This is an explicit operator transition. Setup does not uninstall packages,
rewrite web provider configuration, or transfer credentials automatically.

Question cancellation, partial answers, an unavailable tool, or a host without
the required UI leaves the choice unresolved. Package status proves only the
exact installed source; it does not prove interactive UI support, configured
search providers, or successful remote requests. Children report questions and
progress to the root instead of opening dialogs or maintaining the root task list.

Before external setup, the CLI rejects unowned or ambiguous first-party state,
requires configured, loadable, and real-Pi observed evidence, and atomically
commits `${XDG_CONFIG_HOME:-~/.config}/thoth-agents/pi-package.json`. The native
extension supplies one bounded root block per turn; it and the CLI share one
safe synchronizer for exactly five definitions under `~/.pi/agent/agents/`.
Pi discovers the five owned skills from the package manifest. The CLI installs
only the four external skills with `--agent pi --global --yes --copy`. No
orchestrator child is created. Status, previews, and applied results attribute
the five package skills only to the receipt-validated root reported by Pi;
Sync refuses to proceed without that evidence and never copies those skills to
a global skill directory.

Direct `pi install npm:thoth-agents@<version> --no-approve` activates the root
and package skills but may remain degraded until delegation, research, external
skills, and provider setup are completed. Applied Update reruns the complete
first-party-first flow. Sync performs no network or package mutation. Legacy
`APPEND_SYSTEM.md` and copied skill state is retired only when attributable;
modified content remains with a manual action. A failed pre-commit replacement
is compensated to the prior receipt-owned source (or removed if new); failed
compensation prints the exact recovery command and never rewrites the receipt.

Only grep.app uses the MCP adapter. The global
`${XDG_CONFIG_HOME:-~/.config}/mcp/mcp.json` entry is
`mcpServers.grep = {"url":"https://mcp.grep.app","protocolVersion":"legacy","lifecycle":"lazy"}`;
`directTools` is omitted. Unrelated top-level fields and servers are preserved,
while a different existing `grep` definition blocks the operation rather than
being overwritten. Project `.mcp.json` or `.pi/mcp.json` files can shadow the
global entry and are reported, never edited, by global setup.

pi-web-access supports Exa as one provider and can use its keyless public MCP
path when no `EXA_API_KEY` is configured. It does not preserve dedicated pi-exa
answer, similarity, or research-planner tools. Installation never solicits,
copies, or writes provider credentials or configuration. Status reports an
installed web package as unverified until explicit runtime evidence is supplied;
missing or version-drifted package evidence remains drifted. Context7, web
access, and grep.app network/schema health is reported independently from
package and managed-file health. Research output is untrusted data. Every Pi
extension runs with the invoking user's system permissions and may access
process credentials and the network; specialists inherit Pi's available tools,
which is not an OS or credential sandbox. Project-local resources require an
explicit Pi trust decision.

The initial integration supports the default global Pi root only. If
`PI_CODING_AGENT_DIR` redirects discovery away from `~/.pi/agent`, installation
stops before mutation because the external skills CLI would copy to a different
root. Remove the override or follow the printed manual action. If a native
package succeeds and a later step fails, the ledger remains unchanged; resolve
the reported blocker and rerun the idempotent complete flow. Do not delete
unknown Pi packages or provider assets as a recovery shortcut.

Setup safely merges `session_resources: "lean"` and `enable_continue: false`
into the global `<agent-dir>/subagents.json` (normally
`~/.pi/agent/subagents.json`), preserving unrelated settings. Lean resources
filter `before_agent_start` and `session_start` from child sessions, except for
trusted packages in `lifecycle_passthrough` (default: the Claude and Antigravity
bridges; never thoth-agents), which keep their full lifecycle with prompt-shaping
events observe-only; that list is a trust list, not a sandbox. Full child
resources are unsupported. A project-local `subagents.json` can override the
global setting and invalidate lean isolation, so check project configuration
separately.
Definitions do not provide a `PI_SUBAGENT_CHILD` marker, enforced delegation
depth, or tool allowlist; role boundaries remain instruction-level, and
extensions still run with the invoking user's system permissions. The librarian
definition defaults to background mode for provider access; verify the relevant
Context7, web-access, or MCP provider and required tools before claiming
research evidence.

The five specialist definitions use `thoth-` names in both filenames and
frontmatter: `thoth-explorer`, `thoth-librarian`, `thoth-oracle`,
`thoth-designer`, and `thoth-worker`. For example,
`~/.pi/agent/agents/thoth-explorer.md` declares `name: thoth-explorer`.
Generic definitions such as `explorer.md` can coexist; an unowned definition
using a reserved `thoth-` specialist name blocks installation. During explicit
setup or synchronization, obsolete `thoth-quick` and `thoth-deep` definitions
are retired only when their ownership and paths are proven safe. Unowned old
role files and an unowned `thoth-worker` collision are preserved and reported;
old role model or effort customizations are not copied to Worker.

Each fresh assignment uses one `subagent_run` call with a canonical specialist
and a bounded task. Omit `mode` to follow the selected definition and
configuration; the runtime defaults to background when both omit it. Use
`mode:"task"` only when the user asks you to wait for completion; this explicit
choice is preserved. Launch separate ready background assignments before
collecting results; root
coordinates readiness, dependencies, and acceptance. Use
`subagent_status({task_id})`, `subagent_result({task_id})`, and
`subagent_cancel({task_id})` only for a known task. Terminal notifications wake
the parent, so return control rather than polling. A cancellation acknowledgement
alone does not prove termination, and continuation is disabled by configuration.

Children run in the owning Pi session. Graceful session shutdown cancels active
children; abrupt shutdown or cleanup of arbitrary descendants is not guaranteed.
Do not invent batch, fresh-context, workflow, depth-enforcement, or child-marker
controls absent from the runtime contract. Lean filters extension lifecycle
hooks, not process permissions or host tools.

Pi specialists use the shared OpenAI role preset through the `openai-codex`
provider. The ambient root retains Pi's selected model and effort settings:

| Specialist | Model | Effort |
| --- | --- | --- |
| explorer | `openai-codex/gpt-6-luna` | `low` |
| librarian | `openai-codex/gpt-6-luna` | `high` |
| oracle | `openai-codex/gpt-6-astra` | `medium` |
| designer | `openai-codex/gpt-6-sol` | `medium` |
| worker | `openai-codex/gpt-6-luna` | `max` |

Definitions use runtime-supported `model`, `effort`, and `subagent_mode` fields.
Synchronization migrates legacy `thinking` values to `effort`, preserves
explicit model and effort overrides (including `max`), and translates legacy
`model: default` to `model: inherit`. Inheritance stays unpinned by omitting an
effort value; explicit models retain their provider-qualified IDs. Use a
provider/model available in the local Pi catalog; installation does not
authenticate providers or silently substitute models.

### Configure subagent model profiles inside Pi

Run `/subagents-model` in Pi's interactive TUI to edit model and effort profiles
for global or project subagent definitions. The editor saves each profile to the
configuration scope that owns its definition: global profiles go in
`~/.pi/agent/subagents.json` (or `$PI_CODING_AGENT_DIR/subagents.json`), while
project profiles go in `.pi/subagents.json`. Resolution for each model and effort
field is `model_profiles` first, then definition frontmatter, then the matching
configuration default, then the parent value. Reload Pi after updating the
`@thoth-agents/pi-subagents` runtime to register the command.

### Configure specialist tools inside Pi

Run `/subagents-tools` in Pi's interactive TUI to configure the **global** five
specialists. The panel discovers registered tools from your current Pi environment,
including tools supplied by user extensions and MCP integrations; Thoth does not
maintain a fixed catalog of those tools.

- Use ↑/↓ and Enter to choose a specialist. In its tool list, use Space to toggle
  a selection. Enter or Escape returns to the overview.
- Press `*` for the single dynamic selector **active root tools** (`*`): tools
  currently active in the root session when a child starts, excluding
  `subagent_*`, root-only `ask_user_question`/`todo` controls, and delegation tools
  `AskClaude`, `AskAntigravity`, `bg_delegate`, `bg_run_pi_attested`, `bg_result`,
  `fusion_reason`, `fusion_investigate`, `fusion_research` and `fusion_validate`.
  Inactive registered tools are not inherited. Ordinary shell-job tools remain
  eligible: those of the vendored `@thoth-agents/pi-background-tasks`
  (`bg_task_*`, `bg_status`) and, if an operator still uses the npm
  `pi-background-tasks`, its `bg_run`, `bg_status`, `bg_logs` and `bg_kill`.
  This choice replaces that role's explicit list. Toggling an individual checkbox
  turns it into a current explicit list, ending dynamic inheritance. Registered
  inactive tools are labeled `(inactive)` and can be selected explicitly; saved
  explicit names absent from the registry remain `(unavailable)` and can be
  removed individually. These delegation names are also permitted in explicit
  lists, not inherited by `*`.
- Press `r` to restore that role's packaged defaults: `read, bash` for Explorer
  and Oracle; additionally `edit, write` for Designer and Worker; the historical
  research tools for Librarian. Defaults can include currently unavailable tools.
- Press `s` on the overview to save. Escape or Ctrl-C cancels, with confirmation
  before discarding a dirty draft. Draft edits do not write files.
- Selections must contain at least one explicit name or standalone `*`.
  `@active` is rejected with a diagnostic directing you to `*`; it is not an alias
  or an explicit tool name. Mixed selectors, other patterns, `subagent_*`
  delegation tools and root-only `ask_user_question`/`todo` controls are excluded.
  Empty selections are rejected because the runtime can substitute default tools.
- Saved lists remain in `~/.pi/agent/agents/thoth-*.md` (or Pi's configured agent
  directory), survive synchronization/reinstallation and model-panel saves, and
  do not change models, effort, mode or the parent's active tools. Project-local
  definitions may shadow these global definitions. Running children are unchanged.
- Discovery refreshes when the panel is reopened. Explicit lists stay fixed;
  `*` resolves current eligible active tools at each child launch.
- Ownership, safe-path, stale-file and recoverable per-file write checks match
  the models panel. Unsupported overrides, including the removed selector, are
  preserved unchanged with diagnostics during synchronization, without resetting
  them to broader defaults. Fix those definitions explicitly before using them.

For standalone `*`, tools the child cannot load are dropped: the child runs with
its available subset and reports dropped names as durable warnings in status,
results and completion messages. If none can load, launch still fails; unexpected
extra child tools also remain an error. Runtime explicit lists and glob patterns
stay strict and fail with a missing-implementation diagnostic if a selected tool
cannot load. The panel itself does not accept glob patterns.

A selected name does not prove the child's runtime registered or initialized that
extension, MCP connection or credentials. Verify a real child invocation. Tool
selection and the `*` exclusions are **not an OS sandbox**: shell and MCP tools
can still launch agents indirectly. A child with `bash` can also execute installed
CLIs such as `codegraph` even without a directly exposed CodeGraph MCP tool.

This command requires Pi's interactive TUI and tool-discovery APIs; unsupported
hosts receive a diagnostic without configuration writes. Reload Pi after updating
the extension to register the command.

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

Published `npx thoth-agents@latest install` delegates provider mutation to
thoth-mem's documented administrative surface after the harness layer and
mandatory skills:

| Harness | Provider command invoked by thoth-agents |
| --- | --- |
| OpenCode | `npx -y thoth-mem@latest setup opencode --json` |
| Codex | `npx -y thoth-mem@latest setup codex --json` |
| Claude Code | `npx -y thoth-mem@latest setup claude --json` |
| Pi | `npx -y thoth-mem@latest setup pi --json` |

With `--dry-run`, thoth-agents adds `--plan` before `--json`. It does not pass
`--force`, even when thoth-agents itself receives `--reset`.

The explicit Pi `--local-package-root` flow is the exception: it never invokes
thoth-mem, prints the separate local provider command, and records only the
completed thoth-agents installation in its CLI ledger.

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
permission. `.thoth/` holds active change records, durable contracts, and
constitution; historical material remains preserved. Project work is not mirrored into thoth-mem.

## Limitations

| Harness | Limitation |
| --- | --- |
| OpenCode | CLI installation is required for global owned skills, external skills, and thoth-mem setup; npm plugins cannot declare package-relative native skill roots, and only the OpenAI built-in preset ships. |
| Codex | Plugin manifests cannot install custom agents or write `~/.codex/AGENTS.md`; the CLI layer and provider setup are mandatory. Installed-role selection and some permissions remain instruction-level. |
| Claude Code | Native marketplace/install steps must precede the CLI and provider setup. Native tool denials protect read-only roles, but fine-grained write-path restriction remains instruction-level. |
| Pi | Pi extensions execute with the invoking user's system permissions; tool allowlists are not an OS sandbox, project-local resources require trust, and continuation/live steering depend on the installed delegation runtime. |

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
npx thoth-agents@latest update --harness=pi --apply
```

Applied Update is installation-equivalent for the selected harness:

| Harness | Complete refresh order |
| --- | --- |
| OpenCode | Exact plugin pin and managed configuration, global thoth-owned skills, required external skills, provider setup, then the CLI record |
| Codex | Native plugin-manager setup, global agent pack/configuration, required external skills, provider setup, then the CLI record |
| Claude Code | Native marketplace/plugin refresh, required external skills, provider setup, then the CLI record |
| Pi | Receipt-bound first-party package proof, five specialist synchronization, five minimum-constrained native/adapter packages, exact grep.app entry, required external skills, provider setup, then the CLI record |

The versioned CLI-owned ledger is located at
`${XDG_CONFIG_HOME:-~/.config}/thoth-agents/install-state.json`. It keeps
independent `opencode`, `codex`, `claude`, and `pi` records. Each record is the version
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
npx thoth-agents@latest model --harness=codex --role=worker --model=gpt-6-luna --effort=max
```

Install is required for every harness; the other operations are optional
conveniences. `--reset` affects only bounded thoth-agents-managed targets; it
does not rewrite marketplace snapshots, plugin caches, unrelated skills, or
provider state.


## Restore model defaults

In the interactive CLI, open a harness, choose **Configure models**, then
**Restore defaults**. The preview lists every managed role's model and reasoning
effort from the package you are running. Choose **Apply** to replace existing
values. **Cancel** is selected initially; returning to the editor preserves any
unapplied manual edits. A successful restore reloads saved values and clears
those edits.

OpenCode restores six roles, including its orchestrator. Codex and Pi restore
five specialists; their ambient root model remains host-owned. Other settings,
prompts and permissions are preserved. Catalog and runtime validation still
apply: resolve any reported blocker before applying.

Claude Code also exposes the preview, but application remains blocked because
its plugin cache and packaged defaults belong to the native plugin manager.

Update and Sync preserve explicit model choices; they do not adopt new defaults.
Restoration saves the current package's recommendations as explicit values and
does not enable automatic adoption of future defaults.

For a local checkout, build the current source before opening its CLI:

```powershell
pnpm run build
node .\dist\cli\index.js
```

Then use **Configure models → Restore defaults → Apply** for the intended
harness. Check the target paths in the preview; an environment override such as
`CODEX_HOME` can redirect where the CLI writes.
