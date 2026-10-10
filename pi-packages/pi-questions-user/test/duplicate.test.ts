import {
  initTheme,
  ToolExecutionComponent,
} from '@earendil-works/pi-coding-agent';
import { beforeAll, expect, it } from 'vitest';
import { buildResult, createState, selectOption } from '../src/answers.js';
import {
  createQuestionRenderBridge,
  createQuestionRenderers,
} from '../src/render.js';

beforeAll(() => initTheme('dark'));

it('renders the answers once when the row is finished before the result arrives', () => {
  const bridge = createQuestionRenderBridge();
  const questionnaire = {
    questions: [
      {
        id: 'a',
        header: 'Scope',
        prompt: 'p',
        type: 'single' as const,
        options: [{ value: 'x', label: 'UNIQUE-ANSWER' }],
      },
    ],
  };
  const tool = {
    name: 'ask_user_question',
    ...createQuestionRenderers(bridge),
  };
  const tui = { requestRender() {} };
  const row = new ToolExecutionComponent(
    tool.name,
    'call-1',
    questionnaire,
    {},
    tool as never,
    tui as never,
    process.cwd(),
  );
  row.markExecutionStarted();
  // execute()'s finally runs first, then the SDK delivers the result.
  bridge.finish('call-1');
  row.render(80);
  const result = buildResult(
    selectOption(createState(questionnaire), 'a', 'x'),
  );
  row.updateResult({ ...result, isError: false });
  const text = row.render(80).join('\n');
  expect(text.match(/UNIQUE-ANSWER/g)).toHaveLength(1);
});
