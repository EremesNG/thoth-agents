# Change: pi-openai-fast-variants

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: medium
**Risk**: medium

## Exploration

- Workspace: `pnpm-workspace.yaml` includes `pi-packages/*`. Existing packages
  (`pi-antigravity-bridge`, `pi-background-tasks`, `pi-claude-bridge`,
  `pi-subagents`) are `@thoth-agents/*`, ESM, MIT, loaded by Pi from TypeScript
  `pi.extensions` entries, with `typecheck: tsc --noEmit` and Vitest `test`
  (Claude uses node:test). Dev deps on `@earendil-works/pi-coding-agent` /
  `pi-ai` resolve to `0.99.1`; peers are loose.
- `.github/workflows/ci.yml`: Ubuntu job runs root checks then per-package
  checks; `pi-packages-windows` runs `pnpm --filter <pkg> run typecheck` and
  `run test` (`test:unit` for Claude) for the four packages. `biome.json`
  includes `**` except Antigravity, Claude and background-tasks.
- No existing repo code handles `openai-codex-2`, `service_tier`, or fast
  variants. Thoth installer (`src/cli/pi-install.ts` `PI_PACKAGE_SPECS`) only
  installs `pi-subagents` from this workspace.
- Reference `2h2d-co/pi-openai-codex-fast@b2258b0` (MIT, v0.0.17): registers a
  separate provider `openai-codex-fast` from a hardcoded 8-model list of the
  static built-in `openai-codex` catalog, wraps `streamOpenAICodexResponses`
  with `serviceTier: "priority"`. It does not cover `openai` nor extension
  providers like `openai-codex-2`.
- Multi-account packages (`pi-codex-multi`, `pi-multi-pass`) register
  `openai-codex-N` at factory time by copying built-in Codex models with
  `api: "openai-codex-responses"`; `pi-multi-pass` also registers
  `refreshModels`, which replaces extension-provided model lists on refresh.
- Pi 0.99.1 (installed `dist`): named `registerProvider` re-registration
  shallow-merges but `models` replaces the full list (fragile for appending).
  `pi.registerVirtualModel({provider, id, name, thinkingLevels, contextWindow,
  maxTokens, input, route})` lists a selectable entry under any provider id,
  kept separately from physical catalogs; `route()` returns a physical model
  (with credentials) and thinking level per request; `ctx.model` and
  `model_change` name the virtual model; assistant messages record the physical
  model. `unregisterVirtualModel(provider, id)` exists. Both
  `openai-responses` and `openai-codex-responses` adapters send `model.id`,
  map `options.serviceTier` to `service_tier`, and invoke `onPayload`, which
  the SDK bridges to the chained `before_provider_request` event
  (`{type, payload}`; ctx exposes the selected `ctx.model`). Factory
  registrations of all extensions are flushed before `session_start`;
  registrations inside event handlers apply immediately. Credentials resolve
  per provider.

## Intent

Ship a new workspace Pi package `@thoth-agents/pi-openai-fast` that, for every
provider whose physical models use `api` `openai-responses` or
`openai-codex-responses` (built-in `openai`, `openai-codex`, and providers added
by other extensions such as `openai-codex-2`), exposes a sibling selectable
model `<provider>/<id>-fast` inside the same provider. Selecting it sends the
request to the physical `<provider>/<id>` with that provider's credentials and
`service_tier: "priority"`.

## Non-goals

- No hardcoded model allowlist and no configuration surface in this change.
- No separate `*-fast` provider; original providers and their catalogs,
  oauth, and refresh callbacks are never re-registered or mutated.
- No change to the thoth installer (`src/cli/pi-install.ts`), root plugin, or
  other harnesses; no publishing or version bumps of other packages.
- No guarantee of server-side priority entitlement/latency; unsupported tiers
  surface as normal provider errors.
- No propagation of virtual models into `pi-subagents` child runtimes.
- No priority tier for compaction summaries or other `direct` requests, and no
  change to compaction models chosen by core or other packages (for example
  `npm:pi-compaction-model`).
- No fork of the reference code; it is credited as design inspiration.

## Acceptance

- AC-1: After `session_start` (any reason), every physical model of every
  provider with api `openai-responses` or `openai-codex-responses` (including
  providers registered at factory time by another extension) has a virtual
  model `<id>-fast` under the same provider, mirroring the base model's
  display name (suffixed), thinking levels, context window, max tokens, and
  input types; other providers, existing virtual models, and models already
  ending in `-fast` get no variant; variants whose base disappeared are
  unregistered on the next sync.
- AC-2: With a `-fast` variant selected, each agent-loop request (route reason
  `user`, `continuation`, or `retry`) routes to the current physical base
  model of the same provider with the requested thinking level, and its
  outgoing payload has `model: <base id>` and `service_tier: "priority"`.
  Payloads not preceded by such a route of this extension are left unchanged,
  including `direct` requests (compaction summaries, extension calls),
  requests for compaction or other models chosen by another package even when
  they use the same base model, requests whose payload model differs from the
  routed base, and all requests when no fast variant is selected.
- AC-3: `pi-packages/pi-openai-fast` follows workspace conventions
  (`@thoth-agents/pi-openai-fast`, ESM, MIT `LICENSE`, `pi.extensions`, loose
  peers and `0.99.1` dev deps on Pi packages, `typecheck` and Vitest `test`),
  its README documents behavior/limits and credits
  `2h2d-co/pi-openai-codex-fast` (MIT, commit `b2258b0`), and its
  `typecheck` and `test` pass locally.
- AC-4: Both CI jobs in `.github/workflows/ci.yml` run the new package's
  `typecheck` and `test`; `AGENTS.md` and routed `docs/agent/` references to
  the Windows job's package list are updated; root `pnpm run check:ci` and
  `pnpm run typecheck` pass with the frozen lockfile updated.

## Clarifications

- Variant shape: same provider with `-fast` suffix (user, explicit).
- Model scope: all models of matching providers, discovered dynamically (user,
  explicit).
- Origin: new implementation with MIT attribution to the reference (user,
  explicit).
- Integration: workspace + CI only, not the thoth installer (user, explicit).
- Compaction: summaries keep the standard tier, and compaction models set by
  other packages such as `npm:pi-compaction-model` must not be affected
  (user, explicit, after plan review REJECT showing compaction bypasses
  `onPayload` at `agent-session.js:2079`, `compaction/compaction.js:463-486`).

## Decisions

- Mechanism: `pi.registerVirtualModel` per base model plus a
  `before_provider_request` handler, not provider re-registration, because
  re-registering `models` replaces catalogs and `refreshModels` callbacks of
  other extensions would drop appended entries.
- Provider discovery is by physical model `api`, so any provider id
  (`openai-codex-2`, `openai-codex-3`, custom) is covered without naming it.
- Sync runs on every `session_start` (startup, reload, new, resume, fork);
  it is idempotent and unregisters only variants this extension registered.
- The payload guard uses a one-shot route token: a variant's `route()` with
  reason `user`, `continuation`, or `retry` arms a token holding the routed
  base model id (and provider); `before_provider_request` applies
  `service_tier: "priority"` on a shallow copy only when an armed token exists
  and `payload.model` equals its base id. Every route first disarms any
  previous token, `direct` routes never arm it, and any received payload
  clears it (matching or not), so a failed or interrupted route cannot leak
  priority to a later request (accepted implementation refinement).
  `ctx.model` alone is not trusted because other packages can send requests
  for other or identical physical models while a variant is selected.
- Records are written in English to match repository documentation.

## Durable deltas

- None.

## Plan

**Package layout** (`pi-packages/pi-openai-fast/`): `package.json`
(`@thoth-agents/pi-openai-fast`, `0.1.0`, `type: module`, `license: MIT`,
`pi.extensions: ["./src/index.ts"]`, peers `@earendil-works/pi-coding-agent`
and `@earendil-works/pi-ai` `*`, dev deps `0.99.1`, Vitest `^4.1.9`,
TypeScript, `typecheck`/`test` scripts), `tsconfig.json` (ES2022, NodeNext,
strict, noEmit, node/vitest types, mirroring `pi-background-tasks`),
`vitest.config.ts`, `README.md`, `LICENSE`, `src/index.ts` (extension
factory), `src/variants.ts` (pure: select eligible base models, build virtual
definitions, diff against registered set), `src/payload.ts` (pure: decide
and apply the priority tier), colocated `src/*.test.ts`.

**Runtime flow**: factory subscribes to `session_start` and
`before_provider_request`. On `session_start`, read
`ctx.modelRegistry.getAll()`, keep physical models whose `api` is in the
target set and whose id does not end in `-fast`, compute desired variants,
`registerVirtualModel` new/changed ones and `unregisterVirtualModel` stale
ones from the extension's own tracked set. Each variant's `route()` resolves
`ctx.modelRegistry.find(provider, baseId)` at request time and returns it with
the requested thinking level (clamped to the base model's supported levels
using Pi's helper when available); a missing base throws a clear error.
`before_provider_request` applies the AC-2 guard and returns the patched
payload or `undefined`.

**Verification seams**: unit tests for `variants.ts`/`payload.ts`
(Vitest), and an in-process integration test loading the extension with Pi
0.99.1 test utilities or a minimal fake `ExtensionAPI`/`ctx` that registers a
second provider `openai-codex-2` with `openai-codex-responses` models,
asserting registered virtual entries, routing result, and payload mutation.
The writer confirms the exact Pi helper/API names against installed
`0.99.1` declarations before use and returns if a required API is absent.

**Risks**: virtual-model semantics in non-interactive modes and
`pi-subagents` children are untested; compaction and other `direct` requests
use the standard tier by design (Pi core compaction bypasses `onPayload`);
a token armed by a route whose stream fails before `onPayload` is cleared by
the next route or a non-matching payload is ignored, so stale tokens must not
leak priority to unrelated requests (tested); server rejection of `priority`
for some models/accounts. The writer must confirm in installed `0.99.1` that
agent-loop routing precedes `onPayload` for the same request and return if
not.

**Units**: (1) package implementation + tests + lockfile, Worker, owns
`pi-packages/pi-openai-fast/**` and `pnpm-lock.yaml`; (2) CI and docs wiring,
root (mechanical), owns `.github/workflows/ci.yml`, `AGENTS.md`,
`docs/agent/testing.md`, `docs/agent/harness-packaging.md`; depends on (1)'s
accepted package name and scripts; (3) final verification, fresh Oracle,
read-only.

## Tasks

- [x] AC-1: Virtual `-fast` variants registered for all eligible providers and models
  - Outcome: `src/variants.ts` + `src/index.ts` sync logic with passing unit and integration tests covering `openai`, `openai-codex`, and an extension-registered `openai-codex-2`
  - Known entrypoints and skill paths: `pi-packages/pi-background-tasks/{package.json,tsconfig.json,vitest.config.ts}` (conventions), installed `node_modules/@earendil-works/pi-coding-agent/dist/core/{virtual-models.d.ts,extensions/types.d.ts,model-registry.d.ts}`, skills `C:/Users/EremesNG/.pi/agent/skills/tdd/SKILL.md`, `C:/Users/EremesNG/.pi/agent/skills/simplify/SKILL.md`
  - Inputs: this record's Exploration, Decisions and Plan
  - Dependencies: none
  - Output: package source and tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-openai-fast/**`, `pnpm-lock.yaml`
  - Interface boundaries: Pi 0.99.1 `ExtensionAPI.registerVirtualModel`/`unregisterVirtualModel`, `ctx.modelRegistry`; must not call `registerProvider`
  - Focused check and PASS evidence: `pnpm --filter @thoth-agents/pi-openai-fast run test` passes with AC-1 cases
  - Return milestone: tests green for AC-1 and AC-2 together with AC-3 scaffold
  - Stop / reassessment: a required Pi API is missing or behaves differently from the Exploration facts
- [x] AC-2: Fast selection routes to base model and payload gets priority tier
  - Outcome: `route()` token arming and `src/payload.ts` guard with passing tests for fast agent-loop requests on both target APIs, non-fast selection, `direct` routes, same-base-model requests without an armed token (compaction-model package case), mismatched payload model, and stale-token clearing
  - Known entrypoints and skill paths: installed `pi-ai/dist/api/{openai-responses.js,openai-codex-responses.js}`, `pi-coding-agent/dist/core/extensions/types.d.ts` (`before_provider_request`)
  - Inputs: AC-1 unit design
  - Dependencies: none beyond the same writer session
  - Output: routing and payload code with tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-openai-fast/**`
  - Interface boundaries: `before_provider_request` chaining (return `undefined` when untouched)
  - Focused check and PASS evidence: `pnpm --filter @thoth-agents/pi-openai-fast run test` passes with AC-2 cases
  - Return milestone: same as AC-1
  - Stop / reassessment: `ctx.model` does not expose the virtual model during `before_provider_request`
- [x] AC-3: Package conventions, README attribution, LICENSE, local typecheck/test
  - Outcome: publishable-shaped workspace package passing `typecheck` and `test`
  - Known entrypoints and skill paths: `pi-packages/pi-background-tasks/README.md` (attribution style), `pi-packages/pi-subagents/LICENSE`
  - Inputs: AC-1/AC-2 code
  - Dependencies: none beyond the same writer session
  - Output: `package.json`, `tsconfig.json`, `vitest.config.ts`, `README.md`, `LICENSE`
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-openai-fast/**`, `pnpm-lock.yaml`
  - Interface boundaries: workspace lockfile; Biome must pass on the new files
  - Focused check and PASS evidence: `pnpm --filter @thoth-agents/pi-openai-fast run typecheck` and `run test` exit 0; `pnpm run check:ci` exit 0
  - Return milestone: worker handoff with commands and results
  - Stop / reassessment: lockfile changes outside the new package's entries
- [x] AC-4: CI jobs and docs list the new package
  - Outcome: Ubuntu and Windows CI jobs run the package checks; docs mention five packages
  - Known entrypoints and skill paths: `.github/workflows/ci.yml`, `AGENTS.md`, `docs/agent/testing.md`, `docs/agent/harness-packaging.md`
  - Inputs: accepted package name and scripts from AC-3
  - Dependencies: AC-3 accepted
  - Output: edited workflow and docs
  - Owner: root
  - Writes: `.github/workflows/ci.yml`, `AGENTS.md`, `docs/agent/testing.md`, `docs/agent/harness-packaging.md`
  - Interface boundaries: CI job structure unchanged other than added steps
  - Focused check and PASS evidence: `pnpm install --frozen-lockfile`, `pnpm run check:ci`, `pnpm run typecheck` exit 0; workflow diff reviewed
  - Return milestone: root diff ready for final Oracle
  - Stop / reassessment: CI layout differs from Exploration facts

## Authorization

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

The user explicitly selected Review plan with Oracle. Round 1 fresh Oracle
subtask_thoth-oracle_1790910710941_7d74e71d returned [REJECT] (compaction bypasses
`onPayload`); the record was narrowed per the explicit user decision on compaction
and other packages' compaction models. Round 2 fresh Oracle
subtask_thoth-oracle_1790911104705_d67ae306 returned [OKAY]. The user then
explicitly selected Implementar.

## Verification

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: b390adcfc90f9aff8a7fae0c06c893a825199b380dfd2585bd119c4dc7bf655e

Fresh read-only Oracle subtask_thoth-oracle_1790911362249_0d6696e2 returned PASS on the
uncommitted working-tree diff with fresh package and root checks. Fresh Oracle
subtask_thoth-oracle_1790911454394_22cdbfdd CONFIRMED the later Authorization reformat is
metadata-only (prefix 5990d3e3… -> b390adcf…) and that every Source digest matches.

- AC-1: PASS | `pnpm --filter @thoth-agents/pi-openai-fast run test` (variants.test.ts, index.test.ts) | variants for openai, openai-codex and openai-codex-2 by api; skips -fast, virtual and colliding ids; idempotent sync and stale unregister on session_start
- AC-2: PASS | `pnpm --filter @thoth-agents/pi-openai-fast run test` (payload.test.ts, index.test.ts) + Pi 0.99.1 agent-session.js:445, model-runtime.js:733, runner.js:1063-1087 | priority only after an agent-loop fast route with matching payload.model; direct, unrouted, mismatched, same-base other-package and stale-token cases unchanged
- AC-3: PASS | package `typecheck` exit 0; package `test` exit 0 (3 files, 21 tests) | conventions, MIT LICENSE, README attribution to 2h2d-co/pi-openai-codex-fast b2258b0
- AC-4: PASS | `pnpm install --frozen-lockfile`, `pnpm run check:ci`, `pnpm run typecheck` exit 0; git diff | both CI jobs run package typecheck/test; AGENTS.md and docs updated; lockfile +18 lines only in new importer
- Source: pi-packages/pi-openai-fast/package.json | sha256:56b4d83e38f1011d2df1e48c482c510f33ae8817e6847342928ea5d61f6a5c37
- Source: pi-packages/pi-openai-fast/README.md | sha256:5e39d4e93a73abd2de87a7ba2be3a06e2b1981c79bea226d76745212a4985ede
- Source: pi-packages/pi-openai-fast/LICENSE | sha256:b2e7c3b3cfad7860149c8bddc59636e70f6269e1c7c62ea7740eff9b75d7d47e
- Source: pi-packages/pi-openai-fast/src/index.ts | sha256:177ffc59b09619ea937ca4cbe774d2a4b87b6789cc020a882800d1d3de3c5755
- Source: pi-packages/pi-openai-fast/src/variants.ts | sha256:40b0e656613849d0a4fe7604017f505e0fde860f0602e96ba7fcce8848735f8c
- Source: pi-packages/pi-openai-fast/src/payload.ts | sha256:203e0e3359784d0d476dac89b63dd4dea9c8611320af7404f8aeac84e61c4c5c
- Source: .github/workflows/ci.yml | sha256:85d4ca6d0bdba5a6f927f7b2cfff14e5f7cc67ef953b0609469e9557615d7742
- Source: AGENTS.md | sha256:ece69cbea9d8954389e5fc0aede2fd0b7b236c63fcb67b7a5b99aa4b500abe18
- Source: docs/agent/testing.md | sha256:c2a9913c055f71f3469594b26cdd77fcf0c8bb362e322690ebd0fc0bf4fb849f
- Source: docs/agent/harness-packaging.md | sha256:5a807f9020a645fb1dfb94179c91e975abc2f8e9ad01685c1480f054710ffd01
- Source: pnpm-lock.yaml | sha256:46ca4545164a55743d731e4667e756ea79d2c96d080efb35ff339a46d92a51b6

## Closeout

**Archive**: READY
