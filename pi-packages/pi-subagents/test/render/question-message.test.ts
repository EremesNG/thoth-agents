import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import extension from '../../src/extension/subagents-extension.js';
import { SubagentManager } from '../../src/manager.js';
import { sendSubagentCompletionMessage } from '../../src/render/completion-message.js';
import { sendSubagentQuestionMessage } from '../../src/render/question-message.js';
import * as rendering from '../../src/thread-view.js';
import { installSubagentTestEnv } from '../helpers/subagent-test-helpers.js';

vi.mock('../../src/manager.js', () => ({ SubagentManager: vi.fn() }));
const env = installSubagentTestEnv();
let deliverQuestion: (task: any, question: any) => void;

beforeEach(() => {
  vi.mocked(SubagentManager).mockImplementation(
    class {
      constructor(...args: any[]) {
        deliverQuestion = args[6];
        Object.assign(this, {
          reconcileOrphanedTasks: vi.fn(),
          close: vi.fn(),
        });
      }
    } as unknown as typeof SubagentManager,
  );
  vi.spyOn(
    rendering,
    'preloadPiComponentsForSubagentRendering',
  ).mockResolvedValue(false);
});
afterEach(() => {
  vi.restoreAllMocks();
});

const task = {
  id: 'subtask_question',
  agent: 'analyst',
  display_name: 'Scope Analysis',
  session_id: 'parent-a',
};
const question = {
  task_id: task.id,
  agent: task.agent,
  request_id: 'request-uuid',
  message: 'Which implementation scope?\nRuntime only?',
  created_at: '2026-01-01T00:00:00.000Z',
};

function install() {
  const handlers = new Map<string, Function>();
  const renderers = new Map<string, Function>();
  const pi = {
    registerTool: vi.fn(),
    registerShortcut: vi.fn(),
    registerCommand: vi.fn(),
    registerMessageRenderer: (name: string, renderer: Function) =>
      renderers.set(name, renderer),
    on: (name: string, handler: Function) => handlers.set(name, handler),
    sendMessage: vi.fn(),
  };
  extension(pi);
  return { pi, handlers, renderers };
}

describe('question message render and delivery', () => {
  it('uses a distinct question notification with the same turn-triggering delivery as completions', () => {
    const sendMessage = vi.fn();
    sendSubagentQuestionMessage({ sendMessage }, task as any, question);
    sendSubagentCompletionMessage(
      { sendMessage },
      { ...task, status: 'completed', result: 'done' },
    );
    const [payload, options] = sendMessage.mock.calls[0]!;
    expect(payload).toMatchObject({
      customType: 'subagent-question',
      display: true,
      details: {
        task_id: task.id,
        agent: task.agent,
        request_id: question.request_id,
        question: question.message,
      },
    });
    expect(payload.content).toContain('not a user message');
    expect(payload.content).toContain(task.id);
    expect(payload.content).toContain(question.request_id);
    expect(payload.content).toContain(question.message);
    expect(payload.content).toContain('subagent_reply');
    expect(options).toEqual({ triggerTurn: true, deliverAs: 'followUp' });
    expect(options).toEqual(sendMessage.mock.calls[1]![1]);
  });

  it('registers a boxed compact/expanded renderer without displaying the automated marker', () => {
    const { pi, renderers } = install();
    sendSubagentQuestionMessage(pi, task as any, question);
    const payload = pi.sendMessage.mock.calls[0]![0];
    const renderer = renderers.get('subagent-question')!;
    const theme = { fg: (_name: string, text: string) => text };
    const compact = env.stripAnsi(
      renderer(payload, { expanded: false }, theme).render(100).join('\n'),
    );
    expect(compact).toContain('[subagent] Scope Analysis · question');
    expect(compact).toContain('ctrl+o to expand');
    expect(compact).not.toContain(question.message);
    const expanded = env.stripAnsi(
      renderer(payload, { expanded: true }, theme).render(100).join('\n'),
    );
    expect(expanded).toContain(task.id);
    expect(expanded).toContain(question.request_id);
    expect(expanded).toContain('Which implementation scope?');
    expect(expanded).toContain('Runtime only?');
    expect(expanded).not.toContain('Automated system notification');
    expect(expanded).toMatch(/╭─.*\n/);
    for (const width of [1, 9, 40]) {
      const lines = renderer(payload, { expanded: true }, theme).render(width);
      expect(
        lines.every((line: string) => env.stripAnsi(line).length <= width),
      ).toBe(true);
    }
  });

  it('delivers only to the originating active parent and rejects stale delivery contexts', () => {
    const { pi, handlers } = install();
    handlers.get('session_start')!(
      {},
      { cwd: env.tmp, sessionId: 'parent-a', ui: {} },
    );
    deliverQuestion(task, question);
    expect(pi.sendMessage).toHaveBeenCalledOnce();
    handlers.get('session_start')!(
      {},
      { cwd: env.tmp, sessionId: 'parent-b', ui: {} },
    );
    expect(() => deliverQuestion(task, question)).toThrow(
      /originating parent.*no longer active/,
    );
    expect(pi.sendMessage).toHaveBeenCalledOnce();
    handlers.get('session_start')!(
      {},
      { cwd: env.tmp, sessionId: 'parent-a', ui: {} },
    );
    pi.sendMessage.mockImplementation(() => {
      throw new Error('extension ctx is stale');
    });
    expect(() => deliverQuestion(task, question)).toThrow(
      /parent.*shutdown or replacement/i,
    );
  });
});
