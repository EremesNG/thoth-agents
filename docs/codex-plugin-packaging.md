# Codex Plugin Packaging

Codex packaging for thoth-agents is centered on a deterministic plugin
package rooted at `.codex-plugin/`. `install --agent=codex` renders that package
layout directly into the Personal plugin source directory
`~/.codex/plugins/thoth-agents/` and registers that source in
`~/.agents/plugins/marketplace.json`. Registration does not bypass `/plugins`,
bypass `/hooks`, or complete trust review.

This page is the Codex technical packaging record. For the product-level
multi-harness orientation, see the [README](../README.md). For install commands
and trust-review steps, see [Codex Install](codex-install.md).

## Primary delivery strategy

Plugin-bundled skills are the primary Codex delivery mode. A package manifest at
`.codex-plugin/plugin.json` references package-local assets with plugin-root
relative paths such as:

```json
{
  "name": "thoth-agents",
  "version": "1.0.0",
  "description": "Delegate-first agents and SDD skills for Codex.",
  "skills": "./skills/",
  "hooks": "./hooks/hooks.json"
}
```

Only official Codex plugin manifest keys are emitted: `name`, `version`,
`description`, `skills`, `mcpServers`, `apps`, `hooks`, and `interface`.
Unvalidated fields and paths outside `.codex-plugin/` are skipped with
diagnostics. Codex custom agents are not bundled in `plugin.json`; the installer
materializes six role subagent TOML files separately under Codex agent targets.

## Fallback and development mode

Repo-local `.agents/skills` remains a validated Codex surface for fallback,
development, or repository-local testing. It is not the primary package artifact
for this project. Future adapter integration must require an explicit fallback
option before emitting `.agents/skills` as Codex skill output.

## Hook packaging boundaries

Hook bundles may be packaged under `.codex-plugin/hooks/hooks.json` and
referenced from `plugin.json` as `./hooks/hooks.json` only after they pass the
validated Codex hook surface rules. Packaging a hook bundle is distinct from
runtime activation:

- `features.plugin_hooks` must be enabled by Codex configuration before plugin
  hooks can run.
- Codex trust review must happen before bundled hooks are trusted.
- Packaged hooks must not be described as hard permission enforcement or as
  automatically active runtime behavior.

## Unresolved duplicate-scope risk

Codex runtime precedence is not yet verified when the same skill name exists in
both plugin-bundled `./skills/` content and repo-local `.agents/skills`. Until
that is validated, packaging code and docs must report duplicate-scope risk and
avoid claiming an override order.

## Installer integration

`install --agent=codex` refreshes the Personal plugin source under
`~/.codex/plugins/thoth-agents/` from the deterministic package layout,
merges a managed entry into `~/.agents/plugins/marketplace.json`, merges root
Codex instructions into `~/.codex/AGENTS.md`, materializes the six role
subagents, and sets documented feature gates in `~/.codex/config.toml` through a
backed-up TOML merge,
including `features.default_mode_request_user_input` for the Codex Default mode
`request_user_input` tool. It intentionally does not copy assets into
undocumented Codex cache internals or guess a plugin id for
`[plugins."..."].enabled`; after install, restart Codex and use `/plugins` and
`/hooks` for enablement and trust review.
