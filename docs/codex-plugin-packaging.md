# Codex Plugin Packaging

The Codex distribution is generated at `integrations/codex` and published
through `.agents/plugins/marketplace.json`.

## Generated layout

```text
integrations/codex/
├── .codex-plugin/
│   ├── plugin.json
│   └── .thoth-agents-plugin-assets.json
├── .mcp.json
└── skills/
    ├── thoth-init/
    ├── thoth-sdd/
    ├── thoth-constitution/
    └── thoth-archive/
```

The manifest declares `skills: "./skills/"` and the packaged MCP file. It does
not declare or hide custom-agent TOMLs: Codex's documented plugin structure has
no agents component.

## Required global layer

After native `/plugins` installation, the thoth-agents CLI must write six
standalone custom agents under `~/.codex/agents/`, the managed orchestrator block
under `~/.codex/AGENTS.md`, and managed configuration under
`~/.codex/config.toml`. It also installs the four external skills from their
canonical repositories. The plugin package cannot perform those global writes.

`$thoth-init` remains a bundled project-governance skill. It creates
`openspec/` assets only and is not an agent installer.

## Generation lifecycle

`pnpm run integration:sync` renders package metadata, the four thoth-owned
skills, and marketplace catalogs. External skills remain CLI-installed from
their canonical repositories. `pnpm run build` synchronizes before compilation.
The npm version lifecycle used by `release:patch`, `release:minor`, and
`release:major` keeps both integration versions aligned with the root version.

## Ownership and limitations

Codex owns marketplace registration, installed snapshots, trust, and caches.
thoth-agents does not copy plugins into personal manager directories. Standalone
agent role matching and some permissions remain instruction-level.

See [Build Codex plugins](https://learn.chatgpt.com/docs/build-plugins#plugin-structure)
and [Codex custom subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents).
