# Codex Surface Validation

This Phase 1 record gates later Codex artifact writers. A Codex adapter may
generate only surfaces marked `validated` below. `unsupported` and `unknown`
surfaces produce diagnostics only, with instruction-level fallback where noted.

For the multi-harness overview and how Codex relates to the OpenCode default
path, see the [README](../README.md) and
[Installation](installation.md). This page stays focused on Codex generation
surfaces and caveats.

## Sources checked

- OpenAI Codex Configuration Reference - project/user `config.toml`, MCP,
  skills config, features, approval policy, sandbox settings, and hooks mention.
- OpenAI Codex Subagents - custom agent TOML under `~/.codex/agents/` or
  `.codex/agents/`, required fields, inherited config keys, and manual spawning.
- OpenAI Codex Skills - `SKILL.md` skill folders and repo-local
  `.agents/skills` discovery plus plugin-bundled `skills/` package assets.
- OpenAI Codex Plugins - plugin-root `plugin.json`, bundled `skills/`, bundled
  hook assets, official manifest keys, plugin hook feature gates, and trust
  review.
- OpenAI Codex Agent approvals & security - sandbox, approval policy, and
  network/write constraints.

## Capability matrix

| Surface | Status | Generated target | Diagnostic / fallback |
| --- | --- | --- | --- |
| Project custom agents | validated | `.codex/agents/{name}.toml` with `name`, `description`, `developer_instructions`, optional model/reasoning/sandbox/MCP/skills fields | n/a |
| Project config | validated | `.codex/config.toml` snippets for validated model, approval, sandbox, features, MCP, skills, and agents fields | n/a |
| MCP configuration | validated | `[mcp_servers.*]` in `.codex/config.toml` | n/a |
| Repo skills | validated | `.agents/skills/{skill}/SKILL.md` and optional skill assets | n/a |
| Project hooks.json | validated | `.codex/hooks.json` command handlers | n/a |
| Inline hooks table | validated | `[hooks]` in `.codex/config.toml` command handlers | n/a |
| Features hooks toggle | validated | `features.hooks` in `.codex/config.toml` | n/a |
| Plugin hooks bundle | validated | `.codex/plugins/{plugin}/hooks.json` with `features.plugin_hooks` | n/a |
| Plugin manifest | validated | `.codex-plugin/plugin.json` with official keys only: `name`, `version`, `description`, `skills`, `mcpServers`, `apps`, `hooks`, `interface` | unregistered manifest fields are skipped with `codex.plugin.field.unvalidated` |
| Plugin-bundled skills | validated | `.codex-plugin/skills/{skill}/SKILL.md` referenced as `./skills/` | primary Codex delivery strategy; `.agents/skills` remains fallback/dev/repo-local mode |
| Plugin-bundled hooks | validated | `.codex-plugin/hooks/hooks.json` referenced as `./hooks/hooks.json` | package content only; activation still requires `features.plugin_hooks` and trust review |
| Lifecycle hooks | unknown | none | `codex.surface.hooks.unvalidated`; diagnostic-only until event schema and parity are validated |
| Per-agent runtime permission maps | unsupported | none | `codex.permission.memory.enforcement_gap`; instruction-level governance only |
| Programmatic delegation runtime | unsupported | none | `codex.delegation.runtime.unsupported`; instruction-level/manual subagent workflow only, including post-response subagent session close guidance |
| Parent session/project injection | unknown | none | `codex.context.parent_injection.unvalidated`; prompts must require explicit parent `session_id`/`project` |

## Codex Hook Support Matrix

Codex lifecycle hooks are validated through hook-specific configuration surfaces and diagnostics, rather than a generic programmable runtime capability. The adapter models hook support conservatively to prevent overpromising enforcement power.

### Supported Hook Events
The following events are fully validated and supported for **command handlers** only:
- `SessionStart` - Triggered when a new Codex session begins.
- `UserPromptSubmit` - Triggered when a user submits a prompt.
- `PreToolUse` - Triggered before a tool is executed.
- `PermissionRequest` - Triggered when a tool requires user permission.
- `PostToolUse` - Triggered after a tool finishes execution.
- `Stop` - Triggered when a session ends or is stopped.

### Supported Handler Types
- **Command Handlers** (`command`): Fully validated and supported.
- **Prompt Handlers** (`prompt`): Unsupported. Produces `codex.hooks.handler.prompt_unsupported` diagnostic.
- **Agent Handlers** (`agent`): Unsupported. Produces `codex.hooks.handler.agent_unsupported` diagnostic.

### Unsupported Hook Features & Fields
- **Async Hook Execution**: Unsupported. Produces `codex.hooks.async.unsupported` diagnostic.
- **Unsupported Output Fields**: Only the `message` field is supported in hook output. Any other fields produce `codex.hooks.output_field.unsupported` diagnostic.
- **Full Tool Interception**: Unsupported. Full tool interception is not allowed; hooks are diagnostic/config surfaces, not runtime enforcement mechanisms. Produces `codex.hooks.tool_interception.unsupported` diagnostic.

### Trust & Feature Gates
To protect the workspace, Codex hooks require explicit trust and feature enablement:
1. **Project Trust**: Project-local hooks (`.codex/hooks.json` or inline `[hooks]`) are only loaded if the project is trusted.
2. **Plugin Hook Trust Review**: Bundled plugin hooks require a trust review (`plugin.trust_review`) before execution.
3. **Feature Gates**:
   - `[features].hooks = true` must be enabled in `.codex/config.toml` to activate project-local hooks.
    - `[features].plugin_hooks = true` must be enabled to activate plugin hook bundles.

## Plugin Package Surface Rules

`.codex-plugin/` is the primary Codex package target for future installer work.
Writers must fail closed: plugin package artifacts may use only registered
`.codex-plugin/` paths and the official manifest fields listed above. Any
unregistered field, non-plugin path, or project-local fallback path requested as
plugin package content must return diagnostics and must not be represented as
successfully packaged content.

Plugin-bundled skills are preferred because they keep thoth-agents's SDD,
memory, review, and discovery skills scoped to the package that future Codex
installation will review. Repo-local `.agents/skills` is still validated, but it
is fallback/development output rather than the primary Codex delivery strategy.

Duplicate skill scopes remain an unresolved runtime precedence risk. If the same
skill exists in both plugin-bundled `./skills/` content and `.agents/skills`, the
adapter must report the risk instead of claiming which scope Codex will prefer.

## Safe Hook Use Cases and Limitations

Codex hooks are designed for **diagnostic, informational, and guidance** purposes, not for hard runtime security enforcement or automation.

### Recommended Safe Use Cases
- **Context & Guidance**: Providing session-start or prompt-entry guidance (e.g., reminding users of project conventions during `SessionStart` or `UserPromptSubmit`).
- **Guardrail Diagnostics**: Emitting warnings or suggestions based on tool inputs/outputs (e.g., checking for potential issues during `PreToolUse` or `PostToolUse`).
- **Memory Governance**: Reminding agents to save durable observations or check parent session context (e.g., during `Stop` or tool boundaries).
- **SDD Completion & Verification**: Reminding users to run verification checks (e.g., `bun run check:ci`) or update task lists upon SDD completion.

### Explicitly Rejected Hook Mappings
The following use cases are unsafe, unsupported, and explicitly rejected:
- **Tmux/Session Cleanup**: Hooks must not manage tmux session lifecycles or perform automatic cleanup.
- **Subagent Orchestration Graphs**: Hooks must not automate or route subagent dispatch graphs.
- **Skill Sync Automation**: Hooks must not automatically sync or download remote skills.
- **Hard Permission Enforcement**: Hooks cannot block or enforce security permissions. Use Codex sandbox settings and approval policies for hard security boundaries.

## Future Installer Consent Path

To maintain a conservative security posture, the plugin installer will never silently enable hooks or modify user configurations.

Any future CLI installer path that configures Codex hooks must:
1. **Require Explicit User Consent**: Prompt the user before modifying any configuration files.
2. **Mutate User Config Safely**: Only with explicit consent, the installer may mutate `~/.codex/config.toml` to enable the required feature gates:
   ```toml
   [features]
   hooks = true
   plugin_hooks = true
   ```

## Enforcement rule

Later Codex adapter tasks must call the machine-readable registry in
`src/harness/adapters/codex-surfaces.ts` before planning artifacts. If a surface
is not `validated`, artifact generation for that field/path is forbidden and the
adapter must emit the registered diagnostic instead.

For user-facing model defaults, per-subagent overrides, reasoning effort, and
custom provider limitations, see
[`codex-model-customization.md`](./codex-model-customization.md).
