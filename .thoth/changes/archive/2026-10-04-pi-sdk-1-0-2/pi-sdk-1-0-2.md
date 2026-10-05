# Change: pi-sdk-1-0-2

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: low
**Risk**: medium

## Exploration

- Branch fast-forwarded to `0.5.0` at `2f826df`; `pi-orca-images` no longer exists (its image capability lives in `pi-packages/pi-thoth-theme/src/tools/`). Six `pi-packages/*` members share the root `pnpm-lock.yaml` (`pnpm-workspace.yaml:1-2`).
- Pi SDK development versions are split across three generations: root `thoth-agents` `pi-ai`/`pi-tui` `0.87.1` (`package.json:92-98`); `pi-antigravity-bridge`, `pi-background-tasks`, `pi-claude-bridge`, `pi-openai-fast`, `pi-subagents` on `0.99.1`; `pi-thoth-theme` on `^1.0.1`.
- Peer minimums differ: `*` (root, antigravity, background-tasks, openai-fast, theme TUI), `>=0.86.1` (claude-bridge), `>=0.99.0` (subagents), `>=1.0.1` (theme coding-agent). Node engines differ: `>=22.19` (root), `>=22.19.0` (subagents), `>=22.0.0` (antigravity), `>=20` (claude-bridge), absent (background-tasks, openai-fast, theme). Every Pi SDK release from 0.99.x to 1.0.2 declares `node >=22.19.0`.
- Upstream (pi.dev/changelog and the v1.0.2-pinned CHANGELOGs): 0.99.0 added nested tool orchestration (`ctx.executeTool`, exposure, codemode, MCP), not native subagents; 1.0.0 removed the experimental harness exports from `pi-agent-core` (`./node`, `./harness/*`, `./experimental/pico3`); 1.0.1 added `registerToolRenderer`; 1.0.2 only added `samplingParamsByThinkingLevel`. `CustomEditor`, `SessionManager`, `createAgentSession` options and the used ExtensionAPI members (`setWidget`, `setStatus`, `setEditorComponent`, `sendMessage` with `triggerTurn`/`deliverAs`, lifecycle events) are unchanged between 0.99.1 and 1.0.2. The only native subagent in 1.0.2 lives in the experimental `pi-durable` runtime; `pi-subagents` keeps its own `createAgentSession` runner (`src/runner/sdk-runner.ts:477-534`).
- Root imports (`src/pi.ts:4-10`, `src/pi/tools-panel.test.ts:1`, `src/cli/pi-native-probe.ts:141`) have identical declarations in installed 1.0.1 typings. No removed agent-core subpath or symbol is used; the only agent-core import is `runToolCall` from the package root in `pi-packages/pi-subagents/test/runner/tool-selectors-real-sdk.test.ts:765,956`.
- Theme's 1.0.1-only `registerToolRenderer` (`src/tools/index.ts:62`) is runtime-guarded (`src/tools/index.ts:28`, covered by `src/tools/resolver.test.ts:111-124`).
- `@mariozechner/` only appears in historical `pi-packages/pi-claude-bridge/CHANGELOG.md:89,115`.
- CLI floor: `src/cli/pi-install.ts:40` `PI_MINIMUM_VERSION = '0.86.1'`, asserted in `src/cli/pi-install.test.ts:367,501-517` and used as reported version by fixtures in `src/cli/{commands,install,pi-install}.test.ts` and `src/cli/operations/pi.test.ts`. Version statements also live in `docs/agent/{cli-installation,testing,harness-packaging}.md`, the claude-bridge, subagents and theme READMEs, and `pi-packages/pi-subagents/test/package.test.ts:29-35`.

## Intent

Move every Pi SDK development dependency in the repository (root `thoth-agents` and all six `pi-packages/*`) to `@earendil-works/*` `1.0.2`, unify every Pi SDK peer minimum to `>=0.99.0`, unify every `engines.node` to `>=22.19.0`, and raise the CLI installer's minimum supported Pi version to `0.99.0`, keeping all checks green and documentation truthful.

## Non-goals

- No migration to Pi's experimental `pi-durable` subagent runtime; `pi-subagents` keeps its own runner.
- No background-work indicator in the editor border (explicitly deferred by the user).
- No package version bumps or CHANGELOG release entries; historical CHANGELOG lines stay untouched.
- No adoption of new 1.0.x APIs beyond what already exists.
- Legacy scenario preconditions that cite Pi `0.86.1` inside multi-scenario requirements are not rewritten (see Decisions).

## Acceptance

- AC-1: Every tracked manifest that declares `@earendil-works/*` devDependencies pins/resolves them to `1.0.2` in the root lockfile, every Pi SDK peer dependency declares exactly `>=0.99.0`, and every workspace manifest declares an `engines.node` floor equivalent to `>=22.19.0` (the root keeps its test-enforced literal `>=22.19`).
- AC-2: The CLI installer rejects Pi older than `0.99.0` and accepts `0.99.0+`, with its tests and fixtures updated accordingly.
- AC-3: Documentation and READMEs state the unified floor (`>=0.99.0`), development pin `1.0.2` and Node `>=22.19.0` without stale `0.86.1`/`0.99.1`/`1.0.1` requirement claims (historical CHANGELOG lines excepted).
- AC-4: `pnpm run check:ci`, `pnpm run typecheck`, `pnpm run build`, `pnpm test` and every `pi-packages/*` typecheck and offline test suite pass against Pi 1.0.2.

## Clarifications

- Scope: root package plus all `pi-packages/*` (user answer).
- Peer minimum: one shared minimum across all packages, `>=0.99.0` (user answer).
- CLI installer minimum raised to `0.99.0` (user answer, recommended).
- Node engines unified to `>=22.19.0` (user answer, recommended).
- Correct package scope is `@earendil-works/*`; no `@mariozechner/*` remains in code.

## Decisions

- `pi-thoth-theme` peer drops from `>=1.0.1` to `>=0.99.0`: its only 1.x API is guarded, so on 0.99.x tool renderers are inert rather than failing; README states this.
- Exact devDependency pins `1.0.2` everywhere (the repository already mixes exact and caret; exact pins keep one generation in the lockfile).
- Root `package.json` keeps the literal `engines.node` `>=22.19` because `src/plugin-node-runtime.test.ts` enforces that exact string across package, workflow and bundled skills; it is semantically identical to `>=22.19.0` used by the pi-packages.
- Peer dependencies keep their current optional/required metadata; only ranges change. Peers declared today stay; no new peers are introduced.
- Spec deltas: `archive.mjs` renders `MODIFIED` as one statement plus one scenario, so modifying the multi-scenario requirements whose scenarios mention Pi `0.86.1` would delete their other scenarios. Only the single-scenario `Native lifecycle translation` is modified; two new requirements state the authoritative floor and explicitly supersede every retained canonical scenario precondition naming an older Pi version (in `cli-installation`, `external-required-skills`, `multi-harness-agent-pack` and `project-tooling`), which then reads as Pi `>=0.99.0` while all its other assertions stay in force.

## Durable deltas

- `MODIFIED multi-harness-agent-pack` **Native lifecycle translation** — Pi root guidance MUST use one direct subagent_run with explicit canonical agent and bounded task per fresh assignment; omitted mode MUST use the configured agent/config mode or otherwise background, and explicit task/background modes MUST remain supported. Native status/result/cancel or supported live messaging MUST be used only for a known task ID. Queued delivery, nonterminal state and cancellation requests MUST NOT prove termination or acceptance. New objectives, phases, mutable surfaces and independent judgments MUST receive fresh assignments. Thoth MUST NOT use subagent orchestration APIs or claim instruction-only policy is runtime enforcement. Terminal notifications drive collection without polling; children MUST remain scoped to the parent Pi lifetime. The adopted delegation runtime MUST support Pi `>=0.99.0` through the `1.0.2` development pin with its registry and model-only exposure semantics, restrict child registered tools to the selected permitted implementations, and distinguish queued, extension-handled, rejected, and model-consumed live input. Updating this runtime MUST preserve its responsibility for LLM subagent delegation; non-LLM background task execution remains external.
  - GIVEN an active root using the adopted fork on Pi 0.99.0 or 1.0.2; WHEN it launches an LLM subagent, selects tools, or sends live input; THEN native delegation controls remain model-only, child callability respects the permitted registry, and reported message/terminal states retain their actual meanings without adding generic task responsibilities .
- `ADDED multi-harness-agent-pack` **Uniform Pi SDK compatibility floor** — The root thoth-agents package and every Pi package under pi-packages MUST declare each Pi SDK peer dependency (`@earendil-works/*`) with the same minimum `>=0.99.0`, MUST develop and test against one shared Pi SDK development version (currently `1.0.2`), and MUST declare an `engines.node` floor of Node 22.19 (`>=22.19` or `>=22.19.0`); features that need a newer Pi API MUST detect it at runtime and degrade without failing on the minimum.
  - GIVEN the repository manifests and root lockfile; WHEN Pi SDK dependencies are inspected; THEN every Pi peer range is `>=0.99.0`, every Pi development dependency resolves to the single shared version, and every manifest requires Node 22.19 or newer .
- `ADDED cli-installation` **Pi minimum version floor** — The Pi installer MUST reject a detected Pi older than `0.99.0` with a diagnostic naming the `>=0.99.0` requirement before changing any Pi state, and MUST accept Pi `0.99.0` and newer. This floor supersedes every Pi version named in a retained canonical scenario precondition of any capability (including Pi `0.86.1` in `cli-installation`, `external-required-skills`, `multi-harness-agent-pack` and `project-tooling`): such a precondition MUST be read as a supported Pi `>=0.99.0`, and the scenario's other assertions remain in force.
  - GIVEN a Pi installation reporting version 0.98.x; WHEN the user runs the Pi install; THEN it fails with the `Pi >=0.99.0` diagnostic without changing Pi state, while a Pi reporting 0.99.0 or 1.0.2 proceeds .

## Plan

Two sequential worker units share the root `node_modules`, so they do not run concurrently; root runs the full gate afterwards.

1. **Manifests and lockfile (AC-1, AC-3 partial).** Edit `devDependencies`, `peerDependencies` and `engines` in `package.json` and the six `pi-packages/*/package.json`; run `pnpm install` to regenerate `pnpm-lock.yaml`; fix any 1.0.2 type or test breakage revealed in the packages (expected none; confirm `runToolCall` root export); update `pi-packages/pi-subagents/test/package.test.ts` if it asserts ranges; update package READMEs (`pi-claude-bridge`, `pi-subagents`, `pi-thoth-theme`) and `docs/agent/harness-packaging.md`. Focused checks: `pnpm install --frozen-lockfile` reproduces, each `pi-packages/*` `typecheck` and offline tests, root `pnpm run typecheck`.
2. **CLI floor (AC-2, AC-3 partial).** Test-first: change the expectations in `src/cli/pi-install.test.ts` for `0.99.0` (constant, below-minimum rejection with `0.98.x`, acceptance), then set `PI_MINIMUM_VERSION = '0.99.0'` in `src/cli/pi-install.ts`; move fixture reported versions from `0.86.1` to a supported version in `src/cli/{commands,install,pi-install}.test.ts` and `src/cli/operations/pi.test.ts`; update `docs/agent/cli-installation.md` and `docs/agent/testing.md` statements. Focused check: `pnpm vitest run src/cli`.
3. **Gate (AC-4).** Root runs `pnpm run check:ci`, `pnpm run typecheck`, `pnpm run build`, `pnpm test` and each pi-package typecheck/offline test, then a fresh Oracle verifies diff and evidence.

Risks: runtime behavior differences in 1.0.x not covered by mocks (fullscreen default TUI, MCP name normalization); tests with the real SDK in `pi-subagents/test/runner/*real-sdk*` are the main seam.

## Tasks

- [x] AC-1: Pi SDK 1.0.2 pins, unified `>=0.99.0` peers, `>=22.19.0` engines and regenerated lockfile, with package docs updated and all pi-package checks green
  - Outcome: one Pi SDK generation (1.0.2) across root and six pi-packages with consistent peer and engine contracts
  - Known entrypoints and skill paths: `package.json`, `pi-packages/{pi-antigravity-bridge,pi-background-tasks,pi-claude-bridge,pi-openai-fast,pi-subagents,pi-thoth-theme}/package.json`, `pnpm-lock.yaml`, `pi-packages/pi-subagents/test/package.test.ts`, `pi-packages/pi-subagents/test/runner/tool-selectors-real-sdk.test.ts`, `pi-packages/pi-claude-bridge/src/index.ts:2438` (minimum-version diagnostic) and its tests, `pi-packages/{pi-claude-bridge,pi-subagents,pi-thoth-theme}/README.md`, `docs/agent/harness-packaging.md`; skills `C:\Users\EremesNG\.pi\agent\skills\tdd\SKILL.md`, `C:\Users\EremesNG\.pi\agent\skills\simplify\SKILL.md`
  - Inputs: this record's Exploration, Decisions and AC-1/AC-3
  - Dependencies: none
  - Output: edited manifests, regenerated lockfile, any minimal compatibility fixes, updated package docs
  - Owner: thoth-worker
  - Writes: listed manifests, `pnpm-lock.yaml`, listed READMEs, `docs/agent/harness-packaging.md`, `pi-packages/pi-claude-bridge/src/index.ts` minimum diagnostic (to `0.99.0`) and its tests, minimal source/test fixes inside `pi-packages/*` strictly required by 1.0.2
  - Interface boundaries: published package names/versions unchanged; no API adoption; `src/cli/**` untouched
  - Focused check and PASS evidence: `pnpm install --frozen-lockfile` succeeds; `pnpm -r --filter "./pi-packages/*" run typecheck` and each package's offline test script pass; root `pnpm run typecheck` passes; grep shows no `@earendil-works` devDependency other than `1.0.2`
  - Return milestone: after checks pass, report diff summary and check results
  - Stop / reassessment: any 1.0.2 break requiring behavior change or new API adoption, or a failing real-SDK test whose fix is not mechanical
- [x] AC-2: CLI installer minimum Pi `0.99.0`, test-first, with CLI docs updated
  - Outcome: installer accepts Pi `>=0.99.0` and rejects older with the `Pi >=0.99.0` diagnostic
  - Known entrypoints and skill paths: `src/cli/pi-install.ts:40,506,849,852` (506 is preview text), `src/cli/pi-install.test.ts`, `src/cli/commands.test.ts:799`, `src/cli/install.test.ts:165`, `src/cli/operations/pi.test.ts`, `docs/installation.md:164`, `docs/agent/cli-installation.md:93`, `docs/agent/testing.md:80`; skill `C:\Users\EremesNG\.pi\agent\skills\tdd\SKILL.md`
  - Inputs: AC-2 and Decisions
  - Dependencies: AC-1 unit accepted (shared `node_modules`)
  - Output: updated constant, tests, fixtures and docs
  - Owner: thoth-worker
  - Writes: the listed `src/cli/**` files, `docs/installation.md` and the two `docs/agent` files
  - Interface boundaries: no other installer behavior changes
  - Focused check and PASS evidence: failing test observed before the constant change; then `pnpm vitest run src/cli` passes
  - Return milestone: after focused CLI tests pass
  - Stop / reassessment: other behavior depending on the old floor
- [x] AC-3: Repository-wide stale version statement sweep confirmed clean
  - Outcome: no stale Pi requirement claim remains outside historical CHANGELOGs and superseded spec scenarios
  - Known entrypoints and skill paths: repository text search for `0.86.1`, `0.99.1`, `1.0.1`, `@mariozechner`
  - Inputs: accepted AC-1 and AC-2 outputs
  - Dependencies: AC-1 and AC-2 units accepted
  - Output: search result summary in Verification
  - Owner: root
  - Writes: none
  - Interface boundaries: none
  - Focused check and PASS evidence: search hits limited to CHANGELOG history, `.thoth/specs` superseded scenarios, `.thoth/history`, archived changes and lockfile-unrelated text
  - Return milestone: before final gate
  - Stop / reassessment: stale normative claim found outside owned writes
- [x] AC-4: Full repository gate green on Pi 1.0.2
  - Outcome: all CI-equivalent checks pass
  - Known entrypoints and skill paths: `package.json` scripts, `.github/workflows/ci.yml`
  - Inputs: accepted AC-1..AC-3
  - Dependencies: AC-1, AC-2, AC-3
  - Output: check results recorded in Verification
  - Owner: root
  - Writes: none
  - Interface boundaries: none
  - Focused check and PASS evidence: `pnpm run check:ci`, `pnpm run typecheck`, `pnpm run build`, `pnpm test` and each pi-package typecheck/offline tests exit 0
  - Return milestone: before Oracle verification
  - Stop / reassessment: any failure returns to the owning unit

## Authorization

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

- Plan review history: round 1 [REJECT]: stale-claim ownership (docs/installation.md, pi-install.ts preview, claude-bridge diagnostic) and scenario supersession — repaired; round 2 fresh Oracle [OKAY].
- Implementation authorized by explicit user choice (Implement) after [OKAY].

## Verification

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: ee4cd2e11e9c366eef556915adaf816940948eee8c95e1e23575e49de7bb6766

- AC-1: PASS | `pnpm install --frozen-lockfile`; `pnpm -r --filter "./pi-packages/*" run typecheck`; per-package offline tests | exit 0; 20 dev pins `1.0.2`, 13 peers `>=0.99.0`, engines Node 22.19 in 7 manifests; antigravity 656, background-tasks 399, claude-bridge `test:unit` 334, openai-fast 49, subagents 1061, theme 530 passed; claude-bridge diagnostic test red then green
- AC-2: PASS | `pnpm vitest run src/cli` (CODEX_HOME unset) | exit 0, 641 passed; boundary tests red before constant change; 0.98.9 rejected with `Pi >=0.99.0` without mutation, 0.99.0 and 1.0.2 accepted
- AC-3: PASS | tracked-file search for `0.86.1|0.99.1|1.0.1|@mariozechner` excluding CHANGELOGs, `.thoth/history`, archive and lockfile | remaining hits are arbitrary supported test fixture versions, labelled historical evidence, intentional theme renderer `>=1.0.1` notes, the unrelated thoth-agents fixture version, an old unarchived change record, and spec preconditions superseded by the ADDED floor
- AC-4: PASS | `pnpm run check:ci`, `pnpm run typecheck`, `pnpm run build`, `pnpm test` (CODEX_HOME unset, THOTH_PLUGINS_ROOT set) | all exit 0; 101 files / 1291 tests passed; `publish-marketplace` needs `THOTH_PLUGINS_ROOT` (environment, unrelated)
- Source: .thoth/specs/multi-harness-agent-pack/spec.md | sha256:30c09be4f5cb5a177a9f53c5b8f2adbf0a7f85fcd69c5fe456165010ce6443b5
- Source: .thoth/specs/cli-installation/spec.md | sha256:ccbacabeb1f67e76a96360bb066d01d8976e7f6fe0c43b23b3f97cb036e4dd25

## Closeout

**Archive**: READY
