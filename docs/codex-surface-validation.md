# Codex Surface Validation

After the CLI completes native plugin installation and the mandatory global
layer, validate:

| Surface | Expected state |
| --- | --- |
| `/plugins` | `thoth-agents@thoth-plugins` installed and enabled from `EremesNG/thoth-plugins` |
| Skills | Five packaged workflow skills and four CLI-installed external execution skills discoverable |
| `/hooks` | Trusted `SessionStart` root and `SubagentStart` role hooks from `codex-hooks/`; Node on PATH |
| `~/.codex/AGENTS.md` | No thoth root block; legacy block migrated with `.bak`, unrelated global guidance preserved |
| `~/.codex/agents/` | Five thin `thoth-agents-<role>.toml` files and managed ownership/model state; no orchestrator child |
| `~/.codex/config.toml` | Request-user-input feature and six-child capacity merge; hook trust entries only with consent |
| Project `.thoth/` | Minimum changes/archive/specs and constitution paths after `$thoth-init`; existing governance and history preserved |

Run:

```bash
npx thoth-agents@latest status --harness=codex
npx thoth-agents@latest doctor --agent=codex
```

Restart Codex after global setup. In each repository, `$thoth-init` should be
idempotent and preserve project-owned governance. It does not create custom
agents, alter global instructions, or copy templates from the installed
`thoth-sdd` skill.

## Known enforcement gaps

- The ambient session is root.
- Collaboration has no hard installed-role selector, so role matching remains
  partly instruction-level.
- Some per-role permission boundaries cannot match OpenCode enforcement.
- Global guidance/config may be overridden by more specific or managed layers.
- Native plugin and hook trust remain Codex-owned; untrusted hooks are silently
  skipped, so root/role orchestration requires explicit trust. See
  [Codex installation](codex-install.md#trust-and-precedence).
