import type { ExtensionToolContext } from '@earendil-works/pi-coding-agent';
import type {
  QuestionServiceProvider,
  QuestionServiceResult,
} from '@thoth-agents/pi-core';
import { buildResult, createState } from './answers.js';
import { getQuestionUIFactory, type QuestionUIHook } from './custom-ui.js';
import { openQuestionDock } from './question-dock.js';

let nextRequest = 0;

/** Dock-only service: unavailable editor slots/RPC let the consumer choose its fallback.
 * Unlike the model-facing tool, this never opens sequential select/input dialogs.
 */
export function createQuestionServiceProvider(
  uiHook: QuestionUIHook = getQuestionUIFactory,
): QuestionServiceProvider {
  return {
    async ask(context, request, { signal }) {
      let state = createState(request);
      const result = (
        status: QuestionServiceResult['status'],
      ): QuestionServiceResult => ({
        status,
        answers: Object.fromEntries(
          Object.entries(state.answers).map(
            ([id, { optionNotes: _optionNotes, ...answer }]) => [id, answer],
          ),
        ),
      });
      if (signal?.aborted) return result('cancelled');
      const ctx = context as ExtensionToolContext | undefined;
      if (!ctx?.hasUI || !ctx.ui) return result('unavailable');
      const answer = await openQuestionDock(
        ctx,
        `service-${++nextRequest}`,
        uiHook,
        {
          state,
          signal,
          onStateChange: (updated) => {
            state = updated;
          },
        },
        () => buildResult(state, { cancelled: true, error: 'aborted' }),
        () => {},
      );
      if (signal?.aborted) return result('cancelled');
      if (answer === undefined) return result('unavailable');
      state = answer.details;
      return result(answer.details.cancelled ? 'cancelled' : 'answered');
    },
  };
}
