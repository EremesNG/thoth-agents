<div align="center">
  <img src="img/thoth-agents-header.webp" alt="Five cyber-Egyptian specialists led by Thoth, the Orchestrator" width="100%">
  <h1>Thoth-Agents</h1>
  <p><b>One conversation. The right specialists. A workflow that fits the task.</b></p>
  <p>Adaptive agent orchestration for OpenCode, Codex, Claude Code, and Pi.</p>
  <p>
    <a href="https://www.npmjs.com/package/thoth-agents"><img src="https://img.shields.io/npm/v/thoth-agents?style=flat-square&amp;color=cb9b35&amp;label=npm" alt="npm version"></a>
    <a href="https://github.com/EremesNG/thoth-agents/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/EremesNG/thoth-agents/ci.yml?branch=master&amp;style=flat-square&amp;label=CI" alt="CI status"></a>
    <a href="package.json"><img src="https://img.shields.io/badge/node-%3E%3D22.19-43853d?style=flat-square&amp;logo=node.js&amp;logoColor=white" alt="Node 22.19 or newer"></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-1f6feb?style=flat-square" alt="MIT License"></a>
  </p>
  <p>
    <a href="#why-thoth-agents">Overview</a> ·
    <a href="#install">Install</a> ·
    <a href="#get-started">Get started</a> ·
    <a href="#meet-the-team">The team</a> ·
    <a href="#choose-your-workflow">Workflows</a> ·
    <a href="#documentation">Documentation</a>
  </p>
</div>

> [!WARNING]
> Thoth-Agents is under active development. Core concepts, workflows, and
> specifications are still evolving, and significant breaking changes may occur
> before a stable release.

---

## Why thoth-agents

Describe what you want to build or fix. Thoth keeps the conversation together,
directs specialists to discover and implement by default, and retains your goals,
constraints, decisions, acceptance, and final synthesis in one root thread.

Small changes stay small. Larger changes get a specification, a plan, and
verification you can follow—without manually coordinating every agent.

- **A team, not six conversations.** One adaptive Orchestrator coordinates five
  specialists and brings their results back to you.
- **Proportional process.** Small, clear, low-risk work stays artifact-free;
  substantial work uses one ID-named record and proportionate verification.
- **Specialists execute by default.** Repository discovery, current documentation,
  UI/UX, bounded implementation, and independent review have distinct roles.
- **Models you can tune.** Configure models per role to suit your workflow and
  the providers available in your harness.
- **Continuity between sessions.** Published installs include setup of
  [thoth-mem](https://github.com/EremesNG/thoth-mem), the independent memory
  companion for reusable decisions and project knowledge. thoth-mem owns its own
  memory lifecycle, persistence, and storage; thoth-agents only invokes its setup.

> [!NOTE]
> Pi is the default harness and our recommendation for the best Thoth-Agents
> experience. All four harnesses share the workflow and role design, but their
> permissions, delegation, and runtime capabilities are not identical. Your
> harness's trust and approval rules still apply.

## Install

You need **Node.js `>=22.19`**, a supported harness already installed, and network
access for setup. Authenticate your model providers in that harness separately.
The commands below install at **global/user scope**.

| Harness | What you get | Install command |
| --- | --- | --- |
| <a href="https://github.com/anomalyco/opencode"><picture><source media="(prefers-color-scheme: dark)" srcset="https://svgl.app/library/opencode-dark.svg"><img src="https://svgl.app/library/opencode.svg" alt="OpenCode logo" width="48" height="48"></picture></a><br>**OpenCode** | Native plugin, agent team, workflow skills, and memory setup. | `npx thoth-agents@latest install --agent=opencode` |
| <a href="https://github.com/openai/codex"><img src="https://github.com/openai.png?size=120" alt="OpenAI logo — Codex" width="48" height="48"></a><br>**Codex** | Native plugin plus the required global agent and instruction setup. **Close Codex first.** | `npx thoth-agents@latest install --agent=codex` |
| <a href="https://claude.com/product/claude-code"><img src="https://github.com/anthropics.png?size=120" alt="Anthropic logo — Claude Code" width="48" height="48"></a><br>**Claude Code** | Marketplace agents and skills, completed by the CLI's external skills and memory setup. **Run the prerequisites below first.** | `npx thoth-agents@latest install --agent=claude` |
| <a href="https://github.com/earendil-works/pi"><img src="https://raw.githubusercontent.com/EremesNG/thoth-mem/master/img/pi.svg" alt="Pi logo" width="48" height="48"></a><br>**Pi** | Native package, five specialists, delegation, research, theme, sidebar and background-task extensions, workflow skills, and memory setup. **Recommended for the best experience.** | `npx thoth-agents@latest install --agent=pi` |

### Claude Code prerequisites

Run these two commands **before** the Claude CLI install command in the table:

```bash
claude plugin marketplace add https://github.com/EremesNG/thoth-plugins.git --scope user
claude plugin install thoth-agents@thoth-plugins --scope user
```

> [!TIP]
> Add `--dry-run` to any `npx thoth-agents ... install` command to preview setup
> without writing changes. After installation, restart your harness; Claude Code
> also supports `/reload-plugins`.

Inside Pi, use `/subagents-model` to edit model and effort profiles for global
and project subagent definitions. See [subagent profile configuration](docs/installation.md#configure-subagent-model-profiles-inside-pi).
Both commands are registered by pi-subagents on pi-core's shared list-editor
shell, with native CSI-u/kitty and legacy navigation keys and wheel support in
regular and fullscreen TUI mode. Use `/subagents-tools` to edit resolved global/project definitions' tool
lists, including registered active and inactive extension and MCP tools. Thoth
supplies managed-specialist validation and reset defaults through an optional adapter. Globs (including `*`) are
manual advanced selections over all registered root tools; the panel preserves
them read-only. Edit `disallowed_tools` manually for injected tools and trimming
globs; only Oracle denies `ask_orchestrator` by default. See
[tool selection controls](docs/installation.md#configure-specialist-tools-inside-pi).

Pi setup currently supports the default `~/.pi/agent` root. See the
[Pi installation guide](docs/installation.md#pi) for runtime requirements,
existing-package conflicts, and recovery. Thoth manages its separate Pi
delegation runtime as package `@thoth-agents/pi-subagents` through
`npm:@thoth-agents/pi-subagents@>=0.3.0`, the first release owning
`/subagents-tools`. Upgrade both packages together and `/reload` if Pi reports
missing or duplicate command ownership. Existing `pi-subagents` and
`pi-subagents-j0k3r` installs need manual recovery through Pi's package manager
before setup. Local checkout development uses `pnpm run setup:pi:local`, which
points Pi at the fork under `pi-packages/pi-subagents`; publishing the fork is
not required for that path. Pi extensions run with your user's system
permissions; agent tool allowlists are not an OS sandbox.

### Optional Pi provider extensions (manual install)

The installer does **not** install or manage the Claude/Antigravity bridges or
pi-openai-fast. Install only those you want, then restart Pi:

```bash
pi install npm:@thoth-agents/pi-claude-bridge
pi install npm:@thoth-agents/pi-antigravity-bridge
pi install npm:@thoth-agents/pi-openai-fast
```

Authenticate Claude Code or the `agy` CLI separately. Claude rate-limit events
from root and child sessions share pi-core's process-wide, account-wide registry
(not a bus channel); affected subagent rows/details show active warnings and reset
times without changing task status. Quota is on demand: `/claude quota` uses an
experimental SDK API without sending a prompt; `/agy quota` shows Antigravity
usage. Antigravity costs are API-equivalent estimates from an explicit catalog
mapping, not subscription charges. The theme marks the total `(sub)` by default
for both `claude-bridge` and `antigravity`. See
[provider commands and caveats](docs/installation.md#manual-pi-provider-extensions).

For scopes, troubleshooting, or local checkout installation, see the
[installation guide](docs/installation.md). Local Pi checkout installs keep
thoth-mem setup separate.

## Get started

### 1. Check your installation

After setup completes, inspect the installed state:

```bash
npx thoth-agents@latest status
```

If setup reports a missing dependency or a manual action, resolve it before
continuing. Package installation alone does not prove provider authentication
or a successful live model request.

### 2. Initialize your project

Open your repository in the harness and invoke the installed `thoth-init` skill:

| Harness | In your agent conversation |
| --- | --- |
| OpenCode | `/thoth-init` |
| Codex | `$thoth-init` |
| Claude Code | `/thoth-agents:thoth-init` |
| Pi | Ask: `Use the thoth-init skill to initialize this repository.` |

This creates only missing minimum `.thoth/` governance, including
`.thoth/constitution.md`, `.thoth/specs/`, and the change archive. It does not
install plugins or dependencies and preserves existing project-owned governance
and historical records.

### 3. Give Thoth a task

Start with a goal, not a list of agents to manage. For example:

```text
Fix the broken documentation link with the smallest sufficient workflow.
```

```text
Add CSV export to the reports page. Understand the existing filters, specify how empty results behave, and clarify any material decision before a test-first implementation. Keep the work proportional.
```

```text
Plan a migration from our current authentication system. Explore the risks, specify acceptance, and clarify material decisions before implementation. If classification is substantial, keep the plan and acceptance in one `.thoth/changes/<id>/<id>.md` record.
```

Describe the desired outcome, constraints, and acceptance. The Orchestrator
first builds proportional understanding, then classifies by coordination,
uncertainty, and risk and selects the fitting specialist.

## Meet the team

### One coordinator

<table>
  <tr>
    <td width="25%" align="center"><img src="img/agents/orchestrator.webp" width="160" alt="Thoth as the Orchestrator"></td>
    <td><b>Orchestrator · Keeps the work moving</b><br><br>Your main point of contact. Retains goals, constraints, decisions and acceptance while directing specialists, with a bounded exception for known-source consultation or minimal low-risk edits.</td>
  </tr>
</table>

### Research and review

| Explorer | Librarian | Oracle |
| :---: | :---: | :---: |
| <img src="img/agents/explorer.webp" width="150" alt="Anubis as the Explorer"> | <img src="img/agents/librarian.webp" width="150" alt="Seshat as the Librarian"> | <img src="img/agents/oracle.webp" width="150" alt="Ma'at as the Oracle"> |
| **Finds the relevant code.** Maps unfamiliar repository behavior before changes begin. | **Checks current sources.** Looks up authoritative documentation and external evidence. | **Challenges the result.** Independently reviews plans and verifies changes when the workflow or risk requires it. |

### Design and implementation

| Designer | Worker |
| :---: | :---: |
| **Makes interfaces work well.** Owns material UI/UX, accessibility, interaction, and visual quality. | **Implements changes.** Owns delegated implementation, including coupled behavior, edge cases, migrations, and correctness-critical work. |

Research and review specialists are read-only. Implementation work has one
writer per area; independent areas can proceed in parallel when the harness
supports it. You do not need to summon every role for every task.

## Proportional SDD

Every change completes explore, specify, and clarify in order, proportionally to
its uncertainty and impact. These steps do not force a document, specialist, or
interview. The Orchestrator resolves repository facts through evidence and asks
only when a material human-owned decision cannot safely be inferred; unresolved
material uncertainty blocks classification.

Only after understanding does it classify by meaningful coordination and
contract impact, uncertainty, and risk. File count alone does not increase scope:
a clear, low-risk localized mechanical change may touch several files and remain
small. Small work uses test-first implementation and focused verification with
no record. Substantial or materially risky work plans in one
`.thoth/changes/<id>/<id>.md` record after classification; risk may warrant
planning even for a patch-sized change. No alias, duplicate record, report,
evidence directory, or process tooling is created.

For substantial work, optional fresh Oracle plan review runs only when selected.
After a selected `[OKAY]`, root separately asks Implement (Recommended) or Stop;
review alone never authorizes implementation or replaces final verification.
Substantial and materially risky work receives a fresh read-only Oracle
verification. Declared durable changes sync transactionally to
`.thoth/specs/` after PASS. Active governance lives at `.thoth/constitution.md`;
historical records remain preserved, and provider memory stays separate. Native
harness execution and liveness remain authoritative. See the [SDD guide](docs/sdd-pipeline.md)
and [Skills and MCPs](docs/skills-and-mcps.md) for limits.

## Configure and update

### Tune the team

Use the interactive CLI to inspect setup and configure role models:

```bash
npx thoth-agents@latest
```

Choose models your harness and provider account can access. OpenCode ships the
**OpenAI preset**; per-role overrides let you customize it. Other harnesses use
their own model configuration and capability rules.

See [Provider Configuration](docs/provider-configurations.md) and
[Codex Model Customization](docs/codex-model-customization.md).

### Keep the complete installation current

Preview an update, then apply it explicitly:

```bash
npx thoth-agents@latest update --harness=opencode
npx thoth-agents@latest update --harness=opencode --apply
```

Replace `opencode` with `codex`, `claude`, or `pi` for your harness. Close Codex
before applying its update, and restart the selected harness afterward.

An applied update refreshes the complete CLI-managed setup, including required
skills and provider setup—not just the plugin. Native marketplace updates alone
do not prove those other pieces are current. Use `status` to inspect the last
complete CLI-managed installation and follow any reported recovery actions.

For Pi, the first-party `thoth-agents` package remains exact and receipt-verified.
The nine selected extensions use stable minimum-only `>=` ranges, so
Pi's native package manager can update them independently without waiting for a
Thoth release. Install and applied Update now include
`@thoth-agents/pi-thoth-theme`, `@thoth-agents/pi-background-tasks` and
`@thoth-agents/pi-sidebar` at `>=0.3.0`.
Existing copies of these three packages from any source are preserved and verified
without reinstalling when compatible; older copies are left untouched and block
completion with manual upgrade guidance. Ambiguous sources fail closed. Status
validates each installed manifest's package name and SemVer floor; newer stable
versions are healthy, while prerelease, malformed,
missing, or older versions are not. Re-running Install or applying Update
migrates legacy exact sources for the other selected extensions through Pi while
preserving package resource filters and unrelated settings.

Subagents (v2) and background tasks (v1) publish summary-only snapshots through
[pi-core's task channels](pi-packages/pi-core/README.md#task-summary-and-usage-channels).
The status line uses `thoth:subagents:usage`, not the removed raw
`thoth:subagent-usage` bus event. Upgrade pi-subagents and pi-thoth-theme to
`>=0.3.0` together and `/reload` to retain subagent cost display; the usage
checkpoint discriminator is unchanged.

The shared Pi Work panel uses pi-core's v2 data-only provider contract and
[discovery/action API](pi-packages/pi-core/README.md#discovery-and-actions).
Upgrade pi-subagents, pi-background-tasks and pi-todo together to `>=0.3.0`, then
`/reload`; first-owner arbitration hides incompatible sections in mixed v1/v2
installs. Subagent state is v2; background state, usage, requests and Render KIT remain v1.

The [Pi sidebar](pi-packages/pi-sidebar/README.md) adds read-only Session,
Workspace, Cost and discovered Todos/Subagents/Background panels in fullscreen and
regular mode. `/sidebar` toggles, `/sidebar panels` lists ids for show/hide/order
commands, and `/sidebar resize` resizes. `/sidebar settings` edits panel order,
visibility, startup and default width; `/sidebar cost` opens task-cost curves.
Themed panels show summary counts and detail commands; Workspace shows a
`~`-abbreviated path and tracked file/line changes versus HEAD. Agent metrics
include cost and semantic icons, with stable wrapping across digit changes. Only displayed source panels absorb their
Work sections; hiding the sidebar restores them. Panel order/visibility and
startup policy/default width live in `~/.pi/agent/thoth-sidebar.json`. Subagent
state v2 adds up to 100 cost-ranked persisted session summaries in `history`. Private Pi layout seams
have guarded fallback; regular mode covers the live viewport, not historical
scrollback. Update related extensions together to avoid mixed old UI owners.

Pi's question UI replaces the editor without covering chat. `Ctrl+]` collapses it
to a one-line dock and returns input to the editor; during an active run, `Enter`
queues a steering message without answering the question. `Ctrl+]` re-expands
with answers and drafts preserved, and the open tool-call card shows collapsed
state. While open, `Ctrl+]` shadows editor `jumpForward`; collapsed `Esc` belongs
to the editor or focused overlay. History/detail overlays close back to the
expanded question or otherwise the editor; collapse and teardown preserve
visible foreign-overlay focus. See [question controls](pi-packages/pi-questions-user/README.md#keyboard-controls).

## Documentation

### User guides

| Guide | Use it to… |
| --- | --- |
| [Installation](docs/installation.md) | Check prerequisites, preview setup, troubleshoot, and repair an installation. |
| [Quick Reference](docs/quick-reference.md) | Find commands, roles, skills, and workflow reminders. |
| [SDD pipeline](docs/sdd-pipeline.md) | Understand routes, planning, review, verification, and archiving. |
| [Skills and MCPs](docs/skills-and-mcps.md) | See the included workflows, research tools, and memory boundaries. |
| [Provider Configuration](docs/provider-configurations.md) | Configure models and providers. |
| [Codex Install](docs/codex-install.md) | Follow Codex-specific setup, activation, and trust requirements. |
| [Codex Model Customization](docs/codex-model-customization.md) | Adjust Codex specialist models. |
| [Claude Code Install](docs/claude-code-install.md) | Follow marketplace setup and activation. |
| [Pi Setup](docs/installation.md#pi) | Check Pi dependencies, permissions, and recovery steps. |
| [Tmux Integration](docs/tmux-integration.md) | Configure OpenCode's optional terminal-pane integration. |

### Technical guides

Working on thoth-agents itself? Start here rather than in the user setup above.

| Guide | What it covers |
| --- | --- |
| [Development](docs/development.md) | Local build, verification, and harness development setup. |
| [Architecture](docs/agent/architecture.md) | Repository structure and component responsibilities. |
| [Codex Plugin Packaging](docs/codex-plugin-packaging.md) | Plugin contents, the global layer, and local synchronization. |
| [Claude Code Plugin Packaging](docs/claude-code-plugin-packaging.md) | Native discovery, packaging, and ownership boundaries. |
| [Codex Surface Validation](docs/codex-surface-validation.md) | Harness-specific validation evidence and limitations. |
| [Agent Context Index](docs/agent/index.md) | Task-specific engineering and testing guidance. |
