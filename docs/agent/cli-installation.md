# CLI and installation

## Responsibility

`src/cli/` owns installation, parsing, help, TUI, status, repair, model
configuration, and managed I/O. Installation depends on the CLI; normal SDD
phase execution does not.

## Invariants

- OpenCode is the default CLI harness.
- `@latest` is valid for selecting the CLI package to execute, but every
  OpenCode config mutation uses the executing package's exact semantic version.
  Package identity is resolved before managed writes and failure never falls
  back to a `latest` plugin entry.
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
- Install and applied Update share the complete selected-harness orchestration:
  OpenCode refreshes exact plugin/config plus owned skills; Codex performs
  native plugin setup before its global pack; Claude performs native plugin
  refresh. Every harness then installs required external skills, requires
  provider-complete evidence, and records CLI completion last.
- Update previews by default. Preview and dry-run write nothing; any required
  apply failure returns failure and does not claim or record completion. Reset
  touches only bounded managed targets.
- `${XDG_CONFIG_HOME:-~/.config}/thoth-agents/install-state.json` is the
  schema-versioned CLI-owned ledger. Its `opencode`, `codex`, and `claude`
  records advance independently and atomically only after complete success.
  Missing state remains missing; malformed state is backed up and repaired only
  when a successful operation is ready to commit its selected harness.
- Status treats each ledger record as the official last complete CLI-managed
  version, exposes it beside the executing CLI version, and never infers or
  advances it from OpenCode package state or native marketplace state.
- Codex and Claude marketplace trust, snapshots, and caches remain
  manager-owned; installers may invoke their official native manager commands
  but never edit those files directly. Native plugin updates do not prove that
  CLI-managed agents, skills, configuration, or provider setup are aligned.
- Codex CLI installation is mandatory for global agents, root instructions,
  feature configuration, external global skills, and native plugin setup. It
  fails closed before global writes when Codex manager inspection or plugin
  verification fails. `$thoth-init` creates project SDD governance only.
- Claude requires native marketplace add/install before its plugin surfaces
  exist; then the CLI installs external skills and requests provider setup
  without editing Claude's cache.
- OpenCode runtime update checks are notification-only. They do not rewrite
  config, invalidate package state, or run package installation; operators must
  rerun the latest CLI installer or apply Update explicitly.
- CLI changes require parser/help/tests and public docs in the same change.

## Verification

- parser/help/runtime: `parser.test.ts`, `commands.test.ts`, `index.test.ts`
- install/config: install, path, and operation tests
- external skill command construction: `skills.test.ts`
- provider command/result contract: `thoth-mem-install.test.ts`
- TUI: `src/cli/tui/**/*.test.tsx`
