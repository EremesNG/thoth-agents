# CLI and installation

## Responsibility

`src/cli/` owns installation, parsing, help, TUI, status, repair, model
configuration, and managed I/O. Installation depends on the CLI; normal work
execution does not.

## Invariants

- OpenCode is the default CLI harness.
- `@latest` is valid for selecting the CLI package to execute, but every
  OpenCode config mutation uses the executing package's exact semantic version.
  Package identity is resolved before managed writes and failure never falls
  back to a `latest` plugin entry.
- OpenCode installation synchronizes all five packaged thoth-owned skills into
  `~/.config/opencode/skills/`; status, install, and sync share that inventory.
  `/thoth-init` creates only missing `.thoth/` governance, preserving existing content.
- Mandatory external skills are installed from canonical repositories through
  `npx skills add`; this repository must not vendor their source.
- After owned setup and external skills, published harness installs invoke the
  official global `thoth-mem setup` command. Dry-run uses provider `--plan`;
  only consistent `complete` evidence completes installation. Explicit local
  Pi package installs omit provider setup, record thoth-agents completion, and
  direct the operator to install thoth-mem separately from its local checkout.
- Provider diagnostics, manual actions, and receipt are surfaced. Consumer
  reset never becomes provider `--force`, rollback, removal, or file repair.
- Browser and QA executables remain project-owned.
- Install and applied Update share the complete selected-harness orchestration:
  OpenCode refreshes exact plugin/config plus owned skills; Codex performs
  native plugin setup before its global pack; Claude performs native plugin
  refresh; Pi installs the exact executing first-party package before five
  minimum-constrained external packages and attributable resources. Every
  harness then installs required external skills. Published installs require provider-complete
  evidence before recording CLI completion last; an explicit local Pi package
  install omits provider setup and records only thoth-agents completion.
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
  verification fails. `$thoth-init` creates project work governance only.
- Claude requires native marketplace add/install before its plugin surfaces
  exist; then the CLI installs external skills and requests provider setup
  without editing Claude's cache.
- Pi first rejects unowned/conflicting first-party state, then installs either
  `npm:thoth-agents@<executing-version> --no-approve` or an explicit normalized
  absolute `--local-package-root` with `--agent=pi`, proves configured,
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
  then may it migrate attributable legacy root/skill copies and install the five
  external sources as `pi-subagents@>=0.71.0`, `@upstash/context7-pi@>=0.1.2`,
  `pi-web-access@>=0.27.0`, `pi-mcp-adapter@>=2.32.1`,
  and `@juicesharp/rpiv-ask-user-question@>=2.9.0`. Task/progress extensions are
  optional and operator-owned; setup never installs or removes them and status
  does not require them. Pi's native manager owns installation and
  subsequent independent updates within these open-ended stable ranges. Setup
  validates each resolved package manifest's exact name and SemVer floor,
  accepts newer stable versions, and does not reinstall an already satisfying
  managed range. Legacy exact sources are migrated through Pi's native install
  command so object-form resource filters and unrelated settings survive; a
  detected downgrade fails setup and triggers restoration, verified against a
  fresh listing and manifest; unverifiable recovery exposes manual guidance.
  The first-party thoth-agents
  source and ownership receipt remain exact. Pi 0.86.1 compatibility is based
  on an isolated native package-manager probe: it parses `>=` as an unpinned
  valid range and preserves object-form filters while replacing a source.
  Setup then merges builtin-disablement and fresh depth-one delegation settings
  without replacing unrelated user keys, synchronizes five specialists, installs
  four external skills, runs provider setup, and commits the unchanged
  last-complete ledger. A custom
  `PI_CODING_AGENT_DIR`, unowned canonical agent, or conflicting global `grep`
  entry blocks mutation. A configured legacy `pi-subagents-j0k3r` runtime also
  blocks before mutation and returns manual removal guidance; setup never
  deletes it or loads both delegation runtimes. Partial native package state remains visible and is
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
