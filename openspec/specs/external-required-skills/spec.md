# Spec: External Required Skills

## Requirements

### Requirement: Require the same four skills everywhere

OpenCode, Codex, and Claude Code MUST require `simplify`, `tdd`,
`progressive-context-router`, and `architectural-grilling` from their declared
upstream repositories.

### Requirement: Install through the skills CLI

The installer MUST invoke `npx skills add <repo> --skill <name> --global
--agent <harness-agent> --yes` for each missing requirement. Harness agents MUST
be `opencode`, `codex`, and `claude-code` respectively.

#### Scenario: TDD installation

- **WHEN** `tdd` is missing for a selected harness
- **THEN** the repository is `https://github.com/mattpocock/skills`
- **AND** the skill name is `tdd`.

#### Scenario: EremesNG skill installation

- **WHEN** `progressive-context-router` or `architectural-grilling` is missing
- **THEN** the repository is `https://github.com/EremesNG/skills`
- **AND** the requested skill name matches the missing requirement.

### Requirement: Use harness-native global paths

Required skills MUST be detected under `~/.config/opencode/skills`,
`~/.codex/skills`, or `~/.claude/skills` according to the selected harness.

### Requirement: Make failure terminal for the operation

A missing requirement MUST be reported as drift. A failed required-skill install
MUST make install/update/sync unsuccessful. The CLI MUST NOT expose an opt-out.

### Requirement: Keep plugin manifests and settings clean

External skills MUST NOT be encoded as user-configurable plugin settings, fake
plugin dependencies, or postinstall hooks. The thoth-agents CLI MUST remain the
deterministic dependency-installation and repair surface.

### Requirement: Leave QA tooling to the project

thoth-agents MUST NOT require or install `playwright-cli`, Playwright, or another
browser/QA executable. Projects MUST remain free to choose and provision their
own visual, integration, and end-to-end QA flow.
