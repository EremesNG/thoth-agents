import {
  initTheme,
  ToolExecutionComponent,
} from '@earendil-works/pi-coding-agent';
import { Text, visibleWidth } from '@earendil-works/pi-tui';
import {
  type RenderKitToken,
  registerRenderKit,
  withdrawRenderKit,
} from '@thoth-agents/pi-core';
import { createTestRenderKit } from '@thoth-agents/pi-core/testing';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { registerTools } from '../tools.js';
import {
  backgroundToolRenderers,
  renderBackgroundTaskLogDisplay,
} from './tools.js';

const TOOL_NAMES = [
  'bg_task_spawn',
  'bg_task_watch',
  'bg_task_list',
  'bg_task_status',
  'bg_task_log',
  'bg_task_stop',
  'bg_task',
  'bg_status',
];
const ARGS: Record<string, Record<string, unknown>> = {
  bg_task_spawn: { name: 'build', command: 'pnpm build' },
  bg_task_watch: { command: 'gh pr checks' },
  bg_task_list: { all: true },
  bg_task_status: { id: 'bg_abc' },
  bg_task_log: { id: 'bg_abc' },
  bg_task_stop: { id: 'bg_abc' },
  bg_task: { action: 'clear', id: 'bg_abc' },
  bg_status: { action: 'status', id: 'bg_abc' },
};

const tools: Record<string, any> = {};
let token: RenderKitToken | undefined;
afterEach(() => {
  if (token) withdrawRenderKit(token);
  token = undefined;
});
// biome-ignore lint/suspicious/noControlCharactersInRegex: Strip terminal ANSI styling.
const ansi = /\u001b\[[0-9;]*m/g;
const strip = (lines: string[]) => lines.join('\n').replace(ansi, '');

function compose(
  name: string,
  text: string,
  opts: { expanded?: boolean; isError?: boolean; details?: unknown } = {},
) {
  const component = new ToolExecutionComponent(
    name,
    'tc',
    ARGS[name],
    {},
    tools[name],
    { requestRender() {} } as any,
    '/tmp',
  );
  component.setExpanded(opts.expanded === true);
  component.updateResult(
    {
      content: [{ type: 'text', text }],
      details: opts.details,
      isError: opts.isError === true,
    },
    false,
  );
  return component;
}

beforeAll(() => {
  initTheme('dark');
  registerTools({
    on() {},
    registerTool(tool: any) {
      tools[tool.name] = tool;
    },
  } as any);
});

describe('native tool shells', () => {
  for (const name of TOOL_NAMES) {
    it(`${name} matches the SDK default padded box for pending, success and error`, () => {
      const summary = Object.values(ARGS[name])
        .map((value) => (value === true ? 'all' : value))
        .join(' · ');
      const nativeDefinition = {
        renderCall: () => new Text(`${name} ${summary}`, 0, 0),
        renderResult: () => new Text('native output', 0, 0),
      };
      const actual = new ToolExecutionComponent(
        name,
        'tc',
        ARGS[name],
        {},
        tools[name],
        { requestRender() {} } as any,
        '/tmp',
      );
      const expected = new ToolExecutionComponent(
        name,
        'tc',
        ARGS[name],
        {},
        nativeDefinition as any,
        { requestRender() {} } as any,
        '/tmp',
      );
      expect(actual.render(80)).toEqual(expected.render(80));
      for (const [isPartial, isError] of [
        [true, false],
        [true, true],
        [false, false],
        [false, true],
      ]) {
        const result = {
          content: [{ type: 'text' as const, text: 'native output' }],
          details: {},
          isError,
        };
        actual.updateResult(result, isPartial);
        expected.updateResult(result, isPartial);
        const lines = actual.render(80);
        expect(lines).toEqual(expected.render(80));
        // SDK spacer + exactly one top row, call, result, and one bottom row.
        expect(lines).toHaveLength(5);
        expect(strip([lines[1]])).toBe(' '.repeat(80));
        expect(strip([lines[4]])).toBe(' '.repeat(80));
      }
    });
  }
});

it.each([
  { slot: 'call', expanded: false },
  { slot: 'result', expanded: false },
  { slot: 'result', expanded: true },
  { slot: 'compact-result', expanded: false },
  { slot: 'compact-result', expanded: true },
])('reuses $slot KIT output (expanded=$expanded), including the per-instance expand hint', ({
  slot,
  expanded,
}) => {
  const theme = {
    fg: (_role: string, text: string) => text,
    bold: (text: string) => text,
  };
  const getKeys = vi.fn(() => ['alt+o']);
  const context = { state: {}, isPartial: false, keybindings: { getKeys } };
  const result = {
    content: [{ type: 'text', text: 'full log' }],
    details:
      slot === 'compact-result'
        ? {
            kind: 'background-task-log-display',
            head: '[log] bg_abc',
            fullLineCount: 20,
            compactLines: ['tail'],
            foldedLineCount: 15,
          }
        : undefined,
  };
  const create = () =>
    slot === 'call'
      ? backgroundToolRenderers('bg_task_log').renderCall(
          { id: 'bg_abc' },
          theme,
          context,
        )
      : renderBackgroundTaskLogDisplay(result, { expanded }, theme, context);
  const component = create();
  const native = component.render(100);
  getKeys.mockClear();
  const kit = createTestRenderKit();
  const card = vi.spyOn(kit, 'card');
  token = registerRenderKit(kit, {});
  const lines = component.render(100);
  const body =
    slot === 'compact-result'
      ? expanded
        ? ['20 lines', 'Full displayed log.', '', 'full log']
        : [
            '20 lines',
            '[log] bg_abc',
            '',
            'preview',
            'tail',
            'Folded 15 display lines (alt+o to expand).',
          ]
      : ['full log'];
  expect(lines).toEqual(
    slot === 'call'
      ? ['╭─ bg_task_log bg_abc', 'completed']
      : [...body, '╰─ completed · completed'],
  );
  expect(component.render(100)).toBe(lines);
  expect(card).toHaveBeenCalledTimes(1);
  expect(getKeys).toHaveBeenCalledTimes(slot === 'call' ? 0 : 1);
  component.render(40);
  expect(card).toHaveBeenCalledTimes(2);
  component.invalidate();
  component.render(40);
  expect(card).toHaveBeenCalledTimes(3);
  expect(component.render(100)).toEqual(lines);
  expect(card).toHaveBeenCalledTimes(4);
  expect(getKeys).toHaveBeenCalledTimes(slot === 'call' ? 0 : 4);
  expect(create().render(100)).toEqual(lines);
  expect(card).toHaveBeenCalledTimes(5);

  const replacement = createTestRenderKit();
  const replacementCard = vi.spyOn(replacement, 'card');
  token = registerRenderKit(replacement, {});
  expect(component.render(100)).toEqual(lines);
  expect(component.render(100)).toEqual(lines);
  expect(replacementCard).toHaveBeenCalledTimes(1);
  withdrawRenderKit(token);
  expect(component.render(100)).toEqual(native);
  component.invalidate();
  expect(component.render(100)).toEqual(native);
  token = registerRenderKit(kit, {});
  expect(component.render(100)).toEqual(lines);
  expect(card).toHaveBeenCalledTimes(6);
});

it.each([
  {
    isPartial: false,
    executionStarted: true,
    completed: true,
    status: 'completed',
  },
  {
    isPartial: true,
    executionStarted: true,
    completed: false,
    status: 'running',
  },
  {
    isPartial: true,
    executionStarted: false,
    completed: false,
    status: 'running',
  },
  {
    isPartial: false,
    executionStarted: false,
    completed: false,
    status: 'completed',
  },
  {
    isPartial: false,
    executionStarted: true,
    isError: true,
    completed: false,
    status: 'failed',
  },
  {
    isPartial: true,
    executionStarted: true,
    isError: true,
    completed: false,
    status: 'running',
  },
])('preserves the background-tool footer while signaling success on both parts (%j)', ({
  isPartial,
  executionStarted,
  isError = false,
  completed,
  status,
}) => {
  const kit = createTestRenderKit();
  const card = vi.spyOn(kit, 'card');
  token = registerRenderKit(kit, {});
  const context = { state: {}, isPartial, executionStarted, isError };
  const renderers = backgroundToolRenderers('bg_task_log');
  const call = renderers.renderCall({ id: 'bg_abc' }, {}, context);
  const result = renderers.renderResult(
    { content: [{ type: 'text', text: 'log' }] },
    { expanded: false, isPartial },
    {},
    context,
  );
  call.render(80);
  expect(result.render(80).at(-1)).toBe(`╰─ ${status} · ${status}`);
  expect(card.mock.calls.map(([, options]) => options.part)).toEqual([
    'start',
    'end',
  ]);
  for (const [, options] of card.mock.calls) {
    expect(options.isSuccess).toBe(completed);
    expect(options.isError).toBe(isError);
  }
  expect(card.mock.calls[0][1].status).toBeUndefined();
  expect(card.mock.calls[1][1].status).toBe(status);
  expect(card.mock.calls[1][1].footer).toBe(status);
});

it('does not infer background-tool success before a result exists', () => {
  const kit = createTestRenderKit();
  const card = vi.spyOn(kit, 'card');
  token = registerRenderKit(kit, {});
  const renderers = backgroundToolRenderers('bg_task_log');
  renderers.renderCall({}, {}, { state: {}, isPartial: false }).render(80);
  renderers.renderCall({}, {}).render(80);
  for (const [, options] of card.mock.calls) {
    expect(options.status).not.toBe('completed');
    expect(options.isSuccess).not.toBe(true);
  }
});

describe('KIT tool renderers', () => {
  beforeEach(() => {
    token = registerRenderKit(createTestRenderKit(), {});
  });

  it('shows a working indicator before a result exists', () => {
    const component = new ToolExecutionComponent(
      'bg_task_spawn',
      'tc',
      ARGS.bg_task_spawn,
      {},
      tools.bg_task_spawn,
      { requestRender() {} } as any,
      '/tmp',
    );
    component.markExecutionStarted();
    expect(strip(component.render(80))).toContain('running');
  });
  it('registers self-shell renderers on all eight tools', () => {
    for (const name of TOOL_NAMES) {
      expect(tools[name].renderShell).toBe('self');
      expect(typeof tools[name].renderCall).toBe('function');
      expect(typeof tools[name].renderResult).toBe('function');
    }
  });

  for (const name of TOOL_NAMES) {
    describe(name, () => {
      const body = Array.from(
        { length: 12 },
        (_, index) => `row-${index + 1} 日本語`,
      ).join('\n');

      it('switches the same mounted component between KIT and native without invalidation', () => {
        const component = compose(name, body);
        const framed = strip(component.render(80));
        expect((framed.match(/╭/g) ?? []).length).toBe(1);
        expect((framed.match(/╰/g) ?? []).length).toBe(1);
        expect(framed).toContain('completed');
        if (token) withdrawRenderKit(token);
        const native = strip(component.render(80));
        expect(native).not.toMatch(/[╭╰│]/);
        expect(native).toContain('row-8');
        expect(native).not.toContain('row-9');
        token = registerRenderKit(createTestRenderKit(), {});
        expect(strip(component.render(80))).toBe(framed);
      });

      it('draws one frame with title, arg summary, collapsed body and expand hint', () => {
        const text = strip(compose(name, body).render(80));
        expect(text).toContain(name);
        expect((text.match(/╭/g) ?? []).length).toBe(1);
        expect((text.match(/╰/g) ?? []).length).toBe(1);
        expect(text).toContain('row-8');
        expect(text).not.toContain('row-9');
        expect(text).toContain('to expand');
      });

      it('shows the full body when expanded', () => {
        const text = strip(compose(name, body, { expanded: true }).render(80));
        expect(text).toContain('row-12');
        expect(text).not.toContain('to expand');
      });

      it('styles errors and keeps a single frame', () => {
        const lines = compose(name, 'boom', { isError: true }).render(80);
        expect(lines.join('\n')).toContain('boom');
        expect((strip(lines).match(/╭/g) ?? []).length).toBe(1);
        expect(strip(lines)).toContain('╭─ !');
        expect(strip(lines)).toContain('failed');
      });

      it('never exceeds width and is empty at width 0', () => {
        expect(compose(name, body).render(0)).toEqual([]);
        for (const width of [1, 40, 80]) {
          for (const expanded of [false, true]) {
            for (const line of compose(name, body, { expanded }).render(
              width,
            )) {
              expect(visibleWidth(line)).toBeLessThanOrEqual(width);
            }
          }
        }
      });
    });
  }

  it('summarizes call arguments on one line', () => {
    const text = strip(compose('bg_task', 'ok').render(80));
    expect(text).toMatch(/bg_task.*clear.*bg_abc/);
    expect(strip(compose('bg_task_spawn', 'ok').render(80))).toMatch(
      /bg_task_spawn.*build.*pnpm build/,
    );
  });

  it('keeps the compact log preview inside the frame', () => {
    const details = {
      kind: 'background-task-log-display',
      head: '[log] bg_abc',
      fullLineCount: 20,
      compactLines: ['tail-a', 'tail-b'],
      foldedLineCount: 15,
    };
    const collapsed = strip(
      compose(
        'bg_task_log',
        Array.from({ length: 20 }, (_, i) => `full-${i}`).join('\n'),
        { details },
      ).render(80),
    );
    expect(collapsed).toContain('tail-b');
    expect(collapsed).toContain('Folded 15 display lines');
    expect(collapsed).not.toContain('full-19');
    const expanded = strip(
      compose(
        'bg_task_log',
        Array.from({ length: 20 }, (_, i) => `full-${i}`).join('\n'),
        { details, expanded: true },
      ).render(80),
    );
    expect(expanded).toContain('full-19');
  });
});
