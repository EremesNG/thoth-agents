import fs from 'node:fs';
import path from 'node:path';
import { registerRenderKit, withdrawRenderKit } from '@thoth-agents/pi-core';
import { createTestRenderKit } from '@thoth-agents/pi-core/testing';
import { expect, it, onTestFinished, vi } from 'vitest';
import { renderSubagentCompletionMessage } from '../../src/render/completion-message.js';
import { boxedComponent } from '../../src/render/tools/components.js';
import { renderSubagentSendMessageResult } from '../../src/render/tools/subagent-send-message.js';
import { registerSubagentTools } from '../../src/tools.js';
import { installSubagentTestEnv } from '../helpers/subagent-test-helpers.js';

const env = installSubagentTestEnv();

const theme = {
  fg: (_role: string, text: string) => text,
  bold: (text: string) => text,
};

function captureCards() {
  const kit = createTestRenderKit();
  const card = vi.spyOn(kit, 'card');
  const token = registerRenderKit(kit, {});
  onTestFinished(() => withdrawRenderKit(token));
  return card;
}

function registeredTools(): any[] {
  fs.writeFileSync(
    path.join(env.tmp, '.pi', 'subagents.json'),
    JSON.stringify({ enable_continue: true }),
  );
  const tools: any[] = [];
  registerSubagentTools(
    { registerTool: (tool: any) => tools.push(tool) },
    env.createManager(env.mockRunner()),
    env.tmp,
  );
  expect(tools).toHaveLength(9);
  return tools;
}

it.each([
  'running',
  'queued',
  'rejected',
  'unknown',
  'unrecognized',
])('keeps a non-error %s send-message result out of the success border state', (status) => {
  const card = captureCards();
  renderSubagentSendMessageResult(
    {
      content: [{ type: 'text', text: 'message outcome' }],
      details: { task_id: 't1', status },
    },
    {},
    theme,
    { isPartial: false, isError: false },
  ).render(100);
  expect(card).toHaveBeenCalled();
  for (const [, options] of card.mock.calls) {
    // A successful query is terminal even if the queried outcome is not complete.
    expect(options.status).toBe('completed');
    expect(options.isSuccess).not.toBe(true);
    expect(options.isError).toBeFalsy();
  }
});

it.each([
  {
    status: 'completed',
    isPartial: false,
    isError: false,
    expected: 'completed',
    success: true,
  },
  {
    status: 'completed',
    isPartial: false,
    isError: true,
    expected: 'failed',
  },
  { status: 'failed', isPartial: false, isError: true, expected: 'failed' },
  {
    status: 'cancelled',
    isPartial: false,
    isError: true,
    expected: 'failed',
  },
  {
    status: 'running',
    isPartial: false,
    isError: false,
    expected: 'completed',
  },
  { status: 'queued', isPartial: false, isError: false, expected: 'completed' },
  {
    status: 'rejected',
    isPartial: false,
    isError: false,
    expected: 'completed',
  },
  {
    status: 'unknown',
    isPartial: false,
    isError: false,
    expected: 'completed',
  },
  {
    status: 'unrecognized',
    isPartial: false,
    isError: false,
    expected: 'completed',
  },
  {
    status: 'completed',
    isPartial: true,
    isError: false,
    expected: 'running',
  },
])('keeps all parts of all nine tool cards consistent for $status (partial=$isPartial, error=$isError)', ({
  status,
  isPartial,
  isError,
  expected,
  success,
}) => {
  const card = captureCards();
  const task = { id: 't1', agent: 'worker', status, result: 'response' };
  const result = {
    content: [{ type: 'text', text: 'output' }],
    details: { task, agents: [], task_id: 't1', status },
  };
  for (const tool of registeredTools()) {
    card.mockClear();
    const context = { isPartial, isError, state: {} };
    const call = tool.renderCall({}, theme, context);
    const output = tool.renderResult(
      result,
      { isPartial, expanded: true },
      theme,
      context,
    );
    call.render(100);
    output.render(100);
    expect(card.mock.calls.length, tool.name).toBeGreaterThan(0);
    for (const [, options] of card.mock.calls) {
      expect(options.status ?? options.footer, tool.name).toBe(expected);
      expect(options.isSuccess === true, tool.name).toBe(success === true);
      expect(options.isError, tool.name).toBe(isError);
    }
    // Calls are empty; the result owns every frame part of the card.
    expect(call.render(100), tool.name).toEqual([]);
  }
});

it.each([
  {
    name: 'completed batch',
    details: { tasks: [{ status: 'completed' }, { status: 'completed' }] },
    isPartial: false,
    isError: false,
    footer: '╰─ ✓',
    glyph: '✓',
  },
  {
    name: 'completed-first/running-second batch',
    details: { tasks: [{ status: 'completed' }, { status: 'running' }] },
    isPartial: false,
    isError: false,
    footer: '╰─ ✓',
    glyph: '✓',
  },
  {
    name: 'failed task',
    details: { task: { status: 'failed' } },
    isPartial: false,
    isError: true,
    footer: '╰─ ✗',
    glyph: '✗',
  },
  {
    name: 'cancelled task',
    details: { task: { status: 'cancelled' } },
    isPartial: false,
    isError: true,
    footer: '╰─ ✗',
    glyph: '✗',
  },
  {
    name: 'completed task while partial',
    details: { task: { status: 'completed' } },
    isPartial: true,
    isError: false,
    footer: '╰─ running',
    glyph: '◐',
  },
  {
    name: 'completed task with host error',
    details: { task: { status: 'completed' } },
    isPartial: false,
    isError: true,
    footer: '╰─ ✗',
    glyph: '✗',
  },
])('uses the tool lifecycle for the standard footer and indicator for $name', ({
  details,
  isPartial,
  isError,
  footer,
  glyph,
}) => {
  const kit = createTestRenderKit();
  const indicator = vi.spyOn(kit, 'indicator');
  const token = registerRenderKit(kit, {});
  onTestFinished(() => withdrawRenderKit(token));

  const lines = renderSubagentSendMessageResult(
    { content: [{ type: 'text', text: 'output' }], details },
    { isPartial },
    theme,
    { isPartial, isError },
  ).render(100);
  expect(lines.at(-1)).toBe(footer);
  expect(indicator.mock.results[0]?.value.glyph).toBe(glyph);
});

it.each(
  ['tasks', 'results'].flatMap((field) => [
    { field, status: 'completed', success: true },
    { field, status: 'running', success: false },
    { field, status: 'queued', success: false },
    { field, status: 'stopping', success: false },
    { field, status: 'failed', success: false },
    { field, status: 'cancelled', success: false },
    { field, status: 'rejected', success: false },
    { field, status: 'unknown', success: false },
    { field, status: 'unrecognized', success: false },
    { field, status: undefined, success: false },
  ]),
)('requires every entry in a $field batch ending with $status to complete before success', ({
  field,
  status,
  success,
}) => {
  const card = captureCards();
  const result = {
    content: [{ type: 'text', text: 'batch output' }],
    details: {
      [field]: [
        { id: 't1', agent: 'worker', status: 'completed' },
        { id: 't2', agent: 'worker', status },
      ],
    },
  };
  for (const tool of registeredTools()) {
    card.mockClear();
    tool
      .renderResult(result, {}, theme, { isPartial: false, isError: false })
      .render(100);
    expect(card.mock.calls.length, tool.name).toBeGreaterThan(0);
    for (const [, options] of card.mock.calls) {
      // Tool completion does not imply that every task in the batch succeeded.
      expect(options.status, tool.name).toBe('completed');
      expect(options.isSuccess === true, tool.name).toBe(success);
      expect(options.isError, tool.name).toBe(false);
    }
  }
});

it.each([
  {
    name: 'completed outcome',
    details: { status: 'completed' },
    success: true,
  },
  { name: 'empty tasks', details: { tasks: [] }, success: false },
  { name: 'empty results', details: { results: [] }, success: false },
  { name: 'task without status', details: { task: {} }, success: false },
  { name: 'null outcome', details: { status: null }, success: false },
])('keeps tool completion separate from border evidence for $name', ({
  details,
  success,
}) => {
  const card = captureCards();
  renderSubagentSendMessageResult(
    { content: [{ type: 'text', text: 'output' }], details },
    {},
    theme,
    { isPartial: false, isError: false },
  ).render(100);
  expect(card).toHaveBeenCalled();
  for (const [, options] of card.mock.calls) {
    expect(options.status).toBe('completed');
    expect(options.isSuccess === true).toBe(success);
  }
});

it.each([
  {
    details: { agents: [] },
    isPartial: false,
    isError: false,
    status: 'completed',
    success: true,
  },
  {
    details: { agents: [] },
    isPartial: true,
    isError: false,
    status: 'running',
  },
  {
    details: { error: 'failed' },
    isPartial: false,
    isError: true,
    status: 'failed',
  },
])('uses the host lifecycle for ordinary tool results ($status)', ({
  details,
  isPartial,
  isError,
  status,
  success,
}) => {
  const card = captureCards();
  for (const tool of registeredTools()) {
    card.mockClear();
    tool
      .renderResult(
        { content: [{ type: 'text', text: 'output' }], details },
        { isPartial },
        theme,
        { isPartial, isError },
      )
      .render(100);
    expect(card.mock.calls.length, tool.name).toBeGreaterThan(0);
    for (const [, options] of card.mock.calls) {
      expect(options.status ?? options.footer, tool.name).toBe(status);
      expect(options.isSuccess === true, tool.name).toBe(success === true);
      expect(options.isError, tool.name).toBe(isError);
    }
  }
});

it('uses the standard default footer without inferring success from missing context', () => {
  const kit = createTestRenderKit();
  const card = vi.spyOn(kit, 'card');
  const indicator = vi.spyOn(kit, 'indicator');
  const token = registerRenderKit(kit, {});
  onTestFinished(() => withdrawRenderKit(token));

  const lines = boxedComponent(['output'], { theme }).render(100);
  // Display status is not border evidence.
  expect(lines.at(-1)).toBe('╰─ ✓');
  expect(indicator.mock.results[0]?.value.glyph).toBe('✓');
  expect(card).toHaveBeenCalled();
  for (const [, options] of card.mock.calls) {
    expect(options.status).toBe('completed');
    expect(options.isSuccess).not.toBe(true);
  }
});

it.each([
  { status: 'completed', success: true, isError: false },
  { status: 'failed', success: false, isError: true },
  { status: 'cancelled', success: false, isError: true },
  { status: 'running', success: false, isError: false },
  { status: 'rejected', success: false, isError: false },
  { status: 'unknown', success: false, isError: false },
  { status: 'unrecognized', success: false, isError: false },
  { status: undefined, success: false, isError: false },
])('maps $status completion notifications to the affirmative success/error state only', ({
  status,
  success,
  isError,
}) => {
  const card = captureCards();
  for (const expanded of [false, true]) {
    renderSubagentCompletionMessage(
      { details: { task: { agent: 'worker', status, result: 'response' } } },
      { expanded },
      theme,
    ).render(100);
  }
  expect(card.mock.calls).toHaveLength(2);
  for (const [, options] of card.mock.calls) {
    expect(options.status).toBeUndefined();
    expect(options.isSuccess).toBe(success);
    expect(options.isError).toBe(isError);
  }
});
