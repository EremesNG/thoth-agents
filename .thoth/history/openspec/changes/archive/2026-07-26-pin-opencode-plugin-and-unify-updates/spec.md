# Feature Specification: Pin OpenCode Plugin and Unify Harness Updates

**Change ID**: `pin-opencode-plugin-and-unify-updates`<br>
**Route**: Accelerated<br>
**Status**: Draft

## Intent and scope

**Why**: Operators need OpenCode to load the exact thoth-agents release they intentionally installed, and they need every CLI update path to refresh the same complete harness installation instead of applying a narrower subset of setup steps.<br>
**Impact**: OpenCode plugin entries will be pinned to the executing thoth-agents package version. Re-running installation or applying Update will replace an older pin with that version. Interactive and command-driven updates will perform the same harness-specific setup as explicit installation. The CLI will independently record the last fully installed version for each harness as its authoritative managed-install version, without overriding Codex or Claude marketplace self-updates. The OpenCode runtime will only notify about newer releases and will no longer mutate or install updates in the background.<br>
**Affected capabilities**: `cli-installation`

## User stories

### US1 - Install the exact OpenCode plugin release (Priority: P1)

As an OpenCode operator, I can install a particular thoth-agents CLI release and receive an OpenCode plugin entry pinned to that same release so that plugin activation is deterministic.

**Independent test**: Run the OpenCode config merge against isolated configurations using controlled package metadata and verify the resulting managed entry, preservation behavior, and failure behavior.

**Covers**: FR-001, FR-002, SC-001, SC-002

**Acceptance scenarios**:

1. **Given** the executing thoth-agents package version is `0.4.8`, **When** OpenCode installation configures the plugin, **Then** the resulting managed entry is exactly `thoth-agents@0.4.8` and is not `thoth-agents@latest`.
2. **Given** OpenCode configuration contains a bare, tagged, or differently versioned thoth-agents entry plus unrelated plugins, **When** installation runs again from version `0.4.8`, **Then** every prior thoth-agents entry is replaced by one `thoth-agents@0.4.8` entry and unrelated plugins retain their relative order.
3. **Given** the executing package version cannot be resolved as a non-empty valid package version, **When** installation or update would write the OpenCode plugin entry, **Then** the operation fails without substituting `latest` and without partially rewriting the configuration.

### US2 - Refresh complete harness installations from Update (Priority: P1)

As a thoth-agents operator, I can apply Update for any supported harness and receive the same complete refresh as re-running installation for that harness so that managed assets, native plugin setup, required skills, and provider setup do not drift.

**Independent test**: Exercise preview and apply through the public update orchestration with dependency spies for OpenCode, Codex, and Claude, then compare the ordered effects and outcomes with each harness's explicit installation orchestration.

**Covers**: FR-003, FR-004, FR-005, SC-003, SC-004, SC-005

**Acceptance scenarios**:

1. **Given** OpenCode is selected in the interactive CLI or update command, **When** Update is applied, **Then** it performs the complete OpenCode installation refresh, including the exact plugin pin, default-agent configuration, managed configuration, thoth-owned skills, required external skills, and provider setup.
2. **Given** Codex is selected, **When** Update is applied, **Then** it performs native plugin-manager setup before refreshing the global agent pack, required external skills, and provider setup under the same failure rules as `install --agent=codex`.
3. **Given** Claude Code is selected, **When** Update is applied, **Then** it performs native marketplace/plugin refresh, required external skills, and provider setup under the same failure rules as `install --agent=claude`.
4. **Given** an update is only previewed or dry-run is requested, **When** the plan is rendered, **Then** every complete refresh step is represented and no harness, skill, provider, cache, or configuration mutation occurs.
5. **Given** any required harness-owned, skill, or provider step fails or returns a non-complete outcome, **When** Update is applied, **Then** the update returns failure and does not claim complete installation.

### US3 - Track the authoritative CLI-managed version (Priority: P1)

As a multi-harness operator, I can see which thoth-agents release most recently completed full CLI setup for each harness so that separately managed plugin updates do not falsely imply that supplemental agents, skills, configuration, and provider setup are aligned.

**Independent test**: Complete and fail isolated harness installs against a temporary global state root, then inspect per-harness records and status while independently varying native marketplace plugin versions.

**Covers**: FR-006, FR-007, SC-006, SC-007

**Acceptance scenarios**:

1. **Given** version `0.4.8` completes every required installation step for OpenCode, Codex, or Claude Code, **When** the CLI commits installation success, **Then** it atomically records `0.4.8` as that harness's last complete CLI-managed version without changing the other harness records.
2. **Given** a dry-run, cancelled preview, or failed native-manager, managed-surface, required-skill, or provider step, **When** the operation ends, **Then** no harness record is advanced and the previous complete version remains authoritative.
3. **Given** Codex or Claude independently updates its marketplace plugin, **When** thoth-agents status is evaluated, **Then** the last successful CLI record remains the official CLI-managed version and the native marketplace version is not rewritten or treated as proof that separate managed surfaces were refreshed.
4. **Given** the executing CLI version differs from a harness's recorded version, **When** status or Update is opened, **Then** both versions and the need for a complete CLI refresh are presented without silently changing the record.
5. **Given** no valid record exists for a harness, **When** status is evaluated, **Then** the CLI reports the managed-install version as unknown or missing rather than inferring it from OpenCode cache or Codex/Claude marketplace state.

### US4 - Keep release changes operator-controlled (Priority: P2)

As an OpenCode operator, I can receive notice of a newer thoth-agents release without the running plugin changing its own configured version so that updates occur only through an explicit CLI action.

**Independent test**: Simulate a newer registry release and verify that the runtime emits update guidance without writing configuration, invalidating package state, or invoking a package-manager install.

**Covers**: FR-008, FR-009, SC-008, SC-009

**Acceptance scenarios**:

1. **Given** OpenCode is running a pinned release and a newer release exists, **When** the background version check completes, **Then** it only notifies the operator and does not rewrite the plugin entry, invalidate cached package state, or run an installation command.
2. **Given** an operator wants the newer release, **When** they follow CLI guidance or apply Update, **Then** the selected harness receives the complete refresh and OpenCode, when selected, is pinned to the CLI release performing that refresh.
3. **Given** installation and update help or documentation, **When** an operator reads the OpenCode guidance, **Then** it explains the exact-version pin and that re-running the latest CLI installer or applying Update is the supported update mechanism.

## Edge cases

- The executing package version is a valid prerelease such as `0.4.8-beta.1`.
- OpenCode configuration contains multiple thoth-agents entries using bare, dist-tag, and exact-version forms.
- OpenCode configuration is malformed, read-only, or cannot be backed up atomically.
- Package metadata is missing, malformed, names another package, or lacks a usable version.
- The CLI-managed install ledger is missing, malformed, interrupted during replacement, or contains a record for only some harnesses.
- Codex or Claude has a marketplace plugin version newer than the last release that completed CLI-managed supplemental setup.
- An update preview is opened but never confirmed.
- Codex native manager inspection or post-install verification fails before global files may be refreshed.
- Claude Code reports a native marketplace or plugin failure.
- Required external skill installation or thoth-mem setup returns partial, contradictory, or user-action-required evidence.
- A newer OpenCode plugin release is detected while the current session is active.

## Functional requirements

- **FR-001 — Pin the OpenCode plugin to the executing release**: `[ADDED cli-installation]` Every OpenCode install or applied update MUST replace all managed thoth-agents plugin entry forms with exactly one `thoth-agents@<executing-package-version>` entry while preserving unrelated plugin entries.
- **FR-002 — Fail closed when the executing version is unavailable**: `[INTERNAL]` The CLI MUST derive the managed OpenCode plugin version from the installed thoth-agents package metadata and MUST fail before configuration mutation when that identity or version is missing or invalid; it MUST NOT fall back to `latest`.
- **FR-003 — Make applied Update installation-equivalent**: `[ADDED cli-installation]` Applying Update through either the interactive CLI or the public update command MUST execute the same complete harness-specific refresh contract as `install --agent=<selected-harness>` rather than a reduced reconciliation plan.
- **FR-004 — Preserve complete per-harness setup**: `[ADDED cli-installation]` Complete update refreshes MUST include OpenCode managed configuration and owned skills, Codex native plugin setup and global agent-pack setup, Claude native plugin refresh, every harness's required external skills, and every harness's provider-owned thoth-mem setup in the same order and with the same fail-closed outcomes as explicit installation.
- **FR-005 — Keep previews non-mutating and truthful**: `[INTERNAL]` Update preview and dry-run MUST enumerate the complete selected-harness refresh without mutation, and applied update MUST return a failing outcome whenever any required step does not complete successfully.
- **FR-006 — Record the last complete CLI-managed version**: `[ADDED cli-installation]` The CLI MUST maintain a versioned global installation ledger keyed independently by OpenCode, Codex, and Claude Code, and MUST atomically record the executing package version for one harness only after every required install or applied-update step for that harness completes successfully.
- **FR-007 — Treat the CLI ledger as authoritative for managed setup**: `[ADDED cli-installation]` CLI status and update decisions MUST use each harness's last complete ledger record as the official CLI-managed version, MUST expose the executing and recorded versions when they differ, and MUST NOT infer or advance that record from OpenCode package cache or Codex/Claude marketplace state.
- **FR-008 — Prohibit runtime self-update mutation**: `[ADDED cli-installation]` The OpenCode runtime version checker MAY notify about a newer release but MUST NOT rewrite plugin configuration, invalidate package-manager state, or invoke package installation; release changes MUST require an explicit CLI install or Update action.
- **FR-009 — Document the explicit update contract**: `[ADDED cli-installation]` CLI help, status and operation messaging, and routed public installation guidance SHALL describe exact OpenCode version pinning, the last complete CLI-managed version, native marketplace independence, and the complete CLI-driven update path consistently.

## Success criteria

- **SC-001** `[buildable]`: Focused config tests demonstrate exact stable and prerelease pins, replacement of bare/tagged/older entries with one managed entry, preservation of unrelated plugins, and zero `thoth-agents@latest` output from plugin-entry producers.
- **SC-002** `[buildable]`: Focused package-version tests demonstrate that both published-layout and source-layout execution resolve the root package version, while all missing, mismatched, malformed, or empty metadata fixtures are rejected with zero OpenCode configuration mutations.
- **SC-003** `[buildable]`: Focused orchestration tests for all 3 harnesses demonstrate that every interactive and command update apply path invokes the same ordered complete-refresh boundary as explicit installation.
- **SC-004** `[buildable]`: Update tests demonstrate Codex and Claude native manager behavior plus provider setup for all harnesses, including nonzero/failing outcomes for native, required-skill, and non-complete provider failures.
- **SC-005** `[buildable]`: Preview and dry-run tests for all three harnesses observe zero filesystem, native-manager, skill-installer, provider, cache, or package-manager mutations while listing every required refresh step.
- **SC-006** `[buildable]`: Ledger tests demonstrate 3 independent harness records, atomic replacement after complete success, and zero record advancement across dry-run plus every injected native-manager, managed-surface, required-skill, and provider failure.
- **SC-007** `[buildable]`: Status tests preserve the recorded CLI-managed version across all simulated Codex and Claude marketplace version changes and report both recorded and executing versions for every mismatch or missing-record case.
- **SC-008** `[buildable]`: Runtime update-check tests simulate a newer release and observe notification guidance with zero configuration writes, cache invalidations, and package-manager install calls.
- **SC-009** `[buildable]`: All CLI help, status, TUI/operation copy, README, and installation documentation checks pass with the exact-version, CLI-ledger, native-marketplace, and explicit-update contracts and zero guidance that describes background self-installation.

## Assumptions

- The npm package continues to ship its root `package.json` alongside `dist/` and identifies itself as `thoth-agents`.
- Re-running an older explicitly selected CLI release intentionally permits pinning or downgrading OpenCode to that release.
- Update targets one selected harness at a time; bulk `--all` update semantics are not introduced by this change.
- The CLI-managed version ledger is consumer-owned metadata and does not replace or mutate native Codex, Claude, OpenCode, or provider-owned state.
- Provider setup remains owned by thoth-mem and succeeds only on internally consistent `complete` evidence.

## Dependencies

- Existing package-root discovery and Node.js `>=22.13` filesystem APIs.
- Existing harness install orchestration, native manager adapters, required-skill installer, and thoth-mem setup boundary.
- OpenCode's package-based plugin configuration contract.

## Out of scope

- Pinning the schema URL or documentation examples that intentionally invoke the latest CLI package.
- Changing Codex or Claude marketplace package identifiers or version ownership.
- Preventing Codex or Claude from discovering or installing newer marketplace plugin releases through their native mechanisms.
- Adding a bulk update transaction across multiple harnesses.
- Removing update availability notifications.
- Mutating provider-owned thoth-mem assets directly.
