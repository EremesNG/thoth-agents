# Change: antigravity-native-acp

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: medium
**Risk**: high

## Exploration

- Follows `antigravity-fixes-cdcfc04` (must be archived first; this change starts from its result). Upstream `EstebanForge/pi-extensions` `cdcfc04` (1.10.7); partial clone `C:\Users\EremesNG\AppData\Local\Temp\antigravity-research-pBNDZE\upstream` (recreate with `git clone --filter=blob:none` in a fresh `mktemp -d`; never run its code). Every commit below FAILS an independent `git apply --check --directory=pi-packages/pi-antigravity-bridge`; the port is a hand-merge.
- Upstream commits, in dependency order:
  1. `72d2224` (54 files, +1353/−2160) — the ACP engine runs `agy acp` instead of the standalone `agy_acp_server`; both engines share the CLI installation and Google credentials; deletes `src/acp/auth.ts` and `browser-capture.ts`; replaces setup/installer (`src/acp/setup.ts`, new `src/acp/home.ts`, `src/agy-install.ts`, `src/agy-setup.ts`); changes `acp/{connection,driver,events,jsonrpc}.ts`, config, engine picker, version checks, provider/MCP wiring; `/agy acp-bin` removed; `/agy auth` and `/agy auth-manual` become CLI sign-in/install instructions; `AGY_BIN` selects the CLI for ACP too; new `MIN_AGY_ACP_VERSION = "1.5.3"` (stream-json `MIN_AGY_VERSION = "1.1.22"` stays); native model and `thought_level` become separate settings; cancellation becomes a notification; exact prompt usage when reported, synthetic estimate as fallback; a private MCP home filters global `pi-bridge`/`pi-bridge-<pid>` entries while sharing CLI app data, credentials and conversations; managed old ACP builds are removed only with managed-install evidence and standalone credentials are reported for manual removal; interactive missing-CLI startup offers the official installer.
  2. `32d6d2e` — `src/config.ts` `readConfigFile` ~245, `loadConfig` ~259, `saveConfig` ~411: automatically strips a persisted `acp.bin`; warns at startup when `AGY_ACP_BIN` is set.
  3. `e03776a` — stream-json per-session MCP isolation: staged home with the bridge's own entry enabled and foreign bridge entries filtered; capability/version probe with fallback warning; `AGY_AGENTS_ROOT` keeps legacy mode; driver spawn/recycle/close.
  4. `7a4e9b8` — isolation hardening: `AGY_AGENTS_ROOT` precedence, cleanup after an already-dead child, guarded probe temp creation, noisy-success probe handling, staging fallback to global registration, own-entry refresh.
  5. `22364ad` — last-child drain, atomic own-entry config write, `AGY_BIN` at spawn (already present locally through `spawnOwnedProcess(resolveAgyCommand(...))`, `src/driver.ts` ~467).
  6. `e0728f8` — usage totals: billing sum distinct from context occupancy (`src/acp/driver.ts` ActiveTurn, prompt settlement, update switch, turn initialization, usage synthesis; `src/acp/events.ts` `mapUpdate`); occupancy wins; fallback total = input + output + ceil(cacheRead / (toolBatches + 1)); tests for occupancy precedence, inference batches, duplicate/interleaved tools and per-turn reset.
  7. Migration-only hunks of `01e10ff` — isolated-home MCP config parsing (`src/acp/home.ts` `stageAcpHome`) and `acp-home.test.ts`.
- Local divergences that must survive (archived records and `.thoth/specs/pi-ecosystem/spec.md`): Windows Job containment of every agent-executing agy process through `spawnOwnedProcess`/`resolveAgyCommand` (the spec names the ACP connection explicitly; upstream raw `spawn` and PID/group checks are not equivalent); drain-aware settlement; home disposal only after verified owned-process settlement; pending-launch cancellation and target-confirmed stdin acknowledgements; lazy model-gated startup; instance-local auth/render/round-trip ownership; terminal-stream deadlines; retry-tail resume and first-park binding from the originating handle; image delivery on both engines; read-only enforcement; re-delivery of unpolled escalated results; namespaced deferred tools; the fixes from `antigravity-fixes-cdcfc04`; local default engine stream-json; private bridge discovery (`docs/BRIDGE-LIFECYCLE.md`, `extensions/index.ts` ~174–177 and ~959–1010): default `bridgeDiscovery: "private"` acquires a unique `pi-agy-<8 hex>` name per instance with collision checks, passes a private additive `.agents/mcp_config.json` to stream-json via `--add-dir` and the owned name/endpoint to ACP `session/new`/`session/load`, never registers or heals global bridge entries, and removes only exactly acquired descriptor keys; `legacy-global` keeps upstream global registration. Upstream's isolation instead recognizes only `pi-bridge`/`pi-bridge-<pid>` names, writes per-PID own entries, preserves non-bridge servers, falls back to global registration on stream-json staging failure and fails ACP staging.
- Obsolete local tests: standalone `acp-auth.test.ts`, `acp-browser-capture.test.ts`, the registry download/install/auth-marker parts of `acp-setup.test.ts`, server-binary precedence tests, combined effort-suffix and unsupported-cancel assumptions.
- Environment: operator CLI agy 1.5.8 (≥ 1.5.3, upstream's live-verified isolation version); `agy acp --help` succeeds and exposes `--gemini-dir`.

## Intent

Migrate `pi-packages/pi-antigravity-bridge`'s ACP engine to native `agy acp` with shared CLI credentials, adopt stream-json per-session MCP isolation and the native usage-total fix, retire the standalone server, its OAuth and binary overrides, and keep every local divergence.

## Non-goals

- Running or offering an installer from the bridge (user decision).
- `3ef73f0`/`5aceeb5` blocked overlays and Pi 1.5.1 pins; `0b5d4b6`/`c83d890` default model; `21f975f` background-log watcher; `b3aa451` cosmetics; upstream docs/release bookkeeping and package metadata.
- Changing the default engine (stays stream-json).
- Version bumps, publishing, live agy sessions in automated checks.

## Acceptance

- AC-1: The ACP engine launches `agy acp` (resolved through `AGY_BIN`/PATH by `resolveAgyCommand`) inside the Windows Job / owned-process path, requires agy ≥ 1.5.3 with a clear error below it, and never downloads or launches the standalone server; `/agy acp-bin` is gone; `/agy auth` and `/agy auth-manual` print CLI sign-in/install instructions (tests).
- AC-2: The standalone OAuth/browser-capture modules and their tests are removed; ACP model and thought level are separate settings; cancellation is sent as a notification; existing containment, settlement, resume, image, read-only and re-delivery suites pass on the native transport (tests).
- AC-3: A persisted `acp.bin` is stripped on load/save and a set `AGY_ACP_BIN` produces one startup warning (tests).
- AC-4: With managed-install evidence the bridge removes the old bridge-managed standalone ACP build and reports standalone credential paths for manual removal; without evidence it removes nothing (tests).
- AC-5: When the agy CLI is missing the bridge prints install instructions and never runs an installer (tests).
- AC-6: In private discovery mode both engines run agy with a per-session isolated MCP home that keeps unrelated (non-bridge) MCP servers, drops every other Pi bridge entry (recognizing local `pi-agy-<8 hex>`, legacy `pi-bridge-<pid>[-<uuid>]` and `pi-bridge` names) and exposes only this instance's acquired `pi-agy` entry, sharing CLI credentials; acquired-name collision checks, exact-owner descriptor cleanup and the no-global-registration rule of private mode stay; if stream-json staging or the capability probe fails in private mode the bridge keeps today's additive private config with a warning (never global registration), while `legacy-global` mode keeps upstream's global-registration fallback; ACP staging failure fails the turn visibly; `AGY_AGENTS_ROOT` keeps legacy (non-isolated) behavior; the home is disposed only after the owned process settled; the own-entry write is atomic; tests cover same-PID sibling instances, native-frame MCP tool names and each fallback (tests).
- AC-7: ACP usage reports context occupancy when available and otherwise input + output + ceil(cacheRead / (toolBatches + 1)), resetting per turn (upstream tests adapted).
- AC-8: Package `typecheck`, tests and `build`; root `pnpm run check:ci`, `pnpm run typecheck`, `pnpm run test:pi-extensions` (after build) pass; every adapted/dropped upstream test and changed or deleted local test is listed with its reason and accepted by root.
- AC-9: `README.md`, `CHANGELOG.md` (and `UPSTREAM-CHANGELOG.md`, engines docs if present) describe native ACP, shared credentials, removed commands/config/env, the 1.5.3 floor, isolation and the new sync base `cdcfc04`; `docs/agent/` mentions of the standalone ACP server are updated.

## Clarifications

- 2026-11-15: the user chose to migrate to native `agy acp` today as a separate change after the fixes.
- 2026-11-15: missing CLI → instructions only, never run an installer.
- 2026-11-15: old standalone ACP → follow upstream: remove the bridge-managed build only with managed-install evidence and report credentials for manual removal.

## Decisions

- D1: Port the native transport onto the local owned-process layer: `agy acp` is spawned only through `spawnOwnedProcess(resolveAgyCommand(...))`; upstream raw spawn, PID/group cleanup and `22364ad` last-child drain are re-expressed through Job/owned-process settlement, not copied.
- D2: Missing-CLI handling: adopt upstream detection and messages, drop the installer-execution path and its tests.
- D3: Old standalone cleanup follows upstream evidence rules (D: user choice); deletion is limited to the bridge-managed install directory upstream identifies.
- D4: Adopt `32d6d2e` config retirement (strip `acp.bin`, warn on `AGY_ACP_BIN`).
- D5: Isolated homes (`e03776a`, `7a4e9b8`, migration hunks of `01e10ff`) are adapted to local private discovery (`docs/BRIDGE-LIFECYCLE.md`): entry recognition uses local instance identities, not upstream's PID-only `pi-bridge`/`pi-bridge-<pid>` names; the own entry is the acquired `pi-agy` name; unrelated MCP servers are preserved; fallbacks are qualified by discovery mode and engine as in AC-6 (private stream-json → additive private config with warning, legacy-global stream-json → upstream global fallback, ACP → visible failure); homes are disposed after verified owned-process settlement.
- D6: Keep local default engine stream-json and lazy model-gated startup.
- D7: Vendoring: hand-merge in dependency order 1 → 2 → 7 → 3 → 4 → 5 → 6; adopt upstream tests for retained behavior; list adaptations.

## Durable deltas

- `ADDED pi-ecosystem` **Antigravity bridge uses the native agy CLI** — `@thoth-agents/pi-antigravity-bridge` MUST run its ACP engine through the agy CLI's native `agy acp` command (agy 1.5.3 or newer) with the CLI's shared Google credentials and MUST NOT download, launch or authenticate a standalone ACP server; in private discovery mode (unless `AGY_AGENTS_ROOT` selects legacy behavior) both engines MUST run agy with a per-session isolated MCP home that preserves unrelated MCP servers and, among Pi bridge entries, exposes only this instance's own entry, falling back on stream-json staging or capability-probe failure to the additive private configuration with a warning (never global registration) and failing an ACP turn visibly when its home cannot be staged; when the CLI is missing the bridge MUST print installation instructions without running an installer.
  - GIVEN an Antigravity session in private discovery mode on the ACP engine with agy 1.5.8 installed and a global MCP config containing another Pi bridge entry and an unrelated MCP server; WHEN a provider turn starts; THEN `agy acp` runs inside the owned-process path with an isolated home exposing this instance's bridge entry and the unrelated server but not the other bridge entry, and no standalone server is started or downloaded.

## Plan

One writer (thoth-worker) owns `pi-packages/pi-antigravity-bridge/**` and the touched `docs/agent/` lines. Milestones: (1) native transport compiling with containment suites green (units 1, 2, 7); (2) isolation and hardening (3, 4, 5) green; (3) usage totals (6) and docs, final report (hand-merged files, adapted/dropped upstream tests, changed/deleted local tests, check outputs). Test-first for each behavior (skill `tdd`), then `simplify`. Root reviews test adaptations, runs gates, fresh Oracle verifies. Optional manual smoke by the operator after closeout (live `agy acp` turn), not a gate.

**Verification seams.** Package `typecheck`, test script, `build`; focused vitest files; root `check:ci`, `typecheck`, `test:pi-extensions` after build. No live agy in automated checks.

**Risks.** Containment regressions when replacing the spawn path; home disposal racing owned-process settlement; protocol differences (`thought_level`, cancel notification) breaking resume/park/image paths; deleting files beyond the managed install; large merge in `extensions/index.ts` and `acp/driver.ts`. Mitigations: D1/D3/D5, milestone returns, root review of test changes, fresh Oracle.

## Tasks

- [x] AC-1: Native `agy acp` transport on the owned-process path
  - Outcome: per AC-1 and D1
  - Known entrypoints and skill paths: `extensions/index.ts`, `src/acp/{connection,driver,events,jsonrpc,setup}.ts`, `src/agy-version.ts`, `src/engine-picker.ts`, upstream `72d2224`; skill `tdd`
  - Inputs: Exploration unit 1; archived `antigravity-fixes-cdcfc04`
  - Dependencies: `antigravity-fixes-cdcfc04` archived
  - Output: implementation and tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-antigravity-bridge/{src,extensions,tests,scripts}/**`
  - Interface boundaries: `spawnOwnedProcess`/`resolveAgyCommand`, Windows Job launcher
  - Focused check and PASS evidence: transport, version-floor and containment suites pass
  - Return milestone: milestone 1
  - Stop / reassessment: `agy acp` cannot run inside the owned-process path
- [x] AC-2: Standalone auth removed, protocol updates, local suites green on native transport
  - Outcome: per AC-2
  - Known entrypoints and skill paths: `src/acp/{auth,browser-capture}.ts` (delete), driver/events, existing suites
  - Inputs: AC-1 work
  - Dependencies: AC-1 row
  - Output: deletions, implementation, test adaptations
  - Owner: thoth-worker
  - Writes: within package
  - Interface boundaries: resume/park/image/read-only/re-delivery contracts
  - Focused check and PASS evidence: listed suites pass
  - Return milestone: milestone 1
  - Stop / reassessment: a local safeguard cannot be expressed on the native protocol
- [x] AC-3: Retired binary config stripped and warned
  - Outcome: per AC-3 and D4
  - Known entrypoints and skill paths: `src/config.ts`, `tests/acp-config.test.ts`, upstream `32d6d2e`
  - Inputs: Exploration unit 2
  - Dependencies: AC-1 row
  - Output: implementation and tests
  - Owner: thoth-worker
  - Writes: within package
  - Interface boundaries: config file format
  - Focused check and PASS evidence: config tests pass
  - Return milestone: milestone 1
  - Stop / reassessment: none expected
- [x] AC-4: Managed old standalone build removed only with evidence
  - Outcome: per AC-4 and D3
  - Known entrypoints and skill paths: upstream setup/cleanup in `72d2224`; local `src/acp/setup.ts`
  - Inputs: Exploration unit 1
  - Dependencies: AC-1 row
  - Output: implementation and tests (temp-dir fixtures only)
  - Owner: thoth-worker
  - Writes: within package
  - Interface boundaries: filesystem outside the managed directory is never touched
  - Focused check and PASS evidence: evidence/no-evidence tests pass
  - Return milestone: milestone 1
  - Stop / reassessment: managed-install evidence cannot be established for local installs
- [x] AC-5: Missing CLI prints instructions only
  - Outcome: per AC-5 and D2
  - Known entrypoints and skill paths: upstream `src/agy-install.ts`, `src/agy-setup.ts`; extension startup
  - Inputs: Exploration unit 1
  - Dependencies: AC-1 row
  - Output: implementation and tests
  - Owner: thoth-worker
  - Writes: within package
  - Interface boundaries: no process launch on missing CLI
  - Focused check and PASS evidence: interactive and headless missing-CLI tests show instructions and no spawn
  - Return milestone: milestone 1
  - Stop / reassessment: none expected
- [x] AC-6: Per-session isolated MCP homes on both engines
  - Outcome: per AC-6 and D5
  - Known entrypoints and skill paths: `src/acp/home.ts` (new), `src/driver.ts`, `src/mcp-registration.ts`, extension startup; upstream `e03776a`, `7a4e9b8`, `22364ad`, `01e10ff` home hunk
  - Inputs: Exploration units 3–5, 7
  - Dependencies: AC-1 row
  - Output: implementation and tests
  - Owner: thoth-worker
  - Writes: within package
  - Interface boundaries: owned-process settlement before disposal; shared CLI credentials untouched
  - Focused check and PASS evidence: home, version-probe and driver isolation tests pass
  - Return milestone: milestone 2
  - Stop / reassessment: isolation requires killing by PID/group instead of the Job
- [x] AC-7: Native usage totals
  - Outcome: per AC-7
  - Known entrypoints and skill paths: `src/acp/driver.ts`, `src/acp/events.ts`, upstream `e0728f8`
  - Inputs: Exploration unit 6
  - Dependencies: AC-2 row
  - Output: implementation and tests
  - Owner: thoth-worker
  - Writes: within package
  - Interface boundaries: cost provenance requirement
  - Focused check and PASS evidence: usage tests pass
  - Return milestone: milestone 3
  - Stop / reassessment: conflicts with local timers/acknowledgements
- [x] AC-9: Documentation reflects native ACP
  - Outcome: per AC-9
  - Known entrypoints and skill paths: package `README.md`, `CHANGELOG.md`, `UPSTREAM-CHANGELOG.md`, `docs/`; `docs/agent/*` mentions of the standalone server
  - Inputs: completed rows
  - Dependencies: AC-1 through AC-7 rows
  - Output: docs diff
  - Owner: thoth-worker
  - Writes: those docs only
  - Interface boundaries: none
  - Focused check and PASS evidence: no standalone-server instructions remain; `git diff --check` clean
  - Return milestone: milestone 3 report
  - Stop / reassessment: none
- [x] AC-8: Test adaptations accepted and gates pass
  - Outcome: root review and consolidated gates
  - Known entrypoints and skill paths: worker report; root scripts
  - Inputs: accepted milestone 3
  - Dependencies: all rows above
  - Output: acceptance and command results
  - Owner: root
  - Writes: none
  - Interface boundaries: none
  - Focused check and PASS evidence: every test change justified; all gates exit 0
  - Return milestone: before final Oracle
  - Stop / reassessment: unexplained assertion change or unrelated environment failure (report)

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

Implementation authorized explicitly by the user on 2026-11-15 after plan-review OKAY, to start once antigravity-fixes-cdcfc04 is archived.
Review 1 subtask_thoth-oracle_1794769479334_f2b911bb REJECT (isolation fallback vs private discovery; delta contradicted exceptions; envelope invalid for missing openQuestions); review 2 subtask_thoth-oracle_1794769738903_fddf28b6 REJECT (probe-failure fallback missing from delta); root repaired both.
Review 3 subtask_thoth-oracle_1794769891562_3213c231 OKAY, valid gate verdict, recordSha256 0b9dd6d21e3e94d9456ad6f0d30426deef3945cf7369999d3fedcc1739973a2e (digest match).
Implementation waits for antigravity-fixes-cdcfc04 archival; refresh the Source baseline afterward.

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 0d92a4f77c702e999e78a78a05ce2def2ba4fea2adf3b2cd7afaa1401690db63

Fresh Oracle subtask_thoth-oracle_1794773998736_57647355; delivered gate verdict valid, kind final-verification, mode record, recordDigest match.
Root-approved implementation adaptation: staged homes disposed only on owned child close, retained on fenced/timeout termination and reclaimed by an owner-scoped dead-owner startup sweep.

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS. AC-1–AC-9, D1–D7 and the durable delta are satisfied, including the approved close-only home-disposal adaptation. The archived prerequisite safeguards are preserved.",
  "evidence": [
    {
      "id": "E1",
      "kind": "record-and-freshness",
      "locator": ".thoth/changes/antigravity-native-acp/antigravity-native-acp.md; bundled validate.mjs",
      "claim": "Validation through verify passes. Canonical baseline SHA-256 matches 7d9dcf8c8019d7f3def6561bc0d209617f26a837fa5f77f7e6f97ef90a658af5. Before/after package input hashes, including untracked files and deletions, match fcbbf3a04301fb38be38755d11ad2bdb156f65fc26198306053a7c4934e739f7. Record-prefix digest is unchanged.",
      "basis": "observed",
      "uncertainty": "Unrelated workspace changes excluded."
    },
    {
      "id": "E2",
      "kind": "native-transport-and-migration",
      "locator": "pi-packages/pi-antigravity-bridge/src/acp/connection.ts:171-251,348-352; src/acp/driver.ts:362-365,561-630; src/config.ts:257-270,424-435; extensions/index.ts:627-649,1241-1243",
      "claim": "Native ACP launches only through spawnOwnedProcess(resolveAgyCommand(...)), with the acp subcommand and CLI version floor 1.5.3. Model/thought_level are separate; cancellation is a notification. Standalone auth/browser modules are deleted; acp-bin is removed, acp.bin stripped and AGY_ACP_BIN warned once. Auth and missing-CLI paths print instructions without installer execution.",
      "basis": "observed",
      "uncertainty": "Live agy turns were intentionally not run."
    },
    {
      "id": "E3",
      "kind": "destructive-cleanup-boundary",
      "locator": "pi-packages/pi-antigravity-bridge/src/acp/setup.ts:35-106; extensions/index.ts:639-649; tests/acp-setup.test.ts",
      "claim": "Cleanup requires managed-layout evidence, preserves unmarked directories/binaries and symlinked roots/builds, and is confined to the managed install. Standalone credential paths are reported, not deleted. Temp-fixture regressions cover evidence, absence, interrupted installs and outside-root preservation.",
      "basis": "observed",
      "uncertainty": "No operator installation or credentials were accessed."
    },
    {
      "id": "E4",
      "kind": "isolation-and-private-discovery",
      "locator": "pi-packages/pi-antigravity-bridge/src/acp/home.ts:9-143; src/gemini-dir-probe.ts; extensions/index.ts:291-316,697-708,874-918; docs/BRIDGE-LIFECYCLE.md",
      "claim": "Both engines stage separate homes sharing CLI state, preserve unrelated servers, filter local and legacy bridge identities and enable only the acquired own identity. Private stream-json failures retain additive discovery with warnings, never global registration; legacy-global falls back globally; ACP staging fails visibly. AGY_AGENTS_ROOT bypasses isolation/probing. Atomic own-entry refresh, collision reservations and exact-owner descriptor cleanup are preserved and tested.",
      "basis": "observed",
      "uncertainty": "The parse probe cannot prove future CLI versions honor isolation; newer/unknown versions warn."
    },
    {
      "id": "E5",
      "kind": "containment-and-home-lifetime",
      "locator": "pi-packages/pi-antigravity-bridge/src/acp/connection.ts:179-192; src/driver.ts:470-489; src/acp/home.ts:110-154; tests/isolated-home-lifecycle.test.ts",
      "claim": "Homes are released on owned-child close, not leader exit or termination-promise resolution. Fenced homes remain for dead-owner startup sweeping, which preserves live/current-PID siblings. Job/plain lifecycle cases pass. owned-process.ts and process-termination.ts have zero diff; Windows Job containment and onOwnedProcessSettled are unchanged. No PID/group termination implementation was added.",
      "basis": "observed",
      "uncertainty": "Deliberate retention after uncertain termination follows the approved adaptation."
    },
    {
      "id": "E6",
      "kind": "usage-and-regression-execution",
      "locator": "pi-packages/pi-antigravity-bridge/src/acp/driver.ts:461-490,688-693,861-881; src/acp/events.ts; package verification commands",
      "claim": "Occupancy takes precedence; fallback total is input + output + ceil(cacheRead/(toolBatches+1)). Parallel/interleaved/duplicate frames and per-turn reset have coverage. Independently ran vitest run --maxWorkers=2: 93 files passed, 1308 tests passed, 5 skipped, exit 0 in 120.04s. Package typecheck and scoped git diff --check also passed.",
      "basis": "observed",
      "uncertainty": "Build and root gates were not independently rerun."
    },
    {
      "id": "E7",
      "kind": "test-adaptation-review",
      "locator": "Scoped tests diff and untracked tests; upstream git show 72d2224,32d6d2e,e03776a,7a4e9b8,22364ad,e0728f8,01e10ff",
      "claim": "Reviewed migration test changes: deleted acp-auth/browser-capture suites retire standalone OAuth; acp-setup replaces installer/auth cases with cleanup boundaries; acp-config replaces binary precedence with retirement/symlink preservation; acp-connection removes cancel-request assumptions while retaining auth ownership; acp-driver adopts native settings, notification/permission cancellation, usage and per-driver isolation; acp-events/jsonrpc cover native names, occupancy and notifications; artifacts adopts shared CLI state; engine-picker adopts shared-login/version copy; extension-lifecycle covers instructions-only setup, cleanup, sibling isolation, all fallbacks, override, sweep and doctor floor while preserving private ownership tests; lifecycle-sink moves ENOENT injection to owned launch; owned-process-termination asserts native argv; readonly updates the retired config shape; fake-acp-server adds native/version/usage fixtures; portable-spawn clears AGY_AGENTS_ROOT. New agy-home, agy-isolation-probe, isolated-home-lifecycle and native-acp suites adapt upstream behavior to local identities, Jobs, close-only disposal and offline fixtures. Prerequisite-only bridge-catalog, driver diagnostic, mcp-registration, provider-streaming and sysprompt-agent changes remain baseline and pass. Upstream installer/setup tests are intentionally dropped under D2; PID/group lifecycle tests are replaced by local owned-process/drain coverage; queued-message migration has no corresponding local module. Native floor/probe coverage lives in the new suites instead of upstream agy-version.test.ts.",
      "basis": "observed",
      "uncertainty": "Root marks adaptation acceptance complete in AC-8. Historical merge order and red/green execution cannot be reconstructed from final files; upstream code was inspected, never executed."
    },
    {
      "id": "E8",
      "kind": "documentation-and-test-safety",
      "locator": "pi-packages/pi-antigravity-bridge/{README,CHANGELOG,UPSTREAM-CHANGELOG}.md; docs/{ENGINES,BRIDGE-LIFECYCLE,ARCHITECTURE,DEVELOPMENT}.md; tests/helpers/portable-spawn.ts; docs/agent/",
      "claim": "Current documentation covers native ACP, shared credentials, retired interfaces, version floor, isolation and cdcfc04 sync base; historical standalone research is explicitly retired. No standalone-server instructions remain in docs/agent. Tests use disposable homes and fake executable seams, with no installer or live agy execution; HTTP integration checks use loopback.",
      "basis": "observed",
      "uncertainty": "No external-network traffic instrumentation was run."
    },
    {
      "id": "E9",
      "kind": "supplied-gate-evidence",
      "locator": "Delegated task: worker evidence and root gates",
      "claim": "Worker reports package build exit 0; root reports check:ci, typecheck, build and test:pi-extensions exit 0.",
      "basis": "observed",
      "uncertainty": "Supplied execution evidence reused, not independently rerun."
    }
  ],
  "verification": [
    {
      "check": "Record readiness, baseline and frozen inputs",
      "method": "Bundled verify validator and before/after byte hashes",
      "outcome": "pass",
      "evidenceIds": ["E1"],
      "reason": "Valid record, current source baseline and unchanged reviewed package inputs."
    },
    {
      "check": "AC-1, AC-2 / D1",
      "method": "Trace native launch/protocol and run package regression suite",
      "outcome": "pass",
      "evidenceIds": ["E2", "E5", "E6"],
      "reason": "Native transport preserves containment, settlement, resume, images, read-only refusal and re-delivery."
    },
    {
      "check": "AC-3 / D4",
      "method": "Inspect config retirement and startup-warning regressions",
      "outcome": "pass",
      "evidenceIds": ["E2", "E6", "E7"],
      "reason": "Persisted bin is stripped on load/save; retired environment override warns once."
    },
    {
      "check": "AC-4, AC-5 / D2, D3 / user decisions",
      "method": "Inspect cleanup and instructions-only paths; run fixture regressions",
      "outcome": "pass",
      "evidenceIds": ["E2", "E3", "E6"],
      "reason": "Evidence-gated managed cleanup only, credentials preserved and no installer execution."
    },
    {
      "check": "AC-6 / D5 / approved lifetime adaptation / durable delta",
      "method": "Trace staging, fallback, discovery and cleanup; run isolation/lifecycle regressions",
      "outcome": "pass",
      "evidenceIds": ["E4", "E5", "E6"],
      "reason": "Mode-qualified isolation and ownership contracts hold, including close-only disposal and dead-owner reclamation."
    },
    {
      "check": "AC-7",
      "method": "Compare upstream usage fix with implementation and deterministic fixtures",
      "outcome": "pass",
      "evidenceIds": ["E6", "E7"],
      "reason": "Occupancy, fallback arithmetic, inference batches and per-turn reset are covered."
    },
    {
      "check": "AC-8 / D6, D7 / prerequisite preservation",
      "method": "Review scoped test adaptations, run package tests/typecheck and reuse supplied gates",
      "outcome": "pass",
      "evidenceIds": ["E6", "E7", "E9"],
      "reason": "Required checks pass; stream-json remains default, lazy startup and archived safeguards remain intact."
    },
    {
      "check": "AC-9",
      "method": "Review current documentation and search docs/agent for obsolete setup guidance",
      "outcome": "pass",
      "evidenceIds": ["E8"],
      "reason": "Native transport, migration decisions, isolation and sync base are documented."
    }
  ],
  "risks": [],
  "openQuestions": [],
  "nextAction": "root / closeout",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/antigravity-native-acp/antigravity-native-acp.md",
    "reviewedRecordSha256": "0d92a4f77c702e999e78a78a05ce2def2ba4fea2adf3b2cd7afaa1401690db63"
  }
}
```

- AC-1: PASS | `native-acp`, `acp-connection`, `owned-process-termination` native argv and 1.5.3 gate | Oracle E2/E5
- AC-2: PASS | standalone auth/browser removed; `acp-driver` native settings/cancel; containment, resume, images, read-only, re-delivery suites | Oracle E2/E6/E7
- AC-3: PASS | `acp-config` retirement strip and `AGY_ACP_BIN` warning | Oracle E2/E7
- AC-4: PASS | `acp-setup` evidence-gated cleanup fixtures; credentials reported only | Oracle E3
- AC-5: PASS | instructions-only missing CLI/auth tests; no installer code | Oracle E2/E3
- AC-6: PASS | `agy-home`, `agy-isolation-probe`, `isolated-home-lifecycle`, `extension-lifecycle` fallbacks, sweep and close-only disposal | Oracle E4/E5
- AC-7: PASS | seven `e0728f8` driver usage cases plus occupancy mapping | Oracle E6
- AC-8: PASS | package vitest 1308 passed/5 skipped (--maxWorkers=2), typecheck, build; root check:ci, typecheck, build, test:pi-extensions exit 0; root accepted test dispositions | Oracle E6/E7/E9
- AC-9: PASS | README, CHANGELOG, UPSTREAM-CHANGELOG, docs/* updated; docs/agent has no standalone guidance | Oracle E8
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:7d9dcf8c8019d7f3def6561bc0d209617f26a837fa5f77f7e6f97ef90a658af5

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
