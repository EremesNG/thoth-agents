# Change: antigravity-retry-resume-images

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: medium
**Risk**: high

## Exploration

Baseline HEAD `21edc826`. Upstream EstebanForge/pi-extensions `fbf50ce` (1.9.1, retry-tail resume + first-park binding; its timer part already ported in `21edc826`), `7be695f` and `da4e9c2` (1.8.8, image propagation and staging). Paths relative to `pi-packages/pi-antigravity-bridge/`.

- Retry tails: `src/provider.ts:84–126` builds a prompt only from a final user message (ACP) or the contiguous user suffix (stream-json). A context ending in assistant/toolResult with no late results reaches `:1596–1631` and fails with "No user message to send to agy." even when the conversation is bound.
- Binding: `:1714` returns on park; `:1760–1787` persists conversation ID, watermark and staged carrier agent only from the handle's successful outcome. `:526–539` captures the originating handle; `src/driver-types.ts:116` `TurnHandle` exposes no live conversation identity; the stream driver tracks it internally (`src/driver.ts:579–592,655`). Upstream binds at park from the mutable driver-global `snapshot().conversationId`, which violates the local per-originating-handle ownership invariant.
- Poisoned resume: `:1726–1730` lacks upstream's `modelOutputSeen === false` guard, so a deadline without a result frame can clear a binding even after the model produced output.
- Images: `:133–140` extracts images only from the final user message while stream-json text spans the user suffix (`:112–128`). Stranded/late recovery (`:1542–1562`, also used at `:1592` and `:1800`) copies name/text/error/reason but drops `view.images`. Stream-json `src/driver.ts:300–303` serializes only `request.prompt`. ACP already sends native image blocks (`src/acp/driver.ts:407`, `src/acp/connection.ts:313–341`). `extensions/index.ts:182–183` advertises `["text","image"]` only for ACP.
- Local delivery semantics that differ from upstream: claims are reservations released on failed starts (`:599–631`); unknown owners stay pollable and never prompt; separate conversations dispatch separately and commit only after target-confirmed dispatch (`:1542–1583`); stream-json publishes a handle only after launch and frame-write acknowledgement (`src/driver.ts:305–324`); ACP after prompt-write acknowledgement (`src/acp/driver.ts:282–296`); Windows owned-process stdin acks after the target `job.stdin` write (`src/owned-process.ts:52–89,197`).
- Coverage: `tests/provider-prompt-preservation.test.ts`, `provider-escalation.test.ts`, `provider-late-result.test.ts`, `provider-dispatch*.test.ts`, `provider-watermark.test.ts`, `provider-issue2.test.ts`, `provider-sysprompt.test.ts`, `provider-streaming.test.ts`, `acp-driver.test.ts`, `owned-process-stdin.test.ts`.

## Intent

Port the retry-tail resume, ownership-safe early conversation binding, poisoned-resume guard, and end-to-end image delivery from upstream into the fork, re-implemented on top of the local delivery-claim and originating-handle ownership model.

## Non-goals

- Background delegation / `/agy-stop` (`a4a2a3e`), global `queuedMessages` defaulting, system-notification sanitizer, delegation hardening, observer-worker short-circuit.
- Replacing local claim, dispatch, or Windows owned-process machinery with upstream code; changing `startupTimeoutMs`/ACP dispatch bounds.
- Guaranteeing exactly-once side effects across a synthetic resume, or verifying that the model actually reads staged pixels.
- Package version bumps.

## Acceptance

- AC-1: A provider turn whose context ends in assistant/toolResult, with no user prompt, no images and no late results for that conversation, in a bound conversation, dispatches a synthetic continuation prompt into the bound conversation instead of erroring; an unbound or empty context keeps the existing hard error; synthetic resumes skip the context digest.
- AC-2: At the first park of a fresh dispatch whose conversation has no existing binding, the binding (conversation ID, dispatch watermark, staged carrier agent) is persisted from the originating handle's own conversation identity, never from a driver-global snapshot; an existing or newer binding is never overwritten at park, repeated parks keep the original dispatch watermark, and concurrent or unrelated handles cannot bind or overwrite another handle's conversation; later outcome handling keeps its current semantics, including A→B recreation detection and preserving the pre-turn watermark when a parked-then-resumed turn ends in error or abort.
- AC-3: A turn that hits its deadline without a result frame does not clear the conversation binding when model output was observed.
- AC-4: Stranded and late recovery prompts carry the results' images, grouped per originating conversation, with unchanged claim semantics: unknown owners stay pollable and never prompt, unstarted groups release their claims, and delivery commits only after target-confirmed dispatch.
- AC-5: Stream-json turns deliver images from the whole trailing user suffix and from recovered results by staging them under the OS temp directory (`pi-bridge-img-*` directories, owner-only file mode, MIME-derived names, zero-byte rejection, partial-directory cleanup, symlink-safe opportunistic 24-hour sweep) and referencing the staged paths in the frame; a staging failure still dispatches the prompt with an explicit "image(s) could not be delivered" notice and a warning log; stream-json models advertise `text` and `image` input.
- AC-6: Existing invariants and suites stay green: target-confirmed dispatch, Windows stdin acknowledgement, bounded ACP dispatch, per-originating-handle ownership; package CHANGELOG `[Unreleased]` documents the changes.

## Clarifications

- Resume wording/duplicate risk: user chose the upstream-style synthetic continuation ("check the history, continue, do not repeat completed actions"), accepting that it discourages but does not prevent duplicate side effects (2026-11-03).
- Staging location/retention: user chose OS temp directory with 24-hour opportunistic sweep, as upstream (2026-11-03).
- Staging failure: user chose dispatching the prompt with an explicit missing-image notice rather than retaining the result for retry (2026-11-03).

## Decisions

- Live conversation identity becomes an explicit per-handle surface on `TurnHandle` (both stream-json and ACP drivers), set only by the driver turn that owns the handle; provider early binding reads only the originating handle captured at dispatch.
- Park-time binding applies only when the originating dispatch started with no existing binding (as upstream `fbf50ce` restricts to `!existing`) and writes only if the store is still unbound; it persists the conversation ID, staged carrier agent and the watermark equal to the message count of the context that turn was dispatched with, and later parks of the same turn never rewrite it. When a binding already exists, park persists nothing, so recreation detection (`src/provider.ts:1769`) still compares the outcome against the pre-turn ID and error/abort keeps the pre-turn watermark (`:1780–1784`); the later outcome overwrites or clears exactly as today. An unavailable stream-json identity stays unavailable (no binding) rather than borrowing another turn's ID.
- The synthetic-resume gate needs per-conversation recovery information: the recovery sweep returns which conversations received late results instead of only an aggregate boolean, preserving unknown-owner release and owned-result digest exclusions.
- Stream-json image extraction follows the same trailing-user-suffix boundary as its text; ACP keeps final-user-message semantics.
- Recovered images travel with their result inside the existing per-conversation group; staging happens after a group is claimed and before dispatch, and a staging failure degrades to the notice without releasing or double-consuming claims.
- Staged paths are delivered as prompt notes; dispatch success means confirmed prompt write, not pixel receipt.

## Durable deltas

- `ADDED pi-ecosystem` **Antigravity bridge resumes retry-dropped tails** — `@thoth-agents/pi-antigravity-bridge` MUST resume a bound conversation with a synthetic continuation prompt when a provider turn's context ends in an assistant or tool-result message with no new user input, images or late results, MUST keep failing visibly when no conversation is bound, and MUST bind a conversation at a turn's first park only from that turn's originating handle.
  - GIVEN a bound Antigravity conversation; WHEN Pi retries a turn whose context ends in an assistant or tool-result message without new user input; THEN the bridge dispatches a continuation prompt into that conversation instead of erroring; and GIVEN two concurrent turns; WHEN one parks first; THEN only its own conversation is bound.
- `ADDED pi-ecosystem` **Antigravity bridge delivers images on every path** — `@thoth-agents/pi-antigravity-bridge` MUST deliver user and recovered tool-result images on both engines, natively on ACP and as owner-only staged temporary files referenced in the prompt on stream-json, and MUST dispatch an explicit missing-image notice instead of silently dropping images when staging fails.
  - GIVEN a stream-json session with an image in the user suffix or in a stranded escalated result; WHEN the prompt is dispatched; THEN the image is staged and its path referenced in that prompt, or the prompt states that the image could not be delivered.

## Plan

Two sequential implementation units owned by one `thoth-worker` each (both write `src/provider.ts`, so no parallel writers), followed by fresh Oracle final verification.

- **U1 (E: AC-1, AC-2, AC-3, AC-6)** — `src/driver-types.ts` adds a per-handle live conversation identity accessor; `src/driver.ts` and `src/acp/driver.ts` populate it from the turn that owns the handle. `src/provider.ts`: at the park return (`~:1714`) persist the binding from the originating handle only for an unbound fresh dispatch (store still unbound, original dispatch watermark); add the synthetic-continuation branch before the "No user message" error (`~:1596–1631`) gated on a bound conversation, assistant/toolResult tail, and no prompt/images/late results for that conversation; skip digest for synthetic resumes; add the `modelOutputSeen` guard at `~:1726–1730`. Tests: new `tests/provider-resume.test.ts` plus extensions of `provider-watermark`, `provider-escalation` (concurrent origins), `provider-issue2`.
- **U2 (F: AC-4, AC-5, AC-6)**, after U1 is accepted — new `src/prompt-images.ts` (staging, sweep, hardening from `da4e9c2`); `src/provider.ts` carries `view.images` through recovery grouping and dispatch (`~:1542–1562`, `:1592`, `:1800`) and through tombstoned results, extracts stream-json images from the user suffix; `src/driver.ts` stream-json frame includes staged-path notes or the failure notice; `extensions/index.ts` advertises text+image for stream-json. Tests: new `tests/prompt-images.test.ts`, `tests/provider-image-delivery.test.ts` (both engines, mid-turn stranded recovery, staging failure, claim release on unstarted groups).
- Verification seams: provider tests via the existing fake drivers/registry; stream-json frame content via fake owned child; staging with an injected temp root and fake clock. Focused gates: package `vitest run` (`--maxWorkers=2`, Pi env overrides unset), package typecheck, root `pnpm run typecheck` and `pnpm run check:ci`.
- Risks: identity surface leaking driver-global state; recovery images changing claim release ordering; Windows file-mode privacy (owner-only mode is not an ACL guarantee); stale staged paths after the sweep; duplicate side effects on synthetic resume (accepted).

## Tasks

- [x] AC-1: U1 synthetic continuation for bound retry-dropped tails
  - Outcome: retry with assistant/toolResult tail in a bound conversation resumes via synthetic prompt; unbound keeps hard error; digest skipped for synthetic resume.
  - Known entrypoints and skill paths: pi-packages/pi-antigravity-bridge/src/provider.ts (~84–126, ~1596–1631); upstream fbf50ce; tdd and simplify skills.
  - Inputs: Exploration and Decisions above; user-approved upstream-style wording.
  - Dependencies: none
  - Output: provider change plus tests in tests/provider-resume.test.ts.
  - Owner: thoth-worker (U1)
  - Writes: pi-packages/pi-antigravity-bridge/src/provider.ts, tests/provider-resume.test.ts, CHANGELOG.md
  - Interface boundaries: late-result registry and per-owner sweep (sweep reports delivered conversation IDs, not only a boolean); unknown-owner release; owned-result digest exclusions; stream-json suffix preservation.
  - Focused check and PASS evidence: new resume tests fail first then pass; provider-prompt-preservation and provider-late-result suites pass.
  - Return milestone: U1 complete with AC-2 and AC-3.
  - Stop / reassessment: if a synthetic resume would need to bypass claim or ownership checks.
- [x] AC-2: U1 originating-handle early binding at first park
  - Outcome: binding persisted at first park from the originating handle's identity; concurrent handles isolated.
  - Known entrypoints and skill paths: src/driver-types.ts:116, src/driver.ts (~579–592, 655), src/acp/driver.ts, src/provider.ts (~526–539, ~1714, ~1760–1787).
  - Inputs: Decisions (identity surface, park watermark).
  - Dependencies: none
  - Output: TurnHandle identity accessor, driver population, provider park binding, tests.
  - Owner: thoth-worker (U1)
  - Writes: src/driver-types.ts, src/driver.ts, src/acp/driver.ts, src/provider.ts, tests (provider-watermark, provider-escalation, provider-resume)
  - Interface boundaries: TurnHandle contract consumers; session store watermark persistence; staged carrier agent transfer.
  - Focused check and PASS evidence: tests fail first then pass for: park binding on an unbound fresh dispatch; no park write when a binding exists; repeated parks keep the original dispatch watermark; parked-then-resumed turn ending in ERROR and in abort keeps the pre-turn watermark; parked A→B recreation still detected; unrelated-handle isolation; unavailable stream-json identity binds nothing. Existing watermark and escalation suites pass.
  - Return milestone: U1 complete.
  - Stop / reassessment: if identity cannot be exposed per handle without driver-global state.
- [x] AC-3: U1 poisoned-resume guard
  - Outcome: deadline without result frame keeps the binding when model output was seen.
  - Known entrypoints and skill paths: src/provider.ts (~1726–1730).
  - Inputs: upstream fbf50ce guard.
  - Dependencies: none
  - Output: guard and a test in provider-issue2 suite.
  - Owner: thoth-worker (U1)
  - Writes: src/provider.ts, tests/provider-issue2.test.ts
  - Interface boundaries: poisoned-resume classification.
  - Focused check and PASS evidence: new guard test fails first then passes; provider-issue2 suite passes.
  - Return milestone: U1 complete.
  - Stop / reassessment: if modelOutputSeen is not observable per turn.
- [x] AC-6: U1 invariants and changelog
  - Outcome: full package suite, typecheck and check:ci pass after U1; CHANGELOG Unreleased entry.
  - Known entrypoints and skill paths: pi-packages/pi-antigravity-bridge/CHANGELOG.md
  - Inputs: U1 implementation.
  - Dependencies: none
  - Output: green checks.
  - Owner: thoth-worker (U1)
  - Writes: CHANGELOG.md
  - Interface boundaries: none
  - Focused check and PASS evidence: package vitest (--maxWorkers=2) all pass; root typecheck and check:ci pass.
  - Return milestone: U1 complete.
  - Stop / reassessment: unrelated environment failures are reported, not fixed.
- [x] AC-4: U2 images through stranded and late recovery
  - Outcome: recovery prompts carry images per originating conversation with unchanged claim semantics.
  - Known entrypoints and skill paths: src/provider.ts (~1166–1194, ~1490–1503, ~1542–1583, :1592, :1800); upstream 7be695f.
  - Inputs: accepted U1.
  - Dependencies: U1 accepted
  - Output: provider change and tests in tests/provider-image-delivery.test.ts.
  - Owner: thoth-worker (U2)
  - Writes: src/provider.ts, tests/provider-image-delivery.test.ts
  - Interface boundaries: claim reservation/release, per-conversation grouping, target-confirmed dispatch.
  - Focused check and PASS evidence: image recovery tests on both engines (including unstarted-group release) fail first then pass; escalation and late-result suites pass.
  - Return milestone: U2 complete with AC-5.
  - Stop / reassessment: if carrying images requires changing claim consumption.
- [x] AC-5: U2 stream-json image staging, failure notice and advertising
  - Outcome: stream-json delivers suffix and recovered images via staged files or explicit notice; stream-json advertises text+image.
  - Known entrypoints and skill paths: new src/prompt-images.ts; src/provider.ts (~112–140); src/driver.ts (~300–303); extensions/index.ts (~182–183); upstream 7be695f, da4e9c2.
  - Inputs: user decisions on location, retention and failure behavior.
  - Dependencies: U1 accepted
  - Output: staging module, frame notes, advertising, tests in tests/prompt-images.test.ts and provider-image-delivery.
  - Owner: thoth-worker (U2)
  - Writes: src/prompt-images.ts, src/provider.ts, src/driver.ts, extensions/index.ts, tests/prompt-images.test.ts, tests/provider-image-delivery.test.ts, CHANGELOG.md
  - Interface boundaries: stream-json frame publication after write acknowledgement; model capability advertising.
  - Focused check and PASS evidence: staging tests (mode, naming, zero-byte, cleanup, symlink-safe sweep with fake clock) and provider stream-json image tests fail first then pass.
  - Return milestone: U2 complete.
  - Stop / reassessment: if staging must happen before claims are taken.
- [x] AC-6: U2 invariants and changelog
  - Outcome: full package suite, typecheck and check:ci pass after U2; CHANGELOG Unreleased entry.
  - Known entrypoints and skill paths: tests/owned-process-stdin.test.ts, tests/provider-dispatch*.test.ts, CHANGELOG.md
  - Inputs: U2 implementation.
  - Dependencies: U1 accepted
  - Output: green checks.
  - Owner: thoth-worker (U2)
  - Writes: CHANGELOG.md
  - Interface boundaries: none
  - Focused check and PASS evidence: package vitest (--maxWorkers=2) all pass; root typecheck and check:ci pass.
  - Return milestone: U2 complete.
  - Stop / reassessment: unrelated environment failures are reported, not fixed.

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

Plan review: first Oracle review REJECT (park-time binding lacked existing-binding guard); record repaired; fresh Oracle review OKAY (task subtask_thoth-oracle_1793744480956_03f2c429, recordSha256 1d1d4afcf7da18a51c644cd9dae6294330177e1f76ead82fd41c61725d472311).

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: c41b1e19bca6dbc9327e1476970dd13dd72d17cc8a7af15e5e88a2aa8a76f222

Fresh Oracle task subtask_thoth-oracle_1793746786196_d82907bc; delivered thoth-gate-verdict valid, mode record, recordDigest match.

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS: AC-1–AC-6, the repaired Decisions, and both durable deltas are satisfied. No blocking findings.",
  "evidence": [
    {
      "id": "E1",
      "kind": "code",
      "locator": "pi-packages/pi-antigravity-bridge/src/provider.ts:1632-1667; tests/provider-resume.test.ts",
      "claim": "Synthetic continuation requires a bound assistant/toolResult tail without user input, images, unknown-owner recovery, or recovery delivered to that conversation. Synthetic resumes skip the digest; empty and unbound contexts retain the hard error.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E2",
      "kind": "code",
      "locator": "pi-packages/pi-antigravity-bridge/src/provider.ts:1738-1747,1795-1820; src/driver.ts:113-116,589-606; src/acp/driver.ts:437-444; tests/provider-watermark.test.ts; tests/provider-escalation.test.ts",
      "claim": "Park binding uses only the captured handle, only for an originally unbound fresh dispatch while the store remains unbound. It preserves the dispatch watermark and carrier agent. Tests cover existing/concurrent bindings, repeated parks, ERROR/abort watermarks, A-to-B recreation, concurrent origins, and unavailable identity.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E3",
      "kind": "code",
      "locator": "pi-packages/pi-antigravity-bridge/src/provider.ts:1759-1765; tests/provider-issue2.test.ts:282",
      "claim": "Poisoned-resume classification requires modelOutputSeen === false. Timeout and stall regressions retain bindings when model output was observed.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E4",
      "kind": "code",
      "locator": "pi-packages/pi-antigravity-bridge/src/provider.ts:133-140,541-546,598-637,853-858,1546-1597,1835; tests/provider-image-delivery.test.ts",
      "claim": "Suffix extraction and both recovery sweeps carry images per originating conversation. Claims precede staging; commits follow driver dispatch confirmation. Unknown owners remain pollable, failed/unstarted groups release reservations, and staging failure neither releases nor double-consumes claims.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E5",
      "kind": "code",
      "locator": "pi-packages/pi-antigravity-bridge/src/prompt-images.ts:7-66; src/driver.ts:302-315; extensions/index.ts:333-340; tests/prompt-images.test.ts",
      "claim": "Staging uses fresh pi-bridge-img-* temp directories, MIME-derived safe filenames, mode 0600, zero-byte rejection and partial cleanup. The 24-hour sweep skips prefixed symlinks and preserves nested link targets. Failures dispatch an explicit missing-image notice and a warning-classified event.",
      "basis": "observed",
      "uncertainty": "Windows mode bits do not establish a restrictive ACL."
    },
    {
      "id": "E6",
      "kind": "code",
      "locator": "pi-packages/pi-antigravity-bridge/src/driver.ts:319-346; src/acp/driver.ts:277-297; src/acp/connection.ts:313-341,517-527; src/owned-process.ts:52-99,195-198",
      "claim": "Stream-json publishes after launch and frame-write acknowledgement; ACP publishes after prompt-write acknowledgement. Windows forwards acknowledgements from job.stdin rather than a local buffer. Existing startupTimeoutMs bounds remain in place.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E7",
      "kind": "diff",
      "locator": "git diff HEAD; pi-packages/pi-antigravity-bridge/CHANGELOG.md:16-19; AGENTS.md:28-29,65; src/driver-types.ts:35-40,117-122; src/models.ts:347-369; extensions/index.ts:179-182",
      "claim": "The tracked diff and all four untracked source/test files are in scope, with no version bumps or unrelated implementation edits. Unreleased documents the changes. Reviewed doc/comment touch-ups accurately distinguish native ACP blocks from stream-json staged paths and caller-selected input advertising.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E8",
      "kind": "execution",
      "locator": "pi-packages/pi-antigravity-bridge: pnpm exec vitest run --maxWorkers=2",
      "claim": "Independent full package rerun passed: 89 files, 1213 tests passed, 12 skipped. PI_SUBAGENT_CHILD, PI_CODING_AGENT_DIR and PI_PACKAGE_DIR were unset.",
      "basis": "observed",
      "uncertainty": "No live model/pixel-receipt validation was performed; that is an explicit non-goal."
    },
    {
      "id": "E9",
      "kind": "execution",
      "locator": "package/root typecheck; pnpm run check:ci; validate.mjs --through verify; git diff --check",
      "claim": "Package and root typechecks passed; check:ci passed with warnings only; verify validation returned valid:true; diff whitespace check passed. The canonical pi-ecosystem baseline matches the recorded SHA-256 and the added requirements are complementary.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E10",
      "kind": "integrity",
      "locator": ".thoth/changes/antigravity-retry-resume-images/antigravity-retry-resume-images.md; working-tree inputs",
      "claim": "Hashed exact record bytes preceding ## Authorization. All 17 changed/untracked inputs retained the same aggregate SHA-256 before and after validation: 4e879cc686def4ac6405740e89519b3202084504fb0d9c6712c78dc8945af6f2.",
      "basis": "observed",
      "uncertainty": ""
    }
  ],
  "verification": [
    {
      "check": "AC-1",
      "method": "Inspect resume gates and run both-engine regression tests.",
      "outcome": "pass",
      "evidenceIds": ["E1", "E8"],
      "reason": "Bound retry tails resume without digest; negative cases retain existing behavior."
    },
    {
      "check": "AC-2 and repaired park-binding Decisions",
      "method": "Trace per-handle identities, park writes and subsequent outcome handling; execute ownership/watermark regressions.",
      "outcome": "pass",
      "evidenceIds": ["E2", "E8"],
      "reason": "Fresh/unbound/store-unbound restrictions, original watermark, carrier transfer, isolation and outcome semantics are preserved."
    },
    {
      "check": "AC-3",
      "method": "Inspect poisoned-resume predicate and run deadline regressions.",
      "outcome": "pass",
      "evidenceIds": ["E3", "E8"],
      "reason": "Observed model output prevents erroneous binding deletion."
    },
    {
      "check": "AC-4 and claim invariants",
      "method": "Trace initial, tombstone and post-outcome recovery paths; execute both-engine image/dispatch tests.",
      "outcome": "pass",
      "evidenceIds": ["E4", "E6", "E8"],
      "reason": "Images remain owner-grouped; reservations commit only after confirmed dispatch and unstarted groups are released."
    },
    {
      "check": "AC-5",
      "method": "Inspect staging/security paths and execute staging plus actual stream-json frame tests.",
      "outcome": "pass",
      "evidenceIds": ["E4", "E5", "E7", "E8"],
      "reason": "Suffix/recovered images produce staged paths or an explicit failure notice; both engines advertise image input."
    },
    {
      "check": "AC-6, scope, documentation and durable deltas",
      "method": "Review complete diff and canonical baseline; rerun package suite, typechecks, lint and SDD validation.",
      "outcome": "pass",
      "evidenceIds": ["E6", "E7", "E8", "E9", "E10"],
      "reason": "Local invariants and accepted requirements survive; scope and documentation are coherent and validation inputs stayed unchanged."
    },
    {
      "check": "Package build",
      "method": "Reuse the root's reported passing build.",
      "outcome": "not-run",
      "evidenceIds": [],
      "reason": "Not independently rerun because the build writes generated output and this assignment is read-only."
    }
  ],
  "risks": [
    {
      "description": "Synthetic continuation discourages but cannot prevent duplicate side effects; this residual was explicitly accepted.",
      "severity": "medium",
      "blocking": false,
      "evidenceIds": ["E1"]
    },
    {
      "description": "Mode 0600 is not a Windows ACL guarantee; platform privacy remains the documented limitation.",
      "severity": "low",
      "blocking": false,
      "evidenceIds": ["E5"]
    }
  ],
  "openQuestions": [],
  "nextAction": "Root may record this unchanged PASS and digest, complete acceptance evidence, then run closeout before archiving.",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/antigravity-retry-resume-images/antigravity-retry-resume-images.md",
    "reviewedRecordSha256": "c41b1e19bca6dbc9327e1476970dd13dd72d17cc8a7af15e5e88a2aa8a76f222"
  }
}
```

- AC-1: PASS | tests/provider-resume.test.ts both engines; Oracle rerun | 1213 passed / 12 skipped
- AC-2: PASS | provider-watermark + provider-escalation park-binding regressions | Oracle E2, E8
- AC-3: PASS | provider-issue2 modelOutputSeen regressions | Oracle E3, E8
- AC-4: PASS | provider-image-delivery recovery/claim tests | Oracle E4, E6, E8
- AC-5: PASS | prompt-images + stream-json frame tests | Oracle E5, E8
- AC-6: PASS | package vitest, package/root typecheck, check:ci, package build, CHANGELOG Unreleased | Oracle E7, E9; root build pass
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:23bece55651eb7f70b33c3d49d571e96cd2f479aec6e4ba2570341351c288c91

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
