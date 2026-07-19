# thoth-agents

Adaptive multi-harness orchestration for OpenCode, Codex, and Claude Code.

Version 0.3.0 replaces the old delegate-first, phase-skill pipeline with a
lighter adaptive root, ten canonical roles, and three explicit SDD routes. The
root handles clear bounded work directly and delegates only when specialization,
context isolation, independent review, or safe parallelism creates a net gain.

## What 0.3.0 provides

- OpenCode as the default and strongest runtime-integrated path.
- First-class Codex and Claude Code installation surfaces.
- Ten roles: `orchestrator`, `explorer`, `librarian`, `oracle`, `sdd-specify`,
  `sdd-plan`, `sdd-tasks`, `designer`, `quick`, and `deep`.
- Direct, accelerated, and full SDD routes with Spec Kit artifact semantics
  stored under `openspec/changes/<feature>/`.
- A maximum delegation depth of one and one writer per mutable surface.
- Mandatory `simplify`, `tdd`, `progressive-context-router`, and
  `architectural-grilling` skills for every supported harness.
- An OpenAI-only built-in model preset for OpenCode.
- A provider-neutral boundary: thoth-mem owns its own installation, hooks, MCP,
  lifecycle, persistence, and recovery behavior.

thoth-agents does not bundle SDD phase skills and does not install or emulate
thoth-mem.

## Installation

Node.js `>=22.13` is required. A complete installation may have two layers:
the harness-native plugin and the thoth-agents CLI setup. The CLI step is
required even after the plugin is installed because plugin packages cannot
materialize every user-level orchestration surface or install the four external
skills.

### OpenCode

```bash
npx thoth-agents@latest install --agent=opencode
```

The CLI adds the npm plugin entry, writes the OpenAI-only ten-role
configuration, and installs the required skills.

### Codex

```bash
# 1. Register the native repository marketplace.
codex plugin marketplace add EremesNG/thoth-agents

# 2. Restart Codex, open /plugins, and install/enable thoth-agents.

# 3. Preview and apply the required CLI-managed surfaces.
npx thoth-agents@latest install --agent=codex --dry-run
npx thoth-agents@latest install --agent=codex
```

The Codex plugin provides the packaged research MCP configuration. The CLI is
still required: it installs the global orchestrator instructions in
`~/.codex/AGENTS.md`, nine custom-agent TOMLs, the managed Default-mode feature
flag, model ownership state, and all required global skills.

### Claude Code

Run both native plugin commands **before** calling the thoth-agents CLI:

```bash
# 1. Register the marketplace.
claude plugin marketplace add EremesNG/thoth-agents --scope user

# 2. Install the plugin from that marketplace.
claude plugin install thoth-agents@thoth-agents --scope user

# 3. Preview and apply the required CLI-managed dependencies.
npx thoth-agents@latest install --agent=claude --dry-run
npx thoth-agents@latest install --agent=claude
```

Restart Claude Code or run `/reload-plugins`, then inspect `/plugin`. The native
plugin provides the orchestrator, nine subagents, settings, and research MCPs.
The CLI remains mandatory because it installs and verifies the external skills
under `~/.claude/skills`; a plugin-only install is incomplete.

### Why the CLI is required

| Harness | Native/plugin layer | Additional CLI-owned layer |
| --- | --- | --- |
| OpenCode | npm plugin entry loaded by OpenCode | Ten-role configuration, optional tmux setup, and required skills |
| Codex | Repository marketplace plugin and research MCPs | `~/.codex/AGENTS.md`, nine custom agents, feature configuration, model state, and required skills |
| Claude Code | Marketplace plugin with orchestrator, subagents, settings, and research MCPs | Required global skills plus native-state verification and repair |

Every install requires `simplify`, `tdd`, `progressive-context-router`, and
`architectural-grilling`. A missing or failed skill is an unhealthy installation
and causes the CLI operation to fail; there is no opt-out. Plugin marketplaces
do not provide a reliable general-purpose `postinstall` for these standalone
skill repositories.

See [Installation](docs/installation.md), [Codex Install](docs/codex-install.md),
and [Claude Code Install](docs/claude-code-install.md) for verification,
troubleshooting, scopes, and limitations.

## Harness comparison

| Harness | Installed orchestration surface | Required skill root | Important limitation |
| --- | --- | --- | --- |
| OpenCode | Plugin entry, ten-role config, runtime delegation, tools, MCPs, and hooks | `~/.config/opencode/skills` | OpenAI is the only built-in preset. |
| Codex | Native plugin plus CLI-managed root `AGENTS.md`, nine specialist TOMLs, and feature flag | `~/.codex/skills` | The ambient session is the root. Role selection and some enforcement remain instruction-level; review `/plugins` and `/hooks`. |
| Claude Code | Native marketplace plugin; orchestrator main agent plus nine subagents | `~/.claude/skills` | Run marketplace add/install before the CLI. Cache and role-model defaults are package/manager-owned. |

The generated contract is shared, but runtime guarantees are not assumed to be
identical across harnesses.

## Adaptive orchestration

| Role group | Roles | Responsibility |
| --- | --- | --- |
| Root | `orchestrator` | Route the task, work directly when bounded, delegate only for net gain, and synthesize results. |
| Read-only evidence | `explorer`, `librarian`, `oracle` | Repository discovery, authoritative research, diagnosis, architecture, and independent review. |
| SDD coordination | `sdd-specify`, `sdd-plan`, `sdd-tasks` | Write only governed coordination artifacts under `openspec/`; never implement product code. |
| Writers | `designer`, `quick`, `deep` | UI/UX work, narrow mechanical changes, and correctness-critical implementation. |

Children do not delegate. Parallel work is reserved for independent surfaces,
and overlapping writes are never parallelized.

## SDD routing

The root classifies each request by intent, scope, clarity, contract risk, and
failure cost.

```text
direct:      implement -> verify
accelerated: specify -> plan -> tasks -> implement -> verify
full:        explore -> specify -> plan -> tasks -> analyze -> implement -> verify
```

- Direct is the default for clear, local, low-risk work, including small
  documentation changes.
- Accelerated is retained for bounded multi-file or moderate-risk work. It is
  intentionally lean while preserving `spec.md`, `plan.md`, and `tasks.md`.
- Full is used for explicit SDD requests, unresolved scope, cross-cutting work,
  or high risk.
- Clarification, requirements checklists, and convergence are conditional.
- `architectural-grilling` is a conditional pre-specification gate only when
  explicitly requested or material human-owned product/architecture decisions
  remain unresolved. Full SDD alone does not activate it.
- User input is requested only when a material unresolved choice would change
  the result.

See [SDD Pipeline](docs/sdd-pipeline.md) for the artifact graph and ownership
rules.

## Required external skills

Every install, update, and sync path treats these as required:

| Skill | Source | Purpose |
| --- | --- | --- |
| `simplify` | `https://github.com/brianlovin/claude-config` | Keep implementation lean and remove accidental complexity. |
| `tdd` | `https://github.com/mattpocock/skills` | Test-driven feature and bug-fix workflow. |
| `progressive-context-router` | `https://github.com/EremesNG/skills` | Maintain small repository instructions and verified on-demand context. |
| `architectural-grilling` | `https://github.com/EremesNG/skills` | Resolve high-impact product, architecture, and delivery decisions before specification. |

thoth-agents does not install `playwright-cli` or a browser runner. Projects
choose and provision their own QA tooling.

For exact generated commands and per-harness locations, see
[Skills and MCPs](docs/skills-and-mcps.md).

## OpenCode models

The generated OpenCode configuration contains only the `openai` preset. Kimi,
GitHub Copilot, ZAI/GLM, and mixed-provider mappings are not shipped in 0.3.0.
Role-level configuration remains available for explicit advanced overrides, but
those overrides are not additional built-in presets.

See [Provider Configuration](docs/provider-configurations.md).

## Operations

```bash
npx thoth-agents@latest status
npx thoth-agents@latest list
npx thoth-agents@latest update --harness=codex
npx thoth-agents@latest sync --harness=claude
npx thoth-agents@latest model --harness=codex --role=deep --model=gpt-5.6-sol
```

Mutating operations preserve unrelated user content and use managed ownership
markers or state files. `--reset` repairs only thoth-agents-managed targets; it
is not a broad destructive force option.

## Memory provider boundary

thoth-mem is an independent plugin/provider. Install it separately and follow
its installed guidance. thoth-agents coordinates only provider-neutral outcomes
such as truthful capability reporting, role authorization, and resumable
handoffs; it does not bundle thoth-mem hooks, MCP configuration, protocol text,
or lifecycle logic.

## Development

```bash
pnpm install
pnpm run check:ci
pnpm run typecheck
pnpm run build
pnpm test
```

Runtime versions are fixed by `package.json`: Node `>=22.13` and
`pnpm@11.2.2`.

## Documentation

- [Installation](docs/installation.md)
- [Quick Reference](docs/quick-reference.md)
- [SDD Pipeline](docs/sdd-pipeline.md)
- [Skills and MCPs](docs/skills-and-mcps.md)
- [Codex Install](docs/codex-install.md)
- [Codex Plugin Packaging](docs/codex-plugin-packaging.md)
- [Codex Model Customization](docs/codex-model-customization.md)
- [Claude Code Install](docs/claude-code-install.md)
- [Claude Code Plugin Packaging](docs/claude-code-plugin-packaging.md)
- [Provider Configuration](docs/provider-configurations.md)
