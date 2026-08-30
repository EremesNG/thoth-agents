# Codex Install

Codex installation has two required layers. The native plugin contributes
skills and MCP configuration; the thoth-agents CLI materializes global custom
agents, orchestrator instructions, and configuration that the plugin manifest
cannot install.

## 1. Run the combined installer

Preview, then apply:

```bash
npx thoth-agents@latest install --agent=codex --dry-run
npx thoth-agents@latest install --agent=codex
```

The CLI inspects `codex plugin marketplace list --json` and `codex plugin list
--available --json`. When needed, it runs the native unattended commands:

```bash
codex plugin marketplace add EremesNG/thoth-agents --ref master --json
codex plugin add thoth-agents@thoth-agents-codex --json
```

It does not write Codex marketplace or plugin-cache files directly. A
same-named marketplace from another source, unreadable manager state, command
failure, or failed post-install verification stops setup before the global
files are changed. Dry-run prints the native plan without running either
mutation. The catalog is `.agents/plugins/marketplace.json`; its marketplace
name is `thoth-agents-codex` and it resolves to the versioned shared `plugin/`
bundle.

An existing marketplace named `thoth-agents` still points to the same GitHub
repository, but Codex keeps that manager identity separate. Rerunning the
current installer registers `thoth-agents-codex` from an explicit `master`
reference, installs the host-specific plugin ID, and preserves the legacy
marketplace/plugin state. It never upgrades, removes, or directly rewrites the
manager-owned legacy cache.

The plugin contains the five thoth-owned workflow skills, including
`plan-reviewer`, and packaged MCP configuration. External execution skills are deliberately not
vendored. It contains no custom-agent TOMLs because Codex plugin manifests do
not support an agents component.

## 2. Mandatory global layer

User-scope setup manages:

- `~/.codex/AGENTS.md`: one bounded `thoth-agents:codex-root` orchestrator
  section while preserving unrelated global instructions;
- six `~/.codex/agents/thoth-agents-<role>.toml` files for `explorer`,
  `librarian`, `oracle`, `designer`, `quick`, and `deep`;
- `~/.codex/agents/.thoth-agents-managed-models.json`;
- a backed-up merge in `~/.codex/config.toml` for the managed feature; and
- mandatory external skills in Codex's user skill root, `~/.agents/skills/`,
  via `npx skills add`;
- provider-owned thoth-mem setup through `npx -y thoth-mem@latest setup codex
  --scope global --json`.

The ambient session is the orchestrator, so no orchestrator child TOML is
generated. The CLI obtains external skills from their canonical repositories;
Codex remains the owner of its marketplace snapshot and plugin cache. Dry-run
delegates to thoth-mem's `--plan` mode. A partial or user-action result keeps the
combined installation incomplete and prints provider diagnostics, actions, and
receipt.

## 3. Restart and initialize each repository

Restart Codex so global agents and instructions load. Review:

```text
/plugins
/hooks
```

In each target repository invoke:

```text
$thoth-init
```

This final skill step is offline and idempotent. It creates only the minimum
OpenSpec directories, a missing project constitution, and init metadata under
`openspec/`. SDD templates stay in the installed `thoth-sdd` plugin skill and
are read there by phase contracts. Agent/global installation remains CLI-owned.

## Delegation and SDD

The global root contract handles bounded work directly and delegates only for
net gain. Children never delegate and each mutable surface has one writer.
Root owns sequential SDD coordination through the bundled `thoth-sdd`
contracts, recommends a route, and follows the user's selection. Explorer owns
Full discovery; read-only Oracle owns user-selected plan review and every final
verification, including Direct and Accelerated.

Standalone TOMLs are native Codex configuration layers, but role selection and
some permission constraints remain instruction-level in the collaboration
runtime. An implementation writer cannot substitute for oracle verification.

## Trust and precedence

- The CLI invokes the native manager but cannot bypass marketplace/plugin trust
  or higher-precedence policy.
- Global `~/.codex/AGENTS.md` may be refined or overridden by repository and
  subtree instructions.
- Profile, CLI, system, managed, and organization configuration retains its
  documented precedence.
- Project `.codex/` surfaces load only in trusted repositories.
- `--reset` repairs managed blocks/files only; it does not delete plugin caches,
  marketplaces, unrelated agents, skills, or provider configuration.

## Provider boundary

thoth-mem is independent and owns its hooks, MCP, installed skill, lifecycle,
persistence, receipts, and recovery. thoth-agents orchestrates only its public
setup command after the Codex layer; it never passes provider `--force`, edits
provider targets, or emulates provider mechanics.

During runtime the root follows the installed thoth-mem skill for recall,
durable lessons, compaction, and semantic completion. Delegated `none`, `recall`,
or `observe` authorization is independent from Codex workspace permissions and
never transfers root lifecycle. `openspec/` remains the canonical SDD store.

## Upstream references

- [Build Codex plugins](https://learn.chatgpt.com/docs/build-plugins#plugin-structure)
- [Build Codex skills](https://learn.chatgpt.com/docs/build-skills#where-to-save-skills)
- [Codex custom subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents)
- [Codex `AGENTS.md`](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
- [Codex hooks](https://learn.chatgpt.com/docs/hooks)
