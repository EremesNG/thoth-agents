import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { afterEach, expect, it, vi } from 'vitest';
import { createListEditor, openPanelOverlay } from '../src/panel.js';
import {
  inputComponent,
  ownedOverlaySession,
} from './owned-overlay-fixture.js';

afterEach(() => vi.useRealTimers());

it.each([
  'resolve',
  'reject',
  'dispose',
  'throw',
  'async-reject',
] as const)('balances inline mouse reporting on %s', async (outcome) => {
  const write = vi.fn();
  const disposed = vi.fn();
  let close: (() => void) | undefined;
  let reject: ((error: Error) => void) | undefined;
  let complete: (() => void) | undefined;
  let component: { dispose?(): void } | undefined;
  const custom: ExtensionContext['ui']['custom'] = async (factory) => {
    const pending = new Promise<never>((resolve, rejectResult) => {
      complete = () => resolve(undefined as never);
      reject = rejectResult;
    });
    component = await factory(
      {
        mode: 'inline',
        terminal: { rows: 40, write },
        requestRender() {},
      } as unknown as Parameters<typeof factory>[0],
      { fg: (_role, text) => text } as Parameters<typeof factory>[1],
      {} as Parameters<typeof factory>[2],
      () => complete?.(),
    );
    if (outcome === 'reject') throw new Error('overlay rejected');
    return pending;
  };
  const result = openPanelOverlay(
    { ui: { custom } } as Pick<ExtensionContext, 'ui'>,
    (_tui, _theme, _keys, done) => {
      expect(write.mock.calls).toEqual([['\x1b[?1000h\x1b[?1006h']]);
      if (outcome === 'throw') throw new Error('factory threw');
      if (outcome === 'async-reject')
        return Promise.reject(new Error('factory rejected'));
      close = () => done(undefined);
      return { render: () => [], invalidate() {}, dispose: disposed };
    },
  );
  const settled = result.catch((error: Error) => error.message);
  await Promise.resolve();
  await Promise.resolve();
  if (outcome === 'resolve') close?.();
  if (outcome === 'dispose') {
    component?.dispose?.();
    component?.dispose?.();
    expect(write.mock.calls).toEqual([
      ['\x1b[?1000h\x1b[?1006h'],
      ['\x1b[?1006l\x1b[?1000l'],
    ]);
    reject?.(new Error('disposed'));
  }
  await settled;
  if (outcome === 'resolve') await expect(result).resolves.toBeUndefined();
  expect(write.mock.calls).toEqual([
    ['\x1b[?1000h\x1b[?1006h'],
    ['\x1b[?1006l\x1b[?1000l'],
  ]);
  if (outcome === 'dispose') expect(disposed).toHaveBeenCalled();
});

it('keeps mouse reporting active until the last nested inline panel closes', async () => {
  vi.useFakeTimers();
  const { ctx, tui } = ownedOverlaySession();
  const write = vi.spyOn(tui.terminal, 'write');
  const closes: Array<() => void> = [];
  const factory: Parameters<typeof openPanelOverlay<void>>[1] = (
    _tui,
    _theme,
    _keys,
    close,
  ) => {
    closes.push(() => close());
    return inputComponent('Panel');
  };
  const first = openPanelOverlay(ctx, factory);
  const second = openPanelOverlay(ctx, factory);
  try {
    await Promise.resolve();
    expect(write.mock.calls).toEqual([['\x1b[?1000h\x1b[?1006h']]);
    closes[0]();
    await first;
    expect(write.mock.calls).toEqual([['\x1b[?1000h\x1b[?1006h']]);
    closes[1]();
    await second;
    expect(write.mock.calls).toEqual([
      ['\x1b[?1000h\x1b[?1006h'],
      ['\x1b[?1006l\x1b[?1000l'],
    ]);
  } finally {
    for (const close of closes) close();
    await Promise.all([first, second]);
    tui.stop();
  }
});

it('leaves fullscreen-owned mouse tracking untouched', async () => {
  const write = vi.fn();
  const custom: ExtensionContext['ui']['custom'] = async (factory) => {
    const component = await factory(
      {
        mode: 'fullscreen',
        terminal: { rows: 40, write },
        requestRender() {},
      } as unknown as Parameters<typeof factory>[0],
      { fg: (_role, text) => text } as Parameters<typeof factory>[1],
      {} as Parameters<typeof factory>[2],
      () => {},
    );
    component.dispose?.();
    return undefined as never;
  };
  await openPanelOverlay(
    { ui: { custom } } as Pick<ExtensionContext, 'ui'>,
    () => ({ render: () => [], invalidate() {} }),
  );
  expect(write).not.toHaveBeenCalled();
});

it('opens a centered owned panel with a live 90% height budget and closes beneath a foreign overlay', async () => {
  vi.useFakeTimers();
  const { ctx, tui, editor } = ownedOverlaySession();
  const custom = ctx.ui.custom;
  let overlayOptions: unknown;
  ctx.ui.custom = (factory, options) => {
    overlayOptions = options?.overlayOptions;
    return custom(factory, options);
  };
  let panel: ReturnType<typeof createListEditor> | undefined;
  const result = openPanelOverlay<string>(
    ctx,
    (_tui, _theme, _keys, close, host) => {
      panel = createListEditor({
        overview: {
          title: 'Owned',
          rows: () =>
            Array.from({ length: 50 }, (_, i) => ({
              id: String(i),
              label: `row-${i}`,
            })),
        },
        maxHeight: host.maxHeight,
        requestRender: host.requestRender,
        onSave: () => ({ success: true }),
        onSaved: () => close('saved'),
        onCancel: () => close('cancelled'),
      });
      return panel;
    },
  );
  try {
    await Promise.resolve();
    expect(overlayOptions).toEqual({
      anchor: 'center',
      width: '96%',
      maxHeight: '90%',
    });
    expect(panel?.render(80)).toHaveLength(36);
    (tui.terminal as { rows: number }).rows = 10;
    expect(panel?.render(80)).toHaveLength(9);
    const foreign = inputComponent('Foreign');
    const foreignHandle = tui.showOverlay(foreign);
    panel?.handleInput('q');
    await expect(result).resolves.toBe('cancelled');
    expect(tui.getFocusedComponent()).toBe(foreign);
    expect(tui.hasOverlay()).toBe(true);
    foreignHandle.hide();
    expect(tui.getFocusedComponent()).toBe(editor);
    expect(tui.hasOverlay()).toBe(false);
  } finally {
    tui.stop();
  }
});
