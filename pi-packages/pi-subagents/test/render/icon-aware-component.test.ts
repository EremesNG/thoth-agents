import { registerRenderKit, withdrawRenderKit } from '@thoth-agents/pi-core';
import { createTestRenderKit } from '@thoth-agents/pi-core/testing';
import { expect, it, onTestFinished } from 'vitest';
import {
  assertCollected,
  renderChain,
} from '../../../pi-core/test/helpers/render-chain.js';
import { renderSubagentCompletionMessage } from '../../src/render/completion-message.js';
import { iconAwareRenderer } from '../../src/render/icon-aware-component.js';
import { renderSubagentQuestionMessage } from '../../src/render/question-message.js';
import { renderSubagentCancelResult } from '../../src/render/tools/subagent-cancel.js';
import { renderSubagentContinueResult } from '../../src/render/tools/subagent-continue.js';
import { renderSubagentExtendResult } from '../../src/render/tools/subagent-extend.js';
import { renderSubagentListResult } from '../../src/render/tools/subagent-list-agents.js';
import { renderSubagentListTasksResult } from '../../src/render/tools/subagent-list-tasks.js';
import { renderSubagentReplyResult } from '../../src/render/tools/subagent-reply.js';
import { renderSubagentResult } from '../../src/render/tools/subagent-result.js';
import { renderSubagentRunResult } from '../../src/render/tools/subagent-run.js';
import { renderSubagentSendMessageResult } from '../../src/render/tools/subagent-send-message.js';
import { renderSubagentStatusResult } from '../../src/render/tools/subagent-status.js';

const theme = {
  fg: (_role: string, text: string) => text,
  bg: (_role: string, text: string) => text,
  bold: (text: string) => text,
};

it('preserves three-argument message builds and an absent mouse handler', () => {
  let count = 0;
  const renderer = iconAwareRenderer((...args: [object, object, object]) => {
    count = args.length;
    return { render: () => ['message'], invalidate() {} };
  });
  const component = renderer({}, {}, theme);
  expect(count).toBe(3);
  expect(component.handleMouse({})).toBeUndefined();
});

it('collects previous wrappers and results even when the builder retains its context', async () => {
  const renderer = iconAwareRenderer(
    (
      result: { text: string },
      _options: object,
      _theme: object,
      context: { lastComponent?: unknown; label: string },
    ) => ({
      render: () => [result.text, context.label],
      invalidate() {},
    }),
  );
  const results: WeakRef<object>[] = [];
  const { latest, previous } = renderChain((lastComponent, index) => {
    const result = { text: `transcript ${index}` };
    if (index < 31) results.push(new WeakRef(result));
    return renderer(result, {}, theme, { lastComponent, label: 'live' });
  });
  await assertCollected([...previous, ...results]);
  expect(latest.render(80)).toEqual(['transcript 31', 'live']);
});

it('rebuilds only on kit identity changes with a detached context and preserves delegation', () => {
  const seen: unknown[] = [];
  const state = {};
  const original = { lastComponent: { render() {} }, state };
  let builds = 0;
  let invalidations = 0;
  const event = {};
  const renderer = iconAwareRenderer(
    (
      _result: object,
      _options: object,
      _theme: object,
      context: typeof original,
    ) => {
      builds++;
      seen.push(context.lastComponent);
      expect(context.state).toBe(state);
      return {
        render: (width: number) => [`${builds}:${width}`],
        invalidate() {
          invalidations++;
        },
        handleMouse: (received: unknown) => received,
      };
    },
  );
  const component = renderer({}, {}, theme, original);
  expect(component.render(80)).toEqual(['1:80']);
  component.invalidate();
  expect(component.handleMouse(event)).toBe(event);
  expect(builds).toBe(1);
  expect(invalidations).toBe(1);
  const kit = createTestRenderKit();
  const token = registerRenderKit(kit, {});
  onTestFinished(() => withdrawRenderKit(token));
  expect(component.render(80)).toEqual(['2:80']);
  component.invalidate();
  expect(builds).toBe(2);
  const sameKit = registerRenderKit(kit, {});
  onTestFinished(() => withdrawRenderKit(sameKit));
  component.handleMouse(event);
  expect(builds).toBe(2);
  withdrawRenderKit(sameKit);
  expect(component.render(80)).toEqual(['3:80']);
  expect(seen).toEqual([undefined, undefined, undefined]);
  expect(original.lastComponent).toBeDefined();
});

it.each([
  ['run', renderSubagentRunResult],
  ['status', renderSubagentStatusResult],
  ['result', renderSubagentResult],
  ['list tasks', renderSubagentListTasksResult],
  ['continue', renderSubagentContinueResult],
  ['reply', renderSubagentReplyResult],
  ['cancel', renderSubagentCancelResult],
  ['extend', renderSubagentExtendResult],
  ['send message', renderSubagentSendMessageResult],
  ['list agents', renderSubagentListResult],
  ['completion', renderSubagentCompletionMessage],
  ['question', renderSubagentQuestionMessage],
])('mounted %s renderer releases previous wrappers and result snapshots', async (_name, renderer) => {
  const results: WeakRef<object>[] = [];
  const state = {};
  const { latest, previous } = renderChain((lastComponent, index) => {
    const task = {
      id: 'task',
      agent: 'worker',
      status: 'completed',
      result: `response ${index}`,
      transcript: `transcript ${index}`,
    };
    const result = { details: { task, tasks: [task] } };
    if (index < 31) results.push(new WeakRef(result));
    // Message renderers accept three arguments; Pi tool result renderers use four.
    const component = (renderer as typeof renderSubagentRunResult)(
      result,
      { expanded: true },
      theme,
      { lastComponent, state },
    );
    component.render(80);
    return component;
  });
  await assertCollected([...previous, ...results]);
  const token = registerRenderKit(createTestRenderKit(), {});
  onTestFinished(() => withdrawRenderKit(token));
  expect(latest.render(80).length).toBeGreaterThan(0);
  await assertCollected(previous);
});
