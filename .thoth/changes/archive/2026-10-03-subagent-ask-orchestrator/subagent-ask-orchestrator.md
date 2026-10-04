# Change: subagent-ask-orchestrator

**Classification**: substantial
**Scope**: cross-cutting
**Uncertainty**: medium
**Risk**: medium

## Exploration

- Reference design (external, nicobailon/pi-subagents 0.75.0 @ `33f427fcf707ac32bae32c833a14cc155afc9b58`,
  `src/intercom/native-supervisor-channel.ts`): child tool `contact_supervisor`
  (`reason: need_decision | interview_request | progress_update`, `message`) blocks
  until the parent replies through `subagent_supervisor({ action: "reply", replyTo, message })`.
  The parent is notified with `pi.sendMessage(..., { triggerTurn: true })`; progress
  updates do not trigger a turn. Foreground runs detach to background so the parent
  can answer. Filesystem mailbox, 250 ms polling, 10 min default reply timeout, abort
  on cancellation, multiple outstanding requests correlated by UUID.
- Local `pi-packages/pi-subagents` today:
  - Children are in-process SDK sessions (`src/runner/sdk-runner.ts::createSession`,
    `createAgentSession({ cwd, model, thinkingLevel, tools, sessionManager })`). The
    installed SDK (`@earendil-works/pi-coding-agent` 0.99.1, peer `>=0.99.0`) supports
    `customTools?: ToolDefinition[]`, currently unused.
  - `verifyChildToolSelection` rejects any registered child tool that is not in the
    verified selection; `tool-patterns.ts::expandToolPatterns` strips `subagent_*`,
    `ask_user_question` and the task-list tool.
  - Parent→child: `subagent_send_message` (`manager.ts::sendMessage`, `session.steer`);
    `subagent_continue` only with `enable_continue`.
  - Child→parent: only terminal completion (`render/completion-message.ts`,
    `{ triggerTurn: true, deliverAs: 'followUp' }`) and activity projection. The
    `interaction-channel.ts` bridge asks the human through parent UI, task mode only,
    and retries the child; it is not a child→root-model channel. No child tool can
    reach the parent model.
  - Task→background handoff: `subagent-run.ts` races `runPromise` with a
    `backgroundPromise` resolved by `background-handoff-state.ts`;
    `triggerClaudeBackgroundHandoff()` targets only the latest active handoff, not a
    task id. `manager.sendToBackground(ids)` alone does not release the parent call.
  - Timeouts: `promptWithInactivity` aborts on a silent active tool after
    `stall_timeout_ms` (240000); manager total `timeout_ms` (1200000).
    Cancellation (`manager.cancel`, `close()` on session shutdown) aborts the child
    session via `createSessionAbortBridge`.
  - Config: `src/config.ts::readSubagentsConfig`, type `src/types.ts::SubagentsConfig`;
    docs in package `README.md` and `skills/subagents-configuration/SKILL.md`.
  - Task state: `SubagentTask` in `src/types.ts`; `subagent_status` /
    `subagent_list_tasks` project compact task fields.
- Thoth surfaces: `src/harness/adapters/pi.ts` (`piRuntimeGuidance`, `roleArtifacts`,
  `renderPiAgentDefinition`), `src/agents/prompt-dialects.ts` (`PI_PROMPT_DIALECT`,
  `PI_PROMPT_CAPABILITIES`), generated `pi/agents/thoth-*.md`, docs
  `docs/agent/agents-and-delegation.md`, `docs/agent/harness-packaging.md`.

## Intent

A running Pi specialist child can pose to its owning root orchestrator a blocking
question (alignment, clarification, decision) and continue with the answer inside
the same live session, repeatedly if needed; it can also send non-blocking progress
updates. The root answers through a dedicated tool and may escalate to the human
with its own question tool before answering.

## Non-goals

- Filesystem mailboxes, cross-process or cross-session answering, or answering after
  the owning parent session has ended.
- Nested supervision (children asking grandchildren) or any child delegation.
- Changing the existing human `interaction-channel` bridge.
- Equivalent capabilities in OpenCode, Codex or Claude Code harnesses.
- Structured interview payloads / JSON reply parsing.
- Package version bumps.

## Acceptance

- AC-1: When enabled, a selected child receives the in-process tool `ask_orchestrator`; calling it with `kind: "question"` blocks the child tool call until the owning parent replies and returns the reply text as the tool result, and the child can query again in the same session.
- AC-2: Each question reaches the owning parent session as an injected custom message with `triggerTurn: true` carrying task id, agent, request id and question; the parent tool `subagent_reply({ task_id, request_id?, message })` resolves exactly that outstanding request, rejects unrecognized, stale, ambiguous or foreign-session targets, and outstanding questions are visible in `subagent_status` and `subagent_list_tasks`.
- AC-3: When a task-mode child asks a question, that specific task is handed off to background and the parent's blocked `subagent_run` (or `subagent_continue`) call returns with a background result stating a question is outstanding, before the question message is delivered.
- AC-4: A outstanding question rejects with a clear child-visible error on `ask_timeout_ms` expiry (default 600000), task cancellation or parent session shutdown; the stall inactivity timer does not fire while a question is outstanding; the total `timeout_ms` still applies.
- AC-5: `ask_orchestrator` with `kind: "progress"` returns immediately, records a bounded list of recent progress messages on the task visible in status/list/UI, and does not trigger a parent turn.
- AC-6: `subagents.json` key `enable_ask_orchestrator` (default `true`) gates both the child tool and `subagent_reply`; `ask_timeout_ms` is configurable; when disabled neither tool exists; the child tool is provided only when the resolved selection names `ask_orchestrator` explicitly (standalone `*` and globs never match it) and verification accepts it then; README and the configuration skill document both keys.
- AC-7: Thoth-generated Pi definitions for explorer, librarian, designer and worker select `ask_orchestrator` with role guidance (query only for material alignment ambiguity, never as a substitute for own discovery, never to delegate); the Oracle definition does not; Pi root guidance names `subagent_reply`, allows escalation via `ask_user_question`, and states injected questions are not user messages; generated `pi/agents/thoth-*.md` and docs are updated.
- AC-8: `pnpm run check` in `pi-packages/pi-subagents`, and root `pnpm run check:ci`, `pnpm run typecheck`, `pnpm run build`, `pnpm test` pass.

## Clarifications

- Enablement default: user chose enabled by default (`enable_ask_orchestrator: true`).
- Roles: user chose all specialists except Oracle, to preserve Oracle's independent judgment.
- Scope: user chose blocking questions plus non-blocking progress updates.

## Decisions

- Transport is an in-memory outstanding-request map owned by `SubagentManager`, keyed by task id and request id (UUID); no filesystem mailbox, because children run in-process.
- Child tool is injected through SDK `customTools` in `createSession`, bound to its task id, with a single tool `ask_orchestrator({ kind: "question" | "progress", message })`.
- Tool selection: existing `*` and glob semantics are preserved. `ask_orchestrator` is child-only and is provided only when the child's resolved selection names it explicitly; standalone `*` and glob patterns never match it. `verifyChildToolSelection` treats an explicitly named, injected `ask_orchestrator` as selected-and-provided. Thoth Pi specialist defaults (`src/harness/writers/pi-agent.ts::getPiSpecialistDefaultTools`) name it for explorer, librarian, designer and worker, not Oracle; shared cross-harness role permissions are unchanged.
- Parent tool name: `subagent_reply`; registered in `registerSubagentTools` only when enabled; owner-session scoped like `subagent_send_message`. `request_id` is optional only when the task has exactly one outstanding question.
- Task-mode release uses a new task-id-targeted handoff trigger rather than the latest-active `triggerClaudeBackgroundHandoff()`.
- Question delivery uses `pi.sendMessage` with a distinct custom type (e.g. `subagent-question`) and `{ triggerTurn: true, deliverAs: 'followUp' }`, consistent with completion messages.
- Progress list is bounded (keep latest 5) and not injected into the parent conversation.
- Waiting time is excluded from stall inactivity but counts toward total `timeout_ms` (documented).

## Durable deltas

- `ADDED multi-harness-agent-pack` **Pi children query the root orchestrator** — When enabled, a Pi specialist other than Oracle may pose to its owning root a blocking question through `ask_orchestrator` and continue in the same live session with the root's `subagent_reply` answer; non-blocking progress updates do not trigger a root turn; the tool reaches a child only when its resolved selection names `ask_orchestrator` explicitly, never through standalone `*` or globs; children still never delegate.
  - GIVEN a running Pi worker child with `enable_ask_orchestrator` true; WHEN it calls `ask_orchestrator` with a question; THEN the owning root receives a turn-triggering injected question, the child waits, and the root's `subagent_reply` answer is returned to that same child tool call .
- `MODIFIED multi-harness-agent-pack` **Use Pi interactive questions truthfully** — Pi root instructions MUST use ask_user_question for material user choices, follow its supported question schema, handle unavailable UI and partial/cancelled answers truthfully, and MUST NOT infer approval from cancellation or absent answers. Pi children MUST NOT receive the interactive question tool in their allowlists and MUST route user-facing questions to the root: through `ask_orchestrator` when it is enabled and selected, otherwise through their return contract; the root decides whether to escalate to the user with ask_user_question before answering with `subagent_reply`.
  - GIVEN a child needing a user decision while `ask_orchestrator` is selected; WHEN it calls the tool; THEN the root receives the question, may escalate through ask_user_question, and replies with `subagent_reply` without the child opening user dialogs .
- `MODIFIED multi-harness-agent-pack` **Keep Pi progress session-owned** — Pi root instructions MUST use the session-local task-list tool for useful multi-step progress, with the extension owning session-local task state. That tool MUST NOT replace Pi-native delegation lifecycle or canonical `.thoth/` project artifacts; child agents MUST report progress to root and MUST NOT receive that tool in their allowlists. A child MAY report interim progress through `ask_orchestrator` progress updates, which are recorded on its task without triggering a root turn; otherwise it reports through its return contract.
  - GIVEN a child with progress and `ask_orchestrator` selected; WHEN it sends a progress update; THEN the update is recorded on its task and visible in status without triggering a root turn or editing the root task list .

## Plan

Interfaces fixed by this plan (shared between units): child tool
`ask_orchestrator({ kind: "question" | "progress", message: string })`; parent tool
`subagent_reply({ task_id: string, request_id?: string, message: string })`;
config keys `enable_ask_orchestrator` (boolean, default true) and `ask_timeout_ms`
(positive integer, default 600000); custom message type `subagent-question`.

Runtime (`pi-packages/pi-subagents`):
1. Config: parse both keys in `readSubagentsConfig`; extend `SubagentsConfig`.
2. Manager: outstanding-question registry per task (`request_id`, message, created_at),
   `askOrchestrator(taskId, message, signal)` returning a promise with timeout,
   cancellation and shutdown rejection; `replyToQuestion(sessionId, taskId,
   requestId?, message)`; bounded `progress_updates` on `SubagentTask`; outstanding
   questions projected into compact status/list details; stall timer suspended while
   a question is outstanding (via `promptWithInactivity` hook or active-tool refresh).
3. Runner: build the `ask_orchestrator` ToolDefinition bound to the task and pass it
   via `customTools`; include it in selection expansion and verification.
4. Parent tools/extension: `subagent_reply` tool; question message renderer and
   `pi.sendMessage` delivery guarded by originating parent-session identity.
5. Task mode: targeted handoff trigger keyed by task id in `background-handoff-state.ts`,
   invoked by the manager before question delivery; `subagent-run.ts` and
   `subagent-continue.ts` background result text mentions the outstanding question.
6. Docs: README configuration table and tool reference; `skills/subagents-configuration/SKILL.md`.

Thoth (`src/`): add the tool to the four non-Oracle role definitions and their
operational contract text; update `piRuntimeGuidance` / `PI_PROMPT_DIALECT` /
capability disclosure; regenerate `pi/agents/thoth-*.md`; update routed docs.

Focused seams: `test/manager.test.ts`, `test/config.test.ts`,
`test/tools/subagent-run.test.ts`, new `test/tools/subagent-reply.test.ts`,
`test/runner/tool-selectors-real-sdk.test.ts` (real SDK `customTools` path),
`test/render/*`; root `src/harness/adapters/pi.test.ts`,
`src/agents/prompt-dialects.test.ts`, `src/harness/writers/pi-agent.test.ts`.

Risks: SDK `customTools` availability at peer minimum `0.99.0` is unverified (check
and raise the peer minimum only if required); task-mode handoff ordering race;
long user escalation can hit total `timeout_ms`.

## Tasks

- [x] AC-1: Runtime blocking question channel, reply tool, lifecycle, progress and config in pi-subagents
  - Outcome: `ask_orchestrator` (question/progress) and `subagent_reply` work end to end for background tasks with timeout, cancellation, shutdown, stall suspension, status/list projection and config gating
  - Known entrypoints and skill paths: pi-packages/pi-subagents/src/{config.ts,types.ts,manager.ts,runner/sdk-runner.ts,runner/event-processing.ts,tool-patterns.ts,tools/registry.ts,tools/result-details.ts,extension/subagents-extension.ts,render/completion-message.ts}; skills C:\Users\EremesNG\.pi\agent\skills\tdd\SKILL.md, C:\Users\EremesNG\.pi\agent\skills\simplify\SKILL.md
  - Inputs: this record's Plan interfaces and Exploration facts
  - Dependencies: none
  - Output: runtime code, new `src/tools/subagent-reply.ts`, question message rendering, README and configuration-skill docs, tests
  - Owner: thoth-worker
  - Writes: pi-packages/pi-subagents/src/**, pi-packages/pi-subagents/test/**, pi-packages/pi-subagents/README.md, pi-packages/pi-subagents/skills/subagents-configuration/SKILL.md, pi-packages/pi-subagents/package.json only if the SDK peer minimum must rise
  - Interface boundaries: fixed tool names, schemas, config keys and message type above; do not touch `background-handoff-state.ts`, `subagent-run.ts`, `subagent-continue.ts` beyond what AC-3 owns
  - Focused check and PASS evidence: `pnpm run check` in pi-packages/pi-subagents passes, with new tests for AC-1, AC-2, AC-4, AC-5, AC-6 failing before and passing after
  - Return milestone: package check green with test names listed
  - Stop / reassessment: SDK `customTools` unusable, tool verification cannot accept injected tools without broad redesign, or stall suspension needs SDK changes
- [x] AC-2: Covered by the AC-1 runtime unit (reply routing, ownership checks, outstanding projection)
  - Outcome: accepted as part of the AC-1 unit result
  - Known entrypoints and skill paths: as AC-1 unit
  - Inputs: as AC-1 unit
  - Dependencies: AC-1 runtime unit
  - Output: `subagent_reply` tests and status/list projection tests
  - Owner: thoth-worker
  - Writes: as AC-1 unit
  - Interface boundaries: as AC-1 unit
  - Focused check and PASS evidence: `test/tools/subagent-reply.test.ts` and manager tests pass
  - Return milestone: with AC-1 unit
  - Stop / reassessment: as AC-1 unit
- [x] AC-3: Task-mode targeted handoff when a child asks a question
  - Outcome: the asking task alone moves to background and its blocked parent call returns before the question message is delivered
  - Known entrypoints and skill paths: pi-packages/pi-subagents/src/tools/{background-handoff-state.ts,subagent-run.ts,subagent-continue.ts}, src/manager.ts; tdd and simplify skills as above
  - Inputs: accepted AC-1 unit output (manager question API)
  - Dependencies: AC-1 runtime unit accepted
  - Output: task-id-targeted trigger, manager invocation ordering, tests
  - Owner: thoth-worker
  - Writes: pi-packages/pi-subagents/src/tools/{background-handoff-state.ts,subagent-run.ts,subagent-continue.ts}, src/manager.ts, related tests
  - Interface boundaries: existing ctrl+h handoff behavior unchanged
  - Focused check and PASS evidence: new `subagent-run.test.ts` case where two concurrent task-mode runs exist and only the asking one is released; `pnpm run check` passes
  - Return milestone: package check green
  - Stop / reassessment: handoff ordering requires changing the parent tool result contract
- [x] AC-5: Covered by the AC-1 runtime unit (progress updates)
  - Outcome: accepted as part of the AC-1 unit result
  - Known entrypoints and skill paths: as AC-1 unit
  - Inputs: as AC-1 unit
  - Dependencies: AC-1 runtime unit
  - Output: progress tests
  - Owner: thoth-worker
  - Writes: as AC-1 unit
  - Interface boundaries: as AC-1 unit
  - Focused check and PASS evidence: manager test shows progress recorded, bounded to 5, and no `sendMessage` call
  - Return milestone: with AC-1 unit
  - Stop / reassessment: as AC-1 unit
- [x] AC-7: Thoth Pi role definitions, root guidance and docs
  - Outcome: four non-Oracle specialists select and are instructed on `ask_orchestrator`; Oracle excluded; root guidance covers `subagent_reply` and escalation; generated agents and docs updated
  - Known entrypoints and skill paths: src/harness/adapters/pi.ts, src/agents/prompt-dialects.ts, src/harness/writers/pi-agent.ts, pi/agents/thoth-*.md, docs/agent/agents-and-delegation.md, docs/agent/harness-packaging.md; tdd and simplify skills as above
  - Inputs: this record's fixed interfaces
  - Dependencies: none (interfaces fixed by plan)
  - Output: prompt/generator changes, regenerated agents, docs, tests
  - Owner: thoth-worker
  - Writes: src/harness/**, src/agents/prompt-dialects.ts and its test, pi/agents/thoth-*.md, docs/agent/agents-and-delegation.md, docs/agent/harness-packaging.md
  - Interface boundaries: no changes in pi-packages/; other harness outputs unchanged
  - Focused check and PASS evidence: `pnpm vitest run src/harness src/agents/prompt-dialects.test.ts` passes with new assertions for inclusion and Oracle exclusion; `pnpm run typecheck` passes
  - Return milestone: focused tests green and generated diff summarized
  - Stop / reassessment: role tool lists are generated from a shared source that would also change other harnesses
- [x] AC-4: Covered by the AC-1 runtime unit (timeout, cancellation, shutdown, stall suspension)
  - Outcome: accepted as part of the AC-1 unit result
  - Known entrypoints and skill paths: as AC-1 unit
  - Inputs: as AC-1 unit
  - Dependencies: AC-1 runtime unit
  - Output: lifecycle tests
  - Owner: thoth-worker
  - Writes: as AC-1 unit
  - Interface boundaries: as AC-1 unit
  - Focused check and PASS evidence: tests for timeout, cancel and shutdown rejection and for no stall abort while outstanding pass
  - Return milestone: with AC-1 unit
  - Stop / reassessment: as AC-1 unit
- [x] AC-6: Covered by the AC-1 runtime unit (config gating and docs)
  - Outcome: accepted as part of the AC-1 unit result
  - Known entrypoints and skill paths: as AC-1 unit
  - Inputs: as AC-1 unit
  - Dependencies: AC-1 runtime unit
  - Output: config tests and docs
  - Owner: thoth-worker
  - Writes: as AC-1 unit
  - Interface boundaries: as AC-1 unit
  - Focused check and PASS evidence: config tests for defaults/disable; real-SDK tool selector test shows tool present when enabled and absent when disabled
  - Return milestone: with AC-1 unit
  - Stop / reassessment: as AC-1 unit
- [x] AC-8: Full verification and independent final review
  - Outcome: all checks pass and a fresh Oracle returns PASS against this record and the diff
  - Known entrypoints and skill paths: repository root; pi-packages/pi-subagents
  - Inputs: accepted outputs of all units
  - Dependencies: AC-1, AC-3, AC-7 units accepted
  - Output: verification results recorded in this record
  - Owner: root (checks) and thoth-oracle (review)
  - Writes: this record only
  - Interface boundaries: none
  - Focused check and PASS evidence: package `pnpm run check`; root `pnpm run check:ci`, `pnpm run typecheck`, `pnpm run build`, `pnpm test` exit 0; Oracle verdict PASS
  - Return milestone: Oracle verdict
  - Stop / reassessment: any failing check returns to the owning unit

## Authorization

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

## Verification

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 838af43e7df50ebacfd3739e449b7a8b88ffa8f1f5fc3b7d6d6a11fb966b9d03

- AC-1: PASS | test/runner/orchestrator-real-sdk.test.ts, manager tests | repeated blocking questions return replies within the same live child session
- AC-2: PASS | reply-tool and question-message tests | correlation, owner-session enforcement, stale/ambiguous rejection, turn-triggering delivery and status/list projection pass
- AC-3: PASS | four concurrent same-task real-SDK regressions plus run/continue tests | immediate and cleanup-gap questions deliver exactly once after parent return; unrelated tasks stay blocked (prior round FAIL fixed)
- AC-4: PASS | manager lifecycle and orchestrator-inactivity tests | reply timeout, cancellation, shutdown and total timeout reject; stall suspension/resumption pass
- AC-5: PASS | manager, reply-tool, SDK and widget tests | latest-five progress retention, immediate return, status/list/UI visibility, no question notification
- AC-6: PASS | config, reply registration and real-SDK selector tests | defaults, disablement, timeout config, explicit-only selection and docs pass
- AC-7: PASS | root adapter/writer/prompt/resource/panel and generation tests | four specialists select the tool with guidance; Oracle excluded; generated assets match manifest
- AC-8: PASS | package pnpm run check; root check:ci, typecheck, build, pnpm test | 696 passed/1 skipped; check:ci no errors; typecheck/build exit 0; 1247/1247 with CODEX_HOME unset and THOTH_PLUGINS_ROOT set to the sibling thoth-plugins fixture
- Note: test/ui/panel.test.ts carries Biome formatting of pre-existing HEAD drift (formatting-only, verified byte-equal to formatted HEAD). Residual nonblocking risk: test/manager.test.ts fixed 120 ms wait is timing-sensitive under parallel load. SDK runtime verified on 0.99.1; 0.99.0 typings declare customTools.
- Source: .thoth/specs/multi-harness-agent-pack/spec.md | sha256:7f39334e6428b759626a4abb5177fd826db9c76889317ebff69bccbfd7763740

## Closeout

**Archive**: READY
