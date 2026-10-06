import { visibleWidth } from '@earendil-works/pi-tui';
import { registerRenderKit, withdrawRenderKit } from '@thoth-agents/pi-core';
import { createTestRenderKit } from '@thoth-agents/pi-core/testing';
import { expect, it } from 'vitest';
import { collapseNative, nativeRows } from './native.js';

it('native truncation measures the resolved ellipsis, including widths smaller than the marker', () => {
  expect(nativeRows(['abcdefghijkl'], 8).join('')).toContain('…');
  const token = registerRenderKit(
    createTestRenderKit({
      icon: (name) => (name === 'ellipsis' ? '...' : name),
    }),
    {},
  );
  try {
    expect(nativeRows(['abcdefghijkl'], 8).join('')).toContain('...');
    for (const width of [0, 1, 2, 3, 4, 8]) {
      expect(
        nativeRows(['abcdefghijkl'], width).every(
          (line) => visibleWidth(line) <= width,
        ),
      ).toBe(true);
    }
    expect(collapseNative(Array(10).fill('row'), false, {}).at(-1)).toContain(
      '... 2 more lines',
    );
  } finally {
    withdrawRenderKit(token);
  }
  expect(nativeRows(['abcdefghijkl'], 8).join('')).toContain('…');
});
