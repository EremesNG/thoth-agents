# Claude Code Plugin Packaging

Claude Code consumes the shared distribution generated at `plugin/`. The
separate `EremesNG/thoth-plugins` repository publishes its central marketplace
entry; Codex resolves to this same bundle, and each harness reads its own
manifest and MCP surface.

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
equal the root package version. The central catalog independently pins that
version and its immutable product tag.

## Runtime behavior

`settings.json` activates the orchestrator in the main thread. Specialist
delegation uses the `thoth-agents:<role>` namespace. Explorer, librarian, and
oracle deny write/edit tools; implementation roles retain bounded write access.
The root shapes dependencies, ready/blocked lanes, and one-writer ownership.
Claude's native `Agent` calls fan out every ready conflict-free lane before
waiting and fan in only terminal native results. Explicitly or bounded-default
selected plan review is optional; trivial deterministic Direct work may use focused root checks, while
materially risky Direct work and every Accelerated or Full final verify use a
fresh read-only Oracle.

Semantic triggers keep the complete roster actionable: `librarian` handles
current or external facts, `designer` handles material UI/UX, interaction,
accessibility, or visual quality, and `quick` handles known narrow low-risk
isolated edits. `deep` handles coupled or high-risk work. Native Claude
execution and lifecycle are authoritative for dispatch, status/wait,
steering, cancellation, and terminal results; unavailable primitives receive a
truthful sequential fallback. No additional thoth coordination mechanism is
involved.

Claude discovers plugin skills automatically. The namespaced
`/thoth-agents:thoth-init` skill only synchronizes minimum project `openspec/`
governance because agents and owned skills already reside in the manager-owned
cache. Phase contracts consume SDD templates directly from that installed skill
tree rather than copying them into the project. Mandatory external skills reside
in Claude's global skill root after CLI installation. That CLI also invokes
thoth-mem's public provider setup; no thoth-mem asset is copied into this shared
bundle.

## Generation lifecycle

`pnpm run integration:sync` regenerates both manifests, Claude agent
files/settings, both MCP surfaces, both asset inventories, and one copy of the
five thoth-owned skills. It does not generate a marketplace catalog. External
skills remain CLI-installed from their canonical repositories. Build and npm
version lifecycle commands run this synchronization, keeping release versions
and shared bundle contents aligned; release then publishes only the
thoth-agents pin to the central catalog.

## Ownership and limitations

Claude owns marketplace snapshots, installed cache files, enablement, and
packaged model defaults. thoth-agents never edits its cache. Native tool denials
protect read-only roles, but path-pattern write restriction remains
instruction-level. Background agents do not have the foreground session's full
interactive behavior. thoth-mem independently owns its hooks, MCP, skill,
lifecycle, persistence, receipts, and recovery even though thoth-agents
orchestrates its setup during installation.
