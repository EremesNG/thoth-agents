# Change: bridge-child-lifecycle

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: medium
**Risk**: medium

## Exploration

- Live (2026-10-01): an antigravity-model pi-subagents child could not use Pi tools:
  its agy discovered the ROOT bridge through the global
  `~/.gemini/config/mcp_config.json` and calls failed `no active antigravity turn`
  because the child turn is streamed by the child-loaded antigravity instance, which
  never ran `session_start` (lean isolation strips it; the SDK emits it only from
  `bindExtensions()`, never called by `pi-packages/pi-subagents/src/runner/sdk-runner.ts`).
- claude-bridge builds its MCP server per query from the call's tools and passes it
  with `--strict-mcp-config` (`pi-claude-bridge/src/index.ts:1932,1958,2000`); it works
  in children unchanged.
- agy 1.2.14 probes (Windows, stream-json): a private `.agents/mcp_config.json`
  passed via `--add-dir` is loaded; global entries remain visible too (additive). Two
  concurrent turns with distinct private server names: 12/12 calls hit their own
  server, descriptors stayed separate; with the same server name the descriptor cache
  file `~/.gemini/antigravity-cli/mcp/<server>/<tool>.json` was overwritten by both
  turns. agy calls MCP tools through its native `call_mcp_tool` with a model-chosen
  server name. The descriptor cache is never cleaned (104 `pi-bridge-*` dirs, ~16 MB).
- Full-lifecycle experiment (branch `exp/full-child-lifecycle`, commit `603e6d2`, not
  merged): with every handler kept for `lifecycle_passthrough` packages and
  `session_start` emitted via `session.extensionRunner.emit({type:"session_start",
  reason:"startup"})` after tool verification: no startup errors; an antigravity
  child started its own bridge with the child catalog and agy completed Pi-tool calls
  through it; cancel removed the child's global entry and private dir and killed
  agy/claude processes; root kept working; claude-bridge.json unchanged. Problems: the
  child agy also saw both roots' bridges and the constant private name; a
  claude-model child also started the antigravity bridge, spawned agy briefly twice
  and registered a global entry; descriptor cache dirs leaked per child.
- Antigravity startup facts (`pi-packages/pi-antigravity-bridge`): `session_start`
  (`extensions/index.ts:631-993`) runs engine picker (tui startup only), missing-binary
  and `agy --version` checks (`src/agy-version.ts:79-93`), legacy-patch notice, ACP
  self-heal, then — with no model/provider guard — MCP server start
  (`src/mcp-server.ts:584-600`), stale-entry sweep, stream-json global registration
  (`src/mcp-registration.ts:23-28,75-105`), approval hooks. Load time may spawn
  `agy models` when the shared catalog cache is stale (`src/models.ts:191-282`). The
  private server key is the constant `pi-antigravity-bridge` (`src/mcp-server.ts:40,
  192-213,339`). The stream driver adds the private dir via `--add-dir` before
  spawning agy (`src/driver.ts:379-400`); ACP reads the handle lazily
  (`extensions/index.ts:340-353`). Pi 0.99.1 exposes `ctx.model` and a `model_select`
  event (`core/extensions/types.d.ts:223-227,835-842`); the bridge does not listen to it.
- pi-subagents today: `lifecycle_passthrough` (default both bridges) passes only
  `before_agent_start`, `agent_start`, `turn_start` observe-only; `session_shutdown`
  is retained only for load-time provider owners (`src/runner/sdk-runner.ts`).

## Intent

Trusted provider bridges run with their full extension lifecycle inside pi-subagents
lean children (prompt-shaping events stay observe-only as defense in depth, not a
sandbox), and antigravity gives each session — root or child — its own isolated Pi-tool bridge
that starts only when that session actually uses antigravity and cleans up after itself.

## Non-goals

- Changing claude-bridge code.
- Child-specific markers or child-only code paths in the bridges.
- Changing which Pi tools the bridge exposes (upstream catalog behavior).
- ACP engine redesign beyond honoring the lazy bridge start.
- Supporting concurrent sessions where some use private and others legacy-global
  discovery (reported by a diagnostic, not made safe).
- Version bumps or publication.

## Acceptance

- AC-1: Packages in `lifecycle_passthrough` are trusted: in lean children their
  extensions keep all handlers, including `session_start` and `session_shutdown`.
  As defense in depth, prompt-shaping events (`before_agent_start`, `agent_start`,
  `turn_start`, `context`, `context_with_system`, `input`, `before_provider_request`,
  `before_provider_headers`) receive a clone of their data fields with the return
  discarded, while non-cloneable members such as `AbortSignal` are passed through;
  other events pass unchanged. The thoth-agents root package (which injects the
  adaptive-root contract) is rejected from `lifecycle_passthrough` with a config
  warning and never receives passthrough. Docs state this is a trust list, not a
  sandbox: a listed extension can still change the child session through its live
  `SessionManager` or the Pi API. Non-listed extensions keep today's isolation.
- AC-2: pi-subagents emits `session_start` (`reason: "startup"`) to the child after
  tool-selection verification and before the first prompt, awaited inside the
  existing teardown-on-error path; handler errors are recorded in task diagnostics
  without failing launch; `session_shutdown` reaches the listed extensions exactly once
  on every teardown path. Order: provider replay, tool verification, then
  `session_start`. Tests: a listed fixture's event mutations and returned overrides
  on the prompt-shaping events do not change the child prompt; the root package is
  rejected from the list.
- AC-3: Antigravity gains config `bridgeDiscovery: "private" | "legacy-global"`
  (default `private`). In `private`, each instance stages only its private MCP config
  with a unique short server name, never registers or suppresses global bridge
  entries, and still sweeps global `pi-bridge-*` entries of dead processes; in
  `legacy-global`, upstream registration and suppression behavior is unchanged. A live
  `legacy-global` entry while running `private` produces one diagnostic.
- AC-4: Antigravity starts its per-session bridge (MCP server, private config,
  approval hooks) and runs the `agy --version` check only when the session uses an
  antigravity model: at `session_start` if `ctx.model` is antigravity, on
  `model_select` to an antigravity model, or at the latest before the first
  antigravity stream in that instance, awaited before agy is launched (single-flight,
  safe against concurrent shutdown). Load time never spawns agy: the model catalog is
  read only from cache or the built-in fallback, and any catalog refresh is deferred to
  the first antigravity use (tests cover missing and stale caches). Sessions that
  never use antigravity start no bridge, register nothing and spawn no agy at all. In
  `private` mode AskAntigravity suppression and startup suppression healing are
  bypassed. Engine picker and other root/UI steps keep their current guards.
- AC-5: On owned shutdown, antigravity also removes its own descriptor cache dir
  `~/.gemini/antigravity-cli/mcp/<its server name>` and nothing else.
- AC-6: Docs: pi-subagents README/skill describe the full lifecycle for listed
  packages, the observe-only events and the trust/not-a-sandbox boundary; antigravity
  README/docs describe `bridgeDiscovery`, lazy start and cache cleanup; the root Pi
  adapter guidance (`src/harness/adapters/pi.ts:52`) and its test
  (`src/harness/adapters/pi.test.ts:163-169`) no longer claim listed extensions cannot
  change the child prompt and describe the trusted full lifecycle.
- AC-7: Package typechecks and tests (pi-subagents, antigravity incl. Windows), root
  `check:ci`/`typecheck` pass; after merge and restart, live: an antigravity child
  completes a Pi-tool call through its own bridge and sees no other `pi-bridge`
  server; a claude child spawns no agy and registers nothing; root antigravity still
  works; cancel removes child artifacts and cache dir; no stale process remains.

## Clarifications

- Give the bridges their full lifecycle in children; prompt-shaping events stay
  observe-only as defense in depth (user, 2026-10-01, after the experiment).
- `lifecycle_passthrough` packages are trusted and documented as not sandboxed (user).
- `bridgeDiscovery` option `private | legacy-global`, default `private` (user).
- Each instance removes its own descriptor cache dir on shutdown; old dirs are not
  swept automatically (user).

## Decisions

- Lazy, model-gated bridge start applies to every instance, root included, so a
  session that does not use antigravity does no bridge work; this replaces the
  previously considered child marker.
- Private server name: short and unique per instance (derived from the instance id),
  used for the private config, MCP server identity and the cache dir to remove.
- The experiment branch `exp/full-child-lifecycle` is reference only; this change
  re-implements on `migration/pi-j0k3r` after the widget change's pi-subagents work
  lands (shared package ownership).
- Root docs `docs/agent/harness-packaging.md`, `docs/agent/agents-and-delegation.md` and
  `docs/installation.md` hook-filter summaries are qualified with the trusted-package
  exception as part of AC-6 (root-owned).
- Trust model (user, 2026-10-01, after plan review round 1 showed live
  `SessionManager` and `pi.sendMessage()` bypass event cloning, which already applied
  to the existing observe-only passthrough): `lifecycle_passthrough` lists trusted
  packages; cloning is defense in depth, not isolation.
- No spec delta: the lean child contract "without root prompt injection" concerns
  the thoth-agents root contract, which can never be listed; antigravity behavior is
  not in specs.
- Plan review round 2 (fresh Oracle): REJECT only on the stale root adapter guidance
  claim; repaired by adding it to AC-6 (root-owned). No spec delta confirmed
  sufficient. Test lazy-start/shutdown races and root `/new`/resume reuse.
- Plan review round 1 (fresh Oracle): REJECT on observe-only guarantee and load-time
  `agy models` spawn; repaired above. Cache cleanup derives the owned name under
  `os.homedir()/.gemini/antigravity-cli/mcp/` after driver termination.
- Implementation checkpoint (root, 2026-10-01): `a6bb839` (pi-subagents full trusted
  lifecycle, observe-only prompt-shaping events, root package rejection, startup
  diagnostics persisted immediately), `8302dd5` (root adapter guidance test-first and
  three root docs), antigravity commit (private discovery, lazy model-gated start incl.
  ACP new/load, catalog without load-time spawn, shutdown/startup race fix, owned cache
  cleanup, docs). Frozen checks: frozen install 0; pi-subagents typecheck 0 / 516
  passed; antigravity 0 / 555 passed, 9 skipped; claude-bridge 0 / unit 290; root
  check:ci, typecheck, build 0; root `pnpm test` without Orca CODEX_HOME 1160 passed /
  4 missing-sibling failures; operator claude-bridge.json hash unchanged. Live AC-7
  follows after merge and restart.
- Live AC-7 (2026-10-01, main 0.5.0 d39367f after full restart, stream-json, agy
  1.2.14): antigravity child launched agy with a private `--add-dir` and unique
  server `pi-agy-<id>`, listed only `codegraph` plus its own server (no `pi-bridge-*`),
  completed `bg_status` through its own server (`ls` correctly refused: native-overlap
  tool not exposed, upstream behavior); global mcp_config gained no entry and dead
  `pi-bridge-*` entries were swept; completion and cancel left no agy process, private
  config dir or owned descriptor cache. Claude child (profile switched temporarily in
  subagents.json, restored by hash) spawned no agy and registered nothing. Operator
  confirmed root antigravity works. Antigravity suite leaves `~/.gemini` untouched; two
  stale `pi-agy-*` caches from interrupted worker runs at 01:00 were removed.
- Final verification round 1 (fresh Oracle subtask_thoth-oracle_1790866558724_0ee25ae9):
  FAIL — AC-5 shutdown deleted the shared legacy cache name `pi-antigravity-bridge`
  unconditionally; AC-6 stale claims in pi-subagents README/skill and antigravity
  README. Repaired in `680e310`: cleanup tracks only acquired instance-unique
  keys (five new tests, temp HOME, red then green), docs/AGENTS.md aligned. Antigravity
  typecheck 0, 560 passed / 9 skipped; `git diff --check` clean.
- Final verification round 2 (fresh Oracle subtask_thoth-oracle_1790867721500_6260f821):
  AC-1..AC-5 and AC-7 PASS (560 passed / 9 skipped); AC-6 FAIL on remaining doc
  contradictions (README:21, docs/ENGINES.md:12, AGENTS.md:32/61/63: every-start agy
  warning, unqualified global registration/heal, fixed `pi-bridge` ACP self-filter).
  Root repaired them plus the matching stale code comment in `45e9b60`
  (docs/comment only). Typecheck 0; two suite runs 560 passed / 9 skipped (one earlier
  run showed a single non-reproduced intermittent failure).

## Durable deltas

- None.

## Plan

1. Worker A (sole writer of `pi-packages/pi-subagents/**`, after the widget change's
   worker A finishes): full lifecycle for listed packages with observe-only prompt
   events; `session_start` emission and shutdown coverage; real-SDK tests; docs.
2. Worker B (sole writer of `pi-packages/pi-antigravity-bridge/**`, can start now):
   `bridgeDiscovery`, unique private names, lazy model-gated start (incl.
   `model_select` and stream-time fallback, both engines), cache-dir cleanup; tests
   (Windows); docs.
3. Root (after worker A, test-first): update `src/harness/adapters/pi.ts` guidance and
   `src/harness/adapters/pi.test.ts`.
4. Root: checks, commits, merge, user restart, live checks, fresh Oracle, archive.

## Tasks

- [x] AC-1: full lifecycle with observe-only prompt events
  - Outcome: listed packages keep all handlers; prompt-affecting events observe-only
  - Known entrypoints and skill paths: `pi-packages/pi-subagents/src/runner/sdk-runner.ts` (isolateSubagentExtensions), reference `exp/full-child-lifecycle` commit `603e6d2`, Pi SDK event types, tdd skill
  - Inputs: Exploration, Clarifications
  - Dependencies: widget change worker A done
  - Output: code + real-SDK tests
  - Owner: worker A
  - Writes: `pi-packages/pi-subagents/src/**`, `pi-packages/pi-subagents/test/**`
  - Interface boundaries: non-listed isolation unchanged
  - Focused check and PASS evidence: listed fixture receives session_start/session_shutdown and other events; event mutations/returns on prompt-shaping events do not change the prompt; AbortSignal events still work; root package rejected from the list
  - Return milestone: tests green
  - Stop / reassessment: a bridge depends on mutating a prompt-shaping event
- [x] AC-2: session_start emission and shutdown
  - Outcome: startup emitted once before first prompt; shutdown once per path
  - Known entrypoints and skill paths: `src/runner/sdk-runner.ts` createSession, `src/runner/session-teardown.ts`
  - Inputs: AC-1
  - Dependencies: AC-1 (same writer)
  - Output: code + tests
  - Owner: worker A
  - Writes: `pi-packages/pi-subagents/src/**`, `pi-packages/pi-subagents/test/**`
  - Interface boundaries: manager stopping semantics unchanged
  - Focused check and PASS evidence: ordering, error recording, shutdown on success/failure/cancel/timeout/verification failure
  - Return milestone: tests green
  - Stop / reassessment: emission requires bindExtensions side effects
- [x] AC-3: bridgeDiscovery private/legacy-global
  - Outcome: per-instance private discovery by default
  - Known entrypoints and skill paths: `pi-packages/pi-antigravity-bridge/src/config.ts`, `src/mcp-server.ts:40,140-213,339`, `src/mcp-registration.ts`, `extensions/index.ts:858-890`, `src/driver.ts:379-400`
  - Inputs: Exploration probes
  - Dependencies: none
  - Output: code + tests
  - Owner: worker B
  - Writes: `pi-packages/pi-antigravity-bridge/**`
  - Interface boundaries: legacy-global unchanged; foreign MCP entries preserved
  - Focused check and PASS evidence: private mode writes unique private config, no global entry; dead-pid sweep; legacy unchanged; mixed-mode diagnostic
  - Return milestone: tests green
  - Stop / reassessment: agy requires the global entry in some supported path
- [x] AC-4: lazy model-gated bridge start
  - Outcome: no bridge work in sessions not using antigravity
  - Known entrypoints and skill paths: `extensions/index.ts:631-993,340-353,477-509`, `src/provider.ts` stream path, `src/agy-version.ts`
  - Inputs: AC-3
  - Dependencies: AC-3 (same writer)
  - Output: code + tests
  - Owner: worker B
  - Writes: `pi-packages/pi-antigravity-bridge/**`
  - Interface boundaries: engine picker and root UI guards unchanged
  - Focused check and PASS evidence: tests for lazy-start/shutdown races and root /new or resume reuse, antigravity model at start, model_select switch, stream-time fallback awaited before driver spawn (stream-json and ACP), non-antigravity session does nothing, load with missing/stale catalog cache spawns nothing, private mode bypasses suppression
  - Return milestone: tests green
  - Stop / reassessment: bridge cannot be started before the first agy launch
- [x] AC-5: descriptor cache cleanup
  - Outcome: own cache dir removed on shutdown
  - Known entrypoints and skill paths: `extensions/index.ts:995-1028`
  - Inputs: AC-3 server name
  - Dependencies: AC-3 (same writer)
  - Output: code + tests
  - Owner: worker B
  - Writes: `pi-packages/pi-antigravity-bridge/**`
  - Interface boundaries: other dirs untouched
  - Focused check and PASS evidence: test removes only the instance dir
  - Return milestone: tests green
  - Stop / reassessment: none expected
- [x] AC-6: documentation
  - Outcome: docs match
  - Known entrypoints and skill paths: pi-subagents README/skill; antigravity README, docs
  - Inputs: AC-1..AC-5
  - Dependencies: AC-1..AC-5
  - Output: docs
  - Owner: worker A (pi-subagents), worker B (antigravity), root (adapter guidance)
  - Writes: those docs; root: `src/harness/adapters/pi.ts`, `src/harness/adapters/pi.test.ts`, `docs/agent/harness-packaging.md`, `docs/agent/agents-and-delegation.md`, `docs/installation.md`
  - Interface boundaries: none
  - Focused check and PASS evidence: docs describe the behavior; adapter test pins the trusted-lifecycle wording and no longer asserts the cannot-change-prompt claim
  - Return milestone: docs updated
  - Stop / reassessment: none expected
- [x] AC-7: checks and live
  - Outcome: green checks; live behavior confirmed
  - Known entrypoints and skill paths: package filters, root scripts, operator Pi after merge
  - Inputs: AC-1..AC-6
  - Dependencies: AC-1..AC-6
  - Output: evidence
  - Owner: root
  - Writes: none in repo
  - Interface boundaries: operator config restored after live checks
  - Focused check and PASS evidence: checks exit 0; live items of AC-7 observed
  - Return milestone: evidence captured
  - Stop / reassessment: new failure

## Authorization

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

The user explicitly selected Review plan with Oracle. Rounds 1-2 returned [REJECT]
(observe-only guarantee and load-time agy spawn; stale root adapter guidance),
repaired here; round 3 fresh Oracle subtask_thoth-oracle_1790833805878_a493b3b5
returned [OKAY]. Caution: `docs/agent/harness-packaging.md`,
`docs/agent/agents-and-delegation.md` and `docs/installation.md` hook-filter summaries
should qualify the trusted-package exception. ACP probe (2026-10-01, ACP 1.2.1): sessions saw only their own `mcpServers`
entries plus non-`pi-bridge` global servers, with session-keyed descriptors; but every
tool call was denied by the operator's Orca pre-tool hook (`.cmd` not runnable by ACP)
and two simultaneous ACP process starts timed out. The user chose to implement this
plan unchanged for stream-json (scope unchanged; ACP stays a separate line).

## Verification

**Reviewer**: PENDING
**Independent from implementer**: PENDING
**Verdict**: PENDING
**Reviewed record SHA-256**: PENDING

- AC-1: PENDING | check | evidence
- AC-2: PENDING | check | evidence
- AC-3: PENDING | check | evidence
- AC-4: PENDING | check | evidence
- AC-5: PENDING | check | evidence
- AC-6: PENDING | check | evidence
- AC-7: PENDING | check | evidence

## Closeout

**Archive**: PENDING
