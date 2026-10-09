# @thoth-agents/pi-questions-user

First-party `ask_user_question` for Pi. MIT; Node >=22.19.0, Pi peers >=0.99.0;
development SDK/TUI 1.0.2. Install this package as a Pi extension.

## Parameters

```json
{
  "title": "Implementation plan",
  "questions": [
    {
      "id": "approach",
      "header": "Approach",
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

`title`, `labels`, `type`, `required`, `description`, `preview`, and `recommended` are optional.
Type defaults to `single`; types are `single`, `multi`, `text`, `confirm`. There
are no declared maximum counts or string lengths. At least one question is
required. IDs and option values must be unique (values within each question),
non-blank strings; headers, prompts and labels must be non-blank. Single/multi
need options. Text/confirm accept no options (an empty array is also allowed).
Confirm synthesizes `{value: "yes", label: "Yes"}` and `{value: "no", label: "No"}`
(values are stable; only the labels localize). `Type something.` and the
localized `typeSomething` label are reserved option labels.

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
`scrollPreview`, `scrollPrompt`, `more`, `switchTab`, `save`, `newline`, `keepDraft`,
`collapse`, `expand`. The native
questionnaire, the sequential RPC fallback, synthesized confirm options and the
transcript result card all use them. When supplied, `labels` is echoed in
`details.labels` so the result card renders in the same language; it is absent
otherwise.

```json
{ "labels": { "yes": "Sí", "no": "No", "submit": "Enviar respuestas" }, "questions": [] }
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
multi toggles plus Done, and explicit Skip (blank text also skips).

## Results

`content` is a readable per-question summary. `details` contains optional `title`,
`cancelled`, optional `error`, `answers` keyed by question ID, and `questions`
metadata (including synthesized confirm options). Each answer has `status:
"answered" | "skipped"`, `values`, `labels`, and optional `customText`, `note`,
`optionNotes` keyed by option value. Text-only answers have empty values/labels.
Cancelled requests retain recorded answers; the summary explicitly says unanswered
questions must not be assumed. Error codes are `invalid_questions`, `no_ui`,
`aborted`. Invalid input adds `issues: [{path, code, message}]`; no interaction is
attempted. `invalid_questions` is not user cancellation; `no_ui` and `aborted` are.

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
the options on wide terminals (below on narrow ones), and a review tab for multiple
questions. A single question may submit directly.

The questionnaire is drawn in the thoth frame: a rounded border with the title,
a tabs row, dividers around the question/option/preview area and a two-row hint
footer. The frame comes from the pi-core render kit resolved at render time and
falls back to the same glyphs drawn natively when no kit is registered (the theme
package is never a dependency). Expanded height stays stable across options, tabs
and editors for a given questionnaire and terminal size. Its baseline is
`max(12, floor(rows * 0.4))`; content can grow it up to `floor(rows * 0.65)` (never
below that baseline). Need is measured across all questions: frame chrome, full
wrapped prompts, wrapped option labels and previews. Prompts take priority, then
labels with hanging indents; spare rows go to the preview. At the cap, the narrow
preview shrinks to a minimum of up to two body rows of actual content, then lists
scroll by whole options, and finally overflowing prompts scroll with a visible indicator. In tiny terminals
that cannot fit those minimums, preview rows shrink further to preserve the height
cap and selected option. Wide terminals (100+ columns) wrap labels within the
list column beside the scrolling preview. Active editors reserve their native
borders and at least the cursor line before the prompt; tall drafts clip around
the cursor. In tiny terminals the editor label yields to that minimum.
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
- `Shift+Up` / `Shift+Down`: scroll the focused option's preview by a line;
  `[` / `]` (and `PageUp` / `PageDown`) scroll by half a page. A header shows
  the visible range and `↑ N more` / `↓ N more`. Fullscreen Pi consumes
  `PageUp`/`PageDown`, `Home`/`End`, `Ctrl+Up`/`Down` and the mouse wheel for the
  transcript before the questionnaire sees them, so `Shift+arrows` and `[`/`]`
  are the keys that always work.
- `Alt+Up` / `Alt+Down`: scroll an overflowing prompt by a line; its indicator
  shows hidden rows. The hint appears only when a prompt overflows; switching tabs
  resets prompt scroll.
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
and real SDK/TUI 1.0.2 focus and open-tool-row invalidation regressions.
