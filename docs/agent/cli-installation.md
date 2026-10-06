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
  refresh; Pi installs the exact executing first-party package before six
  minimum-constrained selected packages and attributable resources. Every
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
- Pi setup requires Pi `>=0.99.0` and Node.js `>=22.19.0`, rejecting older
  hosts before changing Pi state. It rejects unowned/conflicting first-party
  state, then installs either `npm:thoth-agents@<executing-version> --no-approve`
  or an explicit normalized absolute `--local-package-root` with `--agent=pi`,
  proves configured, loadable, and receipt-bound observed state, and atomically
  commits `pi-package.json`. The receipt keeps Pi's canonical configured `source`
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
  then may it migrate attributable legacy root/skill copies and install the six
  selected sources as `npm:@thoth-agents/pi-subagents@>=1.0.0`,
  `@upstash/context7-pi@>=0.1.2`, `pi-web-access@>=0.27.0`,
  `pi-mcp-adapter@>=2.32.1`, `@thoth-agents/pi-questions-user@>=0.1.0`, and
  `@thoth-agents/pi-todo@>=0.1.0`. The first-party question extension supplies
  root-owned `ask_user_question` with stable ids, single/multi/text/confirm types,
  previews, recommendations and structured answers. Setup and applied Update
  remove an installed user-scope `@juicesharp/rpiv-ask-user-question` through
  native `pi remove <configured-source> --no-approve` after root-package
  verification and before selected-package installation. Removal is verified;
  failure stops completion. Project-scope question conflicts block before
  mutation with manual `pi remove <configured-source> --local --approve`
  guidance, requiring the operator to review ownership and trust first.
  Dry-run previews configured user removals and project blockers without
  executing commands or changing settings. The first-party task-list extension supplies
  the session-owned `todo` tool, `/todos`, and current-session editor widget.
  Setup and applied Update install and individually verify it; status treats it
  as a managed package. Unrelated task extensions remain operator-owned. Pi's
  native manager owns installation and subsequent independent updates within
  these open-ended stable ranges. Setup validates
  each resolved package manifest's exact name and SemVer floor, accepts newer
  stable versions, and does not reinstall an already satisfying managed range.
  Legacy exact sources are migrated through Pi's native install command so
  object-form resource filters and unrelated settings survive; a detected
  downgrade fails setup and triggers restoration, verified against a fresh
  listing and manifest; unverifiable recovery exposes manual guidance. The
  first-party thoth-agents source and ownership receipt remain exact. Historical
  evidence only: an isolated native package-manager probe on Pi 0.86.1 showed
  that it parses `>=` as an unpinned valid range and preserves object-form
  filters while replacing a source; this does not establish support below the
  current minimum. Setup merges `session_resources: "lean"` and
  `enable_continue: false` into global `subagents.json`, synchronizes five
  specialists, installs four external skills, runs provider setup, and commits
  the unchanged last-complete ledger. Project-local `subagents.json` can
  override global lean isolation; full child resources are unsupported. A custom
  `PI_CODING_AGENT_DIR`, unowned canonical agent, or conflicting global `grep`
  entry blocks mutation. A configured incumbent `pi-subagents` or former
  `pi-subagents-j0k3r` runtime also blocks before mutation and returns manual
  recovery guidance; setup never deletes it or loads both delegation runtimes.
  The incumbent `@juicesharp/rpiv-todo` also blocks preflight before mutation,
  whether declared in string/object-form settings or identified by Pi's package
  listing and installed manifest. Pi 1.0.2's `pi list --no-approve` omits project
  packages, so setup, status, and Update inspect `<cwd>/.pi/settings.json` and
  resolved manifests read-only: npm packages under `.pi/npm/node_modules`, local
  paths relative to `.pi` (including absolute paths, home paths, and file URLs),
  and Git checkouts under `.pi/git/<host>/<repository>` regardless of ref.
  Git normalization is ported from the SDK's `parseGitUrl` using the same exact
  `hosted-git-info` version, with differential tests against SDK 1.0.2's parser
  and install-path resolver. A defense-in-depth scan of `.pi/git` and `.pi/npm`
  also identifies installed incumbent manifests even without a mapped settings
  source. It reads linked package manifests without recursively walking links
  outside the install root, and avoids directory cycles. Apply repeats both
  inspections before mutation. No project code is executed and no trust is
  granted or persisted. An incumbent-looking source with an unavailable manifest
  blocks with an explicit identity limitation; an unrelated source cannot be
  identified as an incumbent without its manifest.
  Dry-run reports configured blockers without mutation; status and Update
  previews expose the conflict and manual removal:
  `pi remove npm:@juicesharp/rpiv-todo --no-approve` for user scope. For project
  scope, first review the project's ownership and trust, then use
  `pi remove npm:@juicesharp/rpiv-todo --local --approve` from that project.
  Approval trusts project-local settings for this command only without saving
  a trust decision. Run both commands if present in both scopes. The CLI never
  removes it automatically. For an unmapped manifest, diagnostics name the
  installed directory; after reviewing ownership, find and remove the matching
  settings entry with `pi remove <source> --local --approve` rather than using
  the diagnostic directory as a configured source. Verify removal with `pi list`
  and rerun the complete flow.
  Partial native package state remains
  visible and is recovered by resolving the blocker and rerunning the complete
  flow.
- OpenCode runtime update checks are notification-only. They do not rewrite
  config, invalidate package state, or run package installation; operators must
  rerun the latest CLI installer or apply Update explicitly.
- CLI changes require parser/help/tests and public docs in the same change.

## Verification

- parser/help/runtime: `parser.test.ts`, `commands.test.ts`, `index.test.ts`
- install/config: install, path, and operation tests; `pi-git-source.test.ts`
  compares Git install paths with the pinned Pi SDK 1.0.2
- external skill command construction: `skills.test.ts`
- provider command/result contract: `thoth-mem-install.test.ts`
- TUI: `src/cli/tui/**/*.test.tsx`
