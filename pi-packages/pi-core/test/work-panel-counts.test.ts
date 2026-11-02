import { visibleWidth } from '@earendil-works/pi-tui';
import { afterEach, expect, it } from 'vitest';
import {
  formatCompactWorkCounts,
  registerRenderKit,
  withdrawRenderKit,
} from '../src/index.js';
import { createTestRenderKit } from '../src/testing.js';

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

const counts = {
  running: 1,
  queued: 2,
  completed: 30,
  failed: 1,
  cancelled: 1,
  total: 35,
};
const format = (
  overrides: Partial<Parameters<typeof formatCompactWorkCounts>[0]> = {},
) =>
  formatCompactWorkCounts({
    kind: 'work',
    summary: counts,
    width: 80,
    room: 60,
    measure: visibleWidth,
    ...overrides,
  });

it('exports the sidebar count order and whole-count semantic roles without a work denominator', () => {
  expect(format()).toEqual([
    { text: '◐1', role: 'accent' },
    { text: '○2', role: 'dim' },
    { text: '✓30', role: 'success' },
    { text: '✗1', role: 'error' },
    { text: '■1', role: 'muted' },
  ]);
});

it('renders Todos as a plain fraction, including zero, and otherwise keeps summary text', () => {
  expect(format({ kind: 'todos', summary: { completed: 0, total: 15 } })).toBe(
    '0/15',
  );
  expect(format({ kind: 'todos', summary: { completed: 12, total: 15 } })).toBe(
    '12/15',
  );
  expect(format({ kind: 'todos', summary: { completed: 1 } })).toBeUndefined();
  expect(
    format({ kind: 'other', summary: { text: 'Custom summary', running: 1 } }),
  ).toBe('Custom summary');
  expect(format({ summary: { text: 'Text only' } })).toBe('Text only');
  expect(format({ summary: undefined })).toBeUndefined();
});

it('omits nonpositive counts and queued below 36 columns, then drops cancelled before queued under pressure', () => {
  expect(
    format({ summary: { running: 0, queued: -1, completed: 2, failed: 0 } }),
  ).toEqual([{ text: '✓2', role: 'success' }]);
  expect(format({ summary: { running: 0, completed: 0, failed: 0 } })).toEqual(
    [],
  );
  expect(format({ width: 35 })).toEqual([
    { text: '◐1', role: 'accent' },
    { text: '✓30', role: 'success' },
    { text: '✗1', role: 'error' },
    { text: '■1', role: 'muted' },
  ]);
  expect(format({ width: 36, room: 12 })).toEqual([
    { text: '◐1', role: 'accent' },
    { text: '○2', role: 'dim' },
    { text: '✓30', role: 'success' },
    { text: '✗1', role: 'error' },
  ]);
  expect(format({ room: 9 })).toEqual([
    { text: '◐1', role: 'accent' },
    { text: '✓30', role: 'success' },
    { text: '✗1', role: 'error' },
  ]);
  expect(format({ summary: { cancelled: 1 }, room: 0 })).toEqual([]);
  expect(format({ summary: { running: 1 }, room: 0 })).toEqual([
    { text: '◐1', role: 'accent' },
  ]);
});

it.each([
  {
    mode: 'ASCII',
    glyphs: ['*', '~', '+', 'x', '#'],
    expected: ['*1', '~2', '+30', 'x1', '#1'],
  },
  {
    mode: 'Nerd',
    glyphs: ['◐', '\u{f051f}', '\u{f00c}', '\u{f00d}', '\u{f05e}'],
    expected: ['◐1', '\u{f051f}2', '\u{f00c}30', '\u{f00d}1', '\u{f05e}1'],
  },
])('uses $mode render-kit glyphs', ({ glyphs, expected }) => {
  const kit = createTestRenderKit();
  const statuses = ['running', 'queued', 'completed', 'failed', 'cancelled'];
  kit.statusGlyph = (_theme, status) => glyphs[statuses.indexOf(status)];
  const token = registerRenderKit(kit, {});
  cleanups.push(() => withdrawRenderKit(token));
  expect(format()).toEqual(
    expected.map((text, index) => ({
      text,
      role: ['accent', 'dim', 'success', 'error', 'muted'][index],
    })),
  );
});
