# Codex Surface Validation

After native plugin installation and the mandatory CLI layer, validate:

| Surface | Expected state |
| --- | --- |
| `/plugins` | `thoth-agents` installed and enabled from `EremesNG/thoth-agents` |
| Plugin skills | SDD/init/constitution/archive and four mandatory execution skills discoverable |
| `~/.codex/AGENTS.md` | One bounded `thoth-agents:codex-root` block; unrelated global guidance preserved |
| `~/.codex/agents/` | Six `thoth-agents-<role>.toml` files and managed model state; no orchestrator child |
| `~/.codex/config.toml` | Managed request-user-input feature merge present |
| Project `openspec/` | Constitution, templates, and init metadata after `$thoth-init` |

Run:

```bash
npx thoth-agents@latest status --harness=codex
```

Restart Codex after global setup. In each repository, `$thoth-init` should be
idempotent and preserve project-owned governance. It does not create custom
agents or alter global instructions.

## Known enforcement gaps

- The ambient session is root.
- Collaboration has no hard installed-role selector, so role matching remains
  partly instruction-level.
- Some per-role permission boundaries cannot match OpenCode enforcement.
- Global guidance/config may be overridden by more specific or managed layers.
- Native plugin and hook trust remain Codex-owned.
