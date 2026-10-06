import type {
  AgentToolResult,
  Theme,
  ToolRenderers,
} from '@earendil-works/pi-coding-agent';
import { stripTerminalSequences } from '@earendil-works/pi-tui';
import type { RenderCardOptions } from '@thoth-agents/pi-core';
import { describe, expect, it } from 'vitest';
import { createRenderKit } from '../render-kit/index.ts';
import type { ThemeConfig } from '../shared/config.ts';
import { createCustomBashTool, createCustomPowerShellTool } from './bash.ts';
import { renderBox } from './box.ts';
import { createCustomEditTool } from './edit.ts';
import { createCustomFindTool } from './find.ts';
import { createGenericTool } from './generic.ts';
import { createCustomGrepTool } from './grep.ts';
import { createCustomLsTool } from './ls.ts';
import { createCustomReadTool } from './read.ts';
import { createCustomWriteTool } from './write.ts';

// Distinct zero-width markers keep real SDK width/truncation behavior intact.
const colors = { error: 31, success: 32, accent: 33 } as const;
const theme = {
  fg: (role: string, text: string) =>
    `\x1b[${colors[role as keyof typeof colors] ?? 37}m${text}\x1b[39m`,
  bold: (text: string) => text,
} as Theme;

function expectBorderTone(lines: string[], tone: keyof typeof colors) {
  expect(lines.length).toBeGreaterThan(0);
  for (const line of lines) {
    // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional ANSI marker matching
    const chunks = [...line.matchAll(/\x1b\[(\d+)m([^\x1b]*)\x1b\[39m/g)];
    const first = chunks[0];
    const last = chunks.at(-1);
    expect(first?.[2], line).toMatch(/^(?:[╭├╰]─+(?:[╮┤╯])?|│ )$/);
    expect(last?.[2], line).toMatch(/^(?:[╭╰]─+[╮╯]| │|─*[╮┤╯])$/);
    expect([Number(first?.[1]), Number(last?.[1])], line).toEqual([
      colors[tone],
      colors[tone],
    ]);
  }
}

describe('successful card borders', () => {
  const kit = createRenderKit({});
  const cardPaths: Array<[string, RenderCardOptions]> = [
    ['box', { title: 'Tool', body: ['output'] }],
    [
      'sections',
      {
        title: 'Tool',
        body: ['args'],
        sections: [{ title: 'Output', rows: ['output'] }],
      },
    ],
    ['untitled sections', { sections: [{ rows: ['output'] }] }],
    ['start', { title: 'Tool', body: ['args'], part: 'start' }],
    ['end', { body: ['output'], part: 'end' }],
  ];

  describe.each(cardPaths)('kit.card %s path', (_name, cardOptions) => {
    it.each([
      [undefined, false, undefined, 'accent'],
      ['running', false, undefined, 'accent'],
      ['failed', false, undefined, 'accent'],
      ['cancelled', false, undefined, 'accent'],
      ['completed', false, undefined, 'accent'],
      ['completed', false, false, 'accent'],
      ['completed', true, undefined, 'error'],
      ['running', true, undefined, 'error'],
    ] as const)('status=%s, isError=%s, isSuccess=%s -> %s', (status, isError, isSuccess, tone) => {
      expectBorderTone(
        kit.card(
          theme,
          {
            ...cardOptions,
            status,
            isError,
            isSuccess,
          },
          120,
        ),
        tone,
      );
    });

    it.each([
      [undefined, 'Done', '╰── Done ──────────────╯'],
      [
        'completed',
        '\x1b[32m\uf00c\x1b[39m Done',
        '╰── \uf00c Done ────────────╯',
      ],
      ['running', 'Done', '╰── Done ──────────────╯'],
      ['in_progress', 'Done', '╰── Done ──────────────╯'],
      [
        'failed',
        '\x1b[31m\uf00d\x1b[39m Done',
        '╰── \uf00d Done ────────────╯',
      ],
      [
        'cancelled',
        '\x1b[37m\uf05e\x1b[39m Done',
        '╰── \uf05e Done ────────────╯',
      ],
    ] as const)('preserves the status=%s footer when border flags change', (status, footer, bottom) => {
      const options = { ...cardOptions, status, footer: 'Done' };
      const baseline = kit.card(theme, options, 24).map(stripTerminalSequences);
      for (const [isError, isSuccess, tone] of [
        [false, undefined, 'accent'],
        [false, false, 'accent'],
        [false, true, 'success'],
        [true, undefined, 'error'],
        [true, false, 'error'],
        [true, true, 'error'],
      ] as const) {
        const lines = kit.card(theme, { ...options, isError, isSuccess }, 24);
        expectBorderTone(lines, tone);
        expect(lines.map(stripTerminalSequences)).toEqual(baseline);
        if (cardOptions.part !== 'start') {
          expect(lines.at(-1)).toContain(footer);
          expect(stripTerminalSequences(lines.at(-1) ?? '')).toBe(bottom);
        }
      }
    });
  });

  describe.each(
    cardPaths,
  )('kit.card %s explicit success', (_name, cardOptions) => {
    it.each([
      [undefined, 'success'],
      [false, 'success'],
      [true, 'error'],
    ] as const)('isSuccess with isError=%s -> %s without a status glyph', (isError, tone) => {
      const lines = kit.card(
        theme,
        {
          ...cardOptions,
          isSuccess: true,
          isError,
        },
        120,
      );
      expectBorderTone(lines, tone);
      expect(lines.map(stripTerminalSequences).join('\n')).not.toMatch(
        /[\uf00c\uf00d◇]/,
      );
    });
  });

  it('explicit success alone adds no footer to a box card', () => {
    const lines = kit.card(
      theme,
      {
        title: 'Tool',
        body: ['output'],
        isSuccess: true,
      },
      24,
    );
    expect(lines.map(stripTerminalSequences)).toEqual([
      '╭── Tool ──────────────╮',
      '│ output               │',
      '╰──────────────────────╯',
    ]);
  });

  it.each([
    [{}, 'accent'],
    [{ isSuccess: true }, 'success'],
    [{ isError: true }, 'error'],
    [{ isError: true, isSuccess: true }, 'error'],
  ] as const)('renderBox uses %j -> %s on every edge', (options, tone) => {
    expectBorderTone(
      renderBox(theme, ['output'], 120, {
        ...options,
        title: 'Tool',
        footer: 'Done',
      }),
      tone,
    );
  });
});

const config: ThemeConfig = {
  icons: 'nerd',
  statusLine: { enabled: true, subscriptionProviders: ['claude-bridge'] },
  tools: { enabled: true },
  welcome: { enabled: true },
};
const cwd = process.cwd();
const builtIns: Array<[string, () => ToolRenderers]> = [
  ['read', () => createCustomReadTool(cwd, config)],
  ['bash', () => createCustomBashTool(cwd, config)],
  ['powershell', () => createCustomPowerShellTool(cwd, config)],
  ['edit', () => createCustomEditTool(cwd, config)],
  ['write', () => createCustomWriteTool(cwd, config)],
  ['grep', () => createCustomGrepTool(cwd, config)],
  ['find', () => createCustomFindTool(cwd, config)],
  ['ls', () => createCustomLsTool(cwd, config)],
  ['generic', () => createGenericTool('custom', config)],
];
const args = {
  path: 'file.ts',
  pattern: 'text',
  command: 'echo text',
  content: 'text',
};
const result: AgentToolResult<unknown> = {
  content: [{ type: 'text', text: 'file.ts:1:text' }],
  details: { diff: '+new\n-old' },
};
const lifecycleCases = [
  [true, false, 'accent'],
  [false, false, 'success'],
  [true, true, 'error'],
  [false, true, 'error'],
] as const;

function toolContext(isPartial: boolean, isError: boolean) {
  return {
    args,
    toolCallId: 'call-1',
    state: {},
    lastComponent: undefined,
    cwd,
    executionStarted: true,
    argsComplete: true,
    isPartial,
    expanded: false,
    showImages: false,
    isError,
    invalidate: () => {},
  };
}

function framedTool(tool: ToolRenderers) {
  if (!tool.renderCall || !tool.renderResult) {
    throw new Error('Expected both framed tool renderers');
  }
  return { renderCall: tool.renderCall, renderResult: tool.renderResult };
}

describe.each(builtIns)('%s lifecycle borders', (_name, createTool) => {
  it('keeps the initial running call accent before any result', () => {
    const tool = framedTool(createTool());
    expectBorderTone(
      tool.renderCall(args, theme, toolContext(true, false)).render(120),
      'accent',
    );
  });

  it.each([
    true,
    false,
  ])('uses result options for isPartial=%s even if call context is stale', (isPartial) => {
    const output = framedTool(createTool()).renderResult(
      result,
      { expanded: true, isPartial },
      theme,
      toolContext(!isPartial, false),
    );
    expectBorderTone(output.render(120), isPartial ? 'accent' : 'success');
  });

  it('recolors every call/result edge when a partial result completes', () => {
    const tool = framedTool(createTool());
    const context = toolContext(true, false);
    for (const isPartial of [true, false]) {
      context.isPartial = isPartial;
      const output = tool.renderResult(
        result,
        { expanded: true, isPartial },
        theme,
        context,
      );
      const call = tool.renderCall(args, theme, context);
      const tone = isPartial ? 'accent' : 'success';
      expectBorderTone(call.render(120), tone);
      expectBorderTone(output.render(120), tone);
    }
  });

  describe.each([false, true])('expanded=%s', (expanded) => {
    it.each(
      lifecycleCases,
    )('isPartial=%s, isError=%s -> %s on call and result', (isPartial, isError, tone) => {
      const tool = framedTool(createTool());
      const context = toolContext(isPartial, isError);
      const output = tool.renderResult(
        result,
        { expanded, isPartial },
        theme,
        context,
      );
      // Pi re-invokes renderCall with the latest lifecycle after every result.
      const call = tool.renderCall(args, theme, context);
      // Error-marked streaming output does not end shell/generic execution.
      const expectedTone =
        isPartial && ['bash', 'powershell', 'generic'].includes(_name)
          ? 'accent'
          : tone;
      expectBorderTone(call.render(120), expectedTone);
      expectBorderTone(output.render(120), expectedTone);
    });
  });
});

function textResult(
  text: string,
  details: unknown = {},
): AgentToolResult<unknown> {
  return { content: [{ type: 'text', text }], details };
}
const imageResult: AgentToolResult<unknown> = {
  content: [{ type: 'image', data: '', mimeType: 'image/png' }],
  details: {},
};
const branchCases: Array<{
  tool: string;
  name: string;
  result: AgentToolResult<unknown>;
  args?: Record<string, unknown>;
}> = [
  ...builtIns.map(([tool]) => ({
    tool,
    name: 'empty output',
    result: textResult(''),
    args: {},
  })),
  { tool: 'read', name: 'image', result: imageResult },
  { tool: 'generic', name: 'image', result: imageResult },
  {
    tool: 'grep',
    name: 'raw output',
    result: textResult('ambiguous raw data'),
  },
  {
    tool: 'grep',
    name: 'limited raw output',
    result: textResult(
      'file.ts:1:text\n\n[1 matches limit reached. Use limit=2 for more, or refine pattern]',
      { matchLimitReached: 1 },
    ),
  },
  {
    tool: 'find',
    name: 'limited entries',
    result: textResult('file.ts\n\n[1 results limit reached]', {
      resultLimitReached: 1,
    }),
  },
  {
    tool: 'ls',
    name: 'limited entries',
    result: textResult(
      'file.ts\n\n[1 entries limit reached. Use limit=2 for more]',
      { entryLimitReached: 1 },
    ),
  },
  {
    tool: 'ls',
    name: 'empty directory message',
    result: textResult('(empty directory)'),
  },
  ...builtIns.map(([tool]) => ({
    tool,
    name: 'long output',
    result: textResult(
      Array.from({ length: 12 }, (_, i) => `file.ts:${i + 1}:text`).join('\n'),
      { diff: '+new\n'.repeat(12) },
    ),
    args: { ...args, content: 'line\n'.repeat(12) },
  })),
];

describe.each(branchCases)('$tool $name border paths', (branch) => {
  it.each([
    true,
    false,
  ])('isPartial=%s keeps call/result tones consistent in every branch', (isPartial) => {
    const definition = builtIns.find(([name]) => name === branch.tool);
    if (!definition) throw new Error(`Unknown built-in: ${branch.tool}`);
    const tool = framedTool(definition[1]());
    const context = {
      ...toolContext(isPartial, false),
      args: branch.args ?? args,
      state: { startedAt: Date.now() - 5250 },
    };
    const tone = isPartial ? 'accent' : 'success';
    for (const expanded of [false, true]) {
      const output = tool.renderResult(
        branch.result,
        { expanded, isPartial },
        theme,
        context,
      );
      const call = tool.renderCall(context.args, theme, context);
      expectBorderTone(call.render(120), tone);
      const outputLines = output.render(120);
      expectBorderTone(outputLines, tone);
      expect(stripTerminalSequences(outputLines.at(-1) ?? '')).toMatch(
        isPartial ? /╰── [△◭▲◮] · 5s / : /╰── \uf00c · 5s(?: ·| )/,
      );
    }
  });
});

describe.each([
  ['grep', createCustomGrepTool],
  ['find', createCustomFindTool],
  ['ls', createCustomLsTool],
] as const)('%s standalone box call', (_name, createTool) => {
  it.each(
    lifecycleCases,
  )('isPartial=%s, isError=%s -> %s', (isPartial, isError, tone) => {
    expectBorderTone(
      createTool(cwd, config)
        .renderCall(args, theme, { cwd, isPartial, isError })
        .render(120),
      tone,
    );
  });
});

it.each([
  true,
  false,
])('standalone grep raw result uses the box tone for isPartial=%s', (isPartial) => {
  expectBorderTone(
    createCustomGrepTool(cwd, config)
      .renderResult(
        textResult('ambiguous raw data'),
        { expanded: true, isPartial },
        theme,
        { cwd, isPartial, isError: false },
      )
      .render(120),
    isPartial ? 'accent' : 'success',
  );
});
