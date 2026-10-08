import { registerRenderKit, withdrawRenderKit } from '@thoth-agents/pi-core';
import { createTestRenderKit } from '@thoth-agents/pi-core/testing';
import { expect, it, onTestFinished } from 'vitest';
import { createSubagentModelProfilesModal } from '../../src/model-profiles/command.js';
import { truncateToVisibleWidth } from '../../src/model-profiles/formatting.js';
import { truncateToWidth, visibleWidth } from '../../src/render/text-width.js';
import { textComponent } from '../../src/render/tools/components.js';
import type { SubagentTask } from '../../src/types.js';
import { renderSubagentWorkRow } from '../../src/ui/background-widget.js';
import { SubagentsHistoryPanel } from '../../src/ui/subagents-history-panel.js';
import { frameBox } from '../../src/ui/theme.js';

const theme = {
  fg: (_role: string, text: string) => text,
  bold: (text: string) => text,
};
const task: SubagentTask = {
  id: 'icons',
  agent: 'worker',
  mode: 'background',
  status: 'completed',
  created_at: '2026-01-01T00:00:00Z',
  ended_at: '2026-01-01T00:00:00Z',
  task: 'inspect '.repeat(40),
  result: 'literal · … response',
  usage: {
    input: 12,
    output: 34,
    turns: 1,
    cost: 0,
    contextTokens: 0,
    cacheRead: 0,
    cacheWrite: 0,
  },
};
function asciiKit(separator = '|') {
  return createTestRenderKit({
    icon: (name) =>
      new Map([
        ['separator', separator],
        ['ellipsis', '...'],
        ['tokensIn', '^'],
        ['tokensOut', 'v'],
        ['agent', '@'],
        ['arrowUp', '^'],
        ['arrowDown', 'v'],
        ['arrowLeft', '<'],
        ['arrowRight', '>'],
        ['scrollUp', '^'],
        ['scrollDown', 'v'],
        ['selection', '>'],
        ['selectionSelected', '*'],
        ['selectionUnselected', 'o'],
        ['separatorHeavy', '|'],
        ['boxTopLeft', '+'],
        ['boxTopRight', '+'],
        ['boxBottomLeft', '+'],
        ['boxBottomRight', '+'],
        ['boxVertical', '|'],
        ['boxHorizontal', '-'],
        ['warning', '!'],
      ]).get(name) ?? '',
  });
}

it('custom truncators reserve the entire resolved ellipsis and stay cell-bounded at tiny widths', () => {
  const token = registerRenderKit(asciiKit(), {});
  onTestFinished(() => withdrawRenderKit(token));
  expect(truncateToVisibleWidth('abcdefghij', 5)).toBe('ab...');
  expect(textComponent('abcdefghij').render(5)[0]).toContain('ab...');
  for (let width = 0; width < 12; width++) {
    expect(
      visibleWidth(truncateToVisibleWidth('abcdefghijklm', width)),
    ).toBeLessThanOrEqual(width);
    expect(
      textComponent('abcdefghijklm')
        .render(width)
        .every((line) => visibleWidth(line) <= width),
    ).toBe(true);
  }
});

it('work-row metrics use token icons and separators with bounded resolved ellipsis', () => {
  const token = registerRenderKit(asciiKit('::'), {});
  onTestFinished(() => withdrawRenderKit(token));
  expect(renderSubagentWorkRow(task, 200, 0).text).toContain(
    'tools ? :: ^12 v34',
  );
  for (let width = 0; width < 100; width++) {
    const row = renderSubagentWorkRow(
      { ...task, display_name: '日本語🚀'.repeat(30) },
      width,
      0,
    );
    expect(
      [row.text, ...(row.extraRows ?? [])].every(
        (line) => visibleWidth(line) <= width,
      ),
    ).toBe(true);
  }
});

it('work-row dropped-tools warnings resolve the semantic icon and keep the native fallback', () => {
  const warned = {
    ...task,
    status: 'running' as const,
    dropped_tools: ['missing_tool'],
  };
  const native = renderSubagentWorkRow(warned, 200, 0);
  expect(native.text).toContain('⚠ 1 dropped');
  const token = registerRenderKit(asciiKit(), {});
  onTestFinished(() => withdrawRenderKit(token));
  const themed = renderSubagentWorkRow(warned, 200, 0);
  expect(themed.text).toContain('! 1 dropped');
  expect(themed.segments).toContainEqual({
    text: ' | ! 1 dropped',
    role: 'warning',
  });
  expect(themed.text).not.toContain('⚠');
  withdrawRenderKit(token);
  expect(renderSubagentWorkRow(warned, 200, 0)).toEqual(native);
});

it('mounted history navigation, selection and scroll re-resolve while literal response text stays intact', () => {
  const panel = new SubagentsHistoryPanel(
    Array.from({ length: 9 }, (_, i) => ({
      ...task,
      id: `${i}`,
      display_name: `Worker ${i}`,
    })),
    theme,
    () => {},
    () => false,
    visibleWidth,
    truncateToWidth,
    {},
    25,
  );
  const native = panel.render(80);
  expect(native.join('\n')).toContain('●');
  expect(native.join('\n')).toContain('○');
  const token = registerRenderKit(asciiKit(), {});
  onTestFinished(() => withdrawRenderKit(token));
  const themed = panel.render(80).join('\n');
  expect(themed).toContain('@ subagents');
  expect(themed).toContain('</> select | ^/v scroll');
  expect(themed).toContain('^/v');
  expect(themed).toContain('1/9 | agent: worker | status: completed');
  expect(themed).not.toContain('┃');
  expect(themed).toContain('+- delegated task');
  expect(themed).toContain('* 1. Worker');
  expect(themed).toContain('o 2. Worker');
  expect(themed).not.toContain('●');
  expect(themed).not.toContain('○');
  expect(themed).toContain('literal · … response');
  for (const width of [40, 55, 80, 100, 160])
    expect(
      panel.render(width).every((line) => visibleWidth(line) <= width),
    ).toBe(true);
  withdrawRenderKit(token);
  expect(panel.render(80)).toEqual(native);
});

it('frame boxes resolve semantic borders at render time and restore native output', () => {
  const native = frameBox('test', ['body'], 20);
  expect(native).toEqual([
    '╭─ test ───────────╮',
    '│ body             │',
    '╰──────────────────╯',
  ]);
  const token = registerRenderKit(asciiKit(), {});
  onTestFinished(() => withdrawRenderKit(token));
  expect(frameBox('test', ['body'], 20)).toEqual([
    '+- test -----------+',
    '| body             |',
    '+------------------+',
  ]);
  withdrawRenderKit(token);
  expect(frameBox('test', ['body'], 20)).toEqual(native);
});

it('mounted model profiles resolve selection, separators, and navigation after kit changes', () => {
  const modal = createSubagentModelProfilesModal({
    rows: [
      {
        name: 'worker',
        description: 'inspect',
        modelLabel: 'current',
        effortLabel: 'current',
        explicitProfile: {},
      },
    ],
    theme,
    done: () => {},
  });
  const native = modal.render(160);
  const token = registerRenderKit(asciiKit(), {});
  onTestFinished(() => withdrawRenderKit(token));
  const themed = modal.render(160).join('\n');
  expect(themed).toContain('>');
  expect(modal.render(60).join('\n')).toContain('agent | model | effort');
  expect(themed).toContain('^/v/j/k move |');
  for (const width of [1, 5, 20, 40, 80, 160])
    expect(
      modal.render(width).every((line) => visibleWidth(line) <= width),
    ).toBe(true);
  withdrawRenderKit(token);
  expect(modal.render(160)).toEqual(native);
});

it('custom truncators measure a multi-cell resolved ellipsis rather than its character count', () => {
  const token = registerRenderKit(
    createTestRenderKit({
      icon: (name) => (name === 'ellipsis' ? '界..' : ''),
    }),
    {},
  );
  onTestFinished(() => withdrawRenderKit(token));
  expect(truncateToVisibleWidth('abcdefghij', 5)).toBe('a界..');
  for (let width = 1; width < 10; width++) {
    expect(
      visibleWidth(truncateToVisibleWidth('abcdefghijklm', width)),
    ).toBeLessThanOrEqual(width);
    expect(
      textComponent('abcdefghijklm')
        .render(width)
        .every((line) => visibleWidth(line) <= width),
    ).toBe(true);
  }
});

it('thread fallback argument previews resolve rendered ellipsis without changing snapshot payloads', () => {
  const snapshot: SubagentThreadSnapshot = {
    version: 1,
    source: 'events',
    items: [
      {
        type: 'tool',
        name: 'unregistered_icon_test',
        status: 'completed',
        arguments: { value: 'a'.repeat(300) },
      },
    ],
  };
  const payload = JSON.stringify(boundThreadSnapshot(snapshot));
  const render = () =>
    renderThreadBody(snapshot, {
      cwd: process.cwd(),
      visibleWidth,
      truncateToWidth,
      renderWidth: 400,
    }).join('\n');
  const native = render();
  expect(native).toContain('…');
  const token = registerRenderKit(asciiKit(), {});
  onTestFinished(() => withdrawRenderKit(token));
  expect(render()).toContain('...');
  expect(render()).not.toContain('…');
  expect(JSON.stringify(boundThreadSnapshot(snapshot))).toBe(payload);
  withdrawRenderKit(token);
  expect(render()).toBe(native);
});

import {
  boundThreadSnapshot,
  renderThreadBody,
} from '../../src/thread-view.js';
import type { SubagentThreadSnapshot } from '../../src/types.js';
