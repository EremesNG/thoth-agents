# Change: pi-success-borders

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: low
**Risk**: low

## Exploration

- Themed card borders are chosen by a boolean: `pi-packages/pi-thoth-theme/src/tools/box.ts:177` (`renderBox`: `isError ? 'error' : 'accent'`) and the frame helpers in `src/tools/frame.ts` (`renderFrameTop` :58, `renderFrameRow` :88, `renderFrameDivider` :110, `renderFrameBottom` :140). `kit.card` (`src/render-kit/index.ts:56-96`) routes `options.isError` to them. No running/success state reaches the border.
- Thoth theme tokens (`pi-packages/pi-thoth-theme/themes/thoth.json`): `accent` gold, `success` malachite `#6CBF5A`, `error` red. `success` is already used for the completed status glyph (`render-kit/index.ts:28`), bash `Exit 0` footer (`tools/bash.ts:190`) and generic `Done` footer (`tools/generic.ts:165`).
- Every tool card has a result-driven red path today: built-ins read, bash, powershell, edit, write, grep, find, ls, generic (`context.isError`); kit consumers pi-subagents tool cards (`src/render/tools/components.ts:128-134`, `subagent-*.ts`) and completion messages (`src/render/completion-message.ts:169,268`, failed or cancelled), thread viewer adapted status (`src/thread-view.ts:1125-1143`), task-list package (`pi-packages/pi-to*/view/format.ts:211`), pi-background-tasks (`src/render/tools.ts:44-195`, `src/render/messages.ts:40-93`), pi-claude-bridge (`src/askclaude-render.ts:114-204`), pi-antigravity-bridge (`src/native-event-render.ts:81-82`, `src/render-tool-card.ts`).
- Some cards render as split parts (call/start and result/end); each part draws its own frame, so all parts of one card must agree on the color.
- Some frame calls hardcode `isError` true/false literals (e.g. grep/edit/find/ls), which bypass a purely central change.
- `pi-thoth-theme/src/tools/box.test.ts:29,103` re-implements the border color logic in its reference oracle.
- Kit consumers already compute a status (`RenderStatus` in `pi-packages/pi-core/src/render-kit.ts:13-25`) for most cards; `RenderCardOptions` has `isError` and `status`.
- Active spec `.thoth/specs/pi-ecosystem/spec.md` has no border-color rule.
- Host re-invokes `renderCall` after results with updated `isPartial`/`isError` (Oracle probe), so call and result parts can agree.
- `pi-background-tasks/src/render/messages.ts:84` maps every non-error batch to `completed`, including running, cancelled, rejected, skipped or stopped entries.
- The thread viewer marks tool results partial only for status `partial` (`pi-subagents/src/thread-view.ts:1061`); a running bash item with output reaches the host as `isPartial:false, isError:false` via `:1121-1143`.
- Subagent question notifications never turn red (`pi-subagents/src/render/question-message.ts:72-80`).

## Intent

Every themed card whose border turns red on a failed result shows a green (theme `success`) border when the same card completes successfully; running/partial cards keep the gold `accent` border; native (kit-absent) rendering is unchanged.

## Non-goals

- No change to cards or frames that never have a result-driven red state (welcome header, status line, input box, widgets/overlays, subagent question notifications, task-list overlay).
- No change to native kit-absent fallbacks, except the same user-approved lifecycle exception for viewer tool items that are still running.
- No change to colors of text, glyphs or footers other than the frame border; footer status glyphs and labels stay byte-identical to before for every state, except the user-approved lifecycle exception in Clarifications (a tool that is still running shows its running footer/state until it finishes).
- No new theme tokens; no version bumps.

## Acceptance

- AC-1: `pi-thoth-theme` frame primitives (`renderBox`, frame helpers, `kit.card`) support three border tones: error -> `error`, success -> `success`, otherwise `accent`; `kit.card` uses success only when `isSuccess` is true and `isError` is false, and `status` never changes the border; built-in tool renderers (read, bash, powershell, edit, write, grep, find, ls, generic) use success only for completed non-error results, including every part and hardcoded-literal frame call of a card; tests assert the three tones through real rendering.
- AC-2: pi-subagents tool cards, completion messages and thread-viewer tool items render a success border exactly when the card completed without failure or cancellation, error as today (cancelled stays red where red today), accent while running; the viewer propagates the item lifecycle to the host context so running items with output stay accent until completed; every part of a split card agrees; tests cover running-with-output -> completed and cancelled transitions.
- AC-3: task-list package, pi-background-tasks (tools and messages), pi-claude-bridge and pi-antigravity-bridge cards render a success border only on affirmative terminal success (every entry completed successfully), error as today, accent for running, not yet started, mixed, cancelled-without-error, rejected, skipped, stopped or unrecognized outcomes that are not red today; every part agrees; native fallbacks unchanged; tests cover non-success, mixed and unrecognized batches.
- AC-4: Touched packages' `typecheck` and tests pass (`test:unit` for pi-claude-bridge); root `pnpm run typecheck` passes; root `check:ci`/`pnpm test` show no failures beyond the known pre-existing baseline (unchanged `panel.test.ts` formatting, inherited `CODEX_HOME`, missing sibling `thoth-plugins` checkout).
- AC-5: After merge to `0.5.0`, the user confirms green borders on successful tool calls and notifications, red on failures, and gold while running.

## Clarifications

- User request: "SOLO donde hoy cambia a rojo el borde, que tengan su contra parte a verde."
- AC-5 confirmation: after merge to `0.5.0` and restarting Pi, root ran live tool calls (bash 5-step success, bash exit 1, bash 3-step then exit 2, read existing and missing file, ls, grep) and the user explicitly confirmed with the option "Sí, [everything] como esperado" (Spanish for yes, everything as expected) the expected colors (gold with running footer while running, green on success, red on failure, footers unchanged).
- Lifecycle exception (explicit user decision after the second final verification found viewer running items with output changed from footer `Exit 0` to `running…` and native background from the success style to the in-progress style): the border-only rule is soft; a tool that is still running, even with partial output, must show its running footer/state and gold border, and only when it finishes do the footer and border change. Showing `Exit 0` while still running is wrong in the viewer and in the main chat. This exception covers footer/native changes that make a running tool display as running. Under the same rule, bash/PowerShell/generic results that are still partial keep the gold border even if marked as error, and turn red only when final (verified: main-chat partial footers were already correct).
- User chose "Tool calls y notificaciones (Recommended)": the success border applies to tool-call cards and to notification cards that turn red today (subagent completion/failure and background-task messages). Cancelled stays red where it is red today.
- Exploration found that every tool card has a red path, so the rule covers all themed tool cards; running/partial stays gold.

## Decisions

- Success color is the existing theme token `success` (malachite).
- Verification hygiene: `pnpm --filter <pkg> test -- --maxWorkers=1` did not forward the flag; the forwarding form is `pnpm --filter @thoth-agents/pi-antigravity-bridge test --maxWorkers=1`. A pre-existing test defect (reproduced 0/3 on HEAD `87dbf74`, not caused by this diff) made `pi-antigravity-bridge/tests/startup-ownership.test.ts` overlap async cleanup with the next test's spawn spy (recursion). Root admitted a minimal test-only fix in that file (15s budget for the two missing-executable races, assertions unchanged) so AC-4 can be verified; the pre-existing `acp-driver` teardown EBUSY was left unchanged.
- Final rule after the first final verification FAIL (footer glyphs changed): the border is driven only by `isError` (error) and the new optional `RenderCardOptions.isSuccess` (success); `status` remains pure footer decoration and no longer affects the border. Every consumer keeps passing exactly the `status` it passed before this change and adds `isSuccess: true` only on affirmative terminal success. Earlier interim rule (superseded): `status: 'completed'` or `isSuccess` drove success. `isSuccess` changes only the border and adds no footer/glyph, because passing `status` renders a status footer glyph and footers are a non-goal (contract amendment during implementation, raised by the AC-2 worker). pi-core documents the border semantics on `RenderCardOptions`.
- Legacy viewer bash items with output but no status/exit code keep today's final (non-partial) treatment, so they render with a success border; only explicit running/in-progress items become partial. Consumers must pass `completed` only for affirmative terminal success; a generic non-error state must not map to `completed`.
- Second fresh Oracle plan review returned OKAY (user selected review explicitly); implementation authorized by explicit user choice "Implement (Recommended)".
- First Oracle plan review returned REJECT (background messages false success, viewer lifecycle propagation, delta scope); record repaired.
- Built-in renderers decide success as completed (not partial) and not error, applied consistently to call and result parts.
- `box.test.ts` reference oracle is updated to the three-tone rule.

## Durable deltas

- `ADDED pi-ecosystem` **Render kit result borders** — Themed tool and notification cards that render through the Thoth render kit or the theme's tool renderers and draw an error-colored border for failed results MUST draw the theme `success` color for affirmative terminal success, the theme `error` color wherever an error border is drawn today (including cancellation where it is red), except that the still-running shell/generic rule in the next sentence takes precedence over this error-color rule, and the theme `accent` color for every other non-error state, consistently across every part of the same card. A shell or generic tool card (bash, PowerShell, generic renderer) that is still running, even with partial output or a partial error flag, MUST show its running footer/state and the `accent` border until it finishes, and only completion changes its footer and border; in the subagents thread viewer, tool items that are still running MUST be rendered as running, with or without a kit. Cards without a result-driven error border are unchanged.
  - GIVEN a themed bash card that has already produced output; WHEN it is still running and then completes, in the chat or in the subagents thread viewer; THEN it shows the running footer and the accent border while running, and after completion the exit footer with the success border for exit code 0 or the error border for a failure .

## Plan

Units:

1. **Theme primitives and built-ins (AC-1)** — `pi-packages/pi-thoth-theme/src/tools/{box.ts,frame.ts,*.ts}`, `src/render-kit/index.ts`, tests; pi-core TSDoc on `RenderCardOptions` (`pi-packages/pi-core/src/render-kit.ts`, docs only). Defines the rule consumers rely on: `kit.card({ isSuccess: true })` -> success border unless `isError`; `status` is footer decoration only.
2. **pi-subagents (AC-2)** — `pi-packages/pi-subagents/src/render/**`, `src/thread-view.ts` (adapted status and host-context lifecycle propagation for tool items), tests. Keeps HEAD `status` decoration and passes `isSuccess: true` to `kit.card` on affirmative success for every part.
3. **Other consumers (AC-3)** — task-list package `view/format.ts`, pi-background-tasks `src/render/{tools,messages}.ts`, pi-claude-bridge `src/askclaude-render.ts`, pi-antigravity-bridge `src/{native-event-render,render-tool-card}.ts`, tests.
4. **Checks (AC-4)** — root.
5. **User confirmation (AC-5)** — after merge.

Units 2 and 3 depend on the unit 1 rule (fixed above) and can run in parallel with unit 1 using a fake/real kit, with final checks after all are accepted.
Risks: split-card parts disagreeing; hardcoded literal frame calls; cached completed cards keep the right color because the host recreates components on result changes.

## Tasks

- [x] AC-1: theme primitives and built-in renderers draw success borders
  - Outcome: three-tone border in renderBox, frame helpers, kit.card and all built-in tool renderers
  - Known entrypoints and skill paths: `pi-packages/pi-thoth-theme/src/tools/box.ts`, `src/tools/frame.ts`, `src/tools/{read,bash,powershell,edit,write,grep,find,ls,generic}.ts`, `src/render-kit/index.ts`, `src/tools/box.test.ts`; `pi-packages/pi-core/src/render-kit.ts` (TSDoc only); skills `tdd`, `simplify`
  - Inputs: Exploration, Clarifications and Decisions in this record
  - Dependencies: none
  - Output: implementation + tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-thoth-theme/src/**`, `pi-packages/pi-thoth-theme/test/**`, `pi-packages/pi-core/src/render-kit.ts` (TSDoc and optional `isSuccess` field) and pi-core tests
  - Interface boundaries: kit API shape unchanged; native paths unchanged
  - Focused check and PASS evidence: theme and pi-core `typecheck` and tests pass with tone assertions
  - Return milestone: tests green
  - Stop / reassessment: a built-in whose call part cannot know completion
- [x] AC-2: pi-subagents cards pass completion so success borders render
  - Outcome: success borders on completed subagent tool cards, completion messages and viewer tool items
  - Known entrypoints and skill paths: `pi-packages/pi-subagents/src/render/tools/components.ts`, `src/render/tools/subagent-*.ts`, `src/render/completion-message.ts`, `src/thread-view.ts` (~1061, ~1121-1143 lifecycle propagation), tests under `pi-packages/pi-subagents/test/`; skills `tdd`, `simplify`
  - Inputs: final rule in Decisions (`isSuccess: true` and not error -> success; `status` unchanged decoration)
  - Dependencies: none for implementation; AC-1 accepted for final checks
  - Output: implementation + tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-subagents/src/render/**`, `pi-packages/pi-subagents/src/thread-view.ts`, pi-subagents tests
  - Interface boundaries: cancelled and failed stay red; native fallback unchanged
  - Focused check and PASS evidence: pi-subagents `typecheck` and tests pass with status/tone assertions
  - Return milestone: tests green
  - Stop / reassessment: a card whose success cannot be distinguished from running
- [x] AC-3: remaining consumers pass completion so success borders render
  - Outcome: success borders in task-list, background-tasks, claude and antigravity cards
  - Known entrypoints and skill paths: `pi-packages/pi-to*/view/format.ts`, `pi-packages/pi-background-tasks/src/render/{tools,messages}.ts`, `pi-packages/pi-claude-bridge/src/askclaude-render.ts`, `pi-packages/pi-antigravity-bridge/src/{native-event-render,render-tool-card}.ts` and their tests; skills `tdd`, `simplify`
  - Inputs: final rule in Decisions (`isSuccess: true` and not error -> success; `status` unchanged decoration)
  - Dependencies: none for implementation; AC-1 accepted for final checks
  - Output: implementation + tests
  - Owner: thoth-worker
  - Writes: those source files and their package tests only (plus the root-admitted test-only fix in `pi-packages/pi-antigravity-bridge/tests/startup-ownership.test.ts`, see Decisions)
  - Interface boundaries: native fallbacks unchanged; failure colors unchanged
  - Focused check and PASS evidence: each package `typecheck` and tests pass with status/tone assertions
  - Return milestone: tests green
  - Stop / reassessment: a card whose success cannot be distinguished from running
- [x] AC-4: package and root checks
  - Outcome: green package checks; root failures limited to the known baseline
  - Known entrypoints and skill paths: root `package.json` scripts
  - Inputs: accepted AC-1..AC-3 diffs
  - Dependencies: AC-1, AC-2, AC-3 accepted
  - Output: check results
  - Owner: root
  - Writes: none
  - Interface boundaries: none
  - Focused check and PASS evidence: package checks exit 0; root `pnpm run typecheck` exit 0; root `check:ci`/`pnpm test` failures only in the baseline
  - Return milestone: results classified
  - Stop / reassessment: any root failure attributable to the diff
- [x] AC-5: user confirms border colors
  - Outcome: user confirmation after merge
  - Known entrypoints and skill paths: user session on `0.5.0`
  - Inputs: accepted AC-4; merge to `0.5.0`
  - Dependencies: AC-4 accepted
  - Output: explicit user confirmation
  - Owner: root with user
  - Writes: none
  - Interface boundaries: none
  - Focused check and PASS evidence: user confirms green success, red failure, gold running
  - Return milestone: user reply
  - Stop / reassessment: a card the user reports with the wrong color

## Authorization

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

## Verification

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 71027ec32bd88f1ce813043ba27dd75112b64e4732410ef680707ee3bdc999fe

- AC-1: PASS | pi-thoth-theme typecheck + 887/887 tests (--maxWorkers=2), pi-core 172/172; fresh Oracle reran theme 305/305 | three-tone getBorderTone in renderBox, frames and both kit.card paths; isSuccess-only success, error precedence, status footer-only; nine built-ins incl. PowerShell color call/result parts consistently; running shell/generic stay gold until final
- AC-2: PASS | pi-subagents typecheck + 1231 pass/1 skip; fresh Oracle reran 64/64 incl. real-SDK viewer tests | HEAD footer status restored, isSuccess only on affirmative success; completion messages isSuccess; viewer renders still-running items as running (user-approved lifecycle exception)
- AC-3: PASS | typecheck + todo 236/236, background 456/4 skip, claude test:unit 405/0, antigravity 770/9 skip; fresh Oracle focused checks | HEAD status/footers preserved; isSuccess only for affirmative terminal success; mixed, incomplete, cancelled, rejected, skipped, stopped and unrecognized outcomes not green; native fallbacks unchanged
- AC-4: PASS | 7 package typechecks/tests green; antigravity 3 consecutive full suites 770/9 skip with forwarded --maxWorkers=1; root typecheck exit 0 | root check:ci/pnpm test failures only in the known unchanged baseline; pre-existing startup-ownership test defect fixed test-only; pre-existing acp-driver EBUSY teardown left unchanged
- AC-5: PASS | live tool calls in the user's restarted Pi on merged 0.5.0 | user explicitly confirmed everything as expected: gold running footer while running, green on success, red on failure, footers unchanged
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:8a66c9441f2a7f144714ed032013f0249ba11a66d4c04b56386bfdd97f67b8a4

## Closeout

**Archive**: READY
