# Codex Plugin Packaging

Codex consumes the shared distribution generated at `plugin/`. The separate
`thoth-plugins` repository publishes the canonical Codex and Claude Code
catalogs; each entry pins this repository's `plugin/` subdirectory and an
immutable `v<version>` tag. This package owns no marketplace descriptor.

## Generated layout

```text
plugin/
├── .codex-plugin/
│   ├── plugin.json
│   └── .thoth-agents-plugin-assets.json
├── .claude-plugin/
├── codex.mcp.json
├── .mcp.json
├── agents/
├── settings.json
└── skills/
    ├── thoth-init/
    ├── thoth-sdd/
    ├── thoth-constitution/
    ├── thoth-archive/
    └── plan-reviewer/
```

The Codex manifest declares `skills: "./skills/"` and
`mcpServers: "./codex.mcp.json"`. The sibling Claude assets are inert for Codex.
The manifest does not declare or hide custom-agent TOMLs: Codex's documented
plugin structure has no agents component.

## Required global layer

The thoth-agents CLI first asks Codex's native manager to register
`https://github.com/EremesNG/thoth-plugins.git` and install
`thoth-agents@thoth-plugins`. It then writes six standalone custom agents
under `~/.codex/agents/`, the managed orchestrator block under
`~/.codex/AGENTS.md`, and managed configuration under `~/.codex/config.toml`.
It also installs the four external skills from their canonical repositories.
The plugin package cannot perform those global writes.

`$thoth-init` remains a bundled project-governance skill. It preflights and
synchronizes only minimum `openspec/` directories, constitution, and metadata;
it is not an agent or template installer. Phase contracts resolve templates
directly from the sibling installed `thoth-sdd` skill.

## Generation lifecycle

`pnpm run integration:sync` renders both harness manifests, their MCP surfaces,
Claude agents/settings, and one copy of the five thoth-owned skills. It does not
render or package a marketplace catalog. External skills remain CLI-installed from their canonical
repositories. `pnpm run build` synchronizes before compilation. The npm version
lifecycle used by `release:patch`, `release:minor`, and `release:major` keeps
both plugin manifests aligned with the root version, pushes the product commit
and tag, and then publishes only the `thoth-agents` pin to the central catalog.

If the product tag is already pushed but catalog publication fails, run `pnpm
run release:marketplace`. This retry is idempotent and does not create another
package version. A concurrent update to central `main` rejects the normal push;
rerun the catalog-only command and never force-push the marketplace.

## Local development synchronization

`pnpm run setup:codex:local` builds the checkout and synchronizes the two Codex
layers that cannot be expressed by one plugin manifest. It validates an existing
personal marketplace entry for `thoth-agents` whose local source is
`./plugins/thoth-agents`, but never edits that catalog. It stages and replaces
`~/plugins/thoth-agents`, assigning cache-busting local versions only to the
copied Codex and Claude manifests.

The same command renders the current checkout's root instructions and six Codex
role TOMLs through the normal Codex setup planner, then applies its managed model
state and feature configuration. Existing user model and effort choices remain
preserved. Local development setup deliberately does not run the central
marketplace installer, install external skills, or invoke provider-owned
thoth-mem setup. Codex plugin selection remains manager-owned; simultaneous
enabled public and personal thoth-agents identities are rejected before writes.

## Ownership and limitations

Codex owns marketplace registration, installed snapshots, trust, and caches.
thoth-agents invokes official manager commands but does not copy plugins into
personal manager directories itself. With Codex closed, the installer first
verifies the enabled, executing-version `thoth-agents@thoth-plugins` identity,
then runs these exact owned removals in order:

```bash
codex plugin remove thoth-agents@thoth-agents --json
codex plugin remove thoth-agents@thoth-agents-codex --json
codex plugin marketplace remove thoth-agents --json
codex plugin marketplace remove thoth-agents-codex --json
```

If those commands leave orphaned state, only
`plugins/cache/{thoth-agents,thoth-agents-codex}` and
`.tmp/marketplaces/{thoth-agents,thoth-agents-codex}` below the resolved
`CODEX_HOME` are eligible. Existing roots must pass provenance, product-manifest,
real-descendant, directory, and non-link checks before manager mutation and again
before deletion. No glob, directory discovery, sibling-product cleanup, or
portable process detector is used. A lock or race retains the central plugin and
requires closing Codex and retrying; restarting Codex does not garbage-collect an
orphan cache. Standalone agent role matching and some permissions remain
instruction-level.

See [Build Codex plugins](https://learn.chatgpt.com/docs/build-plugins#plugin-structure)
and [Codex custom subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents).
