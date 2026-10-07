# Implementation Plan: Pin OpenCode Plugin and Unify Harness Updates

## Technical context

The current OpenCode config merger and operation status hard-code `thoth-agents@latest`. The runtime update hook subsequently rewrites pinned entries to a newer registry version, invalidates OpenCode package state, and runs `pnpm install`. Explicit harness installation is broader than the interactive/public Update paths: OpenCode Update only changes the plugin entry, Codex Update omits native plugin-manager and provider setup, and Claude Update omits provider setup. No cross-harness state records which package release most recently completed all CLI-required surfaces.

The change spans CLI configuration, install/operation orchestration, TUI/command messaging, status, a notification-only OpenCode runtime hook, tests, and public documentation. Codex and Claude native marketplace self-update behavior remains manager-owned and unchanged. Package version `0.3.8` is current repository metadata, but all behavior derives dynamically from the executing package and must work for stable or prerelease releases such as the user's `0.4.8` example.

## Constitution Check (pre-design)

- **Adaptive-root orchestration**: PASS — The user selected Accelerated SDD; root owns the canonical artifacts and used one read-only explorer only for bounded install/update parity discovery.
- **Explicit role boundaries**: PASS — Discovery made no writes, root is the sole artifact writer, one product writer will own implementation, and Oracle remains reserved for optional plan review and mandatory verification.
- **Proportional Spec Kit-compatible SDD**: PASS — The validated specification captures the exact pin, complete update, CLI ledger, native marketplace independence, and notification-only decisions without activating unrelated checklist or constitution work.
- **Truthful multi-harness contracts**: PASS — Research distinguishes OpenCode skill delivery, Codex external agent delivery, Claude packaging, and native marketplace ownership instead of claiming equivalent harness capabilities.
- **Independent provider ownership**: PASS — The design invokes only thoth-mem's public setup adapter and records no provider state, receipt, or inferred effect in the CLI ledger.
- **Evidence-led completion**: PASS — The plan requires focused regression tests, proportional repository checks, independent Oracle verification, and artifact-backed closeout before archive.

## Design

### Architecture

1. Add a package identity resolver that locates the nearest root `package.json` from the executing module, requires `name: "thoth-agents"`, validates a stable or prerelease semantic version, and returns a typed failure instead of `latest`. The resolver must work from both `src/` tests and bundled `dist/` chunks and allow fixture injection.
2. Add a CLI-owned, versioned installation ledger at `${XDG_CONFIG_HOME:-~/.config}/thoth-agents/install-state.json`. Reads distinguish missing, valid, and invalid state. Writes preserve unrelated valid harness records, use temporary-file replacement, and back up malformed CLI-owned state only when a fully successful install is ready to repair it.
3. Add one shared install finalization boundary used by explicit installation and operation-plan install/update applies. It runs provider setup, accepts only consistent `complete` evidence, and commits the harness ledger record last. Dry-run plans provider setup and ledger recording without writing the ledger.
4. Keep native and managed setup in existing canonical lower-level builders/appliers. Expand operation `install` and `update` plans so OpenCode performs config plus owned/external skills, Codex performs native plugin setup before global agent-pack/external skills, and Claude performs native refresh plus external skills. All three then use shared provider/ledger finalization. `sync` remains a narrower reconciliation and never advances the complete-install ledger.
5. Make the OpenCode config API require an explicit resolved plugin version whenever it ensures the plugin entry. Plan provenance captures that version; apply revalidates it before mutation. Status and plan text use `thoth-agents@<version>` and include a CLI-ledger target with recorded and executing versions.
6. Keep command and TUI Update on the same operation apply functions. Applied failures return a nonzero command result and a truthful TUI result. TUI copy describes a complete CLI refresh rather than only plugin/setup entries; the existing confirmation preview remains the mutation boundary.
7. Convert the OpenCode runtime updater into a notifier: retain version discovery and registry comparison, but remove config rewriting, cache invalidation, package-manager installation, and the `autoUpdate` execution option. The notification directs the operator to run the latest CLI installer or use Update.
8. Update help and routed public documentation. Preserve intentional `npx thoth-agents@latest ...` invocation examples and the schema URL; only the OpenCode plugin config entry becomes exact-versioned.

### Requirement mapping

| Requirement | Technical decision | Files/interfaces | Verification seam |
| --- | --- | --- | --- |
| FR-001 | Require an explicit executing package version in every OpenCode plugin merge and replace all bare/tagged/versioned managed entries with one exact entry. | `src/cli/package-version.ts`, `src/cli/config-io.ts`, `src/cli/install.ts`, `src/cli/operations/opencode.ts` | Config and operation tests cover stable/prerelease replacement, deduplication, preservation, and previews. |
| FR-002 | Resolve package identity before plan/apply mutation and fail closed for missing, mismatched, malformed, empty, or invalid metadata. | `src/cli/package-root.ts`, new `src/cli/package-version.ts` | Source-layout and published-layout fixtures plus all failure fixtures assert zero config writes. |
| FR-003 | Treat operation `install` and `update` applies as complete harness refreshes and keep TUI/public command dispatch on those same functions. | `src/cli/commands.ts`, `src/cli/tui/operations.ts`, `src/cli/tui/App.tsx`, `src/cli/operations/*.ts` | Cross-entrypoint tests assert the same issued plan and complete apply effects per harness. |
| FR-004 | Add missing OpenCode surfaces, Codex native plugin setup, and provider finalization while preserving each native manager boundary. | `src/cli/operations/opencode.ts`, `codex.ts`, `claude-code.ts`, `src/cli/codex-plugin-install.ts`, new `src/cli/install-completion.ts` | Harness operation tests inject native manager, skill, and provider outcomes and assert order/fail-closed behavior. |
| FR-005 | Keep plan creation side-effect-free, include provider/ledger targets, and propagate failed apply as nonzero/failed. | `src/cli/commands.ts`, `src/cli/tui/operations.ts`, `src/cli/operations/types.ts`, harness operation modules | Preview mutation spies remain zero; command and TUI tests assert truthful failure results. |
| FR-006 | Persist schema-v1 per-harness records only after provider-complete non-dry-run finalization. | new `src/cli/install-ledger.ts`, new `src/cli/install-completion.ts`, `src/cli/install.ts` | Ledger and installer tests cover 3 independent records, atomic replacement, invalid-state backup, and every no-advance path. |
| FR-007 | Add the ledger as a first-class managed status target and base CLI-managed version messaging on it, not native marketplace/cache state. | `src/cli/operations/types.ts`, `opencode.ts`, `codex.ts`, `claude-code.ts`, `src/cli/commands.ts`, `src/cli/tui/components/StatusView.tsx` | Status tests vary executing, recorded, missing, malformed, and marketplace state independently. |
| FR-008 | Remove runtime mutation/install branches and emit actionable CLI-only update guidance. | `src/hooks/auto-update-checker/index.ts`, `checker.ts`, `types.ts`, dead cache/update helpers and tests, `src/index.ts` | Hook tests observe a newer registry release with notification and zero write/install/cache calls. |
| FR-009 | Align operator-facing help, TUI copy, README, and installation docs with exact pins, the ledger, native marketplace independence, and complete updates. | `src/cli/commands.ts`, `src/cli/tui/App.tsx`, `README.md`, `docs/installation.md`, `docs/quick-reference.md`, routed agent docs if invariants change | Help/TUI/docs assertions and search review distinguish intentional CLI/schema `@latest` references from forbidden plugin-entry guidance. |

### Shared interfaces

- `resolveExecutingPackageVersion(options?) -> { ok: true; version; packageRoot } | { ok: false; error }` is the sole CLI source for the release being installed.
- `readInstallLedger(options?)` returns a discriminated missing/valid/invalid result; callers never infer a version on failure.
- `recordCompletedInstall({ harness, version, ... })` atomically commits only one proven harness record and returns structured path/error evidence.
- `finalizeHarnessInstall({ harness, version, dryRun, cwd, runThothMemSetup, ledgerOptions })` returns provider and ledger evidence without claiming success unless both required stages complete.
- Issued operation-plan provenance stores the resolved version and context/dependencies needed to reproduce the approved apply. Revalidation prevents an apply from changing the approved target version.

### Verification sequence

1. Red tests for package identity, exact OpenCode config merge, and ledger transitions.
2. Red parity/failure tests for OpenCode, Codex, Claude, command apply, and TUI apply/status.
3. Red runtime notification-only tests.
4. Implement the smallest shared helpers and harness changes to turn those tests green.
5. Run focused CLI/runtime tests, then `pnpm run check:ci`, `pnpm run typecheck`, `pnpm run build`, and `pnpm test`.
6. Inspect generated/build output and `git diff` to ensure no unrelated generated files or marketplace mutations were introduced.

## Optional support artifacts

- `research.md`: Created to preserve the confirmed per-harness install/update gaps and native ownership boundaries that determine scope.
- `data-model.md`: Created because the new cross-harness authoritative version ledger requires an explicit schema, transition, atomicity, and malformed-state contract.
- `contracts/`: Not needed; no external API or wire contract is introduced beyond the local versioned JSON state described in `data-model.md`.
- `quickstart.md`: Not needed; existing installation documentation is the operator-facing workflow and will be updated directly.

## Risks and migrations

- Existing users have no ledger record. Status reports the CLI-managed version as unknown until a complete ledger-aware install/update succeeds; it does not infer history from native plugin state.
- Exact OpenCode pins stop implicit dist-tag resolution. The runtime still notifies, and the documented recovery/update path is `npx thoth-agents@latest install --agent=opencode` or interactive Update.
- A ledger commit can fail after external setup already succeeded. The operation reports failure, retains the previous official record, and a repeated CLI update is the safe convergence path; no false rollback is claimed.
- Malformed CLI-owned ledger state is backed up and repaired only after a new complete install proves one harness version. Records that cannot be parsed are not invented.
- Codex and Claude may run a marketplace plugin version different from the recorded CLI-managed version. This is expected and must not trigger native cache mutation or overwrite the CLI ledger.
- Adding provider setup to operation apply can make formerly successful narrow updates fail on truthful non-complete provider evidence. This is required parity, and diagnostics/manual actions/receipts remain visible.
- Rollback is release-based: restoring the prior package code restores prior behavior. The new ledger is isolated consumer metadata and can be ignored by older releases; rollback never edits native marketplace or provider state.

## Constitution Check (post-design)

- **Adaptive-root orchestration**: PASS — The design keeps one implementation writer per code surface, uses the designer only for bounded TUI UX ownership if needed, and preserves mandatory Oracle verification.
- **Explicit role boundaries**: PASS — Root retains SDD artifacts, implementation is assigned to one bounded writer, read-only research stays evidence-only, and no child receives lifecycle or artifact ownership.
- **Proportional Spec Kit-compatible SDD**: PASS — Research and data-model artifacts exist only to resolve confirmed parity and state-transition risks; no unrelated checklist, contract, or quickstart ceremony was added.
- **Truthful multi-harness contracts**: PASS — The plan preserves native Codex/Claude marketplace updates while separately refreshing non-packageable Codex agents, non-packageable OpenCode skills, external skills, and harness-specific managed surfaces.
- **Independent provider ownership**: PASS — Shared finalization invokes the public setup command, validates its evidence, stores only the CLI package version, and never copies provider state or equates a CLI ledger record with provider health.
- **Evidence-led completion**: PASS — Every FR has a named test seam, behavior work follows red-green-refactor plus simplification, command/build/full-suite evidence is planned, and only Oracle may issue the final verdict.
