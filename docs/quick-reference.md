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
claude plugin marketplace add https://github.com/EremesNG/thoth-plugins.git --scope user
claude plugin install thoth-agents@thoth-plugins --scope user
npx thoth-agents@latest install --agent=claude --dry-run
npx thoth-agents@latest install --agent=claude
```

```text
# Claude Code, after restart or /reload-plugins
/thoth-agents:thoth-init
```

Every installation uses the thoth-agents CLI to install external skills through
`npx skills add`; published installs then invoke provider-owned thoth-mem setup.
An explicit local Pi package install omits the provider step and directs the
operator to install local thoth-mem separately. For OpenCode the CLI also
synchronizes the five packaged owned skills globally under
`~/.config/opencode/skills/`. Only a consistent thoth-mem `complete` result
completes a published installation; printed manual actions and receipts remain
provider-owned. Codex also needs the CLI because its plugin cannot install
custom agents or write `~/.codex/AGENTS.md`. SDD phases never call either CLI.

## Roles

| Role | Mode | Use |
| --- | --- | --- |
| `orchestrator` | adaptive root | Direct work, route recommendation, SDD coordination, final synthesis |
| `explorer` | read-only | Repository discovery for real uncertainty |
| `librarian` | read-only | Current, unfamiliar, version-sensitive, or external facts |
| `oracle` | read-only | Explicitly or bounded-default selected plan review and independent judgment when risk requires it |
| `designer` | writer | Material UI/UX, interaction, accessibility, and visual quality |
| `quick` | writer | Known narrow, clear, low-risk isolated edits |
| `deep` | writer | Correctness-heavy or cross-cutting implementation |

## Routes

```text
Direct:      implement -> verify
Accelerated: specify -> plan -> tasks -> implement -> verify -> archive
Full:        explore -> specify -> plan -> tasks -> implement -> verify -> archive
```

Root owns the sequential artifact phases. Every route verifies: trivial
deterministic Direct work may use focused root checks; materially risky Direct
work and every Accelerated or Full final verify use a fresh read-only Oracle.
`clarify`, `checklist`, `plan-review`, and `converge` are conditional.

- Explicit route names are user selections and win. Otherwise root summarizes
  context and recommends one route; explicit answers win, while the third
  answerless result selects that recommendation. Generic SDD makes Accelerated
  the minimum recommendation.
- Multi-file docs/mechanical work can remain Direct when clear and low-risk.
- Accelerated fast-forwards `specify -> plan -> tasks` without routine pauses.
- Full adds exploration and separate planning gates for uncertainty or high risk.
- After `ready`, Accelerated and Full offer optional Oracle plan review or
  proceeding without it; explicit answers win and the third answerless result
  selects Oracle review. Every final verify remains mandatory.
- `ready` gates implementation; `closeout` gates transactional archive.

Before implementation, root separates concrete artifact/decision dependencies
from mere ordering preference, marks input-ready lanes ready and dependent lanes
blocked, and preserves one writer per mutable surface. It dispatches all ready
conflict-free lanes in each native wave before waiting, then fans in terminal
native results before releasing dependents. Semantic triggers select `librarian`
for current/external facts, `designer` for material user-facing experience, and
`quick` for known narrow low-risk work; coupled or high-risk work uses `deep`.
Native harness execution and lifecycle are authoritative for dispatch, status,
wait, steering, cancellation, and terminal results.

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
- Codex and Claude native managers own plugin versions and normal cache
  lifecycle; the CLI ledger is the authority only for the separate complete
  CLI-managed setup. With Codex closed, installation removes only the selected
  product's fixed legacy IDs and preflight-approved orphan roots after verifying
  its central plugin. Claude legacy state remains preserved.
- thoth-mem owns its hooks, MCP, skill, lifecycle, persistence, receipts, and
  recovery. thoth-agents only invokes its public setup during installation.
- Runtime memory authorization is `none`, `recall`, or `observe` and does not
  alter workspace write permission. Root lifecycle never transfers.
- `openspec/` remains canonical; SDD artifacts are not mirrored into thoth-mem.
- QA executables remain separate and project-owned.
