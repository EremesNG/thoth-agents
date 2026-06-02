# Delta for Multi-Harness Agent Pack

## ADDED Requirements

### Requirement: Provide a Claude Code Adapter
The system MUST provide Claude Code as a supported harness target and MUST treat
it as a first-class adapter whose capabilities are all `supported`, with no
surface-validation gate and no capability-gap diagnostics, because Claude Code
natively exposes subagents, per-agent tool permissions, harness-run hooks, MCP,
and skills.

#### Scenario: Claude Code is a resolvable first-class harness
- GIVEN a caller selects `claude` as the target harness
- WHEN the harness registry resolves the request
- THEN the system MUST return a supported Claude Code adapter whose capability
  profile marks agent definitions, delegated execution, parallel delegation,
  runtime hooks, MCP configuration, skill packaging, role permissions, parent
  context injection, and memory governance enforcement as `supported`
- AND the adapter MUST NOT emit capability-gap or surface-unvalidated diagnostics
  for those capabilities

#### Scenario: Claude Code artifacts derive from shared contracts
- GIVEN the Claude Code adapter is selected
- WHEN the seven-agent roster is rendered
- THEN the adapter MUST derive role responsibilities, mutation permissions,
  dispatch expectations, and memory governance from the shared harness-neutral
  contracts
- AND it MUST render harness-specific wording from a typed Claude Code dialect and
  capability profile rather than from string replacement of another harness's prose

### Requirement: Package Claude Code as a Single Plugin Artifact
The system MUST deliver Claude Code support as one distributable plugin package
rooted at `.claude-plugin/`, because Claude Code plugins auto-discover bundled
subagents and therefore do not require a separate project-level agent layout.

#### Scenario: Plugin package contains the auto-discovered components
- GIVEN the Claude Code adapter renders the agent pack
- WHEN the plugin package is produced
- THEN the system MUST emit a `.claude-plugin/plugin.json` manifest, one
  `agents/<role>.md` subagent file for each of the six specialist roles, a bundled
  `skills/` directory, a `.mcp.json` server map, and a `hooks/hooks.json`
- AND URL-based MCP servers MUST be declared with `type: "http"`
- AND generated skill and subagent artifacts MUST record source provenance

#### Scenario: Role permissions are enforced by subagent frontmatter
- GIVEN read-only specialists (explorer, librarian, oracle) and write-capable
  specialists (designer, quick, deep) are rendered as subagents
- WHEN each subagent file is produced
- THEN read-only specialist frontmatter `tools` MUST exclude workspace-mutating
  tools such as `Write`, `Edit`, and write `Bash` usage
- AND write-capable specialist frontmatter MUST include the mutation tool set
  required for their role

### Requirement: Inject the Claude Code Root Coordinator via SessionStart
The system MUST deliver the root coordinator instructions to the Claude Code main
session through a generated `SessionStart` hook, because a plugin cannot edit the
user's `CLAUDE.md` and the orchestrator is the main session rather than a
generated subagent.

#### Scenario: SessionStart hook injects root instructions
- GIVEN the Claude Code plugin package is generated
- WHEN the `hooks/hooks.json` is produced
- THEN it MUST register a `SessionStart` hook that emits the rendered root
  coordinator instructions as `additionalContext`
- AND the system MUST NOT generate a selectable "orchestrator" subagent for
  Claude Code

#### Scenario: OpenCode runtime hooks are not ported
- GIVEN the existing OpenCode runtime hook callbacks live in `src/hooks/*`
- WHEN Claude Code hooks are generated
- THEN the system MUST treat the OpenCode runtime callbacks as out of scope for
  Claude Code command hooks
- AND the only generated Claude Code hook MUST be the standalone SessionStart
  root-injection hook

### Requirement: Plan and Apply Claude Code Setup Idempotently
The system MUST provide a Claude Code install/operation surface that plans and
applies the plugin package conservatively, with dry-run preview, backups, and
skip-if-identical behavior.

#### Scenario: Claude Code setup is preview-first and reversible
- GIVEN a caller runs the Claude Code install, update, or sync operation
- WHEN the operation is invoked without an explicit apply
- THEN the system MUST produce a dry-run plan describing each package file write
- AND applying the plan MUST back up any pre-existing file and skip writes whose
  content is already current

#### Scenario: Claude Code model configuration stays within harness bounds
- GIVEN a caller configures Claude Code subagent models
- WHEN the model values are validated
- THEN the system MUST accept only `sonnet`, `opus`, `haiku`, or `inherit`
- AND it MUST default `oracle` and `deep` to `opus` and the remaining specialists
  to `sonnet`

## MODIFIED Requirements

### Requirement: Limit Rollout Scope Safely
The system MUST limit harness implementations to OpenCode, Codex, and Claude Code;
it MUST NOT add Antigravity or other harness implementations.

#### Scenario: Out-of-scope harness requests remain rejected
- GIVEN a caller requests a harness other than OpenCode, Codex, or Claude Code
- WHEN the system evaluates the request
- THEN it MUST report that the harness is out of scope
- AND it MUST NOT create implementation files, generated artifacts, or tests that
  imply support for that harness

#### Scenario: thoth-mem is not replaced
- GIVEN the agent pack is adapted for Claude Code
- WHEN memory integration is described, configured, or validated
- THEN thoth-mem MUST remain the memory backend and governance model
- AND the system MUST NOT introduce a replacement memory layer as part of this
  change

#### Scenario: Rollback preserves OpenCode and Codex behavior
- GIVEN Claude Code adapter implementation is disabled or removed
- WHEN Claude Code support is rolled back
- THEN the OpenCode and Codex paths MUST continue to operate without Claude Code
  artifacts or dependencies
- AND rollback MUST NOT remove shared behavior required by the existing OpenCode
  or Codex baselines

## REMOVED Requirements
