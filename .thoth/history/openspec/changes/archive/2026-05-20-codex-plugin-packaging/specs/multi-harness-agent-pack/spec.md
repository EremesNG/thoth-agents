# Delta for Multi-Harness Agent Pack

## ADDED Requirements

### Requirement: Package Codex Plugin as the Primary Codex Delivery Artifact

The system MUST generate a deterministic Codex plugin package as the primary
Codex install packaging target, rooted at `.codex-plugin/` and described by a
Codex plugin manifest at `.codex-plugin/plugin.json`.

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

#### Scenario: Plugin package is separate from future installer activation

- GIVEN the plugin package contains manifest, skills, MCP, or hook references
- WHEN the package is generated
- THEN the system MUST NOT modify user Codex configuration or enable
  `install --agent=codex`
- AND it MUST NOT claim Codex plugin hooks are trusted or enabled automatically

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
for oh-my-opencode-lite; it MAY remain available only as an explicit fallback,
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

## MODIFIED Requirements

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

## REMOVED Requirements
