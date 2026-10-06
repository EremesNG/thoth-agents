import fs from 'node:fs';
import path from 'node:path';
import { Box } from '@earendil-works/pi-tui';
import {
  ensureWorkPanel,
  registerRenderKit,
  registerWorkPanelProvider,
  renderToolFooter,
  withdrawRenderKit,
} from '@thoth-agents/pi-core';
import { createTestRenderKit } from '@thoth-agents/pi-core/testing';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import extension from '../../index.js';
import { visibleWidth } from '../../src/render/text-width.js';
import { renderSubagentRunResult } from '../../src/render/tools/subagent-run.js';
import { createSubagentListAgentsTool } from '../../src/tools/subagent-list-agents.js';
import { registerSubagentTools } from '../../src/tools.js';
import type { SubagentTask } from '../../src/types.js';
import {
  themeAccent,
  themeDim,
  themeError,
  themeSuccess,
  themeTitle,
  themeWarning,
} from '../../src/ui/theme.js';
import { createSubagentsWorkPanelProvider } from '../../src/ui/work-panel-provider.js';
import { installSubagentTestEnv } from '../helpers/subagent-test-helpers.js';
import { workPanelSession } from '../helpers/work-panel-fixture.js';

const env = installSubagentTestEnv();
const theme = {
  fg: (_role: string, text: string) => text,
  bg: (role: string, text: string) => `\u001b]${role}\u0007${text}`,
  bold: (text: string) => text,
};

describe('render kit discovery', () => {
  it('switches a list result between one native SDK shell and the current KIT on the same component', () => {
    const tool = createSubagentListAgentsTool({} as any);
    const component = tool.renderResult({ details: { agents: [] } }, {}, theme);
    const native = component.render(80);
    const expected = new Box(1, 1, (text) => theme.bg('toolSuccessBg', text));
    expected.addChild({
      invalidate() {},
      render: () => ['󰣇 subagents', 'No subagents available.'],
    });
    expect(native).toEqual(expected.render(80));
    expect(tool.renderCall().render(80)).toEqual([]);
    expect(tool.renderShell).toBe('self');
    const token = registerRenderKit(createTestRenderKit(), {});
    try {
      expect(component.render(80)[0]).toBe('╭─ 󰣇 subagents');
      expect(component.render(80).at(-1)).toContain('╰─');
    } finally {
      withdrawRenderKit(token);
    }
    expect(component.render(80)).toEqual(native);
  });
});

describe('public subagent tool shells', () => {
  it.each(
    [
      { isPartial: true, isError: false, role: 'toolPendingBg' },
      { isPartial: false, isError: true, role: 'toolErrorBg' },
      { isPartial: false, isError: false, role: 'toolSuccessBg' },
      { isPartial: true, isError: true, role: 'toolPendingBg' },
    ].flatMap((state) =>
      [false, true].map((expanded) => ({ ...state, expanded })),
    ),
  )('renders all nine tools with one uniform $role shell and discovers KIT on every render', ({
    isPartial,
    isError,
    role,
    expanded,
  }) => {
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
    const task = {
      id: 't1',
      agent: 'worker',
      status: isPartial ? 'running' : isError ? 'failed' : 'completed',
      mode: 'task',
      result: 'response',
      model: 'provider/model',
      effort: 'high',
    };
    // SDK passes isError only in the render context, not in the result payload.
    const result = {
      content: [{ type: 'text', text: 'output' }],
      details: {
        task,
        tasks: [task],
        agents: [{ name: 'worker', tools: ['read'] }],
        task_id: 't1',
        message: 'steer',
        status: 'queued',
      },
    };
    for (const tool of tools) {
      const context = { isPartial, isError, state: {} };
      const call = tool.renderCall({}, theme, context);
      const component = tool.renderResult(
        result,
        { isPartial, expanded },
        theme,
        context,
      );
      const native = [...call.render(120), ...component.render(120)];
      const marker = `\u001b]${role}\u0007`;
      expect(native[0], tool.name).toBe(marker + ' '.repeat(120));
      expect(native.at(-1), tool.name).toBe(marker + ' '.repeat(120));
      // Expanded content may itself include deliberate blank separator rows.
      if (!expanded)
        expect(
          native.filter((line: string) => line === marker + ' '.repeat(120)),
          tool.name,
        ).toHaveLength(2);
      expect(
        native.every((line: string) => line.startsWith(marker)),
        tool.name,
      ).toBe(true);
      expect(native.join(''), tool.name).not.toContain('╭');
      const token = registerRenderKit(createTestRenderKit(), {});
      try {
        const themed = component.render(120);
        expect(themed[0], tool.name).toContain(isError ? '╭─ !' : '╭─');
        expect(themed.at(-1), tool.name).toContain('╰─');
        if (
          isPartial &&
          [
            'subagent_run',
            'subagent_continue',
            'subagent_status',
            'subagent_result',
          ].includes(tool.name)
        )
          expect(themed.join(''), tool.name).toContain('◐');
        expect(call.render(120), tool.name).toEqual([]);
      } finally {
        withdrawRenderKit(token);
      }
      expect(component.render(120), tool.name).toEqual(native);
    }
  });
});

describe('foreground tool cards with the core test KIT', () => {
  it('delegates live elapsed to the footer and preserves terminal status glyphs', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:05Z'));
    const kit = createTestRenderKit();
    kit.toolFooter = (renderTheme, options) =>
      renderToolFooter(undefined, renderTheme, options);
    const token = registerRenderKit(kit, {});
    const state = { startedAt: Date.parse('2026-01-01T00:00:00Z') };
    const task = {
      agent: 'thoth-worker',
      status: 'running',
      mode: 'task',
      started_at: '2026-01-01T00:00:00Z',
    };
    const context = { executionStarted: true, isPartial: true, state };
    try {
      const component = renderSubagentRunResult(
        { details: { task } },
        { isPartial: true },
        theme,
        context,
      );
      const initial = component.render(120);
      expect(initial[0]).toBe('╭─ ◐ subagent · thoth-worker · running');
      expect(initial[1]).toContain('◐ agent: thoth-worker');
      expect(initial.at(-1)).toBe('╰─ running · 5s');
      expect(initial.join('\n')).not.toContain('◇');
      vi.advanceTimersByTime(1000);
      component.invalidate();
      const next = component.render(120);
      expect(next[0]).toBe('╭─ ◐ subagent · thoth-worker · running');
      expect(next[1]).toContain('◐ agent: thoth-worker');
      expect(next.at(-1)).toBe('╰─ running · 6s');
      for (const [status, glyph, isError] of [
        ['completed', '✓', false],
        ['failed', '✗', true],
      ] as const) {
        const terminal = renderSubagentRunResult(
          { details: { task: { ...task, status } } },
          { isPartial: false },
          theme,
          { ...context, isPartial: false, isError },
        ).render(120);
        expect(terminal[0]).toContain(
          `${glyph} [subagent] thoth-worker · ${status}`,
        );
        expect(terminal.at(-1)).toBe(`╰─ ${glyph} · 6s`);
      }
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      withdrawRenderKit(token);
      vi.useRealTimers();
    }
  });
});

describe('background launch tool cards', () => {
  it.each(
    ['queued', 'running'].flatMap((status) =>
      [false, true].map((expanded) => ({ status, expanded })),
    ),
  )('finishes a successful $status launch with a success border (expanded: $expanded)', ({
    status,
    expanded,
  }) => {
    const result = {
      details: {
        mode: 'background',
        tasks: [{ agent: 'worker', status, mode: 'background' }],
      },
    };
    const kit = createTestRenderKit();
    const card = vi.spyOn(kit, 'card');
    const indicator = vi.spyOn(kit, 'indicator');
    const token = registerRenderKit(kit, {});
    try {
      const lines = renderSubagentRunResult(
        result,
        { expanded, isPartial: false },
        theme,
        { isPartial: false, isError: false, state: {} },
      ).render(120);
      expect(lines[0]).toContain('⤓ subagent · worker · launched (background)');
      expect(lines.join('\n')).toContain('status: launched');
      expect(lines.join('\n')).not.toContain('◐');
      expect(lines.at(-1)).toBe('╰─ ✓');
      expect(card).toHaveBeenCalledWith(
        theme,
        expect.objectContaining({
          status: 'completed',
          isSuccess: true,
          isError: false,
        }),
        120,
      );
      expect(indicator).toHaveBeenCalledWith(
        theme,
        expect.objectContaining({ isPartial: false, isError: false }),
        { status: 'completed' },
      );
      expect(result.details.tasks[0].status).toBe(status);
    } finally {
      withdrawRenderKit(token);
    }
  });

  it.each([
    { label: 'task mode', mode: 'background' },
    { label: 'effective mode', mode: 'task', effective_mode: 'background' },
    { label: 'result mode', resultMode: 'background' },
  ])('recognizes a background launch from $label', ({
    mode,
    effective_mode,
    resultMode,
  }) => {
    const kit = createTestRenderKit();
    const card = vi.spyOn(kit, 'card');
    const token = registerRenderKit(kit, {});
    try {
      const lines = renderSubagentRunResult(
        {
          details: {
            mode: resultMode,
            tasks: [
              { agent: 'worker', status: 'running', mode, effective_mode },
            ],
          },
        },
        {},
        theme,
      ).render(120);
      expect(lines[0]).toContain('⤓ subagent · worker · launched (background)');
      expect(card).toHaveBeenCalledWith(
        theme,
        expect.objectContaining({ status: 'completed', isSuccess: true }),
        120,
      );
    } finally {
      withdrawRenderKit(token);
    }
  });

  it.each([
    { status: 'completed', glyph: '✓', isError: false, isSuccess: true },
    { status: 'failed', glyph: '✗', isError: true, isSuccess: undefined },
    { status: 'cancelled', glyph: '✗', isError: true, isSuccess: undefined },
    { status: 'interrupted', glyph: '✓', isError: false, isSuccess: undefined },
  ])('preserves an already $status background snapshot', ({
    status,
    glyph,
    isError,
    isSuccess,
  }) => {
    const kit = createTestRenderKit();
    const card = vi.spyOn(kit, 'card');
    const token = registerRenderKit(kit, {});
    try {
      const lines = renderSubagentRunResult(
        {
          details: {
            mode: 'background',
            tasks: [{ agent: 'worker', status, mode: 'background' }],
          },
        },
        {},
        theme,
        { isError },
      ).render(120);
      expect(lines.join('\n')).toContain(`status: ${status}`);
      expect(lines.join('\n')).not.toContain('launched');
      expect(lines.at(-1)).toBe(`╰─ ${glyph}`);
      expect(card).toHaveBeenCalledWith(
        theme,
        expect.objectContaining({
          status: isError ? 'failed' : 'completed',
          isSuccess,
          isError,
        }),
        120,
      );
    } finally {
      withdrawRenderKit(token);
    }
  });

  it.each([
    {
      label: 'result error',
      resultError: true,
      contextError: undefined,
      status: undefined,
      footer: '✗',
    },
    {
      label: 'SDK context error and running snapshot',
      resultError: undefined,
      contextError: true,
      status: 'running',
      footer: '✗',
    },
    {
      label: 'result error and queued snapshot',
      resultError: true,
      contextError: undefined,
      status: 'queued',
      footer: '✗',
    },
  ])('does not mark a failed launch successful with a $label', ({
    resultError,
    contextError,
    status,
    footer,
  }) => {
    const kit = createTestRenderKit();
    const card = vi.spyOn(kit, 'card');
    const token = registerRenderKit(kit, {});
    try {
      const lines = renderSubagentRunResult(
        {
          isError: resultError,
          content: [{ type: 'text', text: 'Launch failed' }],
          details: {
            mode: 'background',
            task: status
              ? { agent: 'worker', status, error: 'Launch failed' }
              : undefined,
          },
        },
        {},
        theme,
        { isError: contextError },
      ).render(120);
      expect(lines[0]).toContain('╭─ !');
      expect(lines.join('\n')).toContain(`status: ${status ?? 'failed'}`);
      expect(lines.join('\n')).toContain('Launch failed');
      expect(lines.join('\n')).not.toContain('launched');
      expect(lines.at(-1)).toBe(`╰─ ${footer}`);
      expect(card).toHaveBeenCalledWith(
        theme,
        expect.objectContaining({
          status: 'failed',
          footer,
          isError: true,
          isSuccess: undefined,
        }),
        120,
      );
    } finally {
      withdrawRenderKit(token);
    }
  });
});

describe('message render kit discovery', () => {
  it.each([
    'subagent-completion',
    'subagent-question',
  ])('switches %s on re-render without changing its native frame or content', (type) => {
    const renderers: Record<string, any> = {};
    extension({
      registerTool() {},
      registerCommand() {},
      registerShortcut() {},
      registerMessageRenderer: (name: string, render: any) => {
        renderers[name] = render;
      },
    });
    const message = {
      details: {
        task: { agent: 'worker', status: 'completed', result: 'answer' },
        full_result: 'answer',
        agent: 'worker',
        question: 'Which scope?',
        task_id: 't1',
        request_id: 'q1',
      },
    };
    for (const expanded of [true, false]) {
      const component = renderers[type](message, { expanded }, theme);
      const native = component.render(120);
      expect(native[0]).toContain('╭');
      expect(native.join('')).not.toContain('toolSuccessBg');
      const kit = createTestRenderKit();
      const card = kit.card;
      kit.card = (renderTheme, options, width) =>
        card(renderTheme, { ...options, title: `KIT ${options.title}` }, width);
      const token = registerRenderKit(kit, {});
      try {
        const themed = component.render(120).join('\n');
        expect(themed).toContain('╭─ KIT');
        expect(themed).toContain(
          expanded
            ? type === 'subagent-question'
              ? 'Which scope?'
              : 'answer'
            : 'ctrl+o to expand',
        );
      } finally {
        withdrawRenderKit(token);
      }
      expect(component.render(120)).toEqual(native);
    }
  });
});

describe('Agents work-panel render kit discovery', () => {
  it.each([
    100, 80, 50, 35, 24,
  ])('preserves compact metrics at width %i when the KIT is installed and withdrawn', async (width) => {
    const clock = vi
      .spyOn(Date, 'now')
      .mockReturnValue(Date.parse('2026-01-01T00:00:12Z'));
    const fixture = workPanelSession(env.tmp);
    const task: SubagentTask = {
      id: 'agent',
      agent: 'worker',
      mode: 'background',
      status: 'running',
      task: 'A very long delegated task label that must not displace metrics',
      model: 'provider/a-very-long-model-name',
      created_at: '2026-01-01T00:00:00Z',
      started_at: '2026-01-01T00:00:00Z',
      usage: { input: 20000, output: 10000 } as SubagentTask['usage'],
      runtime_metrics: {
        toolUses: 5,
        contextPercent: 62,
        generationOutputTokens: 300,
        generationMs: 4000,
      },
    };
    const unregister = registerWorkPanelProvider(
      fixture.ctx as any,
      createSubagentsWorkPanelProvider({
        listTasks: () => [task],
        onTaskUpdate: () => () => {},
        cancel: () => {},
        open: async () => {},
      }),
    );
    const release = await ensureWorkPanel(fixture.ctx as any);
    const metrics = [
      'tools 5',
      '↑20k ↓10k',
      'ctx 62.0%',
      '75 tok/s',
      'elapsed 12s',
    ];
    const native = fixture.render(width);
    const kit = createTestRenderKit();
    const heading = vi.spyOn(kit, 'widgetHeading');
    const tree = vi.spyOn(kit, 'treeRow');
    const token = registerRenderKit(kit, {});
    try {
      const lines = fixture.render(width);
      expect(heading).toHaveBeenCalled();
      expect(tree).toHaveBeenCalled();
      for (const output of [native, lines]) {
        expect(output.join(' ')).toContain('⠋');
        for (const metric of metrics)
          expect(output.join(' ')).toContain(metric);
        expect(
          output.every((line: string) => visibleWidth(line) <= width),
        ).toBe(true);
        if (width >= 80) expect(output).toHaveLength(3);
        expect(output.at(-1)).toBe('← interact');
      }
    } finally {
      withdrawRenderKit(token);
      expect(fixture.render(width)).toEqual(native);
      release();
      unregister();
      clock.mockRestore();
    }
  });
});

describe('theme roles', () => {
  it('has plain legible fallback without ANSI colors and uses KIT role styling when available', () => {
    const roles = [
      themeAccent,
      themeDim,
      themeError,
      themeSuccess,
      themeTitle,
      themeWarning,
    ];
    expect(roles.map((style) => style({}, 'label'))).toEqual(
      Array(6).fill('label'),
    );
    const kit = createTestRenderKit();
    const fg = vi.spyOn(kit, 'fg');
    const token = registerRenderKit(kit, {});
    try {
      for (const style of roles) style(theme, 'label');
      expect(fg).toHaveBeenCalledTimes(6);
    } finally {
      withdrawRenderKit(token);
    }
  });
});

it('replaces only generated working prefixes, not braille in the task activity', () => {
  const component = renderSubagentRunResult(
    {
      details: {
        task: {
          agent: 'worker',
          status: 'running',
          mode: 'task',
          last_activity: 'keep ⠋ verbatim',
        },
      },
    },
    { isPartial: true },
    theme,
  );
  const token = registerRenderKit(createTestRenderKit(), {});
  try {
    const lines = component.render(120);
    expect(lines[0]).toContain('◐ subagent');
    expect(lines.join('')).toContain('◐ agent: worker');
    expect(lines.join('')).toContain('keep ⠋ verbatim');
  } finally {
    withdrawRenderKit(token);
  }
});

it('keeps compact task precedence in visible content and tool completion in the KIT footer', () => {
  const result = {
    details: {
      results: [{ agent: 'worker', status: 'running', mode: 'task' }],
      task: { agent: 'stale', status: 'completed' },
    },
  };
  const component = renderSubagentRunResult(result, {}, theme);
  const token = registerRenderKit(createTestRenderKit(), {});
  try {
    const lines = component.render(120);
    expect(lines[0]).toContain('⠋ subagent · worker · running');
    expect(lines.at(-1)).toBe('╰─ ✓');
  } finally {
    withdrawRenderKit(token);
  }
});
