# Change: claude-bridge-sync-acbe45b

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: medium
**Risk**: high

## Exploration

- `pi-packages/pi-claude-bridge` is synced through upstream `elidickinson/pi-claude-bridge` `0b41f78` (local `8d00852d`, archived change `claude-bridge-sync-0b41f78`). Upstream main is now `acbe45b` (bridge 0.11.0, AskClaude package 0.1.1), 55 commits after `0b41f78`. A fresh partial clone is at `/tmp/tmp.GJCsdw9KmA/upstream` (recreate with `git clone --filter=blob:none` into a new `mktemp -d` if missing; never run code from it).
- Upstream port units in the range (local anchors are approximate current lines in `pi-packages/pi-claude-bridge/`):
  1. Thinking off — `0b096a8` (merge `2d44f49`): explicit disabled thinking for reasoning models without `thinkingLevelMap.off === null`; `src/index.ts` `isolatedStreamFn` ~550, `effortForReasoning` ~1221, provider options ~2303–2371; tests `unit-thinking-off`, `unit-isolated-effort`.
  2. Version-only logging and divergence diagnostics — `ce7993a`, `0b314e7`, `864330f`, `57ad7bb`: drop git revision lookup (`src/cache-trace.ts` `bridgeRevision` ~83, startup log ~2815); `LiveRecording.continues()` becomes `divergence()` (index, `"duplicate"` or `undefined`), digest exceptions discard and log; session-tagged logs.
  3. Unreplayed turn-opener acknowledgement — `8e3b623`, `cdcd0ba`, `4758931`, `3586adf`: one tracked `turnOpener`, acknowledgement consolidated through `incorporate()`; `src/index.ts` ~1327, ~1743, ~2270; `src/query-state.ts` ~57; `src/session-sync.ts`; tests `unit-live-recording`, `unit-queued-steer`, `int-cc-contracts`.
  4. Fork/clone inheritance — inheritance part of `d521b67`: a forked/cloned Pi session reads its parent session header, copies the parent recording and marks the inherited tail dirty; `src/index.ts` `syncSharedSession` ~767 and `session_start` ~2894, `src/session-store.ts` ~65–96, `src/session-sync.ts` ~21. The same commit also adds a required persisted `promptDigest` and forces a full import whenever the appended prompt changes.
  5. Verbatim recorded tool results — `8c4c187`, `2536ffb`, `b71eebc`: `recordedToolResults()` in `src/session-transcript.ts`, `Session.addToolResultBlocks()` from `cc-session-io` 0.4.1, preserved key order, `is_error` omitted on success; `src/convert.ts` `convertPiMessages`/result assembly ~217, `src/session-sync.ts` `importHistory` ~64–108, both import sites in `src/index.ts` ~835/~841. Upstream's new results-map parameter takes the position of the local `wrappedToolNames` parameter.
  6. Rewrite marks and background Bash — `ce98525` (local factory `clearSession` ~2875 already deletes only the owning session's mark; the global reset at ~879 remains), `482b8b2` (exempt `background === true` from the implicit 120 s Bash timeout, ~3017).
  7. Claude Code child policy — `5c4a268` (`outputStyle: "default"`), `f502f5d` (`CLAUDE_CODE_SILENT_TURN_REMINDER=0`, `CLAUDE_CODE_MAX_MCP_DESCRIPTION_LENGTH=16384`); upstream extracts `src/cc-child.ts`; local `CC_CHILD_ENV` ~76, env merger ~115, settings ~2352; `QueryProcess.spawn` keeps the local Orca-neutral runtime.
  8. Nonempty tool-result placeholders — `a9b4381` (`src/convert.ts` `toolResultContent` ~83); `0668459` is the AskClaude-package equivalent only.
  9. SDK typing, normalized completed tool arguments, stream simplification — `e272d2b`, `59ba6d1`, `9c608d3`, provider parts of `26014aa`: completed arguments come from recorded assistant steps with streamed fallback; intersects local `mapToolArgs` (`input` unwrapping and edit-shape normalization), held progress blocks, immediate rate-limit delivery, and section projection in `src/prompt-capture.ts` ~312–387; new `unit-tool-call-args`.
  10. Context notices — `2cd1051`: remove the startup context notice and its config writes (`src/config.ts` ~12/~68, `src/index.ts` ~1048/~2026/~2867); long-context eligibility stays; local `piMode` also gates schema-warning delivery (~1023) and stays.
  11. Maintenance — diagnostics (`diag/**`), docs, test fixes/consolidation: `c530e54`, `679fdfe`, `127627c`, `d891a55`, `b6fd42c`, `755c16a`, `92ac578`, `e4cea69`, `b9c05f6`, `c7e8fd5`, `4b99284`, `d60048c`, `f645de1`, `115ef2b`, `0cdfaa3`, `44fb12a`, `7923e38`, `e7ad62a`; releases `2ee8882`, `debda8d`; merges `f4b72f3`, `cc1c184`, `2bc48b8`, `a849011`. `f645de1`/`115ef2b` delete tests that partly overlap fork-specific coverage.
  - AskClaude package split: `4bd039e`, `26014aa`, `b7e0d49` (plus AskClaude-only parts of `95bc9ff`, `0668459`, `79ec59d`, `4cde27e`, `e272d2b`, `115ef2b`, `7923e38`, `f502f5d`, `acbe45b`).
- Ordering: `cc-session-io` 0.4.1 before unit 5; unit 3 before the stream consolidation of unit 9; units 5 and 8 share conversion expectations; units 7 and 9 overlap the AskClaude extraction; diagnostics audit expectations depend on unit 4.
- `git apply --check --directory=pi-packages/pi-claude-bridge` on the full range fails; 22 paths conflict: `AGENTS.md`, `CHANGELOG.md`, `README.md`, `package-lock.json` (absent locally), `package.json`, `src/askclaude-schema.ts`, `src/config.ts`, `src/convert.ts`, `src/index.ts`, `src/message-digests.ts`, `src/prompt-capture.ts`, `src/session-sync.ts`, `tests/unit-agent-start-capture.mjs`, `tests/unit-config.mjs`, `tests/unit-models.mjs`, `tests/unit-native-launch.mjs`, `tests/unit-prompt-capture.mjs`, `tests/unit-prompt-guard.mjs`, `tests/unit-query-lifecycle.mjs`, `tests/unit-session-store.mjs`, `tests/unit-stream-replay.mjs`, `tests/unit-sync-shared-session.mjs`. The other paths check clean, including `src/{attachments,cache-trace,extract-tool-results,mcp-server,models,query-state,session-store,session-transcript,skills,usage}.ts`, new `src/cc-child.ts` and `src/debug.ts`; `session-store.ts` applies cleanly but introduces the rejected `promptDigest`.
- Dependencies: SDK `0.3.308` exact matches upstream. `cc-session-io` is a local devDependency `^0.4.0`; upstream declares dependency `^0.4.1`. `@modelcontextprotocol/sdk` is a local devDependency, upstream dependency. Upstream also changed Pi peers (`>=0.86.1`), Pi dev deps (`^1.4.0`), Node (`>=20`), removed `pi-tui`/`typebox` peers and has no `@thoth-agents/pi-core` or `change-case`.
- AskClaude footprint (package-local): registration and execution `src/index.ts` ~3074–3154, `promptAndWait` ~2599–2803, wiring ~25/~35–42/~2809–2814, native tool-name map and mode deny lists ~207–257/~924–932, `forkCurrent` branch in shared sync ~767–805, test export ~865, MCP catalog exclusion ~1113/~1127/~2166; files `src/askclaude-schema.ts`, `src/askclaude-ui.ts`, `src/askclaude-render.ts`, `src/tool-publication.ts` (its only registered tool is AskClaude); config `src/config.ts` ~14–28/~72–77/~100–101; comments in `src/convert.ts` ~22–62 and `src/prompt-capture.ts` ~135. Dedicated tests `tests/unit-askclaude-{schema,render,deprecation}.mjs`, `tests/unit-tool-publication.mjs`; mixed tests `unit-config`, `unit-query-lifecycle`, `unit-native-launch`, `unit-provider-limits`, `unit-claude-runtime-{auxiliary,spawn}`, `unit-instance-lifecycle`, `int-append-instructions`, `unit-skills`, `unit-import`, `unit-tool-schema-arguments`, `tests/lib/mock-pi.mjs`, `int-smoke.sh`, `int-session-resume.mjs`, `usage-test.sh`. Docs: `package.json` description, `README.md` (~10/42/46/98/140–156/171–205/253), `docs/agent/harness-packaging.md` ~557, `pi-packages/pi-antigravity-bridge/README.md` ~75. Shared facilities (`waitForSessionWriter`, `QueryProcess`, session sync, auxiliary executable resolution, skills/prompt capture, pi-core render APIs) have provider consumers and stay.
- No current `.thoth/specs/**`, product `src/**` or generated root instruction mentions AskClaude. Config loading is plain `JSON.parse` with field selection (`src/config.ts` ~44–51, ~96–106), so leftover `askClaude` keys are ignored without migration. Other packages' tests use `AskClaude` only as an arbitrary tool-name fixture.

## Intent

Re-sync `pi-packages/pi-claude-bridge` from upstream `0b41f78` to `acbe45b`, adopting every upstream provider fix and policy change except the prompt-change full-import policy, carrying the fork's local features on top, and removing the AskClaude tool from the bridge.

## Non-goals

- Creating or vendoring a separate AskClaude package.
- Upstream's prompt-change full import and persisted `promptDigest` from `d521b67`.
- Upstream root-schema flattening (`9bc7985`, `e4ab6c0`); local `normalizeToolSchema` wrapping under `input` stays.
- Upstream package metadata policy: Pi peers/dev pins, Node engine, peer list, `@thoth-agents/pi-core` and `change-case` stay as local; no `package-lock.json`.
- Package version bumps or publishing.
- Running live suites (`test`, `test:usage`, `tests/int-*`, `*.sh`); upstream integration tests are adopted but not run.
- Renaming `AskClaude` tool-name fixtures in other packages' tests.

## Acceptance

- AC-1: AskClaude is removed from `pi-packages/pi-claude-bridge`: no tool registration, no `askClaude` config fields or notice marker, no `src/askclaude-*.ts` or `src/tool-publication.ts`, no AskClaude-only code paths; shared provider facilities remain; a config file still containing `askClaude` keys loads without error and registers no extra tool (test); package `typecheck` and `test:unit` pass.
- AC-2: Every upstream provider change in `0b41f78..acbe45b` (units 1–10 in Exploration, plus unit 11 diagnostics) is present, adapted to local structure as decided here; package `typecheck` and `test:unit` pass.
- AC-3: Upstream unit suites added or changed in the range for retained behavior pass on Windows (including `unit-thinking-off`, `unit-isolated-effort`, `unit-tool-call-args`, `unit-live-recording`, `unit-queued-steer`, `unit-bash-timeout`, `unit-discard-rewritten-query`, `unit-convert-determinism`, `unit-sync-shared-session`, `unit-import`, `unit-session-store`, `unit-query-lifecycle`, `unit-cache-trace`, `unit-child-env`, `unit-config`); every adapted or dropped upstream test and every changed existing local test is listed with its reason and accepted by root.
- AC-4: A Pi session forked or cloned from a parent Pi session starts from the parent's recording with the inherited tail treated as unconfirmed, and its append state follows the retained records per the existing epoch rules; a change of appended instructions alone never forces a full import and no `promptDigest` is persisted (tests, including after a Pi restart).
- AC-5: Carried local features keep their existing tests passing, unchanged unless an upstream change intentionally altered the asserted behavior (each listed): append epochs and delta refresh, prompt sections and MCP tool-name note, wrapped-tool replay through both `importHistory()` paths (now alongside recorded tool results), immediate pi-core rate-limit delivery, quota, Orca-neutral runtime, factory config/registration ownership, progress updates, Pi 1.5.0 key hints and cost provenance, `normalizeToolSchema` wrapping.
- AC-6: `cc-session-io` resolves `^0.4.1` (declared so the published bridge gets it at runtime if it is not bundled), the SDK stays exactly `0.3.308`, `pnpm-lock.yaml` is consistent and `pnpm install --frozen-lockfile` succeeds.
- AC-7: Documentation reflects the sync and the removal: bridge `README.md` records sync base `acbe45b`, describes fork inheritance, the new child policies and thinking-off, and no longer documents AskClaude or its config; `CHANGELOG.md` records the sync and the AskClaude removal (history kept); `AGENTS.md` merges upstream guidance with local rules; `package.json` description, `docs/agent/harness-packaging.md` and `pi-packages/pi-antigravity-bridge/README.md` no longer present AskClaude as a bridge feature.
- AC-8: Package `test:unit`, `typecheck` and `build`, and root `pnpm run check:ci`, `pnpm run typecheck` and `pnpm run test:pi-extensions` (after build) pass.

## Clarifications

- 2026-11-06: the user chose the full upstream sync, fixes plus policy changes.
- 2026-11-06: the user chose to remove AskClaude from the bridge; upstream moved it to a separate package that we will not build for now.
- 2026-11-06: for the only incompatible policy (`d521b67` prompt-change full import), the user chose to keep local append epochs and port only fork/clone inheritance.
- No other material question remains; package-metadata divergences are local monorepo policy and stay.

## Decisions

- D1: Remove AskClaude before the provider merge so upstream's extraction commits reduce to deleting dead code. Delete its files, config fields, notice marker, registration, `promptAndWait`, native tool-name map, mode deny lists, `forkCurrent` branch and MCP-catalog exclusion; rewrite mixed comments and tests. Leftover user config keys are ignored (no migration, no warning).
- D2: Fork/clone inheritance (unit 4) is adopted without `promptDigest`: the child Pi session inherits the parent's recording and the parent's position-bound append state; the dirty inherited tail follows upstream cut resolution, and append refreshes carried only by records outside the retained cut are delivered again, exactly as the existing epoch rules for forks/rewrites.
- D3: `convertPiMessages`/`importHistory` take both inputs explicitly — the recorded tool-results map and `wrappedToolNames` — through an options object or distinct parameters, never by position collision; both import sites pass both.
- D4: Completed tool arguments (unit 9) come from recorded assistant steps, then pass through local `mapToolArgs` (`input` unwrapping, edit-shape normalization), with the streamed fallback mapped the same way.
- D5: Adopt `src/cc-child.ts` (or merge its policy into the local child-env module) with `outputStyle: "default"`, `CLAUDE_CODE_SILENT_TURN_REMINDER=0` and `CLAUDE_CODE_MAX_MCP_DESCRIPTION_LENGTH=16384`, keeping the local Orca-neutral runtime at `QueryProcess.spawn` and local quota wiring.
- D6: Remove the startup context notice and its config fields; keep long-context selection and `piMode`'s schema-warning role.
- D7: Keep immediate pi-core rate-limit delivery, held progress blocks and section projection when adopting upstream stream and skill simplifications.
- D8: Adopt clean upstream `diag/**`, `TODO.md`, `PLAN-SESSION-SYNC.md`, `diag/AUDIT.md` changes and upstream integration tests (not run), except AskClaude-package files. Where upstream deletes or consolidates tests, keep fork-specific coverage.
- D9: Dependencies: `cc-session-io` `^0.4.1`, placed in `dependencies` only if the built bridge imports it at runtime unbundled (follow how the package currently ships its runtime imports); same rule for `@modelcontextprotocol/sdk`. SDK stays `0.3.308`. No other manifest metadata changes.
- D11: `cc-session-io@0.4.1` (published 2026-11-04) was younger than the workspace `minimumReleaseAge`. On the user's instruction it was statically audited (same sole publisher `elidickinson` as 0.4.0, no install scripts or runtime dependencies, no network/process/eval access, tarball matches tag `v0.4.1` / `9705f0a`, integrity `sha512-AkQ32phS…ROw==`) and then exempted exactly as `cc-session-io@0.4.1` in `pnpm-workspace.yaml` `minimumReleaseAgeExclude`.
- D10: Vendoring procedure: `git apply --directory=pi-packages/pi-claude-bridge` for clean, non-AskClaude, non-`promptDigest` paths, then hand-merge.

## Durable deltas

- `MODIFIED pi-ecosystem` **Claude bridge resumes Claude Code sessions across Pi processes** — `@thoth-agents/pi-claude-bridge` MUST persist, per Pi session, the Claude Code session it last recorded together with per-message content digests of the Pi history that session received, and when that Pi session continues, including in a new Pi process or after its in-memory bridge state was cleared, MUST compare the current Pi history with that recording by those digests: on a match it MUST continue from the recorded Claude Code records, and on a difference it MUST keep the recorded records up to the last valid cut before the first difference in a new Claude Code session and add only the differing remainder, never rewriting or deleting an existing Claude Code transcript in place; a Pi session forked or cloned from another Pi session that has no recording of its own MUST start from the parent session's recording, treating the inherited records after the last confirmed point as unconfirmed, and MUST NOT force writing Pi's history to a new Claude Code session only because the appended system instructions changed; it MUST write Pi's history to a new Claude Code session when no usable recording exists (none persisted for the session or its parent, an unrecognized format, a different model or working directory, a missing transcript or no valid cut), and MUST NOT read or delete state left in the previous checkpoint format.
  - GIVEN a persisted Pi session whose earlier turns ran through the bridge and whose recording was saved after the Claude Code process exited; WHEN Pi restarts and the session continues with a new prompt; THEN the bridge continues from the recorded Claude Code records in a session that keeps them without re-importing that history, and the original transcript file is left unchanged.
- `ADDED pi-ecosystem` **Claude bridge honors disabled thinking** — `@thoth-agents/pi-claude-bridge` MUST, when the Pi thinking level is off for a reasoning model whose catalog entry does not map off to an unsupported value, run the Claude Code query with thinking explicitly disabled rather than leaving Claude Code's default thinking enabled.
  - GIVEN a reasoning Claude model selected in Pi with thinking level off; WHEN a prompt runs through the bridge; THEN the Claude Code query options disable thinking and no thinking effort is requested.

## Plan

**Approach.** Sequential writers on the bridge source, one at a time: dependencies first, then AskClaude removal, then the upstream provider merge with fork inheritance on local epochs, then root review of test changes. Documentation runs in parallel on disjoint files. Close with consolidated gates and fresh independent Oracle verification.

**Upstream source.** `/tmp/tmp.GJCsdw9KmA/upstream` (or a fresh partial clone in a new `mktemp -d`); range `0b41f78..acbe45b`. Never modify `C:\DEV\Proyectos\Webstorm\pi-claude-bridge`.

**Units.**
- U1 dependencies (AC-6): `cc-session-io` `^0.4.1` per D9, lockfile; prove the current bridge green on it. Writes `pi-packages/pi-claude-bridge/package.json` dependency fields and `pnpm-lock.yaml`.
- U2 AskClaude removal (AC-1): per D1, test-first for the leftover-config case. Writes `pi-packages/pi-claude-bridge/{src,tests}/**` only. Milestone: removal green before U3 starts.
- U3 upstream provider merge (AC-2, AC-4, AC-5): clean apply of eligible paths, then hand-merge of `src/index.ts`, `src/convert.ts`, `src/session-sync.ts`, `src/message-digests.ts`, `src/prompt-capture.ts`, `src/config.ts` and conflicting tests per D2–D8; new fork-inheritance-with-epochs tests; skill `tdd`, then `simplify`. Writes `pi-packages/pi-claude-bridge/{src,tests,diag}/**`, `TODO.md`, `PLAN-SESSION-SYNC.md`. Milestones: (1) clean apply with file list; (2) compiles; (3) complete with report of hand-merged files, adapted/dropped upstream tests, changed local tests, deleted files.
- U4 docs (AC-7): bridge `README.md`, `CHANGELOG.md`, `AGENTS.md`, `package.json` description, `docs/agent/harness-packaging.md`, `pi-packages/pi-antigravity-bridge/README.md`. Parallel with U1–U3 (disjoint), except the `package.json` description edit waits for U1.
- U5 root review of the U3 report (AC-3).
- U6 gates (AC-8).

**Interfaces to preserve.** pi-core provider-limit registry, work-panel and render contracts; Pi 1.5.0 provider registration, `onResponse`, session header/fork APIs; SDK `0.3.308`; `cc-session-io` 0.4.1 `Session.addToolResultBlocks`; the `.thoth/specs/pi-ecosystem` Claude bridge requirements as modified above.

**Verification seams.** With `CODEX_HOME`, `PI_SUBAGENT_CHILD`, `PI_CODING_AGENT_DIR`, `PI_PACKAGE_DIR` unset: package `test:unit`, `typecheck`, `build`; focused suites via `pnpm --filter @thoth-agents/pi-claude-bridge exec node --import tsx --import ./tests/lib/setup.mjs --test <files>`; root `pnpm run check:ci`, `pnpm run typecheck`, `pnpm run test:pi-extensions` after build. Never live suites.

**Risks.** `src/index.ts` merge size over a heavily customized fork; parameter collision between recorded tool results and wrapped-tool replay; normalized arguments vs `input` unwrapping; fork inheritance vs epoch state; upstream test consolidation silently dropping fork coverage; Windows assumptions in upstream tests; behavior hidden by textual application; AskClaude removal deleting shared helpers. Mitigations: AskClaude first, explicit D3/D4, test-first for new seams, milestone returns, root review of every changed test, fresh Oracle.

## Tasks

- [x] AC-6: cc-session-io ^0.4.1 resolved with the current bridge green on it
  - Outcome: `cc-session-io` declared `^0.4.1` per D9 (and `@modelcontextprotocol/sdk` placement per D9), SDK still `0.3.308`, lockfile updated, current bridge passes `test:unit` and `typecheck`
  - Known entrypoints and skill paths: `pi-packages/pi-claude-bridge/package.json`, `pnpm-lock.yaml`, bridge build config (`tsup`/build script) to decide bundling
  - Inputs: Decision D9; Exploration dependency deltas
  - Dependencies: none
  - Output: manifest/lockfile diff, bundling evidence for placement, check results
  - Owner: thoth-worker (U1)
  - Writes: `pi-packages/pi-claude-bridge/package.json` dependency fields, `pnpm-lock.yaml`
  - Interface boundaries: other packages' resolutions unchanged
  - Focused check and PASS evidence: `pnpm install --frozen-lockfile` exits 0; package `test:unit` and `typecheck` exit 0
  - Return milestone: after install and checks
  - Stop / reassessment: a resolution conflict or a 0.4.1 break in current code; report, do not fix source
- [x] AC-1: AskClaude removed from the bridge with shared provider facilities intact
  - Outcome: per D1; leftover `askClaude` config keys load without error and register nothing (new test first)
  - Known entrypoints and skill paths: `pi-packages/pi-claude-bridge/src/{index,config,convert,prompt-capture}.ts`, `src/askclaude-{schema,ui,render}.ts`, `src/tool-publication.ts`, tests listed in Exploration; skill `tdd`
  - Inputs: Exploration AskClaude footprint; D1
  - Dependencies: AC-6 row
  - Output: removal diff and a list of deleted files, rewritten tests and retained shared helpers
  - Owner: thoth-worker (U2)
  - Writes: `pi-packages/pi-claude-bridge/{src,tests}/**`
  - Interface boundaries: provider path, session sync, `QueryProcess`, pi-core render/publication contracts (pi-core untouched)
  - Focused check and PASS evidence: `rg -i askclaude pi-packages/pi-claude-bridge/src` empty; package `typecheck` and `test:unit` exit 0
  - Return milestone: removal green
  - Stop / reassessment: a helper whose provider use cannot be separated from AskClaude
- [x] AC-2: Upstream 0b41f78..acbe45b provider units integrated on the local fork
  - Outcome: units 1–3 and 5–11 merged per D3–D8 with local features carried; package green
  - Known entrypoints and skill paths: `pi-packages/pi-claude-bridge/**`; `/tmp/tmp.GJCsdw9KmA/upstream`; skills `tdd`, then `simplify`
  - Inputs: accepted AC-1 and AC-6 outputs; Exploration units and conflicts; D3–D10
  - Dependencies: AC-1 removal row
  - Output: merged package and the U3 report (hand-merged files, adapted/dropped upstream tests with reasons, changed local tests with reasons, deleted files)
  - Owner: thoth-worker (U3)
  - Writes: `pi-packages/pi-claude-bridge/{src,tests,diag}/**`, `TODO.md`, `PLAN-SESSION-SYNC.md`
  - Interface boundaries: pi-core contracts; Pi 1.5.0 APIs; SDK 0.3.308; cc-session-io 0.4.1; spec requirements as modified
  - Focused check and PASS evidence: package `typecheck` and `test:unit` exit 0, including adopted upstream unit suites
  - Return milestone: (1) clean apply list; (2) compiles; (3) complete with report
  - Stop / reassessment: an upstream behavior that cannot coexist with a kept local feature or the modified requirements
- [x] AC-4: Fork/clone inheritance works on local append epochs without promptDigest
  - Outcome: per D2; tests prove inherited recording, dirty inherited tail, append refresh redelivery after a cut, no full import on append change alone, no persisted `promptDigest`, and the same after a Pi restart
  - Known entrypoints and skill paths: `src/{index,session-store,session-sync,append-instructions}.ts`, `tests/unit-{session-store,sync-shared-session,query-lifecycle,append-*}.mjs`; skill `tdd`
  - Inputs: accepted AC-2 milestone 2 (compiling merge)
  - Dependencies: AC-2 integration row (same writer, U3)
  - Output: tests and implementation within the U3 diff
  - Owner: thoth-worker (U3)
  - Writes: within U3 writes
  - Interface boundaries: Pi session header/fork API; epoch state format
  - Focused check and PASS evidence: the new tests pass and fail without the inheritance code
  - Return milestone: U3 completion
  - Stop / reassessment: Pi 1.5.0 lacks the parent-session information upstream reads
- [x] AC-5: Carried local features proven after the merge
  - Outcome: existing local feature tests pass unchanged or with listed intentional changes; wrapped-tool replay and recorded tool results tested together at both import sites
  - Known entrypoints and skill paths: `tests/unit-append-*.mjs`, `tests/unit-tool-schema*.mjs`, `tests/unit-rate-limit.mjs`, `tests/unit-claude-runtime*.mjs`, `tests/unit-progress*.mjs`, `tests/unit-import.mjs`
  - Inputs: U3 work
  - Dependencies: AC-2 integration row (same writer, U3)
  - Output: test results and listed changes in the U3 report
  - Owner: thoth-worker (U3)
  - Writes: within U3 writes
  - Interface boundaries: none beyond U3
  - Focused check and PASS evidence: listed suites pass
  - Return milestone: U3 completion
  - Stop / reassessment: a local feature removed or weakened by an upstream change
- [x] AC-3: Root review of upstream test adoption and local test changes
  - Outcome: root accepts or returns every adapted/dropped upstream test and every changed local test in the U3 report
  - Known entrypoints and skill paths: U3 diff and report
  - Inputs: accepted U3 output
  - Dependencies: AC-2, AC-4, AC-5 rows
  - Output: acceptance or regressions returned to a worker
  - Owner: root
  - Writes: none
  - Interface boundaries: none
  - Focused check and PASS evidence: every adaptation traces to Windows, local structure, AskClaude removal, the epoch decision or an intentional upstream behavior change; focused upstream suites pass
  - Return milestone: after U3
  - Stop / reassessment: an unexplained assertion change or dropped local coverage
- [x] AC-7: Documentation reflects the sync and AskClaude removal
  - Outcome: per AC-7
  - Known entrypoints and skill paths: `pi-packages/pi-claude-bridge/{README,CHANGELOG,AGENTS}.md`, `pi-packages/pi-claude-bridge/package.json` description, `docs/agent/harness-packaging.md`, `pi-packages/pi-antigravity-bridge/README.md`; upstream docs in the clone; this record
  - Inputs: Exploration, Decisions
  - Dependencies: none (description edit after AC-6 row)
  - Output: documentation diff
  - Owner: thoth-worker (U4)
  - Writes: those files only (`package.json` description field only)
  - Interface boundaries: no source or tests
  - Focused check and PASS evidence: README names `acbe45b`, no AskClaude feature/config text outside history; `git diff --check` clean
  - Return milestone: docs diff ready
  - Stop / reassessment: an upstream doc statement contradicting a kept local feature
- [x] AC-8: Consolidated gates pass
  - Outcome: package `test:unit`, `typecheck`, `build`; root `check:ci`, `typecheck`, `test:pi-extensions` green
  - Known entrypoints and skill paths: root `package.json` scripts
  - Inputs: all prior rows accepted
  - Dependencies: AC-1 through AC-7 rows
  - Output: command results
  - Owner: root
  - Writes: none
  - Interface boundaries: none
  - Focused check and PASS evidence: all commands exit 0
  - Return milestone: before final Oracle
  - Stop / reassessment: an unrelated environment failure, reported with evidence

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

Implementation authorized explicitly by the user on 2026-11-06 after plan-review OKAY.

Plan review: fresh Oracle subtask_thoth-oracle_1794004941496_69487afa, verdict OKAY, valid gate verdict, recordSha256 6663ce49732eec94b992ba4194b7f6b3e386acb7bc08a7581b775032bcc915c8 (digest match).
Nonblocking cautions carried into U3: (1) adapt upstream reload-instructions/prompt-changed diagnostics and cache claims to D2 instead of keeping full-import expectations; (2) keep completed arguments and recording digests in one representation under D4 and add a completed-before-stop regression with wrapped tools and edit normalization.

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: a47a03a2d1a2339a7074a1959ca2c51152c6df7a916cae7d50d68d9ffc56784d

Fresh Oracle subtask_thoth-oracle_1794007557036_d11f4ff7; delivered gate verdict valid, kind final-verification, mode record, recordDigest match.

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS: AC-1–AC-8, D1–D11, non-goals and durable deltas are satisfied; no blocking findings.",
  "evidence": [
    {
      "id": "E1",
      "kind": "contract",
      "locator": ".thoth/changes/claude-bridge-sync-acbe45b/claude-bridge-sync-acbe45b.md",
      "claim": "Reviewed the record and canonical specification. Baseline SHA-256 matches ff2f6367eb2c791fb161e23de23b2d4e1326836ea4bf695c01ebae5e8acf6e9d.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E2",
      "kind": "diff-review",
      "locator": "git status; git diff HEAD; untracked files",
      "claim": "Reviewed all 120 changed/untracked implementation files, including deletions. Final fingerprint remained 2f8212a60d5a9ef0fb59a1fef48736c249a005526b6f452f7392ecce011ae868. No unrelated behavioral changes or targeted credential/private-key matches; diff whitespace check passed.",
      "basis": "observed",
      "uncertainty": "Credential scan was targeted, not exhaustive."
    },
    {
      "id": "E3",
      "kind": "upstream-comparison",
      "locator": "/tmp/tmp.GJCsdw9KmA/upstream:0b41f78..acbe45b",
      "claim": "Static comparison accounts for provider units and diagnostic/test changes. Differences preserve declared local features, reject promptDigest/full-import policy, and remove AskClaude rather than vendoring its separate package.",
      "basis": "observed",
      "uncertainty": "No upstream code was executed."
    },
    {
      "id": "E4",
      "kind": "focused-tests",
      "locator": "pi-packages/pi-claude-bridge/tests",
      "claim": "Independently ran 31 focused files: 373/373 tests passed. Coverage includes inheritance/restart/cuts, append epochs, completed arguments, both wrapped replay paths, legacy config, progress, rate limits, quota, Orca runtime and factory ownership. Package typecheck also exited 0.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E5",
      "kind": "correctness-review",
      "locator": "pi-packages/pi-claude-bridge/src/{index,session-sync,session-store,session-transcript}.ts",
      "claim": "Inheritance copies recording and position-bound append evidence, waits for stopping writers, preserves existing child pointers and resolves dirty tails. Both imports receive recorded results and wrapped names. Completed arguments are mapped once and cloned; streamed fallback is mapped consistently. No promptDigest remains in source or persistence.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E6",
      "kind": "packaging-security",
      "locator": "pi-packages/pi-claude-bridge/package.json; pnpm-lock.yaml; pnpm-workspace.yaml; scripts/build-pi-extensions.mjs",
      "claim": "Manifest/lock resolve cc-session-io ^0.4.1; generated bundle includes it and MCP dependencies, so devDependency placement is correct. SDK remains exactly 0.3.308. Release-age exemption is exactly cc-session-io@0.4.1; installed metadata has no runtime dependencies or install hooks.",
      "basis": "observed",
      "uncertainty": "Publisher/tag audit and successful frozen install are reported by root/the completed record, not independently repeated."
    },
    {
      "id": "E7",
      "kind": "documentation-config",
      "locator": "bridge README.md, CHANGELOG.md, AGENTS.md, src/config.ts; related documentation",
      "claim": "Documentation reflects acbe45b, inheritance, thinking-off, child policies and AskClaude removal. Global-only configuration satisfies the existing prohibition on repository-controlled provider/Claude Code settings; removed project fields served only removed features.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E8",
      "kind": "root-verification",
      "locator": "delegated task results; record completed AC-3 and AC-8 tasks",
      "claim": "Root reports package units 714/714, package typecheck/build, root check:ci/typecheck/build and extension tests 13/13 passing. Record marks root test-adaptation review accepted; inspected adaptations align with upstream consolidation and retained local contracts.",
      "basis": "inferred",
      "uncertainty": "Broad command results and root acceptance were supplied, not independently re-executed."
    }
  ],
  "verification": [
    {
      "check": "AC-1: AskClaude removal and legacy configuration",
      "method": "Source/deletion review, absence search and focused regression",
      "outcome": "pass",
      "evidenceIds": ["E2", "E4", "E7"],
      "reason": "No registration, configuration fields, notices or exclusive paths remain; shared provider facilities remain."
    },
    {
      "check": "AC-2 and D5–D8/D10: upstream integration",
      "method": "Static upstream-range comparison and focused suites",
      "outcome": "pass",
      "evidenceIds": ["E3", "E4"],
      "reason": "Retained provider fixes and policy changes are integrated with declared adaptations."
    },
    {
      "check": "AC-3: test adoption and adaptations",
      "method": "Review changed tests against upstream and completed root acceptance",
      "outcome": "pass",
      "evidenceIds": ["E3", "E4", "E8"],
      "reason": "Changes have contract-consistent reasons; fork-specific coverage remains."
    },
    {
      "check": "AC-4 and D2: inheritance and epoch correctness",
      "method": "Implementation review plus restart, dirty-tail and cut/redelivery regressions",
      "outcome": "pass",
      "evidenceIds": ["E4", "E5"],
      "reason": "Inherited recordings preserve cut-bound append semantics without promptDigest or prompt-change imports."
    },
    {
      "check": "AC-5 and D3–D4: preserved local divergences",
      "method": "Both replay paths, completed-before/after-stop arguments and retained-feature tests",
      "outcome": "pass",
      "evidenceIds": ["E4", "E5"],
      "reason": "Both explicit replay inputs survive; no double mapping; retained local features remain covered."
    },
    {
      "check": "AC-6 and D9/D11: dependency delivery",
      "method": "Manifest, lockfile, installed metadata and generated-bundle inspection; reported frozen install",
      "outcome": "pass",
      "evidenceIds": ["E6"],
      "reason": "Versions, runtime bundling and narrowly scoped exemption match the decisions."
    },
    {
      "check": "AC-7: documentation and configuration contract",
      "method": "Review documentation diff against implementation and canonical specification",
      "outcome": "pass",
      "evidenceIds": ["E1", "E7"],
      "reason": "Documentation is coherent; global-only configuration strengthens rather than contradicts the existing settings boundary."
    },
    {
      "check": "AC-8, non-goals and final freshness",
      "method": "Fresh focused checks, supplied consolidated results and final fingerprint comparison",
      "outcome": "pass",
      "evidenceIds": ["E2", "E4", "E8"],
      "reason": "Checks pass, inputs remained unchanged, and excluded live suites/versioning/vendoring were not introduced."
    }
  ],
  "risks": [
    {
      "description": "Live-service and adapted cache-telemetry scenarios remain unrun, as explicitly required by the non-goals.",
      "severity": "low",
      "blocking": false,
      "evidenceIds": ["E1", "E3", "E4"]
    }
  ],
  "openQuestions": [],
  "nextAction": "Root should validate and record this envelope, complete acceptance evidence, then run closeout before archive.",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/claude-bridge-sync-acbe45b/claude-bridge-sync-acbe45b.md",
    "reviewedRecordSha256": "a47a03a2d1a2339a7074a1959ca2c51152c6df7a916cae7d50d68d9ffc56784d"
  }
}
```

- AC-1: PASS | `rg -i askclaude src` empty; package typecheck 0; test:unit; `unit-legacy-config.mjs` | Oracle E2/E4/E7
- AC-2: PASS | package typecheck 0, test:unit 714/714; upstream-range comparison | Oracle E3/E4
- AC-3: PASS | root review of U3 adaptation inventory; focused upstream suites 190/190 (U3), 373/373 (Oracle) | Oracle E3/E4/E8
- AC-4: PASS | `unit-fork-inheritance.mjs` 6/6 (red before code), stopping-writer regression in `unit-query-lifecycle` | Oracle E5
- AC-5: PASS | retained-feature suites and `unit-completed-tool-recording.mjs` 3/3, both wrapped replay paths in `unit-sync-shared-session` | Oracle E4/E5
- AC-6: PASS | lockfile `cc-session-io@0.4.1` integrity sha512-AkQ32phS…ROw==; `pnpm install --frozen-lockfile` up to date; SDK 0.3.308 | Oracle E6
- AC-7: PASS | README names acbe45b, AskClaude only in CHANGELOG history/removal; `git diff --check` clean | Oracle E7
- AC-8: PASS | package typecheck/test:unit 714/714/build; root check:ci, typecheck, build, test:pi-extensions 13/13 all exit 0 | Oracle E8
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:ff2f6367eb2c791fb161e23de23b2d4e1326836ea4bf695c01ebae5e8acf6e9d

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
