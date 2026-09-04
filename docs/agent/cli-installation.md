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
  refresh; Pi installs the exact executing first-party package before four pinned
  external packages and attributable resources. Every
  harness then installs required external skills, requires
  provider-complete evidence, and records CLI completion last.
- Update previews by default. Preview and dry-run write nothing; any required
  apply failure returns failure and does not claim or record completion. Reset
  touches only bounded managed targets.
- `${XDG_CONFIG_HOME:-~/.config}/thoth-agents/install-state.json` is the
  schema-versioned CLI-owned ledger. Its `opencode`, `codex`, `claude`, and `pi`
  records advance independently and atomically only after complete success.
  Missing state remains missing; malformed state is backed up and repaired only
  when a successful operation is ready to commit its selected harness.
- Status treats each ledger record as the official last complete CLI-managed
  version, exposes it beside the executing CLI version, and never infers or
  advances it from OpenCode/Pi package state or native marketplace state.
- Codex and Claude marketplace trust and normal cache lifecycle remain
  manager-owned. Installers use official native manager commands first. After
  the central Codex plugin is verified and with Codex closed, the Codex installer
  may additionally remove only its fixed, preflight-approved legacy
  cache/snapshot roots; Claude caches are never edited. Native plugin updates do
  not prove that CLI-managed agents, skills, configuration, or provider setup are
  aligned.
- Codex CLI installation is mandatory for global agents, root instructions,
  feature configuration, external global skills, and native plugin setup. It
  fails closed before global writes when Codex manager inspection or plugin
  verification fails. `$thoth-init` creates project SDD governance only.
- Claude requires native marketplace add/install before its plugin surfaces
  exist; then the CLI installs external skills and requests provider setup
  without editing Claude's cache.
- Pi first rejects unowned/conflicting first-party state, then installs
  `npm:thoth-agents@<executing-version> --no-approve`, proves configured,
  loadable, and receipt-bound observed state, and atomically commits
  `pi-package.json`. The receipt keeps Pi's canonical configured `source`
  separately from the command-safe `installSource`: npm values are identical,
  while a packed absolute local input is matched through Pi's reported relative
  source plus its exact resolved installed path. Rollback always uses the prior
  `installSource` and verifies both prior source and path. Status classifies
  missing, configured-unowned, owned-missing, owned-current, and conflicting
  first-party state from the receipt plus Pi's configured source/resolved path;
  it never attributes packaged skills to the executing CLI root. Update blocks
  configured-unowned or conflicting state with a manual recovery action.
  Operation previews and results inspect the five package-declared skills only
  beneath that validated configured root; they are diagnostic evidence, not
  globally synchronized or changed targets. Sync blocks when that root or any
  declared skill is unavailable. Only
  then may it migrate attributable legacy root/skill
  copies, install delegation, Context7, Exa, and the grep-only MCP adapter,
  synchronize six specialists, install four external skills, run provider
  setup, and commit the unchanged last-complete ledger. A custom
  `PI_CODING_AGENT_DIR`, unowned canonical agent, or conflicting global `grep`
  entry blocks mutation; partial native package state remains visible and is
  recovered by resolving the blocker and rerunning the complete flow.
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
