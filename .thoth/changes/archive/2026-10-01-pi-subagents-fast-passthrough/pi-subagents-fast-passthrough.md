# Change: pi-subagents-fast-passthrough

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: medium
**Risk**: medium

## Exploration

- Archived change `pi-openai-fast-variants` ships `@thoth-agents/pi-openai-fast`:
  on `session_start` it registers `<id>-fast` virtual models; agent-loop
  `route()` arms a one-shot token; `before_provider_request` returns
  `{ ...payload, service_tier: 'priority' }` (`pi-packages/pi-openai-fast/src/payload.ts:38`).
  Its record listed `pi-subagents` children as a non-goal; the user now
  requires fast variants to work in subagents.
- `pi-packages/pi-subagents/src/runner/sdk-runner.ts`:
  - `:472-507`: child gets a fresh `ModelRuntime` unless `ctx.modelRuntime`
    exists; lean mode uses `DefaultResourceLoader` (user settings packages load).
  - `:511-539`: replays parent provider registrations only
    (`getRegisteredProviderIds()`); virtual models live in separate runtime
    storage and are not replayed. Routing an unregistered virtual model throws
    `Virtual model <provider>/<id> is not registered` (SDK `model-runtime.js:723-727`).
  - `:38-43`, `:591-605`: selected model resolves against the parent context
    before child creation.
  - `:222-261`, `:280-285`: extension identity is the nearest `package.json`
    `name`; passthrough requires exact membership in `lifecycle_passthrough`
    (root `thoth-agents` always rejected).
  - `:132-136` always-allowed events; `:161-170` `SUBAGENT_OBSERVE_ONLY_EVENTS`
    (`before_agent_start`, `agent_start`, `turn_start`, `context`,
    `context_with_system`, `input`, `before_provider_request`,
    `before_provider_headers`); `:298-304` one shared wrapper calls handlers
    with `cloneEventData(event)` and returns `undefined`.
  - `:416-428`, `:550`: child `session_start` is emitted after replay and
    verification and before prompting (tested order at
    `test/runner/providers-real-sdk.test.ts:227`).
- `src/config.ts:23-27` `DEFAULT_LIFECYCLE_PASSTHROUGH` = Claude bridge,
  Antigravity bridge, background tasks; `:216-235`, `:414-445` configured arrays
  replace defaults. The user's `~/.pi/agent/subagents.json` sets no
  `lifecycle_passthrough`, so defaults apply.
- SDK `extensions/runner.js:1060-1087` `emitBeforeProviderRequest` chains
  handlers: a non-`undefined` return replaces the payload; errors are reported
  and chaining continues.
- Tests encoding current policy: `test/config.test.ts:288` (exact default
  list); `test/runner/providers-real-sdk.test.ts:385` (all listed prompt-shaping
  events cloned with overrides discarded; `:400-403` for
  `emitBeforeProviderRequest`); `src/harness/adapters/pi.test.ts:169` (exact
  generated wording). Real-SDK harness `providers-real-sdk.test.ts:60-135`
  loads fixture extensions via `additionalExtensionPaths`; fixture providers
  (`fixtures/provider-fixture.ts:29`) do not call `options.onPayload`.
- Policy text: `pi-packages/pi-subagents/README.md:230,268,567,569,573`;
  `pi-packages/pi-subagents/skills/subagents-configuration/SKILL.md:115,117,147`;
  `src/harness/adapters/pi.ts:52`; `docs/agent/harness-packaging.md:114-117`;
  `docs/agent/agents-and-delegation.md:165-167`; `docs/installation.md:312-314`.
  No `.thoth/specs/**` requirement states the passthrough list or
  observe-only policy.
- `@henryqw/pi-multi-codex` 2.0.4 (user-installed) registers native providers
  `openai-codex-N` with `api: openai-codex-responses` at factory time and in
  `session_start`, forwarding stream `options` (incl. `onPayload`) unchanged.

## Intent

A subagent whose selected model is a `pi-openai-fast` variant (for example
`openai-codex/gpt-6.1-sol-fast` or `openai-codex-2/gpt-6.1-sol-fast`) runs in its
lean child session, routes to the physical base model of the same provider,
and sends `service_tier: "priority"` on its agent-loop requests.

## Non-goals

- No replay of parent virtual models into children; children register their
  own variants through the passthrough package.
- No mutation rights for the other seven observe-only events.
- No change to identity matching, `thoth-agents` rejection, configuration
  merge semantics, or non-lean (full) resources.
- No change to `pi-openai-fast` behavior; no package version bumps.

## Acceptance

- AC-1: `DEFAULT_LIFECYCLE_PASSTHROUGH` also contains
  `@thoth-agents/pi-openai-fast`; configured arrays still replace defaults.
- AC-2: In lean children, `before_provider_request` handlers of
  lifecycle-passthrough packages receive cloned event data and a
  non-`undefined` return replaces the payload passed to later handlers and the
  provider; an `undefined` return or in-place mutation of the clone leaves the
  payload unchanged. The other seven observe-only events keep discarding
  returns, and unlisted packages' handlers remain stripped.
- AC-3: A real-SDK `pi-subagents` test loads the actual
  `pi-packages/pi-openai-fast` extension in parent and child with a fixture
  provider using `api: "openai-codex-responses"` whose `streamSimple` invokes
  `options.onPayload`; a child selecting `<fixture-provider>/<id>-fast` streams
  successfully and its captured final payload has `model: <id>` and
  `service_tier: "priority"`, while a child selecting the physical `<id>` has
  no `service_tier`.
- AC-4: Policy text is consistent everywhere it is stated: pi-subagents
  README and configuration skill, `src/harness/adapters/pi.ts` generated
  guidance (with its test), `docs/agent/harness-packaging.md`,
  `docs/agent/agents-and-delegation.md`, and `docs/installation.md`.
- AC-5: `pnpm --filter @thoth-agents/pi-subagents run typecheck` and `run test`,
  `pnpm --filter @thoth-agents/pi-openai-fast run test`, root
  `pnpm run check:ci`, `pnpm run typecheck`, and `pnpm test` pass.

## Clarifications

- Fast variants must work in subagents (user, explicit: mandatory).
- Payload mutation in children is allowed for all lifecycle-passthrough
  packages, not a separate allowlist (user, explicit).
- Only `before_provider_request` becomes mutable; the other observe-only events
  stay observe-only (bounded assumption preserving the user's payload-scoped
  decision).

## Decisions

- Children register their own variants: adding `@thoth-agents/pi-openai-fast`
  to default passthrough makes its `session_start` run after provider replay
  (so built-in, extension and replayed `openai-codex-N` providers are visible)
  and before the first prompt; its own `route()`/guard instance arms and
  consumes the token inside the child.
- Keep cloning the event for `before_provider_request`; honor the handler's
  returned value as the replacement. Splitting it out of the shared
  observe-only wrapper keeps the other seven events unchanged.
- Fixture provider for AC-3 invokes `onPayload` like Pi's real adapters, so the
  test exercises the SDK `onPayload` -> `before_provider_request` bridge.

## Durable deltas

- None.

## Plan

**pi-subagents runtime** (`src/config.ts`, `src/runner/sdk-runner.ts`): append
`@thoth-agents/pi-openai-fast` to `DEFAULT_LIFECYCLE_PASSTHROUGH`; in the
passthrough wrapper, map `before_provider_request` callbacks to
`async (event, ctx) => handler(cloneEventData(event), ctx)` returning the
handler result, leaving the other observe-only events on the existing
discarding wrapper.

**Tests** (`pi-packages/pi-subagents/test/`): update `config.test.ts:288`
default list; update `providers-real-sdk.test.ts:385` so
`before_provider_request` returns are honored (clone isolation still asserted;
other events still discard); add a fixture provider package
(`api: "openai-codex-responses"`, `streamSimple` calling `options.onPayload`
and returning the final payload in the response text) and a real-SDK test that
loads `../../pi-openai-fast/src/index.ts` (identity
`@thoth-agents/pi-openai-fast` from its `package.json`) in parent and child,
runs a child with `<fixture>/<id>-fast` and with `<fixture>/<id>`, and asserts
the captured payloads.

**Policy text**: update the listed README/SKILL/guidance/docs lines and
`src/harness/adapters/pi.test.ts:169`.

**Risks**: payload mutation by Claude/Antigravity/background-tasks in children
is now honored (user-accepted isolation change); `dist` copies are generated
and ignored; live behavior with the real OpenAI endpoint is confirmed after
restart, outside automated checks.

**Root suite baseline**: root `pnpm test` fails 46 tests in 5 Codex/CLI files
(`codex-install`, `codex-paths`, `commands`, `operations/codex`, `tui/operations`)
identically on clean `0.5.0` (`dbddc12`) before this change; in a worktree
outside the main checkout `publish-marketplace.test.ts` additionally needs
`THOTH_PLUGINS_ROOT` (passes 6/6 with it, as CI sets). AC-5's root `pnpm test`
is judged as no new failures against that baseline.

**Units**: (1) runtime + tests + package docs + generated guidance, Worker,
owns `pi-packages/pi-subagents/**`, `src/harness/adapters/pi.ts`,
`src/harness/adapters/pi.test.ts`; (2) routed docs, root, owns
`docs/agent/harness-packaging.md`, `docs/agent/agents-and-delegation.md`,
`docs/installation.md`, depends on (1)'s accepted wording; (3) final
verification, fresh Oracle; (4) live check after user restart.

## Tasks

- [x] AC-1: Default lifecycle passthrough includes pi-openai-fast
  - Outcome: updated default list with passing config test
  - Known entrypoints and skill paths: `pi-packages/pi-subagents/src/config.ts:23-27`, `pi-packages/pi-subagents/test/config.test.ts:288`, skills `C:/Users/EremesNG/.pi/agent/skills/tdd/SKILL.md`, `C:/Users/EremesNG/.pi/agent/skills/simplify/SKILL.md`
  - Inputs: this record
  - Dependencies: none
  - Output: code and test change
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-subagents/src/config.ts`, `pi-packages/pi-subagents/test/config.test.ts`
  - Interface boundaries: `lifecycle_passthrough` merge semantics unchanged
  - Focused check and PASS evidence: `pnpm --filter @thoth-agents/pi-subagents run test -- test/config.test.ts` passes
  - Return milestone: together with AC-2/AC-3/AC-4 worker handoff
  - Stop / reassessment: default list consumed elsewhere with conflicting assumptions
- [x] AC-2: Passthrough before_provider_request returns are honored in children
  - Outcome: split wrapper in `sdk-runner.ts` with updated isolation test
  - Known entrypoints and skill paths: `pi-packages/pi-subagents/src/runner/sdk-runner.ts:161-170,280-311`, `pi-packages/pi-subagents/test/runner/providers-real-sdk.test.ts:385-412`
  - Inputs: this record
  - Dependencies: none
  - Output: code and test change
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-subagents/src/runner/sdk-runner.ts`, `pi-packages/pi-subagents/test/runner/providers-real-sdk.test.ts`
  - Interface boundaries: SDK `emitBeforeProviderRequest` replacement contract; other observe-only events unchanged
  - Focused check and PASS evidence: `pnpm --filter @thoth-agents/pi-subagents run test -- test/runner/providers-real-sdk.test.ts` passes
  - Return milestone: worker handoff
  - Stop / reassessment: SDK chaining differs from the recorded contract
- [x] AC-3: Real-SDK child fast-variant payload test
  - Outcome: new fixture provider and test proving priority in a child and none for the physical model
  - Known entrypoints and skill paths: `pi-packages/pi-subagents/test/runner/providers-real-sdk.test.ts:60-135`, `pi-packages/pi-subagents/test/runner/fixtures/`, `pi-packages/pi-openai-fast/src/index.ts`
  - Inputs: AC-1 and AC-2 code
  - Dependencies: same writer session
  - Output: fixture and test
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-subagents/test/runner/**`
  - Interface boundaries: must not modify `pi-packages/pi-openai-fast`
  - Focused check and PASS evidence: the new test passes and fails when AC-2 change is reverted locally (reported, not committed)
  - Return milestone: worker handoff
  - Stop / reassessment: child cannot route the variant even with passthrough (report exact error)
- [x] AC-4: Package docs and generated guidance describe the new policy
  - Outcome: consistent wording in package README, configuration skill, and generated Pi guidance with its test
  - Known entrypoints and skill paths: `pi-packages/pi-subagents/README.md:230,268,567,569,573`, `pi-packages/pi-subagents/skills/subagents-configuration/SKILL.md:115,117,147`, `src/harness/adapters/pi.ts:52`, `src/harness/adapters/pi.test.ts:169`
  - Inputs: AC-1/AC-2 behavior
  - Dependencies: same writer session
  - Output: doc and guidance edits
  - Owner: thoth-worker
  - Writes: those four files
  - Interface boundaries: generated guidance text contract
  - Focused check and PASS evidence: `pnpm test -- src/harness/adapters/pi.test.ts` passes; grep of `pi-packages/pi-antigravity-bridge/docs/` for observe-only `before_provider_request` wording reported (plan-review caution)
  - Return milestone: worker handoff with exact new wording
  - Stop / reassessment: guidance text is asserted elsewhere
- [x] AC-4: Routed docs describe the new policy
  - Outcome: updated `docs/agent/harness-packaging.md`, `docs/agent/agents-and-delegation.md`, `docs/installation.md`
  - Known entrypoints and skill paths: lines listed in Exploration
  - Inputs: worker's accepted wording
  - Dependencies: worker AC-4 unit accepted
  - Output: doc edits
  - Owner: root
  - Writes: those three files
  - Interface boundaries: none
  - Focused check and PASS evidence: diff review; `pnpm run check:ci` exit 0
  - Return milestone: before final verification
  - Stop / reassessment: docs describe additional behavior needing product decisions
- [x] AC-5: Full focused and root checks pass
  - Outcome: recorded exit codes for all AC-5 commands on frozen inputs
  - Known entrypoints and skill paths: `AGENTS.md` verified commands
  - Inputs: all edits
  - Dependencies: all units above
  - Output: check results
  - Owner: root
  - Writes: none
  - Interface boundaries: none
  - Focused check and PASS evidence: every AC-5 command exits 0
  - Return milestone: before final Oracle
  - Stop / reassessment: failures attributable to unrelated pre-existing issues are reported with evidence

## Authorization

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

## Verification

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 2c126992661e88351f5ef218e0685931ca8126d7b6a294eabc9a0bbd8e3cc6cc

Plan review: fresh Oracle subtask_thoth-oracle_1790912396033_c0ca147e returned [OKAY]
after the user explicitly selected review; the user then explicitly selected Implementar.
Final: fresh read-only Oracle subtask_thoth-oracle_1790913065812_33ae901a returned PASS on
the uncommitted working-tree diff with fresh checks.

- AC-1: PASS | `pnpm --filter @thoth-agents/pi-subagents run test` (config.test.ts) | default list ends with @thoth-agents/pi-openai-fast; 527 passed, 1 skipped
- AC-2: PASS | sdk-runner.ts:298-306 review + providers-real-sdk before_provider_request isolation test | passthrough return honored on cloned data; other seven observe-only events discard; unlisted stripped; thoth-agents excluded
- AC-3: PASS | providers-real-sdk.test.ts:904-937 real pi-openai-fast + onPayload fixture | child gpt-fixture-fast payload {model:gpt-fixture, service_tier:priority}; physical has none; worker revert-proof failed without AC-2
- AC-4: PASS | grep of docs, package docs, guidance; `pnpm exec vitest run src/harness/adapters/pi.test.ts` 13 passed | exception wording consistent, no stale claims
- AC-5: PASS | package typecheck/tests, root typecheck and check:ci exit 0; root `pnpm test` with THOTH_PLUGINS_ROOT | only the 46 baseline failures in the 5 pre-existing Codex/CLI files, identical on 0.5.0 dbddc12
- Source: pi-packages/pi-subagents/src/config.ts | sha256:d682a1ba4208fd80ea7a08c0e64e603165325339bb734cde971a7b542f2ad3b8
- Source: pi-packages/pi-subagents/src/runner/sdk-runner.ts | sha256:73e58d9b988ce9280dfc8abd5ef4f7bbd29a5772414443402b688963f1370367
- Source: pi-packages/pi-subagents/test/config.test.ts | sha256:9523d615a244d63382fabeed787a77f3f8642ffea6cf0f8a1d529977278efe78
- Source: pi-packages/pi-subagents/test/runner/providers-real-sdk.test.ts | sha256:c76ab6ebf57846386cb7903758982fcdb0c5296556a32c1ce1a365221b04a8aa
- Source: pi-packages/pi-subagents/test/runner/fixtures/codex-payload-provider.ts | sha256:084d54958d649545509a136a241312171c336a6d800f3d77a5d8c21094985375
- Source: pi-packages/pi-subagents/README.md | sha256:1c1294f55bb36ddcf3f3a5a7b2cf2d8c70806c7b2f634ef876fe025fee0d5f1a
- Source: pi-packages/pi-subagents/skills/subagents-configuration/SKILL.md | sha256:9373ac594adce41329e132650c052dbb9d6197010f96c98ebfb760038e9860a5
- Source: src/harness/adapters/pi.ts | sha256:8e70b243597064e2d7959ce27b026475fe8bbef7ec4296baa3afe763d2a932e7
- Source: src/harness/adapters/pi.test.ts | sha256:492fc4032813ab97e808d93c0d0f4a2b86b36556f08c97ea33a65b20771f2731
- Source: docs/agent/harness-packaging.md | sha256:6a173d55e1123207685f9858ca6b1e0609df7dc306c795cb0570af62a3b3a119
- Source: docs/agent/agents-and-delegation.md | sha256:42a4395cab98ee8abf7a9fc04b457f6b28bc734d4f263bbef607ef24df16c687
- Source: docs/installation.md | sha256:5c4e716a605cf3f15fbd50ade3ad87e0ca34821aebd0757ff56a7e50319e0225

## Closeout

**Archive**: READY
