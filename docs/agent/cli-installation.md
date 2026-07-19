# CLI and installation

## Responsibility

`src/cli/` owns installation, parsing, help, TUI, status, repair, model
configuration, and managed I/O. Installation depends on the CLI; normal SDD
phase execution does not.

## Invariants

- OpenCode is the default CLI harness.
- Mandatory external skills are installed from canonical repositories through
  `npx skills add`; this repository must not vendor their source.
- Browser and QA executables remain project-owned.
- Dry-run writes nothing; reset touches only bounded managed targets.
- Native Codex and Claude marketplace trust remains explicit and manager-owned.
- Codex CLI installation is mandatory for global agents, root instructions,
  feature configuration, and external global skills. `$thoth-init` creates
  project SDD governance only.
- Claude requires native marketplace add/install before its plugin surfaces
  exist; then the CLI installs external skills without editing Claude's cache.
- CLI changes require parser/help/tests and public docs in the same change.

## Verification

- parser/help/runtime: `parser.test.ts`, `commands.test.ts`, `index.test.ts`
- install/config: install, path, and operation tests
- external skill command construction: `skills.test.ts`
- TUI: `src/cli/tui/**/*.test.tsx`
