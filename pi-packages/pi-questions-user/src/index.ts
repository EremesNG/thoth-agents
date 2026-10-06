import type {
  ExtensionAPI,
  ToolDefinition,
} from '@earendil-works/pi-coding-agent';
import {
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
            const customResult = await waitForUI(
              () => ctx.ui.custom<QuestionResult | undefined>(factory),
              signal,
            );
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
