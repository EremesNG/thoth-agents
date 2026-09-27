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
custom agents or write `~/.codex/AGENTS.md`. Work execution never calls either CLI.

## Roles

| Role | Mode | Use |
| --- | --- | --- |
| `orchestrator` | adaptive root | Agreement, dependency shaping, acceptance, recovery and final synthesis |
| `explorer` | read-only | Repository discovery for real uncertainty |
| `librarian` | read-only | Current, unfamiliar, version-sensitive, or external facts |
| `oracle` | read-only | Optional plan review and fresh independent final judgment when risk or persistence requires it |
| `designer` | writer | Material UI/UX, interaction, accessibility, and visual quality |
| `worker` | writer | Delegated implementation, including coupled, edge-case-heavy, or high-risk changes |

## Workflow

Small bounded work: implement → verify.
Persisted work: agree → execute units → independently verify → close.

Use `.thoth/changes/<id>/work.yaml` for the agreement, acceptance and units.
Context files, external units and evidence are added only when useful. Root
owns acceptance, specialists their assigned surfaces and checkpoints.

Dispatch all independent admitted units before waiting, refill freed capacity,
and release consumers after their own dependencies are accepted and fresh.
Native liveness governs recovery; a checkpoint or timeout never permits a
duplicate writer. Existing human authorization is reused. See [workflow](workflow.md).

## Skills

`thoth-init`, `thoth-work`, `thoth-constitution`, `thoth-archive`, and
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
npx thoth-agents@latest model --harness=codex --role=worker --model=gpt-6-luna --effort=max
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
  `.thoth/` governance; installation owns skills, agents, plugins, harness
  configuration, and dependencies.
- Codex requires the CLI for global agents, `~/.codex/AGENTS.md`, and managed
  config; `$thoth-init` creates project work governance only.
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
- `.thoth/` remains canonical; work contracts and checkpoints are not mirrored into thoth-mem.
- QA executables remain separate and project-owned.
