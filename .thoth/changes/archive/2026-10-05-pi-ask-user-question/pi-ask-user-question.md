# Change: pi-ask-user-question

**Classification**: substantial
**Scope**: cross-cutting
**Uncertainty**: medium
**Risk**: medium

## Exploration

- `ask_user_question` for Pi is provided today by the third-party extension
  the juicesharp rpiv question package (`npm:@juicesharp/rpiv-…-user-question@>=2.9.0`), installed by the CLI through
  native `pi install` (`src/cli/pi-install.ts:51-87,714-726`). It is not in
  `pi-packages/*` nor a root dependency. Its contract (1–4 questions, 2–4
  options, header/label/description, optional preview and multiSelect, free-text
  row, `details.answers`, cancellation, `no_ui`) is recorded in archived research
  `.thoth/history/openspec/changes/archive/2026-09-04-pi-rpiv-extensions/research.md:18-25`.
- Pi root prompt guidance names the tool and the 1–4 / 2–4 counts in
  `src/harness/adapters/pi.ts:50-62`; shared `<questions>` sections in
  `src/agents/prompt-sections.ts:414-438`; per-harness names in
  `src/agents/prompt-dialects.ts:147,183,236,284` (OpenCode `question`, Codex
  `request_user_input`, Claude Code `AskUserQuestion`, Pi `ask_user_question`).
  Tests: `src/harness/adapters/pi.test.ts`, `src/agents/prompt-dialects.test.ts`,
  `src/agents/prompt-rendering.test.ts`, `src/cli/pi-install.test.ts`,
  `src/cli/operations/pi.test.ts`, `src/pi/tools-panel.test.ts`. Docs:
  `docs/installation.md`, `docs/skills-and-mcps.md`, `docs/agent/cli-installation.md`,
  `docs/agent/harness-packaging.md`, `docs/agent/agents-and-delegation.md`.
- Child agents do not receive the tool by default and route questions through
  `ask_orchestrator` (`src/harness/adapters/pi.ts:50-56`; spec
  `multi-harness-agent-pack` "Use Pi interactive questions truthfully"). That
  contract is preserved unchanged.
- First-party Pi packages live in `pi-packages/*` (eight today, workspace
  `pnpm-workspace.yaml`), declare Pi SDK peers `>=0.99.0`, dev SDK/TUI `1.0.2`,
  Node `>=22.19.0`, `pi.extensions` manifest, `typecheck`/`test` scripts
  (`docs/agent/harness-packaging.md:33-36`; the task-list package manifest).
  `pi-ecosystem` spec requires first-party producers to render through the
  pi-core render kit with a native fallback and to publish tool definitions in
  the pi-core tool registry from UI sessions only.
- External references studied (MIT): DoomPi user-feedback
  (tabs, question notes, RPC select/input fallback, preview below),
  rinaldo-rex `pi-…-better` (ids, `type`, `recommended`, option+question notes, review
  Submit/Cancel, numeric shortcuts, no maximum counts, no RPC),
  pi-harness question package (responsive right-side preview panel collapsing
  below under 100 columns, PgUp/PgDn preview scroll, review screen for multiple
  questions, RPC fallback). No code is vendored; ideas only.

## Intent

Replace the third-party Pi `ask_user_question` provider with a robust, modern
first-party package `@thoth-agents/pi-questions-user` (`pi-packages/pi-questions-user`) that keeps the
tool name `ask_user_question`, supports richer question shapes with no declared
maximum on questions or options, a TUI ready for large questionnaires with a
right-side preview, and a well-structured answer for the model.

## Non-goals

- Pause/explain-and-resume, replay, `/answer` extraction (as in the rinaldo-rex package).
- A pi-core question channel for other packages (permissions, subagents) or
  routing child questions to the human; `ask_orchestrator` stays as is.
- Voice, web/server facets, number type, answer timeouts.
- Changing question tools of OpenCode, Codex or Claude Code.
- Auto-incrementing package versions or vendoring external source.

## Acceptance

- AC-1: `@thoth-agents/pi-questions-user` registers `ask_user_question` with a schema of optional `title` and questions `{ id, header, prompt, type: single|multi|text|confirm, required?, options[{ value, label, description?, preview?, recommended? }] }`, no declared maximum on questions/options, and runtime validation (unique ids/values, non-blank fields, options required for single/multi, none required for text/confirm) returning structured errors.
- AC-2: The tool returns `content` text plus `details` with `cancelled`, optional `error` code, and per-question answers keyed by `id` with `status` (answered|skipped), `values`, `labels`, `customText`, question `note` and `optionNotes`; cancellation keeps recorded answers and explicitly tells the model not to assume answers.
- AC-3: When custom UI is unavailable (including RPC, where `hasUI` is true but `ctx.ui.custom` resolves `undefined`) the tool asks sequentially through `select`/`input` (multi via repeated toggles, free-text fallback); with no UI it is not active and a forced call returns `cancelled: true, error: "no_ui"`.
- AC-4: The interactive TUI provides question tabs, scrollable option list with numeric shortcuts, a free-text row, question and option notes, a right-side preview panel that moves below the options on narrow terminals and scrolls independently, a review screen before submission (single question may submit directly), and Esc cancel semantics that do not lose editor drafts silently.
- AC-5: Rendering uses the pi-core render kit when present with native fallback, and the tool definition is published in the pi-core tool registry from UI sessions and withdrawn on shutdown, per `pi-ecosystem`.
- AC-6: The CLI installs/verifies the first-party package instead of the juicesharp rpiv question package, removes a conflicting user-scope juicesharp rpiv question package through native Pi removal before install, blocks a project-scope one with manual removal guidance, and dry-run stays mutation-free.
- AC-7: Pi prompt guidance, docs, CI package list and tests reflect the new schema (types, ids, no fixed limits) without changing other harnesses or child routing.

## Clarifications

- RESOLVED (user): approach is an own first-party package inspired by the three references, not a fork or direct install.
- RESOLVED (user): keep the tool name `ask_user_question`.
- RESOLVED (user): v1 scope as listed in Acceptance; right-side preview is high value.
- RESOLVED (user): no declared maximum on questions or options.
- RESOLVED (root, safety convention): conflicting rpiv question package is auto-removed only at user scope; project scope blocks with manual guidance, consistent with existing Pi conflict handling.

## Decisions

- Package `@thoth-agents/pi-questions-user` at `pi-packages/pi-questions-user`, same manifest/peer/test conventions as the first-party task-list package; MIT; no runtime dependency beyond Pi peers, TypeBox and `@thoth-agents/pi-core`.
- `recommended` is a structured flag rendered as a marker; it is never preselected and never auto-submitted.
- `required` is advisory: the review screen flags unanswered required questions but the user may still submit; skipped questions are reported as `skipped`.
- Free-text row is available for single/multi; in multi it combines with picks. `text` type is free text only; `confirm` renders Yes/No options with optional note.
- Preview panel goes to the right at terminal width >= 100 columns, below otherwise (bounded technical default; adjustable during design without reopening scope).
- Error codes: `no_ui`, `invalid_questions`, `aborted`.
- Root prompt guidance drops fixed counts and describes the new fields; child-routing text is unchanged.

## Durable deltas

- `ADDED pi-ecosystem` **Thoth Pi question tool** — The `@thoth-agents/pi-questions-user` package MUST register `ask_user_question` with stable question ids, `single`/`multi`/`text`/`confirm` types, structured `recommended` options, optional previews and no declared maximum on questions or options; MUST return per-id structured answers with status, values, labels, custom text and notes, and report cancellation without implying answers; MUST fall back to sequential select/input without custom UI and return `no_ui` without UI; its TUI MUST show the preview beside the options on wide terminals and below them on narrow ones, and offer a review step before submitting multiple questions.
  - GIVEN a root session with the TUI; WHEN the model asks two questions with option previews on a wide terminal; THEN previews render to the right of the options, a review step precedes submission and the result lists each answer by question id.
- `MODIFIED cli-installation` **Install selected Pi interaction and web extensions** — Complete Pi installation and applied Update MUST install and individually verify the selected Pi-native delegation, Context7, web-access and grep-adapter packages after first-party verification, using their configured minimum versions; the interactive question tool MUST come from the first-party `@thoth-agents/pi-questions-user` package, which MUST likewise be installed and individually verified at its configured minimum version after root-package verification. The juicesharp rpiv task-list, web-tools and question packages and `@feniix/pi-exa` MUST NOT be required or installed by the selected inventory, and a user-scope installed juicesharp rpiv question package MUST be removed natively before installation, while a project-scope one MUST block completion with explicit manual removal guidance instead of granting project trust. Dry-run MUST remain mutation-free; required dependency failure MUST prevent completion recording; external implementations MUST NOT be vendored.
  - GIVEN a Pi profile with the juicesharp rpiv question package installed at user scope; WHEN Install or applied Update runs; THEN that package is natively removed, `@thoth-agents/pi-questions-user` is installed and verified, and dry-run performs no mutation.

## Plan

**Package (`pi-packages/pi-questions-user`)** — modules: `schema.ts` (TypeBox tool parameters), `validate.ts` (runtime checks, structured issues), `answers.ts` (state model, result/text formatting), `rpc.ts` (select/input fallback), `ui/` (custom component: tabs, option list with scroll window, free-text editor, notes editors, preview pane with responsive layout and own scroll, review screen), `index.ts` (registration, `before_agent_start` activation gating on UI, render kit lookup for call/result, tool registry publication/withdrawal). Tests with the package's offline test runner covering validation, formatting, RPC flow, state transitions and layout breakpoints (pure render-to-lines tests at fixed widths).

**Integration** — `src/cli/pi-install.ts` swaps the external spec for the first-party package in the install plan and adds native removal of the conflicting rpiv package; prompt text in `src/harness/adapters/pi.ts` and related tests; docs listed in Exploration; CI windows job and AGENTS.md package count (eight → nine); `pnpm-workspace` already covers `pi-packages/*`.

**Seams / verification** — package `typecheck` + `test`; root `pnpm run check:ci`, `pnpm run typecheck`, `pnpm run build`, `pnpm test`; manual TUI smoke check of wide/narrow layout by the user is optional evidence.

**Risks** — Pi TUI custom-component API differences across `>=0.99.0`; tool-name collision while both providers are installed (mitigated by native removal); prompts/tests asserting old limits; large questionnaires rendering performance (scroll windowing).

**Units** — U1 core (AC-1..3, worker; sole owner of `src/index.ts` registration and lifecycle) → U2 TUI and renderers (AC-4..5, designer, exports only from `src/ui/**` and `src/render*.ts`, depends on U1 state/types) and U3 integration (AC-6..7, worker, depends on U1 package name/schema only; parallel with U2) → U4 wiring (AC-4..5, worker, connects accepted U2 exports, render kit and tool registry in `src/index.ts`).

## Tasks

- [x] AC-1: Package scaffold, schema and runtime validation for `ask_user_question`
  - Outcome: `pi-packages/pi-questions-user` builds, typechecks and registers the tool with the agreed schema and validation
  - Known entrypoints and skill paths: the first-party task-list package directory (conventions), `pi-packages/pi-core/src/`, `docs/agent/harness-packaging.md`, `C:\Users\EremesNG\.pi\agent\skills\tdd\SKILL.md`
  - Inputs: Acceptance AC-1, Decisions, Librarian schema evidence (Exploration)
  - Dependencies: none
  - Output: package manifest, `schema.ts`, `validate.ts`, `index.ts` registration, tests
  - Owner: thoth-worker (U1)
  - Writes: `pi-packages/pi-questions-user/**` except `src/ui/**`; `pnpm-lock.yaml`
  - Interface boundaries: Pi `registerTool` API; pi-core exports; tool name `ask_user_question`
  - Focused check and PASS evidence: package `typecheck` and `test` pass with validation cases
  - Return milestone: package scaffold with passing validation tests
  - Stop / reassessment: Pi API mismatch with peers `>=0.99.0` or pi-core contract gaps
- [x] AC-2: Structured answer model and result formatting
  - Outcome: answer state and `details`/text output exactly as AC-2, including cancellation
  - Known entrypoints and skill paths: `pi-packages/pi-questions-user/src/answers.ts`
  - Inputs: AC-1 output
  - Dependencies: AC-1 scaffold
  - Output: `answers.ts` + tests
  - Owner: thoth-worker (U1)
  - Writes: `pi-packages/pi-questions-user/src/answers.ts`, its tests
  - Interface boundaries: state model consumed by UI and RPC
  - Focused check and PASS evidence: tests for answered/skipped/cancelled/notes pass
  - Return milestone: with U1 return
  - Stop / reassessment: ambiguity in result contract
- [x] AC-3: RPC select/input fallback and no-UI behavior
  - Outcome: sequential fallback and `no_ui` gating per AC-3
  - Known entrypoints and skill paths: `pi-packages/pi-questions-user/src/rpc.ts`, `src/index.ts`
  - Inputs: AC-1, AC-2 outputs
  - Dependencies: AC-2
  - Output: `rpc.ts`, activation gating, tests with fake UI
  - Owner: thoth-worker (U1)
  - Writes: `pi-packages/pi-questions-user/src/rpc.ts`, `src/index.ts`, tests
  - Interface boundaries: Pi `ctx.ui.select`/`input`, `hasUI`
  - Focused check and PASS evidence: fake-UI tests for single, multi, text, confirm, cancel and no-UI pass
  - Return milestone: U1 complete, all package tests green
  - Stop / reassessment: host API not exposing select/input as assumed
- [x] AC-4: Interactive TUI questionnaire with right-side preview and review
  - Outcome: custom component meeting AC-4
  - Known entrypoints and skill paths: `pi-packages/pi-questions-user/src/ui/`, Pi TUI `Editor`/`Markdown`
  - Inputs: U1 accepted state model and types
  - Dependencies: AC-1, AC-2, AC-3 accepted
  - Output: exported UI component, keyboard handling, layout, tests rendering at fixed widths (no registration wiring)
  - Owner: thoth-designer (U2)
  - Writes: `pi-packages/pi-questions-user/src/ui/**` and its tests
  - Interface boundaries: `ctx.ui.custom`; answer state API from AC-2
  - Focused check and PASS evidence: render tests at 80 and 140 columns show below/right preview; state tests for tabs, scroll, notes, review, Esc
  - Return milestone: component exported and tests green
  - Stop / reassessment: TUI API limits that block side-by-side layout
- [x] AC-5: Render kit call/result renderers with native fallback
  - Outcome: exported call/result renderers via pi-core kit with native fallback
  - Known entrypoints and skill paths: `pi-packages/pi-core/src/`, the task-list package render usage
  - Inputs: U1 package
  - Dependencies: AC-1
  - Output: exported renderers with tests (no registration wiring)
  - Owner: thoth-designer (U2)
  - Writes: `pi-packages/pi-questions-user/src/render*.ts`, tests
  - Interface boundaries: pi-core render kit contract
  - Focused check and PASS evidence: renderer tests with and without kit pass
  - Return milestone: with U2 return
  - Stop / reassessment: pi-core contract gap
- [x] AC-4: Wire accepted TUI, renderers and tool registry into registration
  - Outcome: tool uses the custom UI when available, falls back to AC-3 otherwise, renders through AC-5 renderers, and publishes/withdraws its definition in the pi-core tool registry (AC-5)
  - Known entrypoints and skill paths: `pi-packages/pi-questions-user/src/index.ts`, `pi-packages/pi-core/src/`
  - Inputs: accepted U2 exports
  - Dependencies: AC-4 and AC-5 designer units accepted
  - Output: wiring and tests
  - Owner: thoth-worker (U4)
  - Writes: `pi-packages/pi-questions-user/src/index.ts` and its tests
  - Interface boundaries: Pi `registerTool`, `ctx.ui.custom`, pi-core tool registry
  - Focused check and PASS evidence: package tests cover custom-UI path, custom-undefined fallback, registry publish on UI session and withdraw on shutdown
  - Return milestone: package tests and typecheck green
  - Stop / reassessment: U2 export interface mismatch
- [x] AC-6: CLI installs first-party package and removes conflicting rpiv package
  - Outcome: install plan per AC-6 and updated CLI tests
  - Known entrypoints and skill paths: `src/cli/pi-install.ts`, `src/cli/pi-install.test.ts`, `src/cli/operations/pi.test.ts`, `docs/agent/cli-installation.md`
  - Inputs: U1 package name
  - Dependencies: AC-1
  - Output: CLI changes + tests
  - Owner: thoth-worker (U3)
  - Writes: `src/cli/**` relevant files and tests
  - Interface boundaries: native `pi install`/removal; dry-run contract
  - Focused check and PASS evidence: `pnpm test src/cli` relevant suites pass, including dry-run no mutation
  - Return milestone: CLI suites green
  - Stop / reassessment: first-party packages not installable individually by current install flow
- [x] AC-7: Prompt guidance, docs, CI and tests updated
  - Outcome: references reflect new schema; other harnesses and child routing unchanged
  - Known entrypoints and skill paths: `src/harness/adapters/pi.ts`, `src/agents/prompt-sections.ts`, tests listed in Exploration, docs listed in Exploration, `.github/workflows/ci.yml`, `AGENTS.md`
  - Inputs: AC-1 schema
  - Dependencies: AC-1
  - Output: updated prompts, docs, CI job, tests
  - Owner: thoth-worker (U3)
  - Writes: listed files
  - Interface boundaries: Pi root prompt contract; other harness dialects untouched
  - Focused check and PASS evidence: `pnpm run check:ci`, `pnpm run typecheck`, `pnpm run build`, `pnpm test` pass
  - Return milestone: full pre-merge sequence green
  - Stop / reassessment: spec text conflicts

## Authorization

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

## Verification

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: c759594c16104a6050fb3c7b1c34f399459d5864c4751ed875c3e46e40c6ed62

- AC-1: PASS | schema and runtime validation tests | `schema.ts`, `validate.ts` and package tests cover uniqueness, blank fields, type-specific options, structured errors and no declared maxima
- AC-2: PASS | structured answers and cancellation tests | `answers.ts` tests cover per-id status, values/labels, custom text, notes incl. prototype-named keys, retained answers and explicit cancellation warning
- AC-3: PASS | RPC fallback and headless tests | `index.test.ts`/`rpc.test.ts` cover custom-UI undefined fallback, sequential select/input, inactive headless tool and forced no_ui
- AC-4: PASS | TUI interaction and layout tests | `ui.test.ts` covers tabs, windowed options, shortcuts, notes, independent preview scroll, 80/140-column layouts, review, Esc drafts and once-only abort teardown
- AC-5: PASS | render-kit and registry lifecycle tests | renderer/registration tests cover render-time kit lookup, native fallback, UI-only publication and handle-owned withdrawal
- AC-6: PASS | installation, migration and preflight tests | `src/cli/pi-install.test.ts` covers verified native user-scope removal, project blocking, mutation-free preview, preview/apply parity across sources, valid local sources and malformed evidence rejected before mutation; CLI 876 tests pass
- AC-7: PASS | prompt, docs, CI and routing review plus tests | Pi schema guidance and package inventory updated; 1,037 focused CLI/prompt tests pass; other harnesses and child routing unchanged
- Checks (fresh round-8 current-state attestation): package typecheck and 130 tests PASS; focused CLI/prompt/adapter 1,079 tests PASS; changed-file Biome 28 files PASS; schema JSON blob unchanged vs HEAD; root typecheck PASS; `pnpm run build` PASS with no tracked drift; full suite 1463/1467 with 4 publish-marketplace tests unrun-equivalent due to absent external THOTH_PLUGINS_ROOT checkout; `check:ci` fails only on unchanged `pi-packages/pi-subagents/test/ui/panel.test.ts:3323`; no live TUI or native install smoke test
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:aaf8a80d64a297922c81ebd4e26bbe8bd7769dee0bf1e6446a5fd1a66c60dd43
- Source: .thoth/specs/cli-installation/spec.md | sha256:9b7259c998481810562fd6477b23ed0abecbad472c552f7b7ad02685c0e435e1

## Closeout

**Archive**: READY
