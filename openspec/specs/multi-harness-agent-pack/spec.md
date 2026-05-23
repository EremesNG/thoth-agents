# Spec: Multi-Harness Agent Pack

## Requirements

### Requirement: Preserve OpenCode Baseline Behavior
The system MUST continue to expose the existing OpenCode plugin behavior as the
default harness path unless a caller explicitly selects another supported
harness.

#### Scenario: Existing OpenCode users receive unchanged plugin behavior
- GIVEN an installation that uses the current OpenCode plugin entrypoints
- WHEN the multi-harness agent pack is loaded without a Codex-specific selection
- THEN the system MUST register the same OpenCode agents, skills, delegation
  rules, thoth-mem governance, and verification guidance that existed before
  this change
- AND the system MUST NOT require Codex configuration or artifacts for OpenCode
  operation

#### Scenario: OpenCode-specific behavior remains isolated
- GIVEN OpenCode plugin wiring requires OpenCode SDK types, hooks, or runtime
  registration semantics
- WHEN shared agent-pack contracts are used by another harness adapter
- THEN OpenCode-specific package writing and runtime integration MUST remain
  behind the OpenCode adapter boundary
- AND shared contracts MUST NOT import or depend on OpenCode-only APIs

### Requirement: Select Install Target by Agent
The CLI MUST support `install --agent=opencode` and `install --agent=codex`, and
MUST preserve the existing OpenCode install path as the default when `--agent` is
omitted.

#### Scenario: Bare install remains OpenCode-compatible
- GIVEN an existing user runs `bunx thoth-agents@latest install`
- WHEN the CLI parses and executes the command
- THEN it MUST route to the OpenCode installer behavior that existed before this
  change
- AND it MUST NOT require Codex, `.codex-plugin/`, or Codex user config to exist

#### Scenario: Explicit OpenCode agent preserves behavior
- GIVEN a user runs `bunx thoth-agents@latest install --agent=opencode`
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
  `thoth-agents@latest` plugin entry
- WHEN the user runs `bunx thoth-agents@latest install --agent=codex`
- THEN the Codex installer MUST NOT rewrite, remove, duplicate, or reorder that
  OpenCode plugin entry
- AND it MUST NOT require OpenCode config to exist for Codex installation

#### Scenario: Explicit Codex agent routes to Codex installer
- GIVEN a user runs `bunx thoth-agents@latest install --agent=codex`
- WHEN the CLI parses the command
- THEN it MUST route to the Codex install flow
- AND unsupported agent values MUST fail with a clear diagnostic listing
  `opencode` and `codex`

### Requirement: Define Harness-Agnostic Agent-Pack Contracts
The system MUST define harness-agnostic contracts for the seven-agent roster
intent, delegate-first operating rules, SDD pipeline semantics, thoth-mem
governance, and verification protocol.

#### Scenario: Shared contracts describe agent intent independent of harness
- GIVEN the agent pack contains orchestrator, explorer, librarian, oracle,
  designer, quick, and deep roles
- WHEN an adapter renders those roles for a supported harness
- THEN the adapter MUST derive role responsibilities, mutation permissions,
  dispatch expectations, and tool-governance language from shared contracts
- AND the adapter MAY translate that intent into harness-specific syntax or
  configuration files

#### Scenario: Delegate-first rules remain portable
- GIVEN a harness supports some form of subagent, task, or delegated execution
- WHEN the agent pack is rendered for that harness
- THEN the rendered artifacts MUST preserve the orchestrator-as-coordinator model
  and the read-only versus write-capable specialist split
- AND the rendered artifacts MUST describe any harness capability gaps rather
  than claiming unsupported delegation parity

#### Scenario: Verification protocol remains shared
- GIVEN a write-capable agent completes implementation work in any supported
  harness
- WHEN it reports completion
- THEN it MUST report verification evidence tied to the changed files,
  diagnostics, tests, or documented checks
- AND it MUST NOT claim completion for behavior changes without the smallest
  sufficient automated or explicitly documented verification

### Requirement: Isolate Harness-Specific Artifact Writing Behind Adapters
The system MUST keep harness-specific configuration, package, prompt, skill, and
MCP artifact writing behind harness adapter implementations.

#### Scenario: Shared layer requests harness artifact generation
- GIVEN shared agent-pack definitions are available in harness-neutral form
- WHEN a target harness is selected
- THEN only the selected harness adapter MUST write that harness's files,
  packages, prompts, skill manifests, or MCP settings
- AND the shared layer MUST NOT directly write OpenCode-only or Codex-only
  artifact paths

#### Scenario: Unsupported harnesses are not silently generated
- GIVEN a target harness has no implemented adapter
- WHEN a caller requests artifacts for that harness
- THEN the system MUST fail with an explicit unsupported-harness result
- AND it MUST NOT generate partial, misleading, or best-effort artifacts under
  another harness's layout

### Requirement: Package Codex Plugin as the Primary Codex Delivery Artifact
The system MUST generate deterministic Codex plugin package artifacts using the
`.codex-plugin/` package layout and a Codex plugin manifest equivalent to
`.codex-plugin/plugin.json`; Codex Personal installation MUST write those
artifacts to a Personal plugin source directory and register it through the
Personal marketplace file without automatically
bypassing Codex plugin management or hook trust gates, and without replacing root
instruction or subagent TOML setup that must be materialized into Codex's
non-plugin target surfaces.

#### Scenario: Plugin manifest references package-local assets
- GIVEN the Codex adapter renders primary Codex packaging artifacts
- WHEN it emits `.codex-plugin/plugin.json`
- THEN the manifest MUST include supported official Codex plugin fields such as
  `name`, `version`, `description`, `skills`, `mcpServers`, `apps`, `hooks`, or
  `interface` only when backed by validated package content
- AND manifest path values MUST be relative to the plugin root and begin with
  `./`
- AND generated manifest JSON MUST be deterministic across repeated renders for
  the same inputs

#### Scenario: Plugin package remains separate from automatic trust
- GIVEN the plugin package contains manifest, skills, MCP, or hook references
- WHEN `install --agent=codex` prepares the package
- THEN the system MUST NOT claim Codex plugin hooks are trusted automatically
- AND it MUST require documented Codex plugin enablement and `/hooks` review steps
  where automatic enablement is not safely docs-backed

#### Scenario: Personal install registers local plugin source
- GIVEN `install --agent=codex` is invoked for Personal mode
- WHEN the deterministic Codex plugin package layout is generated or refreshed
- THEN the installer MUST refresh a managed Personal plugin source under a user
  Codex plugin path such as `~/.codex/plugins/thoth-agents/`
- AND it MUST create or merge `~/.agents/plugins/marketplace.json` with a managed
  `thoth-agents` plugin entry that points to that local source using a
  relative `./`-prefixed local path when possible
- AND it MUST preserve unrelated Personal marketplace plugins and refresh only
  the managed thoth-agents entry
- AND post-install output MUST tell the user to restart Codex and review or
  enable the plugin through `/plugins`

### Requirement: Install Codex Conservatively from Plugin Package Artifacts
The Codex install flow MUST consume or generate deterministic Codex plugin
package artifacts and MUST NOT silently claim full plugin
registration unless the registration mechanism is backed by official Codex
documentation and safe implementation. The plugin package manifest MUST be
limited to documented `.codex-plugin` fields (`name`, `version`, `description`,
`skills`, `mcpServers`, `apps`, `hooks`, and `interface`) and MUST NOT represent
Codex custom agents as bundled plugin artifacts in v1.

#### Scenario: Codex install prepares and registers the plugin package
- GIVEN `install --agent=codex` is invoked
- WHEN the Codex plugin package content is missing or stale in the Personal
  plugin source
- THEN the system MUST generate or refresh the package content using the existing
  Codex package writer
- AND generated package content MUST remain deterministic for the same inputs
- AND Personal install MUST write the package content to the managed Personal
  plugin source and merge the managed Personal marketplace entry

#### Scenario: Undocumented plugin cache writes are avoided
- GIVEN official Codex docs identify installed plugin cache locations but do not
  define a stable external CLI installation API for that cache
- WHEN Codex install completes package preparation
- THEN the system MUST NOT copy into or mutate Codex plugin cache internals by
  default
- AND it MUST emit explicit next steps for `/plugins` or documented manual plugin
  enablement instead

#### Scenario: Docs-backed plugin config entries are gated
- GIVEN official Codex docs define enabled plugin state in user `config.toml`
  under `[plugins."..."].enabled`
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

### Requirement: Bundle Codex Skills Under the Plugin Root
The system MUST package bundled skills under plugin-root `skills/<skill>/` paths
for primary Codex packaging and MUST preserve skill source provenance for
deterministic verification.

#### Scenario: Bundled skill artifacts use plugin-local paths
- GIVEN the shared skill registry contains requirements, SDD, review, memory,
  discovery, and shared-support skill entries
- WHEN primary Codex plugin packaging is rendered
- THEN each available skill file MUST be emitted under
  `.codex-plugin/skills/<skill>/...`
- AND `.codex-plugin/plugin.json` MUST reference the skills collection with a
  plugin-root relative path such as `./skills/`
- AND the package MUST include a deterministic manifest or fixture data that maps
  source paths to package paths and hashes

#### Scenario: Missing skill sources are diagnosed without partial deception
- GIVEN a skill registry entry points to a source directory that does not exist
- WHEN Codex plugin skill bundling runs
- THEN the missing skill MUST be skipped or marked incomplete with an explicit
  diagnostic
- AND the plugin manifest MUST NOT reference absent skill content as if it were
  packaged successfully

### Requirement: Treat `.agents/skills` as Fallback or Development Output
The system MUST NOT treat `.agents/skills` as the primary Codex install package
for thoth-agents; it MAY remain available only as an explicit fallback,
development, or repo-local generation mode.

#### Scenario: Primary packaging does not write repo-scope skills by default
- GIVEN a caller requests primary Codex packaging
- WHEN the Codex adapter renders artifacts
- THEN generated skill artifacts MUST target `.codex-plugin/skills/`
- AND `.agents/skills` artifacts MUST NOT be emitted unless an explicit fallback,
  development, or repo-local option selects that mode

#### Scenario: Duplicate skill delivery is diagnosed
- GIVEN both plugin-bundled skills and fallback `.agents/skills` output are
  selected or detected for the same skill names
- WHEN the adapter reports the render result
- THEN it MUST emit a diagnostic explaining possible duplicate skill sources and
  the unresolved precedence risk
- AND it MUST identify plugin-bundled skills as the intended primary package
  content for future Codex installation

### Requirement: Package Validated Codex Plugin Hooks Conservatively
The system MUST include Codex plugin hook artifacts only for validated hook
surfaces and MUST keep hook activation, trust, and runtime enforcement as
diagnostic or installer/runtime concerns.

#### Scenario: Validated hooks are bundled under plugin-root hooks paths
- GIVEN current Codex hook validation marks a plugin hook bundle surface as
  validated
- WHEN hook packaging is enabled for hook definitions that pass validation
- THEN the package MUST emit hook configuration under a plugin-root path such as
  `.codex-plugin/hooks/hooks.json`
- AND `.codex-plugin/plugin.json` MUST reference that hook configuration with a
  `./hooks/...` path
- AND unsupported events, handler types, async execution, output fields, or tool
  interception MUST produce diagnostics instead of plugin hook artifacts

#### Scenario: Hook package diagnostics preserve trust boundaries
- GIVEN bundled hook configuration is included in the plugin package
- WHEN diagnostics are returned
- THEN they MUST state that activation requires Codex plugin hook feature gates
  such as `features.plugin_hooks` and Codex trust review
- AND they MUST NOT represent packaged hooks as hard permission enforcement or as
  automatically active runtime behavior

### Requirement: Provide a Codex Adapter MVP
The system MUST provide Codex as the first additional harness target, MUST treat
Codex as configuration-first unless design validates a stronger docs-backed
runtime API, and MUST use Codex plugin packaging as the primary skill and hook
delivery strategy for future Codex installation.

#### Scenario: Codex artifacts are generated from shared contracts
- GIVEN the Codex adapter is selected
- WHEN agent-pack artifacts are generated or shipped for Codex
- THEN the system MUST continue to produce existing validated project artifacts
  such as `.codex/agents/*.toml` and `.codex/config.toml` unless explicitly
  moved by design
- AND it MUST produce a plugin package containing `.codex-plugin/plugin.json`,
  plugin-bundled skills, and eligible plugin-bundled hooks as the primary Codex
  install packaging target
- AND it MUST include Codex configuration TOML, MCP settings, hooks, or skill
  layout only where those artifacts are backed by confirmed Codex documentation
  or an explicit design decision

#### Scenario: Codex runtime assumptions are constrained
- GIVEN Codex plugin package generation has not installed or enabled the plugin
- WHEN the Codex adapter is designed or implemented
- THEN it MUST model the plugin package as distributable assets for a future
  installer or manual enablement flow
- AND it MUST NOT depend on undocumented runtime APIs or automatic plugin hook
  trust to satisfy delegate-first, SDD, memory, or verification requirements

#### Scenario: Codex capability gaps are visible
- GIVEN a shared agent-pack behavior cannot be mapped exactly to Codex plugin
  packaging or Codex project-local configuration
- WHEN the Codex adapter emits artifacts or diagnostics
- THEN it MUST preserve the intended behavior in instructions or package content
  where possible
- AND it MUST surface the gap as an adapter limitation, trust/activation note, or
  follow-up validation item rather than hiding the discrepancy

### Requirement: Materialize Codex Agent Pack into Ambient Root and Role Surfaces
The Codex install flow MUST install thoth-agents as Codex-compatible agent
pack assets, composing Codex-specific root orchestrator guidance into
`~/.codex/AGENTS.md` and installing role specialists as subagents where Codex
supports them. Target resolution MUST distinguish project and user/global scopes
before any materialization. Project-scope role subagent TOML MUST target
`.codex/agents/` inside the selected project; user/global role subagent TOML MUST
target `~/.codex/agents/` or the documented Codex-home equivalent. User/global
MCP or provider-capable config MUST target `~/.codex/config.toml` or the
documented Codex-home equivalent, while project trusted config MUST target
`.codex/config.toml` only where project-scope Codex config is applicable. Skills
MUST target `.agents/skills/` for project scope and `~/.agents/skills/` for
user/global scope. Root instructions MUST target a managed block in
`~/.codex/AGENTS.md`; existing user content in that file MUST be preserved by
managed-block merge behavior and backup before lossy rewrites. Role subagent TOML
filenames MUST be deterministic and namespaced as
`thoth-agents-{role}.toml` for `explorer`, `librarian`, `oracle`,
`designer`, `quick`, and `deep`; v1 MUST NOT materialize a selectable
`orchestrator` role TOML.

#### Scenario: Root orchestrator guidance targets the ambient Codex session
- GIVEN a user runs `install --agent=codex`
- WHEN setup planning determines root instruction changes are required
- THEN the installer MUST plan a managed merge of thoth-agents root
  orchestrator instructions into `~/.codex/AGENTS.md`
- AND the instructions MUST be Codex-specific rather than a verbatim OpenCode
  orchestrator prompt
- AND they MUST tell the Codex root session how to invoke or use the packaged
  thoth-agents plugin capabilities
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
- AND role TOML filenames MUST be `thoth-agents-{role}.toml` for
  `explorer`, `librarian`, `oracle`, `designer`, `quick`, and `deep`
- AND the resolver MUST NOT return a selectable `orchestrator` TOML target

#### Scenario: Root instruction destination is explicit and managed
- GIVEN the project has selected `~/.codex/AGENTS.md` as the user-level v1
  ambient/root Codex instruction target
- WHEN the resolver encodes root instruction changes
- THEN it MUST encode root instructions as a managed block in
  `~/.codex/AGENTS.md`
- AND tests MUST assert the exact destination path, managed marker names, backup
  behavior when the file already exists, and preservation of unrelated user
  instructions
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
  thoth-agents managed block

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
- AND it MUST ensure `[features].default_mode_request_user_input = true` so the
  Codex root instructions can use `request_user_input` in Default mode
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
  thoth-agents managed keys, managed blocks, deterministic managed role
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

### Requirement: Enforce thoth-mem Governance Across Harnesses
The system MUST preserve thoth-mem as the memory integration and MUST
distinguish runtime-enforced governance from instruction-level governance with
visible enforcement-gap diagnostics when a harness cannot enforce tool
restrictions.

#### Scenario: Root-only memory tools remain restricted
- GIVEN an agent or subagent prompt is rendered for any supported harness
- WHEN memory tool guidance is included
- THEN only the root orchestrator role MAY own `mem_session_start`,
  `mem_session_summary`, and `mem_save_prompt`
- AND subagents MUST be instructed not to call those tools
- AND subagents MUST be instructed not to call thoth-mem tools at all when the
  dispatch lacks either parent `session_id` or project context

#### Scenario: Runtime enforcement is used where available
- GIVEN a supported harness exposes documented per-agent tool, permission, or MCP
  allow/deny controls
- WHEN harness-specific prompts or configs are generated
- THEN the adapter MUST configure those controls to prevent subagents from using
  root-only memory operations and disallowed memory writes
- AND tests MUST verify the generated controls in addition to rendered prompt
  text

#### Scenario: Enforcement gaps are diagnosed where unavailable
- GIVEN a supported harness does not expose documented runtime controls for a
  memory-governance rule
- WHEN the adapter renders artifacts for that harness
- THEN it MUST preserve the governance rule as instruction-level guidance
- AND it MUST emit a visible diagnostic identifying the unsupported enforcement
  capability and the resulting instruction-only limitation

#### Scenario: SDD artifact writes use deterministic ownership
- GIVEN an SDD artifact-producing subagent is allowed to use thoth-mem by the
  selected persistence mode and dispatch limits
- WHEN it saves an SDD artifact
- THEN it MUST save only the deterministic artifact topic key assigned to that
  phase, such as `sdd/{change}/{artifact}`
- AND it MUST NOT write root-session summaries, user prompts, unrelated durable
  observations, or ad hoc SDD topic keys

### Requirement: Preserve SDD Skills Portability
The system MUST keep requirements-interview and SDD skills reusable or
distributable through both OpenCode and Codex adapters, and Codex distribution
MUST prefer plugin-bundled skill assets over shared `.agents/skills` copies.

#### Scenario: SDD skill content remains harness-neutral
- GIVEN requirements-interview and SDD phase skills are packaged for Codex
- WHEN the skill content is rendered into plugin-root `skills/`
- THEN phase responsibilities, artifact contracts, persistence-mode rules, and
  review gates MUST remain semantically equivalent to OpenCode delivery
- AND harness-specific syntax MUST be confined to adapter packaging, manifest
  references, or wrapper instructions

#### Scenario: Full SDD pipeline remains portable
- GIVEN a full SDD flow requires proposal, spec, design, tasks, implementation,
  verification, and archive phases
- WHEN the flow is invoked from plugin-bundled Codex skill assets
- THEN the adapter MUST preserve phase ordering, artifact prerequisites,
  plan-review gating, and implementation confirmation rules
- AND it MUST NOT bypass specs or design for full-pipeline work

### Requirement: Limit Rollout Scope Safely
The system MUST limit this change to OpenCode preservation, shared harness
contracts, and the Codex adapter MVP; it MUST NOT add Claude, Antigravity, or
other harness implementations.

#### Scenario: Non-Codex harness requests remain out of scope
- GIVEN a caller requests Claude, Antigravity, or another non-OpenCode and
  non-Codex target during this change
- WHEN the system evaluates the request
- THEN it MUST report that the harness is out of scope for this change
- AND it MUST NOT create implementation files, generated artifacts, or tests that
  imply support for that harness

#### Scenario: thoth-mem is not replaced
- GIVEN the agent pack is adapted for Codex
- WHEN memory integration is described, configured, or validated
- THEN thoth-mem MUST remain the memory backend and governance model
- AND the system MUST NOT introduce a replacement memory layer as part of this
  change

#### Scenario: Rollback preserves OpenCode behavior
- GIVEN Codex validation or adapter implementation fails after this spec phase
- WHEN Codex support is disabled or removed
- THEN the OpenCode plugin path MUST continue to operate without Codex artifacts
  or Codex dependencies
- AND rollback MUST NOT remove shared behavior required by the existing OpenCode
  baseline

### Requirement: Render Agent Prompts from Harness-Neutral Semantic Policies
The system MUST model shared agent prompt policy as harness-neutral semantic
intent before rendering harness-specific text.

#### Scenario: Shared policy avoids OpenCode-only tool names
- GIVEN a prompt policy section is shared across supported harnesses
- WHEN the policy describes delegation, user-question, memory, visual QA,
  verification, or tool-governance behavior
- THEN the shared policy MUST describe the intended behavior without hardcoding
  OpenCode-only tool names such as `question` or `task`
- AND any explicit OpenCode tool name MUST be introduced only by an OpenCode
  dialect, renderer, or harness-specific prompt section

#### Scenario: Harness terminology remains representable
- GIVEN a supported harness has its own terminology for tools, delegation,
  user questions, memory, visual QA, or verification
- WHEN agent prompts are rendered for that harness
- THEN the rendering contract MUST provide harness-specific wording for those
  concepts
- AND the shared semantic policy MUST remain reusable without brittle prose edits
  to fit that harness

### Requirement: Preserve the Seven-Agent Role Nature Across Harnesses
The system MUST preserve the role nature, responsibilities, and operating modes
of the orchestrator, explorer, librarian, oracle, designer, quick, and deep
agents when prompts are rendered for any supported harness.

#### Scenario: All roles retain their semantic responsibilities
- GIVEN the seven-agent roster is rendered for OpenCode or Codex
- WHEN each role prompt is generated
- THEN orchestrator MUST remain the root coordinator and sequencing decision
  role
- AND explorer, librarian, and oracle MUST remain read-only specialist roles
- AND designer, quick, and deep MUST remain write-capable roles with their
  existing responsibility boundaries
- AND generated prompts, docs, and tests MUST NOT introduce an additional role
  or remove a current role

#### Scenario: Harness limitations do not rewrite role identity
- GIVEN a supported harness cannot enforce a role rule with the same runtime
  mechanism as another harness
- WHEN the role prompt or related diagnostics are rendered
- THEN the system MUST preserve the role's intended responsibility as instruction
  or configuration where possible
- AND it MUST disclose the capability limitation rather than weakening,
  renaming, removing, or conflating the role

### Requirement: Derive Harness-Specific Wording from Typed Dialects and Capabilities
The system MUST derive harness-specific agent prompt wording from an explicit,
typed dialect and capability profile rather than from post-hoc string
replacement of another harness's prompt prose.

#### Scenario: OpenCode wording is rendered from the OpenCode dialect
- GIVEN OpenCode is selected as the target harness
- WHEN agent prompts are generated
- THEN OpenCode-specific wording such as native delegation tools, user-question
  tools, permission terminology, progress tracking, and verification
  instructions MUST be supplied by the OpenCode dialect or capability profile
- AND OpenCode-rendered prompts MUST preserve the current explicit OpenCode
  guidance for the seven-agent roster

#### Scenario: Codex wording is rendered from the Codex dialect
- GIVEN Codex is selected as the target harness
- WHEN agent prompts are generated
- THEN Codex-specific wording for custom-agent task execution, user input,
  tool access, memory governance, visual QA, and verification MUST be supplied by
  the Codex dialect, Codex adapter, or capability profile
- AND Codex-rendered prompts MUST identify instruction-level governance or other
  capability gaps where Codex cannot provide equivalent runtime enforcement
- AND Codex root wording MUST describe the ambient Codex session as the root
  coordinator surface

### Requirement: Avoid Codex Prompt Adaptation by Exact OpenCode Prose Replacement
The Codex prompt generation path MUST NOT depend on replacing exact OpenCode prose
fragments to produce Codex wording.

#### Scenario: Codex generation survives OpenCode prose changes
- GIVEN a shared policy section has changed wording without changing semantic
  intent
- WHEN Codex prompts are generated
- THEN Codex output MUST still be produced from semantic sections and Codex
  dialect data
- AND generation MUST NOT require matching an exact previous OpenCode sentence or
  paragraph to produce correct Codex wording

#### Scenario: OpenCode-only phrases do not leak into Codex shared policy output
- GIVEN Codex prompts are generated for root and specialist roles
- WHEN the output describes shared delegation, user-question, memory, visual QA,
  verification, or tool-governance behavior
- THEN OpenCode-only terms MUST NOT appear unless they are explicitly framed as
  an OpenCode comparison or compatibility note
- AND the Codex wording MUST remain accurate for Codex's documented or declared
  capabilities

### Requirement: Verify OpenCode and Codex Prompt Contracts with Focused Tests
The implementation MUST include focused automated tests that cover both OpenCode
and Codex prompt rendering contracts for semantic policies, role preservation,
harness terminology, custom prompt composition, memory governance, and
capability disclosures.

#### Scenario: OpenCode rendering remains explicit and stable
- GIVEN the OpenCode harness is selected
- WHEN prompt rendering tests execute
- THEN tests MUST assert that OpenCode prompts include expected OpenCode tool,
  delegation, user-question, progress, memory, visual QA, and verification
  wording
- AND tests MUST assert that all seven role prompts preserve their role nature
  and operating modes

#### Scenario: Codex rendering uses Codex semantics without brittle adaptation
- GIVEN the Codex harness is selected
- WHEN prompt rendering tests execute
- THEN tests MUST assert that Codex prompts use Codex-specific terminology and
  capability-gap language
- AND tests MUST fail if Codex rendering depends on broad exact-fragment
  replacement of OpenCode prompt prose

#### Scenario: Custom prompt composition remains covered
- GIVEN prompt composition supports replacement and append inputs
- WHEN prompt composition tests execute
- THEN tests MUST verify placeholder expansion for generated, replacement, and
  append prompts
- AND tests MUST verify replacement prompt precedence over append prompts
- AND tests SHOULD verify generated model-family guidance remains before user
  append text when both are present

#### Scenario: Reporting evidence is required for completion
- GIVEN prompt rewrite implementation is complete
- WHEN verification is reported
- THEN the report MUST identify the focused tests or diagnostics that checked
  OpenCode rendering, Codex rendering, memory governance, custom prompt
  composition, and docs alignment where changed
- AND failures, skipped checks, or unsupported capability assertions MUST be
  reported explicitly

### Requirement: Keep Harness-Agnostic Prompt Work Within Approved Scope
The system MUST limit this change to prompt-generation contracts, dialect
rendering, Codex adapter wording, focused tests, and aligned documentation for
OpenCode and Codex, and MUST NOT expand the agent roster or add additional
harness support.

#### Scenario: Unsupported harnesses remain out of scope for prompt rendering
- GIVEN a caller or test fixture requests harness-specific prompt rendering for
  a non-OpenCode and non-Codex harness
- WHEN this change is evaluated or implemented
- THEN the system MUST report that the harness is out of scope for this change
- AND it MUST NOT add generated prompts, fixtures, docs, or runtime behavior that
  imply support for that harness

#### Scenario: Runtime behavior changes stay constrained to prompt contracts
- GIVEN prompt rendering is updated for OpenCode and Codex
- WHEN the implementation is planned or verified
- THEN the system MUST NOT change runtime delegation, memory, visual QA, SDD
  execution, installer, or plugin packaging behavior beyond what is necessary to
  keep generated prompt contracts accurate
- AND it MUST NOT change SDD artifact semantics, OpenSpec paths, memory
  topic-key formats, review gates, or the seven-agent roster

### Requirement: Define Root Coordinator Prompt Contract
The system MUST render the orchestrator/root coordinator prompt as the
delegate-first decision and sequencing contract for the ambient root session.

#### Scenario: Root prompt owns coordination boundaries
- GIVEN OpenCode or Codex root instructions are rendered
- WHEN the orchestrator prompt is composed
- THEN it MUST identify the role as the root coordinator, orchestrator, or
  ambient root decision engine
- AND it MUST assign user-facing synthesis, task sequencing, blocking user
  input, progress ownership, root-session memory, and final outcome reporting to
  the root role
- AND it MUST NOT present the orchestrator as an optional specialist that the
  user must invoke instead of the active root session

#### Scenario: Root prompt delegates bounded work
- GIVEN the root prompt describes delegate-first operation
- WHEN it explains how work is assigned
- THEN it MUST preserve the current roster of explorer, librarian, oracle,
  designer, quick, and deep subagents
- AND it MUST describe subagents as evidence, review, implementation, or
  verification owners for bounded assignments
- AND it MUST prohibit requesting raw file dumps from subagents when findings,
  anchors, diffs, verification evidence, or blockers are sufficient

### Requirement: Define Read-Only Subagent Prompt Contract
The system MUST render explorer, librarian, and oracle prompts as read-only
specialist contracts with role-specific evidence outputs.

#### Scenario: Explorer prompt is local discovery only
- GIVEN the explorer prompt is rendered for any supported harness
- WHEN it describes the explorer role
- THEN it MUST require read-only local codebase discovery, symbol or file
  anchors, constraints, risks, and verification targets
- AND it MUST NOT permit implementation, repository mutation, destructive git
  operations, or durable session-memory ownership

#### Scenario: Librarian prompt is external research only
- GIVEN the librarian prompt is rendered for any supported harness
- WHEN it describes the librarian role
- THEN it MUST require read-only external documentation, public examples, version
  sensitivity, source attribution, and applicability notes
- AND it MUST NOT permit repository mutation, undocumented API invention, or
  broad implementation work

#### Scenario: Oracle prompt is advisory only
- GIVEN the oracle prompt is rendered for any supported harness
- WHEN it describes review, diagnosis, or plan review duties
- THEN it MUST require findings, risks, assumptions, and accept/reject style
  conclusions where the delegated task asks for them
- AND it MUST NOT permit artifact-producing SDD phases, implementation edits, or
  workspace mutation

### Requirement: Define Write-Capable Subagent Prompt Contract
The system MUST render designer, quick, and deep prompts as bounded
implementation contracts with verification and reporting obligations.

#### Scenario: Designer prompt owns user-facing visual work
- GIVEN the designer prompt is rendered for any supported harness
- WHEN it describes UI, UX, browser, screenshot, or visual verification work
- THEN it MUST make designer the owner of user-facing UI implementation, visual
  QA, screenshots, and responsive interaction checks
- AND it MUST require visual verification evidence when the task changes
  user-facing screens

#### Scenario: Quick prompt stays narrow and mechanical
- GIVEN the quick prompt is rendered for any supported harness
- WHEN it describes implementation work
- THEN it MUST limit quick to clear, bounded, low-risk, mechanical edits
- AND it MUST require preserving unrelated working-tree changes, avoiding
  destructive git commands, and reporting focused verification

#### Scenario: Deep prompt owns correctness-critical implementation
- GIVEN the deep prompt is rendered for any supported harness
- WHEN it describes implementation work
- THEN it MUST assign deep to correctness-critical, multi-file, backend, data
  flow, API, refactor, or edge-case-heavy changes
- AND it MUST require local context validation, appropriate test-first or
  systematic-debugging behavior, edge-case consideration, and sufficient
  automated verification before completion is reported

### Requirement: Preserve Custom Prompt Replacement and Append Semantics
The system MUST preserve configured prompt replacement and append behavior while
rewriting generated prompt contracts.

#### Scenario: Replacement prompt overrides generated content
- GIVEN a role has a configured replacement prompt and a configured append prompt
- WHEN the role prompt is composed
- THEN the replacement prompt MUST be used after placeholder expansion
- AND the generated base prompt and append prompt MUST NOT be included in the
  final prompt

#### Scenario: Append prompt extends generated content
- GIVEN a role has no replacement prompt and has a configured append prompt
- WHEN the role prompt is composed
- THEN the generated prompt MUST be rendered first with placeholder expansion
- AND the append prompt MUST be appended after placeholder expansion without
  removing generated role, dialect, memory, safety, or verification guidance

#### Scenario: Model-family guidance composes before user append text
- GIVEN model-family guidance is applicable and an append prompt is configured
- WHEN a role prompt is composed
- THEN model-family guidance SHOULD remain part of the generated prompt
- AND user append text SHOULD appear after generated model-family guidance

### Requirement: Preserve Reference-Inspired Style Without Importing Roles
The system MUST allow prompt structure and tone to be inspired by external
reference repositories only when the canonical thoth-agents roster and behavior
contracts remain unchanged.

#### Scenario: Reference repos do not expand the roster
- GIVEN Gentle-AI or oh-my-opencode-slim is used as prompt inspiration
- WHEN prompts, tests, or docs are updated
- THEN the system MUST preserve only orchestrator, explorer, librarian, oracle,
  designer, quick, and deep as thoth-agents roles
- AND it MUST NOT add, rename, or expose reference-repo roles, command models, or
  permission assumptions as thoth-agents behavior

#### Scenario: Inspired prose remains behavior-compatible
- GIVEN reference style influences prompt organization
- WHEN generated prompts are compared against thoth-agents contracts
- THEN the prompts MUST preserve delegate-first orchestration, read-only versus
  write-capable role boundaries, SDD gates, memory governance, and verification
  expectations
- AND differences from reference repositories MUST be adapted into current
  thoth-agents terminology instead of copied verbatim when semantics differ
