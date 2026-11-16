# Change: antigravity-carrier-projection

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: medium
**Risk**: medium

## Exploration

- Live symptom (2026-11-15, agy 1.5.9, Windows): every stream-json turn of `@thoth-agents/pi-antigravity-bridge` fails with `RESOURCE_EXHAUSTED (code 429)` (agy retries ~8 times, ~2.5 min, then exit 3) on `gemini-4-hydrogen` and other models, while direct `agy -p` works. ACP works.
- Root cause (live bisection, ~25 inferences, logs `~/.gemini/antigravity-cli/log/cli-20261115_15*.log`): the backend rejects specific CONTENT in the stream-json system-prompt carrier agent (`--agent`), surfacing as 429. Not size (a 96K-token neutral filler carrier passes), not XML tags (neutralized tags still fail), not the `tools:` frontmatter, not the isolated home or bridge MCP server. Triggers sit in Pi-owned sections: bridge preamble + Pi identity line + Pi `<tools>` list (lines 1–17 fail alone) and further Pi-owned blocks. Removing the bridge preamble, the Pi identity line and the Pi `<tools>`, `<rules>`, `<docs>`, `<cwd>` blocks → carrier (49.7 KB, keeps Thoth instructions, AGENTS.md context and skills) passes. The full text sent inline in the first stream-json user frame without `--agent` also passes.
- External: oh-my-pi #19319 (2026-11-15) and @timmyjl12/pi-agy-bridge (2026-11-14) report the same content-dependent 429 for Pi system prompts on agy 1.5.9; pi-agy-bridge works around it with a one-shot inline retry. Upstream EstebanForge has no commit after `cdcfc04`.
- Delivery today (`pi-packages/pi-antigravity-bridge/`): `src/provider.ts:156–193` `SYSTEM_PROMPT_PREAMBLE`, `TOOL_PRIORITY_NOTE` (:168), `buildFullPrompt()`; `src/provider.ts:1665–1693` fresh-conversation gate reads the assembled `getCurrentSystemPrompt(context.messages)`; stream-json stages `[preamble, raw prompt, tool-priority note]` via `src/sysprompt-agent.ts:46–67,91–115` (`stageSyspromptAgent` returns null on failure → inline fallback); ACP bypasses staging and keeps inline assembly. No `before_agent_start`/`systemPromptOptions` capture exists in `extensions/index.ts`.
- Claude-bridge projection (`pi-packages/pi-claude-bridge/`): `src/index.ts:2593–2625` records `systemPromptOptions` on `before_agent_start`/`agent_start`; `src/prompt-capture.ts:9–19,309–413` projects custom/append text, explicit section overrides, guidelines, context files and skills, recursively replacing inherited assembled prompts; guards `:416–450` reject the Pi identity line and the docs pair. Depends on `agents-md.ts`, `skills.ts`, Pi `Skill` formatter. Both bridges depend on `@thoth-agents/pi-core` (MIT); pi-core has no projection API.
- Failure path: `src/driver.ts:680–700` maps non-OK result status to `ERROR` with `r.error`; `:535–559` exit-before-result error; `:755–767` `modelOutputSeen`; `src/provider.ts:1500–1525` `startTurn()`; `:1731–1805` outcome handling, binding persistence (`:1787–1794`); stream-json reuses a compatible child (`driver.ts:272–292`), `--conversation` on resume (`:463`), recycles on agent/profile change (`:823–835`). User frame `driver.ts:317–320`.
- Tests pinning carrier content: `tests/provider-sysprompt.test.ts:172–230`, `tests/sysprompt-agent.test.ts:24–92`, `tests/provider-watermark.test.ts:202,440`, `tests/provider-issue2.test.ts:121–257`.
- Docs: `README.md:160,195` (`systemPrompt` configuration); historical `docs/ACP-ADOPTION-PLAN.md`, `docs/PI-BRIDGE-GAPS.md`. Spec `.thoth/specs/pi-ecosystem/spec.md` has no carrier requirement.

## Intent

Make stream-json Antigravity turns work again by sending agy a portable projection of Pi's system prompt in the carrier agent instead of the full assembled prompt, and recover automatically when the backend still rejects the carrier before any output by retrying once with the projected text inline in the first user message.

## Non-goals

- Changing the ACP engine's prompt delivery.
- Changing `pi-claude-bridge` behavior or its public API.
- Phrase-level obfuscation (zero-width characters, keyword rewriting).
- Version bumps or commits.

## Acceptance

- AC-1: The extension captures Pi's structured `systemPromptOptions` (custom/append text, section overrides, guidelines, context files, skills, selected tools) per agent run, like claude-bridge, and exposes the latest capture to the provider.
- AC-2: The stream-json carrier body is a portable projection: no `SYSTEM_PROMPT_PREAMBLE`, no Pi identity line, no Pi-owned default sections (tools list, rules/guidelines defaults, docs, cwd/environment); keeps custom/append instructions (e.g. Thoth root block), explicit section overrides, project context files and skills, plus the bridge `TOOL_PRIORITY_NOTE` unless the live probe (AC-5) shows it triggers rejection, in which case it is rephrased neutrally. When no capture is available, the projection is derived by removing those Pi-owned sections from the assembled prompt. Carrier staging, content-addressing, reuse and user-agent precedence are unchanged.
- AC-3: Retry eligibility is restricted to a fresh stream-json dispatch (no prior conversation binding) that actually dispatched the automatic system-prompt carrier (`systemPrompt` delivery enabled, no user-configured agent) and whose turn fails with a `RESOURCE_EXHAUSTED`/429 error before any model output (`modelOutputSeen` false), the provider retries exactly once on a fresh process without `--agent`, with the projected text inline in the first user frame; a failure of the retry surfaces the error normally; resumed turns, turns with model output, non-429 errors, turns with `systemPrompt` delivery disabled, turns using a user-configured agent, and turns where carrier staging failed (already inline) are never retried. The retry is logged and the carrier is not reused for that conversation.
- AC-4: ACP behavior and stream-json behavior when `systemPrompt` delivery is disabled are unchanged; existing carrier/watermark/issue2 tests are updated only where they assert the old full-prompt content.
- AC-5: Live check: a stream-json turn with a real Pi session prompt on agy 1.5.9 / `gemini-4-hydrogen` answers without 429 (bridge log + cli log evidence), or the inline retry path recovers it.
- AC-6: README `systemPrompt` documentation and CHANGELOG Unreleased describe the projection and the inline retry; the spec gains requirement "Antigravity stream-json carrier uses a portable prompt projection".
- AC-7: Gates: package typecheck, `vitest run --maxWorkers=2`, package build; root `pnpm run check:ci`, `pnpm run typecheck`, `pnpm run build:pi-extensions` (or `pnpm run build`).

## Clarifications

- 2026-11-15: user ordered the options: first sanitize the carrier like claude-bridge, then carrier with inline fallback, inline-always last; then chose "Proyección + reintento en el mensaje" (projection plus inline retry in one change).

## Decisions

- D1: Port a focused projection into the antigravity package (new `src/prompt-projection.ts`) modeled on claude-bridge's `prompt-capture.ts`, instead of extracting to pi-core now: claude-bridge was just synced and its capture carries Claude-specific guards and inheritance logic; a shared extraction can follow later.
- D2: Keep explicit built-in section overrides supplied by the user (claude-bridge semantics); drop only Pi defaults.
- D3: The 429-before-output inline retry is one-shot and fresh-session-only; it does not change the default engine (stream-json) or the ACP engine.
- D4: Do not port claude-bridge's reject-on-identity guard; the projection removes the identity line instead of rejecting.

## Durable deltas

- `ADDED pi-ecosystem` **Antigravity stream-json carrier uses a portable prompt projection** — `@thoth-agents/pi-antigravity-bridge` MUST stage the stream-json system-prompt carrier agent from a portable projection of Pi's system prompt that omits the bridge preamble, Pi's identity line and Pi-owned default sections while keeping custom and appended instructions, explicit section overrides, project context files and skills, and when a fresh stream-json turn that dispatched this automatic carrier (system-prompt delivery enabled, no user-configured agent) fails with a resource-exhausted error before any model output it MUST retry that turn once without the carrier, delivering the projection inline in the first user message; ACP prompt delivery is unchanged.
  - GIVEN a fresh stream-json Antigravity turn whose Pi system prompt contains Pi's identity line, default tool list and a Thoth appended block; WHEN the turn starts; THEN the staged carrier contains the appended block and project context but not the identity line or default tool list, and if agy reports RESOURCE_EXHAUSTED before any model output the turn is retried once without `--agent` with the projection inline.

## Plan

One writer (thoth-worker) implements in `pi-packages/pi-antigravity-bridge` test-first (skill `tdd`): (1) capture `systemPromptOptions` in `extensions/index.ts` and pass to the provider; (2) `src/prompt-projection.ts` building the projection from capture, with string-derivation fallback; (3) wire it into stream-json carrier staging in `src/provider.ts` (~1665–1693), ACP untouched; (4) one-shot inline retry in the provider outcome path for fresh dispatches with 429 and no model output; (5) update affected tests, README, CHANGELOG; (6) build and run the live check AC-5 (bounded, ≤4 inferences, scratch-free: real Pi session not required — a projection generated from a captured real prompt fixture replayed through agy is acceptable, plus one end-to-end Pi turn by the user). Root runs gates and a fresh Oracle verifies.

## Tasks

- [x] AC-1: Capture structured systemPromptOptions per agent run
  - Outcome: per AC-1, D1
  - Known entrypoints and skill paths: `extensions/index.ts`, `pi-packages/pi-claude-bridge/src/index.ts:2593–2625`; skill `tdd`
  - Inputs: Exploration
  - Dependencies: none
  - Output: code, tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-antigravity-bridge/{extensions,src,tests}/**`
  - Interface boundaries: claude-bridge read-only
  - Focused check and PASS evidence: capture tests red→green
  - Return milestone: final report
  - Stop / reassessment: Pi does not expose `systemPromptOptions` to this extension
- [x] AC-2: Portable projection staged as the stream-json carrier
  - Outcome: per AC-2, D1, D2, D4
  - Known entrypoints and skill paths: `extensions/index.ts`, `src/provider.ts:156–193,1665–1693`, `src/sysprompt-agent.ts`, `pi-packages/pi-claude-bridge/src/prompt-capture.ts`, `pi-packages/pi-claude-bridge/src/index.ts:2593–2625`; skill `tdd`
  - Inputs: AC-1 row
  - Dependencies: AC-1 row
  - Output: code, tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-antigravity-bridge/{src,tests}/**`
  - Interface boundaries: ACP delivery, carrier staging contract, claude-bridge read-only
  - Focused check and PASS evidence: new projection tests red→green; carrier tests assert projection content
  - Return milestone: final report
  - Stop / reassessment: projection cannot be derived without capture
- [x] AC-3: One-shot inline retry on pre-output 429
  - Outcome: per AC-3, D3
  - Known entrypoints and skill paths: `src/provider.ts:1500–1525,1731–1805`, `src/driver.ts:272–292,317–320,535–559,680–700,755–767,823–835`; skill `tdd`
  - Inputs: AC-2 row
  - Dependencies: AC-2 row
  - Output: code, tests
  - Owner: thoth-worker
  - Writes: same package
  - Interface boundaries: resume/silent-drop/poison recovery, binding persistence
  - Focused check and PASS evidence: tests for retry on fresh carrier 429; negative tests for resumed, after-output, non-429, `systemPrompt` disabled, user-configured agent, and carrier-staging failure; single retry
  - Return milestone: final report
  - Stop / reassessment: retry conflicts with silent-drop or poisoned-resume recovery
- [x] AC-4: Unchanged ACP and disabled delivery
  - Outcome: per AC-4
  - Known entrypoints and skill paths: existing ACP and sysprompt tests
  - Inputs: AC-1..AC-3 rows
  - Dependencies: AC-3 row
  - Output: passing suites
  - Owner: thoth-worker
  - Writes: tests only where they asserted old content
  - Interface boundaries: none
  - Focused check and PASS evidence: package vitest passes
  - Return milestone: final report
  - Stop / reassessment: none
- [x] AC-5: Live check
  - Outcome: per AC-5
  - Known entrypoints and skill paths: built bundle, `~/.gemini/antigravity-cli/log/`
  - Inputs: AC-1..AC-4 rows
  - Dependencies: AC-4 row
  - Output: log evidence
  - Owner: thoth-worker (probe) and user (end-to-end Pi turn)
  - Writes: none in repo
  - Interface boundaries: bounded ≤4 inferences
  - Focused check and PASS evidence: generated carrier passes on hydrogen; user turn answers
  - Return milestone: final report
  - Stop / reassessment: projection still rejected and retry also fails
- [x] AC-6: Docs, changelog, spec delta
  - Outcome: per AC-6
  - Known entrypoints and skill paths: `README.md:160,195`, `CHANGELOG.md`
  - Inputs: implementation
  - Dependencies: AC-3 row
  - Output: docs diff
  - Owner: thoth-worker (docs), root (spec via archive)
  - Writes: package README/CHANGELOG
  - Interface boundaries: none
  - Focused check and PASS evidence: docs mention projection and retry; ADDED delta validates
  - Return milestone: final report
  - Stop / reassessment: none
- [x] AC-7: Gates
  - Outcome: per AC-7
  - Known entrypoints and skill paths: package and root scripts
  - Inputs: all rows
  - Dependencies: AC-6 row
  - Output: command results
  - Owner: root
  - Writes: none
  - Interface boundaries: none
  - Focused check and PASS evidence: all exit 0
  - Return milestone: before final Oracle
  - Stop / reassessment: unrelated environment failure (report)

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
First Oracle review REJECTED (unqualified retry eligibility); repaired; fresh Oracle subtask_thoth-oracle_1794780208955_90f4c8aa OKAY, recordSha256 a9beaf31b2cc80d06d02d81db3fbe66134daa96cfdb8e030383cc5a1dd37570a (digest match).
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
**Reviewed record SHA-256**: a6c4b156492bc107f8a67af03d2898c9cf02b0b61f30c73c57642a5b880ed5b0
First final verification (subtask_thoth-oracle_1794782086877_77ad376c) FAILED on AC-2 (bash-only runs lost skills); worker repaired src/prompt-projection.ts + SDK-backed tests; fresh Oracle subtask_thoth-oracle_1794782711548_17047225 PASS, gate verdict valid, recordDigest match.

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS: AC-1–AC-7 are satisfied. The bash-only skills-loss counterexample is repaired.",
  "evidence": [
    {"id": "E1", "kind": "source", "locator": "pi-packages/pi-antigravity-bridge/extensions/index.ts:535-540; src/prompt-projection.ts:24-92", "claim": "Per-run capture resets correctly; projection preserves operator policy, overrides, context and skills while removing Pi defaults. Reader precedence and hidden-reader behavior match Pi.", "basis": "observed", "uncertainty": ""},
    {"id": "E2", "kind": "independent-execution", "locator": "Installed Pi SDK core/system-prompt.js; independent node --import tsx probes", "claim": "Bash-only, hidden-read/visible-bash and all-readers-hidden retain the complete SDK-formatted skills catalog. ACP on/off and stream-json delivery-off preserve expected prompts, bypass capture and never retry 429.", "basis": "observed", "uncertainty": ""},
    {"id": "E3", "kind": "source", "locator": "pi-packages/pi-antigravity-bridge/src/provider.ts:1686-1859; tests/provider-carrier-retry.test.ts", "claim": "Only fresh automatic-carrier pre-output 429 failures retry, once, after process closure. Retry bindings omit the rejected carrier; recovery and error propagation remain intact.", "basis": "observed", "uncertainty": ""},
    {"id": "E4", "kind": "independent-execution", "locator": "Focused vitest run --maxWorkers=2; package pnpm run typecheck", "claim": "10 suites and 159 tests passed; package typecheck exited 0. CODEX_HOME, PI_SUBAGENT_CHILD, PI_CODING_AGENT_DIR and PI_PACKAGE_DIR were unset.", "basis": "observed", "uncertainty": "Full package suite and builds were not independently rerun."},
    {"id": "E5", "kind": "live-evidence", "locator": "C:/Users/EremesNG/.gemini/antigravity-cli/log/cli-20261115_161636.log; delegated live-check handoff", "claim": "CLI artifact confirms agy 1.5.9, hydrogen and normal one-turn stream closure. Prior independent verification and the supplied handoff report projection SUCCESS and a successful end-to-end Pi answer.", "basis": "observed", "uncertainty": "SUCCESS/answer evidence is reused from the supplied handoff; no new live inference was run."},
    {"id": "E6", "kind": "artifact-review", "locator": "Package README.md:160-168; CHANGELOG.md:7-12; assigned record Durable deltas; thoth-sdd verify validator", "claim": "Docs describe projection, retry and exclusions. Declared spec delta and reviewed baseline validate. Record-prefix and reviewed-input hashes remained unchanged during checks. Earlier archived ACP/proxy/carrier-tool changes were excluded by content.", "basis": "observed", "uncertainty": "Canonical spec application belongs to archive."},
    {"id": "E7", "kind": "supplied-gate-results", "locator": "Delegated post-repair worker/root handoff", "claim": "Reports 95 package test files, 1343 passed/5 skipped; package typecheck/build and root check:ci, typecheck and build:pi-extensions all exited 0.", "basis": "observed", "uncertainty": "Execution results supplied by root/worker, not independently rerun here."}
  ],
  "verification": [
    {"check": "AC-1", "method": "Capture wiring review and extension lifecycle tests", "outcome": "pass", "evidenceIds": ["E1", "E4"], "reason": "Latest structured options are exposed per run without stale inheritance."},
    {"check": "AC-2", "method": "Projection/carrier review, installed-SDK counterexamples and parameterized tests", "outcome": "pass", "evidenceIds": ["E1", "E2", "E4"], "reason": "Skills survive bash-only and hidden readers; portable content and carrier precedence are preserved."},
    {"check": "AC-3", "method": "Retry implementation and positive, exclusion, failure, parking and silent-drop tests", "outcome": "pass", "evidenceIds": ["E3", "E4"], "reason": "Eligibility, one-shot execution, fresh-process delivery and binding behavior satisfy the contract."},
    {"check": "AC-4", "method": "Engine-branch review and independent excluded-path probes", "outcome": "pass", "evidenceIds": ["E2", "E4"], "reason": "ACP retains full inline delivery; disabled delivery remains unchanged."},
    {"check": "AC-5", "method": "Inspect CLI artifact and reuse previously verified live evidence", "outcome": "pass", "evidenceIds": ["E5"], "reason": "The focused skills repair does not invalidate the accepted live result."},
    {"check": "AC-6", "method": "README, changelog, durable delta and baseline validation", "outcome": "pass", "evidenceIds": ["E6"], "reason": "Documentation is accurate; the spec delta is ready for archive."},
    {"check": "AC-7", "method": "Fresh focused tests/typecheck plus supplied post-repair package/root gates", "outcome": "pass", "evidenceIds": ["E4", "E7"], "reason": "Fresh focused checks passed; full-suite/build/root results are reused rather than rerun."}
  ],
  "risks": [
    {"description": "README.md:168; src/provider.ts:1723-1775: inline retry remains subject to agy's approximately 25KB cap. This accepted residual is documented and produces a visible error with binding cleanup.", "severity": "medium", "blocking": false, "evidenceIds": ["E3", "E6"]}
  ],
  "openQuestions": [],
  "nextAction": "root → closeout/archive",
  "review": {"kind": "final-verification", "verdict": "PASS", "reviewedRecord": ".thoth/changes/antigravity-carrier-projection/antigravity-carrier-projection.md", "reviewedRecordSha256": "a6c4b156492bc107f8a67af03d2898c9cf02b0b61f30c73c57642a5b880ed5b0"}
}
```

- AC-1: PASS | per-run systemPromptOptions capture | Oracle E1/E4
- AC-2: PASS | portable projection incl. bash-only skills repair | Oracle E1/E2/E4
- AC-3: PASS | one-shot inline retry eligibility and exclusions | Oracle E3/E4
- AC-4: PASS | ACP and disabled delivery unchanged | Oracle E2/E4
- AC-5: PASS | live projection SUCCESS cli-20261115_161636.log; user end-to-end Pi stream-json turn answered | Oracle E5
- AC-6: PASS | README, CHANGELOG, ADDED delta | Oracle E6
- AC-7: PASS | package 1343 passed/5 skipped; check:ci, typecheck, build:pi-extensions exit 0 | Oracle E4/E7
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:d16235eb9ec3e0ee48db5f9a2313a9d378eb9ff030a889b078d5eafacbcfbb74

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
Accepted residual: inline retry subject to agy ~25KB cap (documented, visible error).
