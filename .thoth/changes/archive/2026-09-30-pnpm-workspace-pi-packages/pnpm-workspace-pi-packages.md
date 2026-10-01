# Change: pnpm-workspace-pi-packages

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: medium
**Risk**: medium

## Exploration

- Pi 0.99.1 does not install dependencies for local-path packages: local install
  only resolves the path (`pi-coding-agent/dist/core/package-manager.js:783-808`,
  `:1009-1013`); thoth-agents `src/cli/pi-install.ts` (`:448-522`, `:905`,
  `:1065`) and `scripts/setup-pi-local.mjs` do not install `pi-packages`
  dependencies either. Today each package needs a manual `npm ci`.
- `pnpm-workspace.yaml:1-14` has no `packages` list; it sets `allowBuilds`
  (denies `@google/genai`, `protobufjs`), overrides (hono, postcss,
  `tsx 4.22.2`) and `minimumReleaseAge: 4320`. No root `.npmrc`. Root
  `package.json` pins pnpm 11.2.2; published `files` exclude `pi-packages`.
- CI (`.github/workflows/ci.yml:21-40,48-51`): frozen root install, Biome, root
  typecheck/test only. Release workflow installs root and publishes the root
  package only. Root tsconfig/vitest cover `src` only.
- Each pi-package keeps an npm `package-lock.json` and npm-invoking scripts:
  pi-subagents `check`/`prepublishOnly`/pack (`package.json:44-51`), antigravity
  `check` (`:43-73`), claude-bridge `test` (`:28-32`, live API integrations).
- pi-subagents tests import `@earendil-works/pi-ai` and `pi-agent-core` without
  declaring them (`test/runner/tool-selectors-real-sdk.test.ts:4,129,315`,
  `test/runner/fixtures/{native-only-provider,provider-fixture}.ts`); npm
  hoisting masked this. claude-bridge asks `tsx ^4.22.4` while the root override
  pins `4.22.2`.
- Pi's extension loader aliases Pi/typebox to host modules and imports the
  extension through jiti without a flat-`node_modules` requirement
  (`extensions/loader.js:38-84,454-464`); pnpm symlink compatibility is inferred
  from code, not yet smoke-tested.
- Docs with npm development instructions: pi-subagents `README.md:572-601`,
  antigravity `AGENTS.md:39-42`, claude-bridge `README.md:101`;
  `docs/agent/testing.md:42-48` documents root-only CI.

## Intent

A root `pnpm install` installs every package under `pi-packages/` through one
pnpm workspace and lockfile, packages use pnpm for all scripts, and CI verifies
each package's typecheck and offline tests.

## Non-goals

- Publishing/release workflow and tag rules for Pi packages (deferred to a separate change).
- Version bumps or npm publication of any package.
- Changing root product behavior, published root `files`, or the Pi installer.
- Deduplicating Pi SDK versions across packages.
- Loosening the root `allowBuilds` deny policy unless verification proves a
  denied lifecycle script is required.
- Running claude-bridge live integration tests anywhere.

## Acceptance

- AC-1: `pnpm-workspace.yaml` lists `pi-packages/*`; one root `pnpm-lock.yaml`
  covers all importers; the three package `package-lock.json` files are removed;
  `pnpm install --frozen-lockfile` from a clean checkout installs every package
  and exits 0.
- AC-2: Every package script that invoked npm (check, test, pack, prepublish)
  invokes pnpm instead; pi-subagents declares its directly imported Pi SDK test
  dependencies; each package's typecheck and offline tests pass under the pnpm
  isolated layout (pi-subagents Vitest, antigravity Vitest, claude-bridge
  `test:unit`).
- AC-3: CI runs, after the root checks, each package's typecheck and offline
  tests through pnpm (`--filter`), never claude-bridge live tests.
- AC-4: Development documentation for the three packages and
  `docs/agent/testing.md` describe root `pnpm install` and the pnpm commands; no
  checkout instruction still requires npm.
- AC-5: Pi 0.99.1 loads all three packages from the pnpm-installed workspace in a
  fully isolated subprocess (disposable `HOME`/`USERPROFILE`, temporary
  `PI_CODING_AGENT_DIR`, isolated XDG/subagent-history dirs, with `os.homedir()`
  confirmed inside the disposable home before loading): the SDK session reports no
  extension load errors, the `antigravity` and `claude-bridge` providers are
  registered, and `session.getAllTools()` includes the subagent tools. Model
  catalogs needing real provider login are not required.
- AC-6: Root `pnpm run check:ci`, `pnpm run typecheck`, `pnpm run build` pass;
  root `pnpm test` shows no new failures beyond the documented environmental
  ones (Orca `CODEX_HOME`, missing `../thoth-plugins`).

## Clarifications

- CI runs each package's typecheck and offline tests (user, 2026-09-30).
- All package npm scripts move to pnpm, including publish/pack scripts; the Pi
  package release workflow and tag rules are deferred to a separate change (user, 2026-09-30).

## Decisions

- Workspace, not a root postinstall loop: one lockfile, one install, no
  lifecycle-script dependency (Explorer recommendation).
- Keep the root `allowBuilds` deny list; only change it with evidence that a
  denied script is needed for load or tests, recorded here.
- Resolve the `tsx` override conflict by raising the root override to the lowest
  version satisfying `^4.22.4` that passes `minimumReleaseAge`; if none exists,
  scope the override so claude-bridge keeps its range.
- Each package keeps its own Pi SDK dev versions; no forced dedupe.
- AC-5 live load check runs against this worktree in a subprocess with a
  disposable home (`HOME` and `USERPROFILE`), temporary `PI_CODING_AGENT_DIR`,
  and isolated XDG/subagent-history dirs, because antigravity reads/writes
  `os.homedir()/.pi/agent` directly (`src/models.ts:193-278`, `src/config.ts:18-37`,
  `extensions/index.ts:227`); verification inspects extension errors, registered
  providers and `session.getAllTools()`, not only `--list-models` exit status.
- Release-age exclusion (user, 2026-09-30): the first workspace install failed
  `minimumReleaseAge` (4320 min) on 26 versions, all `@earendil-works/*` 0.99.1
  (published 2026-09-29) and `@anthropic-ai/claude-agent-sdk*` 0.3.284 (2026-09-28),
  the versions already run in production. Add `minimumReleaseAgeExclude` for exactly
  `@earendil-works/*` and `@anthropic-ai/claude-agent-sdk*`; every other dependency
  keeps the 3-day window.
- Implementation checkpoint (root, 2026-09-30): workspace `packages` and
  `minimumReleaseAgeExclude` added; root and workspace `tsx` override 4.22.4;
  pi-subagents devDeps pi-ai/pi-agent-core 0.99.1; all npm-invoking package
  scripts use pnpm; three npm lockfiles deleted; `pnpm-lock.yaml` has four
  importers. Clean `pnpm install --frozen-lockfile` exit 0 (all node_modules
  removed first). Filtered checks: pi-subagents typecheck 0, tests 413/413 on two
  serial runs (a first run under parallel load had the same 4 known load-sensitive
  timeouts seen before in this worktree); antigravity typecheck 0, 542 passed / 9
  skipped; claude-bridge typecheck 0, test:unit 290/290, operator config hash
  unchanged. CI adds three filtered steps (YAML parses). Docs updated;
  antigravity docs now name real scripts (`typecheck`, `scripts/smoke-in-pi.sh`)
  instead of the missing `build`/`smoke:pi`. AC-5 isolated SDK probe (disposable
  HOME/USERPROFILE, temp agent dir, XDG and both history vars, cleared debug vars,
  unavailable AGY_BIN): three extensions loaded, extensionErrors [], providers
  antigravity and claude-bridge registered, 7 subagent_* tools in getAllTools();
  operator ~/.pi/agent hashes and antigravity-bridge listing unchanged. Root:
  check:ci 0, typecheck 0, build 0 (no generated drift), `pnpm test` without Orca
  CODEX_HOME 1142 passed / 4 failed, all publish-marketplace ENOENT on missing
  ../thoth-plugins. Follow-up: 4 load-sensitive pi-subagents tests may flake in CI.
- Final verification round 1 (fresh Oracle): FAIL on AC-4 only (antigravity docs
  still used npm-backed `npx tsx`). Repair: `AGENTS.md`, `docs/DEVELOPMENT.md` and
  the probe-notes file under `docs/` use `pnpm exec tsx` from `pi-packages/pi-antigravity-bridge`;
  `pnpm exec tsx --version` there reports 4.22.4. Other ACs passed and are
  unaffected by this docs-only repair.

## Durable deltas

- `ADDED project-tooling` **Install and verify Pi packages through the pnpm workspace** — Packages under `pi-packages/` MUST be pnpm workspace members installed by the root `pnpm install` from the single root lockfile, MUST invoke pnpm in their scripts, and CI MUST run each package's typecheck and offline tests.
  - GIVEN a clean checkout; WHEN `pnpm install --frozen-lockfile` runs at the root and CI proceeds; THEN every `pi-packages/*` package has its dependencies installed without per-package npm lockfiles AND CI fails if any package typecheck or offline test fails .

## Plan

1. Workspace + lockfile (worker, sole writer of root `pnpm-workspace.yaml`,
   `pnpm-lock.yaml`, package manifests, package lockfile deletions): add
   `packages`, resolve `tsx` override, declare pi-subagents SDK test deps, switch
   package scripts to pnpm, `pnpm install`, run each package's typecheck and
   offline tests.
2. CI + docs (root, after 1): `ci.yml` filtered package steps; update package
   READMEs/AGENTS and `docs/agent/testing.md`.
3. Live load (root, after 1): isolated subprocess per AC-5 (disposable home, temp agent dir,
   both history env vars, cleared debug overrides, unavailable AGY_BIN; no provider turns).
4. Root checks, fresh Oracle verification, apply durable delta at archive.

## Tasks

- [x] AC-1: pnpm workspace and single lockfile
  - Outcome: root frozen install installs all three packages
  - Known entrypoints and skill paths: `pnpm-workspace.yaml`, `package.json`, `pi-packages/*/package.json`, `pi-packages/*/package-lock.json`
  - Inputs: Exploration, Decisions
  - Dependencies: none
  - Output: workspace config, regenerated `pnpm-lock.yaml`, removed npm lockfiles
  - Owner: worker
  - Writes: `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `pi-packages/*/package.json`, `pi-packages/*/package-lock.json` (delete)
  - Interface boundaries: root package identity and published files unchanged
  - Focused check and PASS evidence: fresh `pnpm install --frozen-lockfile` exit 0 with all importers
  - Return milestone: install green
  - Stop / reassessment: a denied lifecycle script or release-age constraint blocks install
- [x] AC-2: pnpm scripts and strict-layout package checks
  - Outcome: each package typecheck and offline tests pass under pnpm
  - Known entrypoints and skill paths: `pi-packages/*/package.json` scripts, pi-subagents tests importing pi-ai/pi-agent-core
  - Inputs: AC-1 workspace
  - Dependencies: AC-1 (same writer)
  - Output: pnpm scripts, declared test deps, green checks
  - Owner: worker
  - Writes: `pi-packages/*/package.json`, `pnpm-lock.yaml`
  - Interface boundaries: package runtime code unchanged
  - Focused check and PASS evidence: `pnpm --filter <pkg> typecheck` and offline test script exit 0 for all three
  - Return milestone: package checks green
  - Stop / reassessment: strict layout exposes a runtime (non-test) undeclared import
- [x] AC-3: CI runs package checks
  - Outcome: CI verifies each package
  - Known entrypoints and skill paths: `.github/workflows/ci.yml`
  - Inputs: AC-2 script names
  - Dependencies: AC-2
  - Output: filtered pnpm steps
  - Owner: root
  - Writes: `.github/workflows/ci.yml`
  - Interface boundaries: existing root steps unchanged; no live claude tests
  - Focused check and PASS evidence: each new step command runs locally exit 0; workflow YAML parses
  - Return milestone: steps green locally
  - Stop / reassessment: none expected
- [x] AC-4: pnpm development docs
  - Outcome: docs describe root pnpm install and pnpm commands
  - Known entrypoints and skill paths: `pi-packages/pi-subagents/README.md`, `pi-packages/pi-antigravity-bridge/AGENTS.md`, `pi-packages/pi-claude-bridge/README.md`, `docs/agent/testing.md`
  - Inputs: AC-2 script names
  - Dependencies: AC-2
  - Output: updated docs
  - Owner: root
  - Writes: those docs
  - Interface boundaries: npm distribution identifiers (`npm:` sources) unchanged
  - Focused check and PASS evidence: grep finds no npm checkout-install instruction for pi-packages
  - Return milestone: docs updated
  - Stop / reassessment: none expected
- [x] AC-5: Pi loads packages from the pnpm layout
  - Outcome: isolated real Pi SDK session loads all three packages without load errors
  - Known entrypoints and skill paths: subprocess with disposable `HOME`/`USERPROFILE`, temporary `PI_CODING_AGENT_DIR` whose settings list local paths to this worktree's `pi-packages/*`, SDK `createAgentSession`, `session.getAllTools()`
  - Inputs: AC-1 install
  - Dependencies: AC-1
  - Output: load evidence
  - Owner: root
  - Writes: none in the repo (temp dir only)
  - Interface boundaries: operator `~/.pi/agent` untouched
  - Focused check and PASS evidence: `os.homedir()` resolves inside the disposable home; no extension load errors; `antigravity` and `claude-bridge` providers registered; subagent tools present in `session.getAllTools()`; operator `~/.pi/agent` unchanged (hash of settings/claude-bridge.json and antigravity cache mtime)
  - Return milestone: evidence captured
  - Stop / reassessment: loader fails on symlinked layout
- [x] AC-6: Root checks
  - Outcome: root gates unchanged
  - Known entrypoints and skill paths: root scripts
  - Inputs: AC-1..AC-4
  - Dependencies: AC-1, AC-2, AC-3, AC-4
  - Output: check evidence
  - Owner: root
  - Writes: none
  - Interface boundaries: none
  - Focused check and PASS evidence: `check:ci`, `typecheck`, `build` exit 0; `pnpm test` failures limited to documented environmental ones
  - Return milestone: gates green
  - Stop / reassessment: new root failure

## Authorization

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

The user explicitly selected Review plan with Oracle. Round 1 fresh Oracle returned
[REJECT] (AC-5 isolation), repaired in this record; round 2 fresh Oracle
subtask_thoth-oracle_1790809388027_c80dec14 returned [OKAY].

## Verification

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 57a596c63f2525ea9e686f49286352d25ef2455d225376e36b63c49a76205401

Fresh read-only Oracle subtask_thoth-oracle_1790813531805_d63b7fe4 (round 2) returned
PASS; round 1 subtask_thoth-oracle_1790810520150_291d876b failed AC-4 only, repaired.

- AC-1: PASS | workspace and lockfile inspection + clean frozen install | four importers; npm lockfiles deleted; release-age exclusion scoped to two families; frozen install exit 0
- AC-2: PASS | manifests + filtered package checks | pnpm-only scripts; SDK test deps declared; typechecks exit 0; tests 413, 542 passed/9 skipped, 290
- AC-3: PASS | ci.yml parse and command check | three filtered package steps after root checks; claude-bridge runs only test:unit
- AC-4: PASS | docs scan of 29 files + command targets | zero npx and no npm checkout instruction; documented scripts exist; pnpm exec tsx reports 4.22.4
- AC-5: PASS | isolated Pi 0.99.1 SDK probe | three extensions, no load errors, antigravity and claude-bridge providers, seven subagent tools; operator state unchanged
- AC-6: PASS | root check:ci, typecheck, build, pnpm test | exit 0 x3, no generated drift; only four documented missing-sibling failures
- Source: .thoth/specs/project-tooling/spec.md | sha256:cd3ad7fe7e699e748fd5c5614e926b29a9d9b637ccc212be00c389eda8d79d91
- Source: pnpm-workspace.yaml | sha256:40e9e01eca8a2b1a01dd70ccfa99ec9d20ccba0308d0d6465c30ddbfd9364f21
- Source: pnpm-lock.yaml | sha256:bfa13f87840adc19b6ab960b0bac7e7096a2391402160081d1ee2c7e5635d42c
- Source: package.json | sha256:6a405c286d916d80da215ded4c16285fb723547491f14a6f627bd7b7e82290ae
- Source: .github/workflows/ci.yml | sha256:2091dcd597b85fcfd6b9e0aa5bf789fe19d4e6c13033a431ffbc04ca89973d39
- Source: docs/agent/testing.md | sha256:7d1e7a13b336b0792eebaa4cf05ada089fb4f1b1a25267e952a60ba1b54ad43e
- Source: pi-packages/pi-subagents/package.json | sha256:07b04dffa04bc2c59282eb180c1d216c8bcf284bbb41b45b9121b0b1b8bf4389
- Source: pi-packages/pi-antigravity-bridge/package.json | sha256:216f0fbf797e7f35c1dea55d3f9ebc182c70157a7786d07d26d392cf752fa238
- Source: pi-packages/pi-claude-bridge/package.json | sha256:5e726491ff62db49f60b990b963d00137701635f9fece7f435a449760a12f116
- Source: pi-packages/pi-subagents/README.md | sha256:8d548f112456836282478449ab42dfae480dcf28ce3dc62670d09c318f7b194b
- Source: pi-packages/pi-antigravity-bridge/AGENTS.md | sha256:91cff03db54cd20f8737e80620c69c02704b053a761fe6f81cbb920173d3a3e6
- Source: pi-packages/pi-antigravity-bridge/docs/DEVELOPMENT.md | sha256:c4b544993a396602912b7c5687da5b88f2e3b56dfb25c204f1a953cec5f509df
- Source: pi-packages/pi-antigravity-bridge/docs/TODO.md | sha256:a76d14185cefb337b623bc8ee50871cd5c2af14183013d928bd35a398fd077f2
- Source: pi-packages/pi-claude-bridge/README.md | sha256:acb0fbc61cebbd7c77c98ebe0f022cc0ca00f5f43eb1459013c3b6c3b39fa9ed
- Source: pi-packages/pi-claude-bridge/AGENTS.md | sha256:343f70e6bcd73b15a2630cb059da7806ad75975a69eaa85905dbf903e5e7de26

## Closeout

**Archive**: READY
