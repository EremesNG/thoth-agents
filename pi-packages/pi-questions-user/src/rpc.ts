import type { ExtensionUIContext } from '@earendil-works/pi-coding-agent';
import { waitForUI } from './abort.js';
import {
  type AnswerState,
  buildResult,
  getAnswer,
  markSkipped,
  type QuestionResult,
  selectOption,
  setCustomText,
  toggleOption,
} from './answers.js';
import { FREE_TEXT_LABEL } from './schema.js';

export async function runRpcQuestions(
  initialState: AnswerState,
  ui: Pick<ExtensionUIContext, 'select' | 'input'>,
  signal?: AbortSignal,
): Promise<QuestionResult> {
  let state = initialState;
  try {
    signal?.throwIfAborted();
    for (const question of state.questions) {
      const title = [state.title, question.header, question.prompt]
        .filter(Boolean)
        .join('\n');
      const input = () =>
        waitForUI(() => ui.input(title, undefined, { signal }), signal);
      if (question.type === 'text') {
        const text = await input();
        if (text === undefined) return buildResult(state, { cancelled: true });
        state = setCustomText(state, question.id, text);
        continue;
      }
      const options = question.options ?? [];
      const multi = question.type === 'multi';
      while (true) {
        const labels = options.map((option, index) => {
          if (question.type === 'confirm') return option.label;
          const label = `${index + 1}. ${option.label}${option.recommended ? ' (recommended)' : ''}${option.description ? ` — ${option.description}` : ''}`;
          return multi
            ? `[${getAnswer(state, question.id).values.includes(option.value) ? 'x' : ' '}] ${label}`
            : label;
        });
        const rows = [
          ...labels,
          ...(question.type === 'confirm' ? [] : [FREE_TEXT_LABEL]),
          ...(multi ? ['Done'] : []),
          'Skip',
        ];
        const choice = await waitForUI(
          () => ui.select(title, rows, { signal }),
          signal,
        );
        if (choice === undefined)
          return buildResult(state, { cancelled: true });
        if (choice === 'Skip') {
          state = markSkipped(state, question.id);
          break;
        }
        if (multi && choice === 'Done') break;
        if (choice === FREE_TEXT_LABEL && question.type !== 'confirm') {
          const text = await input();
          if (text === undefined)
            return buildResult(state, { cancelled: true });
          state = setCustomText(state, question.id, text);
        } else {
          const option = options[labels.indexOf(choice)];
          if (!option)
            throw new Error('UI returned an unknown question choice.');
          state = multi
            ? toggleOption(state, question.id, option.value)
            : selectOption(state, question.id, option.value);
        }
        if (!multi) break;
      }
    }
    return buildResult(state);
  } catch (error) {
    if (!signal?.aborted) throw error;
    return buildResult(state, { cancelled: true, error: 'aborted' });
  }
}
