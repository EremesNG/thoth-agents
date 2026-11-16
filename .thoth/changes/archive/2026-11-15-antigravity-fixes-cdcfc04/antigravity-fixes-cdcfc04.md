# Change: antigravity-fixes-cdcfc04

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: medium
**Risk**: medium

## Exploration

- `pi-packages/pi-antigravity-bridge` is vendored from `EstebanForge/pi-extensions` `packages/pi-antigravity-bridge` (base `f95def9`/1.7.8 plus fork commits `a5c3957`, `237a5f1`), with later local work in archived changes `antigravity-stall-hardening`, `antigravity-windows-job-containment`, `antigravity-upstream-fixes` (2026-10-23), `antigravity-retry-resume-images`, and `f6fa3e87` (namespaced deferred tools). Last upstream review head `5736d63`; upstream head now `cdcfc04` (stamps 1.10.7). A partial clone is at `C:\Users\EremesNG\AppData\Local\Temp\antigravity-research-pBNDZE\upstream` (recreate with `git clone --filter=blob:none` into a fresh `mktemp -d` if missing; never run code from it).
- Upstream migrated the ACP engine to native `agy acp` in `72d2224` (+ `32d6d2e`, `e03776a`, `7a4e9b8`, `22364ad`). That migration is the follow-up change `antigravity-native-acp`; this change ports only the fixes that stay valid on both transports. Installed CLI on this machine: agy 1.5.8.
- Units (local anchors relative to the package; apply checks are independent `git apply --check --directory=pi-packages/pi-antigravity-bridge` against the working tree):
  1. `6289360` exit diagnostics — connection exit reason, `#finish` exit code/signal, driver exit diagnostics: `src/acp/connection.ts` ~235–242 and ~587, `src/acp/driver.ts` `#onConnectionExit` ~524–558. Apply FAILS. Its other hunks (registry `args.json`/`resolveInstalledArgs` in `setup.ts`, `probeUsableCredentials` entitlement probe in `auth.ts`, extension auth wiring) live in modules the migration deletes.
  2. `01e10ff` Windows CLI detection and MCP config parsing — `.exe`/backslash detection in `src/engine-picker.ts` `isAgyInstalled` ~86; empty/BOM-tolerant parsing in `src/mcp-registration.ts` `readConfig` plus `readGlobalMcpConfig`. Apply FAILS (missing picker context and the migration-only `src/acp/home.ts` hunk). Upstream `engine-picker.test.ts` Windows cases apply semantically; `acp-home.test.ts` belongs to the migration.
  3. `1090801` test isolation — `tests/provider-streaming.test.ts` stops reading the operator home/config. Apply PASSES.
  4. `8d7c386` + `df83d3c` carrier tools — `src/sysprompt-agent.ts` `syspromptAgentMd` ~46 declares the native tools (`read_file`, `edit_file`, `write_file`, `run_command`, `manage_task`, `search_web`) as a block YAML list; local frontmatter keeps `subagent: false`, `agents: []` and the YAML-safe description. Apply FAILS on context; upstream `sysprompt-agent.test.ts` adds parsed-tools assertions.
  5. `fc95fd3` compact extension-tool proxies — `src/bridge-catalog.ts` ~1–34, `extensions/index.ts` `listTools` ~888–924 and `bridgeOnToolCall` ~928–950, `src/provider.ts` `TOOL_PRIORITY_NOTE` ~188: direct default tools keep full schemas; extension tools are exposed through `bridge_tool_info` (inspection) and `bridge_call_tool` (invocation with `arguments_json`). Apply FAILS in extension/provider; catalog hunks apply. Upstream `bridge-catalog.test.ts` covers partitioning, schema serialization, inspection caps, internal-tool exclusion and payload validation. Production hunks are catalog/dispatch/prompt policy, not process setup, so the port is transport-neutral.
- Not in this change: `e0728f8` usage totals (calibrated on native agy usage; its driver-settlement hunks overlap the migration) moves to `antigravity-native-acp`; `3ef73f0` blocked overlay status needs Pi 1.5.1 and `pi-tui-dialogs` 0.1.3 (local pins Pi 1.5.0) and was not selected; `0b5d4b6` default model, `21f975f` background-log watcher and `b3aa451` cosmetics are upstream policy and were not selected.
- Local invariants that must survive (from archived records and `.thoth/specs/pi-ecosystem/spec.md`): Windows Job containment through `spawnOwnedProcess`/`resolveAgyCommand`, drain-aware settlement, terminal stream guarantee, read-only enforcement, re-delivery of unpolled escalated results, retry-tail resume and first-park binding, image delivery, live active/hidden tool authorization, instance-local round-trip ownership, namespaced deferred tools, and the package tool-definition size budget.

## Intent

Port the transport-independent upstream fixes `6289360` (diagnostics part), `01e10ff` (picker and MCP config part), `1090801`, `8d7c386`+`df83d3c` and `fc95fd3` into `pi-packages/pi-antigravity-bridge` on the current standalone ACP and stream-json engines, preserving local divergences, so the native-ACP migration can follow on top.

## Non-goals

- Native `agy acp` migration, isolated homes, standalone binary/auth removal (`72d2224`, `32d6d2e`, `e03776a`, `7a4e9b8`, `22364ad`) and `e0728f8`: change `antigravity-native-acp`.
- Standalone-only parts of `6289360` (registry argv persistence, entitlement probe).
- `3ef73f0`, `5aceeb5`, `0b5d4b6`, `c83d890`, `21f975f`, `b3aa451`, upstream docs/release bookkeeping and package metadata.
- Package version bumps or publishing; live agy sessions.

## Acceptance

- AC-1: When the ACP connection or stream-json child exits unexpectedly, the surfaced error names the exit code or signal and the exit reason; drain-aware settlement and the terminal stream guarantee are unchanged (tests).
- AC-2: On Windows the engine picker detects an agy CLI given as an `.exe` path or a backslash path; reading an empty or BOM-prefixed MCP config file yields an empty or parsed config instead of an error (tests).
- AC-3: `tests/provider-streaming.test.ts` runs isolated from the operator home and config (test environment set and restored).
- AC-4: The stream-json system-prompt carrier agent declares its native tools as a block YAML list while keeping `subagent: false`, `agents: []` and the YAML-safe description (parsed-frontmatter test).
- AC-5: The bridge keeps its existing catalog filters (active set, hidden, bridge-internal, mode source filter excluding built-in-source tools) and partitions only the tools that pass them: those named like Pi's seven default tools keep full schemas, all others are reachable only through `bridge_tool_info` and `bridge_call_tool`; invocation validates `arguments_json`, re-applies the same filters at call time and keeps instance-local round trips; the provider tool-priority note describes the proxies (tests).
- AC-6: Existing local suites for containment, stall/terminal guarantees, read-only, re-delivery, retry/resume/images, namespaces and the tool-definition budget pass unchanged or with each change listed and justified; package `typecheck`, tests and `build`, and root `pnpm run check:ci`, `pnpm run typecheck` and `pnpm run test:pi-extensions` (after build) pass.
- AC-7: `CHANGELOG.md` and `README.md` (and `UPSTREAM-CHANGELOG.md` if it tracks ported commits) record the ported commits and the new extension-tool proxies.

## Clarifications

- 2026-11-15: the user chose to port the fixes now on the current transport and migrate to native `agy acp` in a separate change the same day.
- 2026-11-15: from the review the user selected the "keep transport" fix set; `e0728f8` moves to the migration change because its settlement hunks overlap it. No other material question remains.

## Decisions

- D1: Port only the exit code/signal/reason diagnostics of `6289360`; skip registry argv and entitlement probing (owned by modules the migration deletes).
- D2: Port the picker and MCP-config parsing of `01e10ff`; its isolated-home hunk waits for the migration.
- D3: `fc95fd3` keeps local live authorization (active/hidden checks at call time), instance-local round trips, internal-tool exclusion and the `antigravity` replay wrapper behavior; proxies are an agy-facing MCP surface and do not change Pi tool definitions or namespaces.
- D4: Vendoring procedure: `git apply` clean hunks, hand-merge the rest; adopt upstream tests for retained behavior adapted to local structure; list every adapted or dropped upstream test and every changed local test with its reason.

## Durable deltas

- `ADDED pi-ecosystem` **Antigravity bridge proxies extension tools** — `@thoth-agents/pi-antigravity-bridge` MUST keep bridging to agy only the tools that pass its existing catalog filters (in Pi's current active set, not hidden, not bridge-internal, and matching the bridge-tools mode source filter, so Pi built-in-source tools stay excluded), MUST expose with full schemas only those authorized tools named like Pi's seven default tools (`read`, `bash`, `edit`, `write`, `grep`, `find`, `ls`), MUST expose every other authorized tool only through a compact inspection tool and a compact invocation tool whose JSON-string arguments are validated, and MUST re-apply the same filters at invocation time.
  - GIVEN an Antigravity session with an authorized extension tool, a hidden extension tool and a Pi built-in-source tool; WHEN agy lists bridge tools and invokes the extension tools through the invocation proxy; THEN the list shows the proxies instead of the extension schema and omits the built-in-source tool, the authorized tool runs with the parsed arguments and the hidden tool is rejected.

## Plan

One writer (thoth-worker) owns `pi-packages/pi-antigravity-bridge/**` for units 1–5 in Exploration order 3 → 1 → 2 → 4 → 5 (test isolation first so new tests never read the operator home), test-first per unit (skill `tdd`), then `simplify`. Docs (AC-7) by the same worker at the end. Root reviews the adaptation report, runs consolidated gates and requests a fresh Oracle.

**Interfaces to preserve.** `spawnOwnedProcess`/`resolveAgyCommand`; ACP connection/driver settlement; pi-core work-panel/render contracts; namespaced deferred registration; spec requirements listed in Exploration.

**Verification seams.** Package `typecheck`, test script, `build`; focused vitest files; root `pnpm run check:ci`, `pnpm run typecheck`, `pnpm run test:pi-extensions` after build. No live agy.

**Risks.** Proxy invocation weakening live authorization; diagnostics changing settlement order; upstream tests assuming POSIX or the native transport; overlap of `extensions/index.ts` with the later migration. Mitigations: D3, test-first, root review of test changes, fresh Oracle.

## Tasks

- [x] AC-3: Provider-streaming tests isolated from the operator home and config
  - Outcome: `1090801` applied; suite passes and no longer reads the real home/config
  - Known entrypoints and skill paths: `pi-packages/pi-antigravity-bridge/tests/provider-streaming.test.ts`; upstream clone
  - Inputs: Exploration unit 3
  - Dependencies: none
  - Output: test diff
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-antigravity-bridge/tests/provider-streaming.test.ts`
  - Interface boundaries: none
  - Focused check and PASS evidence: the file passes under vitest
  - Return milestone: with the full unit report
  - Stop / reassessment: local suite depends on operator config for a kept behavior
- [x] AC-1: Exit code, signal and reason surfaced on unexpected exits
  - Outcome: per AC-1 and D1
  - Known entrypoints and skill paths: `src/acp/connection.ts`, `src/acp/driver.ts`, `src/driver.ts`; skill `tdd`
  - Inputs: Exploration unit 1; D1
  - Dependencies: AC-3 row
  - Output: implementation and tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-antigravity-bridge/{src,tests}/**`
  - Interface boundaries: owned-process settlement, terminal stream guarantee
  - Focused check and PASS evidence: new diagnostics tests fail before and pass after; existing settlement/stall suites pass
  - Return milestone: with the full unit report
  - Stop / reassessment: diagnostics require changing settlement order
- [x] AC-2: Windows CLI detection and tolerant MCP config parsing
  - Outcome: per AC-2 and D2
  - Known entrypoints and skill paths: `src/engine-picker.ts`, `src/mcp-registration.ts`; skill `tdd`
  - Inputs: Exploration unit 2; D2
  - Dependencies: AC-3 row
  - Output: implementation and tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-antigravity-bridge/{src,tests}/**`
  - Interface boundaries: `resolveAgyCommand` stays the runtime resolver
  - Focused check and PASS evidence: picker and MCP config tests pass
  - Return milestone: with the full unit report
  - Stop / reassessment: detection conflicts with `resolveAgyCommand`
- [x] AC-4: Carrier agent declares native tools in block YAML
  - Outcome: per AC-4
  - Known entrypoints and skill paths: `src/sysprompt-agent.ts`, `tests/sysprompt-agent.test.ts`; skill `tdd`
  - Inputs: Exploration unit 4
  - Dependencies: AC-3 row
  - Output: implementation and tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-antigravity-bridge/{src,tests}/**`
  - Interface boundaries: stream-json carrier staging and hash
  - Focused check and PASS evidence: parsed-frontmatter test passes; existing carrier suites pass
  - Return milestone: with the full unit report
  - Stop / reassessment: declared tools contradict local masking
- [x] AC-5: Extension tools proxied through compact inspection and invocation tools
  - Outcome: per AC-5, D3 and the durable delta
  - Known entrypoints and skill paths: `src/bridge-catalog.ts`, `extensions/index.ts` `listTools`/`bridgeOnToolCall`, `src/provider.ts` `TOOL_PRIORITY_NOTE`, `tests/bridge-catalog.test.ts`; skill `tdd`
  - Inputs: Exploration unit 5; D3
  - Dependencies: AC-3 row
  - Output: implementation, adopted/adapted tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-antigravity-bridge/{src,extensions,tests}/**`
  - Interface boundaries: live authorization, round-trip ownership, replay wrapper, namespaces, tool-definition budget
  - Focused check and PASS evidence: catalog/dispatch tests (partitioning, serialization, caps, internal exclusion, payload validation, hidden/inactive rejection) pass
  - Return milestone: with the full unit report
  - Stop / reassessment: proxying requires weakening live authorization
- [x] AC-7: Docs record the ported commits and proxies
  - Outcome: per AC-7
  - Known entrypoints and skill paths: package `CHANGELOG.md`, `README.md`, `UPSTREAM-CHANGELOG.md`
  - Inputs: units 1–5 done
  - Dependencies: AC-1, AC-2, AC-4, AC-5 rows
  - Output: docs diff
  - Owner: thoth-worker
  - Writes: those files only
  - Interface boundaries: none
  - Focused check and PASS evidence: `git diff --check` clean
  - Return milestone: final worker report (units, adapted/dropped upstream tests, changed local tests, check outputs)
  - Stop / reassessment: none
- [x] AC-6: Local suites preserved and consolidated gates pass
  - Outcome: root reviews the adaptation report and runs package and root gates
  - Known entrypoints and skill paths: worker report; root `package.json` scripts
  - Inputs: accepted worker output
  - Dependencies: all rows above
  - Output: acceptance and command results
  - Owner: root
  - Writes: none
  - Interface boundaries: none
  - Focused check and PASS evidence: every test change justified; package typecheck/test/build and root check:ci/typecheck/test:pi-extensions exit 0
  - Return milestone: before final Oracle
  - Stop / reassessment: unexplained assertion change or unrelated environment failure (report)

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

Implementation authorized explicitly by the user on 2026-11-15 after plan-review OKAY.
First review subtask_thoth-oracle_1794768043619_c4259bb9 REJECT (delta widened exposure); root repaired delta and AC-5.
Re-review subtask_thoth-oracle_1794768645691_15f91210 OKAY, valid gate verdict, recordSha256 e62e7d29c5d15e4ac15e3abde055dd9d8dd64c185f8050481a4726c53b76ff23 (digest match).
Nonblocking caution for implementation: adapt fc95fd3's cached raw-name dispatch fallback so extension tools are reachable only through the proxies; test raw extension-name rejection.

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 072a9fab93d1a35c4c5615db9cfd846fbcf7bcebe03312b4bd17f32017dd0cd5

Fresh Oracle subtask_thoth-oracle_1794770517238_05dfbf36; delivered gate verdict valid, kind final-verification, mode record, recordDigest match.
Root-approved implementation adaptations: optional `kill(reason)` carrying the exit diagnostic without reordering settlement; legacy-global stream-json proxy omission (64-char qualified-name limit) documented, discovery identity unchanged.

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS. The scoped implementation satisfies AC-1–AC-7, D1–D4, the durable delta and raw-name dispatch caution, including both root-approved adaptations.",
  "evidence": [
    {
      "id": "E1",
      "kind": "record-and-scope",
      "locator": ".thoth/changes/antigravity-fixes-cdcfc04/antigravity-fixes-cdcfc04.md; git diff HEAD -- pi-packages/pi-antigravity-bridge",
      "claim": "The verify validator passes and the canonical source digest matches. Scoped diff SHA-256 remained 68019004eedecfd3ba85a6c2092de734346815275a0c72754d7e943670b37d34 before/after checks; no untracked package files.",
      "basis": "observed",
      "uncertainty": "Unrelated working-tree changes excluded."
    },
    {
      "id": "E2",
      "kind": "source-and-tests",
      "locator": "pi-packages/pi-antigravity-bridge/src/acp/connection.ts:237-243,541-557,589-605; src/acp/driver.ts:524-558; src/driver.ts:520-542; tests/acp-connection.test.ts:207-232",
      "claim": "Unexpected exits carry code/signal and redacted stderr or process-gone reason. kill(reason) preserves default explicit-kill diagnostics and existing settlement ordering. Owned-process/drain boundaries remain unchanged.",
      "basis": "observed",
      "uncertainty": "No live agy execution."
    },
    {
      "id": "E3",
      "kind": "source-and-tests",
      "locator": "pi-packages/pi-antigravity-bridge/src/engine-picker.ts:82-128; src/mcp-registration.ts:39-67; tests/engine-picker.test.ts; tests/mcp-registration.test.ts",
      "claim": "Windows executable suffix/backslash detection and empty/BOM config parsing are implemented and tested; runtime command resolution is unchanged.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E4",
      "kind": "source-and-tests",
      "locator": "pi-packages/pi-antigravity-bridge/tests/provider-streaming.test.ts:33-51; src/sysprompt-agent.ts:46-66; tests/sysprompt-agent.test.ts",
      "claim": "Provider tests hoist an isolated home mock and clean it up. Carrier tools are block YAML with parsed tool-list assertions; masking and YAML-safe description remain intact.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E5",
      "kind": "authorization-and-dispatch",
      "locator": "pi-packages/pi-antigravity-bridge/src/bridge-catalog.ts:46-194; extensions/index.ts:295-296,889-981; tests/extension-lifecycle.test.ts:990-1038",
      "claim": "Partitioning follows live active/hidden/internal/source filtering. Only seven authorized default names dispatch directly; raw extension names are rejected. Proxies validate stringified object arguments, recheck authorization and use the existing instance-owned round-trip store. Replay and Pi namespace/publication paths are unchanged.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E6",
      "kind": "independent-execution",
      "locator": "pnpm --filter @thoth-agents/pi-antigravity-bridge exec vitest run --maxWorkers=2; package typecheck",
      "claim": "Vitest passed: 91 files, 1261 tests passed, 12 skipped, 113.08 seconds. Package typecheck completed without errors.",
      "basis": "observed",
      "uncertainty": "Default concurrency was not rerun; its reported timing flake was not reproduced with two workers."
    },
    {
      "id": "E7",
      "kind": "test-adaptation-review",
      "locator": "Scoped tests diff; upstream git show 6289360,01e10ff,1090801,8d7c386,df83d3c,fc95fd3",
      "claim": "All nine changed local test files were reviewed. provider-streaming adopts upstream isolation unchanged; acp-connection adds exit/default-kill regressions; acp-driver and driver strengthen diagnostic assertions; engine-picker adds Windows coverage, an explicit Linux seam and a host-portable backslash spy; bridge-catalog adopts proxy coverage but rejects upstream's object-valued arguments; sysprompt-agent replaces the no-tools assertion and incorporates upstream's productive-toolset case into parsed-frontmatter coverage; mcp-registration adds empty/BOM coverage; extension-lifecycle moves schema fixtures to direct default names, asserts proxy/name-limit behavior and adds live-filter/raw-name/owner coverage. Dropped upstream tests match exclusions: disabled-account entitlement probing and four registry-argument setup cases under D1; isolated-home empty, BOM and malformed-mcpServers cases under D2. No unexplained weakened local assertion was found.",
      "basis": "observed",
      "uncertainty": "Historical git-apply and red/green execution order cannot be reconstructed from the final diff. Upstream code was inspected, never executed."
    },
    {
      "id": "E8",
      "kind": "documentation",
      "locator": "pi-packages/pi-antigravity-bridge/CHANGELOG.md; README.md; UPSTREAM-CHANGELOG.md; docs/BRIDGE-LIFECYCLE.md:14",
      "claim": "Docs identify retained commits, exclusions, proxy usage and raw-name rejection. They document legacy-global stream-json proxy omissions without changing discovery identity.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E9",
      "kind": "supplied-gate-evidence",
      "locator": "Delegated task: worker evidence and root gates",
      "claim": "Worker reports package build exit 0; root reports check:ci, typecheck, build and test:pi-extensions exit 0.",
      "basis": "observed",
      "uncertainty": "Reported executions reused, not independently rerun; build was not rerun in this read-only review."
    }
  ],
  "verification": [
    {
      "check": "Record readiness and frozen scope",
      "method": "Bundled verify validator, baseline hash and before/after scoped diff comparison",
      "outcome": "pass",
      "evidenceIds": ["E1"],
      "reason": "Valid record, current baseline and unchanged reviewed inputs."
    },
    {
      "check": "AC-1 / D1",
      "method": "Diagnostic/settlement diff inspection and package regressions",
      "outcome": "pass",
      "evidenceIds": ["E2", "E6"],
      "reason": "Diagnostics added without changing process ownership or settlement order; excluded auth/setup behavior not ported."
    },
    {
      "check": "AC-2 / D2",
      "method": "Picker/config implementation and tests",
      "outcome": "pass",
      "evidenceIds": ["E3", "E6"],
      "reason": "Detection and tolerant parsing pass; isolated homes remain deferred."
    },
    {
      "check": "AC-3 and AC-4",
      "method": "Isolation/mock inspection and parsed-frontmatter regressions",
      "outcome": "pass",
      "evidenceIds": ["E4", "E6"],
      "reason": "Home isolation, cleanup, native tools and carrier masking are preserved."
    },
    {
      "check": "AC-5 / D3 / durable delta / plan-review caution",
      "method": "Trace catalog-to-dispatch authorization and inspect HTTP integration regressions",
      "outcome": "pass",
      "evidenceIds": ["E5", "E6"],
      "reason": "Compact proxies preserve live authorization, instance ownership and existing Pi surfaces; raw extension dispatch is rejected."
    },
    {
      "check": "D4 and AC-6 test-change justification",
      "method": "Compare every changed test file with retained upstream test additions",
      "outcome": "pass",
      "evidenceIds": ["E7"],
      "reason": "Adapted, dropped and changed tests are enumerated with reasons."
    },
    {
      "check": "AC-6 consolidated checks",
      "method": "Independent full package Vitest/typecheck plus supplied build/root gate evidence",
      "outcome": "pass",
      "evidenceIds": ["E6", "E7", "E9"],
      "reason": "Package suite passes with requested concurrency; retained invariant suites and justified test changes are covered."
    },
    {
      "check": "AC-7",
      "method": "Documentation diff and git diff --check",
      "outcome": "pass",
      "evidenceIds": ["E1", "E8"],
      "reason": "Required commit/proxy documentation is present; whitespace check passes."
    }
  ],
  "risks": [
    {
      "description": "pi-packages/pi-antigravity-bridge/docs/BRIDGE-LIFECYCLE.md:14 → accepted legacy-global stream-json limitation: both proxies exceed the qualified-name limit and are omitted with warnings. Private discovery remains the documented recommendation.",
      "severity": "medium",
      "blocking": false,
      "evidenceIds": ["E8"]
    }
  ],
  "openQuestions": [],
  "nextAction": "root / closeout",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/antigravity-fixes-cdcfc04/antigravity-fixes-cdcfc04.md",
    "reviewedRecordSha256": "072a9fab93d1a35c4c5615db9cfd846fbcf7bcebe03312b4bd17f32017dd0cd5"
  }
}
```

- AC-1: PASS | `acp-connection`, `acp-driver`, `driver` exit diagnostics and default-kill regressions | Oracle E2/E6
- AC-2: PASS | `engine-picker` Windows suffix/backslash, `mcp-registration` empty/BOM | Oracle E3/E6
- AC-3: PASS | `provider-streaming` isolated home mock with cleanup | Oracle E4
- AC-4: PASS | `sysprompt-agent` parsed block-YAML tools with masking | Oracle E4
- AC-5: PASS | `bridge-catalog` and `extension-lifecycle` proxy, live-filter and raw-name rejection tests | Oracle E5/E6
- AC-6: PASS | package vitest 1261 passed/12 skipped (--maxWorkers=2), typecheck, build; root check:ci, typecheck, build, test:pi-extensions exit 0; one default-concurrency PID-observation timing failure passes on rerun (environment) | Oracle E6/E7/E9
- AC-7: PASS | CHANGELOG, README, UPSTREAM-CHANGELOG, BRIDGE-LIFECYCLE updated; `git diff --check` clean | Oracle E8
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:8b4c952377cd2d707a5918bdf927db9f8bd6c49960057a0edb7480639d88ac03

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
