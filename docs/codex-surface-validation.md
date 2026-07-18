# Codex Surface Validation

`src/harness/adapters/codex-surfaces.ts` is the machine-readable gate for Codex
artifact generation. Writers fail closed when a surface, path, or manifest field
is not registered and validated.

## Surfaces used by 0.3.0

| Surface | Generated or managed target | Use |
| --- | --- | --- |
| Root instructions | `~/.codex/AGENTS.md` managed block | Adaptive root contract |
| Custom agents | `~/.codex/agents/thoth-agents-{role}.toml` | Nine specialist roles |
| User config | `~/.codex/config.toml` | Default-mode user input feature |
| Plugin manifest | Personal source derived from `.codex-plugin/plugin.json` | Package identity and assets |
| Plugin MCP | `.codex-plugin/.mcp.json` | thoth-agents research MCPs |
| Personal marketplace | `~/.agents/plugins/marketplace.json` | Local plugin-source registration |
| Global skills | `~/.codex/skills/{skill}/SKILL.md` | Mandatory external skills installed by the CLI |

The phase roles are custom-agent TOMLs, not plugin-bundled skills.

## Validated but unused package surfaces

The registry recognizes documented plugin `skills/` and command-hook surfaces so
the generic package writer can validate them. The current thoth-agents package
does not bundle SDD phase skills, provider lifecycle hooks, or skill-installation
hooks. Validation of a possible surface does not mean 0.3.0 emits it.

## Plugin manifest rules

Allowed manifest keys are `name`, `version`, `description`, `skills`,
`mcpServers`, `apps`, `hooks`, and `interface`. Current output uses only the
identity fields and `mcpServers`.

Every package path must remain under `.codex-plugin/`; absolute paths and `..`
segments fail validation. Unknown fields are omitted with an explicit diagnostic.

## Delegation and permissions

The current collaboration runtime supports generic programmatic delegation,
mailbox waits, task-tree inspection, messages, follow-up turns, and interruption.
It does not expose a hard installed-role selector. The root therefore expresses
role intent in task names/messages, and per-role matching remains
instruction-level.

Custom-agent TOMLs carry model, effort, and sandbox defaults. Do not claim exact
OpenCode permission-map parity where Codex does not document an equivalent hard
control.

## Hooks

The registry validates documented command-hook events and rejects prompt/agent
handlers, unsupported output fields, async execution, and claims of full tool
interception. Any packaged hook still requires its feature gate and trust review.

thoth-agents 0.3.0 does not use a Codex hook as an external-skill `postinstall`.
Marketplace npm sources do not run lifecycle scripts, so the CLI installs and
checks required skills directly.

## Provider boundary

No Codex surface generated here installs thoth-mem. Provider-specific hooks, MCP,
session identity, persistence, and recovery remain owned by the independently
installed provider.
