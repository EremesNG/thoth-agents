# Change: askcodex-windows-job-containment

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: medium
**Risk**: high

## Exploration

- Shipped `@thoth-agents/pi-askcodex@1.0.0` terminates on Windows by walking every `Win32_Process` by `ParentProcessId` from the leader PID with no creation-time check, then `taskkill /PID <ids> /T /F` (`pi-packages/pi-askcodex/src/process-termination.ts`, committed version). Windows never reparents orphans, so a stale parent link plus PID reuse admits unrelated processes; the new Windows CI step `Test pi-askcodex` hung in 2 of 3 runs with the runner unresponsive to cancellation and the job log lost (consistent with the runner being killed). Locally 12/12 runs passed.
- An uncommitted rework added creation-time ancestry, FILETIME identity, monotonic deadlines and a clock-discontinuity guard. Five fresh Oracle rounds each found a narrower ownership hole; round 5 showed a wall-clock rollback before spawn can still make a stale orphan look like a descendant. Wall-clock creation times cannot prove ownership; the user chose a Job Object redesign.
- `pi-packages/pi-background-tasks` already ships proven Windows Job Object containment: a persistent PowerShell helper (`src/windows-job-helper.ps1`) compiling `src/windows-job-helper.cs` with `Add-Type`, one unnamed job per target with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` and no breakaway, `CREATE_SUSPENDED` → `AssignProcessToJobObject` → `ResumeThread`, `TerminateJobObject` plus empty-job verification, parent-death watcher, JSON-lines control protocol (`src/windows-job-client.ts`). Its targets get stdout/stderr files and `NUL` stdin, so it cannot carry askcodex JSON-RPC unchanged. Build copies `.ps1`/`.cs` assets per package (`scripts/build-pi-extensions.mjs:12-15,57-59`).
- `AppServerClient` (`pi-packages/pi-askcodex/src/app-server-client.ts:74-93,250-275`) is the only spawn/termination seam; it needs writable stdin, readable stdout/stderr, exit/close events and exit code. POSIX uses detached process groups and must stay unchanged. `pi-core` has no process code and is bundled into each package.
- External evidence (Microsoft Learn): `PROC_THREAD_ATTRIBUTE_JOB_LIST` (Windows 10+, Node 22's floor) assigns the job before the first thread runs, avoiding the suspended-orphan window; nested jobs are supported since Windows 8; without breakaway limits ordinary descendants cannot leave the job; `TerminateJobObject` affects only that job and its nested jobs; direct stdio inheritance works through `STARTUPINFOEX` with an explicit handle list. Processes created through WMI/brokers are outside job inheritance.

## Intent

On Windows, pi-askcodex launches the Codex app-server inside its own Job Object and terminates the app-server and its descendants only through that job, so termination can never select or kill a process outside the job, independent of PID reuse or clock changes. The Windows CI step for pi-askcodex completes reliably.

## Non-goals

- Migrating pi-background-tasks or pi-antigravity-bridge to the new launcher (follow-up; background-tasks keeps its own helper).
- Changing POSIX spawn or process-group termination.
- Containing processes that the app-server creates through WMI or other brokers.
- Version bumps or releases (done after closeout through the normal release flow).

## Acceptance

- AC-1: `@thoth-agents/pi-core` provides a Windows job launcher that starts a target inside a new kill-on-close Job Object assigned before its first thread runs, connects the target's stdin/stdout/stderr directly to Node streams, reports the target pid and exit code, and terminates the target tree only through the job.
- AC-2: On Windows, pi-askcodex spawns the app-server through the launcher and terminates it (abort, timeout, close) only through its job; no `Win32_Process` ancestry walk, `taskkill`, or PID-based kill of non-owned processes remains in pi-askcodex.
- AC-3: A process outside the job — including one whose stale parent PID equals the app-server PID — is never terminated, and genuine persistent descendants (including those outliving an exited leader) are terminated.
- AC-4: When the launcher is unavailable (no PowerShell, blocked compilation, assignment denied), pi-askcodex falls back to a plain spawn that terminates only the leader through its own process handle and logs a warning; it never falls back to PID or ancestry based tree kills.
- AC-5: POSIX behavior and the existing AskCodex tool contract (results, continuation, approvals, interruption) are unchanged; the package's Windows CI step completes without hangs.

## Clarifications

- Termination model: the user explicitly chose a Job Object redesign over accepting residual timestamp assumptions or leader-only termination.

## Decisions

- Build a new generic launcher in pi-core rather than extending pi-background-tasks in place, reusing its proven C#/PowerShell structure; background-tasks migration is deferred to avoid destabilizing a well-tested surface before release.
- Assign the job with `PROC_THREAD_ATTRIBUTE_JOB_LIST` at `CreateProcessW` (Windows 10+, matching Node 22's floor); no breakaway flags; `KILL_ON_JOB_CLOSE`; job handles non-inheritable and held only by the helper.
- Stdio through named pipes created by the helper with `FILE_FLAG_FIRST_PIPE_INSTANCE`, `PIPE_REJECT_REMOTE_CLIENTS`, an explicit security descriptor whose DACL grants access only to the current user's SID (not the default pipe DACL, which also grants Everyone/anonymous read), and unguessable names; Node connects as the only client before the target is created; the helper passes its pipe ends to the target through an explicit `PROC_THREAD_ATTRIBUTE_HANDLE_LIST` and closes its copies after creation. No byte proxying.
- One persistent helper per Pi process for pi-askcodex (namespaced singleton), with a parent-death watcher; helper death closes every job it owns (kill-on-close).
- Unavailable launcher falls back to leader-only termination with a warning (AC-4) instead of refusing to run.

## Durable deltas

- `MODIFIED pi-ecosystem` **AskCodex app-server delegation** — `@thoth-agents/pi-askcodex` MUST register an `AskCodex` tool, unless disabled by configuration, that delegates a task to the local Codex harness through `codex app-server` over stdio, resolving the binary from explicit configuration, then the Codex Desktop-bundled executable, then PATH with a warning; it MUST map `plan` to a read-only sandbox and `accept-edits` to workspace-write, return the final agent message, a continuation id that resumes the same Codex thread, token usage and every approval decision; it MUST answer Computer Use app elicitations by accepting allowlisted apps with session scope only, asking the user through Pi UI for other approvals when UI is available and declining them otherwise, never granting persistent approval; and it MUST interrupt the turn and terminate its own process tree on abort or timeout, except that on Windows without an available job launcher it terminates only the app-server leader as defined by AskCodex Windows job containment.
  - GIVEN Codex Desktop running, `notepad.exe` allowlisted and no Pi UI; WHEN `AskCodex` asks Codex to type text into Notepad and Codex requests Computer Use approval for Notepad and later a command approval outside the sandbox; THEN the Notepad request is accepted with session persistence, the command approval is declined, both decisions appear in the result, and the result includes the final message and a continuation id .
- `ADDED pi-ecosystem` **AskCodex Windows job containment** — On Windows `@thoth-agents/pi-askcodex` MUST launch the Codex app-server inside its own kill-on-close Job Object, assigned before the app-server's first thread runs, with its stdio connected directly to Pi, and MUST terminate the app-server and its descendants only through that job; when the job launcher is unavailable it MUST terminate only the leader through its own process handle and warn, and it MUST never terminate a process selected by PID, parent PID or creation time.
  - GIVEN a Windows Pi session where AskCodex runs an app-server that spawned a persistent descendant and an unrelated process exists whose stale parent PID equals the app-server PID; WHEN the AskCodex call times out; THEN the app-server and its descendant are terminated through the job and the unrelated process keeps running .

## Plan

Units, in dependency order:

1. **pi-core Windows job launcher** (`pi-packages/pi-core/src/windows-job/` with `launcher.cs`, `launcher.ps1`, `client.ts`, `index.ts`, tests). C#: `CreateJobObjectW` + `SetInformationJobObject(ExtendedLimitInformation, KILL_ON_JOB_CLOSE)`; per launch create three named-pipe servers (`\\.\pipe\thoth-job-<128-bit hex>-{stdin,stdout,stderr}`, first instance, reject remote, explicit current-user-only DACL), reply with names, wait for Node to connect each (bounded), then `CreateProcessW` with `EXTENDED_STARTUPINFO_PRESENT`, `STARTF_USESTDHANDLES`, `CREATE_NO_WINDOW | CREATE_UNICODE_ENVIRONMENT`, attribute list with `JOB_LIST` and `HANDLE_LIST` (only the three pipe ends), explicit cwd/env/command line (proper argv quoting); close its pipe copies; report pid; background wait reports exit code. Ops: `launch`, `terminate` (`TerminateJobObject` then wait for empty job, bounded), `release`. PowerShell host and parent-death watcher modeled on background-tasks. TS client: discovers `powershell.exe`, starts the helper from the asset beside the bundle, exposes `launchInJob({file,args,cwd,env}) → { pid, stdin, stdout, stderr, exited: Promise<{code}>, terminate(timeoutMs), release() }`, throws a typed `JobLauncherUnavailable` on helper/compile/assignment failure. Packaging: add the `.cs`/`.ps1` assets to pi-core's `files` whitelist; consumers bundle the TS and copy the two assets into their own `dist` (unit 2 adds the pi-askcodex asset entries `../pi-core/src/windows-job/launcher.{cs,ps1}` in `scripts/build-pi-extensions.mjs` and asserts their presence in `scripts/pi-extension-bundles.test.mjs`); the client resolves assets beside the running bundle. Tests: unit tests for argv quoting and protocol parsing (all platforms); Windows integration tests for round-trip stdio, exit code, descendant killed by terminate, out-of-job process untouched, helper death kills job, Node streams end on target exit.
2. **pi-askcodex integration** (`pi-packages/pi-askcodex/src/app-server-client.ts`, `src/process-termination.ts`, tests, `scripts/build-pi-extensions.mjs` asset entries for pi-askcodex, the pi-askcodex asset assertion in `scripts/pi-extension-bundles.test.mjs`, `CHANGELOG.md`, README troubleshooting). Introduce a minimal process facade used by `AppServerClient`; Windows uses `launchInJob` with fallback to `spawn` + leader-only `child.kill()` + warning on `JobLauncherUnavailable`; POSIX path unchanged. Delete the CIM snapshot/ancestry/timestamp code and their tests; keep the guarded test cleanup and bounded readiness waits. Update persistent-descendant and inherited-pipe tests to observe job termination; add the stale-parent foreign-process regression on Windows; add fallback tests.
3. **Docs** fold into units 1–2: pi-core and pi-askcodex CHANGELOG `[Unreleased]`, `docs/agent/harness-packaging.md` asset note if needed.

Mutable surfaces: unit 1 owns `pi-packages/pi-core/**` (new module, exports, CHANGELOG); unit 2 owns `pi-packages/pi-askcodex/**`, the pi-askcodex entry in `scripts/build-pi-extensions.mjs` and its asset assertion in `scripts/pi-extension-bundles.test.mjs`. `.github/workflows/ci.yml` keeps the already-made `timeout-minutes: 45` on `pi-packages-windows`.

Verification seams: `pnpm --filter @thoth-agents/pi-core run typecheck|test`, `pnpm --filter @thoth-agents/pi-askcodex run typecheck|test` (Windows locally, repeated), `pnpm run build:pi-extensions && pnpm run test:pi-extensions` (assets present in `pi-packages/pi-askcodex/dist`), `pnpm run check:ci`, `pnpm run typecheck`, all run locally on Windows before final verification. The GitHub CI run on the pushed commit is the post-closeout release gate (exact full SHA), not a record dependency.

Risks: Add-Type cold start (seconds, once per Pi process) adds latency to the first AskCodex call; named-pipe connection ordering and handle-list correctness are runtime-sensitive; Constrained Language Mode or AV may block the helper (covered by fallback); exit code is reported by the helper, not by a Node handle.

## Tasks

- [x] AC-1: pi-core Windows job launcher with direct stdio pipes, JOB_LIST assignment, exit codes and job-only termination
  - Outcome: reusable launcher module and tests in pi-core
  - Known entrypoints and skill paths: pi-packages/pi-background-tasks/src/windows-job-helper.cs, windows-job-helper.ps1, windows-job-client.ts (reference only); pi-packages/pi-core/package.json; scripts/build-pi-extensions.mjs; skills tdd
  - Inputs: Exploration, Decisions and Plan unit 1 of this record
  - Dependencies: none
  - Output: pi-packages/pi-core/src/windows-job/** exported from pi-core, CHANGELOG entry, passing tests
  - Owner: thoth-worker
  - Writes: pi-packages/pi-core/**
  - Interface boundaries: launchInJob API and JobLauncherUnavailable consumed by pi-askcodex; pi-background-tasks untouched
  - Focused check and PASS evidence: pi-core typecheck and tests pass on Windows including real-job integration tests (stdio round trip, exit code, descendant killed, out-of-job process alive, helper death kills job)
  - Return milestone: launcher API stable and tests green
  - Stop / reassessment: named-pipe or JOB_LIST behavior not achievable from PowerShell 5.1, or API needs pi-askcodex changes beyond the facade
- [x] AC-2: pi-askcodex launches and terminates the app-server through the job on Windows
  - Outcome: AppServerClient Windows path uses launchInJob; CIM/taskkill termination removed
  - Known entrypoints and skill paths: pi-packages/pi-askcodex/src/app-server-client.ts, src/process-termination.ts, tests/**, tests/fixtures/fake-app-server.mjs, scripts/build-pi-extensions.mjs; skills tdd, simplify
  - Inputs: accepted AC-1 launcher API
  - Dependencies: AC-1 unit accepted
  - Output: updated source, tests, build asset entry, CHANGELOG and README note
  - Owner: thoth-worker
  - Writes: pi-packages/pi-askcodex/**, pi-askcodex entry of scripts/build-pi-extensions.mjs, pi-askcodex asset assertion in scripts/pi-extension-bundles.test.mjs
  - Interface boundaries: AskCodex tool contract unchanged; POSIX path unchanged
  - Focused check and PASS evidence: pi-askcodex typecheck and tests pass on Windows three consecutive runs; build:pi-extensions + test:pi-extensions pass with assets in dist
  - Return milestone: integration complete with green checks
  - Stop / reassessment: launcher API gap or contract change required
- [x] AC-3: stale-parent foreign process never terminated; persistent descendants terminated
  - Outcome: Windows regression tests proving AC-3 through the real job path
  - Known entrypoints and skill paths: pi-packages/pi-askcodex/tests/**, pi-packages/pi-core/src/windows-job/**
  - Inputs: AC-1 and AC-2 units
  - Dependencies: AC-2 unit
  - Output: passing regression tests
  - Owner: thoth-worker (same unit as AC-2)
  - Writes: pi-packages/pi-askcodex/tests/**
  - Interface boundaries: none
  - Focused check and PASS evidence: tests show foreign process alive and descendants gone after timeout/abort/close
  - Return milestone: with AC-2
  - Stop / reassessment: cannot construct a stale-parent foreign process deterministically
- [x] AC-4: fallback to leader-only termination with a warning when the launcher is unavailable
  - Outcome: fallback path and tests
  - Known entrypoints and skill paths: pi-packages/pi-askcodex/src/app-server-client.ts
  - Inputs: JobLauncherUnavailable from AC-1
  - Dependencies: AC-2 unit
  - Output: fallback code and tests
  - Owner: thoth-worker (same unit as AC-2)
  - Writes: pi-packages/pi-askcodex/**
  - Interface boundaries: logger warning event
  - Focused check and PASS evidence: test with injected unavailable launcher kills only the leader and logs a warning
  - Return milestone: with AC-2
  - Stop / reassessment: none
- [x] AC-5: POSIX and tool contract unchanged; local closeout green on Windows
  - Outcome: green local closeout covering the Windows CI step commands
  - Known entrypoints and skill paths: .github/workflows/ci.yml (pi-packages-windows steps for pi-core and pi-askcodex)
  - Inputs: completed AC-1 and AC-2 units
  - Dependencies: AC-1 and AC-2 units accepted
  - Output: recorded local check results
  - Owner: root
  - Writes: none
  - Interface boundaries: none
  - Focused check and PASS evidence: pnpm run check:ci, pnpm run typecheck, pnpm run build:pi-extensions and test:pi-extensions, and the exact pi-core and pi-askcodex Windows CI test commands (`run test --retry=2`) pass locally, the pi-askcodex one three consecutive times; existing POSIX-path tests unchanged and green
  - Return milestone: before the verify gate
  - Stop / reassessment: unrelated environment failures are reported with evidence

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 6c962b7d3fcf11dde260d3687ee22e2cbce79f3ab23e099790ca584314bbbb92

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS. The round-1 blocker is resolved: helper death and cleanup failures preserve structured results, warnings and independent context deletion. Containment remains job-only; no blocking regressions found.",
  "evidence": [
    {
      "id": "E1",
      "kind": "record-binding",
      "locator": ".thoth/changes/askcodex-windows-job-containment/askcodex-windows-job-containment.md",
      "claim": "Independently recomputed the exact UTF-8 prefix hash as 6c962b7d3fcf11dde260d3687ee22e2cbce79f3ab23e099790ca584314bbbb92. The verify validator passes and the canonical spec baseline matches its recorded digest.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E2",
      "kind": "containment-review",
      "locator": "pi-packages/pi-core/src/windows-job/launcher.cs:70-170",
      "claim": "Unnamed kill-on-close jobs, JOB_LIST assignment during CreateProcessW, explicit stdio handle inheritance and current-user pipe DACL remain intact. Termination uses TerminateJobObject and empty-job verification; release rejects nonempty jobs.",
      "basis": "observed",
      "uncertainty": "Exact stale-parent PID reuse was not constructed; independence from PID ancestry follows from job-only selection."
    },
    {
      "id": "E3",
      "kind": "blocker-resolution",
      "locator": "pi-packages/pi-askcodex/src/app-server-client.ts:115-119,362-382; pi-packages/pi-askcodex/src/ask-tool.ts:299-305,453-468",
      "claim": "Terminate/release failures become termination warnings instead of escaping close. AskCodex forwards warnings into structured results, catches close failures and independently attempts scratch-context deletion. A live nonempty job cannot be released silently; cleanup failure is warned, without PID-kill fallback.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E4",
      "kind": "windows-execution",
      "locator": "pnpm --filter @thoth-agents/pi-core run test; pnpm --filter @thoth-agents/pi-askcodex run test",
      "claim": "Fresh native Windows runs passed: pi-core 1030 tests; pi-askcodex 289 tests with four POSIX-only skips. Both package typechecks passed. Coverage includes real helper death, descendant death, context deletion, injected terminate/release/close failures, foreign-process survival and fallback.",
      "basis": "observed",
      "uncertainty": "Executed locally on Node 24.21.0, not hosted CI's Node 22.19."
    },
    {
      "id": "E5",
      "kind": "packaging-validation",
      "locator": "scripts/build-pi-extensions.mjs; scripts/pi-extension-bundles.test.mjs; pi-packages/pi-core/package.json",
      "claim": "Read-only in-memory build comparison confirms the existing AskCodex bundle and copied launcher assets match current sources. test:pi-extensions passed all 13 checks, including packed assets and offline activation. check:ci exited successfully with warnings and informational diagnostics.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E6",
      "kind": "regression-review",
      "locator": "pi-packages/pi-askcodex/src/app-server-client.ts:101-137,216-241; pi-packages/pi-askcodex/src/process-termination.ts",
      "claim": "Windows uses the job launcher, with typed-unavailability fallback restricted to its own ChildProcess handle and an explicit warning. Production ancestry enumeration and taskkill are removed. Existing POSIX process-group termination remains unchanged.",
      "basis": "observed",
      "uncertainty": "POSIX runtime execution was unavailable on this Windows host."
    },
    {
      "id": "E7",
      "kind": "determinism-review",
      "locator": "pi-packages/pi-askcodex/tests/ask-tool.test.ts:578-682,786-875; pi-packages/pi-askcodex/vitest.config.ts:6-9; .github/workflows/ci.yml:138",
      "claim": "Abort tests now wait for fixture readiness; timing budgets accommodate slower startup. Real helper-death coverage passed. Launcher operations remain bounded and the Windows CI job has a 45-minute ceiling.",
      "basis": "observed",
      "uncertainty": "Deadline increases reduce timing sensitivity but cannot establish hosted-run reliability without a hosted run."
    },
    {
      "id": "E8",
      "kind": "freshness",
      "locator": "git diff and untracked pi-packages/pi-core/src/windows-job/**",
      "claim": "Reviewed the actual tracked diff and all six untracked launcher files. Implementation-input aggregate hash remained 90c292758479f43011390cbf4f29eb7534281db2df807aceb9eee2b823e319a5 across validation; record and baseline hashes also remained unchanged.",
      "basis": "observed",
      "uncertainty": ""
    }
  ],
  "verification": [
    {
      "check": "AC-1",
      "method": "Launcher source review, package typecheck and real Windows integration tests.",
      "outcome": "pass",
      "evidenceIds": ["E2", "E4", "E5"],
      "reason": "Pre-execution job assignment, direct stdio, exit reporting and job-only termination are preserved."
    },
    {
      "check": "AC-2",
      "method": "Inspect Windows routing and production termination calls.",
      "outcome": "pass",
      "evidenceIds": ["E3", "E6"],
      "reason": "Job termination remains the normal Windows path; no ancestry or PID-tree fallback remains."
    },
    {
      "check": "AC-3",
      "method": "Real descendant/foreign-process tests plus ownership-invariant review.",
      "outcome": "pass",
      "evidenceIds": ["E2", "E4"],
      "reason": "Persistent descendants are terminated and outsiders survive; stale ancestry cannot affect job membership."
    },
    {
      "check": "AC-4",
      "method": "Fallback tests and typed-error/ChildProcess-handle review.",
      "outcome": "pass",
      "evidenceIds": ["E4", "E6"],
      "reason": "Unavailable containment warns and falls back only to leader-handle termination."
    },
    {
      "check": "AC-5 and round-1 blocker",
      "method": "Fresh Windows suites, cleanup regressions, POSIX diff review and test-deadline review.",
      "outcome": "pass",
      "evidenceIds": ["E3", "E4", "E6", "E7"],
      "reason": "Structured results and context cleanup survive helper/cleanup failures; existing tool tests pass and POSIX termination is preserved."
    },
    {
      "check": "Both durable deltas, packaging and review freshness",
      "method": "Canonical baseline comparison, verify validator, bundle comparison, package smoke tests and repeated input hashing.",
      "outcome": "pass",
      "evidenceIds": ["E1", "E2", "E4", "E5", "E8"],
      "reason": "Declared contracts are supported by current implementation and fresh evidence bound to the assigned record."
    },
    {
      "check": "Hosted Windows CI release qualification",
      "method": "Post-closeout hosted run on the exact pushed commit.",
      "outcome": "not-run",
      "evidenceIds": ["E7"],
      "reason": "Explicitly deferred release gate; local success does not substitute for hosted qualification."
    }
  ],
  "risks": [
    {
      "description": "Hosted Windows/Node 22.19 reliability remains unqualified. Retain the exact-commit hosted CI release gate despite improved readiness checks and deadlines.",
      "severity": "medium",
      "blocking": false,
      "evidenceIds": ["E4", "E7"]
    }
  ],
  "openQuestions": [],
  "nextAction": "Validate this unchanged envelope, record acceptance evidence, complete closeout, and require hosted Windows CI success on the exact release commit.",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/askcodex-windows-job-containment/askcodex-windows-job-containment.md",
    "reviewedRecordSha256": "6c962b7d3fcf11dde260d3687ee22e2cbce79f3ab23e099790ca584314bbbb92"
  }
}
```

Final Oracle round 1 FAILED (helper-death cleanup escaped structured results); fixed and round 2 PASSED. Hosted exact-SHA CI remains the post-closeout release gate.

- AC-1: PASS | pi-core typecheck + tests (Windows real-job integration) | 1030/1030 passed x3; Oracle E2/E4/E5
- AC-2: PASS | pi-askcodex tests + rg Win32_Process|taskkill in src | 289 passed/4 POSIX-skipped x3; no matches; Oracle E3/E6
- AC-3: PASS | real descendant and out-of-job survivor tests | descendants terminated, outsider alive; Oracle E2/E4
- AC-4: PASS | injected JobLauncherUnavailable fallback test | leader-only kill + warning; Oracle E4/E6
- AC-5: PASS | check:ci, typecheck, build:pi-extensions + test:pi-extensions, CI test commands --retry=2 | all exit 0; askcodex 3 consecutive runs; Oracle E5/E7
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:2cba392621770651353f3d86b099af1417d98bbb345c04fac3d5447455bbc48a

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
