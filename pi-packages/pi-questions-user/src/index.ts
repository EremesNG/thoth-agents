import type {
  ExtensionAPI,
  ToolDefinition,
} from '@earendil-works/pi-coding-agent';
import {
  openOwnedOverlay,
  publishToolDefinitions,
  type ToolDefinitionHandle,
} from '@thoth-agents/pi-core';
import { waitForUI } from './abort.js';
import {
  buildResult,
  createState,
  type QuestionDetails,
  type QuestionResult,
} from './answers.js';
import { getQuestionUIFactory, type QuestionUIHook } from './custom-ui.js';
import { createQuestionRenderers } from './render.js';
import { runRpcQuestions } from './rpc.js';
import { questionParameters } from './schema.js';
import { validateQuestions } from './validate.js';

export const TOOL_NAME = 'ask_user_question';

export function createQuestionTool(
  uiHook: QuestionUIHook = getQuestionUIFactory,
): ToolDefinition<typeof questionParameters, QuestionDetails> {
  return {
    name: TOOL_NAME,
    label: 'Ask User Question',
    description:
      'Ask the user a questionnaire with stable ids, single/multi choices, text or Yes/No confirmation. Required is advisory; recommendations are never preselected.',
    promptGuidelines: [
      "When the user does not write in English, pass `labels` with the fixed UI strings (yes, no, typeSomething, submit, backToEdit, cancel, review, skip, done, hints…) translated to the user's language; also write headers, prompts and option labels in that language. Option values and ids stay stable.",
    ],
    parameters: questionParameters,
    ...createQuestionRenderers(),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const validated = validateQuestions(params);
      let state = createState(
        validated.valid ? validated.value : { questions: [] },
      );
      if (!ctx.hasUI)
        return buildResult(state, { cancelled: true, error: 'no_ui' });
      if (!validated.valid)
        return buildResult(state, {
          error: 'invalid_questions',
          issues: validated.issues,
        });
      try {
        signal?.throwIfAborted();
        if (typeof ctx.ui.custom === 'function') {
          const factory = uiHook({
            state,
            signal,
            onStateChange: (updated) => {
              state = updated;
            },
          });
          if (factory) {
            let abortOverlay: (() => void) | undefined;
            const customResult = await waitForUI(
              () =>
                openOwnedOverlay<QuestionResult | undefined>(
                  ctx,
                  (tui, theme, keys, close) => {
                    // Hooks may ignore signals; abort must still close the owned overlay.
                    abortOverlay = () =>
                      close(
                        buildResult(state, {
                          cancelled: true,
                          error: 'aborted',
                        }),
                      );
                    signal?.addEventListener('abort', abortOverlay, {
                      once: true,
                    });
                    if (signal?.aborted) abortOverlay();
                    return factory(tui, theme, keys, close);
                  },
                  {
                    overlayOptions: { width: '100%', anchor: 'bottom-center' },
                  },
                ),
              signal,
            ).finally(() => {
              if (abortOverlay)
                signal?.removeEventListener('abort', abortOverlay);
            });
            // RPC's undefined sentinel is not a user cancellation.
            if (customResult !== undefined) return customResult;
          }
        }
        return await runRpcQuestions(state, ctx.ui, signal);
      } catch (error) {
        if (!signal?.aborted) throw error;
        return buildResult(state, { cancelled: true, error: 'aborted' });
      }
    },
  };
}

export default function registerQuestions(pi: ExtensionAPI): void {
  const tool = createQuestionTool();
  pi.registerTool(tool);
  let publication: ToolDefinitionHandle | undefined;
  pi.on('session_start', (_event, ctx) => {
    if (ctx.hasUI) publication ??= publishToolDefinitions([tool]);
  });
  pi.on('session_shutdown', () => {
    publication?.withdraw();
    publication = undefined;
  });
  pi.on('before_agent_start', (_event, ctx) => {
    if (!ctx.hasUI)
      pi.setActiveTools(
        pi.getActiveTools().filter((name) => name !== TOOL_NAME),
      );
  });
}
