# Change: pi-bg-shell-selection

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: medium
**Risk**: medium

## Exploration

- `pi-packages/pi-background-tasks` runs Windows command strings only in validated PowerShell Core 7+ (`src/process.ts:11-15,299-304`, `src/powershell.ts:11-33`); POSIX uses `PI_BETTER_BACKGROUND_TASKS_SHELL` or `/bin/bash -lc`; boolean `shell:false` runs `argv` directly. No bash on Windows, no Windows PowerShell 5.1.
- Git Bash was removed in commit `7306e4d` after MSYS argument conversion mangled escaped backslashes (`.thoth/changes/archive/2026-10-01-pi-background-tasks-fork/`).
- Observed incident (2026-10-06): the model wrote bash syntax (`$(curl ...)`, `if [ ... ]`, `pgrep`) in `bg_task_watch`/`bg_task_spawn`; PowerShell failed to parse it, and the parse error was mojibake (`despu�s`) because parsing fails before the wrapper sets UTF-8 output encoding. Spawns reported `running` and failed later in logs.
- Pi's own `bash` tool resolves `shellPath` setting → Git Bash under Program Files → `bash.exe` on PATH → error (`@earendil-works/pi-coding-agent` `dist/utils/shell.js` `getShellConfig`); Pi on Windows therefore already requires bash. PowerShell 7 is not installed by default on Windows; `powershell.exe` 5.1 is.
- External survey (five Pi background-task extensions: 1aboveio upstream, pifydev, casualjim, kendex, ByteTrue): all run Bash-compatible shells; three reuse Pi `getShellConfig`, ByteTrue also honors Pi `shellPath`; none offers a per-call shell selector or syntax-mismatch detection; our Job Object containment is stronger than all of them.
- Canonical contract: `.thoth/specs/multi-harness-agent-pack/spec.md` requirement "Own session-scoped Pi background shell jobs" says "MUST run Windows command jobs in PowerShell 7".

## Intent

Background command jobs run in the shell the agent explicitly declares, the agent always knows which shells are available before writing a command, and a requested shell that is unavailable fails immediately with an actionable message instead of silently running in another shell. Default is the same bash Pi's `bash` tool uses.

## Non-goals

- No per-call arbitrary executable path for command strings (use `shell:"none"` + `argv`).
- No syntax-mismatch heuristics or automatic command translation.
- No change to Job Object containment, session ownership, reload survival or teardown semantics.
- No `cmd.exe` or WSL support; no MSYS path-conversion suppression for bash command strings (behavior matches Pi's `bash` tool).
- No package version bump.

## Acceptance

- AC-1: `bg_task_spawn`/`bg_task_watch` (and the `bg_task` action wrapper) accept `shell: "bash" | "powershell" | "none"`, default `"bash"`; the boolean form is removed and `"none"` runs `argv` directly as `shell:false` did.
- AC-2: `"bash"` resolves exactly like Pi's `bash` tool, including the Pi `shellPath` setting (Windows: setting → Git Bash Program Files → `bash.exe` on PATH; POSIX: setting/override → `/bin/bash` → PATH bash); `"powershell"` resolves `pwsh` 7+ first, then Windows PowerShell 5.1 on Windows (POSIX: `pwsh` only).
- AC-3: When the requested shell is unavailable, the call fails before launching any process, with a message naming the missing shell, the available shells (with PowerShell edition/version), and how to rewrite (`shell:"powershell"` + PowerShell syntax, or `shell:"bash"`); no silent fallback to another shell ever occurs.
- AC-4: Tool descriptions/parameter docs state the detected shells at registration (e.g. bash path; PowerShell edition and version, noting 5.1 lacks `&&`/`||`), and every spawn/watch result reports the shell actually used.
- AC-5: Windows jobs of every shell still run inside Job Objects assigned before the job runs, with unchanged session/reload/teardown behavior; PowerShell parse errors and output are UTF-8 (no mojibake).
- AC-6: Package docs (`README.md`, `docs/usage.md`, `PRODUCT.md` where relevant) and the canonical spec delta describe the new contract.

## Clarifications

- User (2026-10-06): keep Pi's bash search, Job Object and argv mode; PowerShell compatibility is valuable with `pwsh` priority; the agent must never be blind to which shell runs its command.
- User selected the enum design `shell: bash | powershell | none` with no silent fallback (explicit answer).

## Decisions

- D1: Default `shell` is `"bash"`. Unavailable requested shell → immediate error, never fallback.
- D2: Bash resolution reuses Pi's public SDK exports (`getShellConfig`, `SettingsManager.getShellPath()`, both public in installed Pi 1.0.2 per plan review), passing the Pi `shellPath` setting. Results that are not a real bash (POSIX `sh` fallback) or are WSL bash (`System32`/`Sysnative` `bash.exe`) are treated as bash unavailable, never substituted.
- D3: `PI_BETTER_BACKGROUND_TASKS_SHELL` remains a POSIX bash override only if it does not conflict with Pi resolution order; `PI_BACKGROUND_TASKS_PWSH` remains the PowerShell override and may now point to Windows PowerShell 5.1 or pwsh.
- D4: PowerShell receives the user command through a wrapper that sets UTF-8 encoding first and then parses the command inside `try` (e.g. `[ScriptBlock]::Create` from an encoded payload), so parse errors are reported in UTF-8 with the wrapper's exit semantics.
- D5: Shell detection runs once at extension registration for the description and is re-validated at launch (installation may change).
- D7: Windows Job Object containment must not depend on PowerShell 7: the containment helper (`src/windows-job-client.ts`, `src/windows-job-helper.ps1`) runs on whichever validated PowerShell is present (pwsh 7+ preferred, else Windows PowerShell 5.1), with 5.1-compatible syntax (no `ConvertFrom-Json -AsHashtable`). Containment semantics are unchanged. A host with no PowerShell at all is out of scope (Windows always ships 5.1).
- D8: Persisted task metadata is normalized at load in the registry loader (`src/registry.ts`), before metadata is returned or cached: legacy boolean `shell:false` → `"none"`; legacy `shell:true` (or absent) → `"powershell"` on Windows and `"bash"` on POSIX, preserving the shell a legacy job was written for across reload. New tool calls accept only the enum.
- D9: Git Bash jobs on Windows reuse the historical logging workaround (reopen stdout/stderr inside the shell, as in `7306e4d^:src/windows-process.ts:11-14`) because MSYS cannot use native append-only handles; tests assert real spawn/watch output.
- D6: Points "thread-view active tool label" and "stall watchdog during compaction" are separate small changes, not part of this record.

## Durable deltas

- `MODIFIED multi-harness-agent-pack` **Own session-scoped Pi background shell jobs** — The vendored `@thoth-agents/pi-background-tasks` package MUST run local shell jobs owned by their session and, on Windows, inside Job Objects assigned before the job runs, MUST keep a session's running jobs across that session's same-process reload, MUST on Windows stop every running job of the session, including in-flight watch commands, on any other session shutdown, subagent teardown or Pi process exit including a crash, MUST on Windows terminate and verify a job's Job Object when its leader or watch command exits on its own before recording it terminal and never signal processes outside it, MUST run command jobs in the shell the caller declares (`bash` by default, resolved like Pi's bash tool; `powershell` preferring PowerShell 7 and on Windows falling back to Windows PowerShell 5.1; or `none` for direct argv), MUST fail without launching when the declared shell is unavailable and never substitute another shell, MUST disclose the available shells in its tool descriptions and the shell used in each result, and MAY handle POSIX jobs on a best-effort process-group basis with documented limits.
  - GIVEN a Windows host with Git Bash and Windows PowerShell 5.1 but no PowerShell 7; WHEN the agent spawns a bash-syntax command with the default shell, then requests `shell:"powershell"`, then a host without bash receives a default-shell request; THEN the first runs in Git Bash inside a Job Object and reports bash, the second runs in Windows PowerShell 5.1 and reports it, and the third fails before launch naming the missing bash and the available PowerShell .

## Plan

Surfaces (all in `pi-packages/pi-background-tasks`):

1. Shell resolution (`src/powershell.ts`, new or existing resolver module, `src/process.ts`): a `resolveShell(kind)` returning `{ kind, executable, args, label, edition?, version? }` or a typed unavailable error listing available shells; bash via Pi resolution (D2); PowerShell pwsh≥7 → Windows PowerShell 5.1 (Windows only) with existing validation relaxed to accept Desktop 5.1; `none` → argv direct.
2. Types/runtime migration (`src/types.ts:20,83`, `src/runtime.ts:210,300,954`): enum type, defaults, legacy normalization (D8); fixtures `src/runtime.test.ts`, `src/lifecycle.test.ts`; cross-package fixture `pi-packages/pi-subagents/test/runner/background-tasks-real-sdk.test.ts:113` (`shell:false` → `shell:"none"`).
3. Launch and containment (`src/process.ts`, `src/windows-process.ts`, `src/powershell.ts` wrapper, `src/windows-job-client.ts`, `src/windows-job-helper.ps1`), per D4, D7, D9: command strings launch with the resolved shell inside the existing Windows Job Object path; bash uses `-lc`/`-c` consistent with Pi; PowerShell wrapper per D4 with 5.1-compatible syntax; resolution failure throws before any spawn and surfaces as a tool error (not a started-then-failed task).
4. Tool surface (`src/tools.ts` and registration): replace boolean `shell` with enum (default `bash`); descriptions built from detection (D5); result text/details include the shell used for spawn and watch; update the `bg_task` action wrapper schema.
5. Docs: `README.md`, `docs/usage.md`, `PRODUCT.md`.
6. Spec delta applied at archive (root).

Verification seams: existing `src/powershell.test.ts`, `src/powershell.integration.test.ts`, `src/process-windows.integration.test.ts`, `src/process-windows.test.ts`; new unit tests for resolution order/no-fallback/messages and descriptions; Windows integration tests for Git Bash + Job Object with real output, a fresh-host run with no usable pwsh (no warmed PowerShell-7 helper) covering bash, PowerShell 5.1 and argv jobs including teardown, UTF-8 parse error, legacy metadata reload normalization; package `typecheck` and `test`.

Risks: MSYS path conversion returns for bash command strings (accepted: same as Pi bash tool; agents can use `shell:"none"`); Windows PowerShell 5.1 syntax/encoding differences; Pi `getShellConfig` returning `sh` or WSL bash (guarded by D2); containment helper on 5.1 (D7); legacy reload metadata (D8); CI `windows-latest` has Git Bash and pwsh, so 5.1 fallback tests must force pwsh absence through overrides.

## Tasks

- [x] AC-2: Shell resolver with Pi bash resolution and pwsh→5.1 PowerShell resolution
  - Outcome: `resolveShell("bash"|"powershell"|"none")` returns the resolved launch config or a typed unavailable error listing available shells; `sh` and WSL bash results count as bash unavailable
  - Known entrypoints and skill paths: `pi-packages/pi-background-tasks/src/powershell.ts`, `src/process.ts`, public SDK exports `getShellConfig` and `SettingsManager` from `@earendil-works/pi-coding-agent`; skills `C:\Users\EremesNG\.pi\agent\skills\tdd\SKILL.md`, `C:\Users\EremesNG\.pi\agent\skills\simplify\SKILL.md`
  - Inputs: Exploration and Decisions D1-D3, D5 of this record
  - Dependencies: none
  - Output: resolver module plus unit tests
  - Owner: thoth-worker
  - Writes: `src/powershell.ts`, new `src/shell.ts`, `src/powershell.test.ts`, new `src/shell.test.ts`
  - Interface boundaries: Pi SDK public exports only; no edits outside the package
  - Focused check and PASS evidence: unit tests for resolution order, `shellPath` setting, overrides, 5.1 acceptance, sh/WSL rejection and unavailable-error content green; package typecheck green
  - Return milestone: resolver API and tests green
  - Stop / reassessment: public SDK exports behave differently from plan-review evidence
- [x] AC-1: Enum types, runtime normalization and schema replacing the boolean
  - Outcome: types, runtime defaults, persisted-metadata normalization (D8) and spawn/watch/`bg_task` schemas use `shell: bash | powershell | none` with default bash; all fixtures migrated
  - Known entrypoints and skill paths: `src/types.ts:20,83`, `src/runtime.ts:210,300,954`, `src/process.ts:24,300` (enum-aware validation/execution branch: `"none"` uses argv, `"bash"`/`"powershell"` route through the AC-2 resolver while keeping today's Windows PowerShell launch path until the launch task), `src/tools.ts`, tool registration; tdd skill above
  - Inputs: accepted resolver from the AC-2 resolver task
  - Dependencies: AC-2 resolver task
  - Output: migration plus tests, including a legacy-metadata reload regression test
  - Owner: thoth-worker
  - Writes: `src/types.ts`, `src/runtime.ts`, `src/registry.ts` (legacy normalization at load), `src/registry.test.ts`, `src/process.ts` (enum branch only), `src/tools.ts`, registration module, `src/runtime.test.ts`, `src/e2e.test.ts`, `src/lifecycle.test.ts`, `src/process.test.ts`, `src/containment.integration.test.ts`, `src/reload-handoff.test.ts`, `src/test-support/local-poll-sequence.ts`, tool tests, any other in-package boolean `shell` fixture found by a package-wide search, `pi-packages/pi-subagents/test/runner/background-tasks-real-sdk.test.ts` (only the `shell:false` fixture)
  - Interface boundaries: tool names unchanged; new calls reject boolean `shell`
  - Focused check and PASS evidence: package tool/runtime/lifecycle tests and typecheck green; `pnpm --dir pi-packages/pi-subagents test -- background-tasks-real-sdk` green
  - Return milestone: migration tests green
  - Stop / reassessment: a boolean consumer outside `pi-packages/pi-background-tasks` beyond the listed pi-subagents fixture
- [x] AC-3: Launch per declared shell inside Job Objects without a PowerShell 7 dependency
  - Outcome: spawn and watch launch the resolved shell; unavailable shell fails before any process starts; containment helper runs on pwsh 7 or Windows PowerShell 5.1; Git Bash output captured; PowerShell parse errors are UTF-8
  - Known entrypoints and skill paths: `src/process.ts`, `src/windows-process.ts`, `src/powershell.ts`, `src/windows-job-client.ts:60`, `src/windows-job-helper.ps1:4,16`, `src/runtime.ts`, historical `git show 7306e4d^:pi-packages/pi-background-tasks/src/windows-process.ts`; tdd/simplify skills above
  - Inputs: accepted resolver and enum migration
  - Dependencies: AC-1 migration task
  - Output: launch/containment changes plus tests
  - Owner: thoth-worker
  - Writes: `src/process.ts`, `src/windows-process.ts`, `src/powershell.ts`, `src/windows-job-client.ts`, `src/windows-job-helper.ps1`, `src/runtime.ts` (only failure surfacing), `src/process-windows.test.ts`, `src/process-windows.integration.test.ts`, `src/powershell.integration.test.ts`, Job Object helper tests
  - Interface boundaries: Job Object assignment order, session ownership, reload and teardown semantics unchanged
  - Focused check and PASS evidence: Windows integration tests green for Git Bash in a Job Object with real output, fresh-host no-pwsh runs (bash, PowerShell 5.1, argv, teardown) without a warmed pwsh helper, missing-bash error before spawn, UTF-8 parse error; existing teardown tests green
  - Return milestone: launch tests green on Windows
  - Stop / reassessment: Job Object semantics would need to change
- [x] AC-4: Descriptions disclose detected shells and results report shell used
  - Outcome: registration-time descriptions list detected shells with PowerShell edition/version; spawn/watch results include shell used
  - Known entrypoints and skill paths: `src/tools.ts`, registration, result formatting; tdd skill above
  - Inputs: accepted resolver, migration and launch
  - Dependencies: AC-3 launch task
  - Output: description/result changes plus tests
  - Owner: thoth-worker
  - Writes: `src/tools.ts`, registration and result formatting modules, their tests
  - Interface boundaries: result details stay backward-shaped apart from the added shell field
  - Focused check and PASS evidence: tests asserting description text per detection scenario and shell field in results green
  - Return milestone: tests green
  - Stop / reassessment: renderer in another package must change to show it
- [x] AC-5: Containment and encoding regression evidence
  - Outcome: full package test suite and typecheck green on Windows, including existing Job Object/session teardown tests
  - Known entrypoints and skill paths: `pi-packages/pi-background-tasks/package.json` scripts
  - Inputs: AC-1 to AC-4 outputs
  - Dependencies: AC-4 task
  - Output: test and typecheck evidence
  - Owner: thoth-worker
  - Writes: none
  - Interface boundaries: none
  - Focused check and PASS evidence: `pnpm --dir pi-packages/pi-background-tasks run typecheck` and `test` green
  - Return milestone: suite green
  - Stop / reassessment: any teardown regression
- [x] AC-6: Package docs describe the new shell contract
  - Outcome: README, usage and PRODUCT docs describe enum, resolution, no-fallback and overrides
  - Known entrypoints and skill paths: `pi-packages/pi-background-tasks/README.md`, `docs/usage.md`, `PRODUCT.md`
  - Inputs: accepted AC-1 to AC-4 behavior
  - Dependencies: AC-4 task
  - Output: updated docs
  - Owner: thoth-worker
  - Writes: those three files
  - Interface boundaries: none
  - Focused check and PASS evidence: docs mention every AC-1 to AC-4 behavior; no stale "PowerShell 7 only" text (grep)
  - Return milestone: docs updated
  - Stop / reassessment: none
- [x] AC-6: Durable delta reconciled with implemented behavior before final verification
  - Outcome: the `MODIFIED multi-harness-agent-pack` delta text matches the implemented behavior and the recorded source digest is current; spec sync and archive happen in Closeout via `thoth-archive` after independent PASS
  - Known entrypoints and skill paths: `.thoth/specs/multi-harness-agent-pack/spec.md`, this record's Durable deltas, `C:\DEV\Proyectos\Webstorm\thoth-agents\skills\thoth-archive\SKILL.md`
  - Inputs: accepted AC-1 to AC-5 outputs and docs
  - Dependencies: AC-5 suite task and AC-6 docs task
  - Output: reconciled delta text in this record
  - Owner: root
  - Writes: this record (Durable deltas only)
  - Interface boundaries: none
  - Focused check and PASS evidence: `validate.mjs --through ready` passes and the source sha256 equals the canonical file
  - Return milestone: before requesting final Oracle verification
  - Stop / reassessment: implemented behavior diverges from the accepted delta

## Authorization

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

Plan review: fresh Oracle round 5 returned [OKAY] on 2026-10-06 after rounds 1-4 REJECT were repaired (helper 5.1, enum ownership, registry normalization, archive ordering). Implementation: explicit user choice "Implementar" on 2026-10-06.

## Verification

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: f8f1b9cadd37da10fcde0a6b94586928ee40edbcec32e116f79ac0822a9c993a

- AC-1: PASS | schema/runtime tests | enum-only calls, bash default, direct argv via none, boolean rejection verified
- AC-2: PASS | resolver unit and Windows integration tests | Pi shellPath and arguments, sh/WSL rejection, pwsh then 5.1 resolution verified
- AC-3: PASS | unavailable-shell tests | immediate actionable errors with no launch and no cross-shell substitution
- AC-4: PASS | registration and result tests | detected shells disclosed; actual launch config in text and details.shell
- AC-5: PASS | package suite 509 passed 4 skipped plus real-Windows partial-write ENOSPC probes | verified cleanup, ownership isolation, reload survival, UTF-8 parse errors, 5.1 helper
- AC-6: PASS | docs and durable-delta review | README, usage, PRODUCT and declared delta match implementation; typecheck, check:ci errors-only, git diff --check pass
- Source: .thoth/specs/multi-harness-agent-pack/spec.md | sha256:03f6aebd393bd2744228a0dd88eab4a211e6e70f2f86b9c7df90637a35d10212

## Closeout

**Archive**: READY

Final verification: fresh read-only thoth-oracle round 3 PASS on 2026-10-06; rounds 1-2 FAIL on AC-5 converged (watch ownership before metadata write, then atomic metadata writes and cleanup via captured launch authority).

Non-blocking follow-up: `registry.ts:85` Windows rename retry blocks the event loop synchronously up to about 1s per contested write; an async retry is a reasonable later improvement.
