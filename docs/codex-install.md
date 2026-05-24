# Codex Install

`thoth-agents` supports a Codex setup path in addition to the default
OpenCode plugin installer:

```bash
npx thoth-agents@latest
npx thoth-agents@latest install --agent=codex
npx thoth-agents@latest install --agent=codex --dry-run
npx thoth-agents@latest install --agent=opencode
```

The no-argument binary opens the interactive multi-harness TUI when stdin and
stdout are real TTY streams. In CI, redirected, or `TERM=dumb` terminals, it
falls back to the automation-safe OpenCode install path with the TUI disabled.

Bare `install` and `install --agent=opencode` preserve the existing OpenCode
behavior. They add or refresh the native OpenCode plugin entry and do not create
or mutate Codex targets. `install --agent=codex` is an explicit Codex agent-pack
setup and does not rewrite OpenCode config.

OpenCode plugin config such as `plugin: ["thoth-agents@latest"]` is only an
OpenCode loading surface. It does not create a global `thoth-agents` binary; run
the Codex installer through a global install, `npx thoth-agents@latest`, or
`pnpm dlx thoth-agents@latest`.

For the broader multi-harness orientation, start with the
[README](../README.md). For the full installation comparison, see
[Installation](installation.md).

## What Codex install writes

The Codex path builds a setup plan first, then applies it unless `--dry-run` is
used. The managed targets are:

- `~/.codex/AGENTS.md` - an thoth-agents managed block for the ambient
  Codex root session. Existing user instructions outside the block are preserved
  and backed up before rewrite.
- `~/.codex/agents/thoth-agents-{role}.toml` - six role subagents:
  `explorer`, `librarian`, `oracle`, `designer`, `quick`, and `deep`. No
  selectable Codex `orchestrator` TOML is generated in v1.
- `~/.codex/plugins/thoth-agents/` - Personal Codex plugin source
  generated from the deterministic Codex plugin package layout.
- `~/.agents/plugins/marketplace.json` - Personal marketplace entry pointing to
  the local plugin source with a local `./`-prefixed relative path. Existing
  unrelated marketplace entries are preserved.
- `~/.codex/config.toml` - conservative TOML merge of `[features].hooks = true`,
  `[features].plugin_hooks = true`, and
  `[features].default_mode_request_user_input = true` after explicit Codex
  install consent.

Dry-run prints the same target/action plan, diagnostics, backup requirements,
and TOML diff summary without writing config, Personal plugin source, backup, or
temp files.

## Trust review and limitations

After install, restart Codex, then review Codex plugin and hook state:

```text
/plugins
/hooks
```

Enabling `features.plugin_hooks` does not bypass hook trust review. Higher
precedence Codex config (project, profile, CLI, system, or admin) can override
user-level feature flags. Codex exposes the `request_user_input` tool in Default
mode when `features.default_mode_request_user_input` is enabled; do not assume it
is available in every collaboration mode. Role permissions, memory governance,
provider-per-agent settings, and hook enforcement are instruction-level or
user-managed unless Codex documents hard runtime controls for those surfaces.

For shared concepts such as the seven-agent roster, SDD, thoth-mem, and
delegation semantics, see [Quick Reference](quick-reference.md). For bundled
skill and MCP delivery surfaces, see [Skills and MCPs](skills-and-mcps.md).

## Reset semantics

For Codex, `--reset` is managed-only repair. It refreshes thoth-agents
managed blocks, managed TOML keys, deterministic role TOML files, the generated
Personal plugin source, and the managed Personal marketplace entry. It does not
delete unrelated marketplaces/plugins, overwrite whole config directories,
write repo-local `.codex-plugin/` artifacts, or implement a broad destructive
`--force`.
