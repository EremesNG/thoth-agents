# Claude Code Plugin Packaging

Claude Code consumes the shared distribution generated at `plugin/`, published
through `.claude-plugin/marketplace.json`. Codex resolves to this same bundle;
each harness reads its own manifest and MCP surface.

## Generated layout

```text
plugin/
├── .codex-plugin/
├── .claude-plugin/
│   ├── plugin.json
│   └── .thoth-agents-plugin-assets.json
├── .mcp.json
├── codex.mcp.json
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
    ├── thoth-archive/
    └── plan-reviewer/
```

Every agent Markdown file is generated from the canonical `src/agents/` prompt
contract. The five owned skills are copied once from the canonical root
`skills/` tree. Codex-only assets are inert for Claude. Both plugin manifests
and marketplace entries equal the root package version.

## Runtime behavior

`settings.json` activates the orchestrator in the main thread. Specialist
delegation uses the `thoth-agents:<role>` namespace. Explorer, librarian, and
oracle deny write/edit tools; implementation roles retain bounded write access.
Oracle owns user-selected plan review and every final verify.

Claude discovers plugin skills automatically. The namespaced
`/thoth-agents:thoth-init` skill only synchronizes minimum project `openspec/`
governance because agents and owned skills already reside in the manager-owned
cache. Phase contracts consume SDD templates directly from that installed skill
tree rather than copying them into the project. Mandatory external skills reside
in Claude's global skill root after CLI installation. That CLI also invokes
thoth-mem's public provider setup; no thoth-mem asset is copied into this shared
bundle.

## Generation lifecycle

`pnpm run integration:sync` regenerates both manifests and marketplaces, Claude
agent files/settings, both MCP surfaces, both asset inventories, and one copy of
the five thoth-owned skills. External skills remain CLI-installed from their
canonical repositories. Build and npm version lifecycle commands run this
synchronization, keeping release versions and shared bundle contents aligned.

## Ownership and limitations

Claude owns marketplace snapshots, installed cache files, enablement, and
packaged model defaults. thoth-agents never edits its cache. Native tool denials
protect read-only roles, but path-pattern write restriction remains
instruction-level. Background agents do not have the foreground session's full
interactive behavior. thoth-mem independently owns its hooks, MCP, skill,
lifecycle, persistence, receipts, and recovery even though thoth-agents
orchestrates its setup during installation.
