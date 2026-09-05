<div align="center">
  <img src="img/thoth-agents-header.webp" alt="Seven cyber-Egyptian specialists led by Thoth, the Orchestrator" width="100%">
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

---

## Why thoth-agents

Describe what you want to build or fix. Thoth keeps the conversation together,
handles straightforward work directly, and brings in specialists when research,
design, implementation, or an independent review would help.

Small changes stay small. Larger changes get a specification, a plan, and
verification you can follow—without manually coordinating every agent.

- **A team, not seven conversations.** One adaptive Orchestrator coordinates six
  specialists and brings their results back to you.
- **The right amount of process.** Choose a quick Direct path or a structured
  specification-driven development (SDD) workflow for more involved work.
- **Specialists where they add value.** Repository discovery, current documentation,
  UI/UX, focused edits, complex implementation, and independent review have distinct roles.
- **Models you can tune.** Configure models per role to suit your workflow and
  the providers available in your harness.
- **Continuity between sessions.** Published installs include setup of
  [thoth-mem](https://github.com/EremesNG/thoth-mem), the independent memory
  companion for reusable decisions and project knowledge. thoth-mem owns its own
  memory lifecycle, persistence, and storage; thoth-agents only invokes its setup.

> [!NOTE]
> OpenCode is the default and most integrated path. All four harnesses share the
> workflow and role design, but their permissions, delegation, and runtime
> capabilities are not identical. Your harness's trust and approval rules still apply.

## Install

You need **Node.js `>=22.19`**, a supported harness already installed, and network
access for setup. Authenticate your model providers in that harness separately.
The commands below install at **global/user scope**.

| Harness | What you get | Install command |
| --- | --- | --- |
| <a href="https://github.com/anomalyco/opencode"><picture><source media="(prefers-color-scheme: dark)" srcset="https://svgl.app/library/opencode-dark.svg"><img src="https://svgl.app/library/opencode.svg" alt="OpenCode logo" width="48" height="48"></picture></a><br>**OpenCode** | Native plugin, agent team, workflow skills, and memory setup. **Recommended starting point.** | `npx thoth-agents@latest install --agent=opencode` |
| <a href="https://github.com/openai/codex"><img src="https://github.com/openai.png?size=120" alt="OpenAI logo — Codex" width="48" height="48"></a><br>**Codex** | Native plugin plus the required global agent and instruction setup. **Close Codex first.** | `npx thoth-agents@latest install --agent=codex` |
| <a href="https://claude.com/product/claude-code"><img src="https://github.com/anthropics.png?size=120" alt="Anthropic logo — Claude Code" width="48" height="48"></a><br>**Claude Code** | Marketplace agents and skills, completed by the CLI's external skills and memory setup. **Run the prerequisites below first.** | `npx thoth-agents@latest install --agent=claude` |
| <a href="https://github.com/earendil-works/pi"><img src="https://raw.githubusercontent.com/EremesNG/thoth-mem/master/img/pi.svg" alt="Pi logo" width="48" height="48"></a><br>**Pi** | Native package, six specialists, delegation and research extensions, workflow skills, and memory setup. | `npx thoth-agents@latest install --agent=pi` |

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

This prepares the repository's `openspec/` governance for structured workflows.
It does not install plugins or dependencies, and it preserves existing
constitutions.

### 3. Give Thoth a task

Start with a goal, not a list of agents to manage. For example:

```text
Fix the broken documentation link using the Direct route.
```

```text
Add CSV export to the reports page using Accelerated SDD.
Keep the existing filters and include tests for empty results.
```

```text
Use Full SDD to plan a migration from our current authentication system.
Explore the risks before proposing changes.
```

You can name a route explicitly or let Thoth recommend one. Describe your
constraints and expected outcome; the Orchestrator decides whether to handle
work directly or bring in a specialist.

## Meet the team

### One coordinator

<table>
  <tr>
    <td width="25%" align="center"><img src="img/agents/orchestrator.webp" width="160" alt="Thoth as the Orchestrator"></td>
    <td><b>Orchestrator · Keeps the work moving</b><br><br>Your main point of contact. Understands the goal, recommends a workflow, handles bounded work, and coordinates specialists without handing you the management overhead.</td>
  </tr>
</table>

### Research and review

| Explorer | Librarian | Oracle |
| :---: | :---: | :---: |
| <img src="img/agents/explorer.webp" width="150" alt="Anubis as the Explorer"> | <img src="img/agents/librarian.webp" width="150" alt="Seshat as the Librarian"> | <img src="img/agents/oracle.webp" width="150" alt="Ma'at as the Oracle"> |
| **Finds the relevant code.** Maps unfamiliar repository behavior before changes begin. | **Checks current sources.** Looks up authoritative documentation and external evidence. | **Challenges the result.** Independently reviews plans and verifies changes when the workflow or risk requires it. |

### Design and implementation

| Designer | Quick | Deep |
| :---: | :---: | :---: |
| <img src="img/agents/designer.webp" width="150" alt="Hathor as the Designer"> | <img src="img/agents/quick.webp" width="150" alt="Horus as Quick"> | <img src="img/agents/deep.webp" width="150" alt="Sobek as Deep"> |
| **Makes interfaces work well.** Owns UI/UX, accessibility, implementation, and visual quality. | **Makes focused changes.** Handles clear, narrow, low-risk implementation tasks. | **Handles complex changes.** Works through coupled behavior, edge cases, and correctness-critical implementation. |

Research and review specialists are read-only. Implementation work has one
writer per area; independent areas can proceed in parallel when the harness
supports it. You do not need to summon every role for every task.

## Choose your workflow

SDD means **specification-driven development**: agree on the intended result,
plan the work, implement it, and check it against that intent.

| Route | Best for | What to expect |
| --- | --- | --- |
| **Direct** | Clear, bounded, low-risk fixes and documentation changes. | Implement → verify. No planning artifacts required. |
| **Accelerated** | Features spanning several areas, moderate risk, or a request to use SDD. | Specify → plan → tasks → implement → verify → archive. Planning runs in one pass unless a material decision needs you. |
| **Full** | Uncertain requirements, architectural changes, or high-cost failures. | Explore first, then follow the structured workflow with separate planning checkpoints. |

For Accelerated and Full, the specification, plan, tasks, and verification
reports live under `openspec/`, so you can inspect what was agreed and what
was checked. You can choose an optional Oracle plan review before implementation;
final verification is required either way. These routes and materially risky
Direct work use an independent Oracle for final verification.

> [!TIP]
> You stay in control of the route. Say “Use Direct,” “Use Accelerated SDD,” or
> “Use Full SDD” when you already know how much structure you want.

The installed skills cover project initialization, SDD, project principles,
plan review, and archiving. External skills add test-driven development,
behavior-preserving simplification, focused repository context, and architectural
questioning when needed. See [Skills and MCPs](docs/skills-and-mcps.md) and the
[SDD workflow guide](docs/sdd-pipeline.md) for details.

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

## Documentation

### User guides

| Guide | Use it to… |
| --- | --- |
| [Installation](docs/installation.md) | Check prerequisites, preview setup, troubleshoot, and repair an installation. |
| [Quick Reference](docs/quick-reference.md) | Find commands, roles, skills, and workflow reminders. |
| [SDD Pipeline](docs/sdd-pipeline.md) | Understand planning, review, verification, and archiving. |
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
