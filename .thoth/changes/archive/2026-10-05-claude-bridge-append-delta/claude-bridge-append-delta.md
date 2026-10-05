# Change: claude-bridge-append-delta

**Classification**: substantial
**Scope**: local
**Uncertainty**: low
**Risk**: medium

**Name legend** (aliases avoid the SDD placeholder check):
- BRIDGE = `pi-packages/pi-claude-bridge`; CC = Claude Code driven by `@anthropic-ai/claude-agent-sdk` 0.3.286 (bundled CC 2.1.286).
- OPEN-BLOCK = the `<thoth-todo-open-tasks>` block appended by `@thoth-agents/pi-todo`.

## Exploration

- Branch `EremesNG/thoth-theme` at `7130b8a` (0.5.0, includes archived `claude-bridge-prompt-refresh`).
- BRIDGE delivers the full current projected append inside `<claude-bridge-appended-instructions>` through a query-scoped `UserPromptSubmit` hook whenever it differs from the per-epoch effective append (`src/append-instructions.ts:1-68`, payload `:49-54`, commit `:58`, epochs reset at `src/index.ts:1582,1584`).
- Live session evidence: the projected append is about 58 KB (project context, skills, root instructions, then OPEN-BLOCK). CC replaced it with `<persisted-output>` (file path plus a 2,000-character preview) on two consecutive prompts, so the model did not see the updated OPEN-BLOCK in context.
- CC limit: each `additionalContext` string longer than 10,000 JavaScript string-length units is persisted to a file with a 2,000-character preview; exactly 10,000 stays inline; there is no setting to raise it; values from multiple hooks are limited individually and concatenated with newlines (hooks docs `hooks.md:917-921,1001-1005`; changelog 2.1.89; installed binary constant `1e4` and per-hook processing).
- Append structure: `projectPromptCapture` joins up to four parts with `\n\n`: `<project_context>` with `<project_instructions path=...>` children, the skills block, the custom prompt, and Pi's `appendSystemPrompt` (`src/prompt-capture.ts:320-353`). Inside the latter, first-party content is delimited: `<!-- thoth-agents:pi-root:start -->` to `<!-- thoth-agents:pi-root:end -->` (`src/pi.ts:238-244`, `src/harness/writers/pi-agent.ts:65-67`) and OPEN-BLOCK (task-list package `state/reinjection.ts` lines 38-44); host or user additions are free text. No other first-party package appends.
- Payload-format test blast radius: `tests/unit-append-instructions.mjs:188-192,206`; no other file matches the delimiter.
- Canonical requirement "Claude bridge keeps appended instructions current" (`.thoth/specs/pi-ecosystem/spec.md:59-68`) requires delivering the full current appended instructions and has exactly one scenario.

## Intent

Keep the refreshed appended instructions visible in the model context by delivering only the top-level blocks that changed since the instructions the model last received, each entry within CC's inline limit, instead of the full append.

## Non-goals

- Changing epoch, effective-commit, one-shot, retry or isolation semantics from `claude-bridge-prompt-refresh`.
- Changing what Pi, the task-list package or the root prompt append.
- Mid-prompt refresh between tool turns.

## Acceptance

- AC-1: BRIDGE segments a projected append into ordered top-level blocks: XML-like elements whose opening tag starts a line (key = tag name plus a `path` or `name` attribute when present, recursing one level into `<project_context>` so each `<project_instructions path=...>` is its own block), `<!-- name:start -->` to `<!-- name:end -->` comment regions (key = name), and free-text runs between them (key = ordinal among free-text runs); a duplicate key or unbalanced block makes the whole append one block.
- AC-2: On a changed append, BRIDGE delivers only added or changed blocks (full block text) and removed block keys, inside one delimited update that states these blocks supersede the same-keyed blocks of earlier appended instructions and that all unlisted blocks remain as previously given; when the block order changed, or the effective append cannot be segmented into the same scheme, it delivers the full append instead. Empty current append is delivered as all blocks removed.
- AC-3: Every delivered `additionalContext` string is at most 9,000 string-length units; a larger update is split across several query-scoped `UserPromptSubmit` hook callbacks, each labeled with its part number and total, and the effective append commits only after every part's callback has returned its context. If some but not all parts were delivered, the baseline is marked uncertain: the next query delivers the full current append (split into parts) as a replacement, even when the current append equals the previous effective one, and only a fully delivered replacement clears the uncertain state.
- AC-4: Unit tests cover: one changed small block within a large append (payload contains only that block, below 9,000), added and removed blocks, empty append, free-text change, order change and unsegmentable input (full fallback), a large change split into several parts with commit only when all are delivered, partial delivery of B followed by A and by C (both force a full replacement), and the existing claude-bridge-prompt-refresh cases still passing; the opt-in live probe additionally runs with a large (over 10,000 character) static append plus a changed small block placed beyond the first 2,000 characters, keeps the recording-disabled control and same-epoch reuse checks, and passes only when the model reports the new value; README and CHANGELOG updated.
- AC-6: Cache preservation is asserted on request content, not option identity: unit tests snapshot the prior conversation sent for consecutive resumed queries with changing appends and assert earlier messages stay byte-identical and updates appear only as hook context attached to the new turn; the `systemPrompt` option construction stays exactly as today (it already passes the current append, and CC recording keeps the recorded system prompt, `sdk.d.ts:2356-2382`); evidence from the installed CLI that hook context is appended as new trailing meta-user reminders (embedded source offsets 216482599 and 212825463) is cited in the README.
- AC-5: BRIDGE typecheck and `test:unit` pass; `pnpm run check:ci` passes; the live probe passes against the operator's CC login (or is recorded as unrun/inconclusive, never PASS).

## Clarifications

- Deliver only changed blocks (user answer, "Planear entrega por bloques").
- Prompt cache preservation is mandatory (user answer): the change must not invalidate any cached prefix.

## Decisions

- Generic segmentation, not first-party-specific parsing, so any extension's tagged block refreshes cheaply; free text falls back to ordinal keys.
- Safety margin of 9,000 units under CC's 10,000 limit; splitting uses several hook callbacks because CC limits each value separately.
- Fallback to the full append (split into parts) whenever block identity is ambiguous, so the model never receives a misleading partial update.
- Partial multipart delivery is not transactional in CC, so it marks the baseline uncertain and the next query sends a full replacement (plan review round 1).
- The archived requirement is MODIFIED (single scenario) rather than adding a new one.
- Cache preservation (plan review round 1): the `systemPrompt` option construction is unchanged from today and CC recording keeps the recorded system prompt; every earlier message stays byte-identical; updates enter only as hook context attached to the new user turn at the end of the conversation, so the cached tools/system/history prefix is reused and only new tail tokens are added. No snapshot opt-out, no history rewrite.

## Durable deltas

- `MODIFIED pi-ecosystem` **Claude bridge keeps appended instructions current** — `@thoth-agents/pi-claude-bridge` MUST, for a resumed Claude Code session within one recording epoch, deliver through Claude Code's conversation-context channel the appended system instructions that changed since the latest ones the model has been given (including a return to the recorded value or an empty value) as the added, changed and removed top-level blocks labeled as superseding the same blocks of earlier versions, falling back to the full current appended instructions when blocks cannot be identified unambiguously, MUST keep every delivered context value within Claude Code's inline limit by splitting larger updates, MUST deliver nothing extra when they are unchanged, and MUST NOT disable Claude Code system prompt recording or replace the recorded system prompt.
  - GIVEN a resumed Claude Code session whose large appended instructions changed in one small block after it started; WHEN the next prompt runs through the bridge; THEN the model receives that changed block inline in its context, unchanged blocks are not resent, and the recorded system prompt and its cache prefix stay unchanged .

## Plan

Add `src/append-blocks.ts` (pure segmentation and diff: `segment(text)`, `diffBlocks(effective, current)` returning blocks, removals or a full-fallback flag, and `splitParts(payload, limit)`); change `src/append-instructions.ts` to build the update from the diff and register one hook callback per part, tracking delivered parts per query before committing; keep epochs and isolation unchanged. Update unit tests and extend `tests/int-append-instructions.mjs` with a large static append. One worker unit (U1) for source, unit tests, live probe, README and CHANGELOG; root runs the live probe and gate; fresh Oracle verification.

## Tasks

- [x] AC-1: Pure block segmentation with keyed blocks and ambiguity fallback
  - Outcome: deterministic segmentation of projected appends
  - Known entrypoints and skill paths: `pi-packages/pi-claude-bridge/src/prompt-capture.ts:320-353`, `src/agents-md.ts:6-14`, `src/append-instructions.ts`; skills `C:\Users\EremesNG\.pi\agent\skills\tdd\SKILL.md`, `C:\Users\EremesNG\.pi\agent\skills\simplify\SKILL.md`
  - Inputs: this record
  - Dependencies: none
  - Output: `src/append-blocks.ts` and unit tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-claude-bridge/src/**`, `pi-packages/pi-claude-bridge/tests/**`, README, CHANGELOG
  - Interface boundaries: prompt capture and `systemPrompt` option unchanged
  - Focused check and PASS evidence: segmentation tests pass in `test:unit`
  - Return milestone: together with AC-2..AC-4 in one assignment
  - Stop / reassessment: real appends that cannot be segmented without first-party knowledge
- [x] AC-2: Block-level update payload with full fallback
  - Outcome: only changed blocks delivered
  - Known entrypoints and skill paths: `src/append-instructions.ts:1-68`, `tests/unit-append-instructions.mjs:188-206`
  - Inputs: AC-1 output (same assignment)
  - Dependencies: none
  - Output: payload builder and tests
  - Owner: thoth-worker
  - Writes: same as AC-1
  - Interface boundaries: epoch semantics unchanged
  - Focused check and PASS evidence: delta and fallback tests pass
  - Return milestone: same assignment
  - Stop / reassessment: none beyond AC-1
- [x] AC-3: Size-bounded multi-part delivery with all-parts commit
  - Outcome: no delivered value exceeds 9,000 units
  - Known entrypoints and skill paths: SDK `sdk.d.ts` hooks (`options.hooks` ~1728, `UserPromptSubmitHookSpecificOutput` ~9843)
  - Inputs: AC-2 output (same assignment)
  - Dependencies: none
  - Output: multi-callback registration and tests
  - Owner: thoth-worker
  - Writes: same as AC-1
  - Interface boundaries: hook initialization gating from the previous change preserved
  - Focused check and PASS evidence: split, partial-delivery uncertain-baseline and full-replacement tests pass
  - Return milestone: same assignment
  - Stop / reassessment: SDK rejects multiple callbacks for one event
- [x] AC-4: Regression suite, large-append live probe, docs
  - Outcome: coverage and documentation
  - Known entrypoints and skill paths: `tests/unit-append-instructions.mjs`, `tests/int-append-instructions.mjs`
  - Inputs: AC-1..AC-3 (same assignment)
  - Dependencies: none
  - Output: tests, README, CHANGELOG
  - Owner: thoth-worker
  - Writes: same as AC-1
  - Interface boundaries: none
  - Focused check and PASS evidence: `test:unit` passes
  - Return milestone: same assignment
  - Stop / reassessment: none
- [x] AC-6: Cache-preservation regression
  - Outcome: proof that earlier request content stays byte-identical and updates are new-turn hook context only
  - Known entrypoints and skill paths: `src/index.ts` query options ~2051-2058, `tests/unit-append-instructions.mjs`
  - Inputs: AC-1..AC-3 (same assignment as the worker unit)
  - Dependencies: none
  - Output: unit test
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-claude-bridge/tests/**`
  - Interface boundaries: none
  - Focused check and PASS evidence: the test passes in `test:unit`
  - Return milestone: same assignment
  - Stop / reassessment: any path that rewrites earlier conversation content or the recorded system prompt
- [x] AC-5: Gate and live run
  - Outcome: checks and live evidence
  - Known entrypoints and skill paths: root scripts; live command from the previous change
  - Inputs: accepted worker unit
  - Dependencies: AC-1..AC-4 units
  - Output: results in Verification
  - Owner: root
  - Writes: none
  - Interface boundaries: none
  - Focused check and PASS evidence: typecheck, `test:unit`, `check:ci` exit 0; live probe PASS or recorded unrun
  - Return milestone: before Oracle verification
  - Stop / reassessment: failure returns to the worker unit

## Authorization

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

- Plan review history: round 1 [REJECT] cache acceptance asserted option identity instead of request content, and partial multipart delivery left an unreliable baseline — repaired; round 2 fresh Oracle [OKAY] with explicit cache-preservation judgment (sound within an active recording epoch).
- Implementation authorized by explicit user choice (Implement) after [OKAY].

## Verification

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: b65c9958ade3c0d103a01ad4555e47d7e957a596bf59b6f7f758f0a2238a7208

- Cache judgment (Oracle): within an active recording epoch the change does not invalidate the cached prompt prefix; recorded system and history content stay unchanged and updates enter as new-turn hook context; live cache reads 0 then 6,362 then 6,649 tokens, including the refreshed turn.
- AC-1: PASS | segmentation tests and checks against real projectPromptCapture output | project_context children, root comment region, task-list block, free text, duplicate/unbalanced fallback
- AC-2: PASS | keyed diff tests | added/changed blocks, removed keys, empty append, order change and ambiguous baselines fall back to full
- AC-3: PASS | multipart tests through the real SDK transport | framed values within 9,000 units, out-of-order callbacks, all-parts commit, partial delivery forces full replacement incl. restoration
- AC-4: PASS | bridge test:unit 385/385 (41 focused) + live probe + docs review | live probe against the operator's Claude Code login: alpha, alpha (delivery disabled, same reused session, recording active), beta (sentinel beyond a >10,000-char static append), every hook value at most 9,000 units, exit 0
- AC-5: PASS | bridge typecheck, test:unit, pnpm run check:ci, git diff --check | all exit 0; index.ts, prompt capture, transcript and systemPrompt construction unchanged
- AC-6: PASS | request-content assertions + installed CLI evidence + live cache telemetry | earlier request content byte-identical, updates only as new-turn hook context
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:0995fd0f00c307ca7f7596a1c64045ff64d3d2ce7ccc1ff3c082305cb0a50b81

## Closeout

**Archive**: READY
