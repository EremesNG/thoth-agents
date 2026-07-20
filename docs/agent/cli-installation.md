# CLI and installation

## Responsibility

`src/cli/` owns installation, parsing, help, TUI, status, repair, model
configuration, and managed I/O. Installation depends on the CLI; normal SDD
phase execution does not.

## Invariants

- OpenCode is the default CLI harness.
- OpenCode installation synchronizes all five packaged thoth-owned skills into
  `~/.config/opencode/skills/`; status, install, and sync share that inventory.
  `/thoth-init` owns only project `openspec/` governance.
- Mandatory external skills are installed from canonical repositories through
  `npx skills add`; this repository must not vendor their source.
- After owned setup and external skills, every harness invokes the official
  global `thoth-mem setup` command. Dry-run uses provider `--plan`; only
  consistent `complete` evidence completes installation.
- Provider diagnostics, manual actions, and receipt are surfaced. Consumer
  reset never becomes provider `--force`, rollback, removal, or file repair.
- Browser and QA executables remain project-owned.
- Dry-run writes nothing; reset touches only bounded managed targets.
- Codex and Claude marketplace trust, snapshots, and caches remain
  manager-owned; installers may invoke their official native manager commands
  but never edit those files directly.
- Codex CLI installation is mandatory for global agents, root instructions,
  feature configuration, external global skills, and native plugin setup. It
  fails closed before global writes when Codex manager inspection or plugin
  verification fails. `$thoth-init` creates project SDD governance only.
- Claude requires native marketplace add/install before its plugin surfaces
  exist; then the CLI installs external skills and requests provider setup
  without editing Claude's cache.
- CLI changes require parser/help/tests and public docs in the same change.

## Verification

- parser/help/runtime: `parser.test.ts`, `commands.test.ts`, `index.test.ts`
- install/config: install, path, and operation tests
- external skill command construction: `skills.test.ts`
- provider command/result contract: `thoth-mem-install.test.ts`
- TUI: `src/cli/tui/**/*.test.tsx`
