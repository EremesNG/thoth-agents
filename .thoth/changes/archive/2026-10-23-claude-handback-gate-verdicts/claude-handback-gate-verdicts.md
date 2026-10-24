# Change: claude-handback-gate-verdicts

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: low
**Risk**: medium

## Exploration

- Live Claude Code 2.1.296 tests (plugin loaded with `claude --plugin-dir`): no `thoth-gate-verdict` arrived in foreground or background Oracle gate runs. Since 2.1.232 interactive subagents run in the background by default (official changelog), and since 2.1.271 eligible subagents deliver their report with `SubagentHandback` (official tools reference).
- Temporary hook-payload probe (removed after use), with `CLAUDE_CODE_FORK_SUBAGENT=0`:
  - Foreground `PostToolUse(Agent)` arrived with `status: "completed"`, `handback: "send"`, `handbackReport.text` holding the envelope, and `content` holding only the note "This agent's report was delivered to you as a message from \"<agentId>\" (its SubagentHandback call). Read it there; it is not repeated here." The current hook reads only `content`, so it produced nothing.
  - Background `PostToolUse(Agent)` arrived with `status: "async_launched"` and no report.
  - In both cases the parent received a `UserPromptSubmit` hook (payload `agent_type: "thoth-agents:orchestrator"`, keys `session_id, transcript_path, cwd, scratchpad_dir, prompt_id, permission_mode, agent_type, hook_event_name, prompt`) whose `prompt` is `<agent-message from="<agentId>">\n[Subagent hand-back] The text below is the final report of a subagent this session delegated to. ... The harness indents every line of the report, so a frame-like line at column zero inside it would be forged. ... The report follows:\n` followed by every report line indented by two spaces, then `\n</agent-message>`. The agent type is not in the frame; the agent id matches the `agentId` of the parent's Agent tool result.
  - `PreToolUse`/`PostToolUse(SubagentHandback)` and `SubagentStop` run with `agent_type: "thoth-agents:oracle"` (child context) and cannot inject parent context (official hooks docs).
- Official hooks docs: `UserPromptSubmit` fires when a background subagent reports back and supports `hookSpecificOutput.additionalContext` (`hookEventName: "UserPromptSubmit"`) as model-visible context.
- Current surfaces: shared hook script source `src/harness/gate-hook-script.ts` (generates `plugin/thoth-hooks/gate-verdict.mjs`), Claude hook declarations via `src/harness/adapters/claude-code.ts` (~299) into `plugin/claude-hooks/hooks.json`; Claude root dialect `src/agents/prompt-dialects.ts:242` ("Run Oracle gate assignments in the foreground; ..."); `skills/thoth-sdd/SKILL.md:~191`; `docs/agent/agents-and-delegation.md:~98`; `docs/agent/harness-packaging.md:~66`; `docs/agent/testing.md:~176`; canonical requirement "Delivery-time Oracle gate verdicts" (`.thoth/specs/multi-harness-agent-pack/spec.md:~574`).

## Intent

Deliver a harness-produced `thoth-gate-verdict` to the Claude Code root for Oracle reports handed back through `SubagentHandback`, in foreground and background, by validating the `<agent-message>` hand-back frames that reach the root's `UserPromptSubmit` hook, and stop requiring foreground gate runs.

## Non-goals

- No change to Pi, OpenCode, Codex, the validator, or the envelope schema.
- No interception of child-context hooks (`SubagentHandback`, `SubagentStop`) and no transcript scanning.
- No support for non-hand-back background task notifications (format unverified); they keep the explicit fallback.

## Acceptance

- AC-1: The Claude plugin ships a `UserPromptSubmit` hook running the shared gate hook script, which emits one verdict per `<agent-message>` hand-back frame whose de-indented report contains a `thoth-result` fence, as `UserPromptSubmit` `additionalContext`, with `agent` set to the frame's agent id; a prompt with any framing violation from D1 (early closer with orphaned tail, unmatched closer, nested start, unindented report line, missing header or closer) yields no valid verdict for any frame; legitimate multiple frames are each validated; prompts without hand-back frames produce no output.
- AC-2: The existing `PostToolUse(Agent)` path still validates only `tool_response.content`, so a hand-back report never yields a second verdict.
- AC-3: The Claude root dialect, bundled thoth-sdd and plan-reviewer skills, the verify phase reference, agent docs and canonical delta describe hand-back verdicts (foreground and background), drop every foreground-only requirement (asserted absent from canonical and generated assets), and keep the fallback for deliveries without a verdict.
- AC-4: The local closeout gate passes: focused tests, `pnpm run check:ci`, `pnpm run typecheck`, `pnpm run build`, `pnpm integration:verify`.

## Clarifications

- User chose to run the payload probe, then decide between a fix and a declared gap; the probe established a documented parent seam, so the fix proceeds.

## Decisions

- D1: Parse the whole prompt with a strict line grammar before emitting anything. A frame is: a column-zero `<agent-message from="ID">` line; header lines including `[Subagent hand-back]` and ending with the `The report follows:` line; report lines, each empty or starting with exactly two spaces (stripped); a column-zero `</agent-message>` line. The prompt is malformed if any of these occur: a column-zero `<agent-message` while a frame is open (nesting), a column-zero `</agent-message>` with no open frame (unmatched closer), an indented non-empty line outside any frame (orphaned report tail), a non-empty non-indented line inside a report, a frame missing its header or closer. If the prompt is malformed, every frame containing a `thoth-result` fence gets a verdict with `valid:false` and issue `{code:"ENVELOPE_FORMAT", path:""}` (null role/kind/verdict/record) and no valid verdict is emitted for any frame; otherwise each well-formed frame is validated independently. Validate the de-indented report with `summarizeGateResult` (cwd from the hook input) only when it contains a `thoth-result` fence. Emit one `formatGateVerdict({ ...summary, agent: ID })` line per frame, joined by newlines, in `{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":...}}`; no output when no frame yields a verdict; fail open on malformed hook input.
- D2: Keep `PostToolUse(Agent)` validating only `tool_response.content`; never validate `handbackReport` there.
- D3: Claude dialect (compact): verdicts arrive with Subagent hand-back reports (foreground or background; `agent` is the agent id, match it to the Agent result's `agentId`) and with completed foreground `Agent` results whose content carries the report; other deliveries carry none, so root uses the compact fallback. Remove the foreground-only instruction.
- D4: One worker owns the hook, declarations, contract text and regeneration (all touch `plugin/**`).
- D5: A `UserPromptSubmit` prompt is a hand-back delivery only when its first non-whitespace line is a column-zero `<agent-message from="ID">` frame start; otherwise (ordinary user prompts, including ones quoting frames inside code fences or prose) the hook emits nothing. A prompt that starts with a frame must consist solely of D1 frames separated by blank lines; any other content outside frames is a framing violation (fail closed per D1). Residual: a user who pastes an exact bare frame as the whole prompt is indistinguishable textually; root's provenance check (verdict `agent` equals the `agentId` of an Oracle it launched) covers it.

## Durable deltas

- `MODIFIED multi-harness-agent-pack` **Delivery-time Oracle gate verdicts** — Each harness integration MUST validate Oracle gate envelopes at native result delivery with the bundled validator and add exactly one compact `thoth-gate-verdict` line per delivered message (Pi background completion notifications, `subagent_result` and task-mode `subagent_run` results, OpenCode `task` results, Claude Code `SubagentHandback` reports delivered to the root as `<agent-message>` prompts and completed foreground `Agent` results whose content carries the report, Codex multi-agent v1 `wait_agent` results) without altering the envelope, MUST leave non-Oracle and non-gate results unchanged, and root MUST NOT re-emit an envelope to validate it when a verdict was delivered; where a delivery path exposes no native hook (Codex multi-agent v2 `FINAL_ANSWER` inter-agent messages, Claude Code background runs without hand-back), the integration MUST declare that capability gap and root MUST use the explicit validator fallback, which MUST print only the compact summary.
  - GIVEN a Claude Code root whose background Oracle plan review hands back a valid envelope; WHEN the hand-back `<agent-message>` reaches the root's `UserPromptSubmit` hook; THEN the root receives one `thoth-gate-verdict` line reporting valid, plan-review, the verdict and the agent id as additional context, and records OKAY without running the validator .

## Plan

One worker (D4): extend `src/harness/gate-hook-script.ts` with a `UserPromptSubmit` branch per D1 (test-first in `src/harness/gate-hook-script.test.ts` using a fixture that reproduces the observed frame exactly: header text, two-space indentation, closing tag; cover valid, invalid envelope, legitimate multiple frames, valid envelope followed by an early column-zero closer plus indented tail plus second closer (no valid verdict), unmatched closer, nested start with resynchronization attempt, unindented report line, missing header or closer, non-hand-back prompts, malformed stdin); keep D2 and add a regression asserting a hand-back `PostToolUse(Agent)` payload (content note + `handbackReport`) yields no verdict; add the `UserPromptSubmit` declaration in `src/harness/adapters/claude-code.ts` and tests; update the contract text per D3 in `src/agents/prompt-dialects.ts`, `skills/thoth-sdd/SKILL.md`, `skills/thoth-sdd/references/phases/verify.md`, `skills/plan-reviewer/SKILL.md`, `docs/agent/agents-and-delegation.md`, `docs/agent/harness-packaging.md`, `docs/agent/testing.md` and assertions (prompt caps); regenerate with `pnpm integration:sync`. Root runs the closeout gate, then a live Claude Code check with the user after merge. Risks: live `UserPromptSubmit` context visibility is documented but unverified on 2.1.296 (live check after merge); a hook process now runs on every Claude prompt (fast exit without frames).

## Tasks

- [x] AC-1: Claude UserPromptSubmit hand-back verdict hook
  - Outcome: shared hook script handles UserPromptSubmit hand-back frames per D1; Claude declaration generated
  - Known entrypoints and skill paths: src/harness/gate-hook-script.ts, src/harness/gate-hook-script.test.ts, src/harness/adapters/claude-code.ts, src/harness/adapters/claude-code.test.ts, src/harness/generate-integration-packages.test.ts
  - Inputs: Exploration probe facts; D1, D4
  - Dependencies: none
  - Output: hook code, declaration, tests, regenerated plugin/
  - Owner: thoth-worker
  - Writes: listed files; plugin/** and pi/** via `pnpm integration:sync`
  - Interface boundaries: validator API and verdict format unchanged; Codex and PostToolUse behavior unchanged except D2 regression
  - Focused check and PASS evidence: `pnpm vitest run src/harness/gate-hook-script.test.ts src/harness/adapters src/harness/generate-integration-packages.test.ts` passes, including every D1 negative fixture
  - Return milestone: tests green
  - Stop / reassessment: frame format cannot be parsed deterministically
- [x] AC-2: Hand-back PostToolUse(Agent) never yields a second verdict
  - Outcome: regression proves D2
  - Known entrypoints and skill paths: src/harness/gate-hook-script.ts, src/harness/gate-hook-script.test.ts
  - Inputs: Exploration probe facts; D2
  - Dependencies: none (same worker as AC-1)
  - Output: regression test
  - Owner: thoth-worker
  - Writes: listed test file
  - Interface boundaries: none
  - Focused check and PASS evidence: regression passes in the AC-1 test run
  - Return milestone: tests green
  - Stop / reassessment: none
- [x] AC-3: Contract text describes Claude hand-back verdicts
  - Outcome: dialect, skills, verify phase, docs per D3; assertions updated (no foreground-only requirement in canonical or generated assets); artifacts regenerated
  - Known entrypoints and skill paths: src/agents/prompt-dialects.ts, skills/thoth-sdd/SKILL.md, skills/thoth-sdd/references/phases/verify.md, skills/plan-reviewer/SKILL.md, docs/agent/agents-and-delegation.md, docs/agent/harness-packaging.md, docs/agent/testing.md, src/agents/prompt-rendering.test.ts, src/harness/bundled-skills.test.ts
  - Inputs: D3
  - Dependencies: AC-1 (same worker, after hook behavior is settled)
  - Output: updated text and tests, regenerated plugin/
  - Owner: thoth-worker
  - Writes: listed files; plugin/** via `pnpm integration:sync`
  - Interface boundaries: other harness statements unchanged
  - Focused check and PASS evidence: `pnpm vitest run src/agents src/harness/bundled-skills.test.ts src/harness/adapters` passes; `pnpm integration:verify` passes
  - Return milestone: tests green
  - Stop / reassessment: prompt cap cannot be met without removing required guidance
- [x] AC-1: Converge — quoted or embedded frames in user prompts never yield a verdict (D5)
  - Outcome: hook treats only prompts that start with a column-zero frame and contain only frames as deliveries; regressions for backtick/tilde-fenced and prose-embedded frames
  - Known entrypoints and skill paths: src/harness/gate-hook-script.ts, src/harness/gate-hook-script.test.ts
  - Inputs: final-verification FAIL finding (user quotation fence produced valid:true); D1, D5
  - Dependencies: AC-1..AC-3 accepted
  - Output: hardened parser, regression tests, regenerated plugin/thoth-hooks/gate-verdict.mjs
  - Owner: thoth-worker
  - Writes: listed files; plugin/** via `pnpm integration:sync`
  - Interface boundaries: genuine hand-back frames (observed format), multiple frames and all D1 negatives keep their behavior
  - Focused check and PASS evidence: `pnpm vitest run src/harness/gate-hook-script.test.ts` passes incl. new quotation regressions; `pnpm integration:verify` passes
  - Return milestone: tests green
  - Stop / reassessment: genuine deliveries cannot be distinguished from quotations under D5
- [x] AC-4: Local closeout gate passes
  - Outcome: proportional closeout checks green
  - Known entrypoints and skill paths: package.json scripts
  - Inputs: accepted AC-1..AC-3
  - Dependencies: AC-1, AC-2, AC-3 accepted
  - Output: check results
  - Owner: root
  - Writes: none
  - Interface boundaries: none
  - Focused check and PASS evidence: `pnpm run check:ci`, `pnpm run typecheck`, `pnpm run build`, `pnpm integration:verify` exit 0
  - Return milestone: all commands exit 0
  - Stop / reassessment: unrelated environment failures are reported with evidence

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

Round 1 REJECT (first-closer framing could approve a prefix; two foreground-only guidance surfaces unowned), round 2 OKAY from a fresh Oracle, accepted from the harness-delivered `thoth-gate-verdict` (valid, plan-review, OKAY, assigned record). User authorized implementation conditional on OKAY. Nonblocking: live UserPromptSubmit context visibility on 2.1.296 to be checked after merge.

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 0778a7c1529fddceaf8f7805aaddef2844ecae1d26dab18f5a9f1e6c1bc6e77d

Round 1 FAIL (quoted frame in a user prompt produced valid:true) repaired under D5; round 2 fresh Oracle PASS accepted from the harness-delivered `thoth-gate-verdict` (valid, final-verification, PASS, mode record, recordDigest match, assigned record). Live UserPromptSubmit visibility on Claude Code 2.1.296 remains a post-merge user check.

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS. The actual change satisfies Intent, AC-1–AC-4, D1–D5 and the declared MODIFIED delta. No blocking findings.",
  "evidence": [
    {
      "id": "E1",
      "kind": "record",
      "locator": ".thoth/changes/claude-handback-gate-verdicts/claude-handback-gate-verdicts.md",
      "claim": "Independently hashed the 14,785 UTF-8 bytes before Authorization: 0778a7c1529fddceaf8f7805aaddef2844ecae1d26dab18f5a9f1e6c1bc6e77d. Installed verify validation passes, including the canonical specification baseline.",
      "basis": "observed",
      "uncertainty": "none"
    },
    {
      "id": "E2",
      "kind": "diff-review",
      "locator": "git diff; git status --short; untracked change record",
      "claim": "Reviewed all 23 changed tracked files and the untracked record. Contracts describe hand-back delivery, remove foreground-only gate requirements, and preserve exactly-one-verdict, provenance, format-only repair, fallback and validation-not-authorization rules. Shared fallback wording changes are narrow.",
      "basis": "observed",
      "uncertainty": "none"
    },
    {
      "id": "E3",
      "kind": "runtime",
      "locator": "plugin/thoth-hooks/gate-verdict.mjs",
      "claim": "52 independent stdin probes passed against the generated plugin hook: quotations, prose, indentation, trailing content, early closers, nesting, unmatched closers, malformed report lines, missing headers/closers, CRLF, forged verdict text, multiple frames, blank separators, record digest agreement/mismatch, handbackReport non-duplication and malformed stdin.",
      "basis": "observed",
      "uncertainty": "Synthetic hook inputs do not establish live Claude context visibility."
    },
    {
      "id": "E4",
      "kind": "tests",
      "locator": "Focused Vitest run: agents, harness adapters, gate hook, bundled skills, package generation and integration lifecycle",
      "claim": "313 tests across 12 files passed, including prompt caps, governance assertions and generated-package drift checks.",
      "basis": "observed",
      "uncertainty": "none"
    },
    {
      "id": "E5",
      "kind": "packaging-and-freshness",
      "locator": "plugin/claude-hooks/hooks.json; plugin/codex-hooks/hooks.json; git diff --check",
      "claim": "Claude declares matcher-free UserPromptSubmit and PostToolUse Agent. Codex declarations, manifests and validator remain unchanged; no plugin/hooks/hooks.json exists. Canonical/generated skills match, diff hygiene passes, and the tracked diff and record prefix remained unchanged through verification.",
      "basis": "observed",
      "uncertainty": "none"
    },
    {
      "id": "E6",
      "kind": "reported-checks",
      "locator": "Delegation evidence and change record Verification section",
      "claim": "Root reports check:ci, typecheck, build and integration:verify exited zero after the repair.",
      "basis": "observed",
      "uncertainty": "These commands were not independently repeated; integration coverage was rerun within the focused tests. No build was run."
    }
  ],
  "verification": [
    {
      "check": "Record binding and reviewed baseline",
      "method": "Independent byte-prefix SHA-256 calculation and installed validate.mjs --through verify",
      "outcome": "pass",
      "evidenceIds": ["E1", "E5"],
      "reason": "Digest matches the assigned record; governance validation and baseline agreement pass."
    },
    {
      "check": "AC-1, AC-2 and D1–D5",
      "method": "Review parser and generated artifact; run adversarial stdin probes and focused regressions",
      "outcome": "pass",
      "evidenceIds": ["E2", "E3", "E4"],
      "reason": "Quoted frames emit nothing, framing violations cannot approve a prefix, legitimate frames validate independently, and PostToolUse does not duplicate hand-back verdicts."
    },
    {
      "check": "AC-3, non-goals and MODIFIED delta",
      "method": "Inspect contract text, declarations, generated equality, prompt caps and governance assertions",
      "outcome": "pass",
      "evidenceIds": ["E1", "E2", "E4", "E5"],
      "reason": "Delivery guidance and fallback are coherent; unrelated harness declarations, envelope schema and validator behavior are preserved."
    },
    {
      "check": "AC-4 and diff hygiene",
      "method": "Independent focused tests and diff checks; assess root-reported closeout commands",
      "outcome": "pass",
      "evidenceIds": ["E4", "E5", "E6"],
      "reason": "313 focused tests pass, generated artifacts are current, diff checks are clean, and supplied closeout evidence reports success."
    }
  ],
  "risks": [
    {
      "description": "Live UserPromptSubmit additionalContext visibility on Claude Code 2.1.296 remains the explicitly deferred post-merge user check.",
      "severity": "medium",
      "blocking": false,
      "evidenceIds": ["E1", "E3"]
    },
    {
      "description": "An exact bare-frame user paste remains textually indistinguishable from delivery. Root must correlate agent with the launched Oracle's agentId, as documented.",
      "severity": "medium",
      "blocking": false,
      "evidenceIds": ["E1", "E2", "E3"]
    }
  ],
  "openQuestions": [],
  "nextAction": "Root should validate this unchanged result, record PASS, run closeout, and retain the post-merge live check.",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/claude-handback-gate-verdicts/claude-handback-gate-verdicts.md",
    "reviewedRecordSha256": "0778a7c1529fddceaf8f7805aaddef2844ecae1d26dab18f5a9f1e6c1bc6e77d"
  }
}
```

- AC-1: PASS | `pnpm vitest run src/harness/gate-hook-script.test.ts src/harness/adapters src/harness/generate-integration-packages.test.ts src/agents src/harness/bundled-skills.test.ts` | 295 tests passed (root rerun) incl. observed-payload, multiple-frame and every D1 negative fixture; plugin/claude-hooks/hooks.json declares UserPromptSubmit and PostToolUse Agent
- AC-2: PASS | same run | hand-back PostToolUse(Agent) regression yields no verdict
- AC-3: PASS | same run + `pnpm integration:verify` | dialect, skills, verify phase, docs updated; foreground-only absence asserted; root-approved narrow prompt-sections fallback parenthetical `(hook unavailable/untrusted, delivery gap)` keeps caps (Claude root 14,192/14,200)
- Converge (final-verification round 1 FAIL: quoted frame in a user prompt produced valid:true): PASS | same focused run | 307 tests passed (root rerun) incl. 12 D5 regressions (backtick/tilde/prose quotations emit nothing; trailing content fails closed)
- AC-4: PASS | `pnpm run check:ci`, `pnpm run typecheck`, `pnpm run build`, `pnpm integration:verify` | all exit 0 after the repair (root); `git diff --check` clean
- Source: .thoth/specs/multi-harness-agent-pack/spec.md | sha256:9dbd261face824e2df40b932afc8d4db020d75f4dbd859d4618363fc7fd6560d

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
