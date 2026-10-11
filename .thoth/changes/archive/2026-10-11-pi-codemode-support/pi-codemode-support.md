# Change: pi-codemode-support

**Classification**: substantial
**Scope**: cross-cutting
**Uncertainty**: low
**Risk**: medium

## Exploration

- Pi 1.0.2 (installed, pinned) ships codemode as a builtin extension: `createCodemodeExtension()` registers an inactive `codemode` tool; activation is `defaultTools: ["+codemode"]` in settings; `codemode.mode` `on` keeps direct declarations, `only` hides script-callable ones. Tool exposure `model-only` is never script-callable (official docs `docs/codemode.md`, `docs/extensions.md#tool-exposure`).
- Codemode result details are `CodemodeToolDetails { calls: { id, name, args: string, status: running|ok|error|cancelled, durationMs?, error?, cost? }[], fullOutputPath? }`, exported from the SDK root (`dist/index.d.ts:29-30`, `dist/extensions/codemode/tool.d.ts:65-82`). Child calls carry no output payload.
- Reference product gentle-shell (PR #1582, #1612, #1726) wraps `createCodemodeExtension()` to replace presentation only, then writes `-builtin:codemode` with user consent; it added one prompt line and no subagent allowlist changes.
- Pi 1.0.2 exposes `pi.registerToolRenderer(resolver)` which chooses renderers for any tool, including tools registered by other extensions. `pi-thoth-theme` already registers a resolver with a built-in renderer map that takes precedence (`pi-packages/pi-thoth-theme/src/tools/index.ts:63-66,96-100`), so a codemode card needs no builtin replacement, no `-builtin:codemode` and no consent flow.
- Render kit: `pi-packages/pi-core/src/render-kit.ts` (`card`, `collapse`, `cachedComponent`, `statusGlyph`, `treeRow`, `renderToolFooter`, `getToolElapsedMs`) and `pi-packages/pi-core/src/duration.ts` (`formatDuration`).
- Delegation controls are registered `model-only` (`pi-packages/pi-subagents/src/tools/registry.ts:18-33`), so they stay direct under codemode; this is a documented boundary (`pi-packages/pi-subagents/README.md:508`).
- Pi root runtime guidance lives in `src/harness/adapters/pi.ts:43-48` (`<pi-runtime>`), child contracts in `src/harness/adapters/pi.ts:67-126`, specialist default allowlists in `src/harness/writers/pi-agent.ts:18-38`, generated copies in `pi/agents/*.md`. Root prompt cap `<15,600` is pinned in `src/agents/prompt-rendering.test.ts:825-834`.
- The installer reads global settings (`src/cli/pi-install.ts:1009`) and delegates package entries to native `pi install`; repository-owned writes use `writePiManagedText` with fresh merges for subagents/MCP config (`src/cli/pi-install.ts:859-867,2013-2024`). No merge exists for `defaultTools`/`codemode`.

## Intent

Thoth-agents supports Pi codemode as a first-class mode: the installer enables codemode by default in `mode: "on"`, Thoth's themed UI renders codemode calls as compact cards of their nested tool calls using the existing render kit, root and specialist prompts tell the model how to use codemode with Thoth's delegation boundary, and research/discovery specialists may batch tool calls through codemode.

## Non-goals

- Making delegation controls (`subagent_*`, `ask_orchestrator`) script-callable; root `subagent_*` controls are already `model-only`, and AC-5 makes the injected child `ask_orchestrator` `model-only` too.
- Replacing or wrapping Pi's builtin codemode extension, writing `-builtin:codemode`, or adding a consent flow.
- Enabling `codemode.mode: "only"` by default.
- Showing per-child tool output (not provided by Pi details).
- Codemode support for non-Pi harnesses.

## Acceptance

- AC-1: With `pi-thoth-theme` tools rendering enabled, the `codemode` tool renders through the render kit as a compact card: collapsed shows up to eight nested calls with name, status glyph and duration plus a count of the rest; expanded shows the script, script output and errors; Pi's codemode execute, schema and exposure are untouched; renderer output is cached for unchanged frames.
- AC-2: `thoth-agents` Pi installation merges global `settings.json` so codemode is selected in `defaultTools` (`+codemode` for absent or additive-only lists, plain `codemode` for empty or replacement lists, per Decisions) and `codemode.mode` is `"on"` when the user has not configured them; explicit user choices (any existing `codemode` / `-codemode` entry in `defaultTools`, any existing `codemode.mode`) and all unrelated settings are preserved; managed-write safety (symlink rejection) applies.
- AC-3: The Pi root `<pi-runtime>` guidance contains one concise codemode rule (batch independent reads/research/memory in one script when codemode is available; delegation, child replies and user questions stay direct calls), the root prompt stays under its pinned cap, and `thoth-explorer` and `thoth-librarian` default Pi allowlists include `codemode` with generated `pi/agents/*.md` in sync.
- AC-5: Lean Pi subagent children whose effective tool selection includes `codemode` get Pi's public `createCodemodeExtension()` (unwrapped) registered in their resource loader with mode `on`, so the `codemode` tool is actually available (not reported as dropped); scripts can call only the child's other selected script-callable tools, never excluded tools or `model-only` delegation controls; the injected `ask_orchestrator` is `model-only` (script calls denied before its handler runs, direct calls still work); children without `codemode` selected behave as before.
- AC-6: The `ask_user_question` tool from `pi-questions-user` is registered `model-only`, so it is never script-callable and stays a direct declaration under codemode `on`, codemode `only` (including user-preserved `only`) and without codemode.
- AC-4: Routed documentation (`docs/agent/harness-packaging.md`) describes codemode activation, rendering and the delegation boundary consistently with the implementation, and the record's durable deltas are archive-ready against the reviewed `pi-ecosystem` baseline (spec application happens at archive, after closeout).

## Clarifications

- Scope chosen by user: compatibility + installer + prompts + specialist allowlists + compact renderer (2026-10-11).
- Activation chosen by user: enable by default with `codemode.mode: "on"` (2026-10-11).

## Decisions

- Host the renderer in `pi-thoth-theme` via its existing `registerToolRenderer` resolver built-in map, not by wrapping `createCodemodeExtension()` (Pi 1.0.2 resolver API makes the gentle-shell builtin replacement unnecessary).
- `ask_user_question` (`pi-packages/pi-questions-user/src/index.ts:22-79`) currently has no exposure (direct), so it would be script-callable under `on` and lose its direct declaration under `only`; AC-6 sets it `model-only`. Task-list and background-task tools stay script-callable by design; documentation states the boundary only for delegation controls, `ask_orchestrator` and `ask_user_question`, not all control-plane tools.
- Root delegation controls stay `model-only` unchanged. The child-injected `ask_orchestrator` (`pi-packages/pi-subagents/src/runner/orchestrator-tool.ts:10-31`) currently has no exposure and defaults to direct, which is script-callable; AC-5 sets it to `model-only` unconditionally (model-only behaves as a direct call when codemode is absent, so non-codemode children are unaffected).
- User-owned settings win: the installer only fills absent codemode settings.
- Only explorer and librarian gain `codemode` by default; worker, designer and oracle allowlists are unchanged.
- `defaultTools` merge preserves the effective prior selection: absent key → `["+codemode"]`; existing additive-only list (every entry prefixed `+`/`-`, non-empty) → append `+codemode`; empty list or list with plain replacement entries → append plain `codemode`; any existing entry naming `codemode` (plain, `+` or `-`) → unchanged. Nested `codemode` object fields other than an absent `mode` (e.g. `inlineBudget`) are preserved.
- The merge re-reads `settings.json` at apply time, after native `pi install` package writes, never from preview content.
- Repository generation (`src/harness/generate-integration-packages.ts`, which rewrites `pi/**` including `pi/.thoth-agents-assets.json` and plugin trees) and `pnpm run build` are a serialized root step after AC-1, AC-2, AC-3, AC-5 and AC-6 join; workers do not run the generator.

## Durable deltas

- `ADDED pi-ecosystem` **Codemode compact rendering** — When Thoth theme tool rendering is enabled, the Pi `codemode` tool is drawn by the Thoth render kit as a card of its nested calls without replacing or wrapping Pi's builtin codemode extension.
  - GIVEN a codemode call whose details list nested calls; WHEN it renders collapsed; THEN it shows up to eight nested calls with name, status and duration and a count of the remaining calls, and expanded it shows the script, output and errors .
- `ADDED pi-ecosystem` **Codemode default activation** — The Pi installer enables codemode with mode `on` in global settings unless the user already configured codemode.
  - GIVEN global settings without codemode configuration; WHEN thoth-agents installs for Pi; THEN `defaultTools` selects codemode (`+codemode` additively, or plain `codemode` in an empty or replacement list) and `codemode.mode` is `on`, while existing user codemode choices and unrelated settings are preserved .
- `ADDED pi-ecosystem` **Codemode in lean subagent children** — A Thoth Pi subagent child whose tool selection includes `codemode` registers Pi's public codemode extension so the tool is available, scoped to the child's selected tools.
  - GIVEN a lean child whose tools include `codemode` and `read`; WHEN its session starts; THEN the `codemode` tool is registered and a script can call `read`, but cannot call unselected tools or `model-only` delegation controls .
- `ADDED pi-ecosystem` **Codemode delegation boundary** — Thoth delegation controls, the child `ask_orchestrator` tool and `ask_user_question` are `model-only` direct calls that codemode scripts cannot invoke, and root guidance directs batching only of script-callable work.
  - GIVEN codemode is active in mode `on` or `only`; WHEN the root delegates, replies to a child or asks the user, or a child asks the orchestrator; THEN those are direct tool calls that scripts cannot invoke, and independent reads, research or memory calls may be batched in one script .

## Plan

Five disjoint worker units (AC-1, AC-2, AC-3, AC-5, AC-6) run in parallel, then fresh Oracle final verification.

1. Theme renderer: add a `codemode` entry to the built-in renderer map in `pi-packages/pi-thoth-theme/src/tools/`, implemented with `pi-core` render kit primitives and `formatDuration`, reading `CodemodeToolDetails` from the SDK type exports; cache via the kit's cached component/memo helpers. Tests beside existing theme tool tests.
2. Installer settings merge: add a fill-absent merge of `defaultTools`/`codemode.mode` into global Pi `settings.json` through the existing managed-write path, ordered after native package installs; tests in `src/cli/pi-install.test.ts`; update `docs/agent/harness-packaging.md`.
3. Prompts and allowlists: one-line rule in `<pi-runtime>` (`src/harness/adapters/pi.ts`) within the measured 399-character headroom under the 15,600 cap, add `codemode` to explorer/librarian defaults (`src/harness/writers/pi-agent.ts`), update pinned tests.
4. Child runtime (AC-5): in `pi-packages/pi-subagents/src/runner/sdk-runner.ts` / `runner/lean-resources.ts`, when the effective child selection includes `codemode`, pass `createCodemodeExtension({ mode: "on" })` through `DefaultResourceLoader.extensionFactories`; offline real-SDK test in `pi-packages/pi-subagents/test/runner/` (extending `tool-selectors-real-sdk.test.ts` fixtures) proves registration, batching of a selected tool, and denial of unselected tools and delegation controls.
5. Root serialized step after join: run the repository generator for `pi/**` and plugin trees, `pnpm run build`, docs/delta consistency check, then `--through verify` and fresh final Oracle. Spec application and archive run in Closeout after PASS, not as a pre-verification task.

Focused checks: affected Vitest files, `pnpm run typecheck`, `pnpm run check:ci`, `pnpm run build` (packaged assets change).

## Tasks

- [x] AC-1: Codemode compact card renderer in pi-thoth-theme
  - Outcome: themed `codemode` renderer registered through the existing theme resolver
  - Known entrypoints and skill paths: `pi-packages/pi-thoth-theme/src/tools/index.ts`, `pi-packages/pi-thoth-theme/src/index.ts`, `pi-packages/pi-core/src/render-kit.ts`, `pi-packages/pi-core/src/duration.ts`, `pi-packages/pi-background-tasks/src/render/tools.ts` (renderer pattern), `node_modules/@earendil-works/pi-coding-agent/dist/extensions/codemode/tool.d.ts`
  - Inputs: Exploration and Decisions above
  - Dependencies: none
  - Output: renderer source and tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-thoth-theme/src/**`, `pi-packages/pi-thoth-theme/test/**` (or colocated tests), theme package README if it lists rendered tools
  - Interface boundaries: `ToolRenderers` renderCall/renderResult signatures; render kit API unchanged
  - Focused check and PASS evidence: theme package tests and typecheck pass; tests cover collapsed (≤8 calls + remainder count), expanded (script/output/errors), running/error/cancelled status, missing details fallback, cache reuse
  - Return milestone: tests green with summary of files changed
  - Stop / reassessment: if the resolver cannot override the builtin codemode renderer, return with evidence
- [x] AC-2: Installer fills codemode defaults in global Pi settings
  - Outcome: fill-absent merge for `defaultTools` `+codemode` and `codemode.mode: "on"`
  - Known entrypoints and skill paths: `src/cli/pi-install.ts` (`:1009`, `:1103-1173`, `:2013-2024`, `mergePiSubagentsConfig` at `:859-867`), `src/cli/pi-paths.ts:49`, `src/cli/pi-managed-write.ts`, `src/cli/pi-install.test.ts`, `docs/agent/harness-packaging.md`
  - Inputs: Decisions above
  - Dependencies: none
  - Output: merge implementation, tests, routed docs update
  - Owner: thoth-worker
  - Writes: `src/cli/pi-install.ts`, `src/cli/pi-install.test.ts`, new helper under `src/cli/` if needed, `docs/agent/harness-packaging.md`
  - Interface boundaries: native `pi install` remains owner of package entries; merge must not clobber them
  - Focused check and PASS evidence: `pi-install` tests pass covering absent key, additive-only list, `defaultTools: []`, replacement list, existing `+codemode`/`codemode`/`-codemode`, existing `codemode.mode`, preserved `codemode.inlineBudget`, unrelated fields, package entries written by native install after preview, symlink rejection, idempotent reinstall
  - Return milestone: tests green with summary
  - Stop / reassessment: conflicting ownership of `settings.json` with native install ordering
- [x] AC-3: Codemode prompt rule and specialist allowlists
  - Outcome: concise `<pi-runtime>` codemode rule; explorer/librarian allowlists include `codemode`; generated assets synced
  - Known entrypoints and skill paths: `src/harness/adapters/pi.ts:43-48`, `src/harness/writers/pi-agent.ts:18-38`, `src/harness/generate-integration-packages.ts`, `pi/agents/*.md`, `src/agents/prompt-rendering.test.ts`, `src/harness/adapters/pi.test.ts`, `src/harness/writers/pi-agent.test.ts`, `src/pi.test.ts`
  - Inputs: Decisions above
  - Dependencies: none
  - Output: prompt/allowlist changes and updated tests (generated assets are regenerated by root in AC-4)
  - Owner: thoth-worker
  - Writes: `src/harness/adapters/pi.ts`, `src/harness/writers/pi-agent.ts` and the listed test files only
  - Interface boundaries: root prompt cap `<15,600`; delegation call syntax unchanged
  - Focused check and PASS evidence: listed tests pass (tests reading generated `pi/agents/*.md` may be deferred to root's AC-4 regeneration and reported)
  - Return milestone: tests green with root prompt length reported
  - Stop / reassessment: cap exceeded without removing existing guidance
- [x] AC-5: Lean child sessions register Pi codemode when selected
  - Outcome: `codemode` in a child's effective tool selection loads the public codemode extension in that child
  - Known entrypoints and skill paths: `pi-packages/pi-subagents/src/runner/sdk-runner.ts:109-141,466-594`, `pi-packages/pi-subagents/src/runner/lean-resources.ts`, `pi-packages/pi-subagents/test/runner/tool-selectors-real-sdk.test.ts:726-1040`, `node_modules/@earendil-works/pi-coding-agent/dist/extensions/codemode/index.d.ts`, `node_modules/@earendil-works/pi-coding-agent/dist/core/resource-loader.js:239-253`
  - Inputs: Exploration, Decisions, round-2 plan review evidence E6-E8
  - Dependencies: none
  - Output: runner change and offline real-SDK tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-subagents/src/runner/**` (including `orchestrator-tool.ts`), `pi-packages/pi-subagents/test/runner/**`, `pi-packages/pi-subagents/README.md` codemode lines
  - Interface boundaries: root delegation controls stay `model-only`; injected `ask_orchestrator` becomes `model-only`; non-codemode children behave as before; no wrapping of the codemode factory
  - Focused check and PASS evidence: pi-subagents runner tests pass, including: codemode registered (not dropped) when selected; script calls a selected tool; script cannot reach an unselected tool; with `ask_orchestrator` selected, a script call is denied before its handler runs while a direct model call still works; no codemode when unselected
  - Return milestone: tests green with summary
  - Stop / reassessment: SDK loader cannot accept factories for lean children without broader resource changes
- [x] AC-6: ask_user_question is model-only
  - Outcome: question tool registered with `exposure: "model-only"`
  - Known entrypoints and skill paths: `pi-packages/pi-questions-user/src/index.ts:22-79`, its existing tests, `node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session.js:1099-1113,1289-1313,2777-2858`, `node_modules/@earendil-works/pi-coding-agent/dist/extensions/codemode/tool.js:204-246`
  - Inputs: round-4 plan review evidence E2-E4
  - Dependencies: none
  - Output: exposure change and tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-questions-user/src/**`, `pi-packages/pi-questions-user/test/**` (or colocated tests), its README if it documents exposure
  - Interface boundaries: question schema, UI behavior and answer semantics unchanged
  - Focused check and PASS evidence: pi-questions-user tests pass, including a real-SDK check that with codemode `on` and `only` a script call to `ask_user_question` is denied before its handler runs and the tool remains a direct provider declaration, and without codemode it remains directly callable
  - Return milestone: tests green with summary
  - Stop / reassessment: model-only rejected by the installed SDK for extension-registered tools
- [x] AC-4: Regenerated assets, build, and archive-ready docs/deltas before final verification
  - Outcome: generator outputs and build in sync; docs and durable deltas consistent with implementation; record passes `--through verify`
  - Known entrypoints and skill paths: `src/harness/generate-integration-packages.ts`, `pi/**`, `docs/agent/harness-packaging.md`, `.thoth/specs/pi-ecosystem/spec.md`
  - Inputs: accepted AC-1, AC-2, AC-3, AC-5, AC-6 outputs
  - Dependencies: AC-1, AC-2, AC-3, AC-5, AC-6
  - Output: regenerated assets, successful build, verify-ready record
  - Owner: root (serialized mechanical step)
  - Writes: generator outputs under `pi/**` and plugin trees, this record
  - Interface boundaries: archive (spec application) runs in Closeout after Oracle PASS, not in this task
  - Focused check and PASS evidence: `pnpm run build`, `pnpm run typecheck`, `pnpm run check:ci` pass; deferred generated-asset tests pass; `validate.mjs --through verify` valid
  - Return milestone: before requesting final Oracle
  - Stop / reassessment: generator drift outside codemode scope or stale source digest

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW

User selected Oracle review on 2026-10-11. Rounds 1-4 REJECT (AC-4 cycle; child codemode loading; ask_orchestrator and ask_user_question script-callable), each repaired in this record; round 5 fresh Oracle OKAY, envelope validated (exit 0). Nonblocking cautions: AC-6 `only` check must inspect provider request projection; inspect generator drift in AC-4.
**Implementation**: AUTHORIZED

User selected Implement on 2026-10-11 after plan-review OKAY.

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 6db661adf546c23e9997abf1bc62e621d2d20bcf09af12ad6df2ac0131f4ee08

Round 1 fresh Oracle FAIL (AC-1 split-card border colors); repaired by worker; round 2 fresh Oracle PASS, envelope validated (exit 0).
Residual non-change failures: pi-thoth-theme render-kit-real-sdk 2 lifecycle tests (host skill description >1024 chars, missing parent context; identical with HEAD runner); src/harness/release-workflow.test.ts Windows timing/EPERM (untouched; passed 10/10 in isolation for root); pi-questions-user ui.test.ts performance threshold under concurrent load (passed alone).

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS: AC-1 through AC-6 are satisfied. The repaired codemode card maintains consistent result-derived borders across both parts, including cached-header invalidation.",
  "evidence": [
    {
      "id": "E1",
      "kind": "behavior",
      "locator": "pi-packages/pi-thoth-theme/src/tools/codemode.ts; test/codemode.test.ts",
      "claim": "Codemode tests passed. An independent real-SDK ToolExecutionComponent probe verified running-to-success/failure border consistency, eight-call collapse plus remainder, expanded script/output/errors and invalidation.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E2",
      "kind": "implementation-and-tests",
      "locator": "src/cli/pi-install.ts; src/cli/pi-install.test.ts",
      "claim": "Merge preserves explicit selections, modes, nested and unrelated settings; uses fresh post-install reads and managed-path safety. Installer tests passed within the 377-test focused root run.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E3",
      "kind": "generated-artifacts",
      "locator": "src/harness/adapters/pi.ts; src/harness/writers/pi-agent.ts; pi/agents/; pi/.thoth-agents-assets.json",
      "claim": "One runtime codemode rule preserves direct delegation/replies/questions. Only Explorer/Librarian defaults gain codemode. All five generated agents match adapter output byte-for-byte and their manifest hashes; root prompt measures 15377/15600 characters.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E4",
      "kind": "governance-and-artifacts",
      "locator": "docs/agent/harness-packaging.md; .thoth/changes/pi-codemode-support/pi-codemode-support.md; .thoth/specs/pi-ecosystem/spec.md; dist/; pi-packages/*/dist/index.ts",
      "claim": "Documentation and four additive durable deltas agree with implementation. Verify gate passed; record prefix and baseline hashes match the assignment. Existing bundles contain repaired borders, child factory, model-only exposures and linked root guidance.",
      "basis": "observed",
      "uncertainty": "Generator and root build were not rerun, as instructed; bundle evidence is inspection of existing artifacts."
    },
    {
      "id": "E5",
      "kind": "real-sdk-tests",
      "locator": "pi-packages/pi-subagents/src/runner/sdk-runner.ts; src/runner/orchestrator-tool.ts; test/runner/",
      "claim": "253 runner tests passed, one skipped. Tests prove selected lean-child codemode registration, selected read execution, excluded-tool denial, model-only ask_orchestrator denial before handler execution, direct calls and unchanged unselected behavior.",
      "basis": "observed",
      "uncertainty": "One unrelated existing runner test remained skipped."
    },
    {
      "id": "E6",
      "kind": "real-sdk-tests",
      "locator": "pi-packages/pi-questions-user/src/index.ts; test/codemode-real-sdk.test.ts",
      "claim": "All three boundary cases passed: on, only and absent codemode. Actual provider projection retains direct question declarations; scripts cannot invoke the handler. Question implementation otherwise changes only exposure.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E7",
      "kind": "scope-and-checks",
      "locator": "git status; git diff; four untracked files; root and affected package typechecks; check:ci",
      "claim": "Reviewed all 23 changed/untracked files; no unrelated drift, version increments or added secrets found. Review-input digest stayed d056bdfd2a9e9eccf79b28715e620b72a6edd1d3da36aa4c8be3304c7440d9dd. Root and three affected package typechecks passed; check:ci exited successfully with warnings; diff whitespace check passed.",
      "basis": "observed",
      "uncertainty": "Secret assessment is bounded to the reviewed change, not a repository-wide audit."
    },
    {
      "id": "E8",
      "kind": "non-change-failure-assessment",
      "locator": "pi-packages/pi-thoth-theme/test/render-kit-real-sdk.test.ts:89,353-384; pi-packages/pi-subagents/src/runner/lean-resources.ts",
      "claim": "Theme suite reproduced the two named lifecycle failures while 1099 tests passed. Unchanged fixtures reject diagnostics, omit parent project context and select read rather than codemode. Read-only SDK catalog inspection confirmed orchestration skill description length 1038 exceeds 1024.",
      "basis": "inferred",
      "uncertainty": "Failure reproduction and catalog warning were observed; unchanged-cause attribution also uses source-path analysis and the assignment's HEAD reproduction report."
    },
    {
      "id": "E9",
      "kind": "non-change-failure-assessment",
      "locator": "pi-packages/pi-questions-user/test/ui.test.ts:1712; src/harness/release-workflow.test.ts",
      "claim": "Unchanged questionnaire performance test exceeded its threshold during concurrent suites, then passed alone in 474ms. Release-workflow test is unchanged; reported Windows timing/EPERM cleanup failures do not implicate this diff.",
      "basis": "inferred",
      "uncertainty": "Question performance rerun was observed. Release-workflow failures were not independently rerun."
    }
  ],
  "verification": [
    {
      "check": "AC-1",
      "method": "Source/test review, theme suite and independent real-SDK rendering probe",
      "outcome": "pass",
      "evidenceIds": ["E1"],
      "reason": "Compact rendering, expansion, caching and canonical border consistency verified; builtin execution/schema/exposure remain untouched."
    },
    {
      "check": "AC-2",
      "method": "Merge/path-safety review and installer tests",
      "outcome": "pass",
      "evidenceIds": ["E2"],
      "reason": "Default activation, explicit-choice preservation, post-native-install merging, symlink rejection and idempotence are covered."
    },
    {
      "check": "AC-3",
      "method": "Focused root tests and byte-exact generated-agent comparison",
      "outcome": "pass",
      "evidenceIds": ["E3", "E7"],
      "reason": "Guidance, restricted allowlist additions, generated synchronization and unchanged prompt cap verified."
    },
    {
      "check": "AC-4",
      "method": "Documentation/delta review, baseline hashing, verify validator and artifact inspection",
      "outcome": "pass",
      "evidenceIds": ["E4", "E7"],
      "reason": "Docs and deltas are coherent and archive-ready against the unchanged canonical baseline."
    },
    {
      "check": "AC-5",
      "method": "Affected runner suite using installed real SDK",
      "outcome": "pass",
      "evidenceIds": ["E5"],
      "reason": "Public factory loading and selected-tool/model-only boundaries are exercised without wrapping codemode."
    },
    {
      "check": "AC-6",
      "method": "Real-SDK script execution and provider-request projection tests",
      "outcome": "pass",
      "evidenceIds": ["E6"],
      "reason": "Questions remain direct and non-script-callable with on, only and no codemode."
    },
    {
      "check": "Scope, safety and freshness",
      "method": "Complete diff/untracked review, before/after input hashing, typechecks and check:ci",
      "outcome": "pass",
      "evidenceIds": ["E7"],
      "reason": "Inputs remained unchanged; no material scope, secret or governance drift found."
    },
    {
      "check": "Residual failure attribution",
      "method": "Failure reproduction, isolated performance rerun and unchanged-path analysis",
      "outcome": "pass",
      "evidenceIds": ["E8", "E9"],
      "reason": "Observed residual failures are environmental/pre-existing rather than acceptance regressions."
    },
    {
      "check": "Fresh generator/root build execution",
      "method": "Not executed",
      "outcome": "not-run",
      "evidenceIds": ["E4"],
      "reason": "Explicitly prohibited by the assignment; existing generated and bundled artifacts were inspected instead."
    }
  ],
  "risks": [
    {
      "description": "Full-suite cleanliness remains limited by existing lifecycle diagnostics and timing-sensitive tests. Release-workflow Windows failures were assessed from unchanged paths and supplied prior evidence, not rerun.",
      "severity": "low",
      "blocking": false,
      "evidenceIds": ["E8", "E9"]
    }
  ],
  "openQuestions": [],
  "nextAction": "Root: validate the unchanged envelope, record PASS evidence, and run closeout before archive.",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/pi-codemode-support/pi-codemode-support.md",
    "reviewedRecordSha256": "6db661adf546c23e9997abf1bc62e621d2d20bcf09af12ad6df2ac0131f4ee08"
  }
}
```

- AC-1: PASS | pnpm --dir pi-packages/pi-thoth-theme test + Oracle real-SDK render probe | 12 codemode tests pass; 1099 theme tests pass, 2 pre-existing environmental failures
- AC-2: PASS | pnpm vitest run src/cli/pi-install.test.ts | 205 tests pass incl. all merge rules, symlink rejection, idempotence
- AC-3: PASS | focused root vitest (adapters, writers, agents, pi.test) + generated asset hash match | root prompt 15,377 < 15,600
- AC-4: PASS | pnpm run build, pnpm run typecheck, pnpm run check:ci, validate --through verify | all exit 0; docs and deltas consistent
- AC-5: PASS | pnpm --dir pi-packages/pi-subagents test test/runner | 253 passed, 1 skipped; real-SDK codemode/ask_orchestrator boundary tests
- AC-6: PASS | pnpm --dir pi-packages/pi-questions-user test | 265 passed; real-SDK on/only/absent projection and script-denial tests
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:669fccc22600e27b3f58de77dea54fedf45978fb051bf34d12345fecc3543fbc

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
