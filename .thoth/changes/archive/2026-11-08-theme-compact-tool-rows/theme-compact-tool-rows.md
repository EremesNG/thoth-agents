# Change: theme-compact-tool-rows

**Classification**: substantial
**Scope**: cross-cutting
**Uncertainty**: low
**Risk**: medium

## Exploration

Paths are relative to the repository root; `T` = `pi-packages/pi-thoth-theme`.

- Theme-owned renderers: `T/src/tools/index.ts:29-85` dispatches bash/PowerShell (`T/src/tools/bash.ts`), read, edit, write, ls/grep/find, codemode (`T/src/tools/codemode.ts`) and every other unowned tool through `T/src/tools/generic.ts`. Tools whose renderer belongs to a respected package (`thoth-agents`, `@thoth-agents/*`, `thoth-mem`; `T/src/shared/config.ts:15-19`) keep their own callbacks.
- Collapsed output today: bash 5 lines (`bash.ts:27`), edit/write 6-line previews, generic and codemode 8 lines, read a line-count row. Call and result share `context.state`; the result invalidates the call so its closing frame disappears (`bash.ts:112-119`, `:143-159`). Running uses `executionStarted`/`isPartial`, errors use `context.isError`.
- Config: `~/.pi/agent/pi-thoth-theme.json` (or `$PI_CODING_AGENT_DIR`), handwritten normalization in `T/src/shared/config.ts:21-79`, `:118-144`; loaded once at init (`T/src/index.ts:16-18`) and passed to renderer factories; manual edits need `/reload` (`T/README.md:204-207`).
- Pi host (installed 1.5.0): `tool-execution.js:48` always adds `Spacer(1)` before each tool execution; call and result components are appended without a spacer, so an empty call component plus a one-row result yields one content row; `options.expanded` reaches both slots and expansion recreates them (confirmed by a plan-review SDK probe). Inline images are appended by the host separately.
- Render-kit v1 contract: `pi-packages/pi-core/src/render-kit.ts:94-127` `RenderCardOptions` (title, body, sections, footer, status, context, summary, isError, isSuccess, wrap, part `full|start|end`); `:129-145` `collapse()` takes `expanded`; card context omits `expanded`; `:458-460` version 1, key `Symbol.for('thoth-agents.pi-core.render-kit.v1')`; `:503-531` discovery validates version and required methods, so additive optional option fields keep the v1 shape. Theme implementation `T/src/render-kit/index.ts:102`, `:212-245`. `pi-packages/pi-core/src/testing.ts:39-89` is a test fake.
- `card()` callers: tool cards in pi-todo (`view/format.ts:434,527`), pi-subagents (`src/render/tools/components.ts:150` shared by tool results and messages), pi-askcodex, pi-antigravity-bridge, pi-questions-user, pi-background-tasks, theme codemode; non-tool cards in notifications/custom messages (pi-background-tasks `messages.ts:97`, pi-subagents completion/question messages, antigravity custom entries), panel frame and questionnaire frame.
- pi-todo splits one logical card: call (`format.ts:415-461`, title `todo`, args summary) becomes `part: 'start'` with empty body once a result exists; result (`:469-548`) renders `part: 'end'` without a title, has expanded (`options.expanded ?? context.expanded`), status (partial wins over error, `:153-165`), result summary/counts and first error line (`:491-519`).
- pi-subagents: `subagent-run.ts:40-50` empty call slot; result owns the card; collapsed title/body built at `:166-234` (agent, task label, status, model, effort, cost, first error line); `components.ts:86-98,150-165` boxed options omit expanded; `message: true` suppresses tool chrome. Other kit-rendered subagent tools (cancel, extend, list agents, list tasks, reply, result, send message, status) all reach `components.ts:150`.
- Reusable theme helpers: `T/src/tools/box.ts:48-85`, `:259-268`; `T/src/shared/expand-hint.ts:55-100`; `generic.ts:74-85` `summarizeArgs`; `T/src/shared/icons.ts:104-117`; `T/src/tools/border.ts:12-20`; `T/src/render-kit/index.ts:176-208` `toolFooter`; `bash.ts:64-83` exit extraction, `:175-195` line/word summaries.
- Canonical `.thoth/specs/pi-ecosystem/spec.md` governs render-kit registration, result borders (running shell/generic stays running even with a partial error flag), standard status footer (animation frame or static running glyph), codemode collapsed rendering (eight nested calls), version-tolerant registries and expand-hint fitting.

## Intent

Offer an opt-in minimal collapsed rendering for tool calls, selected in the theme settings file: `line` (one content row) and `compact` (at most two content rows). The default `frame` mode and every expanded view keep today's framed cards. Theme built-in renderers adopt it directly; render-kit tool cards adopt it through an additive, opt-in v1 card option, and pi-todo and pi-subagents tool cards opt in now.

## Non-goals

- No runtime command; the setting lives only in `pi-thoth-theme.json` and applies after `/reload`.
- No density for notifications, custom messages, questionnaire frames, panel frames or subagent message cards.
- No opt-in by pi-askcodex, pi-antigravity-bridge, pi-questions-user or pi-background-tasks in this change (they keep framed cards; follow-up).
- No thoth-mem renderer changes; no removal of Pi's host leading blank row; no patching Pi internals.
- No render-kit contract version bump; no package version bumps.

## Acceptance

The collapsed row contract (CRC) referenced below:
- `line`: running and successful collapsed states render exactly one content row: status glyph (running uses the standard footer's animation frame or static glyph per the animation setting), tool name/title, primary argument or summary, and a dim tail (elapsed, exit code, counts as applicable), fitted to the available width with the expand key preserved per the existing hint-fitting rule; when a row does not fit, segments are kept in priority order status glyph › expand key › tool name/title › tail (exit, elapsed, counts) › primary argument/summary, so the argument/summary is truncated first.
- `compact`: at most two content rows: row 1 as in `line`, row 2 a dim continuation with the first meaningful output/body line and the expand hint.
- A running card stays in its running form (CRC row count for running) even with a partial error flag; only a terminal failure (`isError` or non-zero exit) renders exactly two content rows, the second showing the first error line in the theme error color.
- The expanded view in every mode renders the current framed card for call and result.

- AC-1: `tools.collapsed` in `pi-thoth-theme.json` accepts `frame`, `compact` or `line`; omitted or malformed values normalize to `frame`; with `frame` every theme renderer and render-kit card output is unchanged (existing renderer and producer tests pass unmodified).
- AC-2: pi-core v1 `RenderCardOptions` gains optional `expanded?: boolean`, `surface?: 'tool'` and `row?: { title?: string; summary?: string; tail?: string[]; body?: string[] }` (collapsed-row data, used only when the kit applies the CRC: `summary` = primary argument/summary shown in every state, `tail` = terminal metrics after elapsed, `body` = continuation/error line); the registry key, version and required methods are unchanged; producers that omit them and kits that ignore them behave as before.
- AC-3: bash, PowerShell and generic renderers satisfy the CRC in `line` and `compact`.
- AC-4: read, edit, write, ls, grep, find and codemode renderers satisfy the CRC in `line` and `compact` (codemode continuation row: nested call names).
- AC-5: The theme kit `card()` applies the CRC only when `surface: 'tool'` and `expanded` is explicitly `false` in `line`/`compact`; a collapsed `part: 'start'` renders zero rows and a `part: 'end'` renders the CRC rows from `row` fields when given (else its own title, summary and first body row) and its status; cards without the opt-in render unchanged. Producers never probe the kit to detect density.
- AC-6: pi-todo call and result cards opt in (result passes title `todo` plus the call summary and its expanded state) and satisfy the CRC; legacy no-kit rendering unchanged.
- AC-7: pi-subagents tool cards (run, cancel, extend, list agents, list tasks, reply, result, send message, status) opt in through `boxedComponent` in tool mode only and satisfy the CRC; message-mode cards unchanged.
- AC-8: The theme README documents `tools.collapsed`, values, default, `/reload`, covered surfaces and the unavoidable host blank row.

## Clarifications

- Modes: user chose both `line` and `compact` as values of one option.
- Switching: user declined a `/thoth-tools` command; the setting lives only in the theme settings file.
- Narrow widths: user chose truncation priority glyph › expand key › tool name › exit/elapsed › argument/summary.
- Render kit: after plan review showed todo and subagent_run already use kit cards, user chose to include the render kit now (pi-core contract + pi-todo + pi-subagents).

## Decisions

- Setting key `tools.collapsed`, enum `frame | compact | line`, default `frame`, normalized like `icons`/`animation`.
- Theme built-ins: collapsed with a result, the call slot renders an empty component and the result slot renders the rows; before a result the call slot renders the single running row; expanded delegates to the existing framed renderers unchanged.
- One shared CRC row builder in the theme is used by both built-in renderers and the kit `card()` implementation; it composes existing helpers and adds no duplicate truncation logic.
- Kit density is opt-in per card (`surface: 'tool'` plus explicit `expanded`), because `status` does not identify tool surfaces and context-free cards cannot know expansion. Additive optional fields keep the v1 key; older kits ignore them and keep framed cards, which is acceptable.
- Implementation refinement (after units 4-5 used a `kit.card` probe to detect density and altered an existing test): producers pass compact-row data in the optional `row` card field instead of probing; framed kits ignore it, so producers need no density knowledge.
- Running precedence follows the existing "Render kit result borders" rule: running wins over a partial error flag.
- Codemode collapsed behavior changes only in `line`/`compact`, declared as a MODIFIED requirement; hint fitting, animation and status footer requirements keep applying.
- Ownership: visual renderer and card work goes to `thoth-designer` (constitution); nonvisual config/contract work to `thoth-worker`.
- Host blank row before each tool is accepted and documented.

## Durable deltas

- `ADDED pi-ecosystem` **Theme collapsed tool row density** — `@thoth-agents/pi-thoth-theme` MUST accept a `tools.collapsed` setting of `frame`, `compact` or `line` in `pi-thoth-theme.json`, defaulting to `frame` when omitted or malformed. `@thoth-agents/pi-core` render-kit v1 card options MUST accept optional `expanded` and `surface: 'tool'` fields without changing the registry key or version. In `line` mode every collapsed theme built-in tool card and every opted-in render-kit tool card MUST render one content row and in `compact` mode at most two content rows; a running card MUST keep its running form even with a partial error flag; a terminal failure MUST render two content rows whose second shows the first error line in the error color; the expanded view, `frame` mode and cards without the opt-in MUST keep the existing framed rendering. pi-todo and pi-subagents tool cards MUST opt in; message cards MUST NOT.
  - GIVEN `pi-thoth-theme.json` with `"tools": { "collapsed": "line" }`; WHEN a successful bash call and a todo call are shown collapsed; THEN each renders one content row with status glyph, tool name, summary and elapsed, and expanding either renders its framed card .
- `MODIFIED pi-ecosystem` **Codemode compact rendering** — When Thoth theme tool rendering is enabled, the Pi `codemode` tool is drawn by the Thoth render kit as a card of its nested calls without replacing or wrapping Pi's builtin codemode extension; with `tools.collapsed` at `frame` its collapsed card lists up to eight nested calls, and in `line` or `compact` its collapsed card follows the theme collapsed tool row density.
  - GIVEN a codemode call whose details list nested calls and the default `frame` density; WHEN it renders collapsed; THEN it shows up to eight nested calls with name, status and duration and a count of the remaining calls, and expanded it shows the script, output and errors .

## Plan

Test-first with the installed `tdd` skill; behavior-preserving `simplify` after each unit.

1. Contract and config (worker): add optional `expanded`/`surface` to `RenderCardOptions` in pi-core with doc comments and type tests; add `tools.collapsed` normalization to theme config with tests; thread the mode into theme renderer factories and kit creation (`T/src/index.ts`, `T/src/tools/index.ts`).
2. Builder, kit and pilot renderers (designer): new `T/src/tools/compact-row.ts`; theme kit `card()` density per AC-5; bash/PowerShell and generic per CRC; expose shell exit extraction.
3. Remaining built-ins (designer): read, edit, write, ls/grep/find, codemode.
4. pi-todo opt-in (designer).
5. pi-subagents opt-in (designer).
6. README (worker).

Units 3, 4 and 5 run in parallel after unit 2 (disjoint writes; builder and kit read-only for them).

Focused checks:
- Theme (from `T`): `pnpm exec vitest run src/tools test/tool-renderer-parity.test.ts test/render-chain.test.ts test/render-kit-real-sdk.test.ts test/expand-hints.test.ts src/shared/config.test.ts test/config.test.ts`
- pi-core: `pnpm --dir pi-packages/pi-core test`
- pi-todo: `pnpm --dir pi-packages/pi-todo test -- todo.render-kit.test.ts todo.frame-regression.test.ts todo.summary.test.ts view/format.test.ts`
- pi-subagents: `pnpm --dir pi-packages/pi-subagents test -- test/render/render-kit.test.ts test/render/render-memo.test.ts test/render/tools.test.ts test/render/tool-status-footer-real-theme.test.ts`
- Closeout at repo root: `pnpm run check:ci`, `pnpm run typecheck`, `pnpm run build`.

Risks: frame-mode regressions (existing tests unchanged); narrow widths (reuse hint fitting, add narrow tests); cross-package kit option (optional, opt-in, v1 key unchanged); subagent message vs tool sharing one card path (opt-in only in tool mode, tested).

## Tasks

- [x] AC-1: Theme config `tools.collapsed` normalized and threaded to renderer factories and kit creation, with frame default (worker unit 1).
  - Outcome: setting parsed with default `frame`, available to renderers and kit; no visual change
  - Known entrypoints and skill paths: `pi-packages/pi-thoth-theme/src/shared/config.ts`, `src/index.ts`, `src/tools/index.ts`, `src/render-kit/index.ts` (creation signature only); skills `tdd`, `simplify`
  - Inputs: this record
  - Dependencies: none
  - Output: code + config tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-thoth-theme/src/shared/config.ts`, `src/shared/config.test.ts`, `test/config.test.ts`, `src/index.ts`, `src/tools/index.ts`, `src/render-kit/index.ts` (signature threading only)
  - Interface boundaries: renderer factory and kit creation signatures inside the theme
  - Focused check and PASS evidence: theme focused vitest command passes with new config tests
  - Return milestone: tests green
  - Stop / reassessment: threading requires visual changes
- [x] AC-2: pi-core `RenderCardOptions` gains optional `expanded` and `surface: 'tool'` (worker unit 1).
  - Outcome: additive typed options documented; v1 key, version and discovery unchanged
  - Known entrypoints and skill paths: `pi-packages/pi-core/src/render-kit.ts:94-127`, `:458-531`, `pi-packages/pi-core/src/testing.ts`; skill `tdd`
  - Inputs: this record
  - Dependencies: none
  - Output: code + tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-core/src/render-kit.ts`, pi-core render-kit tests
  - Interface boundaries: v1 render-kit contract consumed by all kit producers
  - Focused check and PASS evidence: `pnpm --dir pi-packages/pi-core test` passes; discovery tests unchanged
  - Return milestone: with the AC-1 unit
  - Stop / reassessment: a required method or version change appears necessary
- [x] AC-3: CRC row builder, bash/PowerShell and generic renderers in `line`/`compact` (designer unit 2).
  - Outcome: builder module and pilot renderers satisfy the CRC; frame unchanged
  - Known entrypoints and skill paths: `pi-packages/pi-thoth-theme/src/tools/bash.ts`, `src/tools/generic.ts`, `src/tools/box.ts`, `src/shared/expand-hint.ts`, `src/shared/icons.ts`, `src/render-kit/index.ts` (`toolFooter`); skills `tdd`, `simplify`
  - Inputs: accepted AC-1/AC-2 unit
  - Dependencies: AC-1/AC-2 unit accepted
  - Output: code + tests (line, compact, running with partial error, terminal error, expanded, narrow width, frame parity)
  - Owner: thoth-designer
  - Writes: new `pi-packages/pi-thoth-theme/src/tools/compact-row.ts` and tests, `src/tools/bash.ts`, `src/tools/generic.ts`, tests under `src/tools/`
  - Interface boundaries: Pi `renderCall`/`renderResult`; builder API consumed by later units
  - Focused check and PASS evidence: theme focused vitest command passes
  - Return milestone: tests green and builder API reported
  - Stop / reassessment: Pi cannot produce an empty call slot, or frame output must change
- [x] AC-5: Theme kit `card()` applies the CRC for opted-in collapsed tool cards (designer unit 2).
  - Outcome: density gated on `surface: 'tool'` and `expanded === false`; part handling per AC-5; non-opted cards unchanged
  - Known entrypoints and skill paths: `pi-packages/pi-thoth-theme/src/render-kit/index.ts:102`, `:212-245`, accepted builder
  - Inputs: accepted AC-1/AC-2 unit
  - Dependencies: AC-1/AC-2 unit accepted
  - Output: code + kit tests
  - Owner: thoth-designer
  - Writes: `pi-packages/pi-thoth-theme/src/render-kit/**`, `test/render-kit-real-sdk.test.ts`
  - Interface boundaries: pi-core v1 card options
  - Focused check and PASS evidence: theme focused vitest command plus unchanged pi-todo and pi-subagents focused commands pass
  - Return milestone: with the AC-3 unit
  - Stop / reassessment: kit cannot derive rows from card options
- [x] AC-4: read, edit, write, ls/grep/find and codemode renderers satisfy the CRC (designer unit 3).
  - Outcome: remaining built-ins follow the builder; codemode frame keeps eight nested calls
  - Known entrypoints and skill paths: `pi-packages/pi-thoth-theme/src/tools/read.ts`, `edit.ts`, `write.ts`, ls/grep/find renderers, `codemode.ts`; skills `tdd`, `simplify`
  - Inputs: accepted AC-3/AC-5 unit
  - Dependencies: AC-3/AC-5 unit accepted
  - Output: code + tests
  - Owner: thoth-designer
  - Writes: those renderer files and their tests under `pi-packages/pi-thoth-theme/src/tools/`
  - Interface boundaries: builder API (read-only)
  - Focused check and PASS evidence: theme focused vitest command passes
  - Return milestone: tests green
  - Stop / reassessment: builder API needs changes
- [x] AC-6: pi-todo call and result cards opt in (designer unit 4).
  - Outcome: todo collapsed rows per CRC; legacy no-kit and frame unchanged
  - Known entrypoints and skill paths: `pi-packages/pi-todo/view/format.ts:410-548`; skill `tdd`
  - Inputs: accepted AC-3/AC-5 unit
  - Dependencies: AC-3/AC-5 unit accepted
  - Output: code + tests with a registered theme kit in line/compact/expanded
  - Owner: thoth-designer
  - Writes: `pi-packages/pi-todo/view/format.ts`, pi-todo render tests
  - Interface boundaries: pi-core v1 card options
  - Focused check and PASS evidence: pi-todo focused command passes
  - Return milestone: tests green
  - Stop / reassessment: call summary unavailable to the result renderer without new shared state beyond the existing context
- [x] AC-7: pi-subagents tool cards opt in through `boxedComponent` in tool mode (designer unit 5).
  - Outcome: subagent tool cards collapsed per CRC; message cards unchanged
  - Known entrypoints and skill paths: `pi-packages/pi-subagents/src/render/tools/components.ts:86-165,226-252`, `subagent-run.ts:83-242`, other `src/render/tools/subagent-*.ts`; skill `tdd`
  - Inputs: accepted AC-3/AC-5 unit
  - Dependencies: AC-3/AC-5 unit accepted
  - Output: code + tests
  - Owner: thoth-designer
  - Writes: `pi-packages/pi-subagents/src/render/tools/**`, `pi-packages/pi-subagents/test/render/**`
  - Interface boundaries: pi-core v1 card options; message renderers
  - Focused check and PASS evidence: pi-subagents focused command passes
  - Return milestone: tests green
  - Stop / reassessment: message and tool paths cannot be separated in `boxedComponent`
- [x] AC-8: README documents `tools.collapsed` (worker unit 6).
  - Outcome: README section per AC-8
  - Known entrypoints and skill paths: `pi-packages/pi-thoth-theme/README.md`
  - Inputs: accepted units above
  - Dependencies: all other units accepted
  - Output: docs edit
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-thoth-theme/README.md`
  - Interface boundaries: none
  - Focused check and PASS evidence: `pnpm run check:ci` passes
  - Return milestone: docs updated
  - Stop / reassessment: none

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

Plan review round 2: OKAY (record sha256 a286839fbf7aa8c4881c5b6c38438d1a65a799f879612ee5ced40839b4bdc7b2, task subtask_thoth-oracle_1794175416966_c532d607).
Implementation authorized by the user in advance, conditional on plan-review approval ("Cuando lo apruebe podemos implementar").

Plan review round 1: REJECT (record sha256 0d62bbe45421ed7fbaca52668dae7602d0eeffa1491e70c3fe3926f839d984b4) — render-kit feasibility/scope, codemode MODIFIED delta and partial-error precedence, visual ownership. Repaired in this revision.

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

Final verification round 1: FAIL (record sha256 335c28173ed92a9770ce1e81d34e1be25ff66fbb4da5fdb9d089632a1b14ca90, task subtask_thoth-oracle_1794177504210_7a53f7cd). AC-1..AC-4 and AC-8 PASS. Remaining work: AC-5 kit drops `row.summary` while running (split primary summary from terminal `row.tail`); AC-6 todo puts the call argument in `row.title`, defeating truncation priority; AC-7 subagent result/status collapsed failures show metadata instead of the first error line, and `titleWithoutGlyph` duplicates ANSI-styled glyphs. Repair owner: thoth-designer.

Final verification round 2: FAIL (record sha256 f33f49202b0b01b32ec5a2e5c4f1260e09f4f104f91ee18b95c5e9d00417c1fa, task subtask_thoth-oracle_1794178375237_14bbf920). AC-1..AC-5 and AC-8 PASS. Remaining work: AC-6 todo result puts the call summary in `row.tail` (hidden while running, dropped wholesale at narrow width) instead of `row.summary`; AC-7 `titleWithoutGlyph` is not ASCII-safe (`x x Subagent`), and subagent_send_message errors show `status: rejected` instead of the first error line. Repair owner: thoth-designer, with an all-producer state/icon-mode matrix test.

Final verification round 3: FAIL (record sha256 f33f49202b0b01b32ec5a2e5c4f1260e09f4f104f91ee18b95c5e9d00417c1fa, task subtask_thoth-oracle_1794179216366_0cdda39e). All ACs PASS except AC-7: subagent run/result/status/cancel put the variable task description in `row.title`, so at narrow widths elapsed is dropped before the task text. Remaining work: fixed tool identity in `row.title`, agent/task in `row.summary`, long-task elapsed/key retention assertions. Repair owner: thoth-designer.

Final verification round 4: PASS (task subtask_thoth-oracle_1794180227794_fc6a1e6b; delivered thoth-gate-verdict valid:true, kind final-verification, mode record, recordDigest match).

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: f33f49202b0b01b32ec5a2e5c4f1260e09f4f104f91ee18b95c5e9d00417c1fa

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS: AC-1 through AC-8 satisfied. Prior blockers are repaired. Status/model/effort are descriptive summary data, not protected terminal metrics; their placement in row.summary is CRC-conformant.",
  "evidence": [
    {
      "id": "record",
      "kind": "record-binding",
      "locator": ".thoth/changes/theme-compact-tool-rows/theme-compact-tool-rows.md",
      "claim": "Exact UTF-8 prefix SHA-256 is f33f49202b0b01b32ec5a2e5c4f1260e09f4f104f91ee18b95c5e9d00417c1fa. Validator --through verify returned valid:true. Canonical pi-ecosystem source digest matches the record.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "scope",
      "kind": "diff-review",
      "locator": "git status, git diff, untracked implementation files",
      "claim": "Reviewed all changed implementation surfaces and new tests. Existing test changes are limited to additive pi-core render-kit coverage and theme config tests; todo.render-kit.test.ts is unchanged. No version, registry, Pi-internal, or excluded-producer changes. Implementation inputs predate all validation commands.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "core",
      "kind": "test-run",
      "locator": "pnpm --dir pi-packages/pi-core test",
      "claim": "56 files and 1247 tests passed; additive optional card fields preserve v1 discovery.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "theme",
      "kind": "test-run",
      "locator": "pi-packages/pi-thoth-theme",
      "claim": "pnpm exec vitest run src/tools test: 45 files, 1688 tests passed. Additional src/shared/config.test.ts run: 39 tests passed. Coverage includes CRC priority, hints, errors, partial errors, opt-in gating, frame parity and expanded views.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "todo",
      "kind": "test-run",
      "locator": "pnpm --dir pi-packages/pi-todo test",
      "claim": "33 files and 561 tests passed, including action/state/icon/density matrices and long-summary elapsed retention.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "subagents",
      "kind": "test-run",
      "locator": "pnpm --dir pi-packages/pi-subagents test",
      "claim": "110 files passed; 2486 tests passed and one skipped. All nine producers are covered across states, densities and icon modes, including width-42 long-task truncation.",
      "basis": "observed",
      "uncertainty": "One test was skipped."
    },
    {
      "id": "global",
      "kind": "validation-run",
      "locator": "repository root",
      "claim": "All six requested commands ran sequentially and passed. Root typecheck and check:ci exited successfully; Biome reported warnings/information only. git diff --check also passed.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "probes",
      "kind": "independent-runtime-probes",
      "locator": "Read-only inline tsx probes",
      "claim": "816 independent producer checks passed across ANSI errors, leading blank error lines, CJK/emoji task text, custom pipe keys, widths 16–180, states, densities and icon modes. Another 392 checks passed against native SDK lifecycle, built-in row counts, expanded parity, PowerShell/shell structured nonzero exits, and kit opt-in/running-summary behavior.",
      "basis": "observed",
      "uncertainty": "The standalone native SDK probe had no initialized expansion binding; configured-key preservation was verified separately."
    },
    {
      "id": "summary-contract",
      "kind": "contract-review",
      "locator": "compact-row.ts; render-kit/index.ts; subagent formatting and producers",
      "claim": "Fixed tool titles protect identity; agent/task and descriptive metadata occupy summary. Elapsed and applicable exit/count tail segments retain higher priority. Keeping status/model in summary does not violate CRC; tests and independent probes confirm elapsed/key retention before variable task text.",
      "basis": "inferred",
      "uncertainty": ""
    },
    {
      "id": "docs",
      "kind": "documentation-review",
      "locator": "pi-packages/pi-thoth-theme/README.md:209-247",
      "claim": "Documents tools.collapsed values/default, malformed fallback, /reload, covered and excluded surfaces, expanded behavior, errors and unavoidable host spacer.",
      "basis": "observed",
      "uncertainty": ""
    }
  ],
  "verification": [
    {
      "check": "AC-1",
      "method": "Config normalization review, config tests and unchanged renderer/producer regressions",
      "outcome": "pass",
      "evidenceIds": ["theme", "todo", "subagents", "scope"],
      "reason": "Valid modes load; omitted/malformed values use frame; frame paths remain unchanged."
    },
    {
      "check": "AC-2",
      "method": "Public type/registry diff and pi-core suite",
      "outcome": "pass",
      "evidenceIds": ["core", "scope"],
      "reason": "expanded, surface and row are additive optional fields; v1 key, version and required methods are unchanged."
    },
    {
      "check": "AC-3",
      "method": "Shell/generic tests and independent native SDK/structured-exit probes",
      "outcome": "pass",
      "evidenceIds": ["theme", "probes"],
      "reason": "Bash, PowerShell and generic satisfy row counts, terminal error handling, partial-running precedence and expanded parity."
    },
    {
      "check": "AC-4",
      "method": "Remaining built-in tests and native SDK lifecycle probes",
      "outcome": "pass",
      "evidenceIds": ["theme", "probes"],
      "reason": "Read/edit/write/ls/grep/find/codemode satisfy CRC; codemode continuation lists nested names and frame retains eight-call behavior."
    },
    {
      "check": "AC-5",
      "method": "Kit source review, compact-card tests and independent gate probes",
      "outcome": "pass",
      "evidenceIds": ["theme", "probes"],
      "reason": "Requires surface:tool and expanded:false; start is empty, end renders rows, running preserves row.summary, and non-opted cards stay framed."
    },
    {
      "check": "AC-6",
      "method": "Todo diff and full suite with real theme kit matrices",
      "outcome": "pass",
      "evidenceIds": ["todo", "scope"],
      "reason": "Fixed todo title and primary summary preserve truncation priority; result expansion and legacy/frame behavior remain intact."
    },
    {
      "check": "AC-7",
      "method": "All-producer matrix, long-task tests and 816 independent checks",
      "outcome": "pass",
      "evidenceIds": ["subagents", "probes", "summary-contract"],
      "reason": "Prior title, duplicate-glyph and first-error failures are repaired. All nine tool producers opt in; message cards remain framed."
    },
    {
      "check": "AC-8",
      "method": "README review",
      "outcome": "pass",
      "evidenceIds": ["docs"],
      "reason": "All required setting, reload, coverage and host-spacer documentation is present."
    },
    {
      "check": "CRC, decisions, non-goals and durable deltas",
      "method": "Whole-diff review against record and canonical pi-ecosystem requirements",
      "outcome": "pass",
      "evidenceIds": ["record", "scope", "theme", "summary-contract", "probes"],
      "reason": "Shared builder preserves glyph/key/title/tail/summary priority and existing hint/animation helpers. Opt-in boundaries and declared codemode delta are coherent."
    },
    {
      "check": "Required sequential validation and freshness",
      "method": "Six requested commands, supplemental config tests, input timestamps and final record hash",
      "outcome": "pass",
      "evidenceIds": ["core", "theme", "todo", "subagents", "global", "record", "scope"],
      "reason": "Commands passed on unchanged implementation inputs; record prefix remained unchanged."
    }
  ],
  "risks": [
    {
      "description": "Directly retaining an already-rendered codemode call component after renderResult can retain its cached running row. Installed Pi recreates call slots on updates; native SDK lifecycle probes passed, so this does not block the reviewed host behavior.",
      "severity": "low",
      "blocking": false,
      "evidenceIds": ["probes"]
    }
  ],
  "openQuestions": [],
  "nextAction": "Root validate the delivered verdict, record per-AC PASS evidence and proceed through closeout.",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/theme-compact-tool-rows/theme-compact-tool-rows.md",
    "reviewedRecordSha256": "f33f49202b0b01b32ec5a2e5c4f1260e09f4f104f91ee18b95c5e9d00417c1fa"
  }
}
```

- AC-1: PASS | theme config tests + unchanged renderer/producer suites | config normalizes to frame; frame paths unchanged (Oracle r4)
- AC-2: PASS | pnpm --dir pi-packages/pi-core test (1247 passed) | optional expanded/surface/row; v1 key/version unchanged
- AC-3: PASS | theme vitest src/tools test (1688 passed) + SDK probes | bash/PowerShell/generic CRC incl. partial-running precedence
- AC-4: PASS | theme vitest + native SDK lifecycle probes | read/edit/write/ls/grep/find/codemode CRC; codemode frame keeps eight calls
- AC-5: PASS | render-kit-compact tests + gate probes | opt-in gating, start part empty, running row.summary kept
- AC-6: PASS | pnpm --dir pi-packages/pi-todo test (561 passed) | todo matrix incl. long-summary elapsed retention; todo.render-kit.test.ts unchanged
- AC-7: PASS | pnpm --dir pi-packages/pi-subagents test (2486 passed, 1 skipped) + 816 probes | nine tool producers opt in; message cards framed
- AC-8: PASS | README review | pi-thoth-theme README:209-247
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:56c92fc8e9eba490f4f61ce1d81661ebdc2c8319393a0439325950776f57df8d

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
