# Codex Plugin Packaging

thoth-agents renders a deterministic Codex package rooted at `.codex-plugin/`
and installs it into the Personal plugin source
`~/.codex/plugins/thoth-agents/`.

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

Only validated Codex manifest fields are emitted. The package writer rejects
unknown fields and assets outside `.codex-plugin/` with diagnostics.

## What is and is not bundled

The Personal plugin source contains the manifest, thoth-agents research MCP
configuration, and deterministic asset provenance.

It does not bundle:

- SDD phase skills;
- the external `simplify`, `tdd`, `progressive-context-router`, or
  `architectural-grilling` skills;
- Codex custom-agent TOMLs;
- root `AGENTS.md` instructions; or
- thoth-mem hooks, MCP, protocol, or lifecycle assets.

The installer materializes root instructions and nine specialist TOMLs through
their native Codex target surfaces. Required external skills are installed
separately under `~/.codex/skills` through the skills CLI.

## Why there is no plugin postinstall

Codex marketplace npm plugin sources are fetched without running package
lifecycle scripts. A `postinstall` hook would therefore be unreliable for
mandatory external skills. The thoth-agents CLI owns dependency installation,
health checks, update, and repair.

## Personal marketplace registration

`install --agent=codex`:

1. renders the deterministic package into `~/.codex/plugins/thoth-agents/`;
2. merges a managed local source into `~/.agents/plugins/marketplace.json`;
3. preserves unrelated marketplace entries; and
4. leaves plugin enablement and trust review to `/plugins`.

Registration does not bypass `/plugins`, `/hooks`, or configuration precedence.

## Hook boundary

The package writer can validate documented command-hook assets, but the current
thoth-agents package does not install provider lifecycle hooks or use hooks to
download external skills. Plugin hooks, when present in a future package, would
still require the documented feature gate and trust review and would not become
hard permission enforcement.

## Generated provenance

`.codex-plugin/.thoth-agents-plugin-assets.json` records deterministic asset
paths, manifest fields, and hashes. It is generated output; change the owning
writer rather than editing installed provenance directly.

See [Codex Install](codex-install.md) for complete managed targets and trust
steps.
