# Change: claude-bridge-resume-cache

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: medium
**Risk**: medium

## Exploration

- Symptom (Pi session `01a15571`, model Claude Opus 5.5 1M via `pi-claude-bridge`): the first call in each new Pi process re-writes the whole conversation to the prompt cache (cacheRead ~31K, cacheWrite 116K–390K) although the previous call was ~3 minutes earlier. Mid-session system-section changes delivered as appended updates keep hitting the cache (e.g. cacheRead 109,394 / cacheWrite 6,264).
- Runtime evidence (`~/.claude/projects/C--Users-EremesNG-orca-workspaces-thoth-mem-context/`): across two resumes the CC session id changed (`6312f58f…` → `1b597ea5…`, `35c79f5a…` → `8e73e9c4…`). Live and rebuilt transcripts match until one user message. The rebuilt message lacks a 388-byte suffix in both cases. Root verified that suffix to be `"\n"` + the Thoth language reminder (sha256 `046f8dbf…`).
- Mechanism (all paths are under `pi-packages/pi-claude-bridge/`):
  - The Pi→CC mapping (`sessionId`, `cursor`, `cwd`, `piSessionId`, `needsRebuild`, `forceRotate`) and the append epoch (`recorded`, `effective`, `uncertain`) are process memory only (`src/index.ts:207-231,268-283`; `src/append-instructions.ts:20-50`). A new process imports converted Pi history into a new CC session (`src/index.ts:850-876`) and resets the epoch (`:871-872`).
  - Divergence 1: live, the trailing user run (the human message plus hidden custom messages such as `thoth-language-anchor`, which Pi persists and converts to separate `role:user` messages) is joined into one prompt (`src/index.ts:430-454`). The rebuild converts each historical message separately (`src/convert.ts:119-134`).
  - Divergence 2: the rebuild passes the latest folded system append (`src/transcript.ts:62-75`; `src/index.ts:1934-1943`) instead of the recorded epoch.
  - Divergence 3: historical `additionalContext` updates are not replayed.
- Feasibility: live continuation already spawns one CC subprocess per user turn with SDK `resume: <uuid>` (`src/index.ts:1757-1774,2123,2140-2153`). Resuming the same on-disk CC session from a new process uses the same mechanism; what is missing is a durable, validated checkpoint.
- Current reuse check (`src/index.ts:798-819`): mapping present, not dirty, `priorMessages.length >= cursor`, and at most one trailing assistant. It checks shape and count only.
- Existing tests cover same-process resume (`tests/int-session-resume.mjs`), cache over five same-process prompts (`tests/int-cache.sh`), and append-epoch mocks (`tests/unit-append-instructions.mjs`). The RPC harness always passes `--no-session` (`tests/lib/rpc-harness.mjs`). Nothing measures the cache after a process restart.
- Coordination: thoth-mem will deliver recovery as a persisted hidden custom message (`thoth-mem-recovery`, `display:false`) at session start/resume and after compaction. Pi stores and converts it exactly like the language anchor.

## Intent

When a persisted Pi session continues in a new Pi process (restart, `/resume`, `/reload`) within the cache TTL, the bridge resumes the same Claude Code session, with the same recorded system prompt and append epoch, whenever that session is provably the same conversation. The first post-resume request then reproduces the cached prefix. If continuity cannot be proven, the bridge falls back to today's rebuild.

## Non-goals

- Extending the prompt-cache TTL beyond 5 minutes.
- Byte-faithful rebuilds when the checkpoint is missing or invalid, or after abort, compaction or tree navigation (user-run grouping, folded system append). These stay as follow-up.
- Changes to thoth-mem, Pi core, or the user's Pi configuration; publish, release, or global install.
- Concurrent use of one Pi session by two Pi processes.

## Acceptance

- AC-1: After every cleanly completed bridge turn of a persisted Pi session, the bridge persists a checkpoint. The checkpoint is invalidated when a query starts and when an abort, query error, compaction, tree navigation, rebuild flag or UUID rotation happens.
- AC-2: In a new process, or after the in-memory state is cleared, a valid checkpoint restores the mapping and the append epoch. The next query resumes the same CC session id with the recorded system append, does not re-import history, and keeps the appended-update semantics.
- AC-3: Each of the following falls back to the existing rebuild path and leaves no stale checkpoint reusable:
  - a different Pi session id (fork or clone);
  - a different Pi history prefix, including a content-only change that keeps roles, timestamps and tool-call ids, and a change only to the turn's final assistant message beyond the cursor;
  - a cwd or Claude config dir mismatch;
  - a missing CC transcript, or one whose size, last-record id or full-content digest differs, including an equal-size interior edit that keeps the final id;
  - an in-flight or invalid checkpoint;
  - an unknown schema version.
- AC-4: A live integration test measures the first call after a real Pi process restart. It uses a persisted session, a hidden custom message per turn, and Haiku (Sonnet allowed if Haiku is unusable). Let `prior = cacheRead + cacheWrite` of the last pre-restart call, excluding uncached input and output. The test passes when the first post-restart call has `cacheRead >= prior - 256` tokens. On the baseline code it must fail that check by more than 1,000 tokens; with the change it must pass.
- AC-5: The existing bridge unit suite, the repository typecheck, `check:ci` and the build pass. The CHANGELOG has an UNRELEASED entry and the README documents the behavior.

## Clarifications

- The user (2026-10-20) authorized live integration tests through their Claude Code authentication with Haiku, and allowed Sonnet if Haiku fails.
- The TTL beyond 5 minutes is out of scope, as stated in the handoff.

## Decisions

- D1: Reuse the existing CC session instead of reconstructing a byte-faithful rebuild. Live turns already resume from disk. Rebuild fidelity would have to mimic CC's attachment records and Pi context transformations.
- D2: Persist a bridge-owned sidecar JSON per Pi session id under Pi's agent dir, in the same base as `src/log-paths.ts`. Writes are atomic (temp file plus rename) and the file carries a schema version. Pi session custom entries are not used: forks would inherit them, and the epoch append would bloat the session file.
- D3: Checkpoint fields:
  - schema version and status;
  - Pi session id, cwd and Claude config dir;
  - CC session id and cursor;
  - Pi prefix proof: a proof length `L` and a SHA-256 over a canonical (sorted-key) JSON projection of every model-visible field of the first `L` messages. That covers role, timestamp, and every content block: text, image data and MIME type, thinking text and signature, tool calls with id, name and arguments, and tool results with tool-call id, name, content and error flag. Non-model fields such as usage or details are excluded.
    - `L` binds the whole completed turn: the first `cursor` messages plus the turn's final assistant message, which Pi appends after the cursor is recorded (`src/index.ts:2239-2254`), so `L` is `cursor + 1` when that message exists. The final assistant is taken as finalized for Pi, either the bridge-built output message or Pi's `turn_end`/`agent_end` message.
    - Cross-process restore requires `priorMessages.length === L` exactly and a matching digest. The in-memory reuse rule is unchanged.
  - CC transcript fingerprint: byte size, the last record's uuid, and a streaming SHA-256 of the whole file. Size and uuid serve as quick rejection checks; the digest is the proof.
  - append epoch `{recorded, effective, uncertain}`, restored field by field without restarting the epoch.
- D4: Checkpoint lifecycle:
  - Invalidate when a query starts.
  - Write only after a clean completion, once the CC subprocess has closed.
  - Delete on abort, error, compaction, tree navigation, `needsRebuild` or `forceRotate`.
  - Skip checkpointing for non-persisted Pi sessions.
  - Prune checkpoints older than 7 days opportunistically.
- D5: Restore lazily at the reuse decision when no in-memory mapping exists, before choosing a rebuild. Lifecycle handlers keep clearing memory as today.
- D6: Hidden custom messages (`thoth-language-anchor`, `thoth-mem-recovery`) need no special handling. They are joined live in the trailing user run, and the reused CC transcript keeps them byte-identical.
- D7: Debug logs record the restore decision and the mismatch reason only, never conversation content.

## Durable deltas

- `ADDED pi-ecosystem` **Claude bridge resumes Claude Code sessions across Pi processes** — `@thoth-agents/pi-claude-bridge` MUST, when a persisted Pi session continues in a new Pi process or after its in-memory bridge state was cleared, resume the Claude Code session of the last cleanly completed bridge turn with that session's recorded system prompt and append epoch instead of rebuilding it, but only when it can prove the same Pi session, the same Pi history prefix and an unchanged Claude Code transcript; otherwise it MUST rebuild as before, and it MUST NOT reuse a checkpoint left by an aborted, failed, compacted, rewritten or in-flight turn.
  - GIVEN a persisted Pi session whose last turn completed through the bridge and whose Claude Code transcript is unchanged; WHEN Pi restarts and the session continues with a new prompt; THEN the bridge resumes the same Claude Code session id with the same recorded system prompt without re-importing history, so the request reuses the cached conversation prefix .

## Plan

- New `src/session-checkpoint.ts`, mostly pure:
  - checkpoint path resolution under Pi's agent dir (as in `src/log-paths.ts`), plus serialize and parse with a schema version;
  - Pi prefix digest over the canonical model-visible projection from D3, deterministic across the session-file round trip;
  - CC transcript fingerprint: `stat` size, last JSONL record id and a streaming full-content SHA-256. The transcript is located like cc-session-io's `getSessionPath`, honoring `CLAUDE_CONFIG_DIR`;
  - a `validate` function that returns ok or a reason;
  - atomic write, delete and prune.
- `src/append-instructions.ts`: export and import of epoch state per CC session id, with semantics unchanged.
- `src/index.ts`:
  - At the reuse decision (`:798-850`), when no mapping exists, try to restore and validate a checkpoint. On success, install the mapping and the epoch, then take the reuse branch.
  - At query start, invalidate the checkpoint. After a clean completion, write it only once the CC subprocess has actually exited (an awaited close or exit signal, not merely a synchronous `close()` call or the result message). A later invalidation must not be overwritten by a publication that was still in flight.
  - On abort, error, compaction or tree navigation (`:2209-2269`, `:2709-2729`), and on rebuild or rotation flags, delete it.
  - Log decisions to debug only.
- Tests:
  - `tests/unit-session-checkpoint.mjs`: pure validation matrix, plus restore in the style of `unit-append-instructions`/`unit-querycontext` with a mocked query (same CC id, recorded append, no import; fallback cases). It includes:
    - Pi digest stability across a session-file JSON round trip;
    - rejection of a same-metadata content change;
    - rejection of a change only to the final assistant message beyond the cursor;
    - rejection of an equal-size interior CC edit;
    - a delayed final CC write after close;
    - invalidation racing a checkpoint publication;
    - epoch restore with `uncertain` preserved.
  - `tests/int-session-restart-cache.mjs`: live test using an opt-in persisted-session option in `tests/lib/rpc-harness.mjs` and a fixture extension that emits a hidden custom message per turn. It adds a sizable tool result so the message prefix is clearly larger than tools plus system.
- Docs: README (session resume across restarts) and CHANGELOG UNRELEASED.
- Verification seams: the bridge unit suite; the live int test before and after (before must miss, after must hit), each run against a freshly built local `dist` because the RPC harness loads the package's dist entrypoint, and each awaiting real Pi process exit before restarting; repository `pnpm run typecheck`, `pnpm run check:ci` and `pnpm run build`.
- Risks:
  - CC writing late records after close: the fingerprint mismatches and the bridge rebuilds safely, at the cost of the cache.
  - Restored tools, model or config differing from the pre-restart turn, which reduces cache hits without breaking correctness.
  - Windows atomic rename semantics.
  - Checkpoint files accumulating, mitigated by pruning.

## Tasks

- [x] AC-4: Live restart-cache integration test and baseline measurement
  - Outcome: a test that measures first-call cache usage after a real Pi process restart, run on the unchanged code
  - Known entrypoints and skill paths: `pi-packages/pi-claude-bridge/tests/lib/rpc-harness.mjs`, `tests/int-cache.sh`, `tests/int-session-resume.mjs`, `tests/fixtures/`, `pi-packages/pi-claude-bridge/AGENTS.md`; skill `C:\Users\EremesNG\.pi\agent\skills\tdd\SKILL.md`
  - Inputs: this record (Exploration, AC-4, D6)
  - Dependencies: none
  - Output: `tests/int-session-restart-cache.mjs` with opt-in harness support; baseline cacheRead/cacheWrite of the last pre-restart and first post-restart calls
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-claude-bridge/tests/int-session-restart-cache.mjs`, `pi-packages/pi-claude-bridge/tests/lib/rpc-harness.mjs` (opt-in option only), `pi-packages/pi-claude-bridge/tests/fixtures/**` (new fixture only), package test script entry if the package lists int tests
  - Interface boundaries: existing int tests keep `--no-session` behavior; no src changes; temp dirs only for Pi sessions
  - Focused check and PASS evidence: after a fresh `dist` build of the unchanged source, the test runs live with Haiku and fails the AC-4 check by more than 1,000 tokens (expected baseline FAIL); the numbers are reported
  - Return milestone: the test exists and the baseline numbers are reported
  - Stop / reassessment: if the baseline already hits the cache, or the harness cannot persist and resume a session, return the evidence
- [x] AC-1: Durable checkpoint module and write/invalidate lifecycle
  - Outcome: checkpoint persisted after clean turns and invalidated on unsafe events
  - Known entrypoints and skill paths: `pi-packages/pi-claude-bridge/src/index.ts:207-283,798-876,1757-1805,2123-2308,2570-2600,2662-2729`, `src/append-instructions.ts:20-77`, `src/log-paths.ts`, `src/attachments.ts`, `tests/unit-append-instructions.mjs`, `tests/unit-querycontext.mjs`; skills `C:\Users\EremesNG\.pi\agent\skills\tdd\SKILL.md`, `C:\Users\EremesNG\.pi\agent\skills\simplify\SKILL.md`
  - Inputs: this record (D2-D7, Plan), accepted AC-4 baseline
  - Dependencies: AC-4 baseline row accepted (src must stay unchanged while the baseline runs)
  - Output: `src/session-checkpoint.ts`, lifecycle wiring, and unit tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-claude-bridge/src/**`, `pi-packages/pi-claude-bridge/tests/unit-*.mjs`, `pi-packages/pi-claude-bridge/README.md`, `pi-packages/pi-claude-bridge/CHANGELOG.md`
  - Interface boundaries: rebuild path and appended-update semantics unchanged; `.thoth/specs` not edited
  - Focused check and PASS evidence: new and existing bridge unit tests pass
  - Return milestone: together with AC-2, AC-3 and AC-5 in one assignment
  - Stop / reassessment: the CC transcript fingerprint cannot be read reliably, or the epoch cannot be restored without changing appended-update semantics
- [x] AC-2: Validated restore into the reuse branch
  - Outcome: a valid checkpoint resumes the same CC session with the recorded append and no history import
  - Known entrypoints and skill paths: same as the AC-1 row
  - Inputs: AC-1 output (same assignment)
  - Dependencies: none beyond the same assignment
  - Output: restore wiring and unit tests
  - Owner: thoth-worker
  - Writes: same as the AC-1 row
  - Interface boundaries: reuse conditions at `src/index.ts:798-819` unchanged for in-memory mappings
  - Focused check and PASS evidence: a unit test proves the same CC id, the recorded system append, no import, and correct appended updates after restore
  - Return milestone: same assignment as AC-1
  - Stop / reassessment: same as the AC-1 row
- [x] AC-3: Fallback matrix for every invalid checkpoint
  - Outcome: every mismatch falls back to rebuild
  - Known entrypoints and skill paths: same as the AC-1 row
  - Inputs: AC-1 output (same assignment)
  - Dependencies: none beyond the same assignment
  - Output: validation reasons and unit tests
  - Owner: thoth-worker
  - Writes: same as the AC-1 row
  - Interface boundaries: the rebuild output stays identical to the current behavior
  - Focused check and PASS evidence: one unit case per AC-3 mismatch passes, including the same-metadata content change and the equal-size interior CC edit
  - Return milestone: same assignment as AC-1
  - Stop / reassessment: same as the AC-1 row
- [x] AC-5: Local closeout gate and docs
  - Outcome: suite, typecheck, lint and build pass, with the changelog and README updated
  - Known entrypoints and skill paths: `AGENTS.md` (repository), `docs/agent/testing.md`, `pi-packages/pi-claude-bridge/package.json`
  - Inputs: AC-1 to AC-3 output (same assignment)
  - Dependencies: none beyond the same assignment
  - Output: passing gate evidence
  - Owner: thoth-worker
  - Writes: same as the AC-1 row
  - Interface boundaries: no version bumps
  - Focused check and PASS evidence: the bridge unit suite, `pnpm run typecheck`, `pnpm run check:ci` and `pnpm run build` exit 0
  - Return milestone: same assignment as AC-1
  - Stop / reassessment: an unrelated environment failure is reported with evidence
- [x] AC-4: Live after-change measurement
  - Outcome: the restart test passes on the changed code
  - Known entrypoints and skill paths: `pi-packages/pi-claude-bridge/tests/int-session-restart-cache.mjs`
  - Inputs: accepted AC-4 test and AC-1 to AC-3 implementation
  - Dependencies: the AC-4 baseline row and the AC-1 row accepted
  - Output: first post-restart cacheRead/cacheWrite numbers
  - Owner: thoth-worker
  - Writes: none
  - Interface boundaries: none
  - Focused check and PASS evidence: after a fresh `dist` build, the live test passes the AC-4 check (`cacheRead >= prior - 256`)
  - Return milestone: after the run
  - Stop / reassessment: a miss persists despite reuse; return the evidence for wire capture (`diag/capture-proxy.mjs` needs separate approval)

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

Plan review: the user explicitly selected Oracle review (2026-10-20). Round 1 was REJECT (Pi digest covered identity only; CC fingerprint was size plus last uuid). Round 2 was REJECT (the final assistant fell outside the proof). Round 3 was a validated OKAY with no risks; each round used a fresh Oracle.
Implementation: the user explicitly authorized it after the validated OKAY (2026-10-20).

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: f23a502dee5c2e643c23977d9e899e4c0b17ecd8aaeb270a3d8c0d816a735240

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS. The implementation satisfies AC-1 through AC-5 and D1-D7. No blocking defects found.",
  "evidence": [
    {
      "id": "E1",
      "kind": "record-binding",
      "locator": ".thoth/changes/claude-bridge-resume-cache/claude-bridge-resume-cache.md",
      "claim": "Independently recomputed prefix SHA-256 matches f23a502dee5c2e643c23977d9e899e4c0b17ecd8aaeb270a3d8c0d816a735240. The verify validator passes; canonical source digest matches. The sole overlap warning concerns distinct requirements.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E2",
      "kind": "source-review",
      "locator": "pi-packages/pi-claude-bridge/src/session-checkpoint.ts",
      "claim": "Restore requires exact identity, schema/status, L=cursor+1, exact prior-history length, canonical model-visible digest, and CC size/final-uuid/full-file SHA-256. Publication checks confirmed successful exit and invalidation generation. Same-directory exclusive temporary writes use atomic rename without unlinking the target.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E3",
      "kind": "source-review",
      "locator": "pi-packages/pi-claude-bridge/src/index.ts; src/append-instructions.ts; src/query-state.ts",
      "claim": "Lifecycle wiring invalidates unsafe checkpoints, skips non-persisted sessions, lazily restores mapping and epoch field-wise, and includes the finalized assistant and latest tool-result history in publication. Actual child exit is observed with a bounded wait. Existing in-memory reuse conditions and rebuild conversion remain unchanged; new logs contain decisions/reasons only.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E4",
      "kind": "executed-tests",
      "locator": "pnpm --dir pi-packages/pi-claude-bridge run test:unit",
      "claim": "478 tests passed, zero failures. Reviewed new assertions cover content-only/final-assistant changes, equal-size CC edits, delayed subprocess flush, invalidation races, epoch uncertainty, restore without import, tool continuations, lifecycle deletion, non-persistence, and Windows atomic replacement.",
      "basis": "observed",
      "uncertainty": "Transport behavior is mocked except for local subprocess exit/flush checks."
    },
    {
      "id": "E5",
      "kind": "executed-checks",
      "locator": "bridge typecheck; root typecheck; root check:ci; git diff --check",
      "claim": "All exited successfully. check:ci reported 753 warnings and nine informational diagnostics, with no errors. Status and complete tracked/untracked implementation review found no unrelated or secret changes.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E6",
      "kind": "integration-review",
      "locator": "pi-packages/pi-claude-bridge/tests/int-session-restart-cache.mjs; tests/fixtures/restart-cache-extension.ts; tests/lib/rpc-harness.mjs; record Verification",
      "claim": "The test asserts persisted hidden reminders, substantive cached-history growth, actual process shutdown/restart, unchanged Pi identity/history, and first-post-restart cacheRead >= prior-256. Reported baseline shortfall is 11,916 tokens; changed-code cacheRead 16,437 equals prior 16,437, with the same CC id across processes. Validated same-transcript resume plausibly produces this result.",
      "basis": "inferred",
      "uncertainty": "Live measurements are root-reported; no authenticated integration test was rerun."
    },
    {
      "id": "E7",
      "kind": "documentation-and-build-evidence",
      "locator": "pi-packages/pi-claude-bridge/README.md; CHANGELOG.md; record Verification",
      "claim": "README documents checkpoint location, privacy, validation, invalidation, TTL and concurrency limits; CHANGELOG contains an UNRELEASED entry. The record reports successful bridge and repository builds.",
      "basis": "observed",
      "uncertainty": "Build success is reported evidence, not independently reexecuted."
    }
  ],
  "verification": [
    {
      "check": "Record binding and governance",
      "method": "Exact-byte hashing, verify validator, constitution and canonical-spec review",
      "outcome": "pass",
      "evidenceIds": ["E1"],
      "reason": "Assigned record and canonical baseline match."
    },
    {
      "check": "AC-1: safe publication and invalidation",
      "method": "Lifecycle/source audit and offline unit suite",
      "outcome": "pass",
      "evidenceIds": ["E2", "E3", "E4"],
      "reason": "Confirmed exit gates publication; generations prevent publication after later invalidation."
    },
    {
      "check": "AC-2: mapping and append-epoch restore",
      "method": "Restore-path audit and assertions for same id, recorded append, unchanged transcript and subsequent updates",
      "outcome": "pass",
      "evidenceIds": ["E3", "E4"],
      "reason": "Field-wise restore preserves appended-update semantics without history import."
    },
    {
      "check": "AC-3: fail-closed fallback",
      "method": "Validation matrix, rejection wiring and rebuild-diff review",
      "outcome": "pass",
      "evidenceIds": ["E2", "E3", "E4"],
      "reason": "Required identity, history, transcript, state and version mismatches reject reuse and invalidate the stale checkpoint."
    },
    {
      "check": "AC-4: real restart cache regression",
      "method": "Integration assertion audit and assessment of supplied baseline/after-change telemetry",
      "outcome": "pass",
      "evidenceIds": ["E6"],
      "reason": "Reported measurements satisfy both thresholds; implementation plausibly preserves the cached prefix."
    },
    {
      "check": "AC-5: offline gates, documentation and scope",
      "method": "Executed unit suite, package/root typechecks, check:ci and diff check; documentation review",
      "outcome": "pass",
      "evidenceIds": ["E4", "E5", "E7"],
      "reason": "Independent offline checks pass and required documentation is present."
    },
    {
      "check": "Independent build execution",
      "method": "Reviewed existing build evidence only",
      "outcome": "not-run",
      "evidenceIds": ["E7"],
      "reason": "Builds mutate generated output and were not rerun during this read-only assignment; recorded build results are successful."
    }
  ],
  "risks": [
    {
      "description": "Live cache telemetry and build success rely on supplied execution evidence rather than independent reruns.",
      "severity": "low",
      "blocking": false,
      "evidenceIds": ["E6", "E7"]
    }
  ],
  "openQuestions": [],
  "nextAction": "Validate this unchanged envelope, record acceptance, and run closeout before archive.",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/claude-bridge-resume-cache/claude-bridge-resume-cache.md",
    "reviewedRecordSha256": "f23a502dee5c2e643c23977d9e899e4c0b17ecd8aaeb270a3d8c0d816a735240"
  }
}
```

After PASS, root pastes the Oracle's unchanged final-verification envelope here.

- AC-1: PASS | `tests/unit-session-checkpoint.mjs` (part of the bridge unit suite, 478/478) | The worker reported clean publication after confirmed CC exit, delayed flush, invalidation races, abort/error/rewrite deletion, pruning and the non-persisted skip.
- AC-2: PASS | `tests/unit-session-checkpoint.mjs`; live `tests/int-session-restart-cache.mjs` | Same-id restore without import, recorded append and uncertain epoch restored. Live: CC session id `e5041eb8…` was identical in processes A and B.
- AC-3: PASS | `tests/unit-session-checkpoint.mjs` | A full mismatch matrix covers the fork id, same-metadata and final-assistant-only edits, cwd/config, a missing transcript, size/id/digest including an equal-size interior edit, in-flight state and an unknown schema.
- AC-4: PASS | live `tests/int-session-restart-cache.mjs`, Haiku 4.5, Pi 1.3.0, fresh dist | Baseline (unchanged src): prior 16,419, post cacheRead 4,247 / cacheWrite 12,240, assertion failed by 11,916 tokens. After the change (root run): prior 16,437, post cacheRead 16,437 / cacheWrite 155, deficit 0, PASS.
- AC-5: PASS | the bridge unit suite, bridge build, root `pnpm run typecheck`, `pnpm run check:ci`, `pnpm run build` | The worker reported 478/478 and exit 0 for all (check:ci: 753 existing warnings, no errors). CHANGELOG UNRELEASED and README were updated.
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:dd422afba5535522426f658838c29ce833c8d7ad5845ec52978c677f140b9a62

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
