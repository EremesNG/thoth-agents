# Change: pi-core-todo

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: medium
**Risk**: medium

**Name legend** (exact identifiers; aliases avoid the SDD placeholder check):
- T-PKG = `@thoth-agents/pi-todo`; T-DIR = `pi-packages/pi-todo`; T-TOOL = tool `todo`; T-CMD = `/todos`; T-WIDGET = widget key `thoth-todos`; T-STATE = `thoth:todo:state`; T-REQ = `thoth:todo:state:request`.
- R-PKG = `@juicesharp/rpiv-todo` (`npm:@juicesharp/rpiv-todo`); R-DIR = `rpiv-todo`; R-WIDGET = `rpiv-todos`; R-REMOVE = `pi remove npm:@juicesharp/rpiv-todo --no-approve`; G-REF = gentle-shell `extensions/gentle-todo.ts`.

## Exploration

- Branch fast-forwarded to `0.5.0` at `4f2fbba` (Pi SDK dev `1.0.2`, every Pi peer `>=0.99.0`, Node `>=22.19.0`, CLI floor `0.99.0`; archived `pi-sdk-1-0-2`). New packages under `pi-packages/*` join the workspace automatically (`pnpm-workspace.yaml:1-2`).
- Only existing cross-package contract: `pi-packages/pi-subagents/src/usage-events.ts:5-10,129-135,291-296` — request channel `thoth:subagent-usage:request` `{ parentSessionId }`, broadcast `thoth:subagent-usage` cumulative snapshot `{ parentSessionId, totalCost, runCount }`, emitted on mutation and on request, requests queued until session start settles; consumed by `pi-packages/pi-thoth-theme/src/status-line/index.ts:74-128` (subscribe first, filter by own session ID, request on attach and every `session_start`). No other `pi.events` use exists.
- Operator task-list today is R-PKG (`~/.pi/agent/settings.json:24`), installed in its directory under `~/.pi/agent/npm/node_modules` v`2.12.0`, MIT `Copyright (c) 2026 juicesharp`. 16 TS files (~1,677 LOC): `index.ts`, the tool module, the overlay module, `config.ts`, `state/{state-reducer,store,selectors,i18n-bridge,task-graph,replay,invariants,state}.ts`, `tool/{types,response-envelope,sanitize}.ts`, `view/format.ts`, `locales/` (9 languages), `docs/`. No tests in the tarball; upstream repo `juicesharp/rpiv-mono@68d9a00` `packages/R-DIR` has 23 Vitest files (MIT). Dependency `@juicesharp/rpiv-config` (`config.ts:1-30,101`, guidance overrides) and optional `@juicesharp/rpiv-i18n` (`index.ts:104`, `state/i18n-bridge.ts:40`, both with fallbacks). Tool T-TOOL (tool module line 67), command T-CMD (tool module line 106), above-editor widget R-WIDGET (overlay module line 23), replay of the last T-TOOL tool-result `details` snapshot from `getBranch()` on `session_start`/`session_compact`/`session_tree` (`state/replay.ts:24-38`, `index.ts:194-225`). Its schema equals this harness's T-TOOL tool (create/update/list/get/delete/clear; four upstream statuses including in_progress, completed and deleted; blockedBy/addBlockedBy/removeBlockedBy; owner; metadata; activeForm; includeDeleted). It has no `pi.events` publication and no reinjection of open tasks after compaction.
- Reference `gentle-shell@07f7d1d` `G-REF`: appends the open-work block to the system prompt before each agent start (`event.systemPromptOptions`), registers its card as a sidebar part. Not used as the base.
- Installer: `src/cli/pi-install.ts:43-74` `PI_PACKAGE_SPECS` (5 entries `{ id, source, packageName, version }`, asserted `toHaveLength(5)` at `src/cli/pi-install.test.ts:359-369`); conflicting incumbent delegation is a preflight blocker printing `pi remove <source> --no-approve` (`pi-install.ts:470-474,870-880`; `src/cli/operations/pi.ts:860`); the installer never removes external packages and only reads `settings.json`. `src/cli/operations/pi.test.ts:398-443` asserts an installed `R-PKG` is ignored.
- Specialists: Thoth Pi child definitions omit T-TOOL (`src/harness/adapters/pi.ts:50`, `src/harness/adapters/pi.test.ts:111-112`; spec `multi-harness-agent-pack` "Keep Pi progress session-owned"). Unchanged by this change.
- Package inventory statements: CI `.github/workflows/ci.yml:53-83` (Ubuntu per-package checks) and `:107-143` (Windows typecheck/test per package); `docs/agent/harness-packaging.md:33-52`, `docs/agent/testing.md:45-53`, `AGENTS.md` ("six `pi-packages/*`"); spec `project-tooling` "Install and verify Pi packages through the pnpm workspace"; spec `multi-harness-agent-pack` "Uniform Pi SDK compatibility floor".
- Spec `cli-installation` "Install selected Pi interaction and web extensions" lists the five selected packages, forbids requiring/installing `R-PKG` and forbids vendoring external implementations; it has four scenarios, so it is extended by an ADDED requirement rather than MODIFIED.
- Publishing: only `pi-subagents` has a semantic-release config (`pi-packages/pi-subagents/.releaserc.json`); no workflow publishes `pi-packages/*`; the root release publishes only the root package (`.github/workflows/release.yml:120-132`). Package publication is an operator step outside CI.
- Pi loads extension TypeScript source through its loader; whether a TS-source runtime dependency (`@thoth-agents/pi-core` shipped as `.ts`) resolves when T-PKG is installed from npm is unverified.

## Intent

Create the first two packages of the Thoth Pi ecosystem: `@thoth-agents/pi-core`, a shared contract package with typed, versioned `pi.events` channels and publish/request/subscribe helpers, and T-PKG, a first-party fork of R-PKG `2.12.0` that keeps its tool schema, adds open-task reinjection into the model context and publishes its session state through `pi-core`. The Thoth CLI installs and verifies T-PKG and blocks setup when the incumbent `R-PKG` is present.

## Non-goals

- Specialist task lists, nested child lists, parent/child session lineage publication, the parent-item parameter on `subagent_run` and any `pi-subagents` change (follow-up change 2).
- The sidebar package and nested/grouped subagent rendering (future change; the layout spike runs outside the repository).
- Migrating `thoth:subagent-usage` or other existing channels into `pi-core`.
- Granting T-TOOL to non-Pi harnesses or to Pi specialists.
- Automatic removal of operator packages; automated npm publication of `pi-packages/*`; version bumps of existing packages.
- i18n locales and `rpiv-config` configurability from the upstream package.

## Acceptance

- AC-1: `pi-packages/pi-core` exists as `@thoth-agents/pi-core` `0.1.0` (ESM, MIT, `pi-package` keyword, peers `>=0.99.0`, dev SDK `1.0.2`, Node `>=22.19.0`) exporting a versioned channel definition, an envelope type `{ v, source, sessionId, at, data }`, `publish`/`request`/`subscribe` helpers over `pi.events` that validate version and ignore foreign or malformed payloads, and the task-list channel constants and payload types; Vitest covers helpers and validation.
- AC-2: `T-DIR` exists as T-PKG `0.1.0` with the same manifest contract, depending on `@thoth-agents/pi-core` via `workspace:^`; it registers tool T-TOOL with the R-PKG 2.12.0 schema and semantics, T-CMD, and an above-editor widget T-WIDGET showing only the current session's list; it carries no `@juicesharp/*` dependency; LICENSE keeps the juicesharp MIT copyright alongside Thoth's and README states the fork origin.
- AC-3: T-PKG reconstructs state from the branch on session start, tree and compaction; publishes the full session snapshot on `T-STATE` after each mutation, replay and on `T-REQ` for its session; and adds a compact open-tasks block to the model context before each agent start when open tasks exist, using a runtime-detected API that degrades without failing on Pi `0.99.0`.
- AC-4: Loading T-PKG through the real Pi SDK `1.0.2` extension loader from its packed (`pnpm pack`) layout installed into a temporary directory, with `pi-core` resolved from its own packed tarball as a regular dependency, registers the tool and command without errors.
- AC-5: The CLI installer installs and individually verifies T-PKG as a sixth selected Pi package, and preflight rejects an installed `R-PKG` before any mutation with a diagnostic containing `R-REMOVE`; status/update reporting is consistent; CLI tests and docs are updated.
- AC-6: CI runs typecheck and offline tests for `pi-core` and T-PKG in the Ubuntu and Windows jobs, and repository docs/AGENTS.md package inventories state eight packages and describe both packages.
- AC-7: `pnpm install --frozen-lockfile`, `pnpm run check:ci`, `pnpm run typecheck`, `pnpm run build`, `pnpm test` and every `pi-packages/*` typecheck and offline test pass.

## Clarifications

- Package names `@thoth-agents/pi-core` and T-PKG (user answers).
- Fork base `R-PKG` plus gentle-shell's open-work reinjection and panel idea (user answer).
- Child task lists are isolated per session and the root only observes them; implemented in follow-up change 2, not here (user answers).
- In Pi only, all specialists may later receive T-TOOL; nested lists appear only in the future sidebar; the editor widget always shows only the orchestrator's list (user answers).
- Installer manages T-PKG; an incumbent `R-PKG` blocks preflight with removal instructions and is never removed automatically (user answer).
- Two separate changes (user answer).

## Decisions

- Envelope and helpers follow the proven `thoth:subagent-usage` semantics: full snapshots (no deltas), subscribe-before-request, consumers filter by session ID, producers answer requests and queue them until state is ready.
- Transport for this change is `pi.events` within one session runtime; whether child sessions share the parent bus is deferred to change 2.
- Both packages ship TypeScript source like the other `pi-packages/*`. If AC-4 shows a TS-source dependency does not load from an installed package, `pi-core` gains a minimal build emitting JS and declarations instead (reassessment point, no other scope change).
- Initial versions `0.1.0`; no existing package versions change.
- `rpiv-config` removed (upstream default prompt snippet and guidelines are fixed); `rpiv-i18n` removed (English strings inlined).
- The fork is a first-party Thoth package derived from MIT source with retained attribution; it is not an external implementation vendored into the installer.
- Incumbent recovery guidance is scope-aware: user scope uses R-REMOVE; project scope uses the same `pi remove` package command with `--local --approve` after an ownership/trust caution, because Pi 1.0.2 rejects local package-config writes under `--no-approve` and `--approve` is a one-command approval that persists no trust (verification round 2 finding). The delegation incumbent path keeps its existing behavior.
- Project incumbents are detected read-only (no trust, no project code) from project Pi settings and native install roots, because `pi list --no-approve` omits project packages in Pi 1.0.2. Git sources are normalized by a port of SDK 1.0.2 `parseGitUrl` that uses the same exact `hosted-git-info` `9.0.3` (ISC) as a root runtime dependency, checked by a differential test against the SDK (`@earendil-works/pi-coding-agent` `1.0.2` as root devDependency only); a scan of project install roots for the incumbent manifest is the fallback when a source cannot be mapped (verification rounds 3-4 findings).
- Publishing `pi-core` before T-PKG, and both before a root release that pins T-PKG, is an operator release step outside this change; the pinned installer version is `0.1.0`.

## Durable deltas

- `ADDED pi-ecosystem` **Shared Pi ecosystem contract package** — `@thoth-agents/pi-core` MUST define the name, version and payload type of every cross-package Thoth Pi channel introduced through it (the pre-existing subagent-usage channels owned by pi-subagents are exempt until a separately authorized migration), MUST wrap payloads in an envelope carrying version, source package, session ID, timestamp and data, and its subscribe helper MUST ignore payloads with an unsupported version, foreign session filter mismatch or invalid shape instead of throwing; producers MUST publish complete snapshots after each state change and in answer to a request for their session.
  - GIVEN a producer and a consumer using pi-core in one Pi session; WHEN the consumer subscribes and then requests the snapshot; THEN it receives the current full snapshot for its session and later snapshots after each change, while malformed or other-version payloads are ignored .
- `ADDED pi-ecosystem` **Thoth Pi task-list extension** — The Thoth Pi task-list package (published under the `@thoth-agents` scope as a fork of the juicesharp rpiv 2.12.0 task-list package) MUST register the session task-list tool with the upstream 2.12.0 schema and transition rules, MUST reconstruct the session list from the branch on session start, tree navigation and compaction, MUST publish its full session snapshot on the pi-core task-list state channel after each change and in answer to a request, MUST add the open tasks to the model context before each agent start when any exist using an API detected at runtime that degrades without failing on the minimum supported Pi, and its editor widget MUST show only the current session's list.
  - GIVEN a session with open tasks in the task-list tool; WHEN the session is compacted and the agent starts again; THEN the list is reconstructed, the open tasks are present in the model context, and a fresh state snapshot is published on the pi-core task-list state channel .
- `ADDED cli-installation` **Install the first-party Pi task-list extension** — Complete Pi installation and applied Update MUST install and individually verify the Thoth Pi task-list package at its configured minimum version as an additional selected Pi package, and preflight MUST reject an installed juicesharp rpiv task-list package before changing any Pi state with a diagnostic containing the native `pi remove` command for that package; the installer MUST NOT remove it automatically. This requirement extends the selected inventory of "Install selected Pi interaction and web extensions"; its prohibition on installing the juicesharp rpiv task-list package remains in force.
  - GIVEN a Pi installation containing the juicesharp rpiv task-list package; WHEN the operator runs Install; THEN preflight fails with its `pi remove` instruction and no Pi state changes, while an installation without it receives and verifies the Thoth Pi task-list package .

## Plan

Approach:
- `pi-core` (no runtime dependencies): `defineChannel<T>({ name, version, validate })`; `ThothEnvelope<T>`; `publish(pi, channel, sessionId, source, data)`; `request(pi, channel, sessionId)`; `subscribe(pi, channel, { sessionId?, onSnapshot }) → unsubscribe`; channel constants `TODO_STATE_CHANNEL` (`T-STATE`, v1) and `TODO_STATE_REQUEST` (`T-REQ`), and `TodoSnapshot` (`tasks` with id, subject, description, activeForm, status, blockedBy, owner; `nextId`; counts by status). Pure, unit tested with a fake event bus.
- T-PKG: copy the 16 upstream source files from the local install, then: remove `config.ts`/`rpiv-config` and `i18n-bridge.ts`/locales (inline English); rename widget key; keep tool name, schema, transitions, T-CMD overlay, renderers and replay; add `state/publish.ts` wiring store changes, replay and requests to pi-core; add open-task reinjection on the agent-start hook detected at runtime (prefer the append-style prompt options used by gentle-shell; otherwise a supported fallback; otherwise disabled). Port upstream tests from `juicesharp/rpiv-mono@68d9a00` where applicable plus new tests for publication, reinjection and no-UI degradation; one real-SDK loader test for AC-4.
- Installer: add the T-TOOL spec entry, an incumbent check mirroring delegation, update fixtures/counts and docs.
- CI/docs: add both packages to both CI jobs and inventories.

Work-unit boundaries and order: U1 scaffolds both package manifests and runs the only `pnpm install` (lockfile owner) and implements pi-core; U2 (T-PKG source) and U3 (installer) then run in parallel with disjoint writes and no lockfile changes; U4 (CI/docs) after U2 and U3; U5 root gate; then fresh Oracle verification.

Risks: TS-source dependency loading (AC-4 reassessment); agent-start prompt API differences between 0.99.0 and 1.0.2 and the Claude bridge prompt handling; widget coexistence with the theme input box and the subagents/background widgets above the editor; release ordering of the new npm packages.

## Tasks

- [x] AC-1: `@thoth-agents/pi-core` package with channels, envelope, helpers and tests, plus both package manifests and the regenerated lockfile
  - Outcome: pi-core usable from workspace packages; T-PKG manifest present so no later unit changes the lockfile
  - Known entrypoints and skill paths: `pi-packages/pi-subagents/src/usage-events.ts`, `pi-packages/pi-thoth-theme/src/status-line/index.ts:74-128`, `pi-packages/pi-thoth-theme/{package.json,tsconfig.json,vitest.config.ts}` as manifest template, `pi-packages/pi-subagents/test/package.test.ts`; skills `C:\Users\EremesNG\.pi\agent\skills\tdd\SKILL.md`, `C:\Users\EremesNG\.pi\agent\skills\simplify\SKILL.md`
  - Inputs: this record (Plan, Decisions, AC-1)
  - Dependencies: none
  - Output: `pi-packages/pi-core/**`; `T-DIR/{package.json,tsconfig.json,vitest.config.ts}`; `pnpm-lock.yaml`
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-core/**`, the three T-PKG scaffold files, `pnpm-lock.yaml`
  - Interface boundaries: exported pi-core API named in Plan; no other package edited
  - Focused check and PASS evidence: `pnpm install` leaves `pnpm-lock.yaml` consistent and `pnpm install --frozen-lockfile` then reproduces; the root's declared `@earendil-works/pi-ai` and `@earendil-works/pi-tui` and the `@earendil-works/pi-coding-agent` resolved from `pi-packages/pi-core` and from T-DIR each report version `1.0.2` (the current tree still resolves 0.99.1); `pnpm --filter @thoth-agents/pi-core run typecheck` and `run test` exit 0
  - Return milestone: pi-core checks green and exported API summarized
  - Stop / reassessment: pi.events typing incompatible between 0.99.0 and 1.0.2, or a contract need beyond the Plan
- [x] AC-2: T-PKG fork with tool, command, widget and attribution, without `@juicesharp` dependencies
  - Outcome: upstream behavior preserved under the new name with ported tests passing
  - Known entrypoints and skill paths: `C:\Users\EremesNG\.pi\agent\npm\node_modules\@juicesharp\R-PKG\**`, upstream tests `https://github.com/juicesharp/rpiv-mono/tree/68d9a0014b70006d7b04b57933752338a2716db7/packages/R-DIR`, accepted pi-core; skills tdd and simplify paths above
  - Inputs: accepted AC-1 unit
  - Dependencies: AC-1 unit
  - Output: `T-DIR/**` source, tests, README, LICENSE
  - Owner: thoth-worker
  - Writes: `T-DIR/**` except `package.json` dependency set (edits limited to `files`, `pi`, scripts)
  - Interface boundaries: tool schema identical to R-PKG 2.12.0; widget key T-WIDGET; no lockfile change
  - Focused check and PASS evidence: `pnpm --filter T-PKG run typecheck` and `run test` exit 0; `rg "@juicesharp" T-DIR` only in LICENSE/README attribution; a widget test renders T-WIDGET above the editor next to other above-editor widget keys and confirms it uses only `ctx.ui.setWidget` with its own key, never `setEditorComponent`, `setFooter` or editor decoration (coexistence with pi-thoth-theme, pi-subagents and pi-background-tasks)
  - Return milestone: together with AC-3 and AC-4 below in the same assignment
  - Stop / reassessment: upstream behavior that depends on removed config/i18n beyond defaults
- [x] AC-3: T-PKG replay, pi-core state publication and open-task reinjection with runtime capability detection
  - Outcome: snapshots published on mutation/replay/request; open tasks reinjected; degrades on Pi 0.99.0 typings
  - Known entrypoints and skill paths: T-PKG `state/replay.ts`, `state/store.ts`, `index.ts`; gentle reference `https://github.com/Gentleman-Programming/gentle-shell/blob/07f7d1d4bc6320de37a6c5c41dbf529ac0bc8b1b/G-REF`; Pi 1.0.2 `dist/core/extensions/types.d.ts`
  - Inputs: accepted AC-1 unit
  - Dependencies: AC-1 unit (same assignment as the AC-2 row)
  - Output: publication and reinjection modules with tests
  - Owner: thoth-worker
  - Writes: `T-DIR/**`
  - Interface boundaries: pi-core task-list channel v1
  - Focused check and PASS evidence: Vitest cases for publish-after-mutation, request answer, replay publication, reinjection present/absent, missing-API degradation pass
  - Return milestone: same assignment as AC-2
  - Stop / reassessment: no agent-start API usable on both 0.99.0 and 1.0.2 without bridge conflicts
- [x] AC-4: Real Pi SDK 1.0.2 loader test for T-PKG resolving pi-core as a dependency
  - Outcome: evidence that the TS-source dependency layout loads
  - Known entrypoints and skill paths: `pi-packages/pi-subagents/test/runner/*real-sdk*.test.ts` as pattern
  - Inputs: accepted AC-1 unit
  - Dependencies: AC-1 unit (same assignment as the AC-2 row)
  - Output: one real-SDK test in `T-DIR/test/`
  - Owner: thoth-worker
  - Writes: `T-DIR/test/**`
  - Interface boundaries: none
  - Focused check and PASS evidence: the test packs both packages, installs the tarballs into a temporary directory, loads T-PKG through the SDK 1.0.2 loader and registers T-TOOL and T-CMD with no load errors
  - Return milestone: same assignment as AC-2
  - Stop / reassessment: dependency fails to load → return for the pi-core build-step decision
- [x] AC-5: Installer installs and verifies T-PKG and blocks on incumbent R-PKG, test-first, with CLI docs
  - Outcome: sixth selected package and preflight blocker with removal instruction
  - Known entrypoints and skill paths: `src/cli/pi-install.ts:43-74,470-474,870-880`, `src/cli/pi-install.test.ts:359-369`, `src/cli/operations/pi.ts:860`, `src/cli/operations/pi.test.ts:398-443`, `src/cli/{commands,install}.test.ts`, `docs/agent/cli-installation.md`, `docs/installation.md`; skill tdd path above
  - Inputs: this record; package name and version `T-PKG@0.1.0`
  - Dependencies: AC-1 unit (lockfile settled)
  - Output: updated installer, tests, CLI docs
  - Owner: thoth-worker
  - Writes: `src/cli/**`, `docs/agent/cli-installation.md`, `docs/installation.md`
  - Interface boundaries: no other installer behavior changes; no automatic removal
  - Focused check and PASS evidence: failing tests observed first; `pnpm vitest run src/cli` passes
  - Return milestone: CLI tests green
  - Stop / reassessment: status/update flows requiring new ownership semantics beyond the blocker
- [x] AC-6: CI jobs and repository inventories include pi-core and T-PKG
  - Outcome: both packages checked in Ubuntu and Windows jobs; docs list eight packages
  - Known entrypoints and skill paths: `.github/workflows/ci.yml:53-83,107-143`, `docs/agent/harness-packaging.md:33-52`, `docs/agent/testing.md:45-53`, `AGENTS.md`
  - Inputs: accepted AC-2..AC-5 units
  - Dependencies: AC-2, AC-3, AC-4 and AC-5 units
  - Output: CI and docs edits
  - Owner: thoth-worker
  - Writes: `.github/workflows/ci.yml`, `docs/agent/harness-packaging.md`, `docs/agent/testing.md`, `AGENTS.md`
  - Interface boundaries: CI steps follow existing per-package pattern
  - Focused check and PASS evidence: `rg` shows both package filters in both jobs; no stale "six" package count remains
  - Return milestone: edits done
  - Stop / reassessment: test enforcing CI/doc text that conflicts
- [x] AC-7: Full repository gate
  - Outcome: all CI-equivalent checks pass
  - Known entrypoints and skill paths: root `package.json` scripts, `.github/workflows/ci.yml`
  - Inputs: accepted AC-1..AC-6 units
  - Dependencies: all previous units
  - Output: results recorded in Verification
  - Owner: root
  - Writes: none
  - Interface boundaries: none
  - Focused check and PASS evidence: `pnpm install --frozen-lockfile`, `pnpm run check:ci`, `pnpm run typecheck`, `pnpm run build`, `pnpm test`, each `pi-packages/*` typecheck and offline test exit 0
  - Return milestone: before Oracle verification
  - Stop / reassessment: any failure returns to the owning unit

## Authorization

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

- Plan review history: round 1 [REJECT] pi-core delta claimed every cross-package channel while subagent-usage stays out of scope — scoped with explicit exemption (plus SDK refresh, packed loader and widget coexistence checks); round 2 [REJECT] AC-1 resolution check targeted an undeclared root dependency — retargeted; round 3 fresh Oracle [OKAY].
- Implementation authorized by explicit user choice (Implement) after [OKAY].

## Verification

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 4f41d6871362575fba28ca35ef66e133e756d6c6d7b893b4ceb2405856373144

- Review history: round 1 FAIL (unversioned request channels; root suite env prerequisites; Pi progress docs) repaired; round 2 FAIL (project-scope removal guidance) repaired; round 3 FAIL (project incumbents hidden by `pi list --no-approve`) repaired; round 4 FAIL (Git URL normalization divergence) repaired with SDK parser port and install-root scan; round 5 FAIL (missing upstream Pi MIT notice) repaired; round 6 fresh Oracle PASS.
- AC-1: PASS | pi-core typecheck + 120 Vitest tests + manifest/API review | versioned envelopes for snapshot and request channels, validation ignores unsupported version, session mismatch and malformed payloads without throwing
- AC-2: PASS | pi-todo typecheck + 205 Vitest tests + AST parity vs installed upstream 2.12.0 | same schema/transitions/replay, widget thoth-todos via setWidget only, juicesharp MIT notice retained, no juicesharp dependency
- AC-3: PASS | lifecycle/publication/reinjection tests | snapshots after mutation, replay and request; append-only reinjection via systemPromptOptions.appendSystemPrompt (present in 0.99.0 and 1.0.2 typings) degrading on missing/read-only API
- AC-4: PASS | packed-tarball real SDK 1.0.2 loader test, independently rerun offline | pi-core resolved as regular packed dependency; tool and command registered without errors
- AC-5: PASS | 805 CLI tests, 96 SDK differential Git cases, 29 independent native probes | sixth selected package verified; user, project npm/local/Git incumbents block before mutation with scope-aware guidance; no trust, approval, project code or removal
- AC-6: PASS | parsed CI YAML + docs inspection | pi-core and pi-todo typecheck/tests in Ubuntu and Windows jobs; eight-package inventories
- AC-7: PASS | pnpm install --frozen-lockfile, check:ci, typecheck, build, root pnpm test 102 files/1455 tests (THOTH_PLUGINS_ROOT set to the sibling thoth-plugins fixture, CODEX_HOME unset), every pi-packages typecheck and offline tests | all exit 0; without those prerequisites the same root failures reproduce on clean HEAD (environmental)
- Source: .thoth/specs/pi-ecosystem/spec.md | absent
- Source: .thoth/specs/cli-installation/spec.md | sha256:c1dd13a765246fa7fb76990d2daff2d3509ff7028d0acab3ce3ace15f205faac

## Closeout

**Archive**: READY
