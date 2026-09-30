# Change: pi-subagents-pi-099

**Classification**: substantial
**Scope**: local
**Uncertainty**: medium
**Risk**: medium

## Exploration

The real user requests updating the adopted fork under `pi-packages/pi-subagents` for Pi 0.99.0/0.99.1, taking advantage of relevant native functionality. The user explicitly limits its responsibility to LLM subagent delegation. Non-LLM background work belongs to the separately installed pi-background-tasks package.

Native discovery found a clean worktree and the adopted `@thoth-agents/pi-subagents@1.0.0` package. Its development SDK/TUI baseline is 0.85.1 and its SDK diagnostic minimum is 0.82.1. The previous fork adoption is archived; legacy records and recovered SDK-blocker memories do not authorize or establish acceptance for this update.

Accepted local evidence:

- `src/runner/sdk-runner.ts` already passes string tool names, inherits modelRuntime/settings, and restores through SessionManager. Tool verification wrongly requires selected tools to be active and bypasses explicit lists. Lean resource filtering deliberately retains only tool_call/tool_result/user_bash handlers.
- `src/runner/sdk-runner.ts`, `src/manager.ts`, `src/types.ts`, and `src/runner/event-processing.ts` discard asynchronous steering outcomes and account for later user messages using FIFO. Rejected or intercepted steering needs truthful handling within this existing messaging responsibility.
- `src/tools/registry.ts` registers eight orchestration tools, with continuation conditional on configuration. Pi 0.99 supplies model-only exposure suitable for these controls.
- `src/thread-view.ts` uses native Pi components. Tagged 0.99.1 constructors and public TUI exports match the current calls; real-version verification must establish loader/render compatibility without a speculative rewrite.

Authoritative target sources:

- https://pi.dev/changelog
- https://github.com/earendil-works/pi/blob/v0.99.1/packages/coding-agent/CHANGELOG.md
- https://github.com/earendil-works/pi/blob/v0.99.0/packages/coding-agent/src/core/sdk.ts
- https://github.com/earendil-works/pi/blob/v0.99.1/packages/coding-agent/src/core/sdk.ts
- https://github.com/earendil-works/pi/blob/v0.99.1/packages/coding-agent/src/core/agent-session.ts
- https://github.com/earendil-works/pi/blob/v0.99.1/packages/coding-agent/src/core/extensions/types.ts
- https://github.com/earendil-works/pi/blob/v0.99.1/packages/coding-agent/docs/sdk.md

In 0.99, factory tools restrict the registered registry, while registered deferred/codemode tools can remain callable when inactive. model-only exposure prevents executeTool/codemode invocation of orchestration controls. steer resolves queued or handled and may reject. Awaited fresh nonstreaming prompt already covers retries, automatic continuation, and settlement; the existing successful completion flow needs no extra idle gate. Exact transformed-input correlation is not public; preserve lean isolation and do not introduce consumption guarantees.

## Intent

Update the existing LLM delegation fork to the Pi 0.99 API, develop against 0.99.1, and verify the shared behavior on 0.99.0. Adopt native exposure and registry semantics to preserve the existing delegation boundary, messaging, and session UI.

## Non-goals

- Increasing fork responsibility, adding generic task execution, or modifying/installing pi-background-tasks.
- Adding an orchestration scheduler, lifecycle mirror, idle-wait mechanism, native MCP provisioning, virtual-model routing, broad output schemas, or nested-call UI redesign.
- Changing lean hook/resource isolation, enabling full child resources, or claiming OS/process sandbox enforcement.
- Altering model/profile/tool commands, defaults, continuation policy, or root Pi dependencies without concrete failing integration evidence.
- Publishing, pushing, committing, globally installing, or automatically incrementing the fork/product package version.

## Acceptance

- AC-1: The fork declares Pi 0.99.0 as its supported SDK minimum, pins development SDK/TUI to 0.99.1, preserves its own version, and passes native typecheck/package checks with an updated lockfile.
- AC-2: Explicit and dynamic child tool selections are checked against the actual registered implementation inventory. Selected deferred tools work through public executeTool, while excluded/prohibited tools are absent and cannot be called. Existing lean filtering, SessionManager restoration, inherited model/effort/runtime, and sync/background LLM modes remain intact.
- AC-3: Existing orchestration tools use native model-only exposure while keeping their names, schemas, renderers, order, and continuation gating. They remain directly available to the model when active and cannot be called through nested executeTool/codemode.
- AC-4: Live subagent messages observe asynchronous steer outcomes: queued stays distinct from consumption, handled clears delivery expectation without claiming model consumption, and rejection is reported/cleaned up without unhandled promises or phantom forwarded messages. Existing FIFO/queue limits and cancellation remain coherent; awaited prompt finalization stays intact.
- AC-5: Existing native session/tool rendering and LLM delegation regressions pass on Pi 0.99.1, with focused real-SDK checks also passing on 0.99.0. Documentation describes the supported baseline and responsibilities accurately, and the final diff preserves unrelated work and existing configuration/UI responsibilities.

## Clarifications

- RESOLVED: The user explicitly stated that this fork only delegates LLM subagents and that updating it must not increase its responsibility. Non-LLM background tasks remain with pi-background-tasks.
- RESOLVED: The user explicitly confirmed testing real SDK subagent creation/tool permissions, background LLM messaging/cancellation, and tool/session registration/rendering.
- RESOLVED: Target 0.99.1 for development; verify 0.99.0 against the shared SDK behavior. Native version support and public peer constraints must agree.
- RESOLVED: Preserve lean hook filtering. Do not expose input/context hooks to children as part of this migration.
- RESOLVED: Tagged upstream implementation and SDK docs prove fresh awaited prompt covers settlement. Retain ordinary disposal after prompt and existing cancellation behavior.
- All material human-owned product and architecture decisions are settled.

## Decisions

- This is substantial because target registry/exposure and asynchronous messaging contracts affect isolation and acceptance, despite remaining within one fork.
- Root accepted terminal read-only Explorer evidence and version-tagged Librarian evidence; an erroneous proposed spec title was corrected against the exact native workspace before declaring the delta.
- Test seams are real SDK creation/registry/executeTool, manager/message delivery and cancellation, and extension/native rendering; the user confirmed them.
- Minimal feature adoption is model-only exposure and correct handling of existing deferred tools/steering outcomes. Preserve all other responsibilities and defaults.
- Preserve authoritative SessionManager restore, parent runtime/effort inheritance, and awaited prompt completion. Do not infer that queued or extension-handled means model-consumed.
- Bound technical unknowns to the installed 0.99 SDK and native component-loading checks. Return a concrete gap before expanding interfaces, hooks, root dependencies, or feature scope.
- One writer owns the fork at a time. Root owns this record. Substantive implementation and independent judgment require their assigned specialists; unavailable native dispatch is reported rather than bypassed.

## Durable deltas

- `MODIFIED multi-harness-agent-pack` **Native lifecycle translation** — Pi root guidance MUST use one direct subagent_run with explicit canonical agent and bounded task per fresh assignment; omitted mode MUST use the configured agent/config mode or otherwise background, and explicit task/background modes MUST remain supported. Native status/result/cancel or supported live messaging MUST be used only for a known task ID. Queued delivery, nonterminal state and cancellation requests MUST NOT prove termination or acceptance. New objectives, phases, mutable surfaces and independent judgments MUST receive fresh assignments. Thoth MUST NOT use subagent orchestration APIs or claim instruction-only policy is runtime enforcement. Terminal notifications drive collection without polling; children MUST remain scoped to the parent Pi lifetime. The adopted delegation runtime MUST support Pi 0.99.0/0.99.1 registry and model-only exposure semantics, restrict child registered tools to the selected permitted implementations, and distinguish queued, extension-handled, rejected, and model-consumed live input. Updating this runtime MUST preserve its responsibility for LLM subagent delegation; non-LLM background task execution remains external.
  - GIVEN an active root using the adopted fork on Pi 0.99.0 or 0.99.1; WHEN it launches an LLM subagent, selects tools, or sends live input; THEN native delegation controls remain model-only, child callability respects the permitted registry, and reported message/terminal states retain their actual meanings without adding generic task responsibilities.

## Plan

1. Update only fork development dependencies/lockfile and SDK minimum/public peer constraints for 0.99.0/0.99.1. Use native package-manager commands; no version increment or downloaded workflow contract.
2. Test-first adapt registered-tool verification for explicit/dynamic selections and inactive deferred tools. Use factory registry filtering and public executeTool proofs for selected and prohibited tools. Preserve lean resource filtering, restore/model/effort inheritance, and existing completion flow.
3. Test-first apply model-only exposure centrally in tool registration. Preserve factory fields, schemas, renderers, order, and continuation gating. Verify nested calls are refused by the real target SDK.
4. Test-first correct asynchronous steering/accounting at the existing bridge/manager seam, preserving awaiting-delivery and consumed semantics and treating handled/rejected distinctly. Exercise queued, handled, rejection, repeated messages, limits and cancellation. No new exact-correlation promise or full-resource support.
5. Verify target native component loading/rendering with one focused real-version check; fix only concrete failures. Preserve width helpers, component contracts and existing fallback behavior. Update fork README and routed harness compatibility facts.
6. Apply installed simplify within the owned diff without behavior changes. Run fork typecheck, tests, verify:package and packaging checks on 0.99.1; run focused actual-SDK checks with 0.99.0 and restore the locked 0.99.1 dependency tree. Broaden to root checks only for changed integration contracts or concrete failures.
7. Freeze inputs and obtain a fresh independent read-only Oracle against this agreement, actual diff and execution evidence. Record each acceptance result, source digests and reviewed record hash. Archive/synchronize the declared spec only after independent PASS and closeout validation.

Implementation seams and stop conditions: SDK tool verification (`src/runner/sdk-runner.ts`, `test/runner/tool-selectors-real-sdk.test.ts`, `test/runner/interaction-bridge.test.ts`); registrations (`src/tools/registry.ts`, `test/compatibility.test.ts`); steering (`src/manager.ts`, `src/types.ts`, runner files and `test/runner/thread-snapshots.test.ts`); native rendering (`src/thread-view.ts`, `test/thread-view.test.ts`, existing render/widget tests). Stop on missing target APIs, failed isolation, ambiguous message ownership, altered responsibilities, or unavailable native ownership/review capacity. No auxiliary process scripts or evidence/report artifacts.

## Tasks

All implementation units are sequential to preserve one writer for the fork and one stable dependency tree. Installed implementation skills: `C:/Users/EremesNG/.agents/skills/tdd/SKILL.md`, `C:/Users/EremesNG/.agents/skills/simplify/SKILL.md`, and `C:/Users/EremesNG/.codex/plugins/cache/personal/thoth-agents/0.4.2+codex.local-20260930T160817415Z/skills/thoth-sdd/references/phases/implement.md`. Root alone edits this record; workers return native evidence rather than report files.

- [x] AC-1: Establish the supported 0.99 dependency and runtime baseline.
  - Outcome: matching development lockfile, public runtime constraint and diagnostic minimum.
  - Known entrypoints and skill paths: pi-packages/pi-subagents/package.json, package-lock.json, src/runner/pi-sdk-module.ts, test/runner/interaction-bridge.test.ts; installed implementation skills above.
  - Inputs: accepted tagged SDK/package contract and current clean fork baseline.
  - Dependencies: optional review disposition resolved; implementation authorized by the real user.
  - Output: updated fork baseline without package version increment.
  - Owner: worker.
  - Writes: the named fork manifest, lockfile, SDK minimum module and nearest runtime-version regression test only.
  - Interface boundaries: public peers/runtime diagnostic and native package dependency tree.
  - Focused check and PASS evidence: native install, version-minimum regression, npm run typecheck and npm run verify:package pass against 0.99.1.
  - Return milestone: baseline diff and focused execution evidence are ready for root acceptance.
  - Stop / reassessment: target unavailable, dependency/engine conflict or a concrete root integration change needed.

- [x] AC-2: Preserve child tool selection with the 0.99 registered-tool contract.
  - Outcome: permitted registered deferred tools can execute and prohibited/excluded tools cannot.
  - Known entrypoints and skill paths: pi-packages/pi-subagents/src/runner/sdk-runner.ts, src/tool-patterns.ts, test/runner/tool-selectors-real-sdk.test.ts, test/runner/interaction-bridge.test.ts; existing SDK fixtures in test/runner/thread-snapshots.test.ts and test/runner/structured-errors.test.ts; installed implementation skills above.
  - Inputs: accepted baseline from AC-1 and tagged registry/executeTool semantics.
  - Dependencies: AC-1 accepted and its dependency tree stable.
  - Output: registry-based verification and behavioral isolation evidence for explicit/dynamic selections.
  - Owner: worker.
  - Writes: named selection/runner sources and their focused tests; only public selected-tool inventory fixture alignment in the two named existing SDK regression files.
  - Interface boundaries: factory tools allowlist, registered child implementations, public executeTool and unchanged lean/model/session contracts.
  - Focused check and PASS evidence: real SDK selected deferred execution, excluded/prohibited nested-call rejection, missing implementation failure, restore/model/effort and resource isolation regressions pass.
  - Return milestone: selection behavior and scope-preserving regressions accepted by root.
  - Stop / reassessment: registry guarantees unavailable, shared extension runtime leakage or changed hook/resource responsibility.

- [x] AC-3: Preserve orchestration controls with native model-only exposure.
  - Outcome: existing registered delegation controls retain their public behavior and reject nested execution.
  - Known entrypoints and skill paths: pi-packages/pi-subagents/src/tools/registry.ts, test/compatibility.test.ts, test/runner/tool-selectors-real-sdk.test.ts; installed implementation skills above.
  - Inputs: accepted baseline and registry findings from AC-1/AC-2 plus tagged exposure contract.
  - Dependencies: AC-1 and AC-2 accepted; no conflicting fork writer.
  - Output: centralized exposure metadata and registration/nested-call evidence.
  - Owner: worker.
  - Writes: named tool registry and focused registration/execution tests only.
  - Interface boundaries: tool names/schemas/renderers/order and enable_continue gating remain intact.
  - Focused check and PASS evidence: existing registration checks and real target SDK rejection of executeTool for model-only controls pass.
  - Return milestone: exposure diff and native checks accepted by root.
  - Stop / reassessment: active model visibility changes, registration contract conflict or responsibility expansion.

- [x] AC-4: Correct existing live-message acknowledgment for asynchronous steering.
  - Outcome: queued, handled, rejected and consumed inputs are accounted for truthfully.
  - Known entrypoints and skill paths: pi-packages/pi-subagents/src/runner/sdk-runner.ts, src/runner/event-processing.ts, src/manager.ts, src/types.ts, src/tools/subagent-send-message.ts; test/manager.test.ts, test/tools/subagent-send-message.test.ts, test/runner/thread-snapshots.test.ts, test/runner/interaction-bridge.test.ts and existing async caller fixtures in test/tools/subagent-continue.test.ts; installed implementation skills above.
  - Inputs: accepted SDK baseline/selection and authoritative steering/prompt lifecycle clarification.
  - Dependencies: AC-1 through AC-3 accepted; SDK/manager mutation ownership is exclusive.
  - Output: observed steering promises and accurate existing queue/status behavior.
  - Owner: worker.
  - Writes: named bridge/manager/types/message-tool sources and nearest public behavior tests; only necessary awaited-message caller fixture alignment in the continuation test. Preserve existing queued/rejected semantics and describe native handled via the existing message result, without UI redesign or new controls.
  - Interface boundaries: existing LLM live messaging, FIFO/limits, model-consumption distinction and cancellation; preserve successful prompt finalization.
  - Focused check and PASS evidence: queued/handled/rejected, repeated identical input, limits, cancellation, continuation and cleanup regressions pass without unhandled promises or phantom forwarded entries.
  - Return milestone: message contract checks and coherent scope-limited diff accepted by root.
  - Stop / reassessment: exact transformed-message correlation needed, full child resources requested, or a broader protocol/product decision required.

- [x] AC-5: Establish target rendering, version-matrix and documented compatibility evidence.
  - Outcome: the updated fork works on both requested versions within its unchanged responsibility.
  - Known entrypoints and skill paths: pi-packages/pi-subagents/src/thread-view.ts, test/thread-view.test.ts, new focused test/thread-view-real-sdk.test.ts if needed to avoid mocked native runtime, test/runner/tool-selectors-real-sdk.test.ts for native steering dispositions, test/render/tools.test.ts, test/ui/widget.test.ts, test/package.test.ts, README.md and README assertion test/tools/subagent-send-message.test.ts:79; docs/agent/harness-packaging.md; installed implementation skills above.
  - Inputs: accepted AC-1 through AC-4 implementation and target public component/TUI contracts.
  - Dependencies: all product mutations accepted before final evidence freeze.
  - Output: any concrete renderer compatibility fix, current documentation and final native checks.
  - Owner: worker; root separately requests fresh independent Oracle verification after this implementation evidence is complete.
  - Writes: named native viewer/test and README/harness guidance only when warranted; the existing real-SDK test may add a focused native steer queued/handled/rejected proof with explicit isolated fixture input hooks, without changing child resource policy. Root owns verification/closeout and canonical spec synchronization after PASS.
  - Interface boundaries: native rendering/fallback, unchanged configuration/model/tool responsibilities and independent non-LLM background package.
  - Focused check and PASS evidence: real native target loading/rendering and SDK steer dispositions, fork typecheck/tests/verify:package/pack:dry-run on 0.99.1, focused actual-SDK checks on 0.99.0 and restored locked dependency tree. Completion means implementation evidence is ready for the separate mandatory fresh independent verification in Plan step 7 and the Verification section.
  - Return milestone: frozen final diff, checks and source digests ready for independent acceptance.
  - Stop / reassessment: target rendering can only be mocked, root dependency scope grows, version evidence is missing, or fresh independent verification is unavailable.

## Authorization

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

The real user's original request authorizes implementing this bounded fork update; their later scope clarification narrows that authorization. Test seams were explicitly confirmed. The user explicitly selected ready-plan Oracle review. This selection remains separate; no review outcome substitutes for implementation authorization or final independent verification.

Selected fresh Oracle `/root/oracle_pi099_plan` returned [OKAY]: no execution blockers, ready validator passed, canonical baseline matched, and existing LLM delegation responsibility preserved. The separate post-review implementation decision is satisfied by the user's existing explicit update authorization; no later Stop was given. Root proceeds within that authorization. Final independent verification remains separate.

## Verification

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 75f117a0e3ac77a8807e7de9254662137ba302c23d39fd4dc73b9d2b587c6def

- AC-1: PASS | version diagnostic RED/GREEN; native npm install, npm ci, npm ls, npm run typecheck, npm run verify:package, git diff --check | Fresh worker baseline terminal and root-accepted: SDK/TUI/AI/agent-core installed 0.99.1, minimum/peer >=0.99.0, own version 1.0.0; 23 interaction-bridge tests and 18 packaged files passed. Only manifest/lock, SDK minimum and runtime-version tests changed; owned commands terminated.
- AC-2: PASS | runner RED/GREEN, real 0.99.1 registry and ctx.executeTool, node node_modules/vitest/vitest.mjs run test/runner, npm run typecheck, git diff --check | Fresh terminal worker accepted: 56 tests across 7 files passed, including *, @active and explicit lists; exact permitted registries, inactive deferred/codemode callability, excluded/prohibited nested-call rejection and missing implementation cleanup. Writes limited to sdk-runner.ts and four authorized runner tests; all commands terminated.
- AC-3: PASS | registration and real nested-execution RED/GREEN; 7 focused tests across compatibility/real-SDK files; npm run typecheck and git diff --check | Fresh terminal worker accepted: all eight active/model-visible controls are absent from nested callable inventory, ctx.executeTool refuses before any handler runs, direct model execution succeeds; factory fields/order and conditional 7/8 registration preserved. Changes confined to registry.ts and two authorized tests; simplify complete and commands terminated.
- AC-4: PASS | asynchronous acknowledgment and race RED/GREEN; runner/manager/message/continue/registration regressions; npm run typecheck and git diff --check | Fresh terminal worker accepted: 140 tests in 11 files passed; queued awaits actual consumption, handled is interception, exact-entry rejection cleanup/pre-ready undelivered reporting, FIFO/limits/early consumption/late cancellation accounting proven. Existing prompt/disposal and event-processing unchanged; diagnostic literals aligned to >=0.99.0, simplify complete and native commands terminated.
- AC-5: PASS | actual native rendering/steer, complete standalone tests, two-version matrix, typecheck/verify:package/pack:dry-run, dependency restoration and diffcheck | Fresh terminal worker accepted: native constructors/loading/render markers and queued/handled/rejected steer proven on both versions. Initial 0.99.1 npm test passed 399 tests/33 files; actual SDK/TUI/AI/core 0.99.0 matrix passed 125 tests/7 files. npm ci restored all four to 0.99.1, own version 1.0.0; manifest/lock hashes unchanged by matrix. Final restored full suite with --maxWorkers=2 passed 399 tests/33 files; typecheck passed, package verification checked 18 files and dry-run packed 73 files. Documentation/nearest assertions updated, no production renderer fix required, simplify complete and all native commands terminated. Default parallel validation limitation recorded below.
- Source: .thoth/specs/multi-harness-agent-pack/spec.md | sha256:024beb39e0a34d30b0490af04d5d4955ea5084da5eb3d0603290388be7f63c02
- Source: docs/agent/harness-packaging.md | sha256:5612bba62e35931eb02325766e255e8163dd14ebc672b3d5ee415c9f219f6a2e
- Source: pi-packages/pi-subagents/package-lock.json | sha256:4be86df49beeea3490d618cc5c211887a06c3f6cc9e21b7a481c4ff823f1cc65
- Source: pi-packages/pi-subagents/package.json | sha256:38338ebe9ffb49ed9ae94d03b66c378ceab2fe02b565bc096f27854422194cd7
- Source: pi-packages/pi-subagents/README.md | sha256:673aef4a671e5bffe911a1ce53897d9d14afd28402c8337bba1a8761b802faca
- Source: pi-packages/pi-subagents/src/manager.ts | sha256:f1f47b4fe1df8507379b7ad99a1bc497e32dc2c998f6ef5e7076017337b435c5
- Source: pi-packages/pi-subagents/src/runner/pi-sdk-module.ts | sha256:ef03c60d0d4a1e5584de07ea125567cc9d30dbf5705782f5fac1bd01b5701af6
- Source: pi-packages/pi-subagents/src/runner/sdk-runner.ts | sha256:217b4239d04ce79060f247df4e58729429d97fb5856c63044110a945a6d935a4
- Source: pi-packages/pi-subagents/src/tools/registry.ts | sha256:fef92f590c1a749dafd4dd715c0886dec34a328511c99671ecd84a510c5b870e
- Source: pi-packages/pi-subagents/src/tools/subagent-send-message.ts | sha256:fefa8873f2d994700d59d086e43266597ef3db35b199ba917cda79b0c1ba181c
- Source: pi-packages/pi-subagents/src/types.ts | sha256:8763d7dceeb4845a1d5a43b5d41ba3f893bb5a490924aac8ea93dda8e041114e
- Source: pi-packages/pi-subagents/test/compatibility.test.ts | sha256:949a732c7735b0afdaa3f956b63628d581ef5b720d86a611b4e2a4e053c5ecbe
- Source: pi-packages/pi-subagents/test/manager.test.ts | sha256:09bcf4af543c25c60f6e635936442015076b4c8ae6146dc54d699a26cde2edfc
- Source: pi-packages/pi-subagents/test/package.test.ts | sha256:daa1d449376656a744c7c7bf6ea8cfd1c866fc90aacb6b01c4ec10775fba2772
- Source: pi-packages/pi-subagents/test/runner/interaction-bridge.test.ts | sha256:dfd4fb292f2def78e0563c7c3c9f07af59a05e6816250ace0efc2c81121a0684
- Source: pi-packages/pi-subagents/test/runner/structured-errors.test.ts | sha256:28fc0fc7f259f703b80415365beb844ead9ca75d618354ee4a1f7f59f6255e6a
- Source: pi-packages/pi-subagents/test/runner/thread-snapshots.test.ts | sha256:a23313eb5098e2f5df723d79f53ddb1e50acd2be24f42e2d352e487c471a5769
- Source: pi-packages/pi-subagents/test/runner/tool-selectors-real-sdk.test.ts | sha256:54ed2a6097e196b666ba6ae67f9953f844d8cb0d9305017dd35de34869a609a2
- Source: pi-packages/pi-subagents/test/thread-view-real-sdk.test.ts | sha256:6f5c894353c4eed73c854d6d3c13b93bc1998c501cd32732cd684449932fa08a
- Source: pi-packages/pi-subagents/test/tools/subagent-continue.test.ts | sha256:5dc27c9a652fd2a8a60845c3a836c79cfd13bff5ca148cf80ab03526a0cc1484
- Source: pi-packages/pi-subagents/test/tools/subagent-send-message.test.ts | sha256:373fdd9fe271f0ebac1d74d6de498e565d28029cdc03638db1d0bb82c7d444f0

Validation limitation: the final restored default parallel npm test had three five-second cold-SDK-load timeouts and a subsequent listActiveSessionTasks mock error. Its last outcome remains FAILED/flaky. The same affected files passed 73/73 with two workers, followed by the full 399/399 suite with two workers. Resource contention and timeout-induced mock pollution are supported inferences, not independently instrumented causes. No unrelated test/config or production edits masked these failures. Earlier default 0.99.1 npm test did pass 399/399. Independent Oracle must assess this disclosed limitation. No live LLM provider calls were performed; actual local SDK tool/steer and native UI APIs were exercised, with LLM lifecycle/cancellation accounting covered by source review and boundary regressions.

Fresh independent Oracle acceptance: /root/oracle_pi099_final returned PASS against the actual frozen diff and AC-1 through AC-5. Independently passed 103 tests across 6 files, typecheck, verify:package (18 files), ready validation and diffcheck. Confirmed all 21 source hashes, the exact reviewed record-prefix hash, installed SDK/TUI/AI/core 0.99.1 and own package 1.0.0. Accepted supplied complete 399/33 and actual 0.99.0 125/7 evidence without redundant broad reruns. Scope, lean isolation, completion flow, config and native rendering are preserved. The disclosed default-parallel test failure is a nonblocking test reliability risk; default check/prepublish reliability remains uncertain. No implementation writer approved its own work and no root self-approval substituted for this judgment.

## Closeout

**Archive**: READY

Archival execution: the installed archive command returned archived on 2026-09-30, moved this same record to `.thoth/changes/archive/2026-09-30-pi-subagents-pi-099/pi-subagents-pi-099.md`, and synchronized only the declared Native lifecycle translation requirement. Pre-archive closeout validation passed with zero errors/warnings; no unfinished archive transaction remains and the active record is absent.

Focused post-archive checks: git diff --check passed; the reviewed prefix remains 75f117a0e3ac77a8807e7de9254662137ba302c23d39fd4dc73b9d2b587c6def and all 20 reviewed product/doc/test source hashes still match. Canonical diff matches the declared delta and preserves unrelated requirements. Applied canonical spec SHA-256: 8ccd4073f76b986f57fd3cc890e8eeb12501038ca550d19f554eb65876ff8fec.

An additional closeout-validator invocation against the archived path returned SDD-VERIFICATION-SPEC-BASELINE because the reviewed pre-transaction baseline (024beb39e0a34d30b0490af04d5d4955ea5084da5eb3d0603290388be7f63c02) now differs from the applied canonical spec. The original reviewed Source entry is preserved as historical evidence; no source digest was rewritten to conceal this result. The pre-archive gate, shipped transactional archive byte verification and focused post-archive integrity checks are the closeout evidence.
