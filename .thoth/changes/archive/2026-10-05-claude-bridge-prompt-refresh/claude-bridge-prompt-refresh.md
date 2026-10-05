# Change: claude-bridge-prompt-refresh

**Classification**: substantial
**Scope**: local
**Uncertainty**: medium
**Risk**: medium

**Name legend** (aliases avoid the SDD placeholder check):
- T-PKG = `@thoth-agents/pi-todo`; OPEN-BLOCK = the `<thoth-todo-open-tasks>` block T-PKG appends in `before_agent_start`.
- BRIDGE = `pi-packages/pi-claude-bridge`; CC = the Claude Code runtime driven by `@anthropic-ai/claude-agent-sdk`.

## Exploration

- Branch `EremesNG/thoth-theme` at `94a52b6`; 0.5.0 contains it.
- BRIDGE depends on `@anthropic-ai/claude-agent-sdk` `^0.3.284`, installed `0.3.286`, bundled CC `2.1.286` (`package.json:36`; SDK `package.json:3,91`).
- BRIDGE starts one CC `query()` per user prompt and reuses the CC session with `resume` when prior history matches (`src/index.ts:755-795` `syncSharedSession`); every query passes `systemPrompt: { type: "preset", preset: "claude_code", append }` with a freshly projected append (`src/index.ts:1888-1896,2051-2058`; `src/prompt-capture.ts:341-349`). Mid-prompt tool turns do not start a query: tool results go to the running query through MCP (`src/index.ts:1649-1685,1815-1838`).
- Pi SDK 1.0.2 runs `before_agent_start` once per prompt; T-PKG mutates `systemPromptOptions.appendSystemPrompt` there (T-PKG `index.ts` lines 254-257 and `state/reinjection.ts` lines 12-48); BRIDGE keeps the same options object and re-records captures at `agent_start`/`turn_start` (`src/index.ts:2492-2524`), so the new append is projected into each new query.
- Installed SDK documents system prompt recording: the first request's full system prompt is recorded and reused verbatim for every later request and for `resume`/`continue`; a different `append` on a later launch of the same session is ignored until compaction or a new session; `snapshot: false` renders fresh every request (`sdk.d.ts:2356-2382,2401-2413`; changelog `0.3.267`: recording default-on for appends). Official CLI docs agree. Changing the system block invalidates prompt cache prefixes at and after it and can discard earlier extended-thinking reasoning (`sdk.d.ts:2356-2363`).
- Therefore, where recording is active (it is rollout/account/provider dependent, `sdk.d.ts:2379-2382`), OPEN-BLOCK and any other dynamic append content reach the model only in the first query of a recording epoch; later prompts in the same epoch see the recorded first append. The operator saw OPEN-BLOCK right after restarting Pi (new CC session), consistent with this.
- SDK 0.3.286 supports query-scoped `options.hooks` (`sdk.d.ts:1728`) and serializes hook callbacks plus `appendSystemPrompt`/`systemPromptSnapshot` through initialization (`sdk.mjs:138,142`). BRIDGE rebuilds transcripts while preserving the CC session UUID (`src/index.ts:830-848`) and clears mirrors on restart/resume (`src/index.ts:2453-2461`), so a matching session id does not prove that the recorded prompt was reused.
- CC hooks: `UserPromptSubmit` output supports `additionalContext`, delivered as a system reminder with the submitted prompt (official hooks docs; `sdk.d.ts:9843-9845`). BRIDGE registers no SDK hooks today (`rg "hooks|UserPromptSubmit|additionalContext" src` empty).
- BRIDGE tests covering prompt capture/resume: `tests/unit-resume-prompt-capture.mjs`, `tests/unit-agent-start-capture.mjs`, `tests/unit-agent-start-capture-gaps.mjs`, `tests/unit-prompt-capture.mjs`, `tests/unit-sync-shared-session.mjs`; live integration `tests/int-session-resume.mjs` (not in CI `test:unit`).

## Intent

When a resumed CC session's current projected append differs from the append recorded when that session started, BRIDGE delivers the current appended instructions to the model with the resumed prompt through CC's supported conversation-context channel, so dynamic system prompt content (such as OPEN-BLOCK) stays current for the whole session without disabling system prompt recording or invalidating the cached system prefix.

## Non-goals

- Updating instructions inside a single prompt between tool turns (the running query receives only tool results; the model already sees its own task-list tool results).
- Changes to T-PKG or Pi SDK behavior; no T-PKG-specific logic in BRIDGE.
- Setting `snapshot: false` or replacing the recorded system prompt.
- Other providers and bridges.

## Acceptance

- AC-1: BRIDGE tracks, per recording epoch (a new CC session, a transcript rebuild even when the UUID is preserved, or a compaction), the recorded append (projected for the epoch's first query) and the effective append (the latest appended instructions the model has been given, initially the recorded one). On a resumed query in the same epoch whose current append differs from the effective append, it supplies the full current appended instructions through a query-scoped `UserPromptSubmit` hook `additionalContext`, delimited and labeled as superseding every earlier appended-instructions version; the effective append advances only when the hook callback has actually returned that context for the query (registration alone never advances it), and the block is one-shot per query so later steering prompts in the same query never replay it; this includes returning to the recorded value and an empty append (explicitly stated as none). When current equals effective, it supplies nothing. The recorded system prompt and the `systemPrompt` option stay as today.
- AC-2: Unit tests cover unchanged append (no context), changed append on resume, consecutive changes, the sequence A to B to A (restoration delivered), append becoming empty, a failed or skipped delivery of B followed by another B prompt that retries delivery, no replay on steering prompts within one query, epoch reset on new session, transcript rebuild with the same UUID and compaction, child/subagent and ephemeral sessions not affecting other sessions' state, and hook registration failure degrading to today's behavior without throwing.
- AC-3: An opt-in live integration test (like `int-session-resume.mjs`) first establishes that recording is active for the account (the model does not see a changed append on a reused session with the delivery disabled) and that the second prompt reused the session without a transcript rebuild, then shows that with delivery enabled the model reports the changed value; if recording is not active or reuse cannot be established, the test reports inconclusive and AC-3 is recorded as unrun, never as PASS. The bridge README documents the behavior.
- AC-4: BRIDGE typecheck and `test:unit` pass; `pnpm run check:ci` passes; no other package changes.

## Clarifications

- Delta delivered through `additionalContext` (user answer).
- Covers all dynamic append content, not only OPEN-BLOCK (user answer).

## Decisions

- Compare the projected append string (the same value passed as `systemPrompt.append`), not the Pi system prompt, so BRIDGE stays provider-neutral about extension content.
- Deliver the full current append, not a textual diff, so the model never reconstructs state; label it as superseding the session-start appended instructions.
- Query-scoped hooks are supported by SDK 0.3.286, so there is no prompt-prefix fallback; if hook registration fails at runtime, the query proceeds as today (plan review round 1).
- Delivery state commits on successful delivery only: the hook callback marks the delivery done when it returns the context; a failed registration, a callback that never runs, or an error keeps the previous effective append so the next query retries (plan review round 2).
- Delivery compares against the effective append, not the recorded one, because hook context stays in conversation history; this makes A to B to A deliver the restoration (plan review round 1). Each delivery supersedes all earlier ones explicitly.
- Recording epochs reset on a new session id, on a transcript rebuild (even with the same UUID) and on compaction; state is keyed per CC session so child and ephemeral sessions never reset another session's epoch.

## Durable deltas

- `ADDED pi-ecosystem` **Claude bridge keeps appended instructions current** — `@thoth-agents/pi-claude-bridge` MUST, for a resumed Claude Code session within one recording epoch, deliver the full current appended system instructions through Claude Code's conversation-context channel whenever they differ from the latest appended instructions the model has been given (including a return to the recorded value or an empty value), labeled as superseding earlier versions, MUST deliver nothing extra when they are unchanged, and MUST NOT disable Claude Code system prompt recording or replace the recorded system prompt.
  - GIVEN a resumed Claude Code session and appended instructions that changed after it started; WHEN the next prompt runs through the bridge; THEN the model receives the current appended instructions with that prompt while the recorded system prompt and its cache prefix stay unchanged .

## Plan

Approach: add a per-session epoch store in BRIDGE next to `syncSharedSession` holding recorded and effective appends; in the query builder compute the current projected append, compare with the effective one, and when different register a query-scoped `UserPromptSubmit` hook returning `{ hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext } }` with a delimited superseding block, commit the effective append inside the callback after it returns the context (one-shot per query); start a new epoch on new session id, transcript rebuild or compaction. Unit tests use the existing mock/fake query seams. Live integration test follows `tests/int-session-resume.mjs`.

Units: U1 implementation and unit tests (worker); U2 live integration run (root, needs operator credentials; opt-in); then fresh Oracle verification.

Risks: per-query hooks API shape in SDK 0.3.286; interaction with prompt capture keys (`unit-agent-start-capture-gaps.mjs`); extended thinking or cache effects of extra context (appended in conversation only).

## Tasks

- [x] AC-1: BRIDGE baseline store and per-query delivery of changed appended instructions
  - Outcome: resumed queries carry current appended instructions when they changed
  - Known entrypoints and skill paths: `pi-packages/pi-claude-bridge/src/index.ts:755-795,1888-1896,2051-2058,2478-2524`, `src/prompt-capture.ts`, SDK `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts` (hooks, `UserPromptSubmitHookSpecificOutput` ~9843, system prompt ~2356-2413); skills `C:\Users\EremesNG\.pi\agent\skills\tdd\SKILL.md`, `C:\Users\EremesNG\.pi\agent\skills\simplify\SKILL.md`
  - Inputs: this record
  - Dependencies: none
  - Output: source changes and unit tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-claude-bridge/src/**`, `pi-packages/pi-claude-bridge/tests/unit-*.mjs`, `pi-packages/pi-claude-bridge/README.md`, `pi-packages/pi-claude-bridge/CHANGELOG.md` (UNRELEASED)
  - Interface boundaries: `systemPrompt` option unchanged; no other package
  - Focused check and PASS evidence: typecheck and `test:unit` pass with the AC-2 cases
  - Return milestone: tests green
  - Stop / reassessment: query-scoped hooks unusable at runtime, or epoch detection impossible for rebuild/compaction
- [x] AC-2: Unit coverage of unchanged, changed, repeated, reset, child and degraded paths
  - Outcome: regression suite for the delivery rules
  - Known entrypoints and skill paths: `pi-packages/pi-claude-bridge/tests/unit-resume-prompt-capture.mjs`, `tests/unit-sync-shared-session.mjs`
  - Inputs: AC-1 unit (same assignment)
  - Dependencies: none
  - Output: unit tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-claude-bridge/tests/unit-*.mjs`
  - Interface boundaries: none
  - Focused check and PASS evidence: listed cases pass in `test:unit`
  - Return milestone: same assignment as AC-1
  - Stop / reassessment: none beyond AC-1
- [x] AC-3: Live integration check and README
  - Outcome: evidence that CC receives changed appended instructions on resume
  - Known entrypoints and skill paths: `pi-packages/pi-claude-bridge/tests/int-session-resume.mjs`
  - Inputs: accepted AC-1 unit
  - Dependencies: AC-1 unit
  - Output: opt-in integration test (worker, same assignment) and its run result (root)
  - Owner: thoth-worker writes; root runs
  - Writes: `pi-packages/pi-claude-bridge/tests/int-*.mjs`, README
  - Interface boundaries: none
  - Focused check and PASS evidence: the integration test establishes active recording and reuse, then passes against the operator's Claude Code login
  - Return milestone: before Oracle verification
  - Stop / reassessment: live run unavailable, recording inactive or reuse unproven — record AC-3 as inconclusive/unrun instead of claiming PASS
- [x] AC-4: Gate
  - Outcome: checks pass
  - Known entrypoints and skill paths: root `package.json` scripts
  - Inputs: accepted AC-1..AC-3
  - Dependencies: all previous units
  - Output: results in Verification
  - Owner: root
  - Writes: none
  - Interface boundaries: none
  - Focused check and PASS evidence: BRIDGE typecheck, `test:unit`, `pnpm run check:ci` exit 0
  - Return milestone: before Oracle verification
  - Stop / reassessment: failure returns to AC-1

## Authorization

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

- Plan review history: round 1 [REJECT] A to B to A stale replacement and live test not proving recording — effective-append tracking per recording epoch and recording/reuse proof; round 2 [REJECT] effective advanced at registration — commit only on callback delivery with retry; round 3 fresh Oracle [OKAY].
- After [OKAY] the user explicitly chose Stop; later the user explicitly asked to continue with the approved plan, which authorizes implementation.

## Verification

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: ae7a8d64a85aa261e1f4ca969f5381f01272ec6fdd32eebfb7b9089f9242a8a3

- Review history: final round 1 FAIL (hook-initialization fallback could resubmit an already accepted prompt) repaired by withholding initial input until hook initialization succeeds and never restarting after input was yielded; final round 2 fresh Oracle PASS.
- AC-1: PASS | code review + real-SDK fake-transport regressions | per-session recording epochs (new session, same-UUID rebuild, compaction), effective-vs-recorded comparison incl. restoration and empty append, commit only on callback delivery, one-shot per query, no prompt replay on initialization failure, no-hook queries not delayed
- AC-2: PASS | bridge test:unit 362/362 (30 focused cases) | unchanged, changed, consecutive, A to B to A, empty, failed/skipped retry, steering non-replay, epoch resets, child/ephemeral isolation, degraded registration
- AC-3: PASS | opt-in live probe int-append-instructions.mjs against the operator's Claude Code login (bundled CC 2.1.286), run three times | delivery disabled: model kept the initial value on a reused session without rebuild (recording active); delivery enabled: model reported the changed value; exit 0 after the repair; README documents the behavior
- AC-4: PASS | bridge typecheck, test:unit, pnpm run check:ci, git diff --check | all pass; no other package changed
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:1454f6e93d529caf0a6ea3674bfbd2448d8189bd67af564ae0586c042ac33fdc

## Closeout

**Archive**: READY
