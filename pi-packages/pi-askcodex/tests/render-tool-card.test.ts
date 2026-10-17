import type { Theme } from '@earendil-works/pi-coding-agent';
import {
  registerRenderKit,
  type ThothRenderKit,
  withdrawRenderKit,
} from '@thoth-agents/pi-core';
import { afterEach, expect, it, vi } from 'vitest';
import { renderToolCard } from '../src/render-tool-card.js';

const theme = {
  bg: (_role: string, text: string) => text,
} as Theme;
const registrations: ReturnType<typeof registerRenderKit>[] = [];
function installKit(label = 'kit') {
  const kit: ThothRenderKit = {
    version: 1,
    card: vi.fn((_theme, options, width) => [
      `${label}:${width}:${options.part}:${options.status}`,
      ...(options.body ?? []),
    ]),
    collapse: (_theme, rows) => [...rows],
    cachedComponent: (render) => ({ render, invalidate() {} }),
    indicator: () => ({ glyph: '*', elapsed: '', text: 'running' }),
    statusGlyph: () => '*',
    widgetHeading: () => '',
    treeRow: () => '',
    fg: (_theme, _role, text) => text,
  };
  registrations.push(registerRenderKit(kit, {}));
  return kit;
}
afterEach(() => {
  for (const token of registrations.splice(0)) withdrawRenderKit(token);
});

it('reuses completed card lines and builds the body only once at the same width', () => {
  const kit = installKit();
  const body = vi.fn(() => ({ title: 'AskCodex', body: ['answer'] }));
  const component = renderToolCard(theme, 'answer', body, 'end', undefined, {
    isPartial: false,
    isError: false,
  });
  const lines = component.render(80);
  expect(lines).toEqual(['kit:80:end:completed', 'answer']);
  expect(component.render(80)).toEqual(lines);
  expect(body).toHaveBeenCalledTimes(1);
  expect(kit.card).toHaveBeenCalledTimes(1);
});

it.each([
  'invalidate',
  'width',
  'kit',
] as const)('rebuilds completed content after %s and then reuses the new lines', (change) => {
  const kit = installKit();
  const body = vi.fn(() => ({ title: 'AskCodex', body: ['answer'] }));
  const component = renderToolCard(theme, 'answer', body, 'end', undefined, {
    isPartial: false,
    isError: false,
  });
  component.render(80);
  let currentKit = kit;
  let width = 80;
  if (change === 'invalidate') component.invalidate();
  if (change === 'width') width = 60;
  if (change === 'kit') currentKit = installKit('replacement');
  const expected = [
    `${change === 'kit' ? 'replacement' : 'kit'}:${width}:end:completed`,
    'answer',
  ];
  expect(component.render(width)).toEqual(expected);
  expect(component.render(width)).toEqual(expected);
  expect(body).toHaveBeenCalledTimes(2);
  expect(currentKit.card).toHaveBeenCalledTimes(change === 'kit' ? 1 : 2);
});

it('notices kit withdrawal and incompatible versions, then restores kit rendering', () => {
  const kit = installKit();
  const component = renderToolCard(
    theme,
    'answer',
    () => ({ title: 'AskCodex', body: ['answer'] }),
    'end',
    undefined,
    { isPartial: false, isError: false },
  );
  const lines = component.render(30);
  withdrawRenderKit(registrations[0]);
  expect(component.render(30).join('\n')).toContain('answer');
  expect(component.render(30)).not.toEqual(lines);
  registrations.push(registerRenderKit(kit, {}));
  expect(component.render(30)).toEqual(lines);
  Object.assign(kit, { version: 2 });
  expect(component.render(30)).not.toEqual(lines);
  Object.assign(kit, { version: 1 });
  expect(component.render(30)).toEqual(lines);
  expect(kit.card).toHaveBeenCalledTimes(3);
});

it.each([
  'partial result',
  'in-progress call',
] as const)('does not cache live %s content', (kind) => {
  const kit = installKit();
  let text = 'first';
  const body = vi.fn(() => ({ title: 'AskCodex', body: [text] }));
  const component = renderToolCard(
    theme,
    () => text,
    body,
    kind === 'partial result' ? 'end' : 'start',
  );
  expect(component.render(80)).toContain('first');
  text = 'latest';
  expect(component.render(80)).toContain('latest');
  expect(body).toHaveBeenCalledTimes(2);
  expect(kit.card).toHaveBeenCalledTimes(2);
});

it('marks both restored successful card parts as success despite executionStarted being false', () => {
  const kit = installKit();
  const context = { state: {}, executionStarted: false, isPartial: false };
  const call = renderToolCard(theme, 'task', () => ({}), 'start', context);
  const result = renderToolCard(theme, 'answer', () => ({}), 'end', context);
  call.render(80);
  result.render(80);
  expect(vi.mocked(kit.card).mock.calls.map(([, options]) => options)).toEqual([
    expect.objectContaining({
      part: 'start',
      status: 'completed',
      isSuccess: true,
      isError: false,
    }),
    expect.objectContaining({
      part: 'end',
      status: 'completed',
      isSuccess: true,
      isError: false,
    }),
  ]);
});

it.each([
  {
    label: 'restored failure',
    isPartial: false,
    isError: true,
    status: 'failed' as const,
  },
  {
    label: 'partial result',
    isPartial: true,
    isError: false,
    status: 'running' as const,
  },
  {
    label: 'partial result with completed card status',
    isPartial: true,
    isError: false,
    status: 'completed' as const,
  },
])('does not mark either part of a $label as success', ({
  isPartial,
  isError,
  status,
}) => {
  const kit = installKit();
  const context = { state: {}, executionStarted: false, isPartial, isError };
  const call = renderToolCard(theme, 'task', () => ({}), 'start', context);
  const result = renderToolCard(
    theme,
    'answer',
    () => ({ status, isError }),
    'end',
    context,
  );
  call.render(80);
  result.render(80);
  expect(vi.mocked(kit.card).mock.calls.map(([, options]) => options)).toEqual([
    expect.objectContaining({ part: 'start', isSuccess: false, isError }),
    expect.objectContaining({ part: 'end', isSuccess: false, isError, status }),
  ]);
});

it('keeps a running call without a result neutral', () => {
  const kit = installKit();
  const component = renderToolCard(theme, 'task', () => ({}), 'start', {
    state: {},
    executionStarted: false,
    isPartial: false,
  });
  component.render(80);
  expect(kit.card).toHaveBeenCalledWith(
    theme,
    expect.objectContaining({
      part: 'full',
      status: 'running',
      isSuccess: false,
      isError: false,
    }),
    80,
  );
});

it('updates a mounted call shell when a partial result completes, then caches both parts', () => {
  const kit = installKit();
  const state = {};
  const callBody = vi.fn(() => ({ title: 'AskCodex', body: ['task'] }));
  const call = renderToolCard(theme, 'task', callBody, 'start', { state });
  expect(call.render(80)).toContain('kit:80:full:running');
  renderToolCard(theme, 'partial', () => ({}), 'end', {
    state,
    isPartial: true,
  });
  expect(call.render(80)).toContain('kit:80:start:running');
  const result = renderToolCard(
    theme,
    'answer',
    () => ({ body: ['answer'] }),
    'end',
    { state, isPartial: false },
  );
  expect(call.render(80)).toContain('kit:80:start:completed');
  expect(result.render(80)).toContain('kit:80:end:completed');
  call.render(80);
  result.render(80);
  expect(callBody).toHaveBeenCalledTimes(3);
  expect(kit.card).toHaveBeenCalledTimes(4);
});
