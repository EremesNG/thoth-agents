# Change: active-selector-tolerance

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: low
**Risk**: medium

## Exploration

- Thoth Pi agent definitions (`~/.pi/agent/agents/thoth-*.md`) use
  `tools: "@active"`. On 2026-09-30/10-01 every new subagent failed at
  `runner_session` with `Selected tools are unavailable in the child session
  (missing implementation: AskClaude|AskAntigravity)`, blocking all delegation
  until Pi was restarted.
- pi-subagents selectors (`pi-packages/pi-subagents/src/tool-patterns.ts:28-56`):
  standalone `@active` expands root-active tool names excluding `subagent_*`, the
  user-question tool and the progress-list tool; standalone `*` uses every
  registered root tool name, active or not; explicit names are kept without checking
  root availability. `src/runner/sdk-runner.ts:56-94` reads `getActiveTools()` /
  `getTools()` from the parent API for `@active`.
- The runner requires the child registry to equal the selected set exactly; missing
  or unexpected tools fail non-retryably before prompting
  (`src/runner/sdk-runner.ts:99-126,380-385,434-438`); README `:123,149` and
  `skills/subagents-configuration/SKILL.md:181` document this.
- Neither bridge skips its delegation tool for a second instance: claude-bridge
  registers AskClaude whenever its config enables it
  (`pi-claude-bridge/src/index.ts:2360,2617-2624`); antigravity registers
  AskAntigravity whenever `askTool` is on (`pi-antigravity-bridge/extensions/index.ts:537`).
  Root reads config once at load and each child re-reads it, so a config change after
  root load leaves a tool active in root but absent in the child. Isolation keeps
  extension tools (`sdk-runner.ts:205-250`).
- AskClaude and AskAntigravity are delegation tools; Thoth children must not
  delegate further.
- thoth-agents also models both selectors: `/subagents-tools` panel
  (`src/pi/tools-panel.ts:84,180-239,369`, offering `*` and an "all active" key),
  `src/cli/pi-tool-config.ts:207`, docs `docs/installation.md:390-412` and
  `docs/agent/harness-packaging.md:52`, with tests in `src/pi/tools-panel.test.ts`,
  `src/pi/tools-command.test.ts`, `src/cli/pi-tool-config.test.ts`,
  `src/cli/pi-resources.test.ts`. The generator emits explicit default tool lists,
  not `@active`. Canonical spec `multi-harness-agent-pack` requirement "Configure
  adopted Pi subagents natively" (`.thoth/specs/multi-harness-agent-pack/spec.md:471-479`)
  requires distinct persisted `@active` and `*` selectors; this change modifies it.
- The delegated prompt builder (`pi-packages/pi-subagents/src/runner/prompt.ts`)
  ignores its tools argument and lists no tools today.
- SDK 0.99.1 applies `options.tools` as a registry allowlist after extension loading
  and omits missing implementations, so the retained/dropped split can be computed
  after creation without recreating the child.
- Existing pi-subagents coverage: `test/runner/tool-selectors-real-sdk.test.ts`,
  `test/runner/interaction-bridge.test.ts:1042-1259`, `test/config.test.ts`,
  `test/runner/providers-real-sdk.test.ts:580`.
- The separate small fix where `subagent_continue` did not pass the parent Pi API is
  handled outside this record (direct test-first fix) and lands first.

## Intent

One standalone selector, `tools: "*"`, means the root's currently active eligible
tools: it never inherits delegation tools and does not block a subagent when some
active root tool cannot be loaded in the child, running with the available subset
and reporting the dropped names. `@active` is removed everywhere. Explicit lists and
glob patterns stay strict.

## Non-goals

- Changing explicit tool list or glob pattern semantics.
- Accepting unexpected extra tools in the child registry.
- Bridge code changes (no bridge defect found).
- Enabling child `session_start` or other lifecycle hooks.
- Tracking a renamed AskClaude (`askClaude.name`); only the default names are excluded.
- Keeping `@active` as an alias.

## Acceptance

- AC-1: In pi-subagents, standalone `*` resolves to the root's active tools
  (`getActiveTools()`, falling back to `getTools()`) minus `subagent_*`, the
  user-question tool, the progress-list tool, `AskClaude` and `AskAntigravity`;
  inactive registered tools are no longer selected; listing an excluded name
  explicitly still selects it.
- AC-2: `@active` is no longer a selector in pi-subagents: code paths, config
  parsing and tests that treat it as a selector are removed; a definition still
  using `@active` is explicitly rejected at launch with a diagnostic naming `*` as
  the replacement (never treated as a tool name); diagnostic and test literals may
  keep the string.
- AC-3: For standalone `*`, names absent from the child registry are dropped instead
  of failing; the child starts with the remaining set; unexpected extra tools still
  fail; if every selected tool is missing the launch fails with the existing
  diagnostic. Explicit lists and globs keep the strict failure (existing strict
  tests unchanged).
- AC-4: Dropped names are stored in a dedicated durable task field persisted in
  history (not only transient activity text) and surfaced to the parent in
  status/result and the completion message as a warning; the child prompt never
  names a dropped tool.
- AC-5: thoth-agents drops `@active`: the `/subagents-tools` panel offers a single
  dynamic option `*` described as the currently active tools; `pi-tool-config`
  accepts only `*` as the dynamic selector and explicitly rejects `@active` (it
  never falls through as an explicit tool name); negative persistence and
  synchronization tests cover `@active`; existing protections for explicit lists,
  defaults, reserved controls, save/cancel and stale/partial recovery remain.
- AC-6: Docs describe the single `*` selector, its exclusions and drop-and-warn
  behavior versus strict explicit lists: pi-subagents README and
  `skills/subagents-configuration/SKILL.md`, `docs/installation.md`,
  `docs/agent/harness-packaging.md`.
- AC-7: The operator's `~/.pi/agent/agents/thoth-*.md` files use `tools: "*"`
  (user-approved migration; only that line changes).
- AC-8: pi-subagents typecheck and full tests pass through pnpm; root `check:ci`,
  `typecheck`, `build` pass; root `pnpm test` has no new failures beyond the
  documented environmental ones (Orca `CODEX_HOME`, missing `../thoth-plugins`);
  after merge and a full Pi restart that loads the changed runtime, a live thoth
  subagent launches with `tools: "*"`.

## Clarifications

- Do both: make the selector tolerant and address child registration of the
  delegation tools (user, 2026-10-01); investigation found no bridge defect, so only
  the selector changes.
- Exclude AskClaude and AskAntigravity from the dynamic selector (user, 2026-10-01).
- `*` becomes the current `@active` behavior; inactive tools are not inherited
  (user, 2026-10-01).
- Remove `@active` instead of keeping an alias; migrate the operator's five thoth
  agent files to `*` (user, 2026-10-01).

## Decisions

- Tolerance applies only to standalone `*`; explicit lists and glob patterns keep
  fail-closed verification so misconfiguration stays visible.
- Excluded names are a fixed list next to the existing exclusions.
- Spec delta: MODIFIED multi-harness-agent-pack "Configure adopted Pi subagents
  natively" (declared below), applied at archive by root.
- Closeout order: implementation commits, merge to `0.5.0`, operator restart, live
  AC-8 evidence, then final fresh Oracle verification and archive.
- The operator files are edited by root after implementation, with a backup, since
  they are user-owned configuration outside the repository.
- Implementation checkpoint (root, 2026-10-01): worker A delivered AC-1..AC-4 and
  package docs (durable `dropped_tools` field round-trips through task, attempt and
  metadata history; new `test/dropped-tools.test.ts`); worker B delivered AC-5 and
  root docs (`@active` rejected in persistence and synchronization; panel `*` previews
  active eligible tools only; former "all active" key removed). Root removed its own
  stale `.pi/delegate` artifacts and migrated the five operator agent files from
  `tools: "@active"` to `tools: "*"` (backup in a temp dir; only that line changed).
  Checks: frozen install 0; pi-subagents typecheck 0 / 454 passed; antigravity 0 /
  542 passed, 9 skipped; claude-bridge 0 / unit 290; root check:ci, typecheck, build
  0; root `pnpm test` without Orca CODEX_HOME 1149 passed / 4 missing-sibling
  failures; operator claude-bridge.json hash unchanged. Remaining `@active` text is
  rejection code and its docs only. Live AC-8 follows after merge and restart.

## Durable deltas

- `MODIFIED multi-harness-agent-pack` **Configure adopted Pi subagents natively** — Pi MUST expose /subagents-model using native profiles and /subagents-tools using the same UI design with safe tool persistence; the former Thoth model/tools commands and fork-owned SDD workflow MUST be absent. The tools panel MUST offer one dynamic selection persisted as standalone `*`, meaning the eligible tools currently active in the root session excluding subagent and delegation tools (`AskClaude`, `AskAntigravity`); inactive registered tools MUST NOT be inherited and `@active` MUST be rejected rather than persisted or treated as a tool name. Existing explicit configurations, defaults, reserved controls, save/cancel, stale/partial recovery and unrelated fields MUST remain protected. Synchronization MUST preserve `*` and child launch MUST resolve its current inventory; for `*`, tools without a child implementation MUST be dropped and reported as a durable warning, while explicit lists and glob patterns MUST fail with a truthful missing-implementation diagnostic.
  - GIVEN explicit or dynamic operator selections and root tools that are inactive or lack a child implementation; WHEN the panel saves, synchronization runs and a child launches; THEN operator intent persists, `*` yields the child-loadable active eligible tools with dropped names reported, explicit lists fail on missing implementations, and nothing is silently widened or omitted .

## Plan

1. Worker A (sole writer of `pi-packages/pi-subagents/**`, after the continuation fix
   is committed): AC-1..AC-4 and the pi-subagents docs of AC-6, test-first.
2. Worker B (sole writer of `src/pi/tools-panel*.ts`, `src/pi/tools-command.test.ts`,
   `src/cli/pi-tool-config*.ts`, `src/cli/pi-resources.test.ts`,
   `docs/installation.md`, `docs/agent/harness-packaging.md`): AC-5 and the root docs
   of AC-6, in parallel with worker A.
3. Root: AC-7 operator migration and pre-merge checks; implementation commits;
   merge to `0.5.0`; user restarts Pi; live AC-8 launch; then fresh Oracle final
   verification, spec delta applied by archive, and the archive commit.

## Tasks

- [x] AC-1: `*` means active tools minus exclusions
  - Outcome: dynamic selector resolves active eligible tools
  - Known entrypoints and skill paths: `pi-packages/pi-subagents/src/tool-patterns.ts:28-56`, `src/runner/sdk-runner.ts:56-94`, tdd skill
  - Inputs: Clarifications
  - Dependencies: continuation fix committed
  - Output: code + tests
  - Owner: worker A
  - Writes: `pi-packages/pi-subagents/src/**`, `pi-packages/pi-subagents/test/**`
  - Interface boundaries: explicit lists unchanged
  - Focused check and PASS evidence: tests where inactive tools and both delegation tools are excluded under `*`; explicit list keeps them
  - Return milestone: tests green
  - Stop / reassessment: none expected
- [x] AC-2: remove `@active` from pi-subagents
  - Outcome: no special `@active` handling; clear diagnostic
  - Known entrypoints and skill paths: same files, `test/config.test.ts`, `test/runner/interaction-bridge.test.ts`, `test/runner/tool-selectors-real-sdk.test.ts`, `test/tools/subagent-continue.test.ts`
  - Inputs: AC-1
  - Dependencies: AC-1 (same writer)
  - Output: code + tests
  - Owner: worker A
  - Writes: `pi-packages/pi-subagents/src/**`, `pi-packages/pi-subagents/test/**`
  - Interface boundaries: none
  - Focused check and PASS evidence: test that `@active` is rejected with a diagnostic naming `*`; no selector handling of `@active` remains in src
  - Return milestone: tests green
  - Stop / reassessment: none expected
- [x] AC-3: drop missing tools for `*`
  - Outcome: child starts with available subset
  - Known entrypoints and skill paths: `pi-packages/pi-subagents/src/runner/sdk-runner.ts:99-126,380-438`
  - Inputs: AC-1
  - Dependencies: AC-1 (same writer)
  - Output: code + real-SDK regression
  - Owner: worker A
  - Writes: `pi-packages/pi-subagents/src/**`, `pi-packages/pi-subagents/test/**`
  - Interface boundaries: unexpected-tool rejection unchanged
  - Focused check and PASS evidence: real-SDK test with an active root tool absent in the child succeeds under `*` and fails under an explicit list or glob; all-missing still fails
  - Return milestone: tests green
  - Stop / reassessment: SDK cannot narrow the session tools without redesign
- [x] AC-4: report dropped tools
  - Outcome: dropped names visible and persisted; prompt lists retained tools
  - Known entrypoints and skill paths: `pi-packages/pi-subagents/src/manager.ts`, `src/history.ts`, `src/render/`
  - Inputs: AC-3
  - Dependencies: AC-3 (same writer)
  - Output: code + tests
  - Owner: worker A
  - Writes: `pi-packages/pi-subagents/src/**`, `pi-packages/pi-subagents/test/**`
  - Interface boundaries: existing fields unchanged except additions
  - Focused check and PASS evidence: tests assert the durable field in history and the warning in status/result/completion; prompt contains no dropped name
  - Return milestone: tests green
  - Stop / reassessment: none expected
- [x] AC-5: thoth-agents single dynamic selector
  - Outcome: panel and config know only `*`
  - Known entrypoints and skill paths: `src/pi/tools-panel.ts:84,180-239,369`, `src/cli/pi-tool-config.ts:207`, their tests, `src/pi/tools-command.test.ts`, `src/cli/pi-resources.test.ts`
  - Inputs: Clarifications
  - Dependencies: none (parallel with worker A)
  - Output: code + tests
  - Owner: worker B
  - Writes: those src and test files
  - Interface boundaries: other panel behavior unchanged
  - Focused check and PASS evidence: `npx vitest run` on those tests green; `@active` rejected in persistence and synchronization tests; no selector handling of `@active` left in `src/`
  - Return milestone: tests green
  - Stop / reassessment: generated agent output depends on `@active` elsewhere
- [x] AC-6: documentation
  - Outcome: docs describe single `*` selector
  - Known entrypoints and skill paths: `pi-packages/pi-subagents/README.md:123,149`, `pi-packages/pi-subagents/skills/subagents-configuration/SKILL.md:181`, `docs/installation.md:390-412`, `docs/agent/harness-packaging.md:52`
  - Inputs: AC-1..AC-5 behavior
  - Dependencies: worker A docs after AC-4; worker B docs after AC-5
  - Output: updated docs
  - Owner: worker A (package docs), worker B (root docs)
  - Writes: those docs
  - Interface boundaries: none
  - Focused check and PASS evidence: grep finds no `@active` in active docs; text describes exclusions and drop-and-warn
  - Return milestone: docs updated
  - Stop / reassessment: none expected
- [x] AC-7: operator agent files
  - Outcome: thoth agents use `*`
  - Known entrypoints and skill paths: `C:\Users\EremesNG\.pi\agent\agents\thoth-*.md`
  - Inputs: AC-1..AC-6 done
  - Dependencies: workers A and B
  - Output: five edited files with backup
  - Owner: root
  - Writes: those five files only
  - Interface boundaries: only the `tools:` line changes
  - Focused check and PASS evidence: diff against backup shows only `tools: "@active"` -> `tools: "*"`
  - Return milestone: files migrated
  - Stop / reassessment: a file has a different tools value
- [ ] AC-8: checks and live launch
  - Outcome: green checks; live subagent launches with `*`
  - Known entrypoints and skill paths: package filters, root scripts, operator Pi after merge
  - Inputs: AC-1..AC-7
  - Dependencies: AC-1..AC-7
  - Output: evidence
  - Owner: root
  - Writes: none
  - Interface boundaries: none
  - Focused check and PASS evidence: package typecheck/tests, root check:ci/typecheck/build exit 0; root `pnpm test` failures limited to the documented environmental ones; live launch succeeds after a full restart
  - Return milestone: evidence captured
  - Stop / reassessment: new failure

## Authorization

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

The user explicitly selected Review plan with Oracle. Round 1 fresh Oracle returned
[REJECT] (spec contradiction; live check ordered after closeout), repaired; round 2
fresh Oracle subtask_thoth-oracle_1790821597212_7d2fc577 returned [OKAY]. Notes: the
explicit-name exception in AC-1 applies to AskClaude/AskAntigravity, and reserved
controls stay blocked; AC-4 warnings round-trip through task and attempt history.

## Verification

**Reviewer**: PENDING
**Independent from implementer**: PENDING
**Verdict**: PENDING
**Reviewed record SHA-256**: PENDING

- AC-1: PENDING | check | evidence
- AC-2: PENDING | check | evidence
- AC-3: PENDING | check | evidence
- AC-4: PENDING | check | evidence
- AC-5: PENDING | check | evidence
- AC-6: PENDING | check | evidence
- AC-7: PENDING | check | evidence
- AC-8: PENDING | check | evidence
- Source: .thoth/specs/multi-harness-agent-pack/spec.md | sha256:8ccd4073f76b986f57fd3cc890e8eeb12501038ca550d19f554eb65876ff8fec

## Closeout

**Archive**: PENDING
