# Change: oracle-gate-delivery-verdicts

**Classification**: substantial
**Scope**: cross-cutting
**Uncertainty**: medium
**Risk**: medium

## Exploration

- Root validates every Oracle gate result by re-emitting the whole `thoth-result` envelope into a bash heredoc piped to `skills/thoth-sdd/scripts/validate-result.mjs`; the instruction literal is `src/agents/prompt-sections.ts:251-254` ("unchanged stdin"), echoed by `skills/thoth-sdd/SKILL.md:161-194`, `skills/plan-reviewer/SKILL.md:36-44`, `references/phases/verify.md`, `docs/agent/agents-and-delegation.md`, and generated `plugin/agents/orchestrator.md:95`, `plugin/codex-hooks/payloads/root.md:89`. Asserted by `src/agents/prompt-rendering.test.ts:773-780` and `src/harness/bundled-skills.test.ts:311-334`.
- The validator already supports `--input <path>` and expectation-free validation: `validateResult(message, {role?, reviewKind?, recordSha256?, noRecord?})` infers kind from `envelope.review.kind`; recordless final verification needs `noRecord`. On success the CLI prints the full parsed envelope. It reads `./result-contract.json` relative to `import.meta.url` (bundling hazard). Record binding fields: `review.reviewedRecord`, `review.reviewedRecordSha256` (prefix bytes before `## Authorization`).
- No harness validates child results today. Native interception points (librarian, with citations in the research result):
  - Pi: `tool_result` event chains across extensions (`toolName`, `content`, `details`, `structuredContent`); `subagent_result` carries `details.task.agent` and `details.full_result`; task-mode `subagent_run` carries `details.results[i].agent/.result`; background `subagent-completion` custom messages are not interceptable through a persistent path. The thoth Pi root extension `src/pi.ts` uses only `input`, `before_agent_start`, `session_start`.
  - OpenCode V1: `tool.execute.after(input{tool,args}, output{output})`; mutated `output.output` reaches the model; `input.args.subagent_type` names the agent; existing wiring in `src/index.ts:305-322`, pattern `src/hooks/delegate-task-retry/`.
  - Claude Code: `PostToolUse` matcher `Agent` exposes `tool_input.subagent_type` and, for foreground runs, `tool_response.status: "completed"` with text `content`; `hookSpecificOutput.additionalContext` reaches the parent. Background runs only report `async_launched`. Plugins ship `hooks/hooks.json` with `${CLAUDE_PLUGIN_ROOT}`. The generated plugin ships no hooks today and a test asserts their absence (`src/harness/generate-integration-packages.test.ts:112-113`). Oracle id `thoth-agents:oracle`.
  - Codex: `PostToolUse` covers local function tools including multi-agent `wait_agent`, supports `hookSpecificOutput.additionalContext`; exact final-text serialization of `wait_agent` is only partially verified. Plugin hooks are declared in `plugin/codex-hooks/hooks.json` generated from `src/harness/adapters/codex.ts:180-227`; `src/harness/adapters/codex-surfaces.ts` allowlists events/outputs and forbids tool interception; Oracle agent type `oracle`.
- Generated `plugin/` artifacts are drift-tested against fresh generation; regenerate with `pnpm integration:sync`, verify with `pnpm integration:verify`. `pnpm run build` invokes `integration:sync`, which removes and rewrites the whole `plugin/` and `pi/` trees.
- Canonical requirement "Generate the shared plugin from canonical source" keeps harness hook declarations outside paths another harness auto-discovers and its scenario requires that no `plugin/hooks/hooks.json` exists (Codex may auto-discover a default `hooks/hooks.json`).

## Intent

When an Oracle gate result (plan-review or final-verification envelope) is delivered to the root, the harness integration validates it with the canonical validator and adds one compact verdict line, so the root records approvals by comparing that verdict with its assignment instead of re-emitting the envelope through a heredoc. All four harnesses are covered; where no native delivery interception exists, the root uses an explicit validator fallback that prints only a compact summary.

## Non-goals

- No change to what Oracle returns, to the envelope schema, to Oracle self-repair (`SubagentStop`), or to the one format-only repair rule.
- Closeout still embeds the unchanged final-verification envelope in the record (it is the audit trail closeout re-validates); only the separate root digest computation is removed because the verdict carries it.
- No interception of Claude Code background agent completions (no documented hook); Claude gate Oracles run in the foreground instead.
- No Oracle self-repair through `SubagentStop`; considered and deferred because Pi would not benefit.
- No removal or rewriting of the envelope in the root context; the verdict is additive.
- No other review/validation workflow changes.

## Acceptance

- AC-1: The canonical validator exposes a compact gate summary and a one-line verdict format, including record-prefix digest agreement, and its CLI prints only the compact summary with unchanged exit codes.
- AC-2: In Pi, Oracle gate results delivered through background `subagent-completion` notifications, `subagent_result`, or task-mode `subagent_run` carry exactly one delivery verdict per delivered message, while all other results are unchanged.
- AC-3: In OpenCode, `task` results from the Oracle that contain a `thoth-result` fence carry exactly one appended delivery verdict, while all other results are unchanged.
- AC-4: The Claude Code plugin ships a `PostToolUse` `Agent` hook that adds the delivery verdict as parent context for completed foreground Oracle results.
- AC-5: The Codex plugin ships a `PostToolUse` hook that adds a delivery verdict for each delivered Oracle envelope in `wait_agent` results, with the hook surface accepted by the Codex surface validator and trust tooling.
- AC-6: Root instructions, bundled skills, docs and generated artifacts make the delivery verdict the approval input (including copying the verdict and record digest into the record), forbid re-piping when a verdict exists, keep an explicit compact fallback only when none was delivered, and tell the Claude Code root to run gate Oracles in the foreground.
- AC-7: The local closeout gate passes: focused tests, `pnpm run check:ci`, `pnpm run typecheck`, `pnpm run build`, and `pnpm integration:verify`.

## Clarifications

- Mechanism: user selected automatic delivery-time validation over a task-id tool or compact-only output.
- Scope: user selected all four harnesses (Pi, OpenCode, Claude Code, Codex).
- Additional improvements: user confirmed none were requested, then allowed improving anything around validation; root added Pi background-notification verdicts and verdict-carried record digests, kept closeout envelope embedding, and deferred `SubagentStop` self-repair.

## Decisions

- D1: Single source of validation logic stays `skills/thoth-sdd/scripts/validate-result.mjs` (byte-equal `plugin/skills/` copy). It gains `summarizeGateResult(message, { cwd })` and `formatGateVerdict(summary)`; no harness duplicates validation rules. The validator unit makes it bundle-safe (its contract data must survive bundling into `dist/` while the installed script keeps working standalone) and proves this with a test that bundles a consumer with the repository bundler into a temporary directory and executes it.
- D2: Summary fields: `valid`, `role`, `kind`, `verdict`, `mode` (`record` or `no-record`), `record`, `recordSha256` (the envelope's reviewed digest or null), `recordDigest` (`match`, `mismatch`, `unavailable`, or `none`), `issues` (code and path only). Mode is chosen from the presence of binding fields: final verification without binding validates with `noRecord`; root confirms the mode matches its assignment. `recordDigest` hashes exact UTF-8 bytes before `## Authorization` of `reviewedRecord` resolved inside `cwd`; paths outside `cwd` or unreadable files yield `unavailable`. The prefix-digest helper is shared with `validate.mjs`, not duplicated.
- D3: Verdict line format: `thoth-gate-verdict <single-line JSON summary>`. Root accepts only exactly one harness-delivered verdict per gate result; zero verdicts mean fallback, more than one or a verdict inside the envelope fence means invalid.
- D4: Detection: validate only results whose delivered agent identity is the harness Oracle (Pi `thoth-oracle`, OpenCode Oracle agent name from the canonical role contract, Claude `thoth-agents:oracle`) and whose text contains a `thoth-result` fence; Oracle diagnosis/advice without a fence gets no verdict. Codex validates per delivered agent message when its identity is not in the payload; the verdict states the agent identity when known, and root keeps the provenance check.
- D5: Interception points: Pi `tool_result` handler in `src/pi.ts` for `subagent_result` and task-mode `subagent_run`, appending a text block and preserving `details` and `structuredContent`; OpenCode new hook under `src/hooks/` on `tool.execute.after` for `task`; Claude Code `PostToolUse` matcher `Agent` declared in `plugin/claude-hooks/hooks.json`, referenced explicitly by the Claude manifest `hooks` field (no `plugin/hooks/hooks.json`), returning `hookSpecificOutput.additionalContext`; Codex plugin `PostToolUse` declaration for `wait_agent` in `plugin/codex-hooks/hooks.json` returning `hookSpecificOutput.additionalContext`. Claude and Codex share one generated hook script at a neutral path neither harness auto-discovers, importing the installed validator relative to the plugin root.
- D6: The CLI fallback prints the compact summary instead of the parsed envelope; exit codes 0, 1, 2 keep their meaning; existing expectation flags remain.
- D8: Pi background `subagent-completion` notifications get the verdict through the `context` event in `src/pi.ts`, appended to the model-facing content of Oracle completion messages carrying a `thoth-result` fence. The transform is deterministic; edits after `## Authorization` leave the digest stable, and a later prefix edit truthfully reports `mismatch`.
- D7: Codex `wait_agent` final-text serialization must be confirmed from authoritative Codex source before shipping its hook; synthetic payloads alone never satisfy that milestone; if it cannot be established, the Codex unit stops and returns to root for reassessment.
- D10: Adapters always compute the verdict from the original child result with the canonical validator; child-authored text (including a forged `thoth-gate-verdict` line or an early `</task_result>` terminator) never suppresses validation. Idempotence only skips when the adapter-owned position already holds exactly the freshly computed verdict. A forged line therefore yields an invalid envelope (surrounding prose) plus a second verdict line, which root rejects under D3.
- D11: Record equality and digest requirements apply only to record-bound final verification. A plan review may be unbound (`record` null) or, when bound, must name the assigned record; `mode` and `recordDigest` are judged only for final verification.
- D9: Generated-output ownership is serialized: only AC-1 (before fan-out), the AC-4+AC-5 writer (during fan-out), AC-6 (after fan-in) and AC-7 (root, last) may run `pnpm integration:sync` or `pnpm run build`; AC-2 and AC-3 never run them and own no `plugin/**` or `pi/**` paths.

## Durable deltas

- `MODIFIED multi-harness-agent-pack` **Structured specialist results** — Only Oracle results that gate SDD transitions (plan review and final verification) MUST end with exactly one fenced `thoth-result` JSON envelope conforming to the gate contract, and root MUST accept the result only from exactly one valid delivery verdict produced by the bundled validator for that result (or, when no verdict was delivered, from the bundled validator run explicitly) before recording plan-review OKAY or final-verification PASS, treat a missing or malformed envelope as no approval, allow at most one format-only repair, and still judge the content; other Thoth specialist results use compact fields judged by root, user-defined agent results keep their own free format, and neither is rejected for format nor counts as an approval.
  - GIVEN an Explorer answering a user question and an Oracle final verification whose delivery verdict reports an invalid envelope; WHEN root evaluates both; THEN the Explorer result is judged on content without validation and the Oracle result records no approval .
- `MODIFIED multi-harness-agent-pack` **Generate the shared plugin from canonical source** — Claude agents MUST be generated from `src/agents/`. The shared bundle MUST receive one copy of the canonical thoth-owned `skills/` tree and MUST contain separate harness-specific manifests, MCP surfaces, Codex hook declarations and Claude hook declarations, each with its payload or script files placed outside any path another harness auto-discovers and referenced explicitly by its own harness manifest, with no `plugin/hooks/hooks.json`. The Codex plugin manifest MUST NOT declare generated role TOMLs; the CLI writer remains their canonical delivery surface. Build and npm version lifecycle commands MUST synchronize the generated shared plugin output, including hook declarations, hook scripts and Codex hook payloads.
  - GIVEN a changed canonical role prompt; WHEN the build runs; THEN the Codex hook payload for that role in `plugin/codex-hooks/` is regenerated while `codex-hooks/hooks.json` and `claude-hooks/hooks.json` declarations remain byte-identical and no `plugin/hooks/hooks.json` exists for either harness to auto-discover .
- `ADDED multi-harness-agent-pack` **Delivery-time Oracle gate verdicts** — Each harness integration MUST validate Oracle gate envelopes at native result delivery with the bundled validator and add exactly one compact `thoth-gate-verdict` line per delivered message (Pi background completion notifications, `subagent_result` and task-mode `subagent_run` results, OpenCode `task` results, Claude Code foreground `Agent` results, Codex `wait_agent` results) without altering the envelope, MUST leave non-Oracle and non-gate results unchanged, and root MUST NOT re-emit an envelope to validate it when a verdict was delivered; the explicit validator fallback MUST print only the compact summary.
  - GIVEN a Pi root whose background Oracle plan review completed with a valid envelope; WHEN root reads the completion notification; THEN the delivered result carries one `thoth-gate-verdict` line reporting valid, the kind, the verdict and the record, and root records OKAY without running the validator through bash .

## Plan

Approach: add a compact summary layer to the canonical validator, then wire one thin adapter per harness at its native delivery point, then switch the root contract to consume verdicts.

- Validator layer (AC-1): extend `validate-result.mjs` and its `.d.mts` with `summarizeGateResult` and `formatGateVerdict` per D1-D3; share the record prefix-digest helper with `validate.mjs`; change CLI success/failure output to the compact summary (D6). Tests in `src/harness/core/validate-result.test.ts` cover summary fields, mode selection, digest match/mismatch/unavailable/outside-cwd, the verdict line, CLI output shape and exit codes, plus canonical/plugin byte equality after `pnpm integration:sync`.
- Pi adapter (AC-2): `src/pi.ts` registers a `tool_result` handler and a `context` handler (extend its local Pi API interface) per D4, D5, D8; test with synthetic events for Oracle gate, Oracle advice, non-Oracle, task-mode multi-result, completion custom messages, idempotence (no second verdict), and preserved `details`/`structuredContent`; prove the validator loads from the built output.
- OpenCode adapter (AC-3): new `src/hooks/oracle-gate-verdict/` (hook, index, test) wired into `tool.execute.after` in `src/index.ts` alongside existing hooks; tests mirror `delegate-task-retry`.
- Claude Code and Codex adapters (AC-4, AC-5): generate one shared hook script plus Claude `plugin/claude-hooks/hooks.json` referenced by a new `hooks` field in the Claude manifest (typed and serialized by `src/harness/writers/claude-code-plugin-package.ts`), and a Codex `PostToolUse` declaration in `plugin/codex-hooks/hooks.json`; update `codex-surfaces.ts` allowlist rules to permit an additionalContext-only `PostToolUse`, the generator, the Claude absence assertion, Codex trust computation tests, and hook-script unit tests with representative payloads (foreground completed, `async_launched`, non-Oracle, Codex `wait_agent`). Confirm Codex payload shape first (D7).
- Root contract (AC-6): update `src/agents/prompt-sections.ts` gate line and harness dialects (`src/agents/prompt-dialects.ts`) for Pi retrieval and Claude foreground gates; update `skills/thoth-sdd/SKILL.md` Specialist result validation, `references/phases/verify.md`, `skills/plan-reviewer/SKILL.md`, `docs/agent/agents-and-delegation.md`, `docs/agent/testing.md`; update assertions in `src/agents/prompt-rendering.test.ts` and `src/harness/bundled-skills.test.ts`; regenerate `plugin/` with `pnpm integration:sync`.
- Ordering: validator first; then Pi, OpenCode, and Claude/Codex units in parallel (disjoint writes; per D9 only the Claude/Codex writer regenerates `plugin/**` and `pi/**` during fan-out); root contract after fan-in; full build only in AC-7.
- Risks: Codex payload uncertainty (D7); Claude background gates get no verdict (mitigated by foreground instruction and explicit fallback); validator bundling hazard (D1); hook execution now runs on every Claude `Agent` and Codex `wait_agent` call (filtered, read-only, fails open with no verdict); spoofed verdict lines (D3).

## Tasks

- [x] AC-1: Canonical validator exposes compact gate summary, verdict line, shared record-prefix digest, and compact CLI output
  - Outcome: `summarizeGateResult`/`formatGateVerdict` exported and typed; CLI prints compact summary; exit codes unchanged; validator bundle-safe per D1
  - Known entrypoints and skill paths: skills/thoth-sdd/scripts/validate-result.mjs, skills/thoth-sdd/scripts/validate-result.d.mts, skills/thoth-sdd/scripts/validate.mjs, src/harness/core/validate-result.test.ts, src/harness/core/result-contract.ts
  - Inputs: Decisions D1-D3, D6; exploration facts on validator API
  - Dependencies: none
  - Output: updated validator, declarations, tests, regenerated plugin/skills copies
  - Owner: thoth-worker
  - Writes: skills/thoth-sdd/scripts/**, plugin/skills/thoth-sdd/scripts/**, src/harness/core/validate-result.test.ts
  - Interface boundaries: validate.mjs closeout contract and result-contract.json stay compatible; no schema change
  - Focused check and PASS evidence: `pnpm vitest run src/harness/core/validate-result.test.ts src/harness/core/result-contract.test.ts src/harness/sdd-validator.test.ts` all pass, including the temporary-bundle execution test
  - Return milestone: tests green with summary/CLI behavior covered
  - Stop / reassessment: any need to change the envelope schema or closeout semantics
- [x] AC-2: Pi root extension appends one delivery verdict to Oracle gate results
  - Outcome: `tool_result` handler for `subagent_result` and task-mode `subagent_run`, plus `context` handler for `subagent-completion` messages
  - Known entrypoints and skill paths: src/pi.ts, its tests, pi-packages/pi-subagents/src/tools/subagent-result.ts, pi-packages/pi-subagents/src/tools/result-details.ts, pi-packages/pi-subagents/src/render/completion-message.ts, tsup.config.ts, installed Pi docs/extensions.md and dist/core/extensions/types.d.ts
  - Inputs: accepted AC-1 API; D4, D5, D8
  - Dependencies: AC-1 validator unit accepted
  - Output: handler plus tests, including validator loading from built output
  - Owner: thoth-worker
  - Writes: src/pi.ts, src/pi*.test.ts, new src/pi-* helper module if needed; never plugin/** or pi/**
  - Interface boundaries: pi-subagents result shapes are read-only inputs; do not modify pi-packages; do not run `pnpm run build` or `pnpm integration:sync` (D9)
  - Focused check and PASS evidence: focused Pi extension tests pass with `pnpm vitest run` on the touched test files
  - Return milestone: tests green
  - Stop / reassessment: Pi `tool_result` cannot see these tools, cannot preserve details, or `context` messages do not expose the completion custom type and agent
- [x] AC-3: OpenCode task hook appends one delivery verdict to Oracle gate results
  - Outcome: `oracle-gate-verdict` hook wired into `tool.execute.after`
  - Known entrypoints and skill paths: src/index.ts, src/hooks/index.ts, src/hooks/delegate-task-retry/, src/agents/prompt-dialects.ts
  - Inputs: accepted AC-1 API; D4-D5
  - Dependencies: AC-1 validator unit accepted
  - Output: new hook directory with tests and wiring
  - Owner: thoth-worker
  - Writes: src/hooks/oracle-gate-verdict/**, src/hooks/index.ts, src/index.ts
  - Interface boundaries: existing retry and JSON-recovery hooks keep their order and behavior; do not run `pnpm run build` or `pnpm integration:sync` (D9)
  - Focused check and PASS evidence: `pnpm vitest run src/hooks` passes with new cases
  - Return milestone: tests green
  - Stop / reassessment: Oracle agent name or task output shape differs from evidence
- [x] AC-4: Claude Code plugin ships the PostToolUse Agent verdict hook
  - Outcome: shared hook script and `plugin/claude-hooks/hooks.json` referenced by the Claude manifest, generated and drift-tested, with no `plugin/hooks/hooks.json`
  - Known entrypoints and skill paths: src/harness/adapters/claude-code.ts, src/harness/writers/claude-code-plugin-package.ts, src/harness/generate-integration-packages.ts, src/harness/generate-integration-packages.test.ts, src/harness/codex-hook-script.ts
  - Inputs: accepted AC-1 API; D4-D5; Claude hooks evidence
  - Dependencies: AC-1 validator unit accepted
  - Output: generator changes, hook script source, tests, regenerated plugin/
  - Owner: thoth-worker (same writer as AC-5)
  - Writes: src/harness/adapters/claude-code.ts and tests, src/harness/writers/claude-code-plugin-package.ts and tests (manifest `hooks` typing, allowlist serialization, round-trip generation), src/harness/generate-integration-packages*.ts, new src/harness/gate-hook-script.ts and test, plugin/** and pi/** via `pnpm integration:sync` (sole generated-output owner during fan-out, D9)
  - Interface boundaries: Claude manifest and agents unchanged except the `hooks` field
  - Focused check and PASS evidence: generator and hook-script tests pass (absence of `plugin/hooks/hooks.json` still asserted); `pnpm integration:verify` passes; the Claude manifest `hooks` custom-path support is cited from official Claude Code plugin docs
  - Return milestone: tests green with regenerated artifacts
  - Stop / reassessment: the Claude manifest cannot reference a custom hooks path, or packaging conflicts with Codex default hook discovery
- [x] AC-5: Codex plugin ships the PostToolUse wait_agent verdict hook
  - Outcome: PostToolUse declaration accepted by surface validator and trust tooling
  - Known entrypoints and skill paths: src/harness/adapters/codex.ts, src/harness/adapters/codex-surfaces.ts, src/harness/codex-hook-script.ts, src/cli/codex-lifecycle.ts, src/harness/writers/codex-plugin-package.ts
  - Inputs: accepted AC-1 API; D4-D5, D7; Codex hooks evidence
  - Dependencies: AC-1 validator unit accepted; runs in the same writer session as AC-4
  - Output: Codex hook declaration, surface rules, tests, regenerated plugin/codex-hooks
  - Owner: thoth-worker (same writer as AC-4)
  - Writes: src/harness/adapters/codex*.ts, src/harness/codex-hook-script.ts, src/cli/codex-*.ts and tests, plugin/codex-hooks/**
  - Interface boundaries: existing SessionStart/SubagentStart hooks and trust entries keep working
  - Focused check and PASS evidence: `pnpm vitest run src/harness/adapters src/cli/codex` passes; `pnpm integration:verify` passes; `wait_agent` final-text serialization is cited from authoritative Codex source (synthetic payloads alone do not pass, D7)
  - Return milestone: tests green with authoritative payload citation
  - Stop / reassessment: wait_agent final-text payload cannot be established from authoritative source (D7)
- [x] AC-6: Root contract, skills, docs and generated artifacts consume delivery verdicts
  - Outcome: instructions per D2-D6 and D8 with verdict-to-record field copying and Claude foreground gate guidance
  - Known entrypoints and skill paths: src/agents/prompt-sections.ts, src/agents/prompt-dialects.ts, skills/thoth-sdd/SKILL.md, skills/thoth-sdd/references/phases/verify.md, skills/plan-reviewer/SKILL.md, docs/agent/agents-and-delegation.md, docs/agent/testing.md, src/agents/prompt-rendering.test.ts, src/harness/bundled-skills.test.ts
  - Inputs: accepted AC-1 through AC-5 outputs (final verdict marker and per-harness behavior)
  - Dependencies: AC-1, AC-2, AC-3, AC-4, AC-5 accepted
  - Output: updated prompts, skills, docs, tests, regenerated plugin/
  - Owner: thoth-worker
  - Writes: listed entrypoints, plugin/** via `pnpm integration:sync`
  - Interface boundaries: other gate rules (format-only repair, no-record, closeout pasting) unchanged
  - Focused check and PASS evidence: `pnpm vitest run src/agents src/harness/bundled-skills.test.ts src/harness/adapters` and `pnpm integration:verify` pass
  - Return milestone: tests green and no stdin-only validation instruction remains
  - Stop / reassessment: a harness needs different approval semantics than D3
- [x] AC-2: Converge — delivery adapters never trust child-authored verdict text (D10)
  - Outcome: Pi, OpenCode and the shared Claude/Codex hook script always validate the original child result and dedupe only an identical adapter-owned verdict; forged-marker regressions covered
  - Known entrypoints and skill paths: src/pi-gate-verdict.ts, src/hooks/oracle-gate-verdict/hook.ts, src/harness/gate-hook-script.ts and their tests
  - Inputs: final-verification FAIL finding 1 (forged verdict / early `</task_result>` bypass); D3, D10
  - Dependencies: AC-1..AC-6 accepted
  - Output: hardened adapters and regression tests
  - Owner: thoth-worker (same converge writer as the AC-6 row below)
  - Writes: listed files and tests; plugin/** via `pnpm integration:sync`
  - Interface boundaries: verdict format, additive delivery and immutability unchanged
  - Focused check and PASS evidence: forged-marker and wrapper-terminator tests pass for Pi tool_result, Pi context, OpenCode and hook script
  - Return milestone: tests green
  - Stop / reassessment: a harness cannot distinguish adapter-owned position from child text
- [x] AC-6: Converge — plan-review approvals accept unbound reviews (D11)
  - Outcome: root prompt, skills and docs restrict record equality and digest checks to record-bound final verification; unbound plan reviews remain approvable
  - Known entrypoints and skill paths: src/agents/prompt-sections.ts, src/agents/prompt-dialects.ts, skills/thoth-sdd/SKILL.md, skills/thoth-sdd/references/phases/verify.md, skills/plan-reviewer/SKILL.md, docs/agent/agents-and-delegation.md, related tests
  - Inputs: final-verification FAIL finding 2; D11
  - Dependencies: AC-6 accepted
  - Output: corrected instructions, regression assertions, regenerated plugin/
  - Owner: thoth-worker (same converge writer)
  - Writes: listed files and tests; plugin/** and pi/** via `pnpm integration:sync`
  - Interface boundaries: envelope schema and validator API unchanged
  - Focused check and PASS evidence: prompt/skill assertions cover unbound plan review; `pnpm integration:verify` passes
  - Return milestone: tests green
  - Stop / reassessment: the fix would require a schema change
- [x] AC-7: Local closeout gate passes on the integrated change
  - Outcome: proportional closeout checks green
  - Known entrypoints and skill paths: package.json scripts, docs/agent/testing.md
  - Inputs: accepted AC-1 through AC-6
  - Dependencies: AC-1 through AC-6 accepted
  - Output: check outputs for the record
  - Owner: root
  - Writes: none
  - Interface boundaries: none
  - Focused check and PASS evidence: `pnpm run check:ci`, `pnpm run typecheck`, `pnpm run build`, `pnpm integration:verify`, and touched-area vitest runs exit 0
  - Return milestone: all commands exit 0
  - Stop / reassessment: unrelated environment failures are reported with evidence

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW

Round 1 REJECT (Claude hook path contradicted canonical scenario; parallel build ownership), round 2 REJECT (stale Plan path; Claude manifest writer ownership), round 3 OKAY from a fresh Oracle, validated with `--review-kind plan-review`; nonblocking caution: D7 Codex authoritative payload evidence.
**Implementation**: AUTHORIZED

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 48905f3705d00cc618ef57041a4453e11246de6647e0c043f707bbcc2d4b2ce3

Round 1 FAIL (forged-verdict bypass; unbound plan-review approval) repaired under D10/D11; round 2 fresh Oracle PASS validated with `--review-kind final-verification --record-sha256` (explicit fallback: the running session predates this change).

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS. Both prior blockers are repaired. Independent review and adversarial checks found no remaining blocking correctness or contract violations.",
  "evidence": [
    {
      "id": "e1",
      "kind": "record",
      "locator": ".thoth/changes/oracle-gate-delivery-verdicts/oracle-gate-delivery-verdicts.md",
      "claim": "Independent hashing of exact UTF-8 bytes before the Authorization heading produced 48905f3705d00cc618ef57041a4453e11246de6647e0c043f707bbcc2d4b2ce3. Verify validation and the canonical spec baseline match passed.",
      "basis": "observed",
      "uncertainty": "none"
    },
    {
      "id": "e2",
      "kind": "diff",
      "locator": "git status; git diff; untracked files",
      "claim": "Reviewed all 56 changed or untracked paths against intent, acceptance, decisions and durable deltas. Final input fingerprint was unchanged; no unrelated or secret changes were identified.",
      "basis": "observed",
      "uncertainty": "none identified"
    },
    {
      "id": "e3",
      "kind": "tests",
      "locator": "Focused Vitest runs and pnpm integration:verify",
      "claim": "732 tests passed across validator, SDD, Pi, OpenCode, shared hook runtime, prompts, skills, adapters, packaging and Codex installation/trust coverage.",
      "basis": "observed",
      "uncertainty": "Synthetic adapter execution does not establish live model compliance."
    },
    {
      "id": "e4",
      "kind": "adversarial-checks",
      "locator": "src/pi-gate-verdict.ts; src/hooks/oracle-gate-verdict/hook.ts; src/harness/gate-hook-script.ts",
      "claim": "Forged verdict positions, early/nested wrapper tags, malformed and multiple envelopes failed closed. Probes confirmed input preservation, multi-Oracle task attribution, exact verdict deduplication, unbound plan-review validity and digest freshness behavior.",
      "basis": "observed",
      "uncertainty": "No bypass reproduced in the tested native payload shapes."
    },
    {
      "id": "e5",
      "kind": "contracts-and-packaging",
      "locator": "skills/; plugin/; src/agents/prompt-sections.ts; docs/agent/",
      "claim": "Canonical/plugin skill trees are byte-equal; generated integration checks pass; no plugin/hooks/hooks.json exists. Exactly-one-verdict, fallback, repair budget, no-record, provenance, authorization separation and unchanged closeout envelope requirements remain intact.",
      "basis": "observed",
      "uncertainty": "none identified"
    },
    {
      "id": "e6",
      "kind": "compatibility",
      "locator": "openai/codex rust-v0.162.1 wait.rs, registry.rs, tools/mod.rs, protocol.rs; official Claude Code types/plugin guidance; Pi result producers",
      "claim": "Native sources support the implemented result fields, tool-name handling and custom Claude hook path. Harness capability limitations remain explicitly documented.",
      "basis": "observed",
      "uncertainty": "Live native harness sessions were not executed."
    }
  ],
  "verification": [
    {
      "check": "AC-1 through AC-6 and D1-D11",
      "method": "Actual diff inspection, 732 focused tests, byte-parity checks and independent adversarial probes",
      "outcome": "pass",
      "evidenceIds": ["e2", "e3", "e4", "e5", "e6"],
      "reason": "Prior failures are repaired without weakening governance or altering the envelope contract."
    },
    {
      "check": "Record binding and freshness",
      "method": "Independent byte-prefix SHA-256, canonical summary comparison, freshness probes and --through verify",
      "outcome": "pass",
      "evidenceIds": ["e1", "e4"],
      "reason": "Digest matches the assignment; prefix changes invalidate agreement while post-Authorization changes preserve it."
    },
    {
      "check": "Local checks",
      "method": "pnpm run typecheck; pnpm run check:ci; pnpm integration:verify; git diff --check",
      "outcome": "pass",
      "evidenceIds": ["e2", "e3", "e5"],
      "reason": "All exited zero. Biome reported warnings and informational diagnostics, not errors."
    },
    {
      "check": "Build rerun",
      "method": "Not rerun as explicitly instructed",
      "outcome": "not-run",
      "evidenceIds": ["e1"],
      "reason": "Retained root-reported successful post-repair build evidence."
    }
  ],
  "risks": [
    {
      "description": "Live cross-harness delivery was not exercised independently; confidence rests on native-source compatibility and executable adapter tests.",
      "severity": "low",
      "blocking": false,
      "evidenceIds": ["e3", "e6"]
    }
  ],
  "openQuestions": [],
  "nextAction": "Root should validate this result, embed the unchanged envelope, run closeout, and archive.",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/oracle-gate-delivery-verdicts/oracle-gate-delivery-verdicts.md",
    "reviewedRecordSha256": "48905f3705d00cc618ef57041a4453e11246de6647e0c043f707bbcc2d4b2ce3"
  }
}
```

- AC-1: PASS | `pnpm vitest run src/harness/core/validate-result.test.ts` | 102 tests passed (root rerun); temporary-bundle and installed-copy execution covered; CLI prints compact summary
- AC-2: PASS | `pnpm vitest run src/pi.test.ts src/pi-gate-verdict.test.ts` | 58 tests passed (root rerun); tool_result + context handlers, idempotent, details/structuredContent preserved
- AC-3: PASS | `pnpm vitest run src/hooks` | 69 tests passed (root rerun); oracle-gate-verdict hook wired after retry/JSON-recovery hooks
- AC-4: PASS | `pnpm integration:verify` + src/harness tests | 13 passed; plugin/claude-hooks/hooks.json referenced by Claude manifest `hooks`, no plugin/hooks/; custom path cited from code.claude.com plugins-reference
- AC-5: PASS | src/harness + src/cli/codex tests | PostToolUse `^(multi_agent_v1)?wait_agent$` in plugin/codex-hooks/hooks.json; payload cited from openai/codex rust-v0.162.1 wait.rs/registry.rs/tools/mod.rs/protocol.rs
- AC-6: PASS | `pnpm vitest run src/agents src/harness/bundled-skills.test.ts src/harness/adapters` | 255 tests passed (worker); `rg "unchanged stdin" src skills docs plugin pi` no matches
- Converge (final-verification round 1 FAIL: forged verdict bypass; unbound plan-review approval): PASS | `pnpm vitest run src/pi.test.ts src/pi-gate-verdict.test.ts src/hooks src/harness/gate-hook-script.test.ts src/harness/core/validate-result.test.ts src/agents src/harness/bundled-skills.test.ts src/harness/adapters` | 503 tests passed (root rerun); typecheck, build, integration:verify, check:ci exit 0 after repair
- AC-7: PASS | `pnpm run check:ci`, `pnpm run typecheck`, `pnpm run build`, `pnpm integration:verify`, touched-area vitest | all exit 0 except 2 src/cli tests timing out at 5000ms under full parallel load; both pass in isolation (46/46) — Windows timing, unrelated; changed files Biome-clean; `git diff --check` clean
- Source: .thoth/specs/multi-harness-agent-pack/spec.md | sha256:ac72054b397ac31e4c59c2e23e7448ea911eaea93341cbce853f9abd05caeaaa

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
