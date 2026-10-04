# Change: orchestrator-language-anchor

**Classification**: substantial
**Scope**: cross-cutting
**Uncertainty**: medium
**Risk**: medium

## Exploration

- A Pi root session (via `pi-packages/pi-claude-bridge`) replied in English 27 times while the human wrote Spanish, including after an explicit "Respondeme en español". Switches followed English subagent notifications (user-role text that keeps the "not the conversation language" marker), English tool results, and human answers to `ask_user_question`, which arrive as tool results inside an English wrapper. No compaction or lost human message.
- Canonical rule: `src/agents/prompt-sections.ts:242-243`, rendered into all four harness roots (`ROOT_RENDERERS`, `src/agents/prompt-rendering.test.ts:42-49`); generated copy `plugin/agents/orchestrator.md:82-83`; assertions `src/agents/prompt-rendering.test.ts:225-251`; durable requirement `.thoth/specs/multi-harness-agent-pack/spec.md` "Reply in the user's language".
- The current exclusion literally classifies tool results as non-user, so human `ask_user_question` answers do not count as real user messages.
- Pi root extension `src/pi.ts:199-223` handles only `before_agent_start` (appends root prompt) and `session_start`; tests `src/pi.test.ts:37-99` use a fake handler map.
- Pi API: the `input` event carries `source: "interactive" | "rpc" | "extension"`; persisted `UserMessage` has no provenance. `before_agent_start` may return a custom `message`. Custom messages are converted to user-role text; the bridge resumes Claude sessions and treats system-prompt changes as cache-busting (`pi-claude-bridge/src/index.ts:2038-2042`).

## Intent

1. The root language rule, for every harness, counts human answers to question tools and explicit language requests as real user messages, and states that English tool output, notifications, reminders and injected context never change the reply language.
2. In Pi, each real human prompt that starts a new agent run while the agent is idle (input source `interactive` or `rpc`) adds one custom anchor message after the turn's prompt. It is a fixed, non-positional reminder of the durable language rule: reply in the language of the human's most recent real message (typed prompt or question-tool answer) unless the human explicitly requested another reply language, which takes precedence; tool output, notifications, reminders and injected context never switch it. It contains no copy of the input and certifies no adjacent text as human input. The system prompt is not changed.

## Non-goals

- No language detection heuristics or dependencies.
- No changes to pi-subagents, pi-background-tasks, pi-claude-bridge or the external human-question package.
- No system-prompt anchor (cache cost rejected by user).
- No anchor for extension-sourced inputs, notification turns, tool continuations, or human input queued as steering/follow-up while the agent is running (installed Pi 0.99.1/1.0.1 queue it without `before_agent_start`, `agent-session.js:1470-1526,1622-1689`; prompts transformed by template/skill expansion are also not anchored); those turns rely on the amended prompt rule.

## Acceptance

- AC-1: Rendered root instructions for OpenCode, Pi, Codex and Claude Code state that human answers to question tools and explicit language requests are real user messages, that an explicit language request takes precedence over inferred language and persists until the human switches, and that English tool results, notifications, reminders and injected context never switch the reply language; tests assert it and `plugin/agents/orchestrator.md` is regenerated consistently.
- AC-2: The Pi root extension's `input` handler records a candidate only for source `interactive` or `rpc` text input when native `ctx.isIdle()` is true (any other input clears the candidate); `before_agent_start` always consumes and clears the candidate and emits an anchor only when the candidate text equals the event prompt (pairing), returning exactly one custom message (`customType: "thoth-language-anchor"`, `display: false`) containing a fixed, non-positional reminder of the language rule (latest real human message incl. question-tool answers; explicit request precedence; tool output, notifications, reminders and injected context never switch it), with no quoted input and no claim about which adjacent text is human. Extension-sourced input, input received while not idle (queued steering/follow-up, including post-`agent_end` retries), submissions consumed by another handler or failing before the run, expanded prompts that no longer equal the input text, and starts without a candidate get no anchor; pairing only limits emission to runs started from idle interactive/rpc input and the extension never derives, quotes or positionally certifies language from text, so the anchor itself introduces no language signal (tests assert the anchor text is identical regardless of prompt content, Spanish or English), and no stale anchor is emitted later; the existing system-prompt append behavior is unchanged; tests cover each case, including a Spanish-language prompt and an explicit-other-language request phrasing in the anchor text.
- AC-3: The durable spec records the amended rule and the Pi anchor behavior.

## Clarifications

- Anchor placement: user selected "Mensaje ancla por turno humano" (custom message per human turn, no system prompt change).

## Decisions

- The anchor is a fixed, non-positional rule reminder without any excerpt (round 3) and without claiming the adjacent text is human (round 4: Pi may insert `nextTurn`/hook messages between prompt and anchor, `agent-session.js:1537-1556`). Text transformed by other input handlers before the model is that extension's responsibility and outside this change; the anchor never vouches for it. Empty/whitespace-only input produces no anchor.
- The anchor is consumed once: cleared after the `before_agent_start` that emits it; idleness comes from native `ExtensionContext.isIdle()` (not event bookkeeping, since `agent_end` does not mean idle); emission requires the candidate to equal the `before_agent_start` prompt, so handled, failed or transformed submissions never leak a stale anchor (scope limited to idle new-run prompts; Oracle open question resolved by root to the smallest default).
- Precedence: an explicit human reply-language request beats the language of the latest message, in both the prompt rule and the anchor text.
- Images-only input produces no anchor.

## Durable deltas

- `MODIFIED multi-harness-agent-pack` **Reply in the user's language** — Default root orchestrator instructions for every supported harness MUST direct user-facing replies, questions and options to use the language of the user's most recent real message and keep it until the user switches; human answers to question tools and explicit language requests count as real user messages, an explicit language request takes precedence over the latest message's language and persists until the human switches, and English tool results, notifications, reminders and injected context never switch the reply language; delegated assignments, change records, code and generated artifacts MAY remain in English.
  - GIVEN a user writing in Spanish who answers a question tool in Spanish; WHEN any harness renders the default root orchestrator instructions; THEN they require Spanish user-facing replies, count the question answer as a real user message and forbid English tool or notification text from switching the language .
- `MODIFIED multi-harness-agent-pack` **Distinguish injected messages from user input** — Default root orchestrator instructions MUST state that subagent completion notifications, automated tool output and injected context delivered in the user role are not user messages and MUST NOT set the reply language or count as user instructions, answers or choices, while a human's answer returned through a question tool is a real user message; Pi subagent completion content MUST identify itself as an automated system notification.
  - GIVEN a Pi subagent completion delivered as a user-role message and a human answer returned through a question tool; WHEN the root reads them; THEN the completion is declared an automated system notification and is not a language signal, while the human answer counts as a real user message .
- `ADDED multi-harness-agent-pack` **Pi conversation language anchor** — The Pi root extension MUST add one non-displayed custom anchor message to each agent run started by real human input (source interactive or rpc) received while the session is natively idle and paired with its own run start, restating in fixed text, without quoting the input or claiming which adjacent text is human, the rule to reply in the language of the human's most recent real message unless the human explicitly requested another reply language, without modifying the system prompt and without anchoring extension-sourced or queued input.
  - GIVEN a Pi root session; WHEN the human sends a prompt while idle, queues another while running, and later an extension triggers a turn; THEN only the idle human-started run receives the anchor, no stale anchor appears later, and the system prompt stays unchanged .

## Plan

- Unit A (worker): edit `src/agents/prompt-sections.ts` language sentences; update `src/agents/prompt-rendering.test.ts` (test-first); regenerate `plugin/agents/orchestrator.md` through the existing generator; update spec section in `.thoth/specs/multi-harness-agent-pack/spec.md` is deferred to archive.
- Unit B (worker): `src/pi.ts` add an `input` handler recording a candidate only when `ctx.isIdle()` (types.d.ts:236) for interactive/rpc text, clearing otherwise, and prompt-paired, always-consuming anchor return in `before_agent_start` (coexisting with the existing fallback `systemPrompt` return, `runner.js:1137-1143`); extend local `on` event union; tests in `src/pi.test.ts` (test-first).
- A and B write disjoint files and run in parallel. Spec deltas apply at archive (AC-3).
- Checks: `pnpm test src/agents/prompt-rendering.test.ts src/pi.test.ts src/harness/adapters/pi.test.ts`, `pnpm run integration:verify`, then `pnpm run check:ci`, `pnpm run typecheck`.

## Tasks

- [x] AC-1: Amended cross-harness language rule with tests and regenerated plugin copy
  - Outcome: rendered roots contain the amended rule; tests pass
  - Known entrypoints and skill paths: src/agents/prompt-sections.ts:242-243; src/agents/prompt-rendering.test.ts:225-251; plugin/agents/orchestrator.md; src/harness/generate-integration-packages.ts; skills tdd, simplify
  - Inputs: Exploration and Decisions above
  - Dependencies: none
  - Output: diff to owned files
  - Owner: thoth-worker
  - Writes: src/agents/prompt-sections.ts, src/agents/prompt-rendering.test.ts, plugin/agents/orchestrator.md and other generated artifacts the generator changes
  - Interface boundaries: all four root renderers; no other prompt text changes
  - Focused check and PASS evidence: pnpm test src/agents/prompt-rendering.test.ts and pnpm run integration:verify pass
  - Return milestone: tests green and generated copy consistent
  - Stop / reassessment: generator touching unrelated files or other assertions requiring wording changes
- [x] AC-2: Pi language anchor custom message on human-started turns
  - Outcome: anchor behavior implemented and tested
  - Known entrypoints and skill paths: src/pi.ts:28,56-57,199-223; src/pi.test.ts:37-99; Pi types InputEvent, ExtensionContext.isIdle, BeforeAgentStartEventResult in @earendil-works/pi-coding-agent dist/core/extensions/types.d.ts; skills tdd, simplify
  - Inputs: Exploration and Decisions above
  - Dependencies: none
  - Output: diff to owned files
  - Owner: thoth-worker
  - Writes: src/pi.ts, src/pi.test.ts
  - Interface boundaries: existing appendSystemPrompt and forced-prompt fallback unchanged; child sessions (lean) unaffected
  - Focused check and PASS evidence: pnpm test src/pi.test.ts src/harness/adapters/pi.test.ts pass
  - Return milestone: tests green
  - Stop / reassessment: Pi API mismatch for input source or message return
- [x] AC-3: Durable spec deltas applied at archive
  - Outcome: spec updated by thoth-archive
  - Known entrypoints and skill paths: .thoth/specs/multi-harness-agent-pack/spec.md; thoth-archive skill
  - Inputs: Oracle PASS
  - Dependencies: AC-1, AC-2 accepted
  - Output: archived record and synced spec
  - Owner: root
  - Writes: .thoth/specs/multi-harness-agent-pack/spec.md, .thoth/changes
  - Interface boundaries: none
  - Focused check and PASS evidence: closeout validator passes
  - Return milestone: archive complete
  - Stop / reassessment: validator failure

## Authorization

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

- Plan review history: round 5 [OKAY]; round 1 [REJECT]: queued-input lifecycle, explicit-language precedence, missing MODIFIED delta — repaired; round 2 [REJECT]: event-based idleness and unpaired candidates — repaired with isIdle() and prompt pairing; round 3 [REJECT]: excerpt could carry transformed text — repaired with fixed-text anchor; round 4 [REJECT]: positional human claim and transformation guarantee — repaired with non-positional rule reminder and scoped guarantee.
- Implementation authorized by the user ("Avanza con las 2") before review; honored after [OKAY].

## Verification

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: d8fd8bfb4f2ff6182ba6536969f2e7e6fddfcdcf49e805d9e17ad6f41427177b

- AC-1: PASS | pnpm vitest run src/agents/prompt-rendering.test.ts src/pi.test.ts src/harness/adapters/pi.test.ts; pnpm run integration:verify | 148 passed; 12 passed; rule at src/agents/prompt-sections.ts:242-243 asserted for all four ROOT_RENDERERS; plugin/agents/orchestrator.md:82-83 regenerated and manifest digest correct
- AC-2: PASS | pnpm vitest run src/pi.test.ts src/harness/adapters/pi.test.ts; pnpm run typecheck; biome ci on changed files | anchor logic src/pi.ts:28-29,209-228 with fallback unchanged 230-253; tests src/pi.test.ts:74-296; lean children exclude hooks (pi-subagents sdk-runner.ts:280-321)
- AC-3: PASS | thoth-archive applies declared deltas to .thoth/specs/multi-harness-agent-pack/spec.md | deltas match implemented wording per final Oracle
- Source: src/agents/prompt-sections.ts | sha256:31c2621fc422fdfa5d52e9a52b519523dda7762d34dedf12e66829e9d1a230c5
- Source: src/agents/prompt-rendering.test.ts | sha256:7614ab27e06038e04ef9d0870ad4599577e6da22c826932b18579c819315f3d9
- Source: plugin/agents/orchestrator.md | sha256:d2cdc12d8fc6fc370858724a0fafb6d35fe74d064f4f594eea3035391f4778b2
- Source: plugin/.claude-plugin/.thoth-agents-plugin-assets.json | sha256:53364c9e19c39282af7bb65a2f90f7e1e38c98e06a4f7cde20b7aab6e2014057
- Source: src/pi.ts | sha256:498c8339d419b0c20d33b4342995a8e963bfb43d035116e17e59eee593febcb9
- Source: src/pi.test.ts | sha256:8c5a8029087b2a633f50502094bd816782720fb97c3cbb9693d3b6f363a9c204
- Source: .thoth/specs/multi-harness-agent-pack/spec.md | sha256:ffa09a951c9fea05a3fdc75604967af4e75bb8284332888c5d27cf4d0563715b

Final review: fresh read-only Oracle subtask_thoth-oracle_1791147291453_ccaa66b5 (PASS on diff and checks); record prefix re-attested by a fresh Oracle after closeout bookkeeping.

Risks and environment: full `pnpm test` has 50 failures in Codex install/paths/commands/operations and publish-marketplace, attributed by Oracle to the inherited Orca `CODEX_HOME` (codex-paths passes 2/2 without it) and a missing sibling `thoth-plugins` fixture directory; unrelated to this diff. `pnpm run check:ci` exits 0 with pre-existing warnings. Tests verify instruction/runtime contracts, not empirical model compliance; queued and expanded prompts rely on the durable rule.

## Closeout

**Archive**: READY
