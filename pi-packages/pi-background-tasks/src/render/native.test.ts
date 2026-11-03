import { visibleWidth } from '@earendil-works/pi-tui';
import { registerRenderKit, withdrawRenderKit } from '@thoth-agents/pi-core';
import { createTestRenderKit } from '@thoth-agents/pi-core/testing';
import { expect, it, onTestFinished } from 'vitest';
import { renderBackgroundMessage } from './messages.js';
import { renderBackgroundTaskLogDisplay } from './tools.js';
import { collapseNative, nativeRows } from './native.js';

it.each([false, true])('native cards use injected custom bindings and omit unbound instructions with KIT=%s', (withKit) => {
  if (withKit) {
    const token = registerRenderKit(createTestRenderKit(), {});
    onTestFinished(() => withdrawRenderKit(token));
  }
  const message = { details: { kind: 'batch', entries: [{ id: 'job', label: 'job', status: 'completed' }], omitted: 0, unlisted: 0 } };
  for (const key of ['ctrl+e/alt+e', '']) {
    const keyText = (action: string) => action === 'app.tools.expand' ? key : '';
    const components = [
      renderBackgroundTaskLogDisplay({ content: [{ type: 'text', text: Array(12).fill('row').join('\n') }] }, {}, {}, { keyText }),
      renderBackgroundMessage(message, { keyText }),
    ];
    for (const component of components) {
      const text = component.render(120).join('\n');
      if (key) expect(text).toContain('ctrl+e/alt+e to expand');
      else {
        expect(text).not.toContain('to expand');
        expect(text).not.toContain('ctrl+o');
        expect(text).not.toContain('()');
      }
      for (const width of [0, 1, 9, 20, 120]) {
        expect(component.render(width).every((row) => visibleWidth(row) <= width)).toBe(true);
      }
    }
  }
});

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
