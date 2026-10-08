# Change: pi-extension-bundles

**Classification**: substantial
**Scope**: cross-cutting
**Uncertainty**: medium
**Risk**: medium

## Exploration

- Measured on the operator's Windows machine (RPC `get_state` latency, Pi 1.1.0): `pi -ne` ~0.6 s; the nine first-party extensions loaded from TypeScript sources ~10.9-14 s; full normal startup ~12-18 s. External extensions add little.
- CPU profile of `pi-subagents` alone: ~1.36 s in jiti `moduleResolve` `tryStatSync`, ~1 s in jiti, ~30 ms in extension code. Published npm packages ship the same `.ts` sources, so installing from npm is no faster (~7.5 s vs ~7.4 s for eight extensions).
- Pi's loader (`pi-coding-agent` bundle `chunk-OIM2DMFI.js` `loadExtensionModule`) creates a fresh jiti instance per extension with `{moduleCache:false, alias}`. Aliases for `@earendil-works/*` and `typebox` apply only to transpiled files; a `.js` entry is imported natively, skips aliases and loads duplicate SDK copies from the package's own `node_modules` (observed in a profile). `import.meta.resolve`/`createRequire` are never aliased.
- Prototype: each extension bundled with esbuild into one ESM file with a `.ts` extension, externals `@earendil-works/*` and `typebox`: `pi-subagents` 3.5 s -> 0.8 s; all nine 10.9 s -> 2.7 s warm (7.2 s first run while jiti fills its cache), with no workspace SDK modules loaded.
- pi-core: already evaluated once per extension today (fresh jiti per extension); identity shared within one extension. Cross-extension state lives on `globalThis` under `Symbol.for(...)` (`render-kit.ts:442-493`, `tool-registry.ts:34-93`, `work-panel.ts:167-185`, `work-panel-lifecycle.ts:23-34`); channels use host `pi.events` with string names; no module-level `Symbol()`, `instanceof`, or top-level `let`. Experiment: registrations made through one copy are found and withdrawn through another. The work-panel registry key carries no version.
- Relocation-sensitive sites: `pi-background-tasks/src/windows-job-client.ts:58-60` spawns `./windows-job-helper.ps1` via `import.meta.url` (which loads sibling `.cs`); `pi-claude-bridge` inlined Claude Agent SDK 0.3.286 discovers its native executable through `createRequire(import.meta.url)` plus computed optional-package resolution; `pi-antigravity-bridge/src/patch-cleanup.ts:45,219,275-276,400-505` native `import.meta.resolve` of the SDK and reads of host package files (guarded with fallback); `pi-subagents/src/history.ts:12-32` module-relative `createRequire` for SQLite, `thread-view.ts:41,432-607` computed imports and manifest reads, `runner/pi-sdk-module.ts:7` computed SDK import. the task-list package, `pi-questions-user`, `pi-openai-fast`, `pi-thoth-theme` have no relocation-sensitive sites.
- esbuild 0.28.2 bundles all eight entries without diagnostics. No package has a build script or ships `dist`; `release.yml:121-129` builds only the root and publishes `pi-packages/*` with `--ignore-scripts`; `ci.yml` typechecks/tests packages but builds no bundle; tests import source entries; `pi-subagents/scripts/verify-package-files.mjs` and the task-list package `test/packed-real-sdk.test.ts` assert source files in the package.
- Already fixed separately (commit `3eb715f`): `pi-subagents/src/config.ts` resolved Pi's `yaml` through unaliased `import.meta.resolve`.

## Intent

Each first-party Pi extension package (`pi-subagents`, the task-list package, `pi-questions-user`, `pi-background-tasks`, `pi-antigravity-bridge`, `pi-claude-bridge`, `pi-openai-fast`, `pi-thoth-theme`) remains an individual npm package but publishes and loads one prebuilt single-file bundle instead of its TypeScript source graph, cutting Pi startup cost without changing extension behavior. pi-core stays a workspace package, is inlined into each bundle and becomes a build-time dependency; its npm publication continues unchanged.

## Non-goals

- Merging extensions into one package, or changing extension features.
- Changing the root `thoth-agents` `dist/pi.js` build (its native `.js` import of `pi-tui` is a separate follow-up).
- Changing Pi itself or its loader; any local dev-mode switch to load sources (rebuilding to see changes is accepted).
- Stopping pi-core npm publication; version bumps or publishing releases.
- Optimizing the remaining post-bundle startup cost beyond this change.

## Acceptance

- AC-1: Every one of the eight packages' `pi.extensions` points to a generated single-file bundle with a `.ts` extension that inlines pi-core and all other dependencies except `@earendil-works/*`, `typebox` and the per-package exceptions recorded in Decisions; inlined dependencies, including `@thoth-agents/pi-core`, are build-time only and the published file list ships the bundle and its runtime assets.
- AC-2: Loaded through Pi from an npm-style installation without sibling `@earendil-works/*` copies, every bundle activates without load errors, loads no duplicate `@earendil-works/*` module instances, and keeps its relocation-sensitive features working: background-task Windows job helper, Claude bridge executable discovery, subagents history storage and SDK module loading, antigravity patch cleanup.
- AC-3: pi-core process-wide registries tolerate copies of different pi-core versions in one Pi process: the render-kit and tool-definition registries use contract-versioned keys and consumers degrade to their no-registry behavior on incompatible records instead of throwing; the work panel keeps exactly one panel widget and one panel input listener per UI session across all copies through one version-independent ownership slot whose record carries its contract version, and a copy with an incompatible work-panel contract installs no host and registers no section instead of throwing.
- AC-4: The release workflow generates the bundles before publishing `pi-packages/*`; CI builds the bundles and runs an automated test that loads each built bundle through Pi's extension loader; packed package contents are verified against the bundle-based file list.
- AC-5: On the operator's machine, Pi RPC readiness with the nine first-party extensions loaded from bundles is at most 4 s warm (baseline ~10.9 s), and `pnpm run check:ci`, `pnpm run typecheck`, `pnpm run build`, `pnpm test` and every package typecheck/offline test pass.

## Clarifications

- pi-core shared state: resolved by evidence; separate copies already exist per extension today and shared state lives on `globalThis` `Symbol.for` keys. Remaining risk is version skew between independently built bundles, covered by AC-3.
- Local development: operator accepts rebuilding to see changes; no source-loading mode.
- pi-core publication: operator chose to keep publishing it unchanged (explicit answer).

## Decisions

- D1: Bundle format is ESM, platform node, target node22, one file per extension at `dist/index.ts` inside each package. The `.ts` extension is deliberate so Pi transpiles it with jiti and applies its host aliases; a `.js` entry would load duplicate SDK copies.
- D2: Always-external modules are `@earendil-works/*` and `typebox`. Per-package external exceptions (expected candidate: `@anthropic-ai/claude-agent-sdk`) are settled by the T1 spike evidence and recorded here before T2 starts; external exceptions stay in `dependencies`.
- D3: One shared product build script at the repository root drives esbuild (added as an explicit root devDependency) for all eight packages, with per-package configuration for entry, extra externals and assets to copy beside the bundle; each package gains a `build` script delegating to it.
- D4: Relocated asset references are fixed by copying the assets next to the bundle (background-tasks `.ps1`/`.cs`) or by source changes that keep resolution host-anchored, chosen per T1 evidence.
- D5: pi-core stays published unchanged; consuming packages move it to `devDependencies`.
- D6: Version skew is handled in pi-core, not by forcing synchronized installs. Render-kit and tool-definition registries use contract-versioned keys plus shape tolerance. The work panel and its lifecycle keep one version-independent `globalThis` slot so the canonical one-widget/one-listener-per-UI-session invariant holds across copies; the slot record carries the work-panel contract version, compatible copies share the host, and an incompatible copy stays out (no host, no section). Backward compatibility with the old unversioned key layout is not required beyond not creating a second host (Oracle plan review B1).

## Durable deltas

- `ADDED pi-ecosystem` **Bundled Pi extension packages** — Each first-party Pi extension package MUST declare as its Pi extension entry one generated single-file bundle with a `.ts` extension that inlines pi-core and every dependency except the host-provided `@earendil-works/*` and `typebox` modules and declared per-package exceptions, MUST ship the bundle and its runtime assets in its published files, and MUST NOT require pi-core or other inlined dependencies at runtime.
  - GIVEN a first-party Pi extension package installed from npm without sibling host SDK copies; WHEN Pi loads it; THEN Pi transpiles one bundle file through its aliases, no duplicate host SDK module is loaded, and the extension activates with its runtime assets available.
- `ADDED pi-ecosystem` **Version-tolerant pi-core registries** — pi-core render-kit and tool-definition registries stored on `globalThis` MUST use keys that include their contract version, and consumers MUST fall back to their no-registry behavior when a stored record does not match the expected shape; the work panel MUST keep one version-independent ownership slot so that exactly one panel widget and one panel input listener exist per UI session across pi-core copies, and a copy with an incompatible work-panel contract MUST install no host and register no section instead of throwing.
  - GIVEN two extensions bundled with different pi-core versions in one Pi UI session; WHEN both look up the registries and register work-panel sections; THEN one panel widget and one input listener exist, compatible sections share it, an incompatible copy contributes no section, and neither extension throws.
- `ADDED release-publishing` **Pi extension bundles built before publication** — The tag-triggered release MUST generate every Pi extension bundle before publishing `pi-packages/*`, and CI MUST build the bundles and load each one through Pi's extension loader.
  - GIVEN a release tag for a Pi extension package version not yet on npm; WHEN the release workflow publishes Pi packages; THEN the published tarball contains the freshly generated bundle referenced by its Pi extension entry.

## Plan

Approach: add a root esbuild-based bundle build for the eight packages, retarget each manifest to `dist/index.ts`, move inlined dependencies to dev, copy runtime assets, harden pi-core registries for version skew, and add build plus load verification to CI and release.

Work-unit boundaries:
1. T1 spike (read-only, temp-dir experiments): build real bundles, install them npm-style outside the repo, load them in Pi RPC and exercise each relocation-sensitive feature; output per-package external exceptions and required source/asset fixes. Root records them in Decisions before T2.
2. T2 bundle build: root build script, esbuild devDependency, per-package `build` scripts, manifest `pi.extensions`/`files`/`main`, dependency moves, asset copy and source fixes from T1, package-verification updates (`verify-package-files.mjs`, `packed-real-sdk.test.ts`). Depends on T1.
3. T3 pi-core registry versioning and shape tolerance with tests. Independent of T1/T2 (writes only `pi-packages/pi-core/src` and its tests).
4. T4 load test and workflows: automated test loading each built bundle through Pi's extension loader from an npm-style layout; CI job steps to build and run it; release step to build bundles before `pi-packages/*` publish. Depends on T2.
5. T5 root measurement and full pre-merge checks. Depends on T2, T3, T4.

Interfaces: package manifests (`pi.extensions`, `files`, dependencies), pi-core registry keys (all consumers are first-party bundles rebuilt together), `.github/workflows/ci.yml` and `release.yml`. Mutable surfaces are disjoint per unit (T3 pi-core vs T2 manifests/build script vs T4 tests/workflows).

Freeze inputs: T1 evidence predates T3 edits; rebuild bundles after T2/T3 land before T4 loader tests, packing and T5 timing.

Risks: SDK native executable discovery after inlining (mitigated by external exception); computed imports bypassing aliases; jiti cold-cache first start (~7 s observed once); larger tarballs; tests still exercising sources rather than bundles (mitigated by T4).

## Tasks

- [ ] AC-2: Spike real bundles in Pi and settle externals and relocation fixes
  - Outcome: per-package evidence of which modules must stay external and which source or asset fixes the bundles need
  - Known entrypoints and skill paths: `pi-packages/*/package.json` `pi.extensions`; `pi-background-tasks/src/windows-job-client.ts`; `pi-claude-bridge/src/index.ts`; `pi-antigravity-bridge/src/patch-cleanup.ts`; `pi-subagents/src/history.ts`, `src/thread-view.ts`, `src/runner/pi-sdk-module.ts`
  - Inputs: Exploration facts above
  - Dependencies: none
  - Output: table per package of externals, failures observed, and minimal fix candidates with facts
  - Owner: thoth-explorer
  - Writes: none (OS temp dir only)
  - Interface boundaries: Pi host loader; no repo or `~/.pi` edits
  - Focused check and PASS evidence: each bundle loads in `pi --mode rpc -ne --no-session -e <bundle>` from an npm-style temp install with no load error, and each relocation-sensitive feature is exercised with its result recorded
  - Return milestone: all eight packages characterized
  - Stop / reassessment: a feature that cannot be exercised headlessly is returned with the exact gap
- [ ] AC-1: Implement bundle build and bundle-based package manifests
  - Outcome: `pnpm` build produces `dist/index.ts` for all eight packages, manifests point at it, inlined deps are dev-only, assets ship beside the bundle
  - Known entrypoints and skill paths: root `package.json`, new root bundle script, `pi-packages/*/package.json`, `pi-subagents/scripts/verify-package-files.mjs`, the task-list package `test/packed-real-sdk.test.ts`; skills `C:\Users\EremesNG\.pi\agent\skills\tdd\SKILL.md`, `C:\Users\EremesNG\.pi\agent\skills\simplify\SKILL.md`
  - Inputs: accepted T1 output and Decisions D1-D5
  - Dependencies: T1 accepted
  - Output: build script, manifest and source/asset fixes
  - Owner: thoth-worker
  - Writes: root `package.json`, `pnpm-lock.yaml`, root bundle script, `pi-packages/{8 packages}/package.json`, T1-identified source files, package verification files
  - Interface boundaries: Pi extension entry contract; must not touch `pi-packages/pi-core/src`, workflows
  - Focused check and PASS evidence: bundle build succeeds for all eight; package typechecks/offline tests pass; `npm pack --dry-run` per package lists the bundle and assets
  - Return milestone: all eight bundles built and packed lists verified
  - Stop / reassessment: a package whose bundle cannot be made equivalent without behavior change
- [ ] AC-3: Make pi-core registries tolerate mixed pi-core copies with one work-panel host
  - Outcome: versioned render-kit/tool-registry keys with shape-tolerant consumers, and a single version-independent work-panel ownership slot
  - Known entrypoints and skill paths: `pi-packages/pi-core/src/render-kit.ts`, `tool-registry.ts`, `work-panel.ts`, `work-panel-lifecycle.ts`, `work-panel-host.ts`; canonical `.thoth/specs/pi-ecosystem/spec.md` Thoth Pi work panel; skill `C:\Users\EremesNG\.pi\agent\skills\tdd\SKILL.md`
  - Inputs: Exploration pi-core facts; D6
  - Dependencies: none
  - Output: pi-core source and tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-core/src/**`
  - Interface boundaries: pi-core public exports unchanged in signature
  - Focused check and PASS evidence: new tests load two isolated pi-core copies (same and incompatible contract versions, plus a pre-change unversioned-layout record) into one simulated UI session and assert exactly one widget and one input listener, shared sections for compatible copies, no section and no throw for the incompatible copy, and fallback on malformed render-kit/tool-registry records; pi-core and consumer package tests pass
  - Return milestone: tests green
  - Stop / reassessment: a consumer requiring an export signature change
- [ ] AC-4: Add bundle load test, CI build and release build step
  - Outcome: automated loader test over built bundles, CI and release run the build
  - Known entrypoints and skill paths: `.github/workflows/ci.yml`, `.github/workflows/release.yml`, T2 build script
  - Inputs: accepted T2 output
  - Dependencies: T2 accepted
  - Output: test file(s) and workflow edits
  - Owner: thoth-worker
  - Writes: new load test, `.github/workflows/ci.yml`, `.github/workflows/release.yml`
  - Interface boundaries: release publication order and trusted publishing unchanged except the added build
  - Focused check and PASS evidence: load test passes locally for all eight bundles and fails when an entry points to a missing bundle; workflow YAML validated by reading the job order
  - Return milestone: test green locally
  - Stop / reassessment: Pi loader not reachable from tests without the global install
- [ ] AC-5: Measure startup and run full pre-merge checks
  - Outcome: recorded warm startup time and full check results
  - Known entrypoints and skill paths: operator's `C:\DEV\Proyectos\Webstorm\thoth-agents` layout is not used; measure bundles built in this worktree
  - Inputs: accepted T2, T3, T4
  - Dependencies: T2, T3, T4 accepted
  - Output: timings and check results in Verification
  - Owner: root
  - Writes: this record
  - Interface boundaries: none
  - Focused check and PASS evidence: warm RPC readiness at most 4 s; `pnpm run check:ci`, `pnpm run typecheck`, `pnpm run build`, `pnpm test`, package typechecks/offline tests pass
  - Return milestone: all results recorded
  - Stop / reassessment: timing above 4 s returns profiling evidence

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

Round 1 fresh Oracle [REJECT] B1 (work-panel singleton under version skew); repaired in AC-3/D6/delta/T3. Round 2 fresh Oracle [OKAY]. Cautions for T3: test legacy coexistence in both activation orders; gate lifecycle/focus entrypoints as well as registration/installation.

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: PENDING
**Independent from implementer**: PENDING
**Verdict**: PENDING
**Reviewed record SHA-256**: PENDING

- AC-1: PENDING | check | evidence
- AC-2: PENDING | check | evidence
- AC-3: PENDING | check | evidence
- AC-4: PENDING | check | evidence
- AC-5: PENDING | check | evidence
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:c7a07346085230856a0c7c5dbb804def51ff7ac7156ebcd304f41427e4863959
- Source: .thoth/specs/release-publishing/spec.md | sha256:49bc3bc8d19fbbebf25069d7136d7a400d070e5d65b8c6cb780c49ef04112d26

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: PENDING
