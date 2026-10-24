# Change: codex-v2-gate-verdict-gap

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: low
**Risk**: low

## Exploration

- Live Codex CLI 0.164.0 test (rollout `rollout-2026-10-23T19-55-51-…`): multi-agent v2 is active (`spawn_agent` returns `/root/<task>` paths; `followup_task` exists). `wait_agent` returns only `{"message":"Wait completed.","timed_out":false}`; the Oracle's final answer arrives as an `agent_message` inter-agent communication (`Message Type: FINAL_ANSWER … Payload: <envelope>`). The trusted PostToolUse `^(multi_agent_v1)?wait_agent$` hook produced no verdict because no envelope reaches it.
- Upstream `openai/codex` rust-v0.164.0 (librarian, cited): child terminal results are delivered by `notify_parent_of_terminal_turn` as `InterAgentCommunication` (`agent/control/completion.rs:26-128`); parent input handling returns no hook action for it (`hook_runtime.rs:634-670`); `wait_agent` v2 never carries the child text (`multi_agents_v2/wait.rs:67-131`); `PreModelRequest`/`PostModelRequest` are observation-only (`hooks/src/events/model_request.rs:133-165`); `SubagentStop` runs in the child session and its continuation targets the child (`hook_runtime.rs:350-424`, `session/turn.rs:723-750`); transcript format is not a stable hook interface (official hooks docs); `multi_agent_v2=false` does not force v1 because model metadata can still select v2 (`config/mod.rs:1658-1684`).
- Current claims that over-state Codex coverage: canonical requirement "Delivery-time Oracle gate verdicts" (`.thoth/specs/multi-harness-agent-pack/spec.md:574-576`, lists "Codex `wait_agent` results"); Codex dialect line `src/agents/prompt-dialects.ts:186`; `skills/thoth-sdd/SKILL.md:~193`; `docs/agent/agents-and-delegation.md:~100`; `docs/agent/harness-packaging.md:~69`; generated Codex root payload and plugin skill copies.
- Pi, OpenCode (pending live test) and Claude Code behavior are unaffected.

## Intent

State the Codex multi-agent v2 capability gap truthfully: verdicts are delivered only for Codex multi-agent v1 `wait_agent` status-map results; v2 `FINAL_ANSWER` inter-agent deliveries expose no hook, so the Codex root uses the explicit compact validator fallback. The v1 hook stays.

## Non-goals

- No transcript scanning, Codex patching, upstream hook request, or v1 forcing.
- No change to hook code, validator, Pi, OpenCode, or Claude Code behavior.

## Acceptance

- AC-1: The Codex root dialect line, bundled thoth-sdd skill, agent docs and generated Codex artifacts state that verdicts arrive only for multi-agent v1 `wait_agent` results and that v2 `FINAL_ANSWER` deliveries carry none, so root uses the explicit compact fallback; tests assert the new wording.
- AC-2: The local closeout gate passes: focused tests, `pnpm run check:ci`, `pnpm run typecheck`, `pnpm run build`, `pnpm integration:verify`.

## Clarifications

- User selected "declare the gap and use the fallback" over transcript scanning or leaving the claim unchanged.

## Decisions

- D1: Keep the PostToolUse `^(multi_agent_v1)?wait_agent$` hook; it remains correct for v1 status maps.
- D2: Wording: Codex verdicts arrive only with multi-agent v1 `wait_agent` results when plugin hooks are enabled and trusted; multi-agent v2 delivers the Oracle's `FINAL_ANSWER` as an inter-agent message with no hook, so no verdict arrives and root runs the explicit compact fallback on the unchanged result. Keep the Codex dialect line compact.

## Durable deltas

- `MODIFIED multi-harness-agent-pack` **Delivery-time Oracle gate verdicts** — Each harness integration MUST validate Oracle gate envelopes at native result delivery with the bundled validator and add exactly one compact `thoth-gate-verdict` line per delivered message (Pi background completion notifications, `subagent_result` and task-mode `subagent_run` results, OpenCode `task` results, Claude Code foreground `Agent` results, Codex multi-agent v1 `wait_agent` results) without altering the envelope, MUST leave non-Oracle and non-gate results unchanged, and root MUST NOT re-emit an envelope to validate it when a verdict was delivered; where a delivery path exposes no native hook (Codex multi-agent v2 `FINAL_ANSWER` inter-agent messages, Claude Code background runs), the integration MUST declare that capability gap and root MUST use the explicit validator fallback, which MUST print only the compact summary.
  - GIVEN a Codex multi-agent v2 root whose Oracle plan review returns its envelope as a `FINAL_ANSWER` inter-agent message; WHEN root evaluates it; THEN no delivery verdict is expected, the instructions direct root to the explicit compact fallback, and root records no approval without a valid fallback summary .

## Plan

One worker updates the contract text per D2 in `src/agents/prompt-dialects.ts` (Codex line), `skills/thoth-sdd/SKILL.md`, `docs/agent/agents-and-delegation.md`, `docs/agent/harness-packaging.md` (and any other surface claiming Codex v2 verdicts), adjusts assertions in `src/agents/prompt-rendering.test.ts` / `src/harness/bundled-skills.test.ts` / adapter tests as needed, regenerates `plugin/` with `pnpm integration:sync`, and runs focused checks. Root runs the closeout gate, including `pnpm run build` because a compiled prompt dialect and generated plugin payloads change. Risk: prompt-size caps in tests; keep wording compact.

## Tasks

- [x] AC-1: Contract text declares the Codex multi-agent v2 verdict gap
  - Outcome: Codex dialect, thoth-sdd skill, docs and generated artifacts match D2; tests assert it
  - Known entrypoints and skill paths: src/agents/prompt-dialects.ts, skills/thoth-sdd/SKILL.md, docs/agent/agents-and-delegation.md, docs/agent/harness-packaging.md, src/agents/prompt-rendering.test.ts, src/harness/bundled-skills.test.ts, src/harness/adapters/codex.test.ts
  - Inputs: Exploration facts; D1, D2
  - Dependencies: none
  - Output: updated text, tests, regenerated plugin/
  - Owner: thoth-worker
  - Writes: listed files and tests; plugin/** and pi/** via `pnpm integration:sync`
  - Interface boundaries: no hook, validator or runtime behavior change
  - Focused check and PASS evidence: `pnpm vitest run src/agents src/harness/bundled-skills.test.ts src/harness/adapters` passes; `pnpm integration:verify` passes; `rg -n "wait_agent" src/agents skills docs` shows only v1-qualified claims
  - Return milestone: tests green
  - Stop / reassessment: wording requires behavior changes
- [x] AC-2: Local closeout gate passes
  - Outcome: proportional closeout checks green
  - Known entrypoints and skill paths: package.json scripts
  - Inputs: accepted AC-1
  - Dependencies: AC-1 accepted
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

Round 1 REJECT (closeout omitted `pnpm run build`), round 2 OKAY from a fresh Oracle, accepted from the harness-delivered `thoth-gate-verdict` (valid, plan-review, OKAY, assigned record). User authorized implementation conditional on OKAY.

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 545b45c367c2e79ae38c9cfc9530d5d75e06ce8bf730aa3512f2ddc25ba46180

Accepted from the harness-delivered `thoth-gate-verdict` (valid, final-verification, PASS, mode record, recordDigest match, assigned record).

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS: The actual diff satisfies AC-1/AC-2, D1-D2 and the declared delta without runtime behavior changes.",
  "evidence": [
    {
      "id": "E1",
      "kind": "digest",
      "locator": ".thoth/changes/codex-v2-gate-verdict-gap/codex-v2-gate-verdict-gap.md",
      "claim": "Independently calculated record-prefix SHA-256 matches the supplied digest; the canonical-spec digest also matches its Source entry.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E2",
      "kind": "diff-review",
      "locator": "git status --short; git diff; untracked change record",
      "claim": "Only declared files changed. Codex guidance qualifies verdict delivery as trusted/enabled v1 only and directs hookless v2 FINAL_ANSWER deliveries to unchanged-result compact fallback. Hooks, validators, other harness guidance and governance remain unchanged. No unrelated or secret changes found; diff check is clean.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E3",
      "kind": "test-execution",
      "locator": "Focused Vitest: prompt-rendering, codex adapter, bundled-skills and gate-hook-script",
      "claim": "172 tests passed. Existing v1 hook coverage passes; a simulated v2 wait response produces no verdict.",
      "basis": "observed",
      "uncertainty": "No new live Codex session was run."
    },
    {
      "id": "E4",
      "kind": "generated-artifacts",
      "locator": "pnpm integration:verify; plugin/codex-hooks/payloads/root.md; plugin/skills/thoth-sdd/SKILL.md",
      "claim": "13 integration tests passed, including generated parity. Plugin skill bytes and root ledger digest match. Rendered Codex root is 14,799 characters against the 14,800 cap.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E5",
      "kind": "reported-checks",
      "locator": "Review assignment and record Verification section",
      "claim": "Root reports 256 focused tests passed and check:ci, typecheck, build and integration:verify exited zero.",
      "basis": "observed",
      "uncertainty": "Build, typecheck and check:ci evidence was reused, not independently rerun."
    },
    {
      "id": "E6",
      "kind": "gate-execution",
      "locator": "Installed thoth-sdd/scripts/validate.mjs --through verify --json",
      "claim": "Verify gate passed with no errors or warnings.",
      "basis": "observed",
      "uncertainty": ""
    }
  ],
  "verification": [
    {
      "check": "Record binding and canonical baseline",
      "method": "Hash exact bytes before ## Authorization and canonical spec bytes.",
      "outcome": "pass",
      "evidenceIds": ["E1", "E6"],
      "reason": "Both digests match."
    },
    {
      "check": "AC-1, D1-D2, delta and non-goals",
      "method": "Review complete diff and focused regression results.",
      "outcome": "pass",
      "evidenceIds": ["E2", "E3"],
      "reason": "Delivery claims are corrected while fallback, provenance, exactly-one-verdict, format-only repair and validation-versus-authorization rules remain intact."
    },
    {
      "check": "Generated parity and prompt caps",
      "method": "Integration tests, byte comparison, ledger hash and character count.",
      "outcome": "pass",
      "evidenceIds": ["E4"],
      "reason": "Artifacts match canonical inputs and remain below the cap."
    },
    {
      "check": "AC-2 and diff hygiene",
      "method": "Independent focused checks plus reuse of reported root closeout evidence.",
      "outcome": "pass",
      "evidenceIds": ["E2", "E3", "E4", "E5", "E6"],
      "reason": "Required checks passed; no build or workspace mutation was performed during review."
    }
  ],
  "risks": [
    {
      "description": "Codex root has only one character of headroom below its prompt-size cap; future wording changes must preserve the cap.",
      "severity": "low",
      "blocking": false,
      "evidenceIds": ["E4"]
    }
  ],
  "openQuestions": [],
  "nextAction": "Root validates this gate result, records PASS and the digest, then runs closeout before archive.",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/codex-v2-gate-verdict-gap/codex-v2-gate-verdict-gap.md",
    "reviewedRecordSha256": "545b45c367c2e79ae38c9cfc9530d5d75e06ce8bf730aa3512f2ddc25ba46180"
  }
}
```

- AC-1: PASS | `pnpm vitest run src/agents src/harness/bundled-skills.test.ts src/harness/adapters` | 256 tests passed (root rerun); wording assertions red→green (worker); `rg wait_agent` shows only v1-qualified verdict claims; Codex root 14,799 chars under the 14,800 cap
- AC-2: PASS | `pnpm run check:ci`, `pnpm run typecheck`, `pnpm run build`, `pnpm integration:verify` | all exit 0 (root); `git diff --check` clean
- Source: .thoth/specs/multi-harness-agent-pack/spec.md | sha256:df276ff5d4d107cd26fbde126cea398d84b765e054e796b0ee2023a639fa44b4

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
