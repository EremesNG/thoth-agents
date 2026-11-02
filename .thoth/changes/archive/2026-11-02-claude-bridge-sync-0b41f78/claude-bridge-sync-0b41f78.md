# Change: claude-bridge-sync-0b41f78

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: high
**Risk**: high

## Exploration

- The fork `pi-packages/pi-claude-bridge` is synced through upstream `df964a9` (archived change `claude-bridge-sync-0-9-3`). Upstream `elidickinson/pi-claude-bridge` main is now at `0b41f78` (2026-10-30). The range `df964a9..0b41f78` contains 47 commits, 84 files, +9,854/−1,862 lines. Everything is still listed under UNRELEASED, and the upstream version stays 0.9.3. A fresh partial clone is available at `/tmp/tmp.oO0cnykFQ7/upstream`, with the range diff in `/tmp/tmp.oO0cnykFQ7/range.patch`.
- Dominant change, #222 "content-digest session sync" (`138514b`, `10e61df`, `cfd8de7`, `1924417`, `d54a2ee`, `9584d5e`, `0f83d59`, `e6f8838`, `320c76d`, merged by `b151768`; design in upstream `PLAN-SESSION-SYNC.md`):
  - Reuse is decided by per-message content digests of Pi history instead of message counts.
  - On a difference, Claude Code records are kept up to the last valid cut, either through `resumeSessionAt` + `forkSession` or by writing a new session from the recorded prefix plus the converted remainder. Every change takes a new session id, and nothing is rewritten in place.
  - Per-Pi-session state (`version`, `ccSessionId`, `cwd`, `model`, `digests`, `uuids`, `cuttable`) is persisted atomically in `getAgentDir()/claude-bridge/sessions/s-<sha256(piSessionId utf16le)>.json` after the child exits.
  - New files: `src/message-digests.ts`, `src/session-sync.ts`, `src/session-store.ts`, `src/session-transcript.ts`, `src/query-process.ts`.
- Later upstream fixes, all built on the rewritten `index.ts`:
  - `8a60b18`: finalized assistants stay immutable; queued steering keeps MCP connected.
  - `ef04886`: the bash default timeout is applied at execution through a `tool_call` hook.
  - `51e7461`, `3bf870b`, `10008ac`: session-scoped shutdown, closing parked queries, routing tool results by Pi session.
  - `8bac4f3`: a project `.pi/claude-bridge.json` cannot set the provider, and Claude Code loads only user settings (`settingSources: ["user"]`).
  - `cffc7d2`: version provenance is logged.
  - `87f67d1`: the non-streaming fallback keeps every block.
  - `e93d51d`, `7e36c4f`: child-only traffic flag; parent CC markers are stripped; Pi provider env is applied to the child, where an empty value unsets; session-storage overrides are refused.
  - `4601750`: Extra Usage warning.
  - `2edde93`: `CLAUDE_CODE_RESUME_INTERRUPTED_TURN_MAX_AGE_MS=1`.
  - `2558f47`: SDK pinned exactly `0.3.308`.
  - `f2546df`: upstream Pi dev deps `^1.4.0`. The workspace is already exactly 1.4.0 (change `pi-dev-pins-1-4-0`).
  - Also: diagnostics under `diag/**`, about 13 new unit test files, and expanded suites.
- Apply feasibility (`git apply --check --directory=pi-packages/pi-claude-bridge`, nothing applied): 73 files apply cleanly. 11 conflict: `AGENTS.md`, `CHANGELOG.md`, `README.md`, `package-lock.json` (excluded), `package.json`, `src/convert.ts`, `src/index.ts`, `src/query-state.ts`, `tests/lib/rpc-harness.mjs`, `tests/unit-config.mjs`, `tests/unit-rate-limit.mjs`.
- Reconciliation of local fork features against upstream `0b41f78`:
  - Subsumed by #222: cursor/checkpoint restoration and publication (`src/index.ts` ~817–853, ~2378–2411) and the checkpoint history proof (`src/session-checkpoint.ts`).
  - Not equivalent: local resume promised the same Claude session id, only after clean exits and with a full-transcript proof. Upstream loads state dirty, keeps acknowledged progress after interruptions and normally forks to a new id.
  - Carry on top (no upstream equivalent):
    - Appended-instruction epochs and delta refresh (`src/append-instructions.ts`, `src/append-blocks.ts`). Upstream keeps the recorded `prompt_snapshot` on resume and fork, so an append change is ignored there, exactly what the local delta channel compensates for.
    - Wrapped-tool replay (`convertPiMessages(…, wrappedToolNames)`, needed at both upstream `importHistory()` call sites in `syncSharedSession()`).
    - Immediate pi-core rate-limit delivery (`src/query-state.ts:25–35`).
    - Windows test isolation and `rpc-harness` options.
    - The Orca-neutral native runtime (`src/claude-runtime.ts`, to be integrated at `QueryProcess.spawn`).
    - Cached-factory configuration pinning and registration ownership.
    - Prompt-section projection, MCP tool-name note, quota, AskClaude rendering, tool publication and tool schema normalization.
  - Already upstream: summaries left to Pi, session cwd, session-scoped query closing.
- Old local checkpoints live in `getAgentDir()/claude-bridge/session-checkpoints` with a different name and schema. Upstream neither reads nor misreads them, and they cannot be migrated, because they lack per-message UUID/cuttable coverage. Ignoring them costs one history rebuild, and its cache, per continuing session.
- The bridge runs the Claude Code binary bundled with the SDK platform package (`src/claude-runtime.ts:66–86`), not the user's installed CLI. Pinning the SDK at `0.3.308` therefore only changes the bridge's bundled Claude Code (2.1.309 → 2.1.308).
- Upstream PR #212 (progress updates shown as text) is not in this range and is a separate later change.

## Intent

Re-sync `pi-packages/pi-claude-bridge` from upstream `df964a9` to `0b41f78` and adopt the upstream #222 content-digest session sync as the base. Adopt every later upstream fix, and carry the fork's local features on top of upstream's design.

## Non-goals

- Upstream PR #212 or any progress-update/narration handling.
- Migrating or deleting old-format checkpoint files.
- Upstream's `^1.4.0` Pi dev range: the workspace keeps its exact `1.4.0` pin. No `package-lock.json`, no package version bump, no publishing.
- Running live suites (`test`, `test:usage`, `tests/int-*`); upstream integration tests are adopted but not run.
- Adopting upstream root-schema flattening (not in this range); local `normalizeToolSchema` wrapping under `input` stays.
- Restoring the old guarantees of same session id, clean-only reuse and a full-transcript checksum.

## Acceptance

- AC-1: Every upstream change in `df964a9..0b41f78` is present in `pi-packages/pi-claude-bridge`, adapted to local structure as decided in this record:
  - The 73 cleanly applying files are applied, and the 10 remaining conflicting files are hand-merged.
  - Subsumed local checkpoint code and its tests are removed.
  - Package `typecheck` and `test:unit` pass.
- AC-2: The upstream unit suites added or changed in the range pass on Windows. These include message digests, session store, shared-session sync, session prefix, live recording, cross-session turns, query lifecycle and process, queued steer, finalized immutability, bash timeout, native launch, nonstreaming fallback and config. Each local adaptation of an upstream test is listed with its reason.
- AC-3: Local features carried on top still work, and their existing tests pass, unchanged unless upstream intentionally changed the asserted behavior (each such change listed). The features are:
  - appended instructions, prompt sections and the MCP tool-name note
  - wrapped-tool replay through both `importHistory()` paths
  - immediate pi-core rate-limit delivery, quota
  - the Orca-neutral runtime
  - factory ownership, AskClaude rendering and tool publication

  New request-context regression tests prove that append state follows the retained records (D4), including after a Pi restart:
  - a fork or prefix rewrite that cuts before a delivered refresh delivers that refresh again;
  - a cut after it sends nothing redundant;
  - a retained recording without valid append evidence delivers the full current appended instructions;
  - a session written from Pi history starts a new epoch carrying the current appended instructions in its system prompt.
- AC-4: With an old-format `claude-bridge/session-checkpoints` directory present, the bridge neither reads nor deletes it, and a continuing session is written from Pi history once and then recorded under the new state format (test).
- AC-5: `@anthropic-ai/claude-agent-sdk` is pinned exactly `0.3.308`, `pnpm-lock.yaml` resolves it, the SDK-bundled Claude Code executable still resolves on Windows, and the pre-merge bridge passes `test:unit` and `typecheck` on it.
- AC-6: `README.md` records upstream sync base `0b41f78` and describes the new restart/fork semantics instead of the old checkpoint guarantees, while keeping fork-specific sections. `CHANGELOG.md` records the sync, and `AGENTS.md` merges upstream guidance with local rules.
- AC-7: Package `test:unit`, `typecheck` and `build`, and root `pnpm run check:ci`, `pnpm run typecheck` and `pnpm run test:pi-extensions` (after build), all pass.

## Clarifications

- The user chose the full sync including #222 (2026-11-02).
- Resume contract: the user chose upstream semantics and the matching spec modification.
- Old checkpoints: the user chose to ignore them (one-time rebuild) without deleting them.
- SDK: the user chose the exact `0.3.308` pin after confirming it does not touch their installed Claude CLI.
- No other material question remains. Merge details follow repository evidence and the decisions below.

## Decisions

- D1: Upstream #222 is the base design. Delete the subsumed local cursor/checkpoint pipeline (`src/session-checkpoint.ts`, restoration and publication in `src/index.ts`, and their tests). Its spec requirement is modified below.
- D2: Ignore old checkpoints (no read, no delete, no migration).
- D3: Pin the Claude Agent SDK exactly at `0.3.308`. If needed, update the `src/claude-runtime.ts` resolver comment and behavior for 0.3.308.
- D4: Bind append-instruction state to the recorded Claude Code records, persisted atomically in the same per-Pi-session state file as upstream's recording. The state holds the epoch's base value (the appended instructions in the session's recorded system prompt) and, for each refresh delivered through the conversation-context channel, the recording position of the record that carried it plus the resulting effective value. A fork or prefix rewrite never inherits the source's latest state as a whole, because the recorded `prompt_snapshot` and only the records before the cut are kept.
  - Plain resume (upstream row 4): the latest effective value applies.
  - Fork or recorded-prefix rewrite at a cut (rows 6–7): keep the base and only the refreshes carried by retained records. The effective value is the last retained refresh, or the base when there is none. Refreshes after the cut are dropped from state, so the next turn delivers them again as needed.
  - Write from Pi history (rows 0, 2, 3, 5): a new epoch whose base is the appended instructions used for the new session's system prompt, with no refreshes.
  - A retained recording whose append evidence is missing, invalid or inconsistent with the retained positions is uncertain: the next turn delivers the full current appended instructions, and that delivery becomes the state's first refresh. A fresh epoch is never assumed for retained records.
  - The same position-bound state is loaded after a Pi restart.
  - Exact position semantics follow upstream cut resolution: a refresh is retained if and only if the record carrying it is among the records kept by the cut.
- D5: Pass `wrappedToolNames` through `importHistory()` at both the full-history and suffix call sites, keeping upstream conversion-origin accounting.
- D6: Keep immediate pi-core rate-limit delivery for every producing query alongside upstream's held rate limit.
- D7: Keep local Windows test isolation (`USERPROFILE`, explicit session paths, `piCli`) and add upstream's `persistSession`/`bridgeDir` harness options. Adopt upstream's project-provider security expectations in `unit-config`.
- D8: Integrate the Orca-neutral runtime at upstream `QueryProcess.spawn`, keeping auxiliary executable resolution separate.
- D9: Keep factory configuration pinning and registration ownership, together with upstream's `Symbol.for` session registry and mirror retention.
- D10: Adopt upstream security/config (#198), child env changes, the Extra Usage warning, parked-query closing and routing, and the bash timeout via the `tool_call` hook.
- D11: Adopt the cleanly applying upstream `diag/**`, `TODO.md`, `PLAN-SESSION-SYNC.md` and `diag/AUDIT.md` to minimize future divergence. Adopt upstream integration tests without running them.
- D12: Use the established vendoring procedure: `git apply --directory=pi-packages/pi-claude-bridge` for clean files, then a hand-merge.

## Durable deltas

- `MODIFIED pi-ecosystem` **Claude bridge resumes Claude Code sessions across Pi processes** — `@thoth-agents/pi-claude-bridge` MUST persist, per Pi session, the Claude Code session it last recorded together with per-message content digests of the Pi history that session received, and when that Pi session continues, including in a new Pi process or after its in-memory bridge state was cleared, MUST compare the current Pi history with that recording by those digests: on a match it MUST continue from the recorded Claude Code records, and on a difference it MUST keep the recorded records up to the last valid cut before the first difference in a new Claude Code session and add only the differing remainder, never rewriting or deleting an existing Claude Code transcript in place; it MUST write Pi's history to a new Claude Code session when no usable recording exists (none persisted, an unrecognized format, a different model or working directory, a missing transcript or no valid cut), and MUST NOT read or delete state left in the previous checkpoint format.
  - GIVEN a persisted Pi session whose earlier turns ran through the bridge and whose recording was saved after the Claude Code process exited; WHEN Pi restarts and the session continues with a new prompt; THEN the bridge continues from the recorded Claude Code records in a session that keeps them without re-importing that history, and the original transcript file is left unchanged.
- `MODIFIED pi-ecosystem` **Claude bridge keeps appended instructions current** — `@thoth-agents/pi-claude-bridge` MUST, for a resumed Claude Code session within one recording epoch, deliver through Claude Code's conversation-context channel the appended system instructions that changed since the latest ones the model has been given (including a return to the recorded value or an empty value) as the added, changed and removed top-level blocks labeled as superseding the same blocks of earlier versions, falling back to the full current appended instructions when blocks cannot be identified unambiguously, MUST keep every delivered context value within Claude Code's inline limit by splitting larger updates, MUST deliver nothing extra when they are unchanged, and MUST NOT disable Claude Code system prompt recording or replace the recorded system prompt; a Claude Code session forked or rewritten from recorded records keeps the recorded system prompt and MUST treat as already given only that system prompt and the instruction updates carried by the records it keeps, so updates delivered after the cut are delivered again, MUST deliver the full current appended instructions when it cannot establish which updates the kept records carry, MUST preserve this state across Pi restarts, and a session written from Pi's history MUST start a new epoch whose recorded system prompt carries the current appended instructions.
  - GIVEN a resumed Claude Code session whose large appended instructions changed in one small block after it started; WHEN the next prompt runs through the bridge; THEN the model receives that changed block inline in its context, unchanged blocks are not resent, and the recorded system prompt and its cache prefix stay unchanged.
- `ADDED pi-ecosystem` **Claude bridge ignores repository-controlled settings** — `@thoth-agents/pi-claude-bridge` MUST NOT let repository-controlled files choose its provider or Claude Code settings: a project `.pi/claude-bridge.json` MUST NOT set the provider configuration, and the Claude Code processes it starts MUST load only the user's own Claude Code settings, not project or local settings.
  - GIVEN a repository whose `.pi/claude-bridge.json` sets a provider and whose Claude Code project settings set options; WHEN a Pi session in that repository runs a turn through the bridge; THEN the bridge keeps the user-level provider configuration and Claude Code ignores the repository's settings.

## Plan

**Approach.** Run sequential units with one writer per surface. First pin the SDK and prove the current bridge on it. Then, in a single integration unit, apply the clean upstream files and hand-merge `src/index.ts`, `src/convert.ts`, `src/query-state.ts` and the conflicting tests onto upstream's #222 design, carrying the local features and deleting the subsumed checkpoint pipeline. Then add append-epoch persistence, the fork-semantics tests and the old-checkpoint test. Documentation runs in parallel because its files are disjoint. Close with consolidated gates.

**Upstream source.** The clone at `/tmp/tmp.oO0cnykFQ7/upstream`, or a fresh partial clone if missing. Never modify `C:\DEV\Proyectos\Webstorm\pi-claude-bridge`.

**Merge guidance by conflicting file.**
- `src/index.ts`: take upstream's recording, prefix sync, writer waiting, commit/persist and dirty-tail lifecycle. Re-apply the local hunks:
  - append refresh and init gate
  - wrapping and schema warnings
  - immediate registry reporting
  - MCP note and section capture
  - quota command
  - runtime alias and auxiliary query separation
  - rendering and publication
  - configuration and registration ownership

  Drop the old checkpoint/cursor restoration and publication.
- `src/convert.ts`: keep upstream conversion origins and add the local third parameter and the `{input: args}` envelope.
- `src/query-state.ts`: take upstream `LiveRecording`, assistant steps and steer tracking. Keep `wrappedToolNames` and the limit-delivery fields; drop `checkpointMessages`.
- `tests/lib/rpc-harness.mjs`: support both sets of options.
- `tests/unit-config.mjs`: adopt upstream's security expectations and keep local hermetic fixtures.
- `tests/unit-rate-limit.mjs`: keep local registry assertions and add upstream lifecycle assertions.
- `package.json`: only the SDK pin changes.
- `AGENTS.md`, `CHANGELOG.md`, `README.md`: merge with local content.

**Interfaces to preserve.** pi-core provider-limit registry and work-panel contracts. Pi provider registration and `onResponse`. Claude Agent SDK `0.3.308` (`resumeSessionAt`, `forkSession`, `settingSources`). The `.thoth/specs/pi-ecosystem` Claude bridge requirements, as modified above.

**Mutable surfaces.**
- `pi-packages/pi-claude-bridge/src/**`, `tests/**`, `diag/**`, upstream root docs: one writer at a time (units U2 → U3 → U4).
- `pi-packages/pi-claude-bridge/package.json` and `pnpm-lock.yaml`: U1 only.
- `README.md`, `CHANGELOG.md`, `AGENTS.md`: U5 only, in parallel with the others.

**Verification seams.** Run with `CODEX_HOME`, `PI_SUBAGENT_CHILD`, `PI_CODING_AGENT_DIR` and `PI_PACKAGE_DIR` unset:
- Package `test:unit` (baseline 577 passing), `typecheck` and `build`.
- Focused upstream suites via `pnpm --filter @thoth-agents/pi-claude-bridge exec node --import tsx --import ./tests/lib/setup.mjs --test <files>`.
- Root `pnpm run check:ci`, `pnpm run typecheck` and `pnpm run test:pi-extensions` after build.
- Never `test`, `test:usage` or `int-*`.

**Risks.**
- `src/index.ts` merge size: about 10k upstream lines over a heavily customized fork.
- Append epochs on forks (D4).
- Losing wrapped-tool conversion on the new import path.
- Windows path and timing assumptions in upstream tests.
- Behavior hidden by textual application.
- The SDK downgrade affecting the runtime resolver.
- Users with a project-level provider config losing it (intended by #198).

**Mitigations.** Test-first for every carried feature that needs new seams, milestone returns inside U2, root review of every changed existing test, and fresh independent Oracle verification.

## Tasks

- [x] AC-5: Claude Agent SDK pinned exactly at 0.3.308 with the pre-merge bridge green on it
  - Outcome: SDK declared `0.3.308`; lockfile updated; current bridge passes `test:unit` and `typecheck`; SDK-bundled `claude.exe` still resolves through `src/claude-runtime.ts` on Windows
  - Known entrypoints and skill paths: `pi-packages/pi-claude-bridge/package.json`, `pnpm-lock.yaml`, `pi-packages/pi-claude-bridge/src/claude-runtime.ts:66–86`, `tests/unit-claude-runtime*.mjs`
  - Inputs: Decision D3
  - Dependencies: none
  - Output: dependency diff, install summary, check results
  - Owner: thoth-worker (U1)
  - Writes: `pi-packages/pi-claude-bridge/package.json` dependency field, `pnpm-lock.yaml`, and `src/claude-runtime.ts` only if the 0.3.308 resolver differs
  - Interface boundaries: other packages' resolutions unchanged
  - Focused check and PASS evidence: `pnpm install --frozen-lockfile` exits 0 after `pnpm install`; `test:unit` 577 passing; `typecheck` exits 0
  - Return milestone: after install and checks
  - Stop / reassessment: a resolution or contract break on 0.3.308; report it, do not fix source
- [x] AC-6: Fork documentation records the sync and the new restart semantics
  - Outcome: `README.md` sync base `0b41f78`; old checkpoint/same-id restart text replaced by the upstream recording/fork semantics; fork-specific sections kept; `CHANGELOG.md` sync entry; `AGENTS.md` merged
  - Known entrypoints and skill paths: `pi-packages/pi-claude-bridge/{README,CHANGELOG,AGENTS}.md`; upstream versions in `/tmp/tmp.oO0cnykFQ7/upstream`; this record's Decisions
  - Inputs: accepted Exploration and Decisions
  - Dependencies: none (disjoint files)
  - Output: documentation diff
  - Owner: thoth-worker (U5)
  - Writes: those three files only
  - Interface boundaries: no source, test or manifest files
  - Focused check and PASS evidence: README names `0b41f78` and contains no claim of same-session-id or clean-only resume; `git diff --check` clean
  - Return milestone: docs diff ready
  - Stop / reassessment: an upstream doc statement that contradicts a local feature kept by this record
- [x] AC-1: Upstream df964a9..0b41f78 integrated on top of #222 with local features carried and the checkpoint pipeline removed
  - Outcome: clean files applied; `src/index.ts`, `src/convert.ts`, `src/query-state.ts`, `tests/lib/rpc-harness.mjs`, `tests/unit-config.mjs`, `tests/unit-rate-limit.mjs` hand-merged per Plan; `src/session-checkpoint.ts` pipeline and tests removed; package `typecheck` and `test:unit` green
  - Known entrypoints and skill paths: `pi-packages/pi-claude-bridge/**`; `/tmp/tmp.oO0cnykFQ7/upstream` and `range.patch`; skills `tdd`, then `simplify`
  - Inputs: accepted AC-5 output; Exploration reconciliation; Decisions D1, D5–D12
  - Dependencies: AC-5 SDK row
  - Output: merged package, plus a report listing every hand-merged file, every adapted or dropped upstream test with its reason, every changed existing local test with its reason, and every deleted local file
  - Owner: thoth-worker (U2)
  - Writes: `pi-packages/pi-claude-bridge/{src,tests,diag}/**` and upstream root docs (`TODO.md`, `PLAN-SESSION-SYNC.md`); not `package.json`, `README.md`, `CHANGELOG.md` or `AGENTS.md`
  - Interface boundaries: pi-core registries; Pi provider APIs at 1.4.0; SDK 0.3.308; Claude bridge spec requirements
  - Focused check and PASS evidence: `pnpm --filter @thoth-agents/pi-claude-bridge run typecheck` exits 0; `run test:unit` passes everything, including adopted upstream unit suites
  - Return milestone: (1) after the clean apply, with the file list; (2) when the integration compiles; (3) at completion
  - Stop / reassessment: an upstream behavior that cannot coexist with a local feature or modified spec requirement, or a needed API missing in SDK 0.3.308 or Pi 1.4.0
- [x] AC-2: Root review of upstream test adoption and local test changes
  - Outcome: root accepts or rejects every adapted upstream test and every changed existing local test in the AC-1 report
  - Known entrypoints and skill paths: the AC-1 diff and report
  - Inputs: accepted AC-1 output
  - Dependencies: AC-1 integration row
  - Output: acceptance decision, or regressions returned to a worker
  - Owner: root
  - Writes: none
  - Interface boundaries: none
  - Focused check and PASS evidence: every adaptation traces to Windows, local structure or an intentional upstream behavior change; the focused upstream suites pass
  - Return milestone: after the AC-1 result
  - Stop / reassessment: an unexplained assertion change or a removed local behavior
- [x] AC-3: Append state follows the retained records across forks, rewrites and restarts, and carried local features are proven
  - Outcome: position-bound append state persisted with upstream per-session state (D4). New request-context regression tests:
    - a cut before a delivered refresh re-delivers it;
    - a cut after it sends nothing redundant;
    - missing or invalid append evidence on retained records delivers the full current appended instructions;
    - a Pi-history write starts a new epoch with the current append in its system prompt;
    - each of the above survives a Pi restart.

    Wrapped-tool replay is tested through both `importHistory()` paths, and existing local feature tests pass.
  - Known entrypoints and skill paths: `src/append-instructions.ts`, `src/append-blocks.ts`, `src/session-store.ts`, `src/session-sync.ts`, `src/index.ts`, `tests/unit-append-*.mjs`, `tests/unit-session-store.mjs`, `tests/unit-sync-shared-session.mjs`, `tests/unit-tool-schema*.mjs`; skill `tdd`
  - Inputs: accepted AC-1 and AC-2 outputs
  - Dependencies: AC-2 root review row
  - Output: tests (red then green) and implementation
  - Owner: thoth-worker (U3)
  - Writes: `pi-packages/pi-claude-bridge/{src,tests}/**`
  - Interface boundaries: upstream state file format extended only by the append-state field; missing or invalid append state on retained records is treated as uncertain (full current delivery), never as a fresh epoch
  - Focused check and PASS evidence: new tests fail before and pass after; `test:unit` and `typecheck` green
  - Return milestone: when tests are green
  - Stop / reassessment: epoch semantics that conflict with upstream's fork or rewrite rows
- [x] AC-4: Old-format checkpoints are ignored and preserved
  - Outcome: a test seeds `claude-bridge/session-checkpoints` with an old file and shows that the bridge does not read or delete it, writes Pi history to a new session once, and records new-format state
  - Known entrypoints and skill paths: `src/session-store.ts`, `src/index.ts`, `tests/lib/setup.mjs`; skill `tdd`
  - Inputs: accepted AC-3 output
  - Dependencies: AC-3 epoch row
  - Output: test, plus a source change only if needed
  - Owner: thoth-worker (U4)
  - Writes: `pi-packages/pi-claude-bridge/{src,tests}/**`
  - Interface boundaries: none beyond the state store
  - Focused check and PASS evidence: the new test passes; `test:unit` green
  - Return milestone: test green
  - Stop / reassessment: any code path that still touches the old directory
- [x] AC-7: Package and root gates pass on the integrated result
  - Outcome: all closeout gates green
  - Known entrypoints and skill paths: package and root `package.json` scripts
  - Inputs: accepted AC-1 to AC-6 outputs
  - Dependencies: AC-4 and AC-6 rows
  - Output: gate results
  - Owner: thoth-worker (U6, sequential consolidated run)
  - Writes: none (gitignored `dist` only)
  - Interface boundaries: none
  - Focused check and PASS evidence: package `test:unit`, `typecheck` and `build`, plus root `check:ci`, `typecheck` and `test:pi-extensions`, all exit 0
  - Return milestone: gates run
  - Stop / reassessment: failures from unrelated workspace changes are reported, not fixed

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

Plan review round 1: fresh Oracle subtask_thoth-oracle_1793590166162_f16d0673 returned REJECT (valid verdict, recordSha256 3a836d6c777e69f7a2f73afd62241f0712064a4ed2ea8b0236b17b4fb8e9c943). Blocker: inheriting the source epoch on a fork, or assuming a fresh epoch when append evidence is missing, can suppress needed refreshes. Repaired in D4, AC-3, the AC-3 task row and the append delta. The nonblocking caution (working directory as a rebuild condition) was folded into the resume delta.
Plan review round 2: fresh Oracle subtask_thoth-oracle_1793590578198_9f8ecea8 returned OKAY (delivered verdict valid:true, kind plan-review, recordSha256 8f292abd59563ce3704059b41bb0bf768b10d72046bd1e40e7f108bdaf81930d, recordDigest match).
Nonblocking caution carried into U3: bind refresh evidence to the actual target recording and resolved transcript positions, not to hook returns or the resume source id; preserve multipart uncertainty and the initialization no-replay guard.
Implementation authorized explicitly by the user on 2026-11-02.

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 161467e8e8b40ff51f6a1bc548933d3d8ca255dee29c05e0368eada79c071a74

Final verification round 2: fresh Oracle subtask_thoth-oracle_1793594060734_fad8a70d; delivered verdict valid:true, kind final-verification, verdict PASS, mode record, recordDigest match.

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS. AC-1 through AC-7 are satisfied. The documentation blocker is repaired; no remaining blocking findings.",
  "evidence": [
    {
      "id": "E1",
      "kind": "diff-review",
      "locator": "upstream df964a9..0b41f78 versus pi-packages/pi-claude-bridge",
      "claim": "All 83 included upstream files are present: 62 match after CRLF normalization and 21 contain reviewed local adaptations. Only package-lock.json is excluded.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E2",
      "kind": "implementation-review",
      "locator": "pi-packages/pi-claude-bridge/src/{index,session-sync,session-transcript,session-store,append-instructions,query-process}.ts and associated unit tests",
      "claim": "Digest synchronization, exit-bound persistence, prefix forks, retained-record append evidence, wrapped-tool replay and carried local features are implemented. Legacy-checkpoint isolation has a filesystem tripwire regression.",
      "basis": "observed",
      "uncertainty": "Request-context tests simulate recording boundaries; they are not live cache telemetry."
    },
    {
      "id": "E3",
      "kind": "documentation-review",
      "locator": "pi-packages/pi-claude-bridge/{README,CHANGELOG,AGENTS}.md",
      "claim": "Documentation correctly distinguishes provider/AskClaude QueryProcess spawning from summary/quota SDK launching, describes recording/fork and append-cut semantics, preserves old checkpoints, and identifies settings security and the exact SDK pin. Removed checkpoint guarantees are explicitly superseded.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E4",
      "kind": "execution",
      "locator": "Fresh sequential offline verification commands",
      "claim": "Bridge typecheck passed; unit tests passed 740/740 with no skips. Root check:ci and typecheck passed; test:pi-extensions passed 13/13. check:ci reported warnings and infos, not errors.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E5",
      "kind": "build-verification",
      "locator": "scripts/build-pi-extensions.mjs configuration; pi-packages/pi-claude-bridge/dist/index.ts",
      "claim": "The bridge build reproduced in memory with write:false, zero errors/warnings, and byte-identical output to the existing bundle (SHA-256 5066754b524a665690a5d16e03345295ee6a420faad362df0408aac849716e25).",
      "basis": "observed",
      "uncertainty": "Mutating package/root build commands were not rerun; recorded consolidated build results were reused after this artifact freshness check."
    },
    {
      "id": "E6",
      "kind": "dependency-verification",
      "locator": "pi-packages/pi-claude-bridge/package.json; pnpm-lock.yaml; installed SDK; src/claude-runtime.ts",
      "claim": "Manifest, lockfile and installed SDK resolve exactly 0.3.308. The Windows x64 SDK-bundled claude.exe resolves and exists; lockfile changes are confined to the SDK and its platform packages.",
      "basis": "observed",
      "uncertainty": "The historical pre-merge 577-test run is recorded evidence, not independently re-executed."
    },
    {
      "id": "E7",
      "kind": "governance-and-scope",
      "locator": ".thoth/changes/claude-bridge-sync-0b41f78/claude-bridge-sync-0b41f78.md; .thoth/specs/pi-ecosystem/spec.md; git worktree",
      "claim": "The verify gate passes. Durable deltas match the reviewed canonical baseline SHA-256 16c3ed89697e2accb93250a9176d531b56dac276096e89829ee5af95c175fdaa. Scope is restricted as assigned; no tracked dist or credential-pattern candidates were found. The 97-path snapshot remained unchanged throughout review.",
      "basis": "observed",
      "uncertainty": "Credential scanning is signature-based."
    },
    {
      "id": "E8",
      "kind": "memory-recall",
      "locator": "git:3726a62c-51e1-43ba-a466-57d41c5b7048 / 5676e8dc-a7d2-4524-af06-b2738ae17ead",
      "claim": "Project context was recalled only; no memory writes or session lifecycle operations occurred.",
      "basis": "observed",
      "uncertainty": "Earlier checkpoint guidance is superseded by the assigned record; no root-session continuity is claimed."
    }
  ],
  "verification": [
    {
      "check": "AC-1 and AC-2: upstream completeness and test adaptations",
      "method": "Independent upstream comparison, adaptation review, package typecheck and complete offline unit suite.",
      "outcome": "pass",
      "evidenceIds": ["E1", "E2", "E4"],
      "reason": "No omitted upstream change or unjustified weakened assertion found."
    },
    {
      "check": "AC-3: retained local features and position-bound append state",
      "method": "Trace both import paths, append restoration/snapshot logic, initialization guards and fork/rewrite/restart regressions.",
      "outcome": "pass",
      "evidenceIds": ["E2", "E4"],
      "reason": "Refresh evidence follows actual retained carrier records; uncertainty forces full delivery."
    },
    {
      "check": "AC-4: legacy checkpoints ignored and preserved",
      "method": "Review legacy filesystem tripwire test and removal of the old source pipeline; execute unit suite.",
      "outcome": "pass",
      "evidenceIds": ["E2", "E4"],
      "reason": "History rebuilds once, new-format recording advances, and legacy files remain untouched."
    },
    {
      "check": "AC-5: exact SDK pin and Windows runtime",
      "method": "Inspect manifest/lockfile, resolve installed executable, and run current tests on SDK 0.3.308.",
      "outcome": "pass",
      "evidenceIds": ["E4", "E6"],
      "reason": "The exact dependency and executable contracts hold."
    },
    {
      "check": "AC-6: documentation accuracy",
      "method": "Read all three documents and compare their guarantees with launcher, synchronization, append and settings implementations.",
      "outcome": "pass",
      "evidenceIds": ["E2", "E3", "E6"],
      "reason": "Round-1 contradictions are repaired; no remaining stale operational guarantee found."
    },
    {
      "check": "AC-7: package/root gates",
      "method": "Fresh offline checks, non-writing package build reproduction, bundle activation tests and recorded build-evidence spot checks.",
      "outcome": "pass",
      "evidenceIds": ["E4", "E5", "E7"],
      "reason": "Checks passed on unchanged inputs without editing tracked files or generated workspace output."
    },
    {
      "check": "Record binding, durable deltas and scope",
      "method": "Run verify validator, independently hash record prefix and canonical spec, inspect scope and compare beginning/end snapshots.",
      "outcome": "pass",
      "evidenceIds": ["E7"],
      "reason": "Source digest is current, declared deltas are coherent, and reviewed inputs remained frozen."
    }
  ],
  "risks": [
    {
      "description": "Live service integration and actual prompt-cache behavior remain untested, as explicitly excluded from this assignment.",
      "severity": "low",
      "blocking": false,
      "evidenceIds": ["E2", "E4"]
    }
  ],
  "openQuestions": [],
  "nextAction": "Root should validate this envelope, record PASS and the bound digest, then run closeout before archiving.",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/claude-bridge-sync-0b41f78/claude-bridge-sync-0b41f78.md",
    "reviewedRecordSha256": "161467e8e8b40ff51f6a1bc548933d3d8ca255dee29c05e0368eada79c071a74"
  }
}
```

- AC-1: PASS | package `typecheck`; `test:unit`; explicit 14 upstream suites | 73 clean files applied, and 6 code/test conflict files hand-merged per Plan (the 3 doc conflicts went to AC-6; package-lock excluded). `src/session-checkpoint.ts` and `tests/unit-session-checkpoint.mjs` deleted; no source references to session-checkpoints, checkpointMessages or latestCursor remain. typecheck exit 0; test:unit 707 passed at U2 completion; upstream suites 141/141; no upstream suite dropped or skipped. AskClaude adopts the upstream QueryProcess close-wait lifecycle with a separate executable resolver and a stderr tail covered by a test; summary and quota keep the SDK launcher
- AC-2: PASS | root review of the U2 report and of the diff of tests/unit-query-lifecycle.mjs vs upstream | every adaptation traces to Windows (SIGTERM force-kill replaced by the stdin stop protocol, EPERM vs EISDIR, no POSIX touch or chmod), to the separate auxiliary-query seam, or to an intentional upstream behavior change; no weakened assertion found. The one defect found (fresh-module auxiliary mock) was fixed in U3
- AC-3: PASS | 16-case request-context matrix red→green (13 failing / 3 passing initially → 16/16); `test:unit` 739 | `appendState = { base, refreshes: [{ positions, value }] }`, with positions being carrier-record UUIDs, persisted atomically with the recording after child exit (src/session-store.ts:96, src/index.ts:2380). Fork/rewrite filters refreshes by resolved transcript membership (src/index.ts:817,829); Pi-history writes start a new epoch (src/index.ts:2231); missing or invalid evidence leads to full delivery; all cases are covered across restart. Wrapped-tool replay is tested through both importHistory paths. Two existing append assertions now require a context refresh, not a fresh epoch, for retained records after compaction/rebuild
- AC-4: PASS | tests/unit-ignore-legacy-checkpoints.mjs 1/1; mutation check (an injected legacy read fails the test); `test:unit` 740 | the legacy checkpoint and transcript are never read, resumed or forked, and their bytes, entries and metadata are unchanged; Pi history is imported once and new-format state is persisted; the next turn reuses the recording
- AC-5: PASS | `pnpm install --frozen-lockfile`; pre-merge `test:unit` 577/577; `typecheck` | the SDK and its 8 platform packages are at 0.3.308 (programmatic lockfile compare: nothing else changed); the 0.3.308 resolver is identical, so only the comment in src/claude-runtime.ts changed; the win32-x64 claude.exe resolves and exists
- AC-6: PASS | grep and `git diff --check` | README names 0b41f78; old checkpoint guarantees are replaced by recording/fork semantics, and the only remaining mention of the old checkpoint files says they are ignored and preserved; CHANGELOG has the sync entry; AGENTS.md merges upstream guidance while keeping the local scoped-build, no-publish and no-live-test rules. Repaired after final verification round 1: README Orca paragraph and CHANGELOG Orca entry now separate the summary/quota SDK launcher from the provider/AskClaude `QueryProcess` spawn; the unreleased checkpoint entry is marked superseded by the sync

Final verification round 1: fresh Oracle subtask_thoth-oracle_1793593714337_8da00b3e returned FAIL (valid verdict, recordSha256 161467e8e8b40ff51f6a1bc548933d3d8ca255dee29c05e0368eada79c071a74). Its only blocker was AC-6 documentation (README:40 and CHANGELOG:7 described the old AskClaude launcher; the CHANGELOG:15 unreleased entry promised removed checkpoint guarantees). All other checks passed. Root repaired the two files; no source or test changes.
- AC-7: PASS | consolidated sequential run (U6), env unset | frozen install 0; bridge typecheck 0, test:unit 740 passed / 0 failed (103 suites), build 0; root check:ci 0 (warnings and infos only); root typecheck 0; all 11 package typechecks 0; root build 0; test:pi-extensions 13 passed; changes confined to pi-packages/pi-claude-bridge/**, pnpm-lock.yaml and this record; no tracked build artifacts
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:16c3ed89697e2accb93250a9176d531b56dac276096e89829ee5af95c175fdaa

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY

Remaining risk: live-service integration and real prompt-cache behavior are untested (live suites excluded); existing sessions rebuild once from Pi history after upgrading.
