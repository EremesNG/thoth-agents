# Change: pi-bridges-adoption

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: medium
**Risk**: medium

## Exploration

- Pi 0.99.1 on Windows. `pi-packages/pi-subagents` runs delegated children as
  in-process SDK `AgentSession`s (`src/runner/sdk-runner.ts` `createSession`,
  `createAgentSession` ~L320). Cancel/timeout abort the task controller, which
  calls `session.abort()`; the SDK forwards the run signal to the provider's
  `streamSimple` (`pi-agent-core` `agent-loop.js:271-275`, `model-runtime.js:510-513`).
- Provider packages in use: `@estebanforge/pi-antigravity-bridge` 1.7.8 loaded
  from `C:\DEV\Proyectos\Webstorm\pi-extensions-antigravity-bridge\packages\pi-antigravity-bridge`
  (fork HEAD `64170a14d50609a2bff6b3ff41f70f03a7a562b4`, origin
  `EremesNG/pi-extensions-antigravity-bridge`, upstream `EstebanForge/pi-extensions`),
  and `pi-claude-bridge` 0.9.0 loaded from npm (source fork HEAD
  `a78a2a5525e96318f8dba7f9fd32ce2191be0136`, origin `EremesNG/pi-claude-bridge`,
  upstream `elidickinson/pi-claude-bridge`; installed npm copy differs from source).
- Live reproduction (2026-09-30, antigravity designer): explicit cancel mid-stream,
  45 s timeout mid-stream, timeout after 4 tool turns, and timeout during a running
  `Start-Sleep 120` tool all terminated `agy.exe` plus its 5-6 child MCP
  processes (`cmd.exe /c npx ...`). The reported orphaned `agy` (screenshot PID
  36120 after a designer timeout) was NOT reproduced; attribution to the designer
  was never proven (Oracle also had `AskAntigravity`).
- Confirmed gaps:
  - `AgentSession.dispose()` does not emit `session_shutdown`
    (`pi-coding-agent/dist/core/agent-session.js:968-985`); only
    `AgentSessionRuntime.dispose()` does (`agent-session-runtime.js:296-303`).
    Child sessions load extensions anew (`sdk-runner.ts:297-318`), so bridge
    `session_shutdown` cleanup never runs for children.
  - Antigravity Windows kill is `child.kill("SIGTERM")` on `agy.exe` only, without
    tree kill or exit wait (`src/driver.ts:751-779`, `src/acp/connection.ts:525-543`),
    although `agy.exe` owns a child process tree.
  - A subagent with `claude-bridge/claude-sonnet-5-5` fails in ~0.8 s:
    `No API key found for claude-bridge` (persisted in
    `~/.local/share/pi/subagents/subagents-history.sqlite`). The child gets a fresh
    `ModelRuntime` (`sdk.js:72-74`) because Pi 0.99.1 exposes no parent runtime
    on the extension context. The user-facing details omit the message
    (`src/error-metadata.ts:438-451`).
- Reference: nicobailon/pi-subagents `b6bda32` creates the child runtime with
  `ModelRuntime.create()`, flushes the child's own queued provider registrations,
  replays parent registrations from `ctx.modelRegistry`
  (`getRegisteredProviderIds/Config/NativeProvider`) skipping child-claimed IDs,
  refreshes with `allowNetwork:false`, and before `dispose()` awaits
  `session.extensionRunner.emit({type:"session_shutdown",reason:"quit"})` with a
  5 s bound.
- Repo integration of `pi-packages/pi-subagents`: no pnpm workspace entry, not in
  published `files`, not in root tsconfig/vitest, but checked by root Biome
  (`biome.json`); package keeps its own npm lockfile and tests.

## Intent

Adopt both provider bridges as copied packages under `pi-packages/`, and make
subagent children inherit parent-registered providers and release provider-owned
resources (including Windows process trees) when they end, are cancelled, or time out.

## Non-goals

- No git history import; no npm publication, version bumps, or release changes.
- No change to `~/.pi/agent/settings.json` in this change (post-merge follow-up).
- No root pnpm workspace, published-files, root tsconfig/vitest, or CI job changes.
- No `pi-agentmemory` or other antigravity monorepo siblings.
- No relaxed auth checks or fabricated credentials.
- No claim that the unreproduced orphan incident is fixed; the process-tree work is hardening.

## Acceptance

- AC-1: `pi-packages/pi-antigravity-bridge/` contains the bridge package copied
  from fork `64170a1` with a minimal standalone dev config; typecheck passes and
  the test suite has the same pass/fail set on this Windows host as the source
  monorepo (POSIX-only fixture failures recorded, not hidden).
- AC-2: `pi-packages/pi-claude-bridge/` contains the claude bridge copied from fork
  `a78a2a5`; `npm run test:unit` and its typecheck pass.
- AC-3: Root Biome excludes both bridge directories; `pnpm run check:ci` passes.
- AC-4: A child session inherits providers registered in the parent registry that
  the child did not register itself (child-owned registrations win); a real-SDK
  regression with a fixture extension that registers a keyless provider only in
  `session_start` (claude-bridge shape, `apiKey:"not-used"`) proves the child
  passes auth and streams through the inherited provider.
- AC-5: Lean isolation retains `session_shutdown` handlers only of extensions
  that queued a provider registration while loading in the child
  (`runtime.pendingProviderRegistrations[].extensionPath`), and no other lifecycle
  handlers; extensions whose provider is only inherited from the parent (for
  example claude-bridge child instances, which register in the stripped
  `session_start`) keep `session_shutdown` stripped; one centralized teardown helper, used by every disposal site
  (`sdk-runner.ts` and `event-processing.ts`), emits `session_shutdown` exactly
  once with a 5 s bound before `dispose()`, on success, failure, cancel, timeout
  and pre-aborted paths; `dispose()` always runs. A real-SDK regression with a
  separate fixture that registers its provider at load time asserts its shutdown
  handler executes, and the AC-4 `session_start`-only fixture's shutdown handler
  does not.
- AC-6: Failed-subagent details shown to the orchestrator include a sanitized,
  bounded error message.
- AC-7: Antigravity `session_shutdown` releases only resources owned by that
  session instance: a child session's shutdown never kills a driver, MCP handle,
  PID-shared MCP directory/config, provider registration, or approval hook in use
  by the parent or a sibling session; a test asserts all of these survive a
  sibling shutdown.
- AC-8: On Windows, antigravity teardown (stream-json and ACP) terminates the
  `agy` process tree (`taskkill /PID <pid> /T /F`) and awaits exit with a bound;
  POSIX behavior is unchanged; a test covers the Windows descendant case.
- AC-9: claude-bridge parent-session state and active queries are unaffected by
  child sessions: with AC-5 its child `session_shutdown` stays stripped, and any
  cached-factory shared module state touched by child load/teardown is shown safe
  or corrected with a test.
- AC-10: Antigravity POSIX-only test fixtures (extensionless shell scripts,
  `:`-joined PATH) are made portable (Node fixture scripts, `path.delimiter`)
  without weakening assertions, so the full package suite passes on this Windows host;
  real Windows product bugs revealed by those tests get minimal product fixes with
  the original assertion kept, each listed in Decisions.

## Clarifications

- Import method: copy without history (user, 2026-09-30).
- Antigravity scope: only `packages/pi-antigravity-bridge`, flat under
  `pi-packages/pi-antigravity-bridge/` with standalone dev config (user).
- Biome: exclude both bridges from root Biome (user).
- `settings.json` repoint: after merge; root provides the exact edit (user).

## Decisions

- Child provider inheritance follows the nicobailon precedence: child-registered
  providers win; parent registrations are replayed only for missing IDs, through
  public registry APIs only (no private `modelRegistry.runtime`).
- Shutdown emit bound: 5 s default, then `dispose()` in `finally`.
- Provider inheritance for children uses the parent registration (parent
  closure) when the child did not register the provider itself; claude-bridge is
  written for concurrent subagent use (`src/index.ts:1821`). Lean isolation
  keeps stripping `session_start` so root-only lifecycle injection (for example
  memory recovery) is not enabled in children. Shutdown ownership means child
  load-time provider registration (`pendingProviderRegistrations` with
  `extensionPath`); inherited-provider provenance does not grant ownership.
- Verification split: package tests run natively on this Windows host after
  AC-10 makes fixtures portable; AC-8 has native Windows descendant checks.
  Pre-merge evidence comes only from this worktree's package tests, never from
  the running Pi (which loads the main checkout).
- Live post-merge verification (claude-bridge subagent run, cancel/timeout with
  both bridges, process census) is root's follow-up after the user repoints
  settings; pre-merge acceptance relies on automated tests.
- Stale active record `.thoth/changes/pi-subagents-migration/work.yaml` (old
  format, execution not started) is superseded by the completed fork adoption and does
  not own these surfaces; left untouched.
- Copy checkpoint (root, 2026-09-30): the AC-1 copy adds dev dependency
  `@rolldown/binding-wasm32-wasi` (present in the source monorepo root; Vitest
  needs it on this host); `tsc` exit 0; Vitest 543 tests, 51 failing, a strict
  subset of the source monorepo's 53 Windows failures (two timing-sensitive
  tests passed in the copy). AC-2 `typecheck` exit 0; `test:unit` 263/266 with
  3 environmental failures (Windows `c:` ESM URL in the prompt-guard test; two
  loadConfig tests read the operator's real `~/.pi/agent/claude-bridge.json`);
  the source checkout has no installed dependencies, so no baseline run exists.
- AC-10 scope (user, 2026-09-30): real Windows product bugs revealed by
  portable tests are fixed minimally in the product, never by weakening tests;
  a fix needing redesign returns to root. Found so far: `src/engine-picker.ts:86`
  treats only `/` as a path separator, so native `\` paths are searched on PATH.
- claude-bridge test leak (root, 2026-09-30): `tests/unit-config.mjs`
  `withTempHome` overrides only `HOME`; on Windows `getAgentDir()` resolves via
  `USERPROFILE`, so unit tests overwrote the operator's real
  `~/.pi/agent/claude-bridge.json` (the two "environmental" loadConfig failures).
  Root restored the file; making the tests hermetic is added to AC-9's writer.
- Implementation checkpoint (root, 2026-09-30): pi-subagents AC-4..6 done
  (tsc 0; Vitest 34 files / 413 tests). claude-bridge AC-9 found and fixed real
  defects: child activation overwrote shared provider settings; child shutdown
  cleared every session mirror and could release the parent registration marker
  (now session-scoped, marker release factory-owned); tests made hermetic
  (HOME, agent dir, USERPROFILE); root rerun: tsc 0, unit 270/271 (remaining:
  Windows `c:` ESM URL prompt-guard test), operator config hash unchanged.
  CORRECTED by final verification round 1: the 9 flagged pi-subagents files are
  genuinely unformatted at HEAD (from earlier fork commits, e.g. `86ef7d1`), not
  a CRLF artifact; `check:ci` was already red at HEAD.
- AC-10 checkpoint (root, 2026-09-30): Windows product fixes, assertions kept:
  `src/engine-picker.ts` treats `\` as a path separator on win32;
  `src/diff-render.ts` normalizes git toplevel and uses `/` relative paths for
  `git show HEAD:`. Tests: Node fixtures via `process.execPath` spawn redirection
  (`tests/helpers/portable-spawn.ts` as Vitest setup), `path.delimiter`,
  operator-config isolation; 9 win32 skips with inline reasons (POSIX exec bits,
  POSIX BROWSER wrapper, 0600/0700 modes) plus an active Windows no-capture test.
  Vitest 536 passed / 9 skipped / 0 failed; tsc 0. POSIX run not verified here.
- Final root checks (2026-09-30, frozen inputs): pi-subagents tsc 0, Vitest
  413/413 (a first full run had 4 load-sensitive failures that passed isolated
  and on a full rerun); antigravity tsc 0, Vitest 541 passed / 9 skipped / 0
  failed after AC-7 (instance-private MCP dirs, registration entries, approval
  scripts/hooks) and AC-8 (`src/process-termination.ts`: win32 `taskkill /T /F`,
  bounded awaited exit, used by stream-json and ACP); claude-bridge tsc 0, unit
  270/271; root typecheck 0; root `pnpm test` without Orca `CODEX_HOME`:
  1139 passed / 4 failed, all `publish-marketplace.test.ts` ENOENT on sibling
  `../thoth-plugins` absent in this Orca workspace (with `CODEX_HOME` set, Codex
  install tests also fail on the Orca path); root src untouched by this change.
  Operator `claude-bridge.json` hash unchanged across all runs.
- Final verification round 1 (fresh Oracle): FAIL on AC-2, AC-3, AC-8. Repairs:
  AC-2 root fixed `tests/unit-prompt-guard.mjs` to import via `pathToFileURL`
  (unit 271/271) and restored claude-bridge `CHANGELOG.md` byte-identical to
  `a78a2a5` (non-goal: no release changes). AC-3 (user, 2026-09-30): Biome-format
  the 9 baseline pi-subagents files (format only; Vitest 413/413) and add
  `.pi/tasks/` to `.gitignore`; `pnpm run check:ci` exit 0. AC-8: ACP overflow
  termination ownership repaired: overflow, stdin/spawn errors and failed writes
  start owned bounded termination before logical exit; driver retains the promise
  before clearing the connection; regression "stdout frame overflow awaits child
  exit before outcome and close resolve" red->green.

## Durable deltas

- None.

## Plan

1. Root copies tracked files (git ls-files) from each fork at the recorded HEAD,
   excluding `.git`, `node_modules`, caches, `.test-output`, build output.
   Antigravity: package files plus a package-local dev `package.json` scripts/devDeps,
   `vitest.config.ts` (tests path adjusted) and `tsconfig.json` derived from the
   monorepo root; fix `repository.directory`. Root adds Biome exclusions. Each
   package installs with npm locally (lockfile kept) and runs its own checks.
2. Worker A (sole writer of `pi-packages/pi-subagents/`): in `sdk-runner.ts`
   create the child runtime explicitly when `ctx.modelRuntime` is absent, flush
   child queued registrations, replay missing parent registrations, refresh
   without network; in `isolateSubagentExtensions` retain `session_shutdown` only
   for extensions whose `extensionPath` appears in the child's queued provider
   registrations; replace scattered disposal with one teardown
   helper (bounded emit, then `dispose()` in `finally`) used by `sdk-runner.ts`
   and `event-processing.ts` including pre-abort; surface sanitized message in
   safe error details. Real-SDK regressions use a fixture provider extension.
   Tests in `pi-packages/pi-subagents/test/`.
3. Worker B (sole writer of `pi-packages/pi-antigravity-bridge/` after root's
   AC-1 copy is accepted): make POSIX-only fixtures portable; scope
   `session_shutdown` cleanup to session-owned resources (drivers are already
   per extension instance; PID-shared MCP directories, registrations and approval
   hooks need reference-counted or instance ownership); shared Windows tree-kill +
   bounded exit wait helper used by stream-json driver and ACP connection.
4. Worker C (sole writer of `pi-packages/pi-claude-bridge/`): verify and, if
   needed, scope `session_shutdown`/`clearSession` to the owning session.
5. Fresh Oracle final verification against this record, diff and checks.

## Tasks

- [x] AC-1: Copy antigravity bridge package with standalone dev config
  - Outcome: `pi-packages/pi-antigravity-bridge/` builds its tests standalone
  - Known entrypoints and skill paths: `C:\DEV\Proyectos\Webstorm\pi-extensions-antigravity-bridge\{package.json,tsconfig.json,vitest.config.ts,packages/pi-antigravity-bridge/**}`
  - Inputs: fork HEAD `64170a1`, user layout decision
  - Dependencies: none
  - Output: copied package + dev config + package-lock
  - Owner: root
  - Writes: `pi-packages/pi-antigravity-bridge/**`
  - Interface boundaries: Pi loads `./extensions` via package `pi` manifest; unchanged
  - Focused check and PASS evidence: `npm install && npx tsc --noEmit` exit 0; `npx vitest run` failing set equals the source monorepo's failing set on this host
  - Return milestone: typecheck green and failure parity recorded
  - Stop / reassessment: test depends on monorepo sibling or root-only fixture
- [x] AC-2: Copy claude bridge package
  - Outcome: `pi-packages/pi-claude-bridge/` passes its unit checks
  - Known entrypoints and skill paths: `C:\DEV\Proyectos\Webstorm\pi-claude-bridge\**`
  - Inputs: fork HEAD `a78a2a5`
  - Dependencies: none
  - Output: copied package with lockfile
  - Owner: root
  - Writes: `pi-packages/pi-claude-bridge/**`
  - Interface boundaries: Pi loads raw `src/index.ts`; unchanged
  - Focused check and PASS evidence: `npm install && npm run test:unit && npm run typecheck` exit 0 (no live integration tests)
  - Return milestone: checks green
  - Stop / reassessment: unit tests need operator Claude state or POSIX shell
- [x] AC-3: Exclude bridges from root Biome
  - Outcome: root `check:ci` ignores both bridge directories
  - Known entrypoints and skill paths: `biome.json`
  - Inputs: AC-1 and AC-2 directories exist
  - Dependencies: AC-1, AC-2
  - Output: Biome include/ignore entries
  - Owner: root
  - Writes: `biome.json`, `.gitignore`, 9 baseline-formatted `pi-packages/pi-subagents` files
  - Interface boundaries: pi-subagents stays Biome-checked
  - Focused check and PASS evidence: `pnpm run check:ci` exit 0
  - Return milestone: check green
  - Stop / reassessment: Biome config cannot express directory exclusion
- [x] AC-4: Child sessions inherit parent-registered providers
  - Outcome: keyless parent-registered provider usable in child, child-owned registrations win
  - Known entrypoints and skill paths: `pi-packages/pi-subagents/src/runner/sdk-runner.ts`, `pi-packages/pi-subagents/test/runner/`, tdd skill
  - Inputs: Exploration SDK evidence and nicobailon precedence decision
  - Dependencies: none
  - Output: runtime seeding code + focused test
  - Owner: worker
  - Writes: `pi-packages/pi-subagents/src/runner/**`, `pi-packages/pi-subagents/test/runner/**`
  - Interface boundaries: SDK public `ModelRuntime`/`ModelRegistry` APIs only
  - Focused check and PASS evidence: real-SDK regression with a `session_start`-registering keyless fixture fails before, passes after; package `npx vitest run` green
  - Return milestone: tests green
  - Stop / reassessment: public API cannot replay a registration
- [x] AC-5: Bounded child session_shutdown before dispose on all paths
  - Outcome: provider-owning shutdown handlers retained; exactly-once emit via one teardown helper, then dispose
  - Known entrypoints and skill paths: `pi-packages/pi-subagents/src/runner/{sdk-runner.ts,event-processing.ts}` (`isolateSubagentExtensions` ~153-166, disposal ~798-801), `pi-packages/pi-subagents/src/manager.ts`
  - Inputs: SDK `session.extensionRunner.emit`
  - Dependencies: none (same writer as AC-4, sequential)
  - Output: lifecycle code + tests for success/cancel/timeout/pre-abort
  - Owner: worker
  - Writes: `pi-packages/pi-subagents/src/**`, `pi-packages/pi-subagents/test/**`
  - Interface boundaries: manager `stopping` settlement semantics preserved
  - Focused check and PASS evidence: real-SDK regression: load-time-registering fixture's shutdown handler runs once per path; `session_start`-only fixture's shutdown and all non-owner lifecycle handlers stay stripped; full package vitest green
  - Return milestone: tests green
  - Stop / reassessment: emit hangs require manager terminalization change
- [x] AC-6: Sanitized error message in safe details
  - Outcome: orchestrator sees bounded redacted message
  - Known entrypoints and skill paths: `pi-packages/pi-subagents/src/error-metadata.ts`, `src/render/completion-message.ts`
  - Inputs: existing redaction rules
  - Dependencies: none (same writer)
  - Output: code + test
  - Owner: worker
  - Writes: `pi-packages/pi-subagents/src/**`, `pi-packages/pi-subagents/test/**`
  - Interface boundaries: redaction rules unchanged
  - Focused check and PASS evidence: test asserts message present and secrets redacted
  - Return milestone: tests green
  - Stop / reassessment: none expected
- [x] AC-7: Antigravity shutdown scoped to session-owned resources
  - Outcome: child shutdown never tears down parent/sibling driver
  - Known entrypoints and skill paths: `pi-packages/pi-antigravity-bridge/extensions/index.ts` (~984-1002), `src/driver.ts`, `src/acp/driver.ts`
  - Inputs: AC-1 copy
  - Dependencies: AC-1
  - Output: ownership model + tests
  - Owner: worker
  - Writes: `pi-packages/pi-antigravity-bridge/**`
  - Interface boundaries: provider id `antigravity`, `streamSimple` contract
  - Focused check and PASS evidence: test with two session instances; after one shuts down, the other's driver, MCP handle, MCP directory/config, provider registration and approval hook all remain usable; package tests green
  - Return milestone: tests green
  - Stop / reassessment: drivers cannot be session-scoped without redesign
- [x] AC-8: Windows process-tree termination with bounded exit wait
  - Outcome: stream-json and ACP kill the agy tree on Windows
  - Known entrypoints and skill paths: `pi-packages/pi-antigravity-bridge/src/driver.ts` (~751-779), `src/acp/connection.ts` (~525-543)
  - Inputs: AC-1 copy
  - Dependencies: AC-1 (same writer as AC-7, sequential)
  - Output: shared helper + tests
  - Owner: worker
  - Writes: `pi-packages/pi-antigravity-bridge/**`
  - Interface boundaries: POSIX path unchanged; no `shell:true`
  - Focused check and PASS evidence: Windows test spawns a process with a grandchild and asserts both gone; package tests green
  - Return milestone: tests green
  - Stop / reassessment: taskkill unavailable or exit wait unbounded
- [x] AC-9: claude-bridge child shutdown leaves parent state intact
  - Outcome: child `session_shutdown` does not affect parent queries/state
  - Known entrypoints and skill paths: `pi-packages/pi-claude-bridge/src/index.ts` (~965, 2129-2131, 2368-2383, 2447-2449)
  - Inputs: AC-2 copy
  - Dependencies: AC-2
  - Output: finding plus fix/test if needed
  - Owner: worker
  - Writes: `pi-packages/pi-claude-bridge/**`
  - Interface boundaries: provider id `claude-bridge`
  - Focused check and PASS evidence: unit test or evidenced inspection; `npm run test:unit` green
  - Return milestone: finding/tests green
  - Stop / reassessment: shared module state requires redesign
- [x] AC-10: Portable antigravity test fixtures
  - Outcome: full package suite passes natively on Windows
  - Known entrypoints and skill paths: `pi-packages/pi-antigravity-bridge/tests/**` (extensionless shell fixtures, `driver.test.ts` PATH join)
  - Inputs: AC-1 failure parity list
  - Dependencies: AC-1
  - Output: portable fixtures, unchanged assertions
  - Owner: worker
  - Writes: `pi-packages/pi-antigravity-bridge/**`
  - Interface boundaries: product code changes limited to minimal fixes of real Windows bugs the tests reveal; Node fixtures are launched via `process.execPath` or a thin test-side spawn redirection (bare `.mjs` paths do not run under `shell:false`)
  - Focused check and PASS evidence: `npx vitest run` exit 0 on Windows
  - Return milestone: suite green
  - Stop / reassessment: a fixture cannot be made portable without changing product behavior

## Authorization

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

The user explicitly selected Review plan with Oracle. Round 1 and round 2 fresh
Oracle reviews returned [REJECT]; both were repaired in this record. Round 3 fresh
Oracle subtask_thoth-oracle_1790800486143_d57a66d3 returned [OKAY]. The user then
explicitly chose Implement on 2026-09-30.

## Verification

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: e4153e1f7aef386c5b5e9ddb8ba2964237aa75def95222447a53b02a50b98214

Record-only delta after PASS (Authorization canonicalized) confirmed by fresh Oracle
subtask_thoth-oracle_1790806469232_f5913ee3: previous prefix 8a0cd7e2…4bd6 reconstructed,
no other prefix byte changed; Source digests match.

- AC-1: PASS | copy/config audit + antigravity tsc and Vitest | provenance 64170a1 confirmed; standalone typecheck exit 0 and suite green
- AC-2: PASS | claude-bridge typecheck + test:unit | 271/271 pass; CHANGELOG byte-identical to a78a2a5; operator config hash unchanged
- AC-3: PASS | pnpm run check:ci + diff review | exit 0; bridges excluded; nine baseline files formatting-only, AST-equivalent to HEAD
- AC-4: PASS | real-SDK regressions in pi-subagents | inherited keyless provider streams; child-owned registration wins; 413/413 tests
- AC-5: PASS | lifecycle inspection + real-SDK regressions | centralized exactly-once teardown, 5 s shutdown bound, dispose on all paths
- AC-6: PASS | sanitizer and render regressions | bounded redacted message reaches orchestrator-safe details
- AC-7: PASS | two-instance ownership regression | parent driver, endpoint, registration, discovery files and approval hooks survive sibling shutdown
- AC-8: PASS | regression + independent Windows probes | stream-json abort/close and ACP overflow remove parent and descendant before awaited completion
- AC-9: PASS | cached-factory lifecycle regressions | parent settings, mirrors, active query and registration survive child load/shutdown
- AC-10: PASS | native antigravity suite + fixture diff | 542 passed, 9 documented POSIX-only skips, assertions retained

- Source: biome.json | sha256:054c874ce6d8edadade9604c1bb83838e544cf819e66abc171eb37eca4c3c866
- Source: .gitignore | sha256:c19a4c402c87e63ae749ee218b22e0e793e7060de185210474f652e2135c6789
- Source: pi-packages/pi-subagents/src/runner/sdk-runner.ts | sha256:216c748601cef9b6c4ccd146ea115660f799dec795df3fece28c76bfe7d0669c
- Source: pi-packages/pi-subagents/src/runner/session-teardown.ts | sha256:6b6e54d5cbdf9f2eff3a73674b1059301506d6370c80c67c6f503a7db3ca32ef
- Source: pi-packages/pi-subagents/src/runner/event-processing.ts | sha256:b8b98cb4a7358755ea9fc2a18fc6b41cf4390b677e51f41d4afb39e92d3182af
- Source: pi-packages/pi-subagents/src/error-metadata.ts | sha256:e158b195007641ca649ee4605fbef9c8ee882ae28f29f60855a21dde36b523d8
- Source: pi-packages/pi-subagents/src/render/completion-message.ts | sha256:4c1057b7f2a7798fd4d5ab152fcb7fa44e86e5f87d3c970cc1dcb97ae2284d2f
- Source: pi-packages/pi-antigravity-bridge/package.json | sha256:3b74e9f503dfdb64f4ef9ece16f1ac1cb945a8b8adfd679db1edc7771a8bebf9
- Source: pi-packages/pi-antigravity-bridge/extensions/index.ts | sha256:5652b4dd47f1b8e9f63541065b7afe2e5bc398e373a5a3a05998ae305494fa3d
- Source: pi-packages/pi-antigravity-bridge/src/process-termination.ts | sha256:d7fa760a815c59da1b8694bb2f3d3425274e6bc406bdc88c03acd94666586636
- Source: pi-packages/pi-antigravity-bridge/src/driver.ts | sha256:cd3c7abcf152915c49395f7f6d91dd7fec3ae9286d9f343954a709b3e6093bb7
- Source: pi-packages/pi-antigravity-bridge/src/acp/connection.ts | sha256:41b4cc0f26cb9972f392862397af65270afcd4b318d92962656d8f2edbec3e84
- Source: pi-packages/pi-antigravity-bridge/src/acp/driver.ts | sha256:2a5edf557039dbc68465b2e48d5a4b5faac6728f0702d63a3a7b561ad785671e
- Source: pi-packages/pi-antigravity-bridge/src/engine-picker.ts | sha256:689dd1250dc989950e60148cca919c3e5a1accef9172f4fe93139ce47ec50387
- Source: pi-packages/pi-antigravity-bridge/src/diff-render.ts | sha256:dd40ef89a5a0e9aee4b73fdfb6d9d92d4136d81246549b22754517db872fbdec
- Source: pi-packages/pi-claude-bridge/src/index.ts | sha256:4577cde95266aff67f5c86cb131010a7693ab2e0e48d91409b175eda7e6bf44b
- Source: pi-packages/pi-claude-bridge/tests/lib/setup.mjs | sha256:4b4c327df4fcabdf2ade308c7aabd830b6dc2ad22982ea6aacc7baf9c3b9bdee

## Closeout

**Archive**: READY
