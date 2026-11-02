# Change: claude-bridge-progress-updates

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: medium
**Risk**: medium

## Exploration

- Root cause, verified earlier in this session from the Pi session JSONL and decoded signatures: Claude 5 models return prose written mid-turn (after a tool result, before the next tool call) as a signed `thinking` block. The signature's base64 protobuf names its kind at fields 2→1→8, and for these blocks the kind is `"narration"`. Anthropic documents them as "progress updates between tool calls". `pi-packages/pi-claude-bridge` maps every thinking block to Pi reasoning, and Pi's `hideThinkingBlock` folds it into "Thinking...". Prose at the start or end of a turn stays `text` and is visible.
- The fix comes from upstream PR elidickinson/pi-claude-bridge#212 (issue #211), still open and unmerged. Head `d28824d`, merge-base `6aa276a`, two commits: `653fed8` (behavior) and `d28824d` (recorded stream plus replay tests). It touches 9 files, +782/−16, and leaves the README unchanged:
  - `src/narration.ts` (new, 99 lines): bounded protobuf traversal of the base64 signature, fields 2→1→8. It returns undefined on any failure. A block counts as narration only if its thinking text is non-blank and its kind is `"narration"`. The hold limit is `NARRATION_HOLD_CHARS = 800`.
  - `src/index.ts`, streaming: `content_block_start` for a thinking block is held, with `WeakSet` bookkeeping and nothing persisted. Deltas buffer until the text exceeds 800 characters, then the whole buffer is released as live thinking. On `content_block_stop`, a held block whose signature is narration replaces the content entry in place with `{type:"text", text, textSignature: <signature>}` and emits only `text_start/text_delta/text_end`. Held non-narration reasoning is emitted whole and in order as thinking. Empty blocks are announced and closed without a delta, and an abandoned unclosed block is dropped.
  - `src/index.ts`, nonstreaming fallback: completed thinking blocks whose signature is narration become text, with no length cap.
  - `src/convert.ts`: bridge-owned text whose `textSignature` is narration replays as `{type:"thinking", thinking: text, signature: textSignature}`.
  - Tests:
    - `tests/unit-narration.mjs`: parser, streaming, fallback and replay.
    - `tests/fixtures/sdk-streams/narration.jsonl`: a scrubbed Sonnet 5.5 recording.
    - `tests/unit-stream-replay.mjs`: cycle splitting, decoded kinds against CC's `narration_block_indexes`, exact replay, reasoning fixtures unchanged.
    - `tests/lib/record-sdk-streams.mjs`: recorder scenario and scrubbing.
    - `tests/int-cc-contracts.mjs`: a live check that a reasoning signature names its kind.
  - `CHANGELOG.md` entry.
- Applying it to the synced tree (`git apply --check --directory=pi-packages/pi-claude-bridge`, nothing applied):
  - `src/narration.ts`, `src/convert.ts`, the fixture, the recorder, `tests/unit-narration.mjs` and `tests/unit-stream-replay.mjs` apply cleanly.
  - `src/index.ts`, `CHANGELOG.md` and `tests/int-cc-contracts.mjs` conflict, because #222 moved code. `processStreamEvent` is now at `src/index.ts:1363` (thinking start/delta/stop at 1391–1393, 1415 and 1437), `processAssistantMessage` at 1547, and the fallback conversion at 1586–1602.
  - The PR's replay test asserts a pre-#222 `dropped` return shape; `convertPiMessages` now returns `origins` (`src/convert.ts:98,215`) and keeps wrapped-tool envelopes (`:147–152`).
- Interaction with #222, which the PR predates:
  - `src/message-digests.ts:165–168` hashes text as `"text:"` + text and ignores `textSignature`. `:169–172` hashes thinking as `"thinking:"` + text + signature. `:182` states the contract: digests cover "conversion-visible content, ignoring metadata".
  - `tapRecording` (`src/index.ts:1325–1337`) records the completed SDK message, in which narration is still signed thinking. Emission (`:1292–1295`) digests the Pi output, in which the PR has made it text. `:1305–1311` completes a recording UUID only when those digests are equal. So the unchanged PR yields "recording gap: emitted assistant is not fully covered" for every narrated message and loses cuttable coverage, which degrades later reuse.
  - The ignored `textSignature` also hides a change to replay-visible content (the signed thinking that conversion sends), which breaks the digest contract.
  - Reclassification happens at `content_block_stop`, before the stream is finalized (`:1344–1359`), so it is compatible with the rule that finalized assistants are immutable (`:1671–1681`).
  - Imported history goes through `convertPiMessages` before `session.addAssistantMessage` (`src/session-sync.ts:65–85`). Origin accounting is per message, not per block (`:75–79`), so replay-as-thinking keeps it intact.
  - `CLAUDE_CODE_ELEGANT_MEADOW=0` disables only API-request diagnostic records.
  - Append state (`src/index.ts:817,829,833,2380`) and wrapped-tool conversion have no direct coupling.
- Pi 1.4.0:
  - `pi-ai/dist/api/transform-messages.js:87–89,105–111` keeps a text block with its `textSignature` only for the same provider, API and model. Otherwise it passes plain `{type:"text", text}`. Provider adapters that call it, such as Pi's Anthropic and OpenAI providers, therefore send a progress update to their models as plain visible prose. The bridge does not apply it, so a switch between bridge models keeps the signed replay (confirmed by final verification round 1).
  - Interactive mode renders any nonblank text block regardless of `textSignature` (`pi-coding-agent/dist/modes/interactive/components/assistant-message.js:82–89`).
- `.thoth/specs/pi-ecosystem/spec.md` has no requirement covering how progress updates are displayed. Digest-based resume is covered at `:429–437`.
- Plan review round 1 (Oracle) found two defects in the PR as written:
  - The PR suppresses thinking events for a held block but still appends the block to the exposed `output.content` and accumulates its text in `block.thinking`. Pi 1.4.0 emits shallow message copies that share that content array (`agent-loop.js:293–316`), and the assistant component rereads it on invalidation or a thinking-visibility toggle (`assistant-message.js:35–46,69–120`; `interactive-mode.js:2796–2807,3716–3727`). A held progress update can therefore appear as "Thinking..." mid-hold without any thinking event (reproduced at component level).
  - The PR parser (`narration.ts:53–92`) returns `"narration"` for a recognizable envelope surrounded by invalid base64 characters and for an envelope followed by a truncated varint. `Buffer` base64 decoding is permissive, and traversal stops before validating the rest of the structure.

## Intent

Port PR #212 so that Claude's short progress updates between tool calls appear in Pi as visible assistant text instead of hidden reasoning. They replay to Claude Code as the original signed blocks, and the #222 session-sync digests and recording coverage stay consistent so showing them as text never by itself causes a recording gap, fork or rewrite.

## Non-goals

- Contributing upstream or commenting on PR #212.
- Anthropic `display:"updates"` or any other API or beta option. Changing the forced `summarized` thinking display.
- A retype event or any change to Pi, pi-questions-user or other packages.
- Making progress updates longer than the hold limit visible while streaming, since that would mean showing reasoning late.
- Rewriting existing Pi histories whose earlier progress updates are stored as reasoning.
- Running live suites (`test`, `test:usage`, `tests/int-*`). The PR's live contract test and recorder changes are ported but not run.

## Acceptance

- AC-1: `src/narration.ts` reads the signature kind at fields 2→1→8 with bounded traversal and fails closed (D6). It handles fixed-width and ten-byte varints. Any character outside the standard base64 alphabet or malformed padding, and any truncated or malformed protobuf field anywhere in the traversed messages, yield no kind; blank text is never narration. Proven by the PR parser tests plus new regressions: invalid base64 characters before or after a recognizable envelope, and a recognizable envelope followed by a truncated trailing field. Every signature in the recorded fixtures still decodes as before.
- AC-2: Streaming, all proven by the ported PR tests and the `narration.jsonl` replay:
  - A progress update of up to 800 characters reaches Pi as one text block carrying its original signature in `textSignature`, emitted only as `text_start/text_delta/text_end`, with no preceding thinking events, with or without earlier reasoning in the message.
  - While a block is held, neither its block nor its text is in the partial message content that Pi shares (D7): a regression pauses mid-hold, inspects the emitted partial message's content and renders it (as after a redraw or thinking-visibility toggle), and finds no reasoning for the held block. Content indices of later blocks and the digest taken at `done` are unchanged.
  - Short non-narration reasoning is held and emitted whole and in order as thinking.
  - Longer blocks stream live as thinking, with nothing lost or duplicated.
  - Empty blocks are announced and closed without a delta, an abandoned unclosed block is dropped, and ordinary text stays live.
  - The recorded fixture's decoded kinds match CC's `narration_block_indexes`, and existing reasoning fixtures replay unchanged.
- AC-3: In the nonstreaming fallback, every completed narration block with nonblank text becomes text with its signature (PR parity, no length cap), and other thinking is unchanged.
- AC-4: Replay: `convertPiMessages` sends a bridge-owned text block with a narration `textSignature` as `{type:"thinking", thinking, signature}`. Ordinary text, unsigned text, foreign-provider text and text whose signature is not narration stay text. Conversion origins and wrapped-tool envelopes are unchanged.
- AC-5: Digests and recording stay consistent, proven by tests:
  - A narration text block digests identically to the signed thinking block it replays as.
  - Changing its `textSignature` changes the digest.
  - Ordinary text digests are unchanged, so existing recordings remain valid.
  - A streamed and a fallback-emitted narrated message complete their recording UUID coverage (no recording gap) against the SDK's completed thinking content.
  - The next turn continues from the recorded Claude Code records without a fork or rewrite caused by the narration.
  - A Pi suffix containing narration imported through either `importHistory()` path is written as the signed thinking block.
- AC-6: The fork `README.md` explains that progress updates show as text and replay as signed reasoning, and when they stay reasoning (undecodable signature, or more than 800 characters while streaming). `CHANGELOG.md` UNRELEASED records the port of upstream PR #212 (issue #211) together with the local digest/recording adaptation.
- AC-7: Package `typecheck`, `test:unit` and `build`, and root `pnpm run check:ci`, `pnpm run typecheck`, `pnpm run build` and `pnpm run test:pi-extensions`, all pass.

## Clarifications

- The user chose porting PR #212 after the upstream sync, over a custom duplicate-block design and over `display:"updates"`. The user chose no upstream contribution for now.
- Nonstreaming length rule: decided by root as PR parity (D3), not as a human-owned choice. The 800-character hold is a streaming latency bound, not a classification rule.
- No other material question remains.

## Decisions

- D1: Port PR #212 behavior unchanged where it applies, and hand-merge the conflicting hunks onto the current anchors:
  - `src/narration.ts`, hardened per D6;
  - streaming hold/release in `processStreamEvent`, holding privately per D7;
  - fallback classification in `processAssistantMessage`;
  - signed replay in `convertPiMessages`;
  - fixture, recorder, stream-replay and narration tests, with `tests/int-cc-contracts.mjs` hand-merged.

  Adapt tests only where the #222 return shapes changed (`origins` instead of `dropped`).
- D2: One shared narration-replay predicate, exported once and used by both `convertPiMessages` and `message-digests.ts`. A text block replays as signed thinking if and only if the bridge owns its message, its text is nonblank, and its `textSignature` decodes to `"narration"`. The digest hashes such a block exactly as that thinking block (`"thinking:"` + text + signature). Every other text block keeps its current `"text:"` digest.
  - This makes emitted output equal the SDK's completed thinking content for recording coverage.
  - It keeps the signature conversion-visible, keeps Pi-history digests stable across turns, and leaves existing recordings valid.
  - Bridge-owned means the same provider check `convertPiMessages` applies to replayable thinking (`message-digests.ts:48–53`).
- D3: Keep the 800-character streaming hold (PR parity). The nonstreaming fallback classifies by signature with no length cap (PR parity).
- D4: No persisted bookkeeping (`WeakSet` only). Reclassification happens before the stream is finalized; finalized output stays immutable.
- D5: Keep the provenance in the code comment and CHANGELOG ("port of upstream PR #212"), so the next upstream sync can reconcile against the merged form.
- D6: Harden the parser (local adaptation; D1's "verbatim" does not apply to it). Accept only the standard base64 alphabet with canonical padding, rejecting the input otherwise, for example by a decode/re-encode round trip. Validate every field of each traversed message (outer, field 2, field 1) to its end, within the existing bounds. Any violation yields no kind, so the block stays reasoning.
- D7: Hold privately (local adaptation). A held thinking block lives in bridge-private state, not in `output.content`, until it is classified at stop or released after exceeding the hold limit. Only then is the final block (text for narration, thinking otherwise) inserted at its content position and its events emitted. A held block abandoned without a stop adds nothing to content. Streaming emission order, content indices and the digest at `done` stay as in the PR.

## Durable deltas

- `ADDED pi-ecosystem` **Claude bridge shows progress updates as text** — `@thoth-agents/pi-claude-bridge` MUST present a Claude progress update between tool calls (a signed reasoning block whose signature identifies it as a progress update) as visible assistant text instead of reasoning, without first showing it as reasoning, whenever it can classify the block before displaying it, MUST replay that text to Claude Code as the original signed block, and MUST keep its session-sync digests and recording coverage identical to those of the recorded Claude Code content so that showing it as text never by itself causes a fork or rewrite; it MUST leave a block as reasoning when its signature cannot be decoded or when the block grows beyond the streaming hold limit before it closes.
  - GIVEN a Claude turn that writes a short progress update between two tool calls; WHEN the bridge streams the turn into Pi and the session then continues with a new prompt; THEN Pi shows the update as assistant text with no reasoning block for it, and the next turn continues from the recorded Claude Code records without a fork or rewrite caused by that update.

## Plan

**Approach.** Run sequential units with one writer per source surface. U1 ports PR #212 onto the synced tree. U2 makes digests narration-aware through the shared predicate (D2) and proves recording coverage and reuse. U3 documents the change in parallel, since its files are disjoint. Close with consolidated gates and a fresh Oracle verification. Follow `tdd`: write each behavior's test red first, using the ported PR tests as red before the hunks, then `simplify`.

**Upstream source.** `/tmp/tmp.oO0cnykFQ7/upstream` with `pr212` fetched (head `d28824d`), or `https://github.com/elidickinson/pi-claude-bridge/pull/212.diff`. Never modify `C:\DEV\Proyectos\Webstorm\pi-claude-bridge`.

**Interfaces to preserve.**
- Pi 1.4.0 assistant event protocol (`text_*`, `thinking_*`) and `transform-messages` signature handling.
- #222 digests, recording coverage, cuts and append state.
- `convertPiMessages` `origins` and wrapped-tool envelopes.
- The rule that finalized assistants are immutable.
- The pi-ecosystem Claude bridge requirements.

**Mutable surfaces.**
- `src/narration.ts`, `src/index.ts`, `src/convert.ts` and the PR test/fixture/recorder files: U1.
- `src/message-digests.ts` and the digest, live-recording and sync tests: U2, after U1. U2 may extend `src/narration.ts` only to export the shared predicate.
- `README.md` and `CHANGELOG.md`: U3, in parallel.

**Verification seams.** Run with `CODEX_HOME`, `PI_SUBAGENT_CHILD`, `PI_CODING_AGENT_DIR` and `PI_PACKAGE_DIR` unset, sequentially:
- Focused: `pnpm --filter @thoth-agents/pi-claude-bridge exec node --import tsx --import ./tests/lib/setup.mjs --test tests/unit-narration.mjs tests/unit-stream-replay.mjs tests/unit-nonstreaming-fallback.mjs tests/unit-import.mjs tests/unit-convert-determinism.mjs tests/unit-message-digests.mjs tests/unit-live-recording.mjs tests/unit-sync-shared-session.mjs tests/unit-session-prefix.mjs tests/unit-finalized-immutable.mjs`.
- Package `typecheck`, `test:unit` (baseline 740) and `build`.
- Root `check:ci`, `typecheck`, `build` and `test:pi-extensions`.
- Never `test`, `test:usage` or `int-*`.

**Risks.**
- Digest drift between conversion and digests if the predicate is duplicated. Mitigated by the single shared predicate and an equality test.
- Undocumented signature layout: decoding failures fall back safely to reasoning, but a future layout change would make updates hidden again.
- Signature loss: providers whose adapters strip foreign signatures send the update as plain text. If such a message later reaches the bridge without its `textSignature`, its digest changes at that message, as lost reasoning signatures already do today. A switch between bridge models keeps the signature.
- Progress updates over 800 characters stay hidden while streaming.
- Diverging from the eventually merged upstream form.

## Tasks

- [x] AC-1: Narration signature parser ported, hardened to fail closed, with its unit tests
  - Outcome: `src/narration.ts` from PR #212 hardened per D6; PR parser tests plus the new invalid-base64 and truncated-trailing-field regressions pass; recorded fixture signatures decode unchanged
  - Known entrypoints and skill paths: PR #212 `src/narration.ts`, `tests/unit-narration.mjs:106–128`; skill `tdd`
  - Inputs: Exploration; D1, D6
  - Dependencies: none
  - Output: new module plus passing parser tests
  - Owner: thoth-worker (U1)
  - Writes: `pi-packages/pi-claude-bridge/src/narration.ts`, `tests/unit-narration.mjs`
  - Interface boundaries: none beyond the exported kind/predicate helpers
  - Focused check and PASS evidence: parser tests pass
  - Return milestone: together with the U1 completion report
  - Stop / reassessment: the fixture's decoded kinds disagree with `narration_block_indexes`
- [x] AC-2: Streaming reclassification and held release ported onto `processStreamEvent`
  - Outcome: PR streaming behavior at the current anchors with the private hold (D7); ported streaming tests, the mid-hold shared-content/render regression and the `narration.jsonl` stream replay pass; reasoning fixtures unchanged
  - Known entrypoints and skill paths: `src/index.ts:1363–1460`; `src/query-state.ts:104–121` (`turnBlocks` aliases `turnOutput.content`); PR `src/index.ts` hunks (`heldThinking`, `releaseHeldThinking`, `settleHeldThinking`); Pi 1.4.0 `node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/components/assistant-message.js` for the render regression; `tests/unit-stream-replay.mjs`; `tests/fixtures/sdk-streams/`; `tests/lib/record-sdk-streams.mjs`; `tests/int-cc-contracts.mjs`; skills `tdd`, `simplify`
  - Inputs: AC-1 module; D1, D3, D4, D7
  - Dependencies: AC-1 parser row (same unit)
  - Output: merged streaming code, ported tests and fixture, recorder and live contract test (not run)
  - Owner: thoth-worker (U1)
  - Writes: `src/index.ts`, `tests/unit-narration.mjs`, `tests/unit-stream-replay.mjs`, `tests/fixtures/sdk-streams/narration.jsonl`, `tests/lib/record-sdk-streams.mjs`, `tests/int-cc-contracts.mjs`
  - Interface boundaries: Pi event protocol; recording emission (`src/index.ts:1278–1359`) untouched except for the reclassified content it digests
  - Focused check and PASS evidence: `unit-narration` streaming cases and `unit-stream-replay` pass; existing replay fixtures unchanged
  - Return milestone: when streaming tests pass, before fallback/replay work
  - Stop / reassessment: reclassification would need to run after finalization or alter recording code
- [x] AC-3: Nonstreaming fallback classifies narration as text
  - Outcome: `processAssistantMessage` classification per D3; PR fallback test and existing `unit-nonstreaming-fallback` pass
  - Known entrypoints and skill paths: `src/index.ts:1547–1602`; `tests/unit-nonstreaming-fallback.mjs`
  - Inputs: AC-1 module
  - Dependencies: AC-2 streaming row (same file and unit)
  - Output: merged fallback hunk and tests
  - Owner: thoth-worker (U1)
  - Writes: `src/index.ts`, `tests/unit-narration.mjs`
  - Interface boundaries: upstream fallback that keeps every block
  - Focused check and PASS evidence: fallback tests pass
  - Return milestone: U1 completion
  - Stop / reassessment: conflict with keeping every block
- [x] AC-4: Signed replay of bridge-owned narration text in `convertPiMessages`
  - Outcome: PR replay behavior with `origins` and wrapped-tool envelopes intact; PR replay tests adapted to `origins`
  - Known entrypoints and skill paths: `src/convert.ts:98–215`; `tests/unit-import.mjs`, `tests/unit-convert-determinism.mjs`
  - Inputs: AC-1 module; D1
  - Dependencies: AC-1 parser row
  - Output: merged conversion hunk and adapted tests, listed with reasons
  - Owner: thoth-worker (U1)
  - Writes: `src/convert.ts`, `tests/unit-narration.mjs`
  - Interface boundaries: `convertPiMessages` signature and `origins`
  - Focused check and PASS evidence: replay tests pass; existing import and conversion tests pass unchanged
  - Return milestone: U1 completion, with `test:unit` and `typecheck` green
  - Stop / reassessment: replay requires changing origin accounting
- [x] AC-5: Digests and recording coverage are narration-aware through one shared predicate
  - Outcome: D2 implemented with tests for:
    - narration text digest equals the signed thinking digest;
    - a `textSignature` change changes the digest;
    - ordinary text digests are unchanged;
    - streamed and fallback narrated messages complete recording UUID coverage with no recording gap;
    - the next turn reuses the recording without a fork or rewrite;
    - a narration suffix imports as signed thinking through both `importHistory()` paths.
  - Known entrypoints and skill paths: `src/message-digests.ts:48–53,160–185`; `src/index.ts:1278–1341`; `src/session-sync.ts:45–85`; `src/convert.ts` predicate use; `tests/unit-message-digests.mjs`, `tests/unit-live-recording.mjs`, `tests/unit-sync-shared-session.mjs`, `tests/unit-session-prefix.mjs`; skills `tdd`, `simplify`
  - Inputs: accepted U1 output; D2
  - Dependencies: AC-4 replay row and AC-2 streaming row (U1 accepted)
  - Output: shared predicate, digest change, regression tests
  - Owner: thoth-worker (U2)
  - Writes: `src/message-digests.ts`, `src/narration.ts` (predicate export only), `src/convert.ts` (use of the shared predicate only), and the four test files above
  - Interface boundaries: digest format of non-narration content; recording emission and cut logic unchanged
  - Focused check and PASS evidence: new tests red before the change, green after; focused command and `test:unit` pass
  - Return milestone: completion
  - Stop / reassessment: coverage requires changing recording or cut logic, or the SDK-completed content is not bridge-owned under the predicate
- [x] AC-6: Fork documentation for progress updates
  - Outcome: README section and CHANGELOG UNRELEASED entry as in AC-6
  - Known entrypoints and skill paths: `pi-packages/pi-claude-bridge/README.md`, `CHANGELOG.md`; PR #212 CHANGELOG text; this record
  - Inputs: Intent, Decisions
  - Dependencies: none (disjoint files)
  - Output: documentation diff
  - Owner: thoth-worker (U3)
  - Writes: `README.md`, `CHANGELOG.md` only
  - Interface boundaries: none
  - Focused check and PASS evidence: text matches D1–D3; `git diff --check` clean
  - Return milestone: docs diff ready
  - Stop / reassessment: none expected
- [x] AC-7: Consolidated gates
  - Outcome: package and root gates green
  - Known entrypoints and skill paths: Verification seams
  - Inputs: accepted U1–U3
  - Dependencies: AC-5 row and AC-6 row
  - Output: command results
  - Owner: root
  - Writes: none (build output is gitignored)
  - Interface boundaries: none
  - Focused check and PASS evidence: every gate exits 0; `test:unit` count is at least 740 plus the new tests
  - Return milestone: after gates
  - Stop / reassessment: unrelated environment flake reported with evidence

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

Implementation authorized explicitly by the user on 2026-11-02.
Plan review selected explicitly by the user on 2026-11-02.
Plan review round 1: fresh Oracle subtask_thoth-oracle_1793594979064_c0d2ce90 returned REJECT (valid verdict, recordSha256 8b995a2aadabd3e75e10aebfc7c0f87d06947ad3a9ad2b2d239d4af79d5a155c, recordDigest match). It found D2 sound. Blockers: (1) held narration sits in the shared `output.content`, so Pi can render it as reasoning on redraw or a thinking toggle; (2) the verbatim parser accepts invalid base64 around an envelope and truncated trailing fields. Repaired with D6, D7, the D1 wording, AC-1, AC-2, the AC-1 and AC-2 task rows and an Exploration note.
Plan review round 2: fresh Oracle subtask_thoth-oracle_1793595468717_b109854b returned OKAY (delivered verdict valid:true, kind plan-review, recordSha256 a14547cbdb51f8b6490dcb41a21acb9e25dc4a550565d1dcbd2daae56c8f1438, recordDigest match). Its in-memory probe of the hardened parser kept all 12 completed fixture signatures (7 distinct, including both narration signatures) and rejected the malformed cases. Caution for implementation: release, abandonment, abort and turn-reset of held blocks still need regression tests; an abandoned hold must stay private and be discarded.

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 384d118c27902beb5cf9a040d2547f8b84931af65d97466da08be04ad6df6b17

Final verification round 1: fresh Oracle subtask_thoth-oracle_1793597533431_18a86624 returned FAIL (valid verdict, recordSha256 51d5b6240123ff5c6ee3497684213f6ac4d090c020c8664e03de0f36b8a0e323, recordDigest match). AC-1 to AC-5 and the static gates passed. The only blocker was documentation: the README and the record said every model switch sends updates as plain text, but an offline probe showed that bridge-to-bridge switches keep the signed replay. Root corrected the README sentence and the record's Exploration, Risk and AC-6/AC-7 rows; there were no source or test changes.
Final verification round 2: fresh Oracle subtask_thoth-oracle_1793598010377_abafaf48; delivered verdict valid:true, kind final-verification, verdict PASS, mode record, recordDigest match. Fresh typecheck and test:unit 787/787 (no EPERM this run).

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS. AC-1–AC-7 and D1–D7 are satisfied. The round-1 documentation blocker is corrected; no blocking findings remain.",
  "evidence": [
    {
      "id": "E1",
      "kind": "governance",
      "locator": ".thoth/changes/claude-bridge-progress-updates/claude-bridge-progress-updates.md",
      "claim": "The verify validator passes. The canonical Source digest matches 126cf3b69e3f70a5ace3ac57db910b82c7d94895cbcccafb2cb7efd30d18bf0b; the ADDED requirement accurately describes the implemented behavior.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E2",
      "kind": "source-review",
      "locator": "pi-packages/pi-claude-bridge/src/{narration,index,convert,message-digests}.ts",
      "claim": "Inspection against upstream d28824d confirms PR fidelity with the declared adaptations: fail-closed parsing, private streaming hold, shared replay/digest predicate, signed replay and uncapped fallback classification. Bookkeeping is not persisted.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E3",
      "kind": "execution",
      "locator": "pnpm --filter @thoth-agents/pi-claude-bridge run typecheck; run test:unit",
      "claim": "Fresh sequential execution with the four specified environment variables unset passed typecheck and all 787 unit tests, including parser, shared-content rendering, lifecycle cleanup, fixture replay, recording coverage, reuse and both import paths.",
      "basis": "observed",
      "uncertainty": "No live suites were run."
    },
    {
      "id": "E4",
      "kind": "documentation-verification",
      "locator": "pi-packages/pi-claude-bridge/README.md:40; CHANGELOG.md:5; record Exploration and Verification",
      "claim": "The corrected documentation matches code and an independent offline probe: bridge model metadata changes preserve signed replay and its digest; Pi foreign-adapter transformation removes textSignature and leaves plain text. The changelog accurately identifies PR #212 and local adaptations.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E5",
      "kind": "prior-execution-evidence",
      "locator": "Record Verification AC-7; assignment's round-1 handoff",
      "claim": "Package build and root check:ci, typecheck, build and test:pi-extensions passed previously. This round reuses that evidence for unchanged implementation inputs.",
      "basis": "inferred",
      "uncertainty": "Those gates were not rerun in this read-only round; package typecheck and all unit tests were independently rerun."
    },
    {
      "id": "E6",
      "kind": "scope-security-freshness",
      "locator": "git working tree; tests/fixtures/sdk-streams/narration.jsonl",
      "claim": "All 15 changed/untracked files are confined to the package and assigned record. Input hashes remained unchanged throughout verification; git diff --check passes. No credentials were found in reviewed additions. The narration fixture matches upstream byte-for-byte and contains scrubbed identifiers and account-usage numbers.",
      "basis": "observed",
      "uncertainty": "Credential inspection is not a guarantee against every possible secret encoding."
    },
    {
      "id": "E7",
      "kind": "memory-recall",
      "locator": "git:3726a62c-51e1-43ba-a466-57d41c5b7048",
      "claim": "Bounded recall returned 4cf9ab74-1b1d-456c-9ff7-95f767dc3cce, a030ccc6-bec2-499b-9460-2f835faf07ea and fdfcd06b-3f00-47f2-ae96-77530a440dfe. No memory was saved.",
      "basis": "observed",
      "uncertainty": "Compact recall was truncated and used only as context; no session-attributed writes occurred."
    }
  ],
  "verification": [
    {
      "check": "AC-1 / D6",
      "method": "Parser inspection and fresh malformed-input/fixture tests",
      "outcome": "pass",
      "evidenceIds": ["E2", "E3"],
      "reason": "Canonical base64, bounded traversal and complete validation of traversed messages preserve valid fixture kinds and reject malformed inputs."
    },
    {
      "check": "AC-2 / D3 / D4 / D7",
      "method": "Streaming inspection and fresh rendering, boundary, lifecycle and replay tests",
      "outcome": "pass",
      "evidenceIds": ["E2", "E3"],
      "reason": "Held content remains private; classification, over-limit release, event indices, cleanup and finalized-message immutability satisfy the contract."
    },
    {
      "check": "AC-3–AC-5 / D2",
      "method": "Fallback, conversion, digest, recording and session-sync tests",
      "outcome": "pass",
      "evidenceIds": ["E2", "E3"],
      "reason": "Signed replay is exact, conversion exclusions remain intact, digests agree with recorded thinking, and narration causes no recording gap or unnecessary rewrite."
    },
    {
      "check": "AC-6 / D1 / D5",
      "method": "Upstream comparison, documentation inspection and independent model-switch probe",
      "outcome": "pass",
      "evidenceIds": ["E2", "E4"],
      "reason": "Port provenance and behavioral documentation are accurate, including the corrected model-switch distinction."
    },
    {
      "check": "AC-7",
      "method": "Fresh package typecheck/unit suite plus retained evidence for unchanged build/root gates",
      "outcome": "pass",
      "evidenceIds": ["E3", "E5"],
      "reason": "Fresh checks pass 787/787 without the previous EPERM; remaining gate evidence is not invalidated by the documentation-only correction."
    },
    {
      "check": "Record, durable delta, canonical baseline, scope and freshness",
      "method": "Verify validator, semantic review, byte hashes, working-tree inspection and credential scan",
      "outcome": "pass",
      "evidenceIds": ["E1", "E4", "E6"],
      "reason": "Record statements and durable delta match behavior; Source digest is current and reviewed inputs remained unchanged."
    }
  ],
  "risks": [
    {
      "description": "The signature envelope layout is undocumented; a future upstream change can make progress updates remain reasoning. Fail-closed behavior and fixture tests mitigate incorrect classification.",
      "severity": "medium",
      "blocking": false,
      "evidenceIds": ["E2", "E3"]
    }
  ],
  "openQuestions": [],
  "nextAction": "Root should validate this record-bound result, record PASS and its digest, then run closeout before archiving.",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/claude-bridge-progress-updates/claude-bridge-progress-updates.md",
    "reviewedRecordSha256": "384d118c27902beb5cf9a040d2547f8b84931af65d97466da08be04ad6df6b17"
  }
}
```

After PASS, root pastes the Oracle's unchanged final-verification envelope here.

- AC-1: PASS | `unit-narration.mjs` parser cases (U1) | PR parser tests plus D6 regressions: invalid base64 before/after a recognizable envelope and truncated trailing varint/fixed-width fields at all three levels yield no kind; all 7 completed and 7 streamed fixture signatures keep their kinds
- AC-2: PASS | `unit-narration.mjs` streaming cases, `unit-stream-replay.mjs` (U1) | narration ≤800 emitted only as text events with `textSignature`; D7 regression finds no held block in the shared partial message and no reasoning after Pi 1.4.0 invalidate/thinking toggle; release past 800, abandonment, abort, error, turn reset and finalization covered; `narration.jsonl` kinds match CC `narration_block_indexes`; reasoning fixtures unchanged
- AC-3: PASS | `unit-narration.mjs` fallback cases, `unit-nonstreaming-fallback.mjs` (U1) | completed narration becomes text with its signature, no length cap; other thinking unchanged; keep-every-block preserved
- AC-4: PASS | `unit-narration.mjs` replay cases, `unit-import.mjs`, `unit-convert-determinism.mjs` (U1) | shared `isNarrationReplayBlock` (`src/convert.ts`) replays bridge-owned narration as signed thinking; ordinary/unsigned/foreign/non-narration text stays text; `origins` and wrapped `{input}` envelopes unchanged (one replay assertion moved from `dropped` to `origins`)
- AC-5: PASS | 10 new tests in `unit-message-digests.mjs`, `unit-live-recording.mjs`, `unit-sync-shared-session.mjs` (U2, red→green) | `message-digests.ts` hashes narration replay text as `thinking:`+text+signature via the shared predicate; digest equals signed thinking; signature change changes it; legacy text digests stable; held streaming (with tool call) and fallback narration complete UUID coverage with no gap; next turn plain reuse (no fork/rewrite/history write); both import paths write signed thinking; a simulated loss of `textSignature` is detected at that message
- AC-6: PASS | review and `git diff --check` (U3) | README "Progress updates" paragraph after "Behind the scenes" (its model-switch sentence corrected after final verification round 1: bridge-to-bridge switches keep the signed replay; only signature-stripping provider adapters send plain text); CHANGELOG UNRELEASED entry "Fix: show Claude progress updates as text" citing PR #212/issue #211 and the local digest adaptation
- AC-7: PASS | root, sequential, env vars unset | bridge typecheck exit 0; `test:unit` 787/787 (baseline 740); bridge build exit 0; root `check:ci` exit 0 (warnings/infos only), `typecheck` exit 0, `build` exit 0, `test:pi-extensions` 13/13. In final verification round 1, Oracle's own full `test:unit` run hit one transient Windows cleanup EPERM in unchanged `unit-session-prefix.mjs:30`; that file passed 12/12 in isolation; `git diff --check` clean; scope: only `pi-packages/pi-claude-bridge/**` and the record; no live suites run
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:126cf3b69e3f70a5ace3ac57db910b82c7d94895cbcccafb2cb7efd30d18bf0b

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY

Remaining risk: the signature envelope layout is undocumented; if Anthropic changes it, progress updates fall back to hidden reasoning (fail closed). Progress updates longer than 800 characters stay reasoning while streaming. Reconcile with upstream's form of PR #212 at the next sync.
