import type { Component } from '@earendil-works/pi-tui';
import { truncateToWidth, visibleWidth } from '@earendil-works/pi-tui';
import {
  type RenderKitToken,
  registerRenderKit,
  withdrawRenderKit,
} from '@thoth-agents/pi-core';
import { createTestRenderKit } from '@thoth-agents/pi-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type BackgroundWorkProvider,
  type BackgroundWorkRow,
  createBackgroundWorkNavigator,
  MAIN_LIST_WIDGET_KEY,
} from './shared-navigator.js';

let token: RenderKitToken | undefined;
afterEach(() => {
  if (token) withdrawRenderKit(token);
  token = undefined;
});

function mountNavigator() {
  const navigator = createBackgroundWorkNavigator();
  let widgetFactory: ((tui: unknown, theme: unknown) => Component) | undefined;
  let editorFactory:
    | ((tui: unknown, theme: unknown, keys: unknown) => any)
    | undefined;
  const rows: BackgroundWorkRow[] = [
    {
      providerId: 'test',
      id: 'build',
      name: 'build',
      status: 'running',
      statusTone: 'running',
      kind: 'process',
      elapsed: '12s',
      primary: 'pnpm build',
      sortStartedAt: 2,
    },
    {
      providerId: 'test',
      id: 'deploy',
      name: 'deploy',
      status: 'failed',
      statusTone: 'failed',
      kind: 'process',
      elapsed: '14s',
      primary: 'pnpm deploy',
      sortStartedAt: 1,
    },
  ];
  const provider: BackgroundWorkProvider = {
    id: 'test',
    label: 'Background Tasks',
    priority: 20,
    visibleCount: () => rows.length,
    listRows: () => rows,
    detail: (id) => ({
      providerId: 'test',
      id,
      title: id,
      status: 'failed',
      statusTone: 'failed',
      metadata: [],
      evidence: { label: 'log', text: 'detail output' },
    }),
    armCloseLabel: () => 'x again to stop',
    close: vi.fn((id) => {
      rows.splice(
        rows.findIndex((row) => row.id === id),
        1,
      );
      return { providerId: 'test', id, action: 'stopped' };
    }),
  };
  const theme = { fg: (_role: string, text: string) => text };
  const ui = {
    theme,
    setStatus: vi.fn(),
    setWidget(key: string, value: unknown) {
      if (key === MAIN_LIST_WIDGET_KEY)
        widgetFactory = value as typeof widgetFactory;
    },
    getEditorComponent() {},
    setEditorComponent(factory: typeof editorFactory) {
      editorFactory = factory;
    },
    custom: vi.fn(() => Promise.resolve(null)),
  };
  navigator.registerBackgroundWorkProvider(provider);
  navigator.ensureBackgroundWorkNavigator(
    { mode: 'tui', hasUI: true, ui } as any,
    {
      createDefaultEditor: () => ({
        getText: () => '',
        handleInput: vi.fn(),
        render: () => ['editor'],
        invalidate() {},
      }),
      isOpenTrigger: (data) => data === 'left',
      matchKey: (data, key) => data === key,
      truncate: truncateToWidth,
    },
  );
  if (!widgetFactory || !editorFactory)
    throw new Error('Navigator UI was not installed');
  const widget = widgetFactory({ requestRender() {} }, theme);
  const editor = editorFactory({}, theme, {});
  return { navigator, widget, editor, provider, ui };
}

describe('background-work-list', () => {
  it('discovers KIT per widget render and preserves native rows when withdrawn', () => {
    const { navigator, widget } = mountNavigator();
    try {
      const native = widget.render(100).join('\n');
      expect(native).toContain('background tasks');
      expect(native).toContain('●');
      expect(native).toContain('12s');
      expect(native).not.toContain('├─');
      token = registerRenderKit(createTestRenderKit(), {});
      const themed = widget.render(100).join('\n');
      expect(themed).toContain('background tasks (0/2)');
      expect(themed).toContain('├─ ◐ build');
      expect(themed).toContain('└─ ✗ deploy');
      expect(themed).toContain('12s');
      withdrawRenderKit(token);
      expect(widget.render(100).join('\n')).toBe(native);
    } finally {
      navigator.disposeBackgroundWorkNavigator();
    }
  });

  it.each([
    false,
    true,
  ])('keeps focus, arrow selection, detail and two-key close unchanged (KIT=%s)', (withKit) => {
    if (withKit) token = registerRenderKit(createTestRenderKit(), {});
    const { navigator, widget, editor, provider, ui } = mountNavigator();
    try {
      editor.handleInput('left');
      expect(
        widget.render(100).find((line) => line.includes('build')),
      ).toContain('› ');
      editor.handleInput('down');
      expect(
        widget.render(100).find((line) => line.includes('deploy')),
      ).toContain('› ');
      expect(ui.custom).toHaveBeenCalledTimes(1);
      if (token) withdrawRenderKit(token);
      else token = registerRenderKit(createTestRenderKit(), {});
      expect(
        widget.render(100).find((line) => line.includes('deploy')),
      ).toContain('› ');
      editor.handleInput('enter');
      editor.handleInput('x');
      expect(provider.close).not.toHaveBeenCalled();
      editor.handleInput('x');
      expect(provider.close).toHaveBeenCalledWith('deploy');
      expect(widget.render(100).join('\n')).not.toContain('deploy');
      editor.handleInput('escape');
      expect(widget.render(100).join('\n')).not.toContain('› ');
      for (const width of [1, 24, 80]) {
        for (const line of widget.render(width))
          expect(visibleWidth(line)).toBeLessThanOrEqual(width);
      }
    } finally {
      navigator.disposeBackgroundWorkNavigator();
    }
  });
});
