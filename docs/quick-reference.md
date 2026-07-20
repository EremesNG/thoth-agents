# Quick Reference

## Install and initialize

```bash
# OpenCode, in a terminal
npx thoth-agents@latest install --agent=opencode --dry-run
npx thoth-agents@latest install --agent=opencode
```

```text
# OpenCode, after restart
/thoth-init
```

```bash
# Codex, in a terminal
codex plugin marketplace add EremesNG/thoth-agents
```

```bash
# Codex, after restart and installation from /plugins: return to a terminal
npx thoth-agents@latest install --agent=codex --dry-run
npx thoth-agents@latest install --agent=codex
```

```text
# Restart Codex, then initialize each repository
$thoth-init
```

```bash
# Claude Code, in a terminal
claude plugin marketplace add EremesNG/thoth-agents --scope user
claude plugin install thoth-agents@thoth-agents --scope user
npx thoth-agents@latest install --agent=claude --dry-run
npx thoth-agents@latest install --agent=claude
```

```text
# Claude Code, after restart or /reload-plugins
/thoth-agents:thoth-init
```

Every installation uses the thoth-agents CLI to install external skills through
`npx skills add`, then invoke provider-owned thoth-mem setup. Only a consistent
thoth-mem `complete` result completes installation; printed manual actions and
receipts remain provider-owned. Codex also needs the CLI because its plugin
cannot install custom agents or write `~/.codex/AGENTS.md`. SDD phases never
call either CLI.

## Roles

| Role | Mode | Use |
| --- | --- | --- |
| `orchestrator` | adaptive root | Direct work, route selection, SDD coordination, final synthesis |
| `explorer` | read-only | Repository discovery for real uncertainty |
| `librarian` | read-only | Current authoritative external research |
| `oracle` | read-only | Full analysis and every independent verification |
| `designer` | writer | UI/UX implementation and visual quality |
| `quick` | writer | Narrow mechanical work |
| `deep` | writer | Correctness-heavy or cross-cutting implementation |

## Routes

```text
Direct:      implement -> verify
Accelerated: specify -> plan -> tasks -> implement -> verify -> archive
Full:        explore -> specify -> plan -> tasks -> analyze -> implement -> verify -> archive
```

Root owns the sequential artifact phases. Oracle always owns `analyze` and
`verify`. `clarify`, `checklist`, and `converge` are conditional.

- Explicit route names win; generic SDD starts at Accelerated.
- Multi-file docs/mechanical work can remain Direct when clear and low-risk.
- Accelerated fast-forwards `specify -> plan -> tasks` without routine pauses.
- Full adds exploration and oracle analysis only for uncertainty or high risk.
- `ready` gates implementation; `closeout` gates transactional archive.

Artifact-backed specs use named normative FRs with INTERNAL or durable delta
metadata and typed buildable/outcome SCs. Archive applies only declared durable
deltas to `openspec/specs/`; handled failures roll the sync back within the
active process, but forced process or OS termination is not crash-atomic.

## Skills

`thoth-init`, `thoth-sdd`, `thoth-constitution`, and `thoth-archive` ship in
every harness bundle. The installer obtains `simplify`, `tdd`,
`progressive-context-router`, and `architectural-grilling` from their canonical
repositories.

## Operations

```bash
npx thoth-agents@latest status
npx thoth-agents@latest list
npx thoth-agents@latest model --harness=codex --role=deep --model=gpt-5.6-sol
```

## Boundaries

- OpenCode ships only the OpenAI built-in preset.
- Codex requires the CLI for global agents, `~/.codex/AGENTS.md`, and managed
  config; `$thoth-init` creates project SDD governance only.
- Claude requires both native marketplace commands before its namespaced skill
  exists.
- thoth-mem owns its hooks, MCP, skill, lifecycle, persistence, receipts, and
  recovery. thoth-agents only invokes its public setup during installation.
- Runtime memory authorization is `none`, `recall`, or `observe` and does not
  alter workspace write permission. Root lifecycle never transfers.
- `openspec/` remains canonical; SDD artifacts are not mirrored into thoth-mem.
- QA executables remain separate and project-owned.
