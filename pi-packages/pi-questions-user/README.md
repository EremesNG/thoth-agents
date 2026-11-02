# @thoth-agents/pi-questions-user

First-party `ask_user_question` for Pi. MIT; Node >=22.19.0, Pi peers >=0.99.0;
development SDK/TUI 1.4.0. The tool is registered with `exposure: 'model-only'`.

## Install

```sh
pi install npm:@thoth-agents/pi-questions-user
```

## Shared question service

In UI sessions, this extension also provides its framed questionnaire, previews,
and editor dock to other Thoth packages through pi-core's versioned question
service. It registers on `session_start` and withdraws its own provider on
shutdown; headless sessions do not register one.

Service callers can set per-question `allowCustom: false` to hide free-text
answers. Requests return structured `answered`, `cancelled`, or `unavailable`
results. Aborting disposes the dock and resolves as `cancelled`; if the dock cannot
mount (including RPC contexts), the service returns `unavailable` so the caller
can choose its fallback. The service itself does not open sequential dialogs.

This does not change the `ask_user_question` tool's schema or behavior described
below: its single/multi questions still offer free text, and its sequential
select/input fallback remains available.

## Parameters

```json
{
  "title": "Implementation plan",
  "questions": [
    {
      "id": "approach",
      "header": "Approach",
      "context": "**Summary:** Small, reviewable changes with tests first.",
      "prompt": "Which approach should we use?",
      "type": "single",
      "required": true,
      "options": [
        {
          "value": "safe",
          "label": "Safe approach",
          "description": "Small, reviewable changes",
          "preview": "## Plan\nStart with tests.",
          "recommended": true
        }
      ]
    }
  ]
}
```

`title`, `labels`, per-question `context`, `type`, `required`, option `description`,
`preview`, and `recommended` are optional.
Type defaults to `single`; types are `single`, `multi`, `text`, `confirm`. There
are no declared maximum counts or string lengths except tool `context` (500
characters). At least one question is
required. IDs and option values must be unique (values within each question),
non-blank strings; headers, prompts and labels must be non-blank. Single/multi
need options. Text/confirm accept no options (an empty array is also allowed).
Confirm synthesizes `{value: "yes", label: "Yes"}` and `{value: "no", label: "No"}`
(values are stable; only the labels localize). `Type something.` and the
localized `typeSomething` label are reserved option labels.

### Self-contained questions

Always write the proposal, table or findings as **normal visible response text
before calling the tool**, not inside reasoning/thinking. Keep `prompt` a concise,
self-contained plain-text question. Reasoning/thinking is not shown as answer text.
Assistant prose in the same turn may not be visible while the question is open,
so `context` is a **secondary fallback**: include only a short markdown summary
needed to answer, at most **500 characters**. Longer proposals, tables and findings
must be visible response text before the tool call, not `context`. Use option
`preview` for per-option markdown details. Oversized context fails Pi's tool
argument validation so the model can retry with a shorter summary. The internal
question-service API does not impose this character limit.
`context` must be a string; blank context is treated as absent.

The native questionnaire renders context above the pinned plain-text prompt with
the same markdown renderer as previews, including tables. Only context scrolls
with Alt+arrows. Its viewport is at most six rows, including an overflow-counter
row when needed. Options get their full height when they fit; context uses the
remaining space, keeping up to three body rows plus its counter by windowing the
options when necessary. In tiny terminals, context can shrink to just its counter;
selected labels and native editor borders/cursor retain priority. The prompt stays
directly above the options, limited to three rows with a trailing ellipsis when
longer; Alt+arrows never scroll the prompt. The sequential RPC fallback includes
context before the prompt as source text in dialog titles. Review stays compact
and shows answer summaries rather than repeating context.

### Localizable UI labels

Every fixed UI string is English by default. The optional top-level `labels`
object overrides any of them; each value must be a non-blank string, omitted keys
keep the English default, and unknown keys are ignored. The tool's prompt guideline
asks models to send `labels` (and headers/prompts/option labels) in the user's
language. Keys: `askUser`, `yes`, `no`, `typeSomething`, `yourAnswer`, `submit`,
`backToEdit`, `cancel`, `review`, `reviewHeading`, `required`, `unanswered`,
`requiredPending`, `skipped`, `skip`, `done`, `recommended`, `preview`,
`noDescription`, `typeOwn`, `noTextYet`, `note`, `noteForQuestion`, `noteFor`,
`cancelled`, `cancelledKept`, `error`, `answered`, and the key-hint verbs `move`,
`pick`, `select`, `toggle`, `next`, `optionNote`, `questionNote`, `clear`,
`scrollPreview`, `scrollPrompt` (retained label key), `scrollContext` (default
`context`), `more`,
`switchTab`, `save`, `newline`, `keepDraft`, `collapse`, `expand`. The native
questionnaire, the sequential RPC fallback, synthesized confirm options and the
transcript result card all use them. When supplied, `labels` is echoed in
`details.labels` so the result card renders in the same language; it is absent
otherwise.

Example `labels` fragment (include it alongside a non-empty `questions` array):

```json
{ "labels": { "yes": "Sí", "no": "No", "submit": "Enviar respuestas" } }
```

`required` is advisory: a user may skip any question. Recommendations are markers,
never selected or submitted automatically. In the questionnaire, a colored `★`
gutter between the radio/checkbox and label marks recommended options; other rows
reserve the same space only when the question has a recommendation. Labels are
not suffixed with recommendation text. The focused recommendation's preview header
shows `Preview · ★ Recommended` (localized), retaining its scroll range.
Single/multi offer a free-text entry;
multi combines it with picks. Text is input only. The sequential fallback uses
numbered options to distinguish duplicate labels and control-like labels, repeated
multi toggles plus Done, and explicit Skip (blank text also skips). It uses
select/input dialogs with option descriptions in the choice labels; it does not
collect question or option notes or render previews.

## Results

`content` is a readable per-question summary. `details` contains optional `title`,
`cancelled`, optional `error`, `answers` keyed by question ID, and `questions`
metadata (including synthesized confirm options). Each answer has `status:
"answered" | "skipped"`, `values`, `labels`, and optional `customText`, `note`,
`optionNotes` keyed by option value. Text-only answers have empty values/labels.
Cancelled requests retain recorded answers; the summary explicitly says unanswered
questions must not be assumed. Error codes are `invalid_questions`, `no_ui`,
`aborted`. In UI-enabled calls, invalid input returns `invalid_questions` with
`issues: [{path, code, message}]`; no interaction is attempted. Headless calls
return `no_ui` even with invalid input. `invalid_questions` is not user
cancellation; `no_ui` and `aborted` are.

## Pure state API (`src/answers.ts`)

Validate before creating state. Every transition returns a new state; **keep that
returned value**. No transition mutates its input. Initial answers are skipped,
without selections. Result and initial metadata snapshots are detached copies.

```ts
createState(questionnaire: Questionnaire): AnswerState
selectOption(state: AnswerState, id: string, value: string): AnswerState
toggleOption(state: AnswerState, id: string, value: string): AnswerState
setCustomText(state: AnswerState, id: string, text: string): AnswerState
setQuestionNote(state: AnswerState, id: string, note: string): AnswerState
setOptionNote(state: AnswerState, id: string, value: string, note: string): AnswerState
markSkipped(state: AnswerState, id: string): AnswerState
buildResult(state: AnswerState, options?: ResultOptions): QuestionResult
```

- `selectOption` is for single/confirm; it replaces prior picks and custom text.
- `toggleOption` is for multi; it preserves custom text and orders picks by metadata.
- `setCustomText` replaces single picks, combines with multi picks, and is rejected
  for confirm. Blank text removes custom text.
- Notes do not make a question answered; blank notes remove annotations.
  Option notes may be attached to unselected options.
- `markSkipped` clears picks/custom text but retains notes. Unknown question IDs,
  unknown option values and incompatible actions throw rather than invent answers.

Exported types:

- `schema.ts`: `QuestionParameters` is the raw tool input; `QuestionType` is the
  four-type union; `QuestionOption` is option metadata; `Question` has a resolved
  type; `Questionnaire` has optional title and normalized questions.
- `validate.ts`: `ValidationIssueCode` enumerates `invalid_type`, `blank`,
  `empty_questions`, `duplicate_id`, `missing_options`, `unexpected_options`,
  `duplicate_value`, `reserved_label`. `ValidationIssue` includes path/code/message.
  `ValidationResult` discriminates `{valid: true, value}` / `{valid: false, issues}`.
  `validateQuestions(input: unknown): ValidationResult` handles shape and semantics.
- `answers.ts`: `QuestionAnswer` is the answer shape above; `AnswerState` combines
  questionnaire metadata and answers. `QuestionError` is the error-code union.
  `ResultOptions` has optional cancelled/error/issues. `QuestionDetails` adds the
  result flags to state. `QuestionResult` has text content and details.

## Custom-UI seam and lifecycle

`createQuestionTool(uiHook?: QuestionUIHook)` in `src/index.ts` defaults to the
native TUI questionnaire via `src/custom-ui.ts#getQuestionUIFactory`. It provides
question tabs, windowed option lists, free-text and note editors, previews beside
the options on wide terminals (expandable below on narrow ones), and a review tab
for multiple questions. A single question may submit directly.

The questionnaire is drawn in the thoth frame: a rounded border with the title,
dividers and a **one-row, horizontally clipped** hint footer. Single-question
panels omit both tabs and answered progress; multiple questions keep them. The
frame comes from the pi-core render kit resolved at render time and falls back
to native glyphs when no kit is registered (the theme package is never a dependency).

Height is `min(need, max(12, floor(terminalRows * 0.45)), terminalRows)`: no
baseline or six-row content padding. Need is measured across all questions,
including bounded context, pinned prompts, wrapped option labels, previews and
an editor reservation (label, native borders and cursor row). Height stays stable
across cursor moves, tabs, answers and typing for a given terminal size and preview
expansion state. Reserved rows may be unused on shorter tabs or while an editor
is closed; there is no additional fill to a terminal-height baseline. Tall drafts
clip around the cursor; the editor label yields to its borders/cursor in tiny
terminals. Options wrap with hanging indents and window by whole items when needed.

Wide terminals (100+ columns) keep the scrolling preview beside the list. At
narrower widths, previews start **collapsed** for each questionnaire. A selected
option with preview/description content or an option note shows one compact
`▸ Preview · p` row; otherwise no preview row is shown. Press `p` outside an editor
to expand/collapse the preview below the list. Expansion may grow the panel up to
the cap; collapsing restores its smaller height. The choice persists across tabs
and resizing for that questionnaire only. Expanded previews prefer up to two body
rows of actual content when space is tight; previews yield to selected labels in
tiny terminals. Typing `p` in any text/note editor inserts text normally.
The expanded questionnaire replaces the editor through pi-core's shared editor
slot; it is not an overlay and does not cover the chat. Native scrollback works in
inline mode; fullscreen `PageUp`/`PageDown` continue scrolling the transcript.
`Ctrl+]` collapses it to a one-line dock above the restored editor and returns
keyboard input to the editor. Typing and `Enter` work normally there (`Enter`
during an active run queues a steering message; it does not answer the question).
`Ctrl+]` from the editor or a history/detail overlay expands it again, restoring
its answers, tab, cursor, scroll positions and editor drafts. The open tool-call
card marks the question as collapsed until it is expanded or completed.

Closing subagents, task-list or background history, or the work-panel detail card,
returns input to the expanded question or otherwise the editor. Collapsing,
answering, cancelling or aborting never takes focus from a visible foreign overlay.

The registered tool includes call/result renderers using the pi-core render kit
when available, with native Pi rendering as fallback. The call and result parts
share one final border tone (success/error/neutral) so the whole card reflects the
outcome; the result card lists each question's header in an aligned column with its
answer (✓ options, quoted custom text, ○ skipped) and indented ✎ notes. UI sessions publish the full
tool definition to the pi-core tool registry on `session_start`; shutdown withdraws
only that session's publication. Headless sessions do not publish it.

`QuestionUIHook(session: QuestionUISession): QuestionUIFactory | undefined` receives
initial `state`, optional `signal`, `onStateChange(state)` and the optional
`onCollapseChange(collapsed)` focus/presentation callback. The component should
report recorded state after each transition to preserve answers if aborted, and
listen to the signal to complete native teardown. `QuestionUIFactory` uses Pi's
native `(tui, theme, keybindings, done)` signature and returns a component (or promise).
Call `done(buildResult(state))` to submit,
`done(buildResult(state, {cancelled: true}))` to cancel, or
`done(buildResult(state, {cancelled: true, error: "aborted"}))` on abort. The default
component calls `done` at most once to restore Pi's editor, keeps recorded answers,
and removes its abort listener on completion/disposal.

**Undefined means custom UI unavailable, not user cancellation.** A UI hook
returning no factory, unavailable editor-slot hooks (as in RPC mode), or its
undefined completion sentinel runs the sequential select/input fallback. Unexpected host errors propagate
rather than masquerading as user cancellation. Dialogs receive the abort signal and
are raced against it so the tool settles even when a host ignores cancellation.

The extension removes only `ask_user_question` from active tools in
`before_agent_start` when `ctx.hasUI` is false, without changing other tool choices.
Forced calls still return `no_ui`. UI-enabled sessions do not override an
operator's explicit tool loadout.

### Keyboard controls

Questionnaire navigation/action bindings are fixed and **not user-rebindable**:

- `Tab` / `Shift+Tab`, `Right` / `Left`: switch question/review tabs, wrapping.
- `Up` / `Down`, `Home` / `End`: move within an option list; `Up` / `Down` also
  navigate review rows. `1`–`9` pick an option (advance for single/confirm, toggle
  for multi).
- `Enter`: select and advance for single/confirm, open free text, advance/submit
  for multi, or activate a review row/action. `Space` selects without advancing
  (toggles for multi) and also activates review rows/actions.
- `n`: edit the focused option's note; `N`: edit the question note.
- `x` / `Delete`: clear picks/custom text, retaining notes.
- `p`: expand/collapse the preview below the options at widths below 100 columns,
  outside text/note editors. Wide right-hand previews are unaffected.
- `Shift+Up` / `Shift+Down`: scroll the visible option preview by a line;
  `[` / `]` (and `PageUp` / `PageDown`) scroll by half a page. A header shows
  the visible range and `↑ N more` / `↓ N more`. Fullscreen Pi consumes
  `PageUp`/`PageDown`, `Home`/`End`, `Ctrl+Up`/`Down` and the mouse wheel for the
  transcript before the questionnaire sees them, so `Shift+arrows` and `[`/`]`
  are the keys that always work.
- `Alt+Up` / `Alt+Down`: scroll overflowing context only, one row at a time; its
  indicator shows hidden rows. Switching tabs resets context scroll. The prompt
  remains pinned. The hint is included only for overflowing context, as far as the
  single clipped footer row allows.
- `Ctrl+]`: collapse/expand while a question is open, from the editor, questionnaire
  or a history/detail overlay. This terminal-input binding shadows the editor's
  `jumpForward` binding only while the question is open. Kitty repeats/releases
  do not toggle again.
- While collapsed, all other input (including `Esc`) belongs to the editor or
  focused overlay. To cancel the question, expand it with `Ctrl+]`, then use `Esc`.
- `Esc` outside an editor: cancel, retaining recorded answers.

Text/note editors use Pi's native editor for typing and editing (`Enter` saves,
`Shift+Enter` inserts a newline with default editor bindings). `Esc` keeps the draft
and returns to the question; `Tab` / `Shift+Tab` keep the draft and switch tabs.

## Verification

```sh
pnpm --filter @thoth-agents/pi-questions-user run typecheck
pnpm --filter @thoth-agents/pi-questions-user run test
pnpm exec biome ci pi-packages/pi-questions-user
```

Tests use Vitest's terminating offline Node runner, fake native UI boundaries,
and real SDK/TUI 1.4.0 focus and open-tool-row invalidation regressions.
