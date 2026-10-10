import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import {
  type RenderKitTheme,
  registerRenderKit,
  type SemanticIconName,
  withdrawRenderKit,
} from '@thoth-agents/pi-core';
import { panelVisibleWidth } from '@thoth-agents/pi-core/panel';
import { createTestRenderKit } from '@thoth-agents/pi-core/testing';
import { afterEach, expect, it, vi } from 'vitest';
import { labelColumn, panelStyle, renderChrome } from '../src/panels/chrome.js';
import { contextMeter } from '../src/panels/rows.js';
import { SidebarPanels } from '../src/panels/sidebar.js';
import type { WorkspaceSnapshot } from '../src/panels/workspace.js';

const MODES = {
  nerd: {
    model: '\u{f06a9}',
    folder: '\u{f07c}',
    branch: '\u{e0a0}',
    boxTopLeft: '╭',
    boxTopRight: '╮',
    boxBottomLeft: '╰',
    boxBottomRight: '╯',
    boxHorizontal: '─',
    boxVertical: '│',
    ellipsis: '…',
  },
  unicode: {
    model: '●',
    folder: 'dir',
    branch: '⑂',
    boxTopLeft: '╭',
    boxTopRight: '╮',
    boxBottomLeft: '╰',
    boxBottomRight: '╯',
    boxHorizontal: '─',
    boxVertical: '│',
    ellipsis: '…',
  },
  ascii: {
    model: '*',
    folder: 'dir',
    branch: 'git',
    boxTopLeft: '+',
    boxTopRight: '+',
    boxBottomLeft: '+',
    boxBottomRight: '+',
    boxHorizontal: '-',
    boxVertical: '|',
    ellipsis: '...',
  },
} as const;
type Mode = keyof typeof MODES;

const tokens: Array<() => void> = [];
afterEach(() => {
  for (const off of tokens.splice(0).reverse()) off();
  vi.useRealTimers();
});
function useMode(mode: Mode) {
  const table: Record<string, string> = MODES[mode];
  const token = registerRenderKit(
    createTestRenderKit({
      icon: (name: SemanticIconName) => table[name] ?? (name as string),
    }),
    {},
  );
  tokens.push(() => withdrawRenderKit(token));
}
const plain: RenderKitTheme = { fg: (_role, text) => text };
// Zero-width role markers, so truncation and padding behave as with real SGR.
const ROLES = [
  'accent',
  'mdLink',
  'mdCode',
  'success',
  'syntaxNumber',
  'warning',
  'muted',
  'error',
  'thinkingHigh',
  'thinkingOff',
  'thinkingXhigh',
  'toolDiffAdded',
  'toolDiffRemoved',
];
const on = (role: string) => `\x1b[38;5;${ROLES.indexOf(role) + 1}m`;
const styled: RenderKitTheme = {
  fg: (role, text) => `${on(role)}${text}\x1b[39m`,
  bold: (text) => `\x1b[1m${text}\x1b[22m`,
};
const tagged = (role: string, text: string) => `${on(role)}${text}\x1b[39m`;
// biome-ignore lint/suspicious/noControlCharactersInRegex: Strip terminal ANSI styling.
const SGR = /\x1b\[[\d;]*m/g;
const strip = (line: string) => line.replace(SGR, '');

function context(overrides: Record<string, unknown> = {}) {
  return {
    model: { id: 'claude-sonnet-5-5', provider: 'anthropic' },
    thinkingLevel: 'high',
    getContextUsage: () => ({ tokens: 55000, percent: 55, contextWindow: 1e5 }),
    sessionManager: { getEntries: () => [], getLeafId: () => null },
    ...overrides,
  } as unknown as ExtensionContext;
}
function panels(options: {
  ids?: string[];
  ctx?: ExtensionContext;
  theme?: RenderKitTheme;
  workspace?: WorkspaceSnapshot;
  subagentCost?: number;
  limits?: () => import('@thoth-agents/pi-core').ProviderLimitEntry[];
  usage?: number;
}) {
  const ctx = options.ctx ?? context();
  return new SidebarPanels({
    config: {
      startup: 'auto',
      panels: (options.ids ?? ['session', 'workspace']).map((id) => ({
        id,
        visible: true,
      })),
    },
    context: () => ctx,
    theme: options.theme ?? plain,
    thinking: () => 'off',
    subscriptionProviders: [],
    subagentCost: () => options.subagentCost ?? 0,
    limits: options.limits,
    workspace: () =>
      options.workspace ?? {
        cwd: '/home/dev/thoth-agents',
        branch: 'main',
        git: {
          state: 'modified',
          files: 3,
          added: 12,
          removed: 4,
          untracked: 2,
          binary: 1,
          conflicts: 0,
        },
      },
    home: '/home/dev',
    height: () => 40,
  });
}

it.each([
  ['nerd', 44],
  ['nerd', 30],
  ['unicode', 44],
  ['unicode', 30],
  ['ascii', 44],
  ['ascii', 30],
] as const)('renders aligned atelier chrome in %s at width %i', (mode, width) => {
  useMode(mode);
  const lines = panels({ subagentCost: 0.5 }).render(width);
  const text = lines.map(strip);
  for (const line of text)
    expect(panelVisibleWidth(line)).toBeLessThanOrEqual(width);
  const [tl, tr, bl, br, h, v] =
    mode === 'ascii'
      ? ['+', '+', '+', '+', '-', '|']
      : ['╭', '╮', '╰', '╯', '─', '│'];
  const model = MODES[mode].model;
  expect(text[0].startsWith(`${tl}${h} ${model} SESSION `)).toBe(true);
  expect(text[0].endsWith(tr)).toBe(true);
  const bottoms = text.filter((line) => line.startsWith(bl));
  expect(bottoms.filter((line) => /^[+╰]-*[─]*[+╯]$/.test(line))).toHaveLength(
    2,
  );
  expect(bottoms.every((line) => line.endsWith(br))).toBe(true);
  // Exactly one blank row between panels, exact width on every card row.
  const blank = text.indexOf('');
  expect(text[blank - 1].startsWith(bl)).toBe(true);
  expect(text[blank + 1]).toContain(`${MODES[mode].folder} WORKSPACE`);
  for (const line of text.filter((line) => line.startsWith(v)))
    expect(panelVisibleWidth(line)).toBe(width);
  expect(text.some((line) => /Model\s+claude/.test(line))).toBe(true);
  expect(text.join('\n')).toMatch(/Changed\s+3 files \+12 [-−]4/);
  if (mode === 'ascii') expect(text.join('\n')).not.toMatch(/[╭╮╰╯─│█▏−]/);
});

it('uses a 12-cell label column that shrinks to 9 below 28 columns', () => {
  expect(labelColumn(44)).toBe(12);
  expect(labelColumn(28)).toBe(12);
  expect(labelColumn(27)).toBe(9);
  const text = panels({}).render(44).map(strip);
  expect(text.find((line) => line.includes(' Model '))).toMatch(
    /^│ Model {7}\s+claude-sonnet-5-5 │$/,
  );
  const narrow = panels({}).render(26).map(strip);
  expect(narrow.find((line) => line.includes('Provider'))?.slice(2, 11)).toBe(
    'Provider ',
  );
});

it('truncates values with an ellipsis and keeps the tail of long paths', () => {
  useMode('unicode');
  const text = panels({
    workspace: {
      cwd: '/home/dev/projects/very/deeply/nested/thoth-agents',
      branch: 'feature/a-very-long-branch-name-for-testing',
    },
  })
    .render(30)
    .map(strip);
  const path = text.find((line) => line.includes('Path')) ?? '';
  expect(path).toMatch(/Path\s+….*thoth-agents │$/);
  expect(text.find((line) => line.includes('Branch'))).toContain('…');
  expect(panelVisibleWidth(path)).toBe(30);
});

it('wraps only the border in SGR dim and closes it without touching other styles', () => {
  const theme: RenderKitTheme = {
    fg: (role, text) => `\x1b[3${role === 'accent' ? 6 : 7}m${text}\x1b[39m`,
    bold: (text) => `\x1b[1m${text}\x1b[22m`,
  };
  const lines = renderChrome({
    id: 'session',
    title: 'Session',
    rows: ['x'],
    width: 20,
    height: 3,
    theme,
  });
  expect(lines[0]).toBe(
    `\x1b[2m\x1b[36m╭─ \x1b[39m\x1b[22m\x1b[36m\x1b[1m● SESSION\x1b[22m\x1b[39m\x1b[2m\x1b[36m ──────╮\x1b[39m\x1b[22m`,
  );
  for (const line of lines) {
    // Every dim opening is closed before any non-border text.
    const parts = line.split('\x1b[2m').slice(1);
    for (const part of parts) expect(part).toContain('\x1b[22m');
    // biome-ignore lint/suspicious/noControlCharactersInRegex: Remove dimmed spans.
    expect(line.replace(/\x1b\[2m.*?\x1b\[22m/gs, '')).not.toMatch(/[╭╮╰╯│]/);
  }
  expect(lines[1]).toContain('\x1b[2m\x1b[36m│\x1b[39m\x1b[22m x');
});

it('colors panels by role with bold uppercase titles and dim borders', () => {
  const lines = renderChrome({
    id: 'workspace',
    title: 'Workspace',
    summary: '3 files',
    rows: [],
    width: 40,
    height: 2,
    theme: styled,
  });
  expect(lines).toHaveLength(1);
  expect(lines[0]).toContain(`${on('mdLink')}\x1b[1mdir WORKSPACE`);
  expect(lines[0]).toContain(tagged('muted', '3 files'));
  expect(
    [
      'session',
      'workspace',
      'subagents',
      'todos',
      'background-tasks',
      'cost',
    ].map((id) => panelStyle(id).role),
  ).toEqual([
    'accent',
    'mdLink',
    'mdCode',
    'success',
    'syntaxNumber',
    'warning',
  ]);
});

it('draws the context meter with eighth blocks and colors by threshold', () => {
  expect(contextMeter(0, 10)).toBe('░'.repeat(10));
  expect(contextMeter(50, 10)).toBe('█████░░░░░');
  expect(contextMeter(55, 10)).toBe('█████▌░░░░');
  expect(contextMeter(100, 10)).toBe('█'.repeat(10));
  expect(contextMeter(5.6, 10)).toBe('▌░░░░░░░░░');
  const roleFor = (percent: number | null) => {
    const ctx = context({
      getContextUsage: () => ({
        tokens: percent == null ? null : 1,
        percent,
        contextWindow: 100,
      }),
    });
    const row =
      panels({ ctx, theme: styled })
        .render(44)
        .find((line) => line.includes('Context')) ?? '';
    const label = percent == null ? 'unknown' : `${percent}%`;
    return ['success', 'warning', 'error', 'muted'].find((role) =>
      row.includes(tagged(role, label)),
    );
  };
  expect(roleFor(70)).toBe('success');
  expect(roleFor(71)).toBe('warning');
  expect(roleFor(90)).toBe('warning');
  expect(roleFor(91)).toBe('error');
  expect(roleFor(null)).toBe('muted');
});

it('uses an ASCII meter in ASCII mode', () => {
  useMode('ascii');
  expect(contextMeter(30, 10)).toBe('###-------');
  const text = panels({}).render(44).map(strip).join('\n');
  expect(text).toMatch(/Context\s+#{6}-{4} 55%/);
});

it('colors thinking by thinking roles', () => {
  const row = (level: string) =>
    panels({ ctx: context({ thinkingLevel: level }), theme: styled })
      .render(44)
      .find((line) => line.includes('Thinking'));
  expect(row('high')).toContain(tagged('thinkingHigh', 'high'));
  expect(row('off')).toContain(tagged('thinkingOff', 'off'));
  expect(row('xhigh')).toContain(tagged('thinkingXhigh', 'xhigh'));
});

it('shows a Limit row only while an entry is warning or rejected', () => {
  let entries: import('@thoth-agents/pi-core').ProviderLimitEntry[] = [];
  const panel = panels({ limits: () => entries, theme: styled });
  const text = () => panel.render(44).join('\n');
  expect(text()).not.toContain('Limit');
  const base = {
    provider: 'anthropic',
    window: '5h',
    observedAt: 1,
    sessionId: 's',
  } as const;
  entries = [
    { ...base, status: 'allowed' },
    { ...base, window: '7d', status: 'allowed_warning', utilization: 0.87 },
  ];
  expect(text()).toContain(tagged('warning', '7d 87% · anthropic'));
  entries = [
    ...entries,
    { ...base, window: '5h', status: 'rejected', utilization: 1 },
  ];
  expect(text()).toContain(tagged('error', '5h blocked · anthropic'));
  entries = [{ ...base, status: 'allowed' }];
  expect(text()).not.toContain('Limit');
});

it('shows cost with subscription marker and subagent cost, and workspace extras only when non-zero', () => {
  const text = panels({
    ctx: context({
      sessionManager: {
        getEntries: () => [
          {
            type: 'message',
            message: { role: 'assistant', usage: { cost: { total: 1.25 } } },
          },
        ],
        getLeafId: () => 'x',
      },
    }),
    subagentCost: 0.75,
  })
    .render(44)
    .map(strip)
    .join('\n');
  expect(text).toMatch(/Cost\s+\$1\.250 \+\$0\.750/);
  expect(text).toMatch(/Path\s+~[\\/]thoth-agents/);
  expect(text).toMatch(/Branch\s+.*main/);
  expect(text).toMatch(/State\s+Modified/);
  expect(text).toMatch(/Untracked\s+2/);
  expect(text).toMatch(/Binary\s+1/);
  expect(text).not.toContain('Conflicts');
  const clean = panels({
    workspace: {
      cwd: '/home/dev',
      git: {
        state: 'clean',
        files: 0,
        untracked: 0,
        binary: 0,
        conflicts: 0,
      },
    },
  })
    .render(44)
    .map(strip)
    .join('\n');
  expect(clean).toMatch(/Path\s+~ /);
  expect(clean).toMatch(/State\s+Clean/);
  expect(clean).not.toMatch(/Changed|Untracked|Binary|Conflicts/);
  const conflict = panels({
    workspace: {
      cwd: '/x',
      git: {
        state: 'conflicts',
        files: 1,
        added: 0,
        removed: 0,
        untracked: 0,
        binary: 0,
        conflicts: 2,
      },
    },
  })
    .render(44)
    .map(strip)
    .join('\n');
  expect(conflict).toMatch(/State\s+Conflicts/);
  expect(conflict).toMatch(/Conflicts\s+2/);
  const missing = panels({
    workspace: { cwd: '/x', note: 'Not a git repository' },
  })
    .render(44)
    .map(strip)
    .join('\n');
  expect(missing).toMatch(/Git\s+Not a git repository/);
});

it('rebuilds cached output when the icon mode changes under the same kit identity', () => {
  let glyph = 'A';
  const token = registerRenderKit(
    createTestRenderKit({
      icon: (name) => (name === 'model' ? glyph : (name as string)),
    }),
    {},
  );
  tokens.push(() => withdrawRenderKit(token));
  const panel = panels({ ids: ['session'] });
  expect(panel.render(44)[0]).toContain('A SESSION');
  glyph = 'B';
  expect(panel.render(44)[0]).toContain('B SESSION');
});

it('keeps source panels rows unchanged inside the new chrome', async () => {
  const { registerWorkPanelProvider, WORK_PANEL_VERSION } = await import(
    '@thoth-agents/pi-core'
  );
  tokens.push(
    registerWorkPanelProvider(
      { on() {} } as never,
      {
        version: WORK_PANEL_VERSION,
        id: 'background-tasks',
        label: 'Background',
        priority: 30,
        visibleCount: () => 1,
        listRows: () => [{ id: 'one', primary: 'build', status: 'pending' }],
        detail: () => undefined,
        armCloseLabel: () => '',
        close() {},
      } as never,
    ),
  );
  const text = panels({ ids: ['background-tasks'], theme: styled }).render(44);
  expect(text[0]).toContain(on('syntaxNumber'));
  expect(text[0]).toContain('BACKGROUND');
  expect(text.join('\n')).toContain('build');
  expect(text.at(-1)).toContain('╰');
});
