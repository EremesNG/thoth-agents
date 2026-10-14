# Change: pi-notify-orchestrator

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: low
**Risk**: medium

## Exploration

Paths under `pi-packages/pi-subagents/` unless rooted otherwise.

- `ask_orchestrator` (`src/runner/orchestrator-tool.ts:5,14,24`) carries both
  `kind: "question"` (blocking, answered by root `subagent_reply`) and
  `kind: "progress"` (non-blocking, recorded via `manager.reportProgress`,
  `src/manager.ts:965–984`, latest five kept, no root turn). It is injected into
  every child (`src/runner/sdk-runner.ts:79–105,497`) unless
  `enable_ask_orchestrator` is false or the definition denies it; Oracle denies it
  (`src/harness/writers/pi-agent.ts:46–55`), so Oracle cannot report progress.
- One combined orchestrator channel exists only when ask is enabled
  (`src/manager.ts:2068–2080`); progress is unavailable whenever ask is disabled.
- Timeout checkpoint steering (`src/manager.ts:1365–1374`) is gated only on
  `enable_ask_orchestrator` and asks for `ask_orchestrator({ kind: "progress" })`,
  so a child without the tool (Oracle) still receives a useless steering message.
  The manager receives dropped tools from the runner
  (`src/runner/sdk-runner.ts:711–715,758–763`) but no verified active-tool set.
- Progress consumers (task updates, timeout context, attention, completion,
  history, widget) consume the stored progress list, independent of transport.
- Generated Pi definitions and prompts (`src/harness/adapters/pi.ts:73–108`,
  `src/harness/writers/pi-agent.ts`, committed `pi/agents/*.md` via
  `src/harness/generate-integration-packages.ts`) describe the combined channel
  for four roles and omit it for Oracle. Docs: package README,
  `skills/subagents-configuration/SKILL.md`, `docs/agent/harness-packaging.md`,
  `docs/installation.md`, `docs/skills-and-mcps.md`, root `README.md`.
- `thoth-agents.schema.json` is generated from the OpenCode config, not Pi
  subagents config; other harnesses have no literal `ask_orchestrator`.

## Intent

Split the child-to-root channel: `ask_orchestrator` becomes questions-only and a
new child tool `notify_orchestrator` sends one-way information to the
orchestrator without waiting for a reply (today's progress behavior). Every Thoth
role, including Oracle, receives `notify_orchestrator`; Oracle keeps
`ask_orchestrator` denied. Timeout checkpoint steering is sent only to children
whose verified tool selection contains `notify_orchestrator` and references it.

## Non-goals

- Changing question semantics, `subagent_reply`, ask timeouts, or the outbox.
- New one-way message kinds beyond progress/checkpoint information.
- Non-Pi harness behavior.
- Backward compatibility for `ask_orchestrator({ kind: "progress" })`.

## Acceptance

- AC-1: `ask_orchestrator` accepts only a question (`{ message }`, no `kind`), still blocks until the root's `subagent_reply`, and is unavailable when `enable_ask_orchestrator` is false or denied.
- AC-2: `notify_orchestrator({ message })` is injected into every child unless `enable_notify_orchestrator` (default `true`, global/project cascade) is false or the definition denies it; it returns immediately, records the message as a task progress update (latest five, no root turn) and works independently of the ask flag; it is `model-only` (not callable from codemode scripts).
- AC-3: Timeout checkpoint steering is sent only when the child's verified tool selection includes `notify_orchestrator`, and its text references `notify_orchestrator`; attention, extension, handoff and partial context behave as before.
- AC-4: Generated Thoth Pi definitions and prompts give all five roles `notify_orchestrator` guidance; only Oracle denies `ask_orchestrator`; question guidance stays on the four non-Oracle roles; committed `pi/agents` artifacts are regenerated.
- AC-5: Tools panel, README, subagents-configuration skill and docs describe both tools and the new flag accurately.

## Clarifications

- Progress kind removed from `ask_orchestrator` (user choice).
- Tool name `notify_orchestrator`, generic for future one-way uses (user choice).
- All five roles receive it, Oracle included (user choice).
- Own flag `enable_notify_orchestrator`, default true (user choice).

## Decisions

- Both tools take `{ message }` only; no speculative `kind` field.
- "Actually active" for steering means the resolved child selection after registry verification (not dropped); the runner reports this to the manager per attempt.
- `notify_orchestrator` is `model-only`, matching `ask_orchestrator`.
- Progress storage, rendering, history and timeout context are reused unchanged.
- Notify availability is unknown until the runner reports the verified selection for the current attempt; unknown counts as unavailable, and availability resets on each continuation attempt.
- Plan review round 1 (REJECT): regeneration also writes tracked provenance `pi/.thoth-agents-assets.json` and other generated trees. Resolution: the product unit owns the provenance file and runs the repository generator; any other generated tree it touches must come out byte-identical (no non-Pi drift), checked by `git diff --exit-code` on those trees and the generation golden/provenance tests.

## Durable deltas

- `MODIFIED multi-harness-agent-pack` **Keep Pi progress session-owned** — Pi root instructions MUST use the session-local task-list tool for useful multi-step progress, with the extension owning session-local task state. That tool MUST NOT replace Pi-native delegation lifecycle or canonical `.thoth/` project artifacts; child agents MUST report progress to root, and Thoth-generated Pi child definitions MUST use explicit tool lists that omit that tool, while operators whose selections use globs deny it through `disallowed_tools`. A child MAY report interim progress through `notify_orchestrator`, which records it on its task without triggering a root turn or waiting for a reply; otherwise it reports through its return contract.
  - GIVEN a Thoth-generated child with its default explicit tool list and the task-list tool active in the root; WHEN it launches and later has progress; THEN the task-list tool is absent from the child, and its `notify_orchestrator` update is recorded on its task without triggering a root turn .
- `MODIFIED multi-harness-agent-pack` **Pi children query the root orchestrator** — When enabled, every Pi child whose definition does not list it in `disallowed_tools` receives `ask_orchestrator` regardless of its tool selection form and may pose to its owning root a blocking question, continuing in the same live session with the root's `subagent_reply` answer; `ask_orchestrator` carries questions only. Independently, when `enable_notify_orchestrator` is enabled, every child whose definition does not deny it receives `notify_orchestrator`, a one-way message to its owning root that returns immediately and does not trigger a root turn. Pi agent definitions MAY declare `disallowed_tools`, exact tool names removed after `tools` resolution for every selection form including injected tools, while the native `subagent_*` exclusions always apply; denied names that are not installed are ignored and malformed values fail closed. Explicit exact-name `tools` lists are the default; globs, including `*`, are manual selections over all registered root tools, and `disallowed_tools` is edited manually in the definition file for injected tools and glob trimming. Pi agent definition frontmatter MUST parse as strict YAML; a definition that does not fails to load with a diagnostic and does not fall back to a lower-priority definition. Frontmatter is restricted to plain scalars, sequences and mappings; anchors, aliases, merge keys and explicit tags are errors. A definition's identity is its filename; a `name` that differs from it is an error. Selection-dependent wording elsewhere means this effective permitted selection. Thoth's generated specialist definitions use explicit tool lists, and only Oracle's declares `disallowed_tools`, denying `ask_orchestrator` to preserve independent judgment while keeping `notify_orchestrator`; children still never delegate.
  - GIVEN `enable_ask_orchestrator` and `enable_notify_orchestrator` true and Thoth-generated worker and Oracle definitions; WHEN both launch; THEN both receive `notify_orchestrator`, only the worker receives `ask_orchestrator`, Oracle's definition is the only one declaring `disallowed_tools`, and the worker's question returns the root's `subagent_reply` answer to that same child tool call .
- `MODIFIED multi-harness-agent-pack` **Pi subagent timeout attention and extension** — The Pi subagent runtime MUST warn the owning root before a running child reaches its total execution deadline with progress context, MUST first hand off every blocking task-mode call of the same parent session to background when the warned child runs in task mode, MUST ask the child to checkpoint through `notify_orchestrator` only when that tool is in the child's verified selection, MUST let the root extend the deadline only through `subagent_extend` within a configurable hard total ceiling and extension count, and MUST include available partial progress context in the terminal result of a total timeout.
  - GIVEN a running Pi child in task or background mode approaching its deadline; WHEN the warning lead is reached; THEN task-mode calls of that parent session return as background handoffs, a checkpoint request is sent only if the child has `notify_orchestrator`, the root receives one attention notification with progress context and may call `subagent_extend`, bounded by `max_total_timeout_ms` and `max_timeout_extensions`, otherwise the ceiling applies and the timeout result carries the latest checkpoint and preview .
- `MODIFIED multi-harness-agent-pack` **Configure adopted Pi subagents natively** — Pi MUST expose /subagents-model using native profiles and /subagents-tools using the same shared list-editor shell with safe tool persistence, both registered by pi-subagents; /subagents-tools MUST persist only the definition `tools` field generically and MAY receive reset defaults and managed-file ownership validation from a registered adapter, which thoth-agents provides for its managed specialist definitions; the former Thoth model/tools commands and fork-owned SDD workflow MUST be absent. The tools panel MUST edit exact tool names only, list the root's registered tools (active and inactive) and the child-provided `ask_orchestrator` and `notify_orchestrator`, offer no dynamic `*` mode, reject `@active`, and preserve glob entries and unrecognized names unchanged on save. Tool selections MAY contain globs, where `*` is an ordinary glob; every glob expands against the root's registered tools, active and inactive, excluding the native `subagent_*` tools and the definition's `disallowed_tools`. Explicitly selected tools MUST reach the child even when inactive in the root, unless removed by configuration, `disallowed_tools` or native exclusions. Existing explicit configurations, defaults, reserved controls, save/cancel, stale/partial recovery and unrelated fields MUST remain protected. Synchronization MUST preserve operator tool selections including globs and an operator-set `disallowed_tools`, and child launch MUST resolve its current inventory; for every selection form, selected tools without a child implementation MUST be dropped and reported as a durable warning visible on the running task's widget card and on its status, result and completion, and launch MUST fail with a truthful missing-implementation diagnostic only when no selected tool remains. When thoth-agents and pi-subagents versions do not form a supported pair for /subagents-tools ownership, the user MUST receive a truthful diagnostic with upgrade guidance instead of silent command loss.
  - GIVEN exact names and globs including `*` and `agent_browser_*`, with root tools that are inactive or lack a child implementation, and pi-subagents with or without the Thoth adapter; WHEN the panel saves, synchronization runs and a child launches; THEN only the `tools` field changes, exact names and globs persist unchanged, globs include root-inactive registered tools minus `subagent_*` and `disallowed_tools`, missing implementations are dropped and reported, the child fails only when nothing remains, and reset-to-defaults is offered only when the adapter supplies defaults .
- `MODIFIED pi-ecosystem` **Codemode delegation boundary** — Thoth delegation controls, the child `ask_orchestrator` and `notify_orchestrator` tools and `ask_user_question` are `model-only` direct calls that codemode scripts cannot invoke, and root guidance directs batching only of script-callable work.
  - GIVEN codemode is active in mode `on` or `only`; WHEN the root delegates, replies to a child or asks the user, or a child asks or notifies the orchestrator; THEN those are direct tool calls that scripts cannot invoke, and independent reads, research or memory calls may be batched in one script .

## Plan

Runtime (pi-subagents): split `src/runner/orchestrator-tool.ts` into a
questions-only `ask_orchestrator` and a new `notify_orchestrator` (both
`{ message }`, model-only); add `enable_notify_orchestrator` to `SubagentsConfig`
and the cascade (default true); split the manager channel so notify works with
ask disabled; inject notify in `resolveConfiguredTools` with the same
deny/disable rules; have the runner report whether `notify_orchestrator` is in the
verified selection; gate checkpoint steering on that and update its text; list
notify in the tools panel. Product (thoth-agents): give all five generated
definitions notify guidance, keep question guidance off Oracle, regenerate
`pi/agents`. Docs per AC-5. Test-first with existing suites (config, manager,
timeout-attention, runner tool-selector/real-SDK, interaction-bridge,
tools-panel, adapters/pi, writers/pi-agent, generate-integration-packages).

## Tasks

- [x] AC-1: Questions-only ask_orchestrator
  - Outcome: ask tool schema/handler carry only questions; question lifecycle unchanged
  - Known entrypoints and skill paths: pi-packages/pi-subagents/src/runner/orchestrator-tool.ts, src/manager.ts:844–914,2068–2080, src/types.ts; skills tdd, simplify
  - Inputs: Exploration evidence
  - Dependencies: none
  - Output: runtime change plus tests
  - Owner: thoth-worker
  - Writes: pi-packages/pi-subagents/src/**, pi-packages/pi-subagents/test/**
  - Interface boundaries: subagent_reply, question outbox
  - Focused check and PASS evidence: manager and orchestrator runner tests pass
  - Return milestone: single runtime worker assignment complete
  - Stop / reassessment: question lifecycle requires changes beyond schema split
- [x] AC-2: notify_orchestrator tool, flag and injection
  - Outcome: notify injected per flag/denial, records progress, independent of ask, model-only
  - Known entrypoints and skill paths: src/runner/orchestrator-tool.ts, src/runner/sdk-runner.ts:79–138,497,711–763, src/config.ts:473–538, src/types.ts:92–93,451, src/manager.ts:965–984,2068–2080, src/tools-panel/panel.ts:36,58
  - Inputs: AC-1 implementation
  - Dependencies: AC-1 unit
  - Output: runtime change plus tests (config cascade, injection/denial, ask-disabled notify, panel note)
  - Owner: thoth-worker
  - Writes: pi-packages/pi-subagents/src/**, pi-packages/pi-subagents/test/**
  - Interface boundaries: progress storage/rendering unchanged; codemode model-only boundary
  - Focused check and PASS evidence: config, tool-selectors, interaction-bridge, panel tests pass
  - Return milestone: same runtime worker assignment
  - Stop / reassessment: verified selection cannot be reported without changing runner contracts beyond adding a field
- [x] AC-3: Checkpoint steering gated on verified notify
  - Outcome: steering only with verified notify, text references it
  - Known entrypoints and skill paths: src/manager.ts:1365–1374, src/runner/sdk-runner.ts:758–763, test/timeout-attention.test.ts
  - Inputs: AC-2 implementation
  - Dependencies: AC-2 unit
  - Output: gated steering plus tests (with/without notify, Oracle-like denial, unknown availability before readiness, reset on continuation)
  - Owner: thoth-worker
  - Writes: pi-packages/pi-subagents/src/**, pi-packages/pi-subagents/test/**
  - Interface boundaries: attention/handoff/extension behavior unchanged
  - Focused check and PASS evidence: timeout-attention and notification-outbox tests pass
  - Return milestone: same runtime worker assignment
  - Stop / reassessment: gating requires runner timing changes
- [x] AC-5: pi-subagents docs
  - Outcome: README and subagents-configuration skill describe both tools and flag
  - Known entrypoints and skill paths: pi-packages/pi-subagents/README.md, pi-packages/pi-subagents/skills/subagents-configuration/SKILL.md
  - Inputs: AC-1–AC-3 implementation
  - Dependencies: AC-3 unit
  - Output: updated docs
  - Owner: thoth-worker
  - Writes: pi-packages/pi-subagents/README.md, pi-packages/pi-subagents/skills/subagents-configuration/SKILL.md
  - Interface boundaries: none
  - Focused check and PASS evidence: no remaining `kind: "progress"` references; check:ci pass
  - Return milestone: same runtime worker assignment
  - Stop / reassessment: none
- [x] AC-4: Generated definitions and prompts
  - Outcome: five roles get notify guidance, Oracle keeps ask denial, pi/agents regenerated
  - Known entrypoints and skill paths: src/harness/adapters/pi.ts:47–108, src/harness/writers/pi-agent.ts:28–55, src/harness/generate-integration-packages.ts, pi/agents/*.md, src/harness/adapters/pi.test.ts, src/harness/writers/pi-agent.test.ts, src/harness/generate-integration-packages.test.ts
  - Inputs: tool name and semantics from Decisions
  - Dependencies: none (runtime-independent text and generation)
  - Output: product change, regenerated artifacts, tests
  - Owner: thoth-worker
  - Writes: src/harness/**, pi/agents/**, pi/.thoth-agents-assets.json, docs/agent/harness-packaging.md, docs/installation.md, docs/skills-and-mcps.md, README.md; generator-run outputs elsewhere only if byte-identical
  - Interface boundaries: non-Pi harness output unchanged; package verification of specialist hashes against provenance
  - Focused check and PASS evidence: adapter, writer and generation golden/provenance tests pass; after regeneration `git diff --exit-code` is clean for every generated tree other than pi/agents and pi/.thoth-agents-assets.json
  - Return milestone: product worker assignment complete
  - Stop / reassessment: shared prompt sections for other harnesses would need changes

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
Round 1 REJECT (unowned generated provenance) repaired; round 2 fresh Oracle OKAY, envelope validated.
**Implementation**: AUTHORIZED

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 87350ba1fe3c9f98edf2ac272e06397a0fb795b802314aa909acfc04f32ad70c

Fresh Oracle PASS on the first final round; envelope validated with --record-sha256. Five pre-existing root test failures (verified at HEAD ccbf891) are outside this change.

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS: AC-1 through AC-5 are satisfied. No change-induced regression, material race, leak, scope creep, or non-Pi generated drift found. The five root test failures match the known baseline.",
  "evidence": [
    {
      "id": "record",
      "kind": "validation",
      "locator": ".thoth/changes/pi-notify-orchestrator/pi-notify-orchestrator.md",
      "claim": "Independent prefix SHA-256 matches 87350ba1fe3c9f98edf2ac272e06397a0fb795b802314aa909acfc04f32ad70c; installed validate.mjs --through verify succeeds.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "runtime-tests",
      "kind": "execution",
      "locator": "pi-packages/pi-subagents: pnpm exec vitest run; pnpm run typecheck",
      "claim": "86 test files passed; 1621 tests passed and 1 skipped. Typecheck exited 0.",
      "basis": "observed",
      "uncertainty": "The skipped test was not exercised."
    },
    {
      "id": "channels",
      "kind": "code-and-tests",
      "locator": "pi-packages/pi-subagents/src/runner/orchestrator-tool.ts; src/manager.ts:844–984; test/runner/orchestrator-real-sdk.test.ts; test/manager.test.ts",
      "claim": "Both schemas accept message only and reject additional properties. Ask awaits the existing question/reply lifecycle; notify records synchronously without awaiting root. Latest-five retention and absence of parent question delivery are tested with ask disabled.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "selection",
      "kind": "code-and-tests",
      "locator": "pi-packages/pi-subagents/src/config.ts; src/runner/sdk-runner.ts; test/config.test.ts; test/runner/tool-selectors-real-sdk.test.ts",
      "claim": "Notify defaults true, cascades global/project configuration, and is injected independently of ask. Disabled and denied names are removed even when explicitly selected. Real SDK tests establish direct invocation and rejection from codemode scripts.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "checkpoint",
      "kind": "code-and-tests",
      "locator": "pi-packages/pi-subagents/src/manager.ts:1362–1384,1716–1720,1937–1941,2137–2143; src/runner/sdk-runner.ts:741–777; test/timeout-attention.test.ts; test/runner/interaction-bridge.test.ts",
      "claim": "Checkpoint steering requires verified notify availability and references notify. Tests cover dropped, denied, disabled, unknown and continuation-reset availability. Existing deadline-generation guards, handoff barriers, attention, extension and partial-context tests pass; continuation awaits prior runner cleanup.",
      "basis": "observed",
      "uncertainty": "Checkpoint delivery remains intentionally best-effort."
    },
    {
      "id": "generated",
      "kind": "artifact-verification",
      "locator": "src/harness/adapters/pi.ts; pi/agents/thoth-*.md; pi/.thoth-agents-assets.json",
      "claim": "All five files exactly match current adapter output and provenance hashes. All contain notify guidance; only Oracle denies ask, and Oracle has no ask-call guidance. Frontmatter is unchanged from HEAD. Non-Pi generated trees have no diff.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "docs",
      "kind": "diff-review",
      "locator": "README.md; docs/agent/harness-packaging.md; docs/installation.md; docs/skills-and-mcps.md; pi-packages/pi-subagents/README.md; skills/subagents-configuration/SKILL.md; src/tools-panel/panel.ts",
      "claim": "Documentation and panel notes correctly distinguish the channels, independent flags, denial rules and model-only boundary. No operational kind: progress usage remains; the active-code match is a negative assertion. Historical governance text is preserved.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "root-tests",
      "kind": "execution",
      "locator": "root: requested focused Vitest command",
      "claim": "33 files passed and 5 failed; 776 tests passed, 5 failed and 5 skipped. Failures are exactly the reported adapter, memory-governance, OpenCode Oracle size, pi-tool-config defaults and pi-resources defaults failures. Windows EPERM cleanup failures did not reproduce.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "baseline",
      "kind": "baseline-comparison",
      "locator": "HEAD ccbf891afad4c3064a03bf39072c10cf632352a3 versus working tree",
      "claim": "Failing memory, agent and CLI source/tests are byte-identical to HEAD. Pi root rendering and its failing assertion block are unchanged; generated frontmatter defaults are unchanged. Thus the five failure causes are not introduced or altered by this diff, although intentionally updated child guidance appears in diagnostic bodies.",
      "basis": "inferred",
      "uncertainty": "HEAD tests were not independently reexecuted; attribution uses unchanged failure inputs and matching reported baseline results."
    },
    {
      "id": "checks",
      "kind": "execution",
      "locator": "root: pnpm run check:ci; pnpm run typecheck; git diff --check; git status",
      "claim": "All three checks exited 0. Biome emitted warnings/information, not errors. Working-tree scope remained unchanged. Reviewed tracked binary diff plus untracked orchestrator-tool test SHA-256: 022c62a5716cf657eb3c58b63aeb247ed4fb3bf8fbce453564c9f715d536f20d.",
      "basis": "observed",
      "uncertainty": ""
    }
  ],
  "verification": [
    {
      "check": "Record binding and verify gate",
      "method": "Independent exact-byte prefix hashing and installed validator",
      "outcome": "pass",
      "evidenceIds": ["record"],
      "reason": "Digest matches the assignment and structural validation succeeds."
    },
    {
      "check": "AC-1: questions-only ask and preserved reply lifecycle",
      "method": "Schema/handler review and complete runtime suite",
      "outcome": "pass",
      "evidenceIds": ["channels", "selection", "runtime-tests"],
      "reason": "Message-only schema, blocking replies and disable/denial behavior are established."
    },
    {
      "check": "AC-2: independent one-way notify",
      "method": "Config, manager and real-SDK selection/codemode checks",
      "outcome": "pass",
      "evidenceIds": ["channels", "selection", "runtime-tests"],
      "reason": "Independent injection, immediate acknowledgement, bounded progress storage and model-only exposure hold."
    },
    {
      "check": "AC-3: verified checkpoint steering",
      "method": "Availability-flow and cleanup review plus timeout/bridge tests",
      "outcome": "pass",
      "evidenceIds": ["checkpoint", "runtime-tests"],
      "reason": "Unavailable or unknown notify cannot trigger checkpoint steering; continuation resets availability."
    },
    {
      "check": "AC-4: generated definitions and provenance",
      "method": "Direct adapter-output equality, SHA-256 checks and generated-tree diff checks",
      "outcome": "pass",
      "evidenceIds": ["generated"],
      "reason": "Five roles receive notify; Oracle remains ask-independent; artifacts and provenance agree."
    },
    {
      "check": "AC-5: documentation and panel accuracy",
      "method": "Actual diff review and stale-call search",
      "outcome": "pass",
      "evidenceIds": ["docs", "runtime-tests"],
      "reason": "Public guidance accurately describes the split and configuration."
    },
    {
      "check": "Required root focused Vitest run",
      "method": "Execute the assigned command",
      "outcome": "fail",
      "evidenceIds": ["root-tests", "baseline"],
      "reason": "Five known baseline failures remain; none is attributable to this change."
    },
    {
      "check": "Typechecks, check:ci and whitespace",
      "method": "Execute all assigned static checks",
      "outcome": "pass",
      "evidenceIds": ["runtime-tests", "checks"],
      "reason": "Runtime/root typechecks, Biome and diff whitespace checks exit 0."
    },
    {
      "check": "Built/packed release validation",
      "method": "Not executed",
      "outcome": "not-run",
      "evidenceIds": [],
      "reason": "Review remained read-only; no build or packaging operation that writes workspace outputs was run."
    }
  ],
  "risks": [
    {
      "description": "The root focused suite remains red on five pre-existing assertions. This PASS is acceptance of the reviewed change, not a claim that the repository baseline is green.",
      "severity": "medium",
      "blocking": false,
      "evidenceIds": ["root-tests", "baseline"]
    }
  ],
  "openQuestions": [],
  "nextAction": "Root should validate this unchanged envelope, record acceptance evidence, run closeout, and archive only if inputs remain unchanged.",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/pi-notify-orchestrator/pi-notify-orchestrator.md",
    "reviewedRecordSha256": "87350ba1fe3c9f98edf2ac272e06397a0fb795b802314aa909acfc04f32ad70c"
  }
}
```

- AC-1: PASS | pi-subagents vitest (1621 passed) | message-only questions-only ask; reply lifecycle unchanged
- AC-2: PASS | config, manager, tool-selectors real-SDK tests | notify injected per own flag/denial, immediate, latest-five progress, model-only
- AC-3: PASS | timeout-attention, interaction-bridge tests | steering only with verified notify; dropped/denied/disabled/unknown/continuation reset covered
- AC-4: PASS | adapter test + output/provenance equality | five roles notify guidance, Oracle only ask denial, no non-Pi drift
- AC-5: PASS | diff review + stale-call search | README, skill, docs and panel describe both tools and flag
- Source: .thoth/specs/multi-harness-agent-pack/spec.md | sha256:f880c6499614cb10cf37d80a634ffb9d5b10eeb7b0abcf4fb418a0784064cb2b
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:2d5f3688e05e8cd1f46f679ec445b0a7920828e2b4274e828187b54f890b04f6

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
