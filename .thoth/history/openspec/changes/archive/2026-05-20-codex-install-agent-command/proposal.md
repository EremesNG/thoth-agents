# Proposal: Codex Install Agent Command

## Intent

Add a planned Codex installer path so users can run a public command such as
`bunx oh-my-opencode-lite@latest install --agent=codex`, while preserving the
existing OpenCode installer as `install --agent=opencode` and as the default
when no agent is specified.

## Scope

### In Scope

- Add CLI contract planning for `install --agent=codex|opencode`, including
  `--dry-run`, doctor/repair-friendly lifecycle hooks, managed-only Codex reset
  semantics, and backwards-compatible OpenCode defaults.
- Keep the OpenCode install path as a native/plugin adapter that only ensures the
  `oh-my-opencode-lite@latest` plugin entry in `opencode.jsonc`, without Codex
  target writes or plugin-entry churn.
- Plan Codex installation as agent-pack materialization across Codex targets:
  user-level root-session instructions in `~/.codex/AGENTS.md`, role subagent
  TOML, plugin-bundled skills/MCP/hooks/apps/interface assets where documented,
  and diagnostics for capability gaps.
- Consume or generate the deterministic `.codex-plugin/` package artifact created
  by prior Codex packaging work, whose manifest scope is limited to documented
  plugin fields such as `name`, `version`, `description`, `skills`,
  `mcpServers`, `apps`, `hooks`, and `interface`.
- Plan conservative Codex user config TOML updates for `~/.codex/config.toml` or
  platform equivalent, including `[features].hooks = true` and explicit
  `[features].plugin_hooks = true` only after the user chooses Codex install.
- Adopt the conceptual `buildSetupPlan -> applySetup` lifecycle from the
  companion `oh-my-codex` work: plan first, apply second, template-driven writes,
  project/global target separation, and dry-run/doctor/repair extensibility.
- Define TOML merge, backup, atomic write, idempotency, Windows path handling,
  `~/.codex/AGENTS.md` managed-block merge behavior, and dry-run diff
  requirements.
- Provide post-install guidance for `/plugins` and `/hooks` trust review, with
  diagnostics for admin or higher-precedence config overrides.

### Out of Scope

- Implementing code in this SDD phase.
- Provider configuration or model setup.
- Bypassing Codex hook trust review or claiming hooks enforce hard policy.
- Making Codex `orchestrator` a selectable main custom agent or promising an
  oh-my-codex-style `$deep-interview "prompt"` command UX; the ambient/root
  Codex session remains the user's main agent surface.
- Treating custom agents as bundled `.codex-plugin` artifacts; current documented
  plugin packaging covers skills, MCP servers, apps/connectors, hooks, and
  interface/assets, while Codex role agents are generated separately as TOML.
- Copying destructive uninstall behavior, JSON memory models, hardcoded product
  paths, or overwrite-first config behavior from `oh-my-codex`.
- tmux/session cleanup mapping, Claude, Antigravity, or other harnesses.

## Approach

Extend the installer into an agent-dispatched flow. `opencode` routes to the
current installer unchanged; `codex` routes to a new conservative setup-plan
installer. The Codex path first builds an auditable setup plan, then either
prints it (`--dry-run`/doctor-style diagnostics) or applies managed writes with
backups and atomic operations. Because Codex has an ambient/root agent instead of
a selectable main custom orchestrator, the installer must compose Codex-specific
oh-my-opencode-lite root orchestrator instructions into a managed block in
`~/.codex/AGENTS.md`, preserving existing user guidance through backup/merge
behavior. Those root instructions should tell the Codex root session how to use
the packaged oh-my-opencode-lite plugin capabilities, while role specialists are
installed separately as six subagent TOML files where supported. It should not
model the UX as direct `$deep-interview "prompt"` role commands or as a primary
`@plugin_name` invocation path.

Because official Codex plugin install cache layout is not a stable external CLI
contract, the default design should avoid pretending to register a plugin
silently; it should write/refresh package and template assets, emit exact
`/plugins` and `/hooks` review steps, and only write docs-backed config entries
that are safe to enable.

## Affected Areas

- `src/cli/index.ts`, `src/cli/install.ts`, and `src/cli/types.ts` for agent
  selection, help text, dry-run, and managed-only Codex reset behavior.
- `src/cli/config-io.ts` or new Codex config IO modules for TOML parsing,
  merging, backup, and atomic writes.
- `src/harness/writers/codex-plugin-package.ts` and Codex adapter wiring for
  package artifact consumption.
- Tests under `src/cli/` and `src/harness/writers/`.
- Codex packaging/install documentation and post-install messaging.
- Codex root-instruction, six role-subagent, skill, MCP/config, hook, app, and
  plugin/interface asset templates or renderers behind the Codex adapter boundary.

## Risks

- Codex plugin cache internals may be undocumented; direct cache writes could be
  brittle or unsafe.
- TOML comment preservation may require a dedicated parser; fallback serialization
  could drop comments and must be guarded by backups and dry-run diffs.
- `plugin_hooks` enablement alone does not trust hooks, so messaging must prevent
  false activation or enforcement claims.
- Codex may not expose runtime parity for OpenCode role permissions, memory
  governance, or provider-per-agent controls; unsupported capabilities must be
  surfaced as instruction-only limitations or follow-up validation items.
- Root instruction composition can collide with existing user guidance; managed
  blocks, backups, dry-run diffs, and repair diagnostics are required to avoid
  destructive overwrites.
- Plugin-bundled skill precedence versus repo-local/user-local skills remains a
  validation risk and must be surfaced in diagnostics or documentation until
  implementation proves the effective precedence model.

## Rollback Plan

Keep Codex install behind `--agent=codex`. Rollback can remove or disable that
branch while leaving default/OpenCode install behavior and `.codex-plugin/`
packaging intact.

## Success Criteria

- `install --agent=opencode` and bare `install` preserve current behavior.
- `install --agent=opencode` and bare `install` do not mutate Codex targets, and
  `install --agent=codex` does not mutate OpenCode config or destabilize an
  existing `oh-my-opencode-lite@latest` plugin entry.
- `install --agent=codex` has a documented, testable plan for root instruction
  composition into `~/.codex/AGENTS.md`, six role subagent materialization,
  package generation, config
  mutation, dry-run, backups, idempotency, diagnostics, and post-install trust
  steps.
- Codex user config updates are conservative, reversible through backups, and do
  not claim to bypass `/plugins` or `/hooks` review.
- Codex artifacts are managed and idempotent: existing user content is preserved
  through conservative merge/backup behavior, no destructive deletion is required,
  and future doctor/repair commands can reason over the same setup plan.
- Codex v1 does not introduce a broad destructive `--force`; `--reset` is limited
  to oh-my-opencode-lite managed keys, managed blocks, generated package assets,
  and deterministic managed role files.
- Codex documentation and CLI output disclose that some role permissions,
  provider-per-agent behavior, and memory governance may be instruction-only
  unless backed by documented Codex controls.
- `.codex-plugin/plugin.json` validation is limited to documented plugin fields,
  and the installer/docs do not claim custom agents are bundled inside the plugin
  package.
