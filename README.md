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

## Install

Node.js `>=22.13` is required.

```bash
# Interactive harness selection in a TTY; OpenCode in non-interactive contexts
npx thoth-agents@latest

# Explicit harnesses
npx thoth-agents@latest install --agent=opencode
codex plugin marketplace add EremesNG/thoth-agents
npx thoth-agents@latest install --agent=codex
npx thoth-agents@latest install --agent=claude

# Inspect without writing
npx thoth-agents@latest install --agent=codex --dry-run
```

The installer always installs the four required external skills into the
selected harness's global skill directory. A missing or failed skill install is
an unhealthy installation and causes the command to fail. There is no opt-out.

Use the thoth-agents CLI as the supported installation path. Codex plugin
marketplace sources do not run npm lifecycle scripts, and neither Codex nor
Claude plugins provide a normal automatic `postinstall` lifecycle for arbitrary
skill repositories. The CLI performs the equivalent `npx skills add ...
--global --agent ... --yes` commands directly.

Codex and Claude delivery is repository-native: the package includes
`.agents/plugins/marketplace.json`, `.claude-plugin/marketplace.json`, and their
versioned packages under `integrations/`. Claude is registered and installed
through its native plugin manager; Codex marketplace registration remains an
explicit interactive step printed by the CLI.

## Harness comparison

| Harness | Installed orchestration surface | Required skill root | Important limitation |
| --- | --- | --- | --- |
| OpenCode | Plugin entry, ten-role config, runtime delegation, tools, MCPs, and hooks | `~/.config/opencode/skills` | OpenAI is the only built-in preset. |
| Codex | Repository marketplace plus root `AGENTS.md`, nine specialist TOMLs, and feature flags | `~/.codex/skills` | Marketplace registration/trust is native and interactive; the ambient session is the root. Review `/plugins` and `/hooks`. |
| Claude Code | Repository marketplace installed by the native manager; orchestrator main agent plus nine subagents | `~/.claude/skills` | The installed cache is manager-owned; per-role model rewrites require publishing a new package. |

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
- [Claude Code Plugin Packaging](docs/claude-code-plugin-packaging.md)
- [Provider Configuration](docs/provider-configurations.md)
