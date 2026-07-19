# Quick Reference

## Install

```bash
npx thoth-agents@latest install --agent=opencode
npx thoth-agents@latest install --agent=codex
npx thoth-agents@latest install --agent=claude
```

Codex also requires native repository-marketplace registration:

```bash
codex plugin marketplace add EremesNG/thoth-agents
```

Claude installation uses its native manager to register
`EremesNG/thoth-agents` and install `thoth-agents@thoth-agents`.

Add `--dry-run` to inspect the plan. `--reset` repairs managed assets only.

Every install requires `simplify`, `tdd`, `progressive-context-router`, and
`architectural-grilling`. The CLI installs them globally for the selected
harness; there is no skip option. QA executables remain project-owned.

## Harnesses

| Harness | Root | Specialists | Required skill root |
| --- | --- | --- | --- |
| OpenCode | Primary `orchestrator` agent | Nine native subagents | `~/.config/opencode/skills` |
| Codex | Ambient session plus repository marketplace | Nine custom-agent TOMLs | `~/.codex/skills` |
| Claude Code | Native marketplace plugin `orchestrator` activated by `settings.json` | Nine plugin subagents | `~/.claude/skills` |

## Roles

| Role | Mode | Use |
| --- | --- | --- |
| `orchestrator` | adaptive root | Direct bounded work, routing, decisions, synthesis |
| `explorer` | read-only | Repository discovery |
| `librarian` | read-only | Current authoritative research |
| `oracle` | read-only | Diagnosis, architecture, and independent review |
| `sdd-specify` | `openspec/` writer | Requirements, clarification, optional checklist |
| `sdd-plan` | `openspec/` writer | Technical plan and optional support artifacts |
| `sdd-tasks` | `openspec/` writer | Dependency-ordered implementation tasks |
| `designer` | writer | UI/UX implementation and visual QA |
| `quick` | writer | Narrow or mechanical changes |
| `deep` | writer | Correctness-critical or cross-file implementation |

Delegation depth is one. Use one writer per mutable surface.

## SDD routes

```text
direct:      implement -> verify
accelerated: specify -> plan -> tasks -> implement -> verify
full:        explore -> specify -> plan -> tasks -> analyze -> implement -> verify
```

- Direct: clear, local, low risk.
- Accelerated: bounded multi-file or moderate risk.
- Full: explicit SDD, material uncertainty, cross-cutting scope, or high risk.
- Clarify, checklist, and converge are conditional.

Accelerated and full use:

```text
openspec/changes/<feature>/
├── spec.md
├── plan.md
└── tasks.md
```

Optional: `checklists/requirements.md`, `research.md`, `data-model.md`,
`contracts/`, and `quickstart.md`.

## OpenCode models

The only built-in OpenCode preset is `openai`. Generated mappings do not include
Kimi, Copilot, ZAI/GLM, or mixed-provider presets.

## Operations

```bash
npx thoth-agents@latest status
npx thoth-agents@latest list
npx thoth-agents@latest update --harness=codex
npx thoth-agents@latest sync --harness=claude --apply
npx thoth-agents@latest model --harness=codex --role=deep --model=gpt-5.6-sol
```

## Memory

thoth-mem is independent. Its plugin owns hooks, MCP, lifecycle, persistence,
and recovery. thoth-agents keeps only provider-neutral orchestration boundaries.

## More detail

- [Installation](installation.md)
- [SDD Pipeline](sdd-pipeline.md)
- [Skills and MCPs](skills-and-mcps.md)
- [Codex Install](codex-install.md)
- [Claude Code Plugin Packaging](claude-code-plugin-packaging.md)
