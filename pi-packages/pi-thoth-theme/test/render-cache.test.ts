import { performance } from 'node:perf_hooks';
import type { AgentToolResult, Theme } from '@earendil-works/pi-coding-agent';
import { type Component, visibleWidth } from '@earendil-works/pi-tui';
import { describe, expect, it, vi } from 'vitest';
import { cachedComponent } from '../src/shared/cache.ts';
import type { ThemeConfig } from '../src/shared/config.ts';
import { createCustomBashTool } from '../src/tools/bash.ts';
import * as box from '../src/tools/box.ts';
import { createComponent } from '../src/tools/box.ts';
import { createCustomEditTool } from '../src/tools/edit.ts';
import { createCustomFindTool } from '../src/tools/find.ts';
import { createCustomGrepTool } from '../src/tools/grep.ts';
import { createCustomLsTool } from '../src/tools/ls.ts';
import { createCustomReadTool } from '../src/tools/read.ts';
import { createCustomWriteTool } from '../src/tools/write.ts';
import { WelcomeComponent } from '../src/welcome/index.ts';
import type { WelcomeData } from '../src/welcome/resources.ts';

const config: ThemeConfig = {
  icons: 'ascii',
  statusLine: { enabled: true },
  tools: { enabled: true },
  images: { enabled: true },
  welcome: { enabled: true },
};

function textResult(
  text: string,
  details: Record<string, unknown> = {},
): AgentToolResult<unknown> {
  return { content: [{ type: 'text', text }], details };
}

const welcomeTheme = {
  fg: (_color: string, text: string) => `\x1b[33m${text}\x1b[39m`,
  bold: (text: string) => `\x1b[1m${text}\x1b[22m`,
};
const theme = welcomeTheme as Theme;

function createTranscript(): Component[] {
  const cwd = process.cwd();
  const rows = Array.from({ length: 40 }, (_, i) => `const value${i} = ${i};`);
  const source = rows.join('\n');
  const diff = rows.map((row, i) => `${i % 2 ? '+' : '-'}${row}`).join('\n');
  const paths = rows.map((_, i) => `src/module${i}/index.ts`).join('\n');
  const matches = rows
    .map((row, i) => `src/module${Math.floor(i / 4)}.ts:${i + 1}:${row}`)
    .join('\n');
  const fixtures = [
    {
      tool: createCustomReadTool(cwd, config),
      args: { path: 'src/index.ts' },
      result: textResult(source),
    },
    {
      tool: createCustomBashTool(cwd, config),
      args: { command: 'pnpm test' },
      result: textResult(source, { exitCode: 0 }),
    },
    {
      tool: createCustomLsTool(cwd, config),
      args: { path: 'src' },
      result: textResult(paths),
    },
    {
      tool: createCustomGrepTool(cwd, config),
      args: { pattern: 'value', path: 'src' },
      result: textResult(matches),
    },
    {
      tool: createCustomFindTool(cwd, config),
      args: { pattern: '*.ts', path: 'src' },
      result: textResult(paths),
    },
    {
      tool: createCustomEditTool(cwd, config),
      args: { path: 'src/index.ts' },
      result: textResult('Edited src/index.ts', { diff }),
    },
    {
      tool: createCustomWriteTool(cwd, config),
      args: { path: 'src/index.ts', content: source },
      result: textResult('Wrote src/index.ts'),
    },
  ];

  return Array.from({ length: 500 }, (_, i) => {
    const { tool, args, result } = fixtures[i % fixtures.length];
    const expanded = i % 2 === 0;
    const context = {
      args,
      cwd,
      toolCallId: `benchmark-${i}`,
      invalidate: () => {},
      state: {},
      executionStarted: true,
      argsComplete: true,
      expanded,
      isPartial: false,
      isError: false,
      showImages: true,
    };
    tool.renderCall(args, theme, context);
    // Pi supplies fresh wrappers; their payload references may still be shared.
    return tool.renderResult(
      { ...result },
      { expanded, isPartial: false },
      theme,
      context,
    );
  });
}

function renderFrame(components: Component[], width: number): number {
  let lines = 0;
  for (const component of components) lines += component.render(width).length;
  return lines;
}

function invalidateFrame(components: Component[]): void {
  for (const component of components) component.invalidate();
}

describe('render cache', () => {
  it('renders each width once and clears every width on invalidation', () => {
    let renders = 0;
    let input = 'initial';
    const component = cachedComponent((width) => {
      renders++;
      return [`${input} at ${width}`];
    });
    const wide = component.render(80);
    const narrow = component.render(40);
    expect(wide).toEqual(['initial at 80']);
    expect(narrow).toEqual(['initial at 40']);
    expect(component.render(40)).toBe(narrow);
    expect(component.render(80)).toBe(wide);
    expect(renders).toBe(2);

    input = 'updated';
    component.invalidate();
    const updatedWide = component.render(80);
    const updatedNarrow = component.render(40);
    expect(updatedWide).toEqual(['updated at 80']);
    expect(updatedNarrow).toEqual(['updated at 40']);
    expect(component.render(80)).toBe(updatedWide);
    expect(component.render(40)).toBe(updatedNarrow);
    expect(renders).toBe(4);
  });

  it('keeps caches independent even with the same render function', () => {
    let input = 'initial';
    let renders = 0;
    const renderFn = () => {
      renders++;
      return [input];
    };
    const first = cachedComponent(renderFn);
    const second = cachedComponent(renderFn);
    expect(first.render(80)).toEqual(['initial']);
    input = 'updated';
    const secondLines = second.render(80);
    expect(secondLines).toEqual(['updated']);
    expect(first.render(80)).toEqual(['initial']);
    expect(renders).toBe(2);

    first.invalidate();
    expect(first.render(80)).toEqual(['updated']);
    expect(second.render(80)).toBe(secondLines);
    expect(renders).toBe(3);
  });

  it('caches empty output', () => {
    let renders = 0;
    const component = cachedComponent(() => {
      renders++;
      return [];
    });
    const empty = component.render(80);
    expect(empty).toEqual([]);
    expect(component.render(80)).toBe(empty);
    expect(renders).toBe(1);
  });

  it('retries a render that threw instead of caching a failure', () => {
    let renders = 0;
    const component = cachedComponent(() => {
      if (++renders === 1) throw new Error('render failed');
      return ['recovered'];
    });
    expect(() => component.render(80)).toThrow('render failed');
    const recovered = component.render(80);
    expect(recovered).toEqual(['recovered']);
    expect(component.render(80)).toBe(recovered);
    expect(renders).toBe(2);
  });

  it('reuses tool lines without rendering again on repeat frames', () => {
    let renders = 0;
    const component = createComponent((width) => {
      renders++;
      return [`tool result at ${width}`];
    });

    const first = component.render(80);
    expect(first).toEqual(['tool result at 80']);
    expect(component.render(80)).toBe(first);
    expect(component.render(80)).toBe(first);
    expect(renders).toBe(1);
  });

  it('preserves tool width normalization, empty viewports and clipping', () => {
    const renderedWidths: number[] = [];
    const component = createComponent((width) => {
      renderedWidths.push(width);
      return ['\x1b[33mtool result longer than the viewport\x1b[39m'];
    });
    expect(component.render(0)).toEqual([]);
    expect(component.render(-10)).toEqual([]);
    expect(renderedWidths).toEqual([]);
    for (const width of [1, 4.9, 20]) {
      const lines = component.render(width);
      expect(lines).toHaveLength(1);
      expect(visibleWidth(lines[0])).toBeLessThanOrEqual(Math.floor(width));
      expect(component.render(width)).toBe(lines);
    }
    expect(renderedWidths).toEqual([1, 4, 20]);
  });

  it('does not reuse stale tool lines for fresh wrappers with shared payloads', () => {
    const read = createCustomReadTool(process.cwd(), config);
    const result = textResult('first output');
    const options = { expanded: true, isPartial: false };
    const context = { isError: false };
    const first = read.renderResult(result, options, theme, context);
    const firstLines = first.render(80);
    expect(firstLines.join('\n')).toContain('first output');

    const block = result.content[0];
    if (block.type !== 'text') throw new Error('expected text fixture');
    block.text = 'updated output';
    const second = read.renderResult({ ...result }, options, theme, context);
    const secondLines = second.render(80);
    expect(secondLines.join('\n')).toContain('updated output');
    expect(secondLines.join('\n')).not.toContain('first output');
    expect(first.render(80)).toBe(firstLines);
    expect(second.render(80)).toBe(secondLines);
  });

  it('reuses welcome lines until resource data updates', () => {
    let styles = 0;
    const theme = {
      fg: (_color: string, text: string) => {
        styles++;
        return text;
      },
    };
    const data: WelcomeData = {
      version: '0.99.1',
      model: 'Initial Model',
      resources: { tools: 1 },
      providers: [],
      sessions: [],
    };
    const component = new WelcomeComponent(theme, config, data);
    const first = component.render(80);
    const initialStyles = styles;
    expect(first.join('\n')).toContain('Initial Model');
    expect(initialStyles).toBeGreaterThan(0);
    expect(component.render(80)).toBe(first);
    expect(styles).toBe(initialStyles);

    component.updateData({ ...data, model: 'Updated Model' });
    const updated = component.render(80);
    expect(updated.join('\n')).toContain('Updated Model');
    expect(updated.join('\n')).not.toContain('Initial Model');
    expect(component.render(80)).toBe(updated);
  });

  it('clears all welcome widths even when updateData receives the same object', () => {
    const data = {
      version: '0.99.1',
      model: 'Initial Model',
      resources: { tools: 1 },
      providers: [],
      sessions: [],
    };
    const component = new WelcomeComponent(welcomeTheme, config, data);
    const wide = component.render(80);
    const narrow = component.render(50);
    expect(component.render(80)).toBe(wide);
    expect(component.render(50)).toBe(narrow);

    data.model = 'Updated Model';
    component.updateData(data);
    expect(component.render(80).join('\n')).toContain('Updated Model');
    expect(component.render(50).join('\n')).toContain('Updated Model');
  });

  it('refreshes cached welcome styling on invalidation', () => {
    let color = '\x1b[33m';
    const component = new WelcomeComponent(
      { fg: (_token, text) => `${color}${text}\x1b[39m` },
      config,
      {
        version: '0.99.1',
        resources: { tools: 1 },
        providers: [],
        sessions: [],
      },
    );
    const wide = component.render(80);
    const narrow = component.render(50);
    color = '\x1b[36m';
    expect(component.render(80)).toBe(wide);
    expect(component.render(50)).toBe(narrow);
    component.invalidate();
    expect(component.render(80).join('\n')).toContain('\x1b[36m');
    expect(component.render(50).join('\n')).toContain('\x1b[36m');
  });

  it('ignores late welcome updates without clearing a disposed cache', () => {
    const data: WelcomeData = {
      version: '0.99.1',
      model: 'Initial Model',
      resources: { tools: 1 },
      providers: [],
      sessions: [],
    };
    const component = new WelcomeComponent(welcomeTheme, config, data);
    const initial = component.render(80);
    component.dispose();
    component.updateData({ ...data, model: 'Late Model' });
    expect(component.isDisposed).toBe(true);
    expect(component.render(80)).toBe(initial);
    expect(initial.join('\n')).not.toContain('Late Model');
  });

  it('renders 500 tool results with zero repeat render calls and a 10x speedup', () => {
    let renders = 0;
    const originalCreateComponent = box.createComponent;
    // Instrument the agreed render-callback seam; keep real renderers and caches.
    const spy = vi
      .spyOn(box, 'createComponent')
      .mockImplementation((renderFn) =>
        originalCreateComponent((width) => {
          renders++;
          return renderFn(width);
        }),
      );
    try {
      const components = createTranscript();
      expect(components).toHaveLength(500);
      const first = components.map((component) => component.render(100));
      expect(renders).toBe(500);
      for (let i = 0; i < components.length; i++) {
        expect(components[i].render(100)).toBe(first[i]);
      }
      expect(renders).toBe(500);
      renderFrame(components, 80);
      renderFrame(components, 80);
      renderFrame(components, 100);
      expect(renders).toBe(1000);
      invalidateFrame(components);
      renderFrame(components, 100);
      renderFrame(components, 100);
      expect(renders).toBe(1500);

      // Warm both miss and hit paths before amortizing multiple frame samples.
      for (let round = 0; round < 3; round++) {
        invalidateFrame(components);
        renderFrame(components, 100);
        for (let frame = 0; frame < 20; frame++) renderFrame(components, 100);
      }
      const samples = 5;
      const repeatFrames = 200;
      let firstMs = 0;
      let repeatMs = 0;
      for (let sample = 0; sample < samples; sample++) {
        invalidateFrame(components);
        const before = renders;
        let start = performance.now();
        const firstLineCount = renderFrame(components, 100);
        firstMs += performance.now() - start;
        expect(renders - before).toBe(500);
        const afterFirst = renders;
        let repeatLineCount = 0;
        start = performance.now();
        for (let frame = 0; frame < repeatFrames; frame++) {
          repeatLineCount += renderFrame(components, 100);
        }
        repeatMs += performance.now() - start;
        expect(renders - afterFirst).toBe(0);
        expect(repeatLineCount).toBe(firstLineCount * repeatFrames);
      }
      const firstFrameMs = firstMs / samples;
      const repeatFrameMs = repeatMs / (samples * repeatFrames);
      const speedup = firstFrameMs / repeatFrameMs;
      console.info(
        `render-cache: ${speedup.toFixed(1)}x (${firstFrameMs.toFixed(3)}ms first, ${repeatFrameMs.toFixed(3)}ms repeat; 500 results)`,
      );
      expect(speedup).toBeGreaterThanOrEqual(10);
    } finally {
      spy.mockRestore();
    }
  }, 20_000);
});
