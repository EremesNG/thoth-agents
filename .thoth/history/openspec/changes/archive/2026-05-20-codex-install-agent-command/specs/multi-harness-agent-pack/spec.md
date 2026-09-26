# Delta for Multi-Harness Agent Pack

## ADDED Requirements

### Requirement: Select Install Target by Agent

The CLI MUST support `install --agent=opencode` and `install --agent=codex`, and
MUST preserve the existing OpenCode install path as the default when `--agent` is
omitted.

#### Scenario: Bare install remains OpenCode-compatible

- GIVEN an existing user runs `bunx oh-my-opencode-lite@latest install`
- WHEN the CLI parses and executes the command
- THEN it MUST route to the OpenCode installer behavior that existed before this
  change
- AND it MUST NOT require Codex, `.codex-plugin/`, or Codex user config to exist

#### Scenario: Explicit OpenCode agent preserves behavior

- GIVEN a user runs `bunx oh-my-opencode-lite@latest install --agent=opencode`
- WHEN installation executes with existing options such as `--dry-run`,
  `--reset`, `--tmux`, or `--skills`
- THEN the system MUST apply those options with the same semantics as the current
  OpenCode installer
- AND it MUST NOT invoke Codex installer side effects
- AND it MUST NOT create, update, delete, or inspect Codex target files such as
  root instructions, subagent TOML, `.codex-plugin/`, or Codex config as a
  required install side effect

#### Scenario: Explicit Codex agent does not mutate OpenCode config

- GIVEN a user has an existing OpenCode config with an
  `oh-my-opencode-lite@latest` plugin entry
- WHEN the user runs `bunx oh-my-opencode-lite@latest install --agent=codex`
- THEN the Codex installer MUST NOT rewrite, remove, duplicate, or reorder that
  OpenCode plugin entry
- AND it MUST NOT require OpenCode config to exist for Codex installation

#### Scenario: Explicit Codex agent routes to Codex installer

- GIVEN a user runs `bunx oh-my-opencode-lite@latest install --agent=codex`
- WHEN the CLI parses the command
- THEN it MUST route to the Codex install flow
- AND unsupported agent values MUST fail with a clear diagnostic listing
  `opencode` and `codex`

### Requirement: Install Codex Conservatively from Plugin Package Artifacts

The Codex install flow MUST consume or generate the deterministic
`.codex-plugin/` package artifact and MUST NOT silently claim full plugin
registration unless the registration mechanism is backed by official Codex
documentation and safe implementation. The plugin package manifest MUST be
limited to documented `.codex-plugin` fields (`name`, `version`, `description`,
`skills`, `mcpServers`, `apps`, `hooks`, and `interface`) and MUST NOT represent
Codex custom agents as bundled plugin artifacts in v1.

#### Scenario: Codex install prepares the plugin package

- GIVEN `install --agent=codex` is invoked
- WHEN the Codex plugin package is missing or stale
- THEN the system MUST generate or refresh the `.codex-plugin/` package using the
  existing Codex package writer
- AND generated package content MUST remain deterministic for the same inputs

#### Scenario: Undocumented plugin cache writes are avoided

- GIVEN official Codex docs identify installed plugin cache locations but do not
  define a stable external CLI installation API for that cache
- WHEN Codex install completes package preparation
- THEN the system MUST NOT copy into or mutate Codex plugin cache internals by
  default
- AND it MUST emit explicit next steps for `/plugins` or documented manual plugin
  enablement instead

#### Scenario: Docs-backed plugin config entries are gated

- GIVEN official Codex docs define enabled plugin state in user
  `config.toml` under `[plugins."..."].enabled`
- WHEN implementation can derive a safe, documented plugin identifier and target
  without cache mutation
- THEN the installer MAY write an idempotent enabled plugin entry
- AND if it cannot do so safely it MUST leave plugin enablement to `/plugins` and
  explain that choice in post-install output

#### Scenario: Plugin manifest excludes custom agents

- GIVEN the Codex plugin package is rendered for install or dry-run verification
- WHEN `.codex-plugin/plugin.json` is generated or validated
- THEN it MUST contain only documented plugin manifest fields such as `name`,
  `version`, `description`, `skills`, `mcpServers`, `apps`, `hooks`, and
  `interface`
- AND it MUST NOT include custom agent or orchestrator declarations as plugin
  manifest entries
- AND installer diagnostics or docs MUST explain that Codex role agents are
  generated separately from the plugin package

### Requirement: Materialize Codex Agent Pack into Ambient Root and Role Surfaces

The Codex install flow MUST install oh-my-opencode-lite as Codex-compatible agent
pack assets, composing Codex-specific root orchestrator guidance into
`~/.codex/AGENTS.md` and installing role specialists as subagents where Codex
supports them.
Target resolution MUST distinguish project and user/global scopes before any
materialization. Project-scope role subagent TOML MUST target `.codex/agents/`
inside the selected project; user/global role subagent TOML MUST target
`~/.codex/agents/` or the documented Codex-home equivalent. User/global MCP or
provider-capable config MUST target `~/.codex/config.toml` or the documented
Codex-home equivalent, while project trusted config MUST target
`.codex/config.toml` only where project-scope Codex config is applicable. Skills
MUST target `.agents/skills/` for project scope and `~/.agents/skills/` for
user/global scope. Root instructions MUST target a managed block in
`~/.codex/AGENTS.md`; existing user content in that file MUST be preserved by
managed-block merge behavior and backup before lossy rewrites. Role subagent TOML
filenames MUST be deterministic and namespaced as
`oh-my-opencode-lite-{role}.toml` for `explorer`, `librarian`, `oracle`,
`designer`, `quick`, and `deep`; v1 MUST NOT materialize a selectable
`orchestrator` role TOML.

#### Scenario: Root orchestrator guidance targets the ambient Codex session

- GIVEN a user runs `install --agent=codex`
- WHEN setup planning determines root instruction changes are required
- THEN the installer MUST plan a managed merge of oh-my-opencode-lite root
  orchestrator instructions into `~/.codex/AGENTS.md`
- AND the instructions MUST be Codex-specific rather than a verbatim OpenCode
  orchestrator prompt
- AND they MUST tell the Codex root session how to invoke or use the packaged
  oh-my-opencode-lite plugin capabilities
- AND it MUST NOT expose Codex `orchestrator` as a selectable main custom agent
  that the user must invoke instead of the ambient/root session

#### Scenario: Target resolver maps Codex surfaces by scope

- GIVEN setup planning is invoked for project-scope or user/global Codex install
- WHEN the installer resolves materialization targets
- THEN it MUST produce deterministic target paths for root instructions, role
  subagent TOML, skills, user/global config, optional project config, and package
  assets before any writes are attempted
- AND project-scope role TOML MUST resolve under `.codex/agents/` while
  user/global role TOML MUST resolve under `~/.codex/agents/` or the documented
  Codex-home equivalent
- AND role TOML filenames MUST be `oh-my-opencode-lite-{role}.toml` for
  `explorer`, `librarian`, `oracle`, `designer`, `quick`, and `deep`
- AND the resolver MUST NOT return a selectable `orchestrator` TOML target

#### Scenario: Root instruction destination is explicit and managed

- GIVEN the project has selected `~/.codex/AGENTS.md` as the user-level v1
  ambient/root Codex instruction target
- WHEN the resolver encodes root instruction changes
- THEN it MUST encode root instructions as a managed block in
  `~/.codex/AGENTS.md`
- AND tests MUST assert the exact destination path, managed marker names,
  backup behavior when the file already exists, and preservation of unrelated
  user instructions
- AND installer output MUST describe the destination as root/ambient instruction
  composition, not as a selectable orchestrator agent

#### Scenario: Role specialists are installed as subagents where supported

- GIVEN Codex supports custom subagent or role files such as TOML agent
  definitions
- WHEN Codex install applies role assets
- THEN explorer, librarian, oracle, designer, quick, and deep role assets MUST be
  materialized as Codex subagents or equivalent secondary role surfaces
- AND each role asset MUST preserve the shared read-only/write-capable split and
  report unsupported runtime controls as capability gaps
- AND no seventh `orchestrator` TOML role file MUST be generated

#### Scenario: Codex UX avoids command-model overclaiming

- GIVEN Codex install output describes how to use the installed agent pack
- WHEN it presents next steps or examples
- THEN it MUST describe interaction through the ambient/root Codex session plus
  delegated role guidance
- AND it MUST NOT promise an oh-my-codex-style `$deep-interview "prompt"` command
  model unless a documented Codex feature explicitly supports that UX

### Requirement: Plan and Apply Codex Setup Idempotently

The Codex installer MUST use a setup-plan lifecycle that separates planned
changes from writes, supports dry-run/doctor/repair diagnostics, and applies only
managed, conservative changes.

#### Scenario: Dry-run renders a complete setup plan without writes

- GIVEN a user invokes `install --agent=codex --dry-run`
- WHEN setup planning completes
- THEN the CLI MUST report every planned Codex target, action, backup need,
  managed block, and capability disclaimer
- AND it MUST NOT write package artifacts, config files, backups, temp files,
  OpenCode config, or Codex target files

#### Scenario: Apply uses managed merges and backups

- GIVEN a user invokes `install --agent=codex` without `--dry-run`
- WHEN setup applies planned Codex target writes
- THEN each mutable existing file MUST be merged through a managed-block or
  conservative template strategy where possible
- AND the installer MUST create backups before lossy rewrites, use atomic writes
  for config-like files, and preserve unrelated user content
- AND existing `~/.codex/AGENTS.md` content MUST be preserved outside the
  oh-my-opencode-lite managed block

#### Scenario: Future doctor and repair commands can reuse setup state

- GIVEN setup has planned or applied Codex managed assets
- WHEN future doctor or repair functionality inspects the installation
- THEN managed markers, diagnostics, and action metadata SHOULD be sufficient to
  identify missing, stale, conflicting, or user-modified managed assets
- AND the current installer MUST NOT rely on destructive deletion as its repair or
  rollback strategy

### Requirement: Mutate Codex User Config Only with Explicit Codex Install Consent

The system MUST mutate `~/.codex/config.toml` or the platform/Codex-home
equivalent only as part of an explicit Codex install command, and only through a
dry-run-visible, backed-up, atomic merge.

#### Scenario: Feature gates are set explicitly for Codex install

- GIVEN a user invokes `install --agent=codex` without `--dry-run`
- WHEN user Codex config is writable or can be created
- THEN the installer MUST ensure `[features].hooks = true`
- AND it MUST ensure `[features].plugin_hooks = true` only because the user chose
  Codex plugin installation
- AND repeated runs MUST NOT duplicate tables or alter unrelated values

#### Scenario: Dry-run reports config changes without writes

- GIVEN a user invokes `install --agent=codex --dry-run`
- WHEN Codex config changes would be required
- THEN the system MUST report the target config path and a human-reviewable diff
  or equivalent before/after summary
- AND it MUST NOT write package artifacts, config files, backups, or temp files
- AND it MUST include non-config Codex target changes in the same dry-run setup
  plan rather than reporting TOML changes in isolation

#### Scenario: Codex reset semantics are managed-only

- GIVEN a user invokes Codex install with existing config
- WHEN no reset option is supplied
- THEN the system MUST merge only managed keys and preserve unrelated user config
- AND `--reset` for `--agent=codex` MUST be limited to regenerating or replacing
  oh-my-opencode-lite managed keys, managed blocks, deterministic managed role
  files, and generated package assets
- AND v1 MUST NOT introduce a broad destructive Codex `--force` option
- AND destructive uninstall, unmanaged file deletion, or whole-config overwrite
  behavior MUST remain out of scope for install, repair, and rollback

### Requirement: Preserve Codex TOML Configuration Safely

Codex TOML IO MUST parse, merge, and write user config conservatively, with
backups and atomic writes, and MUST preserve existing profiles and unrelated
configuration.

#### Scenario: Existing TOML profiles are preserved

- GIVEN `~/.codex/config.toml` contains profiles, model settings, MCP servers,
  plugin entries, or unknown tables
- WHEN Codex install merges managed feature/plugin keys
- THEN those unrelated tables and values MUST remain semantically unchanged
- AND tests MUST cover preservation of existing profiles and nested config

#### Scenario: Comment preservation is handled transparently

- GIVEN the selected TOML parser/writer cannot preserve comments or formatting
- WHEN Codex install would rewrite `config.toml`
- THEN the installer MUST create a backup before writing
- AND dry-run output MUST disclose that comments or formatting may not be
  preserved
- AND implementation SHOULD prefer a comment-preserving strategy when practical

#### Scenario: Codex config path resolves across platforms

- GIVEN the process runs on Windows, macOS, or Linux
- WHEN Codex install resolves the user config path
- THEN it MUST use `CODEX_HOME` only if supported by project conventions or docs,
  otherwise the documented user home `.codex/config.toml` path
- AND Windows resolution MUST support `%USERPROFILE%\.codex\config.toml`

### Requirement: Surface Codex Trust and Precedence Boundaries

The Codex installer MUST explain that plugin hooks require Codex trust review and
that higher-precedence config can override user config.

#### Scenario: Post-install instructions include trust review

- GIVEN Codex install completes or dry-run reports planned changes
- WHEN the CLI prints next steps
- THEN it MUST instruct the user to run `/plugins` if manual plugin enablement is
  required
- AND it MUST instruct the user to run `/hooks` to review and trust plugin hooks
- AND it MUST state that enabling `features.plugin_hooks` does not bypass hook
  trust review

#### Scenario: Config precedence diagnostics are visible

- GIVEN Codex project, admin, system, profile, or CLI config can override user
  config
- WHEN Codex install writes or reports user config changes
- THEN it MUST warn that higher-precedence settings may override these flags
- AND it MUST avoid claiming that user config guarantees runtime hook activation

### Requirement: Disclose Codex Capability and Governance Limits

The Codex installer and generated artifacts MUST distinguish documented Codex
runtime capabilities from instruction-only guidance and MUST avoid overpromising
controls that Codex does not document.

#### Scenario: Role permission limitations are explicit

- GIVEN Codex does not expose documented per-role runtime controls equivalent to
  OpenCode permissions for a specific role rule
- WHEN Codex role assets or installer diagnostics are rendered
- THEN the rule MUST remain in instructions where useful
- AND the output MUST state that enforcement is instruction-level rather than a
  hard runtime permission control

#### Scenario: Memory governance limitations are explicit

- GIVEN thoth-mem governance requires root-owned session tools and delegated
  subagent memory limits
- WHEN Codex artifacts include memory guidance
- THEN generated root and role instructions MUST preserve those rules
- AND the installer MUST disclose any lack of documented Codex runtime controls
  that would otherwise be needed to enforce them mechanically

#### Scenario: Provider-per-agent is not overpromised

- GIVEN provider or model assignment per Codex subagent is not documented for the
  target surface
- WHEN install output, docs, or generated role files describe capabilities
- THEN they MUST NOT claim provider-per-agent behavior is configured
- AND they MAY identify it as a future validation item or user-managed setting
  only when phrased as non-guaranteed

#### Scenario: Hook presets require trust review

- GIVEN the setup plan includes hook presets or plugin hook assets
- WHEN Codex install completes or dry-run reports planned changes
- THEN the output MUST require user trust review through documented Codex hook
  review surfaces such as `/hooks`
- AND it MUST NOT represent hook presets as hard policy enforcement before Codex
  trust and activation are complete

## MODIFIED Requirements

### Requirement: Package Codex Plugin as the Primary Codex Delivery Artifact

The system MUST generate a deterministic Codex plugin package as the primary
Codex install packaging target, rooted at `.codex-plugin/` and described by a
Codex plugin manifest at `.codex-plugin/plugin.json`; Codex installation MUST
consume this package without automatically bypassing Codex plugin management or
hook trust gates, and without replacing root instruction or subagent TOML setup
that must be materialized into Codex's non-plugin target surfaces.

#### Scenario: Plugin package remains separate from automatic trust

- GIVEN the plugin package contains manifest, skills, MCP, or hook references
- WHEN `install --agent=codex` prepares the package
- THEN the system MUST NOT claim Codex plugin hooks are trusted automatically
- AND it MUST require documented Codex plugin enablement and `/hooks` review steps
  where automatic enablement is not safely docs-backed

## REMOVED Requirements

None.
