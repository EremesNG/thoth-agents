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

`title`, `type`, `required`, `description`, `preview`, and `recommended` are optional.
Type defaults to `single`; types are `single`, `multi`, `text`, `confirm`. There
are no declared maximum counts or string lengths. At least one question is
required. IDs and option values must be unique (values within each question),
non-blank strings; headers, prompts and labels must be non-blank. Single/multi
need options. Text/confirm accept no options (an empty array is also allowed).
Confirm synthesizes `{value: "yes", label: "Yes"}` and `{value: "no", label: "No"}`.
`Type something.` is a reserved option label.

`required` is advisory: a user may skip any question. Recommendations are markers,
never selected or submitted automatically. Single/multi offer a free-text entry;
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

The registered tool includes call/result renderers using the pi-core render kit
when available, with native Pi rendering as fallback. UI sessions publish the full
tool definition to the pi-core tool registry on `session_start`; shutdown withdraws
only that session's publication. Headless sessions do not publish it.

`QuestionUIHook(session: QuestionUISession): QuestionUIFactory | undefined` receives
initial `state`, optional `signal` and `onStateChange(state)`. The component should
report recorded state after each transition to preserve answers if aborted, and
listen to the signal to complete native teardown. `QuestionUIFactory` uses Pi's
native `(tui, theme, keybindings, done)` signature and returns a component (or promise).
Call `done(buildResult(state))` to submit,
`done(buildResult(state, {cancelled: true}))` to cancel, or
`done(buildResult(state, {cancelled: true, error: "aborted"}))` on abort. The default
component calls `done` at most once to restore Pi's editor, keeps recorded answers,
and removes its abort listener on completion/disposal.

**Undefined means custom UI unavailable, not user cancellation.** A UI hook
returning no factory, missing `ctx.ui.custom`, or its undefined sentinel (as in RPC
mode) runs the sequential select/input fallback. Unexpected host errors propagate
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
- `PageUp` / `PageDown`: scroll the focused option's preview.
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

Tests use Vitest's terminating offline Node runner and fake native UI boundaries.
