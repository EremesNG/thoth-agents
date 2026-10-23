import type {
  AgentToolResult,
  Theme,
  ToolRenderers,
} from '@earendil-works/pi-coding-agent';
import { stripTerminalSequences, visibleWidth } from '@earendil-works/pi-tui';
import { describe, expect, it } from 'vitest';
import { createRenderKit } from '../src/render-kit/index.ts';
import type { IconMode, ThemeConfig } from '../src/shared/config.ts';
import { icon } from '../src/shared/icons.ts';
import {
  createCustomBashTool,
  createCustomPowerShellTool,
} from '../src/tools/bash.ts';
import { renderBox } from '../src/tools/box.ts';
import { createCodemodeRenderer } from '../src/tools/codemode.ts';
import { createCustomEditTool } from '../src/tools/edit.ts';
import { createCustomFindTool } from '../src/tools/find.ts';
import { renderFrameRow } from '../src/tools/frame.ts';
import { createGenericTool } from '../src/tools/generic.ts';
import { createCustomGrepTool } from '../src/tools/grep.ts';
import { createCustomLsTool } from '../src/tools/ls.ts';
import { createCustomReadTool } from '../src/tools/read.ts';
import { createCustomWriteTool } from '../src/tools/write.ts';

const theme = {
  fg: (_role: string, text: string) => `\x1b[33m${text}\x1b[39m`,
  bold: (text: string) => `\x1b[1m${text}\x1b[22m`,
} as Theme;
const lines = Array.from({ length: 128 }, (_, i) => `line ${i + 1}`);
const text = lines.join('\n');
const result = (
  output = text,
  details: unknown = {},
): AgentToolResult<unknown> => ({
  content: [{ type: 'text', text: output }],
  details,
});
const config = (icons: IconMode): ThemeConfig => ({
  icons,
  tools: { enabled: true },
  welcome: { enabled: true },
  statusLine: { enabled: true, subscriptionProviders: ['claude-bridge'] },
});
const factories = {
  bash: (cfg: ThemeConfig) => createCustomBashTool('.', cfg),
  powershell: (cfg: ThemeConfig) => createCustomPowerShellTool('.', cfg),
  edit: (cfg: ThemeConfig) => createCustomEditTool('.', cfg),
  write: (cfg: ThemeConfig) => createCustomWriteTool('.', cfg),
  generic: (cfg: ThemeConfig) => createGenericTool('custom', cfg),
  read: (cfg: ThemeConfig) => createCustomReadTool('.', cfg),
  ls: (cfg: ThemeConfig) => createCustomLsTool('.', cfg),
  find: (cfg: ThemeConfig) => createCustomFindTool('.', cfg),
  grep: (cfg: ThemeConfig) => createCustomGrepTool('.', cfg),
  codemode: createCodemodeRenderer,
  'codemode-calls': createCodemodeRenderer,
  'ls-unframed': (cfg: ThemeConfig) => createCustomLsTool('.', cfg),
  'find-unframed': (cfg: ThemeConfig) => createCustomFindTool('.', cfg),
  'grep-unframed': (cfg: ThemeConfig) => createCustomGrepTool('.', cfg),
  'grep-raw': (cfg: ThemeConfig) => createCustomGrepTool('.', cfg),
  'grep-raw-unframed': (cfg: ThemeConfig) => createCustomGrepTool('.', cfg),
};

function component(name: keyof typeof factories, mode: IconMode) {
  const renderer: ToolRenderers = factories[name](config(mode));
  let output = result();
  if (name === 'edit')
    output = result(lines.map((line) => `+ ${line}`).join('\n'));
  if (name.startsWith('grep') && !name.includes('raw')) {
    output = result(
      lines.map((line, i) => `file.ts:${i + 1}:${line}`).join('\n'),
    );
  }
  if (name === 'codemode-calls') {
    output = result(text, {
      calls: lines.map((name) => ({ name, status: 'ok' })),
    });
  }
  if (!renderer.renderResult) throw new Error(`Missing renderer: ${name}`);
  return renderer.renderResult(
    output,
    { expanded: false, isPartial: false },
    theme,
    {
      args: { content: text },
      ...(name.endsWith('unframed') ? {} : { state: {} }),
      executionStarted: true,
      isError: false,
      // Unframed transcript contexts intentionally omit the SDK's frame identity.
    } as Parameters<NonNullable<ToolRenderers['renderResult']>>[3],
  );
}

const names = Object.keys(factories) as (keyof typeof factories)[];

describe.each([
  'nerd',
  'unicode',
  'ascii',
] as const)('narrow expansion hints in %s mode', (mode) => {
  it.each(
    names,
  )('%s keeps the expansion key and stays within every viewport', (name) => {
    const rendered = component(name, mode);
    const narrow = rendered.render(20);
    const hintRow = narrow
      .map(stripTerminalSequences)
      .find((row) => /[·|] ctrl\+o(?:\s*│)?$/.test(row));
    expect(hintRow).toBeDefined();
    expect(hintRow).toContain(icon('ellipsis', mode));
    for (const width of [0, 1, 4, 5, 9, 10, 13, 20, 21, 32]) {
      expect(
        rendered.render(width).every((row) => visibleWidth(row) <= width),
      ).toBe(true);
    }
  });

  it.each(
    names,
  )('%s preserves the pre-change wide output byte for byte', (name) => {
    const rendered = component(name, mode);
    const wide = rendered.render(120);
    expect(wide.join('\n')).toContain('ctrl+o to expand');
    // Captured against the unchanged truncation boundaries before wiring the helper.
    expect(wide).toMatchSnapshot();
    expect(rendered.render(120)).toBe(wide);
    rendered.render(20);
    expect(rendered.render(120)).toEqual(wide);
    if (!name.startsWith('codemode')) expect(rendered.render(120)).toBe(wide);
    rendered.invalidate();
    expect(rendered.render(120)).toEqual(wide);
  });

  it.each([
    undefined,
    'Alt+X to expand',
  ])('card(collapse) keeps the %s hint in full and split frames', (expandHint) => {
    const kit = createRenderKit({}, undefined, mode);
    const body = kit.collapse(theme, lines, { expandHint });
    for (const part of ['full', 'end'] as const) {
      const narrow = kit.card(theme, { body, part }, 20);
      const key = expandHint ? 'Alt+X' : 'ctrl+o';
      expect(
        narrow
          .map(stripTerminalSequences)
          .some((row) => row.endsWith(`${icon('separator', mode)} ${key} │`)),
      ).toBe(true);
      expect(narrow.every((row) => visibleWidth(row) <= 20)).toBe(true);
    }
  });

  it.each([
    undefined,
    'Alt+X to expand',
    'open details',
  ])('card(collapse) preserves pre-change wide output with hint %s', (expandHint) => {
    const kit = createRenderKit({}, undefined, mode);
    const body = kit.collapse(theme, lines, { expandHint });
    for (const part of ['full', 'end'] as const) {
      expect(kit.card(theme, { body, part }, 120)).toMatchSnapshot(part);
    }
  });
});

it('keeps the durable 120-more-lines example in a 20-column frame', () => {
  const [row] = renderFrameRow(
    theme,
    '… 120 more lines · ctrl+o to expand',
    20,
  );
  expect(stripTerminalSequences(row)).toBe('│ … 120 … · ctrl+o │');
  expect(visibleWidth(row)).toBe(20);
});

it('box and frame agree without compacting the already-fitted row again', () => {
  const hint = '… 120 more lines · ctrl+o to expand';
  for (const width of [0, 1, 4, 5, 9, 10, 13, 20, 32, 120]) {
    const framed = renderFrameRow(theme, hint, width);
    const boxed = renderBox(theme, [hint], width);
    expect(width <= 4 ? boxed : boxed.slice(1, -1)).toEqual(framed);
    expect(boxed.every((row) => visibleWidth(row) <= width)).toBe(true);
  }
});
