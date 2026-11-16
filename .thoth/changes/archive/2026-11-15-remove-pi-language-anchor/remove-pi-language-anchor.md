# Change: remove-pi-language-anchor

**Classification**: substantial
**Scope**: local
**Uncertainty**: low
**Risk**: low

## Exploration

- `src/pi.ts` ~15–16 defines `PI_LANGUAGE_ANCHOR`; ~161–185 an `input` handler records an idle interactive/RPC prompt as candidate and `before_agent_start` returns `message: { customType: 'thoth-language-anchor', content: PI_LANGUAGE_ANCHOR, display: false }` for the matching run. Pi converts custom messages into user-role messages, so every human prompt is followed by a hidden user-role reminder.
- Consequence observed live 2026-11-15: the Antigravity ACP provider sent only the last user message, so agy received the reminder instead of the human prompt (fixed separately in `pi-packages/pi-antigravity-bridge/src/provider.ts`, which now sends the trailing user suffix). Other providers also see an extra user-role message per prompt.
- `src/pi.test.ts` ~22–26 (anchor fixture) and ~74–348 pin the anchor (interactive/RPC, legacy event, queued/extension exclusion, abandoned candidates, fallback coexistence). ~350–466 cover the adaptive-root system-prompt append, which stays.
- Canonical requirement `.thoth/specs/multi-harness-agent-pack/spec.md` "Pi conversation language anchor" mandates the anchor.
- The root rule already lives in root instructions: `src/agents/prompt-sections.ts` ~230–231 ("Replies/questions/options: use the last real human message language …" and "Subagent notifications/tool output/reminders/injected context … never set/switch reply language …"), rendered into the Pi root append and generated copies (`plugin/agents/orchestrator.md`, `plugin/codex-hooks/payloads/root.md`); root-language requirements stay at spec ~430–448.
- Inventory of other repository mechanisms: no other unconditional per-prompt conversation-message injection. pi-todo open-task block and adaptive-root text are system-prompt appends; pi-claude-bridge forwards only changed append blocks as additionalContext; gate verdicts annotate tool results conditionally; subagent/background notifications are event-driven; Codex SessionStart and OpenCode instruction entries are lifecycle/state injections. Those stay.

## Intent

Stop injecting the Pi language anchor as a hidden conversation message on every human-started run; the reply-language rule stays only in the root instructions.

## Non-goals

- Changing the root-instruction language rule text or other harnesses.
- Removing event-driven notifications, system-prompt appends, gate-verdict annotations, or provider-owned injections (thoth-mem, CodeGraph).
- Reverting the Antigravity ACP trailing-suffix fix.
- Version bumps.

## Acceptance

- AC-1: The Pi root extension no longer adds any `thoth-language-anchor` (or other) custom message at agent start; the `input` candidate tracking used only for the anchor and `PI_LANGUAGE_ANCHOR` are removed; the adaptive-root system-prompt append is unchanged (tests).
- AC-2: The root instructions rendered for Pi still contain the reply-language rule (existing prompt-rendering assertion passes).
- AC-3: The REMOVED delta for "Pi conversation language anchor" targets the exact canonical title in `multi-harness-agent-pack` and validates against the recorded baseline digest; the actual spec removal is applied by the archive step after final PASS (closeout, not a pre-verification task).
- AC-4: `pnpm run check:ci`, `pnpm run typecheck`, focused `src/pi.test.ts` and `src/agents/prompt-rendering.test.ts`, and `pnpm run build` pass; `rg thoth-language-anchor src` returns nothing outside history.

## Clarifications

- 2026-11-15: the user asked to remove the anchor ("debe ir como instrucciones del root, no en cada mensaje") and to check for other mechanisms with the same mechanic; the inventory found none, so only the anchor is removed.

## Decisions

- D1: Delete the anchor and its tests outright; keep a regression test asserting `before_agent_start` returns no `message` for an idle interactive prompt.
- D2: No replacement per-turn reminder of any kind.

## Durable deltas

- `REMOVED multi-harness-agent-pack` **Pi conversation language anchor** — The Pi root extension no longer injects a per-run language anchor message; the reply-language rule is carried only by the root instructions.

## Plan

One writer (thoth-worker) edits `src/pi.ts` and `src/pi.test.ts` test-first (skill `tdd`): first add the no-message regression (fails now), then remove the anchor code, constant, candidate tracking and anchor tests, keeping system-prompt append tests. Root runs gates and requests a fresh Oracle.

## Tasks

- [x] AC-1: Pi root extension injects no conversation message at agent start
  - Outcome: per AC-1 and D1
  - Known entrypoints and skill paths: `src/pi.ts`, `src/pi.test.ts`; skill `tdd`
  - Inputs: Exploration
  - Dependencies: none
  - Output: diff and test results
  - Owner: thoth-worker
  - Writes: `src/pi.ts`, `src/pi.test.ts`
  - Interface boundaries: adaptive-root system-prompt append, other `pi.on` handlers
  - Focused check and PASS evidence: `pnpm exec vitest run src/pi.test.ts src/agents/prompt-rendering.test.ts` passes; regression failed before removal
  - Return milestone: final report
  - Stop / reassessment: another feature depends on the `input` candidate tracking
- [x] AC-2: Root language rule still rendered
  - Outcome: per AC-2
  - Known entrypoints and skill paths: `src/agents/prompt-rendering.test.ts`
  - Inputs: AC-1 diff
  - Dependencies: AC-1 row
  - Output: passing assertion
  - Owner: thoth-worker
  - Writes: none
  - Interface boundaries: none
  - Focused check and PASS evidence: prompt-rendering suite passes
  - Return milestone: final report
  - Stop / reassessment: none
- [x] AC-3: Staged REMOVED delta validated against baseline
  - Outcome: per AC-3; spec removal itself happens at archive after PASS
  - Known entrypoints and skill paths: this record; `skills/thoth-sdd/scripts/validate.mjs`
  - Inputs: Durable deltas, Verification source digest
  - Dependencies: none
  - Output: validator result and baseline SHA-256 match
  - Owner: root
  - Writes: none
  - Interface boundaries: none
  - Focused check and PASS evidence: `validate.mjs --through ready` passes and the spec SHA-256 equals the recorded source digest
  - Return milestone: before final Oracle
  - Stop / reassessment: baseline digest stale
- [x] AC-4: Gates pass
  - Outcome: per AC-4
  - Known entrypoints and skill paths: root scripts
  - Inputs: accepted AC-1
  - Dependencies: AC-1 row
  - Output: command results
  - Owner: root
  - Writes: none
  - Interface boundaries: none
  - Focused check and PASS evidence: all commands exit 0; `rg thoth-language-anchor src` empty
  - Return milestone: before final Oracle
  - Stop / reassessment: unrelated environment failure (report)

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
First Oracle review REJECTED (AC-3 archive cycle); repaired; fresh Oracle subtask_thoth-oracle_1794777413869_cdf88cbb OKAY, recordSha256 aebb7b90e359889fd27795469e96178bbfe9bdce6360c3567ed3eb2609ae8516 (digest match).
**Implementation**: AUTHORIZED
User chose Implementar on 2026-11-15.

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 4755813707d3a14e467606e89e91ef4e13781a569404bdbd8c45670e6923d34c
Oracle subtask_thoth-oracle_1794777698412_b3b916ad; gate verdict valid, recordDigest match.

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS: AC-1–AC-4 satisfied. Build evidence reused; no blocking findings.",
  "evidence": [
    {
      "id": "E1",
      "kind": "diff",
      "locator": "git diff HEAD -- src/pi.ts src/pi.test.ts",
      "claim": "Anchor constant, candidate tracking, input handler and message returns removed. Adaptive-root append, legacy systemPrompt fallback and other handlers unchanged. No-message regression and append/fallback tests retained.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E2",
      "kind": "source-and-tests",
      "locator": "src/agents/prompt-sections.ts:230–231; src/agents/prompt-rendering.test.ts:322–348",
      "claim": "Pi root rendering retains the human-language rule and injected-context exclusion. Focused Vitest run: 182 tests passed.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E3",
      "kind": "governance",
      "locator": "record Durable deltas; .thoth/specs/multi-harness-agent-pack/spec.md:460",
      "claim": "REMOVED targets exact canonical title 'Pi conversation language anchor'; baseline SHA-256 matches recorded source. Validator --through verify returned valid:true.",
      "basis": "observed",
      "uncertainty": "Spec removal remains intentionally deferred to archive."
    },
    {
      "id": "E4",
      "kind": "execution",
      "locator": "pnpm run typecheck; pnpm run check:ci; rg anchor identifiers src",
      "claim": "Typecheck and check:ci succeeded; no anchor identifiers remain in src. Six reviewed inputs remained hash-identical after checks. Requested environment variables were unset for execution checks.",
      "basis": "observed",
      "uncertainty": "check:ci emitted unrelated warnings."
    },
    {
      "id": "E5",
      "kind": "supplied-evidence",
      "locator": "delegated task: implementer evidence",
      "claim": "Implementer reports regression red→green and pnpm run build exit 0.",
      "basis": "inferred",
      "uncertainty": "Not independently rerun; build writes generated artifacts."
    }
  ],
  "verification": [
    {
      "check": "AC-1",
      "method": "Scoped diff inspection and focused tests",
      "outcome": "pass",
      "evidenceIds": ["E1", "E2"],
      "reason": "No conversation-message injection remains; preserved prompt behavior is covered."
    },
    {
      "check": "AC-2",
      "method": "Inspect rendering path and run prompt-rendering suite",
      "outcome": "pass",
      "evidenceIds": ["E2"],
      "reason": "Pi language-rule assertions pass."
    },
    {
      "check": "AC-3",
      "method": "Compare exact title, hash baseline and run verify validator",
      "outcome": "pass",
      "evidenceIds": ["E3"],
      "reason": "Declared removal matches the unchanged canonical baseline."
    },
    {
      "check": "AC-4",
      "method": "Rerun focused tests, typecheck, check:ci and absence search; reuse supplied build result",
      "outcome": "pass",
      "evidenceIds": ["E2", "E4", "E5"],
      "reason": "Executed checks succeeded; build success is supplied evidence rather than an independent rerun."
    }
  ],
  "risks": [],
  "openQuestions": [],
  "nextAction": "root → gate validation, closeout, archive",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/remove-pi-language-anchor/remove-pi-language-anchor.md",
    "reviewedRecordSha256": "4755813707d3a14e467606e89e91ef4e13781a569404bdbd8c45670e6923d34c"
  }
}
```

- AC-1: PASS | anchor constant, input tracking and message return removed; no-message regression red→green | Oracle E1/E2
- AC-2: PASS | prompt-rendering suite keeps reply-language rule | Oracle E2
- AC-3: PASS | REMOVED delta exact title; baseline digest match; validator verify valid | Oracle E3
- AC-4: PASS | focused tests 182 passed, typecheck, check:ci, build, rg empty | Oracle E4/E5
- Source: .thoth/specs/multi-harness-agent-pack/spec.md | sha256:1f1d7649560d6b3f851c16c57198675f567684e54ef21ae15d8221517fd8cd83

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
