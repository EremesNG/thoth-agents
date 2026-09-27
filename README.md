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
- **The right amount of process.** Use a direct implementation path for small
  work or a persisted AI-first work contract for involved or resumable work.
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
| <a href="https://github.com/earendil-works/pi"><img src="https://raw.githubusercontent.com/EremesNG/thoth-mem/master/img/pi.svg" alt="Pi logo" width="48" height="48"></a><br>**Pi** | Native package, five specialists, delegation and research extensions, workflow skills, and memory setup. **Recommended for the best experience.** | `npx thoth-agents@latest install --agent=pi` |

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

Inside Pi, use `/thoth-agents:models` to edit the five specialists' global models
and thinking levels without leaving the session. Changes remain a draft until
saved; the parent model is unchanged. See [panel controls and precedence](docs/installation.md#configure-specialist-models-inside-pi).

Pi setup currently supports the default `~/.pi/agent` root. See the
[Pi installation guide](docs/installation.md#pi) for runtime requirements,
existing-package conflicts, and recovery. Pi extensions run with your user's
system permissions; agent tool allowlists are not an OS sandbox.

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

This prepares the repository's `.thoth/` governance for structured workflows.
It does not install plugins or dependencies, and it preserves existing
constitutions.

### 3. Give Thoth a task

Start with a goal, not a list of agents to manage. For example:

```text
Fix the broken documentation link with the smallest sufficient workflow.
```

```text
Add CSV export to the reports page. Agree on a work contract, then implement it.
Keep the existing filters and include tests for empty results.
```

```text
Plan a migration from our current authentication system and record the agreement.
Explore the risks before proposing changes.
```

You can name a route explicitly or let Thoth recommend one. Describe your
constraints and expected outcome; the Orchestrator selects the fitting specialist
and retains coordination and acceptance.

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

## Plan once, execute with focused context

The root first classifies the request. For substantive changes it explores current
behavior, specifies the desired outcome and acceptance, and clarifies material
uncertainty with you before planning and persisting `.thoth/changes/<id>/work.yaml`.
Repository facts are investigated; when local source, flow or responsibility is
unknown, Explorer runs before root repository search. Grilling is used only when
requested or needed for material human decisions. No separate discovery or
specification documents are mandatory. Small, clear, bounded, low-risk fixes can
proceed without planning files while the fitting writer implements directly;
known bounded work does not require an Explorer relay. New material uncertainty
or risk triggers reclassification.

Independent units run in parallel through the native harness. Per-unit
checkpoints support resuming interrupted work after reconciling the actual
files and native agent status. Supporting context and external unit files are
optional. Once the plan is ready, choose Oracle review (recommended) or direct
implementation. After Oracle approval, choose implementation (recommended) or
stopping with the approved plan. Each question uses its recommendation after
three confirmed unanswered native returns; explicit answers win. Choices and
remaining attempts survive interruption. Other material decisions and sensitive
actions still require their own authorization.

A fresh Oracle independently verifies persisted work before closeout. Accepted
durable behavior lives in `.thoth/specs/`; provider memory stays separate.
Worktree management is deferred. See the [workflow guide](docs/workflow.md)
and [Skills and MCPs](docs/skills-and-mcps.md) for the contract and its limits.

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
The five mandatory external extensions use stable minimum-only `>=` ranges, so
Pi's native package manager can update them independently without waiting for a
Thoth release. Status validates each installed manifest's package name and
SemVer floor; newer stable versions are healthy, while prerelease, malformed,
missing, or older versions are not. Re-running Install or applying Update
migrates legacy exact external sources through Pi while preserving package
resource filters and unrelated settings.

## Documentation

### User guides

| Guide | Use it to… |
| --- | --- |
| [Installation](docs/installation.md) | Check prerequisites, preview setup, troubleshoot, and repair an installation. |
| [Quick Reference](docs/quick-reference.md) | Find commands, roles, skills, and workflow reminders. |
| [Work workflow](docs/workflow.md) | Understand planning, review, verification, and archiving. |
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
