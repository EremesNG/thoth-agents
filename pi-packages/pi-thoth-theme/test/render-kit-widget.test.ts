import { visibleWidth } from '@earendil-works/pi-tui';
import { registerRenderKit, withdrawRenderKit } from '@thoth-agents/pi-core';
import { expect, it, vi } from 'vitest';
import type { SubagentTask } from '../../pi-subagents/src/types.js';
import {
  ClaudeBackgroundWidget,
  ClaudeBackgroundWidgetState,
} from '../../pi-subagents/src/ui/background-widget.js';
import { createRenderKit } from '../src/render-kit/index.ts';

const theme = { fg: (_role: string, text: string) => text };

it.each([
  46, 50,
])('preserves widget braille, complete metrics and mouse targets with the real adapter at width %i', (width) => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T00:00:02Z'));
  const tasks = [
    {
      id: 'first',
      agent: 'first',
      mode: 'background',
      status: 'running',
      task: 'work',
      created_at: '2026-01-01T00:00:02Z',
      started_at: '2026-01-01T00:00:00Z',
      runtime_metrics: {
        toolUses: 5,
        contextPercent: 62,
        generationMs: 4000,
        generationOutputTokens: 100,
      },
      usage: { input: 1000, output: 100 },
      last_activity: 'reading',
      dropped_tools: ['missing_tool'],
    },
    {
      id: 'second',
      agent: 'second',
      mode: 'background',
      status: 'running',
      task: 'work',
      created_at: '2026-01-01T00:00:01Z',
    },
  ] as SubagentTask[];
  const state = new ClaudeBackgroundWidgetState(() => tasks);
  const widget = new ClaudeBackgroundWidget(state, theme, { frame: 0 });
  const native = widget.render(width);
  const kit = createRenderKit({});
  const indicator = vi.spyOn(kit, 'indicator');
  const token = registerRenderKit(kit, {});
  try {
    const lines = widget.render(width);
    const next = new ClaudeBackgroundWidget(state, theme, { frame: 1 }).render(
      width,
    );
    expect(lines[1]).toContain('⠋');
    expect(next[1]).toContain('⠙');
    expect(next[1]).not.toBe(lines[1]);
    for (const metric of [
      'tools 5',
      '↑1.0k ↓100',
      '$?',
      'context 62.0%',
      '25 tok/s',
      'elapsed 2s',
    ]) {
      expect(lines.join('\n')).toContain(metric);
      expect(native.join('\n')).toContain(metric);
    }
    expect(lines.every((line) => visibleWidth(line) <= width)).toBe(true);
    // At 46 cells the narrower KIT content needs one additional metric row.
    expect(lines).toHaveLength(width === 46 ? 10 : 9);
    expect(native).toHaveLength(9);
    const secondRow = lines.findIndex((line) => line.includes('second · work'));
    expect(secondRow).toBe(width === 46 ? 7 : 6);
    for (let row = 1; row < lines.length; row++) {
      expect(state.handleMouseClick({ row })?.action).toEqual({
        type: 'open-task',
        taskId: row < secondRow ? 'first' : 'second',
      });
    }
    expect(vi.getTimerCount()).toBe(0);
    const indicatorCalls = indicator.mock.calls.length;
    tasks.forEach((task) => {
      task.status = 'completed';
    });
    expect(widget.render(width)).toEqual([]);
    expect(indicator).toHaveBeenCalledTimes(indicatorCalls);
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    withdrawRenderKit(token);
    indicator.mockRestore();
    vi.useRealTimers();
  }
});
