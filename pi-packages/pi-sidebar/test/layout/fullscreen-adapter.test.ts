import { afterEach, expect, it, vi } from 'vitest';
import {
  createFullscreenAdapter,
  PlaceholderSidebar,
} from '../../src/layout/index.js';
import { createInteractiveTuiReference, fullscreen } from './fixture.js';

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  vi.useRealTimers();
});

it('reserves a right column and wraps the transcript at the remaining width on the real fullscreen renderer proxy', () => {
  vi.useFakeTimers();
  const { tui, proxy, terminal, widths, text } = fullscreen();
  const sidebar = new PlaceholderSidebar();
  const adapter = createFullscreenAdapter(proxy, vi.fn());
  cleanups.push(
    () => tui.stop(),
    () => adapter.dispose(),
  );
  expect(adapter.mount(sidebar, 32)).toBe(true);
  tui.start();
  tui.renderNow(true);
  expect(widths.at(-1)).toBe(88);
  expect(sidebar.widths.at(-1)).toBe(32);
  expect(text.render(88).length).toBeGreaterThan(text.render(120).length);
  expect(tui.getScreenLines()[0]).toContain('Sidebar');
  adapter.setWidth(40);
  tui.renderNow(true);
  expect(widths.at(-1)).toBe(80);
  terminal.columns = 160;
  terminal.resize();
  tui.renderNow(true);
  expect(widths.at(-1)).toBe(120);
});

it('keeps PgUp/PgDn and transcript wheel scrolling, without routing sidebar wheel or clicks into the transcript/editor', () => {
  vi.useFakeTimers();
  const { tui, proxy, terminal, transcript, editor } = fullscreen();
  const sidebar = new PlaceholderSidebar();
  const adapter = createFullscreenAdapter(proxy, vi.fn());
  cleanups.push(
    () => tui.stop(),
    () => adapter.dispose(),
  );
  adapter.mount(sidebar, 32);
  tui.start();
  tui.renderNow(true);
  const bottom = transcript.scrollTop;
  terminal.input('\x1b[5~');
  const up = transcript.scrollTop;
  expect(up).toBeLessThan(bottom);
  terminal.input('\x1b[6~');
  expect(transcript.scrollTop).toBe(bottom);
  terminal.input('\x1b[<64;10;2M');
  expect(transcript.scrollTop).toBeLessThan(bottom);
  const scrolled = transcript.scrollTop;
  terminal.input('\x1b[<64;100;2M');
  terminal.input('\x1b[<0;100;2M');
  expect(transcript.scrollTop).toBe(scrolled);
  expect(sidebar.mouseEvents.map((event) => event.type)).toEqual([
    'wheel',
    'press',
  ]);
  expect(tui.getFocusedComponent()).toBe(editor);
});

it('restores on hide/dispose and never replaces a foreign layout root, including after hide', () => {
  const { tui, proxy, root } = fullscreen();
  const adapter = createFullscreenAdapter(proxy, vi.fn());
  cleanups.push(() => adapter.dispose());
  adapter.mount(new PlaceholderSidebar(), 32);
  adapter.setVisible(false);
  expect((tui as any).layoutRoot).toBe(root);
  adapter.setVisible(true);
  expect((tui as any).layoutRoot).not.toBe(root);
  adapter.dispose();
  adapter.dispose();
  expect((tui as any).layoutRoot).toBe(root);
  const next = createFullscreenAdapter(proxy, vi.fn());
  next.mount(new PlaceholderSidebar(), 32);
  const foreign = new PlaceholderSidebar();
  tui.setLayoutRoot(foreign);
  next.setVisible(false);
  next.setVisible(true);
  next.dispose();
  expect((tui as any).layoutRoot).toBe(foreign);
});

it('notifies actual display transitions, including foreign-root takeover with unchanged visibility', () => {
  const { tui, proxy, terminal } = fullscreen();
  const changed = vi.fn();
  const adapter = createFullscreenAdapter(proxy, vi.fn(), changed);
  cleanups.push(() => adapter.dispose());
  adapter.mount(new PlaceholderSidebar(), 32);
  expect(adapter.isDisplayed()).toBe(true);
  expect(changed).toHaveBeenCalledTimes(1);
  terminal.columns = 90;
  expect(adapter.isDisplayed()).toBe(false);
  terminal.columns = 120;
  expect(adapter.isDisplayed()).toBe(true);
  const foreign = new PlaceholderSidebar();
  tui.setLayoutRoot(foreign);
  adapter.setVisible(true);
  expect(adapter.isDisplayed()).toBe(false);
  expect(changed).toHaveBeenCalledTimes(4);
  adapter.setVisible(false);
  adapter.setVisible(true);
  expect(changed).toHaveBeenCalledTimes(4);
  expect((tui as any).layoutRoot).toBe(foreign);
});

it('treats throwing private root access as display loss without overwriting foreign UI', () => {
  const { tui, proxy } = fullscreen();
  const changed = vi.fn();
  const adapter = createFullscreenAdapter(proxy, vi.fn(), changed);
  adapter.mount(new PlaceholderSidebar(), 32);
  const descriptor = Object.getOwnPropertyDescriptor(tui, 'layoutRoot');
  cleanups.push(() => {
    if (descriptor) Object.defineProperty(tui, 'layoutRoot', descriptor);
  });
  Object.defineProperty(tui, 'layoutRoot', {
    configurable: true,
    get() {
      throw new Error('Foreign private layout');
    },
  });
  expect(adapter.isDisplayed()).toBe(false);
  expect(adapter.isDisplayed()).toBe(false);
  expect(changed).toHaveBeenCalledTimes(2);
  expect(() => adapter.dispose()).not.toThrow();
});

it('clamps widths and gives the main pane at least 64 columns on a narrow terminal', () => {
  vi.useFakeTimers();
  const { tui, proxy, terminal, widths } = fullscreen();
  const side = new PlaceholderSidebar();
  const adapter = createFullscreenAdapter(proxy, vi.fn());
  cleanups.push(
    () => tui.stop(),
    () => adapter.dispose(),
  );
  adapter.mount(side, 1);
  tui.start();
  tui.renderNow(true);
  expect(widths.at(-1)).toBe(92);
  adapter.setWidth(100);
  terminal.columns = 140;
  terminal.resize();
  tui.renderNow(true);
  expect(widths.at(-1)).toBe(68);
  expect(side.widths.at(-1)).toBe(72);
  terminal.columns = 90;
  terminal.resize();
  tui.renderNow(true);
  expect(widths.at(-1)).toBe(90);
  expect(tui.getScreenLines().join('\n')).not.toContain('Sidebar');
});

it.each([
  undefined,
  {},
  { render() {} },
])('rejects unsupported private roots (%j) with one diagnostic and leaves Pi working', (root) => {
  const { tui, proxy } = fullscreen();
  (tui as any).layoutRoot = root;
  const report = vi.fn();
  const adapter = createFullscreenAdapter(proxy, report);
  expect(adapter.mount(new PlaceholderSidebar(), 32)).toBe(false);
  expect(adapter.mount(new PlaceholderSidebar(), 32)).toBe(false);
  adapter.setWidth(40);
  adapter.setVisible(false);
  adapter.dispose();
  expect((tui as any).layoutRoot).toBe(root);
  expect(report).toHaveBeenCalledOnce();
  expect(tui.getFocusedComponent()).toBeDefined();
});

it('restores the owned renderer even if Pi retargets its stable reference before disposal', () => {
  const first = fullscreen();
  const second = fullscreen();
  let current = first.tui;
  const proxy = createInteractiveTuiReference(() => current);
  const adapter = createFullscreenAdapter(proxy, vi.fn());
  adapter.mount(new PlaceholderSidebar(), 32);
  current = second.tui;
  adapter.dispose();
  expect((first.tui as any).layoutRoot).toBe(first.root);
  expect((second.tui as any).layoutRoot).toBe(second.root);
});
