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
    expect(lines.at(-1)).toMatch(/^╰.*Done · 2 lines.*╯$/);
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
    expect(plain(component).join('\n')).toContain('running… · 0s');
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(2000);
    expect(requestRender).toHaveBeenCalled();
    expect(plain(component).join('\n')).toContain('running… · 2s');
    component.updateResult({
      content: [text('ok')],
      details: {},
      isError: false,
    });
    expect(vi.getTimerCount()).toBe(0);
    expect(plain(component).join('\n')).not.toContain('running…');
  });

  it.each([
    [-1, '0s', '0s'],
    [0, '0s', '0s'],
    [999, '0s', '999ms'],
    [12345, '12s', '12.3s'],
    [45000, '45s', '45s'],
    [60000, '1m 00s', '1m 00s'],
    [845999, '14m 05s', '14m 05s'],
    [3600000, '1h 00m', '1h 00m'],
    [7439999, '2h 03m', '2h 03m'],
  ])('shows %s ms as %s live and %s completed within the frame width', (ms, live, completed) => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    setup();
    const { component } = make();
    component.markExecutionStarted();
    plain(component);
    vi.setSystemTime(ms);
    component.invalidate();
    expect(plain(component).at(-1)).toContain(` running… · ${live} `);
    component.updateResult({ content: [text('ok')], isError: false }, true);
    expect(plain(component).at(-1)).toContain(` running… · ${live} · 1 line `);
    component.updateResult({ content: [text('ok')], isError: false }, false);
    expect(vi.getTimerCount()).toBe(0);
    expect(plain(component).at(-1)).toContain(` Done · ${completed} · 1 line `);

    vi.setSystemTime(ms + 10000);
    component.setExpanded(true);
    component.invalidate();
    expect(plain(component).at(-1)).toContain(` Done · ${completed} · 1 line `);
    for (const width of [0, 1, 2, 5, 10, 20, 80]) {
      for (const line of component.render(width)) {
        expect(visibleWidth(line)).toBeLessThanOrEqual(width);
      }
    }
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
    expect(summarizeArgs({ a: 1, b: 'x', c: [1] })).toBe(
      'a=1 b="x" c=[1 items]',
    );
    expect(summarizeArgs('s')).toBe('"s"');
  });

  it('summarizes arrays, nested objects and long keys', () => {
    expect(summarizeArgs({ q: [1, 2, 3], o: { a: 1, b: 2 }, n: null })).toBe(
      'q=[3 items] o={a, b} n=null',
    );
    expect(summarizeArgs({ o: { a: 1, b: 2, c: 3, d: 4, e: 5 } })).toBe(
      'o={a, b, c, d, …}',
    );
    expect(summarizeArgs({ [`k${'x'.repeat(600)}`]: 1 })).toHaveLength(500);
    expect(summarizeArgs({ 'a\u001b': [] })).toBe('a␛=[0 items]');
  });

  describe('JSON results', () => {
    function run(body: string, expanded = false) {
      setup();
      const { component } = make();
      component.updateResult({ content: [text(body)], isError: false }, false);
      component.setExpanded(expanded);
      return plain(component).join('\n');
    }

    it('pretty-prints objects and arrays', () => {
      const obj = run('{"a":1,"b":{"c":2}}', true);
      expect(obj).toContain('"a": 1');
      expect(obj).toContain('"c": 2');
      expect(run('[1,2]', true)).toContain('  1,');
    });

    it('collapses large JSON to 8 lines with the hint', () => {
      const out = run(
        JSON.stringify({ items: Array.from({ length: 30 }, (_, i) => i) }),
      );
      expect(out).toContain('more lines');
    });

    it('leaves invalid JSON and plain text unchanged', () => {
      expect(run('{"a":1')).toContain('{"a":1');
      expect(run('hello {"a":1}')).toContain('hello {"a":1}');
      expect(run('42', true)).toContain('42');
    });

    it('escapes control characters inside JSON strings', () => {
      const out = run(JSON.stringify({ a: '\u001b[31mred' }), true);
      expect(out).not.toContain('\u001b');
    });
  });
});
