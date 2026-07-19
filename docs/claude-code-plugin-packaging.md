# Claude Code Plugin Packaging

The Claude Code distribution is generated at `integrations/claude-code` and
published through `.claude-plugin/marketplace.json`.

## Generated layout

```text
integrations/claude-code/
├── .claude-plugin/
│   ├── plugin.json
│   └── .thoth-agents-plugin-assets.json
├── .mcp.json
├── settings.json
├── agents/
│   ├── orchestrator.md
│   ├── explorer.md
│   ├── librarian.md
│   ├── oracle.md
│   ├── designer.md
│   ├── quick.md
│   └── deep.md
└── skills/
    ├── thoth-init/
    ├── thoth-sdd/
    ├── thoth-constitution/
    └── thoth-archive/
```

Every agent Markdown file is generated from the canonical `src/agents/` prompt
contract. The four owned skills are copied from the canonical root `skills/`
tree. The plugin version and marketplace entry equal the root package version.

## Runtime behavior

`settings.json` activates the orchestrator in the main thread. Specialist
delegation uses the `thoth-agents:<role>` namespace. Explorer, librarian, and
oracle deny write/edit tools; implementation roles retain bounded write access.
Oracle always owns analyze and verify.

Claude discovers plugin skills automatically. The namespaced
`/thoth-agents:thoth-init` skill creates only missing project governance because
agents and owned skills already reside in the manager-owned cache. Mandatory
external skills reside in Claude's global skill root after CLI installation.

## Generation lifecycle

`pnpm run integration:sync` regenerates the manifest, marketplace, agent files,
settings, MCP configuration, asset inventory, and four thoth-owned skills.
External skills remain CLI-installed from their canonical repositories. Build
and npm version lifecycle commands run this synchronization, keeping release
versions and integration contents aligned.

## Ownership and limitations

Claude owns marketplace snapshots, installed cache files, enablement, and
packaged model defaults. thoth-agents never edits its cache. Native tool denials
protect read-only roles, but path-pattern write restriction remains
instruction-level. Background agents do not have the foreground session's full
interactive behavior.
