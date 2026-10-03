# Change: root-delegation-hardening

**Classification**: substantial
**Scope**: cross-cutting
**Uncertainty**: medium
**Risk**: medium

## Exploration

- Failing session `~/.pi/agent/sessions/--C--Users-EremesNG-orca-workspaces-thoth-mem-flow-fixes--/2026-10-03T18-15-04-666Z_…jsonl`: root had `subagent_run` but made 0 delegations against 15 `read`, 70 `bash`, 12 `edit` and 3 `write`. Its first action was `read docs/agent/index.md` plus git/ls inspection ("I should start by exploring…").
- Pi does not persist `before_agent_start` `systemPrompt` overrides in session logs (`agent-session.js:1263-1324`), so logs cannot prove the injection is missing. Running the installed `C:\DEV\Proyectos\Webstorm\thoth-agents\dist\pi.js` hook shows that it appends an 18.7 KB `thoth-agents:pi-root` block that contains the rules. The rules shipped, but the model did not follow them.
- In this repository the root complies because `AGENTS.md` restates the rules in stronger form. The shipped prompt is weaker in five ways:
  1. **Weak identity.** The role is only "You are the adaptive root."
  2. **Delegation reads as optional:**
     - "If delegating, …"
     - "Boundaries alone do not require delegation" (added in dd09e69)
     - "Delegate for a concrete … benefit"
     - Worker routing: "routine mechanical work stays with root".
  3. **Exceptions come before the rule.** `<implementation-ownership>` opens with "Root retains known low-risk mechanical work"; the default only appears later as "Otherwise specialists execute by default" (added in 57ac4eb).
  4. **The Explorer trigger is too narrow.** It says only "before root search", which does not cover file reads or shell/git inspection.
  5. **No precedence rule.** Nothing addresses project navigation rules that name root. For example, thoth-mem's `AGENTS.md` says "This rule applies to the root agent" for webstorm-index file reading.
- Review of archived change `2026-09-27-director-default-orchestration`:
  - Its accepted evidence explicitly limited verification to "instruction consistency, not live model compliance". No behavioral check exists.
  - Its final-review blocker repair added the "without preliminary CodeGraph queries, native search, or file reads" exemption to repository `AGENTS.md` only. That exemption never reached the shipped prompt.
  - Its AC-3 claimed no net-gain loopholes, but "net gain" survives in `skills/thoth-sdd/SKILL.md:54` and `src/harness/core/sdd.ts:396`, both of which ship.
  - Later commits 57ac4eb (09-28) and dd09e69 (10-02) reintroduced exception-first ordering and optional phrasing.
- Drift between copies: the canonical `src/harness/core/agent-pack.ts:348` contains "no preliminary discovery is needed to prepare that assignment". The rendered `src/agents/prompt-sections.ts:158` is a separate hand-written shorter string that drops it, and `agent-pack.ts:261` is a third variant.
- `skills/thoth-sdd/SKILL.md:24` says "The root orchestrator performs these steps", which reads as root-owned exploration.
- Reopened after the first AC-5 live smoke on 2026-10-03, which used this worktree's build in a clone of thoth-mem/flow-fixes with the same model as the failing session. Results by provider:
  - claude-bridge/claude-opus-5-5: root opened with `grep`, then `read docs/agent/index.md`, then `read service.ts`, with no delegation.
  - openai-codex/gpt-6.1-sol: root's first call was `subagent_run` with thoth-explorer, with both the new and the old installed prompt.
- Root cause, from Explorer review: pi-claude-bridge drops prose that extensions add to the system prompt.
  - `pi-packages/pi-claude-bridge/src/index.ts:2487-2492` and `:2508-2522` record the forced prompt only as a capture key.
  - `src/prompt-capture.ts:138-142` returns exact captures without derivation.
  - The projection at `:335-344` emits only context files, skills, the custom prompt and the configured append. `index.ts:1890-1895` and `:2050-2052` send it as the `claude_code` preset append.
  - `tests/unit-agent-start-capture-gaps.mjs:104-117` documents that "novel prose is not forwarded".
  - So on claude-bridge the thoth root block never reaches the model; only project AGENTS.md does. That explains why this repository, whose AGENTS.md restates the rules, appears to work.
- Pi loads thoth from the separate checkout `C:\DEV\Proyectos\Webstorm\thoth-agents` (branch 0.5.0), whose `dist` was built 2026-10-02 21:17.

## Intent

Shipped root instructions on every harness make delegation the visible default. Root acts as coordinator: specialists perform discovery of unlocated source, external research and substantive implementation. Root's direct-work exceptions read as explicit bounded exceptions, and project navigation rules never turn root into the investigator. The rendered prompt derives from one canonical policy text, so wording cannot drift. A live behavioral smoke check backs compliance, not only text presence. pi-claude-bridge forwards prose that extensions add to Pi's system prompt, so the thoth root block reaches Claude models.

## Non-goals

- Model or effort configuration, runtime enforcement, schedulers or tool blocking.
- Changing specialist roles, the two-fragment/~200-line allowance values, or SDD record contracts.
- Rebuilding, installing or publishing into `C:\DEV\Proyectos\Webstorm\thoth-agents` or npm. That is a separate, explicitly approved follow-up.
- Editing other projects' `AGENTS.md`.

## Acceptance

- AC-1: Every harness's rendered root prompt opens its role with coordinator identity and the specialist-by-default rule. Direct-work exceptions follow as explicitly bounded exceptions. The rendered prompt contains no optional-delegation phrasing: "If delegating", "Boundaries alone do not require delegation", "net gain", or "Otherwise specialists".
- AC-2: The rendered Explorer trigger covers code search, file reads, shell/git inspection and CodeGraph queries before dispatch. It states that no preliminary discovery is needed, and it includes a pre-first-tool self-check.
- AC-3: The rendered prompt states that project navigation instructions (webstorm-index, CodeGraph, rg, docs routers) govern how the assigned investigator searches and never make root the investigator, while the bounded known-source exception remains.
- AC-4: The root ownership text for OpenCode, Codex, Claude Code and Pi renders from a single canonical source in `agent-pack.ts`, with no hand-copied variant. Generated `plugin/` and `pi/` assets are regenerated and consistent, and `skills/thoth-sdd/SKILL.md` and `sdd.ts` no longer contain net-gain or root-performs-exploration wording.
- AC-6: When an extension's before_agent_start handler adds prose to the Pi system prompt (handler-returned or forced prompt), pi-claude-bridge includes that added prose in the outgoing Claude Code append exactly once, alongside existing context files, skills and custom/append content. Prompts without extension additions project exactly as before, and the bridge unit test that documented the gap asserts forwarding.
- AC-5: A live smoke run of the built Pi extension in a scratch git repository with a discovery-style prompt makes `subagent_run` with `thoth-explorer` before any root `read`, `grep`, `find` or code-inspecting `bash`. The result is recorded with the model used. A failure is reported as a failure, never claimed as PASS.

## Clarifications

- Resolved: the user agreed with the six-point proposal (identity, ordering, removing optional phrasing, a broader trigger, precedence, self-check) and asked that the previous director-default change be reviewed. Its gaps are incorporated above.
- Resolved: the live smoke uses the operator's current Pi root model; no model change.

## Decisions

- One canonical policy text in `agent-pack.ts` is consumed by `prompt-sections.ts`, replacing parallel strings.
- The self-check is phrased as guidance; no runtime enforcement claim.
- Deployment to the 0.5.0 checkout is excluded and requires separate user approval.
- User chose option A on 2026-10-03: fix the generic loss in pi-claude-bridge rather than reroute thoth through another channel. AC-1 to AC-4 are kept.

## Durable deltas

- `ADDED agent-delegation` **Root coordinates and specialists execute by default** — Shipped root instructions on every harness MUST present specialist execution of discovery for unlocated source, external research and substantive implementation as the default, MUST present root direct work only as bounded exceptions, and MUST state that project navigation rules govern the assigned investigator rather than making root the investigator.
  - GIVEN a root prompt rendered for any supported harness; WHEN the task needs discovery of unlocated local source and the project's instructions name navigation tools for the root; THEN the prompt directs root to dispatch Explorer without preliminary reads, search, shell inspection or CodeGraph queries.

## Plan

1. **Canonical policy** (`src/harness/core/agent-pack.ts`): rewrite the ownership/discovery policy entries in default-first order:
   - coordinator identity;
   - default specialist execution;
   - the broader Explorer trigger, including no preliminary discovery;
   - navigation precedence;
   - the pre-first-tool self-check;
   - bounded exceptions (known low-risk mechanical work, reviewed commits, one known source/one question, the two-fragment budget, explicit user direct-work).

   Remove the duplicate variant at `:261`.
2. **Rendering** (`src/agents/prompt-sections.ts`): `renderImplementationOwnershipPolicy` and the role line consume the canonical entries.
   - Remove "If delegating" from the lifecycle sentence.
   - Restrict "Boundaries alone…" to the fresh-session rule, rephrased so it does not read as permission for root to execute.
   - Change worker routing wording from "routine mechanical work stays with root" to referencing the bounded exception.
3. **Skills/core:**
   - `skills/thoth-sdd/SKILL.md`: line 24 becomes "root owns completing understanding; discovery ownership follows the root delegation policy"; line 54 removes "net gain".
   - `src/harness/core/sdd.ts:396`: drop "net gain".
4. **Regeneration:** run `integration:sync` to regenerate `plugin/` and `pi/` assets; update `docs/agent/routing-cases.json` if its cases quote the changed text.
5. **Tests (TDD):** in `src/agents/prompt-rendering.test.ts` and the adapter tests, render for each of the four harnesses and assert:
   - default-first ordering, by index comparison;
   - presence of the trigger, precedence and self-check text;
   - absence of the forbidden phrases;
   - a single-source equality between canonical and rendered text.
6. **Live smoke** (AC-5): build, then run Pi non-interactively with this worktree's `dist/pi.js` as the extension, in a scratch git repository containing a few source files, using a prompt such as "¿dónde se valida X y por qué falla Y?". Inspect the session JSONL for the order of the first tool calls. This step needs root/Oracle verification. No script files are created in the repository.

7. **Bridge** (AC-6, `pi-packages/pi-claude-bridge`): read its AGENTS.md first. When the final or forced prompt differs from the default assembled prompt, extract the extension-added prose. That means the text the forced prompt adds around the embedded assembled prompt, such as a suffix, prefix or wrapper, or the whole prompt when it is a replacement. Include it in the projected append without duplicating context files, skills or append content already projected.
   - Prefer reusing the existing derivation path (`prompt-capture.ts`, used by `unit-prompt-capture.mjs:49-68`).
   - TDD in the bridge's unit tests: flip `unit-agent-start-capture-gaps.mjs:104-117` to assert forwarding, and add no-addition and no-duplication cases.
   - Run `pnpm --dir pi-packages/pi-claude-bridge run test:unit` and `typecheck`.
   - The AC-5 smoke must load this worktree's bridge (`pi-packages/pi-claude-bridge/src/index.ts`), not the C:\DEV checkout.

Verification seams: focused vitest on the prompt, adapter and sdd tests; `pnpm run check:ci`, `typecheck`, `build` and `test`; `integration:verify`; the live smoke; a fresh Oracle on the diff.

## Tasks

- [x] AC-1: Canonical default-first ownership policy with coordinator identity and no optional phrasing, rendered in all harnesses
  - Outcome: rendered root prompts for the four harnesses meet AC-1 to AC-3 text requirements, from a single canonical source
  - Known entrypoints and skill paths: src/harness/core/agent-pack.ts (:255-270, :320-350), src/agents/prompt-sections.ts (:150-236), src/agents/orchestrator.ts, src/harness/adapters/{opencode,codex,claude-code,pi}.ts, src/harness/core/sdd.ts:396, skills/thoth-sdd/SKILL.md (:20-60), C:\Users\EremesNG\.pi\agent\skills\tdd\SKILL.md
  - Inputs: this record's Exploration and Plan steps 1-3 and 5
  - Dependencies: none
  - Output: source edits plus TDD regressions
  - Owner: thoth-worker
  - Writes: src/harness/core/agent-pack.ts, src/agents/prompt-sections.ts, src/agents/orchestrator.ts, src/harness/core/sdd.ts, skills/thoth-sdd/SKILL.md, src/agents/prompt-rendering.test.ts, src/agents/index.test.ts, src/harness/core/agent-pack.test.ts, src/harness/core/agent-routing.test.ts, src/harness/core/sdd.test.ts, src/harness/adapters/*.test.ts, src/cli/codex-install.test.ts
  - Interface boundaries: custom `orchestrator.prompt` replacement stays supported; the lifecycle, memory, planning-choice and recovery sections are unchanged
  - Focused check and PASS evidence: RED then GREEN for `pnpm exec vitest run src/agents src/harness --exclude src/harness/generate-integration-packages.test.ts` (generated-output sync is checked by AC-4); `pnpm run typecheck` passes
  - Return milestone: tests green with the RED evidence summarized
  - Stop / reassessment: a test or contract outside the owned writes needs changing, or wording conflicts with a `.thoth/specs` requirement
- [x] AC-2: Broadened Explorer trigger with no-preliminary-discovery and pre-first-tool self-check in the canonical policy and rendering
  - Outcome: rendered prompts for the four harnesses contain the broadened trigger and self-check; regression asserts it
  - Known entrypoints and skill paths: same as the first AC-1 row
  - Inputs: Plan steps 1, 2 and 5
  - Dependencies: none; same cohesive worker assignment as the first AC-1 row (one policy block, one writer)
  - Output: canonical entries plus regression assertions
  - Owner: thoth-worker (same assignment as AC-1)
  - Writes: same as the first AC-1 row
  - Interface boundaries: same as the first AC-1 row
  - Focused check and PASS evidence: the trigger and self-check assertions go RED then GREEN in `pnpm exec vitest run src/agents src/harness --exclude src/harness/generate-integration-packages.test.ts` (generated-output sync is checked by AC-4)
  - Return milestone: with the AC-1 return
  - Stop / reassessment: same as the first AC-1 row
- [x] AC-3: Navigation-precedence rule in the canonical policy and rendering
  - Outcome: rendered prompts state that project navigation rules govern the assigned investigator and never make root the investigator
  - Known entrypoints and skill paths: same as the first AC-1 row
  - Inputs: Plan steps 1, 2 and 5
  - Dependencies: none; same cohesive worker assignment as the first AC-1 row
  - Output: canonical entry plus regression assertion
  - Owner: thoth-worker (same assignment as AC-1)
  - Writes: same as the first AC-1 row
  - Interface boundaries: CodeGraph-first and webstorm-index rules for investigators are preserved
  - Focused check and PASS evidence: the precedence assertion goes RED then GREEN in `pnpm exec vitest run src/agents src/harness --exclude src/harness/generate-integration-packages.test.ts` (generated-output sync is checked by AC-4)
  - Return milestone: with the AC-1 return
  - Stop / reassessment: same as the first AC-1 row
- [x] AC-4: Regenerated integration assets and documentation consistent with the canonical policy
  - Outcome: plugin/ and pi/ generated assets and docs match the new policy
  - Known entrypoints and skill paths: package.json scripts integration:sync and integration:verify, plugin/, pi/, docs/agent/routing-cases.json, docs/agent/agents-and-delegation.md
  - Inputs: accepted output of the first unit
  - Dependencies: first AC-1 unit accepted
  - Output: regenerated assets and doc alignment
  - Owner: thoth-worker (same session continuation is not allowed; fresh run)
  - Writes: plugin/**, pi/**, docs/agent/routing-cases.json, docs/agent/agents-and-delegation.md, AGENTS.md (only if it contradicts the new text)
  - Interface boundaries: generated files only through the sync script
  - Focused check and PASS evidence: `pnpm run integration:verify`, src/harness/generate-integration-packages.test.ts, `pnpm run check:ci` and `pnpm test` pass
  - Return milestone: verify and the full suite are green
  - Stop / reassessment: generator output changes unrelated files
- [x] AC-6: pi-claude-bridge forwards extension-added system-prompt prose
  - Outcome: the outgoing Claude Code append includes prose that extensions added through before_agent_start, exactly once, with no change for prompts without additions
  - Known entrypoints and skill paths: pi-packages/pi-claude-bridge/AGENTS.md, pi-packages/pi-claude-bridge/src/index.ts (:1885-1900, :2045-2055, :2478-2525), pi-packages/pi-claude-bridge/src/prompt-capture.ts (:130-145, :330-345), pi-packages/pi-claude-bridge/tests/unit-agent-start-capture-gaps.mjs (:104-117), pi-packages/pi-claude-bridge/tests/unit-prompt-capture.mjs (:49-68), C:\Users\EremesNG\.pi\agent\skills\tdd\SKILL.md
  - Inputs: the root-cause evidence in Exploration and Plan step 7
  - Dependencies: none (independent of the AC-1 to AC-4 surfaces)
  - Output: bridge source change plus unit regressions
  - Owner: thoth-worker
  - Writes: pi-packages/pi-claude-bridge/src/**, pi-packages/pi-claude-bridge/tests/unit-*.mjs, pi-packages/pi-claude-bridge/CHANGELOG.md
  - Interface boundaries: the preset `claude_code` request shape, prompt-capture diagnostics, sub-agent inherited-prompt handling and cache behavior are preserved
  - Focused check and PASS evidence: RED then GREEN for `pnpm --dir pi-packages/pi-claude-bridge run test:unit`; `pnpm --dir pi-packages/pi-claude-bridge run typecheck` passes
  - Return milestone: unit tests green with the RED evidence summarized
  - Stop / reassessment: the fix requires changing Pi itself, integration tests that need live credentials, or unrelated bridge behavior
- [x] AC-5: Live Pi behavioral smoke shows Explorer dispatch before root discovery
  - Outcome: recorded first-tool-call order from a real Pi session using this worktree's build
  - Known entrypoints and skill paths: dist/pi.js after `pnpm run build`; Pi session JSONL under ~/.pi/agent/sessions
  - Inputs: accepted AC-4 unit
  - Dependencies: AC-4 and AC-6 units accepted; run with this worktree's dist/pi.js, pi-packages/pi-subagents and pi-packages/pi-claude-bridge, on claude-bridge/claude-opus-5-5 at medium thinking (the failing configuration), plus one openai-codex control
  - Output: model name, prompt, and ordered list of the root's first tool calls, summarized in Verification
  - Owner: root (runs the host command; Oracle judges)
  - Writes: none in the repository (scratch directory in a temp folder only)
  - Interface boundaries: must not modify global Pi settings; use a temporary `PI_CODING_AGENT_DIR` and per-run `--no-extensions` plus explicit `-e` for this worktree dist/pi.js and the delegation extension, because src/pi.ts:100-104,204-212 otherwise syncs global specialist files
  - Focused check and PASS evidence: the first root tool call is `subagent_run` with thoth-explorer
  - Return milestone: one smoke run completed and recorded
  - Stop / reassessment: Pi cannot load a per-run extension without changing global settings, in which case return to the user for a decision

## Authorization

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

## Verification

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 9357de8032d1c0782b273a436c2cd856325d59537c190b0bc6b3124de53b7429

- AC-1: PASS | four-harness rendering tests and forbidden-phrase scan | coordinator identity and specialist-default rule precede bounded exceptions; prohibited phrases absent from shipped sources and assets
- AC-2: PASS | prompt and adapter regressions | agent-pack.ts:264-267 covers search, reads, shell/git, CodeGraph, no preliminary discovery and the pre-tool self-check
- AC-3: PASS | canonical and rendered policy inspection | agent-pack.ts:266-271 keeps investigator-owned navigation and the bounded known-source exception
- AC-4: PASS | single-source inspection, integration:verify, generator test, full suite 1237/1237 | rendering consumes the canonical policy; plugin and pi assets synchronized; SDD wording aligned
- AC-5: PASS | live Pi smoke JSONL inspected by Oracle | sessions 20-17-12 and 20-17-30 (claude-bridge/claude-opus-5-5 medium, repaired bridge): first root toolCall is subagent_run thoth-explorer; baseline 19-40-33 failed with grep, read, read; Codex controls dispatched
- AC-6: PASS | bridge test:unit 338/338, typecheck, nine offline SDK-request probes | extension prose forwarded once, including the actual 20,015-char thoth suffix; replacements do not duplicate configured parts; no-addition output byte-identical; force restore safe on throw
- Source: .thoth/specs/agent-delegation/spec.md | sha256:c07c0c9999d72c08e497609c7d6608404dae4efd445b539e273e77acc0cd7455

## Closeout

**Archive**: READY

- Authorization provenance: the user explicitly chose Implement after the first OKAY (AC-1 to AC-4), and again after the reopened OKAY (AC-6, AC-5) on 2026-10-03.
- Final review: fresh read-only Oracle run subtask_thoth-oracle_1791058686915_70e3df50 returned PASS, after the FAIL from subtask_thoth-oracle_1791057806515_4720585f was repaired.
- Out of scope: rebuilding and deploying C:\DEV\Proyectos\Webstorm\thoth-agents, which Pi loads globally; that needs a separate decision.
