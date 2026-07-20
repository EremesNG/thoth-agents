# Spec: Mandatory External Skills

## Requirements

### Requirement: Require the same four execution skills everywhere

OpenCode, Codex, and Claude installations MUST provide `simplify`, `tdd`,
`progressive-context-router`, and `architectural-grilling`. Simplify,
progressive-context-router, and architectural-grilling MUST be sourced from
`https://github.com/EremesNG/skills`; TDD MUST be sourced from
`https://github.com/mattpocock/skills`.

### Requirement: Preserve one canonical source

The thoth-agents repository and generated plugin packages MUST NOT vendor the
four external skill trees. Their canonical repositories MUST remain the single
source of truth so a skill update does not require synchronized copies here.

### Requirement: Install through the skills CLI

The thoth-agents installer MUST invoke `npx skills add <repo> --skill <name>
--global --agent <harness> --yes` for every missing external skill. It MUST use
the concrete selectors `opencode`, `codex`, and `claude-code`. A failed required
skill installation MUST fail the overall operation.

### Requirement: Keep SDD runtime independent of the CLI

Installation MAY require network access and the CLI. After installation, no SDD
phase may invoke the thoth-agents CLI, `npx skills add`, or fetch phase contracts
from a repository. Owned SDD contracts MUST be available from the installed
plugin/project bundle.

### Requirement: Preserve harness-native discovery

External skills MUST be installed into each harness's global native skill root.
OpenCode `/thoth-init` MUST copy only the thoth-owned workflow skills under the
project's `.agents/skills/` directory without overwriting existing files.

### Requirement: Leave QA tooling to the project

thoth-agents MUST NOT require or install `playwright-cli`, Playwright, or another
browser/QA executable. Projects remain responsible for their own visual,
integration, and end-to-end QA tooling.
