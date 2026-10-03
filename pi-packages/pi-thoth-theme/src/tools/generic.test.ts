import type { ImageContent, TextContent } from '@earendil-works/pi-ai';
import type {
  ExtensionAPI,
  ToolRendererResolver,
} from '@earendil-works/pi-coding-agent';
import {
  initTheme,
  ToolExecutionComponent,
} from '@earendil-works/pi-coding-agent';
import {
  stripTerminalSequences,
  type TUI,
  visibleWidth,
} from '@earendil-works/pi-tui';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ThemeConfig } from '../shared/config.ts';
import { summarizeArgs } from './generic.ts';
import { registerTools } from './index.ts';

const config: ThemeConfig = {
  icons: 'nerd',
  statusLine: { enabled: true, subscriptionProviders: ['claude-bridge'] },
  tools: { enabled: true },
  images: { enabled: true },
  welcome: { enabled: true },
};

let resolver: ToolRendererResolver;
let dispose: () => void;
const disposers: Array<() => void> = [];

function setup(icons: ThemeConfig['icons'] = 'nerd') {
  dispose = registerTools(
    {
      registerToolRenderer(r: ToolRendererResolver) {
        resolver = r;
      },
    } as unknown as ExtensionAPI,
    { ...config, icons },
    process.cwd(),
  );
  disposers.push(dispose);
}

function make(
  args: Record<string, unknown> = { query: 'x' },
  name = 'mcp__docs__search',
) {
  const requestRender = vi.fn();
  const renderers = resolver(name, () => undefined);
  const component = new ToolExecutionComponent(
    name,
    'call-1',
    args,
    { showImages: true },
    renderers,
    { requestRender } as unknown as TUI,
    process.cwd(),
  );
  return { component, requestRender };
}

const text = (t: string): TextContent => ({ type: 'text', text: t });
const plain = (c: ToolExecutionComponent, w = 80) =>
  c.render(w).map(stripTerminalSequences);

beforeAll(() => initTheme('dark', false));
afterEach(() => {
  vi.useRealTimers();
  while (disposers.length) disposers.pop()?.();
});

describe('generic tool frame', () => {
  it('frames a successful result with name, args and footer', () => {
    setup();
    const { component } = make({ query: 'hello', limit: 3 });
    component.updateResult({
      content: [text('a\nb')],
      details: {},
      isError: false,
    });
    const lines = plain(component).filter((l) => l !== '');
    expect(lines[0]).toMatch(/^╭.*mcp__docs__search.*╮$/);
    expect(lines[1]).toContain('query="hello" limit=3');
    expect(lines.at(-1)).toMatch(/^╰.*Done.*2 lines.*╯$/);
    for (const l of lines.slice(1, -1)) expect(l).toMatch(/^[│├].*[│┤]$/);
    expect(lines.join('\n')).not.toMatch(/╭.*\n(.*\n)*.*╭/);
  });

  it('uses ASCII icon fallback', () => {
    dispose?.();
    setup('ascii');
    const { component } = make();
    expect(plain(component).join('\n')).toContain('* mcp__docs__search');
  });

  it('collapses long output and expands fully', () => {
    setup();
    const { component } = make();
    const body = Array.from({ length: 20 }, (_, i) => `row ${i}`).join('\n');
    component.updateResult({
      content: [text(body)],
      details: {},
      isError: false,
    });
    const collapsed = plain(component).join('\n');
    expect(collapsed).toContain('row 7');
    expect(collapsed).not.toContain('row 8');
    expect(collapsed).toContain('… 12 more lines · ctrl+o to expand');
    component.setExpanded(true);
    const expanded = plain(component).join('\n');
    expect(expanded).toContain('row 19');
    expect(expanded).not.toContain('more lines');
  });

  it('styles errors', () => {
    setup();
    const { component } = make();
    component.updateResult({
      content: [text('boom')],
      details: {},
      isError: true,
    });
    const out = plain(component).join('\n');
    expect(out).toContain('boom');
    expect(out).toContain('Error');
  });

  it('shows running footer with live elapsed and cleans up the ticker', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    setup();
    const { component, requestRender } = make();
    component.markExecutionStarted();
    expect(plain(component).join('\n')).toContain('running…');
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(2000);
    expect(requestRender).toHaveBeenCalled();
    expect(plain(component).join('\n')).toMatch(/running….*2\.\d+s/);
    component.updateResult({
      content: [text('ok')],
      details: {},
      isError: false,
    });
    expect(vi.getTimerCount()).toBe(0);
    expect(plain(component).join('\n')).not.toContain('running…');
  });

  it('stops tickers on dispose', () => {
    vi.useFakeTimers();
    setup();
    const { component } = make();
    component.markExecutionStarted();
    expect(vi.getTimerCount()).toBe(1);
    dispose();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('escapes control characters in args, name and output', () => {
    setup();
    const { component } = make({ q: 'a\x1b[31m\nb' }, 'bad\x1bname');
    component.updateResult({
      content: [text('x\x1b[2Jy\ru')],
      details: {},
      isError: false,
    });
    const raw = component.render(80).join('\n');
    expect(raw).not.toContain('\x1b[2J');
    expect(raw).not.toContain('\x1b[31m\u240a');
    const out = stripTerminalSequences(raw);
    expect(out).toContain('␛');
  });

  it('truncates long args to width and is safe at widths 0/1/80', () => {
    setup();
    const { component } = make({ big: 'z'.repeat(5000) });
    component.updateResult({
      content: [text('a\nb')],
      details: {},
      isError: false,
    });
    expect(component.render(0).filter((l) => l !== '')).toEqual([]);
    for (const w of [1, 2, 5, 20, 80]) {
      for (const l of component.render(w))
        expect(visibleWidth(l)).toBeLessThanOrEqual(w);
    }
    expect(summarizeArgs({ big: 'z'.repeat(5000) }).length).toBeLessThanOrEqual(
      500,
    );
  });

  it('preserves image content for the native image pass', () => {
    setup();
    const { component } = make();
    const image: ImageContent = {
      type: 'image',
      data: 'AAAA',
      mimeType: 'image/png',
    };
    component.updateResult({
      content: [text('shot'), image],
      details: {},
      isError: false,
    });
    expect(plain(component).join('\n')).toContain('shot');
    expect(plain(component).at(-1)).toMatch(/^╰/);
  });

  it('summarizes args compactly', () => {
    expect(summarizeArgs(undefined)).toBe('');
    expect(summarizeArgs({ a: 1, b: 'x', c: [1] })).toBe('a=1 b="x" c=[1]');
    expect(summarizeArgs('s')).toBe('"s"');
  });
});
