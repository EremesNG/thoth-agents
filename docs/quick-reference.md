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
# Codex, in a terminal; includes native marketplace/plugin installation
npx thoth-agents@latest install --agent=codex --dry-run
npx thoth-agents@latest install --agent=codex
```

```text
# Restart Codex, then initialize each repository
$thoth-init
```

```bash
# Claude Code, in a terminal
claude plugin marketplace add https://github.com/EremesNG/thoth-agents.git#master --scope user
claude plugin install thoth-agents@thoth-agents-claude --scope user
npx thoth-agents@latest install --agent=claude --dry-run
npx thoth-agents@latest install --agent=claude
```

```text
# Claude Code, after restart or /reload-plugins
/thoth-agents:thoth-init
```

Every installation uses the thoth-agents CLI to install external skills through
`npx skills add`, then invoke provider-owned thoth-mem setup. For OpenCode it
also synchronizes the five packaged owned skills globally under
`~/.config/opencode/skills/`. Only a consistent thoth-mem `complete` result
completes installation; printed manual actions and receipts remain
provider-owned. Codex also needs the CLI because its plugin cannot install
custom agents or write `~/.codex/AGENTS.md`. SDD phases never call either CLI.

## Roles

| Role | Mode | Use |
| --- | --- | --- |
| `orchestrator` | adaptive root | Direct work, route recommendation, SDD coordination, final synthesis |
| `explorer` | read-only | Repository discovery for real uncertainty |
| `librarian` | read-only | Current authoritative external research |
| `oracle` | read-only | User-selected plan review and every independent final verification |
| `designer` | writer | UI/UX implementation and visual quality |
| `quick` | writer | Narrow mechanical work |
| `deep` | writer | Correctness-heavy or cross-cutting implementation |

## Routes

```text
Direct:      implement -> verify
Accelerated: specify -> plan -> tasks -> implement -> verify -> archive
Full:        explore -> specify -> plan -> tasks -> implement -> verify -> archive
```

Root owns the sequential artifact phases. Oracle owns selected `plan-review` and
every `verify`. `clarify`, `checklist`, `plan-review`, and `converge` are conditional.

- Explicit route names are user selections and win. Otherwise root recommends
  one route and waits for the user's Direct, Accelerated, or Full choice;
  generic SDD makes Accelerated the minimum recommendation.
- Multi-file docs/mechanical work can remain Direct when clear and low-risk.
- Accelerated fast-forwards `specify -> plan -> tasks` without routine pauses.
- Full adds exploration and separate planning gates for uncertainty or high risk.
- After `ready`, Accelerated and Full offer optional Oracle plan review or
  proceeding without it; every final verify remains mandatory.
- `ready` gates implementation; `closeout` gates transactional archive.

Artifact-backed specs use named normative FRs with INTERNAL or durable delta
metadata and typed buildable/outcome SCs. Archive applies only declared durable
deltas to `openspec/specs/`; handled failures roll the sync back within the
active process, but forced process or OS termination is not crash-atomic.

## Skills

`thoth-init`, `thoth-sdd`, `thoth-constitution`, `thoth-archive`, and
`plan-reviewer` ship in
every harness bundle. The installer obtains `simplify`, `tdd`,
`progressive-context-router`, and `architectural-grilling` from their canonical
repositories.

## Operations

```bash
npx thoth-agents@latest status
npx thoth-agents@latest list
npx thoth-agents@latest update --harness=opencode
npx thoth-agents@latest update --harness=opencode --apply
npx thoth-agents@latest update --harness=codex --apply
npx thoth-agents@latest update --harness=claude --apply
npx thoth-agents@latest model --harness=codex --role=deep --model=gpt-5.6-sol
```

`@latest` selects the CLI release. OpenCode is configured with that release's
exact version, never a `latest` plugin entry. `update` previews by default;
`--apply` performs the complete selected-harness installation refresh, including
native setup where applicable, managed surfaces, required skills, and provider
setup. Rerunning `install --agent=<harness>` is the equivalent explicit update
path.

The CLI records each harness's last fully completed version independently in
`${XDG_CONFIG_HOME:-~/.config}/thoth-agents/install-state.json`. Dry-runs and
failures do not advance it. Codex and Claude native marketplace updates do not
advance it either; `status` reports the executing and recorded CLI versions.

OpenCode runtime update checks only notify. They never rewrite the plugin pin,
invalidate package state, or install the newer release.

## Boundaries

- OpenCode ships only the OpenAI built-in preset.
- Every `thoth-init` surface only initializes or synchronizes minimum
  `openspec/` governance; installation owns skills, agents, plugins, harness
  configuration, and dependencies.
- Codex requires the CLI for global agents, `~/.codex/AGENTS.md`, and managed
  config; `$thoth-init` creates project SDD governance only.
- Claude requires both native marketplace commands before its namespaced skill
  exists.
- Codex and Claude native managers own plugin versions and caches; the CLI
  ledger is the authority only for the separate complete CLI-managed setup.
- thoth-mem owns its hooks, MCP, skill, lifecycle, persistence, receipts, and
  recovery. thoth-agents only invokes its public setup during installation.
- Runtime memory authorization is `none`, `recall`, or `observe` and does not
  alter workspace write permission. Root lifecycle never transfers.
- `openspec/` remains canonical; SDD artifacts are not mirrored into thoth-mem.
- QA executables remain separate and project-owned.
