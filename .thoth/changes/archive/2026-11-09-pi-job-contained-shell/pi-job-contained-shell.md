# Change: pi-job-contained-shell

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: medium
**Risk**: medium

## Exploration

- Reproduced on Windows 11 with the Pi `bash` tool (5 s timeout): `sleep 987` is killed, but `sleep 988 | head -1` and `bash -c 'sleep 989; echo done' | head -1` leave `sleep.exe`/`bash.exe` running. Their Windows ParentProcessId points to already-dead MSYS2 intermediaries, so the SDK's `taskkill /F /T /PID <shell>` cannot reach them. Plain PowerShell children are killed correctly; Git Bash launched from the `powershell` tool also orphans. Orphaned `find /` scans from agents ran for hours.
- Execution ownership: both `bash` and `powershell` tools are owned by `@earendil-works/pi-coding-agent` (`dist/core/tools/bash.js:48-123`, `dist/core/tools/powershell.js:10-30`, Windows kill `dist/utils/shell.js:189-203`). `pi-thoth-theme` only registers renderers (`pi-packages/pi-thoth-theme/src/tools/index.ts:32-45,92-107`).
- Pi seam: `createBashToolDefinition(cwd, { operations })` / `createPowerShellToolDefinition(cwd, { operations })`; `BashOperations.exec(command, cwd, { onData, signal?, timeout?, env? }) -> { exitCode }` (`dist/core/tools/bash.d.ts:40-61`). Abort rejects `"aborted"`, timeout rejects `"timeout:<seconds>"` (`bash.js:102-108`); output after `exec` settles is dropped (`bash.js:229-233`). The PowerShell UTF-8 output prefix lives in its default operations (`powershell.js:4,13`). Registering a tool with a built-in name replaces it; missing renderer slots inherit built-in rendering; across extensions first registration wins (upstream docs `extensions.md#overriding-built-in-tools`, `runner.ts`).
- Reusable containment: `pi-packages/pi-core/src/windows-job/` `launchInJob({file,args,cwd,env})` creates a KILL_ON_JOB_CLOSE job assigned at creation (`launcher.cs:70-72,117-123`), `terminate()` uses TerminateJobObject and waits for zero processes (`launcher.cs:162-175`); lazy persistent PowerShell/Add-Type helper with 30 s start timeout (`client.ts:139-165`); no AbortSignal, no built-in fallback (`client.ts:271-330`); `exited` is leader exit only (`launcher.cs:130-138`). Consumers copy `launcher.cs`/`launcher.ps1` beside their bundle (`scripts/build-pi-extensions.mjs:16-27,53-72`). Fallback precedent: `pi-packages/pi-antigravity-bridge/src/owned-process.ts:177-196`.
- External: upstream issue earendil-works/pi#9129 (same bug) is open; no published Pi package is a drop-in fix (pi-landstrip has Job Objects but sandbox semantics/elevated setup; others are PowerShell-only, Sandboxie, or non-Windows).

## Intent

On Windows, the Pi `bash` and `powershell` agent tools run every command inside a Windows Job Object so that timeout, abort, or command completion terminates every process the command started, including Git Bash pipeline descendants, while preserving the tools' existing names, prompts, output, and error semantics. Non-Windows behavior is unchanged.

## Non-goals

- No command-guard/blocklist (PreToolUse hooks, Codex rules, Pi tool_call guards) and no AGENTS.md/CLAUDE.md instruction changes; tracked as a separate follow-up.
- No changes to Claude Code or Codex harness process handling.
- No change to `user_bash` (`!` commands), pi-background-tasks, or its separate job helper.
- No upstream Pi patch.
- No cleanup watchdog that kills processes by parent-PID walks.

## Acceptance

- AC-1: On Windows, a `bash` tool command `sleep N | head -1` (and `bash -c 'sleep N; echo done' | head -1`) that hits its timeout leaves no `sleep.exe`/`bash.exe` with that marker running afterward, and the tool reports the same timeout error as today.
- AC-2: On Windows, aborting a running `bash` or `powershell` command terminates all its descendants and reports the existing `aborted` outcome.
- AC-3: On Windows, when the command's shell exits normally, any descendants it left running are terminated, and all stdout/stderr written before exit is delivered through `onData` before the result returns; exit codes are preserved.
- AC-4: The `powershell` tool keeps its UTF-8 output initialization and the same shell resolution/arguments; Git Bash launched from it is contained as in AC-1.
- AC-5: If the job launcher cannot start, the command runs through Pi's default execution and the user is warned once per session that containment is unavailable.
- AC-6: On non-Windows platforms the extension does not replace either tool and behavior is unchanged.
- AC-8: Per the existing pi-ecosystem "Thoth Pi tool definition registry" requirement, the package publishes its `bash`/`powershell` definitions to the pi-core registry only from UI sessions (`ctx.hasUI`); headless sessions still get job containment and launcher warm-up but publish nothing.
- AC-7: The new package is built, bundled with the launcher assets, and installed/registered by the thoth-agents Pi installation like the other first-party Pi packages, and theme renderers still render both tools.

## Clarifications

- Owner: user asked to check for an existing package first; none fits (see Exploration), so a new first-party package is created.
- Tools are overridden under the same names (`bash`, `powershell`), not added as extra tools.
- Launcher unavailable: fall back to Pi default execution with a warning (user choice).
- Descendants left after normal shell exit: terminate them (user choice); long-running work belongs to background tasks.

## Decisions

- New package `pi-packages/pi-contained-shell`, depending on `pi-core` windows-job; registers `bash`/`powershell` via the SDK definition factories with job-backed `operations`, only on win32.
- Timeout covers launcher acquisition plus execution; the launcher is pre-warmed asynchronously at session start to keep first-command latency low.
- Abort/timeout during pending launch: once the job exists it is terminated immediately and the promise rejects with the SDK's error.
- Completion: after leader exit, terminate the job, then wait for stdout/stderr end before resolving.
- PowerShell: replicate the SDK's UTF-8 prefix and shell resolution through public SDK exports when available; otherwise mirror the current values with a test pinning them.
- Register through the pi-core tool definition registry convention used by first-party packages.
- Conform to existing pi-ecosystem requirements "Windows job launcher consumer isolation" and "Bundled Pi extension packages"; the new requirement does not overlap the AskCodex/Antigravity job-containment requirements (different consumer).

## Durable deltas

- `ADDED pi-ecosystem` **Job-contained Pi shell tools on Windows** — On Windows, the thoth Pi `bash` and `powershell` tools run each command inside a kill-on-close Job Object so timeout, abort, or shell exit terminate every descendant, falling back to Pi default execution with a warning when the launcher is unavailable.
  - GIVEN a Windows Pi session with the thoth contained-shell package; WHEN a `bash` command `sleep N | head -1` exceeds its timeout; THEN the tool reports the timeout and no process from that command remains running.

## Plan

1. Package scaffold `pi-packages/pi-contained-shell` (package.json, tsconfig, vitest, src/index.ts) following existing first-party package conventions (pi-todo/pi-background-tasks as templates).
2. `src/job-operations.ts`: `createJobBashOperations({ resolveShell, prefix? })` implementing `BashOperations.exec` over `launchInJob`: resolve shell + args like the SDK, merge env, stream stdout/stderr to `onData`, timeout timer (seconds) and AbortSignal handling covering the pending launch, terminate + drain on leader exit, map exit codes, reject with `"aborted"` / `"timeout:<s>"`; on launcher-unavailable classification delegate to the SDK default operations and emit a one-time warning.
3. `src/index.ts`: on win32 register `bash` and `powershell` definitions using the job operations; pre-warm the launcher on session start; no-op elsewhere.
4. Tests: unit tests with a fake launcher (exit codes, drain ordering, abort during launch, timeout error string, fallback + single warning, non-Windows no-op); Windows-only integration tests mirroring the reproduction (pipeline and nested bash, PowerShell launching bash) asserting no marker process survives, using the warm-up pattern from `pi-packages/pi-antigravity-bridge/tests/helpers/warm-job-launcher.ts`.
5. Wiring: `scripts/build-pi-extensions.mjs` entry with launcher assets; workspace/package lists; thoth-agents Pi installer/package registration and any release package lists, mirroring an existing first-party package.

Focused verification: package typecheck + vitest (including Windows integration), `pnpm run check:ci`, `pnpm run typecheck`, `pnpm run build`; root live repro with the installed package after reload.

## Tasks

- [x] AC-1: Job-backed operations and tool registration in the new package
  - Outcome: `pi-contained-shell` package with job-backed `bash`/`powershell` operations and registration satisfying AC-1..AC-6, with unit and Windows integration tests
  - Known entrypoints and skill paths: pi-packages/pi-core/src/windows-job/client.ts; pi-packages/pi-core/README.md; pi-packages/pi-antigravity-bridge/src/owned-process.ts; pi-packages/pi-antigravity-bridge/tests/helpers/warm-job-launcher.ts; installed @earendil-works/pi-coding-agent dist/core/tools/{bash,powershell}.js, dist/core/tools/bash.d.ts, dist/utils/shell.js; pi-packages/pi-todo (package template); tdd and vitest skills
  - Inputs: Exploration, Decisions, reproduction commands in Exploration
  - Dependencies: none
  - Output: new package source and tests
  - Owner: thoth-worker
  - Writes: pi-packages/pi-contained-shell/**
  - Interface boundaries: SDK BashOperations contract and error strings; pi-core launchInJob public API (no pi-core changes unless a minimal exported addition is unavoidable, reported first)
  - Focused check and PASS evidence: package typecheck and vitest pass, including Windows integration tests showing no surviving marker process after timeout/abort/normal exit
  - Return milestone: package tests green
  - Stop / reassessment: pi-core API change needed, SDK factories not exported, or renderer/registration conflict
- [x] AC-2: Abort semantics covered by AC-1 unit
  - Outcome: abort during launch and during execution terminates the job and rejects `aborted`
  - Known entrypoints and skill paths: same as AC-1 unit
  - Inputs: AC-1 unit
  - Dependencies: AC-1 unit (same writer, same session)
  - Output: tests in the package
  - Owner: thoth-worker
  - Writes: pi-packages/pi-contained-shell/**
  - Interface boundaries: SDK abort contract
  - Focused check and PASS evidence: abort tests pass
  - Return milestone: with AC-1 unit
  - Stop / reassessment: as AC-1 unit
- [x] AC-3: Normal-exit drain and leftover termination
  - Outcome: after leader exit the job is terminated, output fully drained before resolve, exit codes preserved
  - Known entrypoints and skill paths: same as AC-1 unit
  - Inputs: AC-1 unit
  - Dependencies: AC-1 unit (same writer, same session)
  - Output: implementation and tests in the package
  - Owner: thoth-worker
  - Writes: pi-packages/pi-contained-shell/**
  - Interface boundaries: SDK onData/exitCode contract; launcher `exited` is leader-only
  - Focused check and PASS evidence: tests show trailing output delivered, nonzero exit code mapped, background child (`sleep N &`) gone after return
  - Return milestone: with AC-1 unit
  - Stop / reassessment: as AC-1 unit
- [x] AC-4: PowerShell parity
  - Outcome: job-backed `powershell` keeps UTF-8 prefix, shell resolution and arguments; Git Bash launched from it is contained
  - Known entrypoints and skill paths: installed dist/core/tools/powershell.js, dist/utils/shell.js
  - Inputs: AC-1 unit
  - Dependencies: AC-1 unit (same writer, same session)
  - Output: implementation and tests in the package
  - Owner: thoth-worker
  - Writes: pi-packages/pi-contained-shell/**
  - Interface boundaries: SDK PowerShell definition
  - Focused check and PASS evidence: test pins prefix/args; Windows integration shows no surviving marker after timeout of `bash.exe -c 'sleep N | head -1'` from powershell
  - Return milestone: with AC-1 unit
  - Stop / reassessment: as AC-1 unit
- [x] AC-5: Launcher-unavailable fallback
  - Outcome: launcher-unavailable falls back to SDK default operations with one warning per session
  - Known entrypoints and skill paths: pi-packages/pi-antigravity-bridge/src/owned-process.ts (fallback precedent); pi-core client JobLauncherUnavailable
  - Inputs: AC-1 unit
  - Dependencies: AC-1 unit (same writer, same session)
  - Output: implementation and tests in the package
  - Owner: thoth-worker
  - Writes: pi-packages/pi-contained-shell/**
  - Interface boundaries: pi-core launcher error classification
  - Focused check and PASS evidence: unit test with failing fake launcher runs default ops and warns exactly once
  - Return milestone: with AC-1 unit
  - Stop / reassessment: as AC-1 unit
- [x] AC-6: Non-Windows no-op
  - Outcome: extension registers nothing outside win32
  - Known entrypoints and skill paths: pi-packages/pi-contained-shell/src/index.ts
  - Inputs: AC-1 unit
  - Dependencies: AC-1 unit (same writer, same session)
  - Output: test in the package
  - Owner: thoth-worker
  - Writes: pi-packages/pi-contained-shell/**
  - Interface boundaries: Pi extension registration
  - Focused check and PASS evidence: unit test with platform stubbed to linux registers no tools
  - Return milestone: with AC-1 unit
  - Stop / reassessment: as AC-1 unit
- [x] AC-8: UI-only registry publication (final-verification FAIL repair)
  - Outcome: definition publication guarded by `ctx.hasUI`; headless containment and warm-up retained; headless non-publication regression test
  - Known entrypoints and skill paths: pi-packages/pi-contained-shell/src/index.ts:80-90; .thoth/specs/pi-ecosystem/spec.md (Thoth Pi tool definition registry); tdd skill
  - Inputs: Oracle final verification FAIL subtask_thoth-oracle_1794266712231_66ba3212 (E8)
  - Dependencies: AC-1..AC-7 units accepted
  - Output: fix and regression test in the package
  - Owner: thoth-worker
  - Writes: pi-packages/pi-contained-shell/**
  - Interface boundaries: pi-core tool definition registry; other first-party packages' hasUI guard convention
  - Focused check and PASS evidence: new headless test fails before and passes after; package vitest (all, incl. Windows integration), typecheck, check:ci, test:pi-extensions pass
  - Return milestone: package green
  - Stop / reassessment: registry convention ambiguous across packages
- [x] AC-7: Build, bundle, and installation wiring
  - Outcome: package built with launcher assets and installed/registered by thoth-agents like other first-party Pi packages; theme renderers still apply
  - Known entrypoints and skill paths: scripts/build-pi-extensions.mjs; root package.json/pnpm-workspace.yaml; Pi installer and release package lists (locate via how pi-todo or pi-background-tasks is registered)
  - Inputs: accepted AC-1 package
  - Dependencies: AC-1 unit accepted
  - Output: wiring changes and any tests updated
  - Owner: thoth-worker
  - Writes: scripts/build-pi-extensions.mjs, workspace/install/release lists and their tests
  - Interface boundaries: existing package install/release contracts
  - Focused check and PASS evidence: `pnpm run build` produces the bundle with launcher.cs/launcher.ps1 beside it; install/release list tests pass; `pnpm run check:ci` and `pnpm run typecheck` pass
  - Return milestone: build and checks green
  - Stop / reassessment: release/publishing contract requires decisions (versioning, publish targets)

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
Plan review: fresh Oracle subtask_thoth-oracle_1794264340850_96f7c994, verdict OKAY, recordSha256 3ff54080b9630777f27421897656bfb1f36db3f20be5b8b47d662764008a797d (digest match).
**Implementation**: AUTHORIZED
User selected Implement after plan-review OKAY.

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 18c69f1f8dde9ef521faced5bfe6a8b8a945a52d935d0bc421ace7ce08cfc862
Fresh Oracle subtask_thoth-oracle_1794267143700_eaa788fc; delivered thoth-gate-verdict valid, kind final-verification, mode record, recordDigest match. Prior final verification subtask_thoth-oracle_1794266712231_66ba3212 returned FAIL (UI-only registry publication), repaired as AC-8.

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS. AC-1 through AC-8, the declared delta, and affected canonical pi-ecosystem contracts are satisfied.",
  "evidence": [
    {
      "id": "E1",
      "kind": "governance",
      "locator": ".thoth/changes/pi-job-contained-shell/pi-job-contained-shell.md",
      "claim": "Independent verify gate passed; canonical source digest matches. Record-prefix SHA-256 is 18c69f1f8dde9ef521faced5bfe6a8b8a945a52d935d0bc421ace7ce08cfc862.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E2",
      "kind": "implementation-review",
      "locator": "pi-packages/pi-contained-shell/src/{job-operations,index}.ts",
      "claim": "Reviewed SDK error compatibility, pending-launch cancellation, termination before drain/return, exit-code preservation, PowerShell parity, classified fallback, session-scoped warning, non-Windows no-op, UI-only publication and shutdown withdrawal.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E3",
      "kind": "execution",
      "locator": "pnpm --filter @thoth-agents/pi-contained-shell run typecheck; run test",
      "claim": "Typecheck passed and all 22 tests passed, including six Windows integration cases covering pipeline/nested/PowerShell timeouts, both tools' aborts, normal-exit descendant cleanup and final output.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E4",
      "kind": "execution",
      "locator": "pnpm run build; pnpm run test:pi-extensions",
      "claim": "Build passed; contained-shell bundle has adjacent launcher.cs and launcher.ps1. All 15 bundle tests passed, including isolated packed-package activation and bash/powershell theme renderer resolution.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E5",
      "kind": "execution",
      "locator": "pi-packages/pi-core/src/windows-job/client-isolation.test.ts",
      "claim": "Both consumer-isolation tests passed, including helper failure/recovery isolation. New bundle uses its own adjacent launcher location, matching the asset-location isolation mechanism.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E6",
      "kind": "execution",
      "locator": "pnpm run check:ci; pnpm run typecheck",
      "claim": "Both passed. Biome reported warnings but no failing errors.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E7",
      "kind": "execution",
      "locator": "src/cli/{install,pi-install,operations/pi}.test.ts; src/harness/release-pi.test.ts",
      "claim": "All four files and 321 tests passed on unchanged-input rerun. Initial concurrent run passed 320 tests and failed one codemode-default assertion.",
      "basis": "observed",
      "uncertainty": "Initial failure did not reproduce; its cause is unconfirmed."
    },
    {
      "id": "E8",
      "kind": "scope-and-freshness",
      "locator": "git diff; git status --short; before/after input hashes",
      "claim": "Reviewed all changed surfaces; no unrelated or secret changes found. All 27 changed/untracked files retained aggregate SHA-256 e91ecf471af3c836c974e1ce1ab56d7aa1fe6e255a7d15a4902f4b016d6ad520 across validation; git diff --check passed.",
      "basis": "observed",
      "uncertainty": ""
    }
  ],
  "verification": [
    {
      "check": "AC-1: Windows timeout containment",
      "method": "Source review and executed Windows pipeline/nested integration reproductions",
      "outcome": "pass",
      "evidenceIds": ["E2", "E3"],
      "reason": "Exact timeout outcomes and empty marker-process queries passed."
    },
    {
      "check": "AC-2: Abort and pending-launch cancellation",
      "method": "Unit and Windows integration tests",
      "outcome": "pass",
      "evidenceIds": ["E2", "E3"],
      "reason": "Both shells terminate descendants; pending launches retain late cleanup ownership without fallback or stdin delivery."
    },
    {
      "check": "AC-3: Completion, drain and exit codes",
      "method": "Control-flow review, delayed-drain unit test and Windows normal-exit reproduction",
      "outcome": "pass",
      "evidenceIds": ["E2", "E3"],
      "reason": "Termination and both-stream drain precede return; trailing output and nonzero exit codes are preserved."
    },
    {
      "check": "AC-4: PowerShell parity",
      "method": "Comparison with installed SDK plus argument, UTF-8 and containment tests",
      "outcome": "pass",
      "evidenceIds": ["E2", "E3"],
      "reason": "Public resolver, arguments and UTF-8 prefix match; nested Git Bash is contained."
    },
    {
      "check": "AC-5: Launcher fallback",
      "method": "Fallback classification, deadline and session-warning tests",
      "outcome": "pass",
      "evidenceIds": ["E2", "E3"],
      "reason": "Only launcher unavailability falls back; remaining timeout and original timeout error are retained; warning is once per session."
    },
    {
      "check": "AC-6: Non-Windows no-op",
      "method": "Platform-stubbed regression test and entrypoint review",
      "outcome": "pass",
      "evidenceIds": ["E2", "E3"],
      "reason": "Non-Windows registers neither tools nor lifecycle handlers."
    },
    {
      "check": "AC-7: Packaging, installation, release and theme compatibility",
      "method": "Build, packed-bundle tests, installer/release tests and wiring review",
      "outcome": "pass",
      "evidenceIds": ["E4", "E7"],
      "reason": "Package registration, release discovery, runtime assets and both theme renderers passed."
    },
    {
      "check": "AC-8: UI-only definition publication",
      "method": "Guard review and executed UI/headless lifecycle regressions",
      "outcome": "pass",
      "evidenceIds": ["E2", "E3"],
      "reason": "Headless sessions retain registration and warm-up without publishing; UI publications withdraw on shutdown."
    },
    {
      "check": "Declared delta and affected canonical requirements",
      "method": "Canonical baseline comparison, registry/bundling review and consumer-isolation tests",
      "outcome": "pass",
      "evidenceIds": ["E1", "E2", "E4", "E5"],
      "reason": "The new shell-consumer requirement is distinct from existing delegation containment requirements; affected registry, rendering, bundling and helper-isolation contracts remain satisfied."
    },
    {
      "check": "Repository closeout checks and scope integrity",
      "method": "Requested static checks, build, diff review and input-hash comparison",
      "outcome": "pass",
      "evidenceIds": ["E4", "E6", "E8"],
      "reason": "Required checks passed with unchanged reviewed inputs and no generated source drift."
    }
  ],
  "risks": [
    {
      "description": "One installer assertion failed during the initial concurrent run, then all 321 installer/release tests passed unchanged. The transient failure's cause remains unconfirmed.",
      "severity": "low",
      "blocking": false,
      "evidenceIds": ["E7"]
    }
  ],
  "openQuestions": [],
  "nextAction": "Root: record PASS and acceptance evidence, run closeout, then archive.",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/pi-job-contained-shell/pi-job-contained-shell.md",
    "reviewedRecordSha256": "18c69f1f8dde9ef521faced5bfe6a8b8a945a52d935d0bc421ace7ce08cfc862"
  }
}
```

After PASS, root pastes the Oracle's unchanged final-verification envelope here.

- AC-1: PASS | Windows pipeline/nested bash timeout integration tests | Oracle E2,E3: exact timeout errors, no surviving marker processes
- AC-2: PASS | abort integration + pending-launch unit tests | Oracle E2,E3: both tools report aborted, descendants and late jobs cleaned
- AC-3: PASS | delayed-drain unit + normal-exit Windows integration | Oracle E2,E3: leftovers terminated, output drained before return, exit codes kept
- AC-4: PASS | SDK comparison, arg/UTF-8 pinning, PowerShell-launched bash integration | Oracle E2,E3
- AC-5: PASS | launcher-failure fallback and session-warning tests | Oracle E2,E3: one warning per session, timeout preserved
- AC-6: PASS | platform-stubbed linux test | Oracle E2,E3: no registrations off win32
- AC-7: PASS | build, test:pi-extensions (15), installer/release tests (321) | Oracle E4,E7: launcher assets beside bundle, theme renderers resolve
- AC-8: PASS | UI/headless lifecycle regressions | Oracle E2,E3: headless publishes nothing, UI withdraws on shutdown
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:1c8cf14474853f656dd7d4d4a7038b7068e6ed8045fcbbfebd351d7140d36835

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
Release note: installer pins npm:@thoth-agents/pi-contained-shell@>=0.1.0; the first 0.1.0 publish (manual bootstrap + trusted publisher) must precede a release. Follow-up (out of scope): command guards for Claude Code/Codex/Pi and agent instructions.
