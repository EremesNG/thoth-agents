# Change: pi-subagents-footprint

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: medium
**Risk**: medium

## Exploration

- Context: follow-up to the 2026-10-20 root Pi OOM. That crash was caused by render-context chaining, fixed in 82809a2 (`detachRenderContext`). This change covers the remaining footprint problems found during that investigation. They did not cause the crash, but they grow without bound. All paths below are under `pi-packages/pi-subagents/` unless stated otherwise.
- History DB ownership: `~/.local/share/pi/subagents/subagents-history.sqlite` is created and written only by `src/history.ts`:
  - path resolution `:39-58` (`PI_SUBAGENTS_HISTORY_DB_PATH`, `PI_SUBAGENTS_HISTORY_HOME`, `XDG_DATA_HOME/pi/subagents`, `~/.local/share/pi/subagents`);
  - open/create `:401-416`;
  - task and attempt upserts `:554-561`;
  - event appends `:564-580`.
  No other repository package or installed extension writes it.
- History DB measurements (read-only, 2026-10-21):
  - size and mode: 2.57 GB logical, WAL, `auto_vacuum=0`, negligible freelist; data since 2026-09-04, about 20-115 MB of text per day;
  - `subagent_tasks`: 2,355 rows, 1.06 GB of text, of which snapshots are 0.90 GB;
  - `subagent_task_attempts`: 2,425 rows, 1.10 GB, with the same full serialized record per attempt;
  - `subagent_events`: 660k rows, 309 MB;
  - age: rows older than 7 days hold about 790 MB of task text, rows older than 30 days about 3 MB.
- History readers:
  - production needs latest-task data only;
  - `getTask` (`history.ts:582-591`) serves status, result, continue and history detail;
  - metadata-only queries serve session lists, the sidebar and cost ranking (`history.ts:625-701`);
  - startup reconciliation reads queued/running rows (`history.ts:703-714`);
  - `listTaskAttempts` (`history.ts:716-778`) and `subagent_events` have no production reader, only tests;
  - the history panel detail uses the task snapshot, falling back to the transcript (`ui/subagents-history-panel.ts:816-849`).
- History mechanics:
  - there is no retention, pruning, VACUUM or numbered schema migration; startup runs `CREATE ... IF NOT EXISTS` plus additive `ALTER TABLE ADD COLUMN` (`history.ts:140-149,416-550`);
  - per-attempt rows come from continuation persisting the previous attempt before incrementing (`manager.ts:1684-1726`; CHANGELOG lines 98-101).
- Manager retention:
  - `tasks`/`taskCwds` (`manager.ts:552-553`) never delete entries, and each entry holds prompt/context, system prompt, transcript, result and the final snapshot;
  - many terminal operations read memory only, with no DB fallback: foreground `run` result assembly (`:1581,1599,1623`), cancel idempotence (`:1768`), send/extend/attention (`:1247,1262,1397`), notification `wait` (`:2559`), work-panel visible counts (`ui/work-panel-provider.ts:235-307`), and cwd-less `getTask` in `tools/subagent-run.ts:254` and `background-handoff-state.ts:110,190`;
  - terminal persistence errors are swallowed in `recordNow` (`manager.ts:2480-2521`), so a terminal status does not prove a durable row;
  - runner cleanup runs after terminal status (`manager.ts:2321-2430`);
  - continuation reuses the task id (`manager.ts:1659-1665`);
  - notification-outbox closures capture full task objects (`extension/subagents-extension.ts:101-177`).
- Tool payloads:
  - `compactTaskForToolResult` (`tools/result-details.ts:52-108`) is a rest/spread projection that drops only the thread snapshot and raw error metadata, so `details.task(s)` of run/continue (partial and final), status, result and cancel carry transcript, system prompt, prompt/context and result without bounds;
  - partial updates are coalesced per task every 150 ms (`manager.ts:2524-2555`), plus a 250 ms `run` heartbeat (`tools/subagent-run.ts:33`);
  - no renderer under `src/render/**` reads transcript or system prompt, the history panel resolves tasks separately, and renderers ignore unknown fields, so persisted legacy details keep rendering;
  - `subagent_list_tasks` already drops transcript/result but keeps system prompt, prompt and context.
- Orca (`~/.pi/agent/extensions/orca-agent-status.ts`, Orca 1.4.233) retains the last in-process child session through `globalThis.__orcaPiSubagents` callbacks. That file is Orca-managed, so it is handled outside this change.

## Intent

pi-subagents keeps bounded memory and disk use in long sessions and over weeks of use. The history database stores execution detail once, only for the latest attempt, and only within a configurable retention window, and it can be compacted on demand. Terminal tasks stop holding heavy payloads in process memory. Tool result details stop embedding full transcripts and prompts. Every user-visible feature that works today for recent tasks keeps working.

## Non-goals

- Changing Orca's managed extension or excluding extensions from child sessions (the upstream report is handled separately).
- Changes to the Atelier metadata store, usage accounting deduplication, pi-core or other packages.
- Automatic VACUUM, or any compaction that runs without an explicit user command.
- Deleting whole task rows, or changing session JSONL files, child session files or the `subagent-artifacts` directory.
- Version bumps, publishing or release.

## Acceptance

- AC-1: New history writes store the thread snapshot, transcript and system prompt only in `subagent_tasks`. `subagent_task_attempts` rows keep attempt metadata and the result without those columns, and nothing is written to `subagent_events`. `getTask`, status, result, continue, session/cost listings, counts and startup reconciliation behave as before for new tasks.
- AC-2: A pruning pass:
  - clears the snapshot, transcript and system prompt of terminal tasks whose last activity is older than `history_detail_retention_days` (subagents.json, default 14);
  - clears those columns from every attempt row and deletes all `subagent_events` rows;
  - never modifies queued or running tasks, metadata, results, session paths, usage or cost;
  - runs after session start, off the startup path, in bounded batches;
  - on a busy or locked database, skips and retries later without failing the session.
  The history panel shows the final response and a clear "execution detail expired" note for a pruned task.
- AC-3: An explicit pi-subagents command prunes and then compacts the database with VACUUM and reports the file size before and after. Before any pruning it acquires exclusive cross-process access to the database and holds it across every pruning commit and the VACUUM.
  - When exclusive access cannot be acquired (another Pi process or connection has the database open or locked), it refuses with a clear message and changes no data.
  - A writer that arrives while compaction holds exclusive access waits on its busy timeout; if that expires, its write failure is surfaced (the task stays in memory per AC-4) and no committed row is lost or corrupted.
  - The process's own history connections are closed or reused for compaction, so they do not block it.
  - Nothing triggers the command automatically.
- AC-4: After a task is terminal, its runner has settled, its foreground consumers have resolved and its terminal record is confirmed durable, the manager releases the task's transcript, thread snapshot and system prompt from memory and keeps a lightweight summary. That summary keeps id, attempt, cwd, status, timing, usage/cost, result and display metadata, so cancel/send/extend/status/result/continue, the work panel and notifications behave as before.
  - Detail is loaded from history on demand.
  - A failed persistence keeps the full task in memory and logs the failure.
  - A continuation that reuses the id is never released by a stale release.
  - The notification outbox does not retain full task objects.
- AC-5: Every subagent tool `details` payload, partial or final, for run/continue/status/result/cancel/list_tasks, is built from one explicit allowlist projection:
  - no transcript, system prompt or thread snapshot;
  - prompt, context and continuation prompt bounded to a fixed preview length;
  - the result present only in final payloads.
  Renderers render both new payloads and older persisted payloads that still contain those fields.
- AC-6: The pi-subagents test suite, `pnpm run typecheck`, `pnpm run check:ci` and `pnpm run build` pass. CHANGELOG has an unreleased entry, and the README documents `history_detail_retention_days`, what pruning keeps and removes, and the compaction command.

## Clarifications

- 2026-10-21, user: the execution-detail retention is 14 days and must be configurable. Metadata, result and session path are always kept.
- 2026-10-21, user: disk space is reclaimed through an explicit compaction command, not automatically.
- 2026-10-21, user: the Orca issue is reported by the user from a provided draft; there is no thoth-side mitigation in this change.

## Decisions

- D1: Prune by clearing heavy columns, not by deleting task rows. Deleting rows would break status/result/continue lookups, listings and cost totals; clearing columns keeps them.
- D2: Remove per-attempt execution detail and stop event persistence. Neither `subagent_events` nor `listTaskAttempts` has a production reader. The latest attempt's detail stays in `subagent_tasks`. `listTaskAttempts` remains and returns attempt metadata/results; its tests are updated.
- D3: Pruning starts after session start on a deferred timer and processes bounded batches in short transactions with a busy timeout. A busy result ends the pass early, and the next pass runs at the next session start or after a fixed interval. Pruning never blocks `session_start`. Default retention is 14 days; `0` disables pruning.
- D4: Compaction is an explicit command registered by pi-subagents.
  - It first acquires exclusive cross-process access on a dedicated connection, for example `PRAGMA locking_mode=EXCLUSIVE` with an immediate write transaction, after closing the process's own history connections. It then runs the same pruning and `VACUUM` on that connection, without ever wrapping `VACUUM` in an open transaction, and releases exclusive access by closing the connection.
  - When exclusive access cannot be acquired, it refuses before changing anything.
  - A precheck alone is not sufficient: exclusion must be held from before the first pruning batch until after `VACUUM`.
  - It reports before/after sizes and never runs automatically.
- D5: Manager release keeps one lightweight summary per terminal task, keyed by task id and attempt.
  - Release happens only after: the terminal record write is confirmed (`recordNow` must report success instead of swallowing errors), runner settlement completes, and foreground waiters have taken their result.
  - Release drops `transcript`, `thread_snapshot` and `system_prompt`. Prompt, context and result stay, because they are small and terminal operations need them.
  - Reads that need released fields hydrate from history using the stored cwd.
  - Outbox closures hold the task id plus summary and resolve the task at delivery.
- D6: Tool details use one explicit allowlist projection, with the previews bounded to the same 2,000-character budget the timeout context uses. Final payloads keep the result for the renderers; partial payloads omit it. The model-facing text content of tool results is unchanged.

## Durable deltas

- `ADDED pi-ecosystem` **Subagent history retention** — `@thoth-agents/pi-subagents` MUST keep each persisted task's identity, status, timing, usage/cost, result and session path, MUST store execution detail (thread snapshot, transcript, system prompt) only for the latest attempt of each task and MUST NOT persist per-event rows; it MUST clear that execution detail for terminal tasks whose last activity is older than a configurable retention (default 14 days) without blocking session start, without touching queued or running tasks, and without failing when the database is busy; it MUST reclaim database file space only through an explicit compaction command that holds exclusive access to the database from before its first change until compaction ends, and that refuses without changing data when exclusive access cannot be acquired.
  - GIVEN a terminal subagent task last active 20 days ago and the default retention; WHEN the pruning pass runs; THEN its snapshot, transcript and system prompt are cleared while `subagent_status`, `subagent_result`, the history listings and cost totals still show the task and its result .
- `ADDED pi-ecosystem` **Subagent terminal task memory** — After a subagent task is terminal, its runner has settled and its terminal record is durably persisted, `@thoth-agents/pi-subagents` MUST keep only a lightweight summary of the task in process memory and load its execution detail from history on demand; when the terminal record could not be persisted it MUST keep the full task in memory, and a continuation that reuses the task id MUST NOT lose its own state.
  - GIVEN a completed subagent task whose terminal record was persisted; WHEN later turns call `subagent_status`, `subagent_result` or `subagent_continue` for it; THEN they behave as before while the manager no longer holds that task's transcript, thread snapshot or system prompt .
- `ADDED pi-ecosystem` **Bounded subagent tool result details** — Subagent tool results and progress updates MUST build task details through one explicit bounded projection that never includes transcripts, system prompts or thread snapshots, bounds prompt and context text to a fixed preview, and includes the final response only in final results; renderers MUST keep rendering older persisted details that still contain those fields.
  - GIVEN a running subagent with a long transcript; WHEN `subagent_run` emits progress updates and its final result; THEN no update or result details contain the transcript or system prompt, and both new and previously persisted tool cards render unchanged .

## Plan

- Unit H (history writes and pruning, AC-1, AC-2):
  - `src/history.ts`: the attempt upsert writes NULL for the heavy columns; remove the event writes and their call sites; add a `pruneExecutionDetail({ olderThanMs, batchSize })` that clears the heavy columns of old terminal tasks and of all attempt rows and deletes event rows in batches, returning counts and stopping on `SQLITE_BUSY`;
  - deferred scheduling from the extension or manager startup;
  - config key `history_detail_retention_days` in the subagents.json parsing;
  - the expired-detail note in `ui/subagents-history-panel.ts`;
  - tests: `test/history.test.ts` (writes, pruning boundaries, busy skip, active rows untouched), manager/startup scheduling test, panel fallback test.
- Unit C (compaction command, AC-3), after H:
  - a pi-subagents command (name chosen to match existing command naming in the extension) that acquires exclusive access per D4, prunes, `VACUUM`s on the same connection and reports sizes;
  - tests with a temp DB:
    - success path with shrinking size;
    - refusal with unchanged data while another connection already has the database open or holds a write lock;
    - a second connection that tries to write after exclusion was acquired, both during pruning and between pruning and `VACUUM`, gets busy without losing committed rows;
    - no automatic invocation.
  - If node:sqlite cannot hold exclusion across `VACUUM`, the unit stops and returns to root.
- Unit P (bounded details, AC-5), parallel with H:
  - `src/tools/result-details.ts`: an allowlist projection with bounded previews; partial payload builders omit the result (`tools/subagent-run.ts:178-201`, `tools/subagent-continue.ts:94-117`); status/result/cancel/list_tasks use the projection;
  - tests: details-shape tests per tool, plus a renderer test with legacy full details.
- Unit M (manager release, AC-4), after H, C and P:
  - `src/manager.ts`: `recordNow` reports success; lightweight summary plus release after settlement and durable terminal write; hydration via `getTask` with the stored cwd; attempt-safe release; cwd-carrying lookups in `tools/subagent-run.ts:254` and `background-handoff-state.ts:110,190`;
  - outbox closures in `extension/subagents-extension.ts` capture id plus summary;
  - tests: release after persistence, kept on persistence failure, continuation race, cancel/send/status/result/continue after release, work-panel counts unchanged, a GC-based check that released tasks' transcripts are collectable, and a completion that is still queued in the outbox when a same-id continuation starts, whose delivery must keep the captured attempt's result and acknowledgment identity.
- Order and mutable surfaces: H → C → M runs strictly in sequence, and P runs in parallel with H.
  - H owns `history.ts`, the config parsing, the history panel and the pruning startup hook in `src/extension/subagents-extension.ts` `session_start`.
  - C then owns `history.ts` compaction and the command registration in `src/extension/subagents-extension.ts`.
  - M then owns `manager.ts`, the outbox in `src/extension/subagents-extension.ts` and the cwd-carrying lookups in the tools.
  - P owns only `tools/result-details.ts`, the tool details builders and their tests. It does not write `manager.ts`, `history.ts` or the extension file. Its edits in `tools/subagent-run.ts` and `tools/subagent-continue.ts` precede M's edits there.
  - Each surface therefore has exactly one writer at a time.
- Verification seams: per-unit focused Vitest files in pi-subagents (`pnpm --filter @thoth-agents/pi-subagents test -- <paths>`), then the full pi-subagents suite, `pnpm run typecheck`, `pnpm run check:ci` and `pnpm run build`. Final verification by a fresh Oracle.
- Risks:
  - Irreversible clearing of execution detail, mitigated by the retention window, by never touching active rows and by keeping results.
  - First pruning of the 2.55 GB DB rewrites many pages, mitigated by batching off the startup path.
  - VACUUM needs about the DB size in free disk and exclusive access, mitigated by the explicit command with a busy check.
  - Several Pi processes share one DB in WAL mode, mitigated by the busy timeout and skip-on-busy.
  - Manager release races (continuation, foreground waiters, outbox), mitigated by settlement and attempt-keyed release with tests.
  - Behavior drift in terminal-task operations, mitigated by retaining summaries rather than deleting entries.

## Tasks

- [x] AC-1: History stops duplicating execution detail per attempt and stops persisting events
  - Outcome: new attempt rows carry no snapshot/transcript/system prompt, no event rows are written, latest-task readers unchanged
  - Known entrypoints and skill paths: pi-packages/pi-subagents/src/history.ts:220-384,554-580; src/manager.ts event-append call sites; test/history.test.ts; skills tdd and simplify
  - Inputs: Exploration history-reader evidence; decisions D1, D2
  - Dependencies: none
  - Output: code and tests for write-path changes
  - Owner: thoth-worker (unit H)
  - Writes: pi-packages/pi-subagents/src/history.ts, event-append call sites, test/history.test.ts and affected manager tests
  - Interface boundaries: getTask, list/session/cost queries, listTaskAttempts contract, startup reconciliation
  - Focused check and PASS evidence: pi-subagents history and manager tests pass; a test asserts attempt rows have NULL heavy columns and the events table gains no rows
  - Return milestone: write-path tests green, before pruning work starts
  - Stop / reassessment: a production reader of attempts or events is found
- [x] AC-2: Deferred batched pruning with configurable 14-day retention and expired-detail panel note
  - Outcome: old terminal tasks lose only heavy columns, attempts and events are cleared, active rows untouched, busy DB skipped
  - Known entrypoints and skill paths: src/history.ts; subagents.json config parsing; extension/manager startup; ui/subagents-history-panel.ts:816-849; skills tdd and simplify
  - Inputs: AC-1 accepted output; decisions D1, D3
  - Dependencies: AC-1 write-path unit accepted
  - Output: pruning implementation, scheduling, config key, panel fallback, tests
  - Owner: thoth-worker (unit H)
  - Writes: src/history.ts, config parsing module, the pruning hook in src/extension/subagents-extension.ts session_start, ui/subagents-history-panel.ts, related tests
  - Interface boundaries: session_start must not block; other Pi processes sharing the DB
  - Focused check and PASS evidence: tests cover boundary at retention, 0 disables, active rows untouched, busy lock ends pass without throwing, panel shows result plus expired note
  - Return milestone: pruning tests green with a temp DB
  - Stop / reassessment: pruning cannot run off the startup path with node:sqlite
- [x] AC-3: Explicit compaction command with busy refusal and size report
  - Outcome: one command prunes then VACUUMs, reports sizes, refuses on busy/locked DB without changes
  - Known entrypoints and skill paths: pi-subagents command registration in src/extension/subagents-extension.ts; src/history.ts; skills tdd and simplify
  - Inputs: AC-2 pruning API; decision D4
  - Dependencies: AC-2 accepted
  - Output: command, history compaction method, tests
  - Owner: thoth-worker (unit C)
  - Writes: src/history.ts compaction method, command registration, tests, README command docs
  - Interface boundaries: Pi command API; concurrent connections
  - Focused check and PASS evidence: temp-DB tests show size shrink after VACUUM, refusal with unchanged data while another connection has the DB open or locked, and late writers during pruning and between pruning and VACUUM getting busy without losing committed rows
  - Return milestone: command tests green
  - Stop / reassessment: exclusive access cannot be held across pruning and VACUUM with node:sqlite
- [x] AC-4: Manager releases heavy payloads of settled, durably persisted terminal tasks
  - Outcome: summaries retained, transcript/snapshot/system prompt released and hydrated on demand, persistence failure keeps full task, continuation-safe, outbox holds no full tasks
  - Known entrypoints and skill paths: src/manager.ts:552-553,1004-1007,1581-1768,2321-2430,2480-2559; src/tools/subagent-run.ts:254; src/tools/background-handoff-state.ts:110,190; src/extension/subagents-extension.ts:101-177; ui/work-panel-provider.ts:235-307; skills tdd and simplify
  - Inputs: Exploration manager evidence; decision D5; AC-1, AC-2, AC-3 and AC-5 accepted outputs
  - Dependencies: AC-1, AC-2, AC-3 and AC-5 units accepted (strict H → C → M order on src/extension/subagents-extension.ts)
  - Output: manager release implementation and tests
  - Owner: thoth-worker (unit M)
  - Writes: src/manager.ts, src/tools/subagent-run.ts, src/tools/background-handoff-state.ts, src/extension/subagents-extension.ts, related tests
  - Interface boundaries: subagent tools, work-panel provider, usage/Atelier stores (unchanged), notification outbox
  - Focused check and PASS evidence: tests for release after persistence, retention on write failure, continuation race, terminal cancel/send/status/result/continue, unchanged work-panel counts, GC check that released transcripts are collectable, and a queued completion followed by a same-id continuation before delivery keeping the captured attempt's result and acknowledgment identity
  - Return milestone: manager tests green
  - Stop / reassessment: a terminal operation needs released fields synchronously without a history fallback
- [x] AC-5: Explicit bounded allowlist projection for all subagent tool details
  - Outcome: no transcript/system prompt/snapshot in partial or final details, bounded prompt/context previews, result only in finals, legacy details still render
  - Known entrypoints and skill paths: src/tools/result-details.ts:52-108; src/tools/subagent-run.ts:178-201,256-300; src/tools/subagent-continue.ts:94-117,185-225; src/tools/subagent-status.ts; src/tools/subagent-result.ts; src/tools/subagent-cancel.ts; src/tools/subagent-list-tasks.ts; src/render/**; skills tdd and simplify
  - Inputs: Exploration payload evidence; decision D6
  - Dependencies: none
  - Output: projection, builders, tests
  - Owner: thoth-worker (unit P)
  - Writes: src/tools/result-details.ts, the listed tool builders, related tool and render tests (never src/manager.ts, src/history.ts or src/extension/subagents-extension.ts)
  - Interface boundaries: model-facing tool text unchanged; renderers; persisted session details
  - Focused check and PASS evidence: per-tool details-shape tests and a legacy-details render test pass
  - Return milestone: tool and render tests green
  - Stop / reassessment: a renderer or consumer needs a removed field
- [x] AC-6: Package closeout checks, CHANGELOG and README
  - Outcome: full pi-subagents suite, typecheck, check:ci and build pass; docs updated
  - Known entrypoints and skill paths: pi-packages/pi-subagents/CHANGELOG.md; pi-packages/pi-subagents/README.md; docs/agent/testing.md
  - Inputs: AC-1 to AC-5 accepted outputs
  - Dependencies: AC-1 to AC-5 accepted
  - Output: passing check evidence and documentation
  - Owner: thoth-worker (closeout)
  - Writes: pi-packages/pi-subagents/CHANGELOG.md, pi-packages/pi-subagents/README.md
  - Interface boundaries: none
  - Focused check and PASS evidence: command exit codes and test counts for the four checks
  - Return milestone: all checks green
  - Stop / reassessment: an unrelated environment failure, reported with evidence

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

The user selected Oracle plan review on 2026-10-21 and authorized implementation after the OKAY.
The first review rejected the plan for compaction exclusion and writer ordering; both were repaired.
The second review returned OKAY, validated against record SHA-256 a53421dcb289429e7eb50e46c0c883bb4b73b8c5fca2103e8faa33d5168fcf01.
Non-blocking guidance to carry into implementation: VACUUM can need up to twice the database size in free disk space, which the command docs and failure message must reflect. Tests must distinguish an established WAL connection from a newly opened one, exercise a late writer's initialization failure, and confirm normal history access after compaction closes its connection.

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 413a9e6f89d43cded23d3c300404066b50f2f6f2bb50fb152867966d35bf5e05

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS. AC-1–AC-6 are satisfied; no blocking correctness findings. One unrelated Windows filesystem failure passed its isolated rerun.",
  "evidence": [
    {
      "id": "E1",
      "kind": "record",
      "locator": ".thoth/changes/pi-subagents-footprint/pi-subagents-footprint.md",
      "claim": "Independently recomputed the exact byte-prefix SHA-256 as 413a9e6f89d43cded23d3c300404066b50f2f6f2bb50fb152867966d35bf5e05. validate.mjs --through verify passes. The declared canonical-spec source digest matches.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E2",
      "kind": "code-and-tests",
      "locator": "pi-packages/pi-subagents/src/history.ts:296-439; test/history.test.ts; test/manager.test.ts",
      "claim": "Attempt writes store NULL execution-detail columns, manager writes no events, and latest-task detail and attempt metadata/results remain available across reopen and continuation.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E3",
      "kind": "code-and-tests",
      "locator": "pi-packages/pi-subagents/src/history.ts:721-824; src/extension/subagents-extension.ts:359-393; test/history.test.ts; test/extension/history-pruning.test.ts; test/ui/panel.test.ts",
      "claim": "Pruning uses terminal-only task selection, retention boundaries, 100-row batches, committed yields and busy skipping. Tests preserve queued/running/stopping task rows and all retained fields, clear legacy attempt detail/events, verify deferred throttled scheduling and retention 0, and retain the final-response panel fallback.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E4",
      "kind": "code-and-tests",
      "locator": "pi-packages/pi-subagents/src/history.ts:645-715; test/history-compaction.test.ts; test/extension/history-compaction.test.ts",
      "claim": "Compaction suspends local stores, waits for maintenance, acquires EXCLUSIVE locking before first database access, retains exclusion across pruning commits and VACUUM, and closes afterward. Passing tests cover byte-identical refusal with established WAL readers/write locks, late-process initialization/write failures, shrinking, failure cleanup and normal access afterward. Documentation and failure text state up to twice-size free-space requirements.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E5",
      "kind": "code-and-tests",
      "locator": "pi-packages/pi-subagents/src/manager.ts:541-544,1016-1070,1659-1700,2506-2512,2597-2622; test/terminal-release.test.ts; test/extension/notification-outbox.test.ts",
      "claim": "Release requires matching task/attempt identity, runner settlement, durable terminal persistence and no foreground consumers. Failed terminal persistence pins detail and logs once. Passing tests cover same-id continuation, foreground siblings, original-cwd hydration, terminal operations/work-panel counts, compaction degradation, queued attempt-specific acknowledgments and collection of full task/snapshot objects.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E6",
      "kind": "code-and-tests",
      "locator": "pi-packages/pi-subagents/src/tools/result-details.ts:55-153; test/tools/result-details.test.ts; test/render/tools.test.ts",
      "claim": "All six requested tools use the shared explicit projection, omit execution-detail fields, bound previews to 2000 characters and omit results from progress payloads. List model text uses original tasks. Passing assertions cover model text, boundary lengths, all requested tools and legacy rendering. Baseline source lacks the pruning/compaction/release APIs and retains fields prohibited by the new assertions, establishing regression sensitivity by inspection.",
      "basis": "observed",
      "uncertainty": "Baseline tests were not replayed because that would require changing review inputs."
    },
    {
      "id": "E7",
      "kind": "execution",
      "locator": "pnpm --dir pi-packages/pi-subagents test; isolated test/model-profiles/store.test.ts rerun",
      "claim": "Full run: 95 files passed, 1 failed; 1767 tests passed, 1 failed, 1 skipped. The sole failure was EPERM on rename in unchanged src/model-profiles/store.ts:163. Its isolated rerun passed all 18 tests. Every new/changed test file and manager/history tests passed in the full run.",
      "basis": "observed",
      "uncertainty": "Transient Windows filesystem failure classification is inferred from unchanged code and successful rerun; the external lock source is unidentified."
    },
    {
      "id": "E8",
      "kind": "execution",
      "locator": "pnpm run typecheck; pnpm run check:ci; pnpm --dir pi-packages/pi-subagents run typecheck; pnpm run test:pi-extensions",
      "claim": "Both root checks and package typecheck exit 0. Biome reports warnings/information, not errors. Built-extension verification passes 13/13.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E9",
      "kind": "build-verification",
      "locator": "scripts/build-pi-extensions.mjs; pi-packages/pi-subagents/dist/index.ts",
      "claim": "Independently reproduced the changed package bundle using the script's esbuild settings with write:false. Output is byte-identical to existing dist, SHA-256 03274db77714c4fe9fe6af29bad5c167aa70ce4a13d63d02e18d1b132442b4b7.",
      "basis": "observed",
      "uncertainty": "The reported successful full root build was not independently rerun because it writes generated workspace outputs."
    },
    {
      "id": "E10",
      "kind": "diff-review",
      "locator": "git diff; git status --short; pi-packages/pi-subagents/README.md; CHANGELOG.md",
      "claim": "The diff and untracked files are confined to the requested package behavior, tests, documentation and sole change record. No version bumps, unrelated edits or apparent secrets were found; git diff --check passes. Durable deltas agree with implementation.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E11",
      "kind": "memory",
      "locator": "mem_get:d2c0c8d7-4c76-566e-a75a-068c46930838",
      "claim": "Recalled history-database context under supplied project_key git:3726a62c-51e1-43ba-a466-57d41c5b7048. Recall-only; no provider writes or session lifecycle operations.",
      "basis": "observed",
      "uncertainty": "Supplied root_session_id was not used for attribution."
    }
  ],
  "verification": [
    {
      "check": "Record binding and durable baseline",
      "method": "Exact prefix-byte hashing, verify validator and canonical-spec digest comparison",
      "outcome": "pass",
      "evidenceIds": ["E1", "E10"],
      "reason": "Expected record hash and reviewed source baseline match."
    },
    {
      "check": "AC-1",
      "method": "Write-path inspection and executed history/manager tests",
      "outcome": "pass",
      "evidenceIds": ["E2", "E7"],
      "reason": "Execution detail is stored only on latest-task writes; retained readers and continuation work."
    },
    {
      "check": "AC-2",
      "method": "Pruning, scheduling, configuration and panel inspection/tests",
      "outcome": "pass",
      "evidenceIds": ["E3", "E7"],
      "reason": "Terminal-only pruning preserves retained data and active task rows, yields between batches and safely skips contention."
    },
    {
      "check": "AC-3",
      "method": "Executed compaction and command integration tests plus lock-lifetime inspection",
      "outcome": "pass",
      "evidenceIds": ["E4", "E7"],
      "reason": "Refusal is non-mutating; exclusion survives commits and VACUUM; late writers fail safely and normal access resumes."
    },
    {
      "check": "AC-4",
      "method": "Executed lifecycle, foreground, continuation, outbox and GC tests",
      "outcome": "pass",
      "evidenceIds": ["E5", "E7"],
      "reason": "Release gates protect durability and consumers without losing attempt identity or terminal behavior."
    },
    {
      "check": "AC-5",
      "method": "Projection/call-site inspection and executed tool/render tests",
      "outcome": "pass",
      "evidenceIds": ["E6", "E7"],
      "reason": "Bounded details, unchanged model-facing text and legacy rendering are covered."
    },
    {
      "check": "Initial full package suite",
      "method": "pnpm --dir pi-packages/pi-subagents test",
      "outcome": "fail",
      "evidenceIds": ["E7"],
      "reason": "Unrelated transient EPERM rename failure in unchanged model-profile storage; no change-related assertion failed."
    },
    {
      "check": "Failed-file rerun",
      "method": "pnpm --dir pi-packages/pi-subagents test test/model-profiles/store.test.ts",
      "outcome": "pass",
      "evidenceIds": ["E7"],
      "reason": "18/18 passed; combined with the full run, every package test file passed."
    },
    {
      "check": "AC-6",
      "method": "Required independent checks, documentation/diff review, in-memory bundle reproduction and built-extension tests",
      "outcome": "pass",
      "evidenceIds": ["E7", "E8", "E9", "E10"],
      "reason": "Required independent checks pass after the isolated environmental rerun; current changed bundle builds and activates; README and unreleased CHANGELOG cover the contract."
    },
    {
      "check": "Full root build rerun",
      "method": "pnpm run build",
      "outcome": "not-run",
      "evidenceIds": ["E9"],
      "reason": "Not rerun under read-only restrictions. Independently verified the changed bundle's build output and activation instead."
    }
  ],
  "risks": [
    {
      "description": "Non-blocking documentation mismatch: README describes integer retention days, but src/config.ts and its tests accept fractional non-negative numbers such as 0.5. Describe non-negative numeric days or consistently enforce integers.",
      "severity": "low",
      "blocking": false,
      "evidenceIds": ["E3", "E10"]
    },
    {
      "description": "The full-suite invocation encountered an unrelated Windows EPERM rename flake; its isolated rerun passed. Preserve both outcomes rather than reporting the original invocation as green.",
      "severity": "low",
      "blocking": false,
      "evidenceIds": ["E7"]
    },
    {
      "description": "Retain the root's native successful full-build evidence at closeout; this read-only review independently reproduced only the changed package bundle build.",
      "severity": "low",
      "blocking": false,
      "evidenceIds": ["E9"]
    }
  ],
  "openQuestions": [],
  "nextAction": "Validate this envelope, retain the check provenance, and proceed to closeout. Optionally correct the retention documentation wording.",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/pi-subagents-footprint/pi-subagents-footprint.md",
    "reviewedRecordSha256": "413a9e6f89d43cded23d3c300404066b50f2f6f2bb50fb152867966d35bf5e05"
  }
}
```

Fresh Oracle final verification (task subtask_thoth-oracle_1792600673015_cbeb6859), validated with validate-result.mjs --review-kind final-verification --record-sha256 (valid, PASS).
Root-native evidence: AC-6 closeout run reported pnpm run build exit 0 (4 root entrypoints, 10 Pi bundles), pnpm run typecheck exit 0, pnpm run check:ci exit 0, pi-subagents suite 96 files / 1,768 passed / 1 skipped, test:pi-extensions 13 passed. The Oracle full-suite run hit one unrelated Windows EPERM rename flake in unchanged src/model-profiles/store.ts:163; its isolated rerun passed 18/18.

- AC-1: PASS | history/manager tests (NULL attempt detail, zero events across run/continue) | Oracle E2, E7
- AC-2: PASS | history, config, history-pruning and panel tests (terminal-only, boundaries, batching, busy skip, deferred throttle, 0 disables, expired note) | Oracle E3, E7
- AC-3: PASS | history-compaction and extension command tests (exclusive lock across pruning and VACUUM, byte-identical refusal, late writers, shrink, reopen) | Oracle E4, E7
- AC-4: PASS | terminal-release and notification-outbox tests (release gates, write-failure pinning, same-id continuation, terminal operations, counts, GC) | Oracle E5, E7
- AC-5: PASS | result-details and render tests (allowlist projection, 2,000-char previews, no partial results, unchanged model text, legacy rendering) | Oracle E6, E7
- AC-6: PASS | pi-subagents suite, typecheck, check:ci, build, test:pi-extensions, CHANGELOG and README | Oracle E7, E8, E9, E10; root AC-6 closeout run
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:0b7ab1b6f9b6c387a5bb08dcd0bcde62f143c40fcf5f240e243c1ca2480546f1

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY

Non-blocking follow-up from final verification: the README describes integer retention days, while config accepts fractional non-negative numbers. Align the wording in a later change.
