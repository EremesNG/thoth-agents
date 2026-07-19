# Codex Plugin Packaging

thoth-agents ships a repository-native Codex marketplace instead of generating
a personal marketplace or copying a plugin into a user's cache.

## Published layout

```text
.agents/plugins/marketplace.json
integrations/codex/
├── .codex-plugin/
│   ├── plugin.json
│   └── .thoth-agents-plugin-assets.json
└── .mcp.json
```

The marketplace source is `./integrations/codex`. `package.json` includes both
the catalog and integration directory in the published npm tarball.

## Manifest

The 0.3.0 manifest is intentionally lean:

```json
{
  "name": "thoth-agents",
  "version": "0.3.0",
  "description": "Adaptive multi-harness agent pack with ten roles and Spec Kit-compatible SDD coordination.",
  "mcpServers": "./.mcp.json"
}
```

Only validated Codex manifest fields are emitted. The package contains the
manifest, thoth-agents research MCP configuration, and deterministic asset
provenance. It does not bundle SDD phase skills, external required skills,
custom-agent TOMLs, root `AGENTS.md`, or thoth-mem assets.

Codex custom-agent TOMLs and root instructions use different native surfaces and
are materialized by `npx thoth-agents@latest install --agent=codex`. Required
skills are installed separately under `~/.codex/skills`.

## Native registration

```bash
codex plugin marketplace add EremesNG/thoth-agents
```

After restarting Codex, use `/plugins` for installation/enablement and `/hooks`
for trust review. The thoth-agents CLI intentionally does not mutate
`~/.codex/plugins` or a personal marketplace file; Codex owns those snapshots
and caches.

Native installation is only the package layer. Complete the CLI layer afterward:

```bash
npx thoth-agents@latest install --agent=codex --dry-run
npx thoth-agents@latest install --agent=codex
```

Without the CLI, Codex does not receive the thoth-agents block in global
`AGENTS.md`, the nine custom agents, managed Default-mode feature configuration,
model ownership state, or mandatory external skills.

## Generation and verification

The catalogs and packages are generated from the harness adapters:

```bash
pnpm run build
pnpm run integration:verify
```

`.codex-plugin/.thoth-agents-plugin-assets.json` records deterministic asset
paths, fields, and hashes. Change the owning adapter/writer and regenerate; do
not edit generated package files by hand.

See [Codex Install](codex-install.md) for the complete two-surface install and
trust flow.
