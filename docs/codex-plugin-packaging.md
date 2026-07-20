# Codex Plugin Packaging

Codex consumes the shared distribution generated at `plugin/`, published
through `.agents/plugins/marketplace.json`. Claude resolves to this same bundle;
each harness reads its own manifest and MCP surface.

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
    └── thoth-archive/
```

The Codex manifest declares `skills: "./skills/"` and
`mcpServers: "./codex.mcp.json"`. The sibling Claude assets are inert for Codex.
The manifest does not declare or hide custom-agent TOMLs: Codex's documented
plugin structure has no agents component.

## Required global layer

The thoth-agents CLI first asks Codex's native manager to register the published
marketplace and install the plugin. It then writes six standalone custom agents
under `~/.codex/agents/`, the managed orchestrator block under
`~/.codex/AGENTS.md`, and managed configuration under `~/.codex/config.toml`.
It also installs the four external skills from their canonical repositories.
The plugin package cannot perform those global writes.

`$thoth-init` remains a bundled project-governance skill. It creates
`openspec/` assets only and is not an agent installer.

## Generation lifecycle

`pnpm run integration:sync` renders both harness manifests, their MCP surfaces,
Claude agents/settings, one copy of the four thoth-owned skills, and both
marketplace catalogs. External skills remain CLI-installed from their canonical
repositories. `pnpm run build` synchronizes before compilation. The npm version
lifecycle used by `release:patch`, `release:minor`, and `release:major` keeps
both plugin manifests aligned with the root version.

## Ownership and limitations

Codex owns marketplace registration, installed snapshots, trust, and caches.
thoth-agents invokes official manager commands but does not copy plugins into
personal manager directories itself. Standalone agent role matching and some
permissions remain instruction-level.

See [Build Codex plugins](https://learn.chatgpt.com/docs/build-plugins#plugin-structure)
and [Codex custom subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents).
