import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  type AgentToolResult,
  createFindToolDefinition,
  createGrepToolDefinition,
  createLsToolDefinition,
  type ExtensionToolContext,
  type Theme,
} from '@earendil-works/pi-coding-agent';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ThemeConfig } from '../shared/config.ts';
import { createCustomFindTool } from './find.ts';
import { createCustomGrepTool } from './grep.ts';
import { createCustomLsTool } from './ls.ts';

const config: ThemeConfig = {
  icons: 'ascii',
  statusLine: { enabled: true, subscriptionProviders: ['claude-bridge'] },
  tools: { enabled: true },
  images: { enabled: true },
  welcome: { enabled: true },
};
const cwd = process.cwd();
const expanded = { expanded: true, isPartial: false };

function textResult(
  text: string,
  details?: Record<string, unknown>,
): AgentToolResult<unknown> {
  return { content: [{ type: 'text', text }], details };
}

function sdkText(result: AgentToolResult<unknown>): string {
  const block = result.content[0];
  if (block.type !== 'text') throw new Error('Expected SDK text output');
  return block.text;
}

function trackingTheme() {
  const styled: { color: string; text: string }[] = [];
  const theme = {
    fg: (color: string, text: string) => {
      styled.push({ color, text });
      return text;
    },
  } as unknown as Theme;
  return { theme, styled };
}

describe('Lossless SDK listing and search result rendering', () => {
  it('grep keeps a carriage-return filename distinct from a filename without it', () => {
    const grep = createCustomGrepTool(cwd, config);
    const { theme, styled } = trackingTheme();
    const result = textResult('a\rb.ts:2: needle\nab.ts:3: other');
    const original = structuredClone(result);
    const lines = grep.renderResult(result, expanded, theme, {}).render(200);

    expect(
      styled
        .filter(({ color }) => color === 'toolTitle')
        .map(({ text }) => text),
    ).toEqual(['a␍b.ts', 'ab.ts']);
    expect(lines.some((line) => line.includes('a␍b.ts (1 match)'))).toBe(true);
    expect(lines.some((line) => line.endsWith('2:  needle'))).toBe(true);
    expect(lines.some((line) => line.includes('\r'))).toBe(false);
    expect(result).toEqual(original);
  });

  it('grep visibly escapes controls in grouped filenames, match content and context without dropping tabs', () => {
    const { theme, styled } = trackingTheme();
    const lines = createCustomGrepTool(cwd, config)
      .renderResult(
        textResult(
          'a\rb.ts-1- before\r\x07\t\na\rb.ts:2: needle\r\x1b[2J\na\x1bb.ts:3: needle',
        ),
        expanded,
        theme,
        {},
      )
      .render(200);

    expect(
      styled
        .filter(({ color }) => color === 'toolTitle')
        .map(({ text }) => text),
    ).toEqual(['a␍b.ts', 'a␛b.ts']);
    expect(styled).toContainEqual({ color: 'dim', text: ' before␍␇\t' });
    expect(styled).toContainEqual({
      color: 'toolOutput',
      text: ' needle␍␛[2J',
    });
    expect(lines.some((line) => line.endsWith(' needle␍␛[2J'))).toBe(true);
    expect(
      styled.some(({ text }) =>
        [...text].some((char) => char !== '\t' && char.charCodeAt(0) < 0x20),
      ),
    ).toBe(false);
  });

  it.each([
    {
      name: 'an opaque SDK row',
      details: {},
      extra: ['\r', '\x1b[2J'],
      displayedExtra: ['␍', '␛[2J'],
    },
    {
      name: 'an SDK match limit',
      details: { matchLimitReached: 1 },
      extra: [],
      displayedExtra: [],
    },
  ])('grep escapes CR and terminal controls in the whole raw result for $name', ({
    details,
    extra,
    displayedExtra,
  }) => {
    const { theme, styled } = trackingTheme();
    const data = ['a\rb.ts:2: needle\r\x1b[2J\t', ...extra];
    const expected = ['a␍b.ts:2: needle␍␛[2J\t', ...displayedExtra];
    const lines = createCustomGrepTool(cwd, config)
      .renderResult(textResult(data.join('\n'), details), expanded, theme, {})
      .render(200);

    expect(styled.filter(({ color }) => color === 'toolTitle')).toEqual([]);
    expect(
      styled
        .filter(({ color }) => color === 'toolOutput')
        .map(({ text }) => text),
    ).toEqual(expected);
    expect(lines).toHaveLength(data.length + 2);
    for (const [i, line] of expected.entries()) {
      expect(lines[i + 1].slice(4, 4 + line.length)).toBe(line);
    }
    expect(
      lines.some((line) =>
        [...line].some((char) => char !== '\t' && char.charCodeAt(0) < 0x20),
      ),
    ).toBe(false);
  });

  it.each([
    'ls',
    'find',
  ])('%s preserves SDK control-character filenames and displays visible escapes', async (name) => {
    const entries = new Map([
      ['a\rb.ts', 'a␍b.ts'],
      ['ab.ts', 'ab.ts'],
      ['evil\x1b[2J.ts', 'evil␛[2J.ts'],
      ['\r', '␍'],
      ['\tname.ts', '\tname.ts'],
    ]);
    const names = [...entries.keys()];
    const sdk =
      name === 'ls'
        ? createLsToolDefinition(cwd, {
            operations: {
              exists: () => true,
              stat: (path) => ({ isDirectory: () => path === cwd }),
              readdir: () => [...names],
            },
          })
        : createFindToolDefinition(cwd, {
            operations: {
              exists: () => true,
              glob: () => [...names],
            },
          });
    const result = await sdk.execute(
      'sdk-control-filenames',
      { path: '.', pattern: '*' },
      undefined,
      undefined,
      { cwd } as ExtensionToolContext,
    );
    const data = sdkText(result).split('\n');
    expect(data).toHaveLength(names.length);
    expect(data).toEqual(expect.arrayContaining(names));
    const original = structuredClone(result);
    const { theme, styled } = trackingTheme();
    const tool =
      name === 'ls'
        ? createCustomLsTool(cwd, config)
        : createCustomFindTool(cwd, config);
    const lines = tool.renderResult(result, expanded, theme, {}).render(200);

    const displayed = data.map((entry) => entries.get(entry));
    expect(
      styled
        .filter(({ color }) => color === 'toolOutput')
        .map(({ text }) => text),
    ).toEqual(displayed);
    expect(lines).toHaveLength(data.length);
    for (const [i, entry] of displayed.entries()) {
      expect(lines[i].endsWith(entry ?? '')).toBe(true);
    }
    expect(
      lines.some((line) =>
        [...line].some((char) => char !== '\t' && char.charCodeAt(0) < 0x20),
      ),
    ).toBe(false);
    expect(result).toEqual(original);
  });

  it.each([
    ['ls', createCustomLsTool],
    ['find', createCustomFindTool],
  ] as const)('%s treats notice-like filenames as data without SDK metadata', (_name, createTool) => {
    const tool = createTool(cwd, config);
    const { theme, styled } = trackingTheme();
    const entries = [
      '[notes for more]',
      '[truncated]',
      '[50KB limit reached]',
      '  spaced path  ',
      '',
      '[50.0KB limit reached]',
    ];
    const lines = tool
      .renderResult(textResult(entries.join('\n')), expanded, theme, {})
      .render(200);

    expect(styled.filter(({ color }) => color === 'warning')).toEqual([]);
    expect(lines).toHaveLength(5);
    for (const entry of entries.filter(Boolean)) {
      expect(lines.some((line) => line.endsWith(entry))).toBe(true);
      expect(styled).toContainEqual({ color: 'toolOutput', text: entry });
    }
  });

  it('grep keeps notice-like filenames and unconfirmed appendices as data', () => {
    const grep = createCustomGrepTool(cwd, config);
    const { theme, styled } = trackingTheme();
    const data = [
      '[notes for more]:21: [needle]',
      '[truncated]:22: [needle]',
      '[50KB limit reached]:23: [needle]',
      '',
      '[50.0KB limit reached]',
    ];
    const result = textResult(data.join('\n'));
    const lines = grep.renderResult(result, expanded, theme, {}).render(200);

    expect(styled.filter(({ color }) => color === 'warning')).toEqual([]);
    expect(styled.filter(({ color }) => color === 'toolTitle')).toEqual([]);
    expect(
      styled
        .filter(({ color }) => color === 'toolOutput')
        .map(({ text }) => text),
    ).toEqual(data);
    expect(lines).toHaveLength(data.length + 2);
    for (const [i, line] of data.entries()) {
      expect(lines[i + 1].slice(4, 4 + line.length)).toBe(line);
    }
  });

  it.each([
    {
      name: 'complete nonnumeric hyphenated filename, even before the match',
      output: [
        'part-final-file.ts-20- before',
        'part-final-file.ts:21: [needle]',
        'part-final-file.ts-22- after  ',
      ],
      files: ['part-final-file.ts'],
      context: [' before', ' after  '],
    },
    {
      name: 'Windows drive path with spaces and a nonnumeric dash segment',
      output: [
        String.raw`C:\some dir\part-final-file.ts-20- before`,
        String.raw`C:\some dir\part-final-file.ts:21: [needle]`,
        String.raw`C:\some dir\part-final-file.ts-22- after  `,
      ],
      files: [String.raw`C:\some dir\part-final-file.ts`],
      context: [' before', ' after  '],
    },
    {
      name: 'Windows UNC path with a nonnumeric hyphenated filename',
      output: [
        String.raw`\\server\some dir\part-final-file.ts-20- before`,
        String.raw`\\server\some dir\part-final-file.ts:21: [needle]`,
        String.raw`\\server\some dir\part-final-file.ts-22- after  `,
      ],
      files: [String.raw`\\server\some dir\part-final-file.ts`],
      context: [' before', ' after  '],
    },
    {
      name: 'POSIX filename with a nonnumeric colon and dash segment',
      output: [
        'src/tags:notes-final.ts-20- before',
        'src/tags:notes-final.ts:21: [needle]',
        'src/tags:notes-final.ts-22- after  ',
      ],
      files: ['src/tags:notes-final.ts'],
      context: [' before', ' after  '],
    },
    {
      name: 'unique orphan context before another file match',
      output: ['unseen-final-file.ts-20- before  ', 'known.ts:21: [needle]'],
      files: ['unseen-final-file.ts', 'known.ts'],
      context: [' before  '],
    },
  ])('grep resolves context losslessly for $name', ({
    output,
    files,
    context,
  }) => {
    const grep = createCustomGrepTool(cwd, config);
    const { theme, styled } = trackingTheme();
    const lines = grep
      .renderResult(textResult(output.join('\n')), expanded, theme, {})
      .render(200);

    expect(
      styled
        .filter(({ color }) => color === 'toolTitle')
        .map(({ text }) => text),
    ).toEqual(files);
    for (const text of context) {
      expect(styled).toContainEqual({ color: 'dim', text });
      expect(lines.some((line) => line.endsWith(text))).toBe(true);
    }
    expect(lines.some((line) => line.includes('21:  [needle]'))).toBe(true);
  });

  it.each([
    {
      name: 'numeric dash in a POSIX filename without established orphan matches',
      output: [
        'part-123-file.ts-20- before',
        'part-123-file.ts:21: [needle]',
        'part-123-file.ts-22- after  ',
      ],
    },
    {
      name: 'numeric dash in a Windows drive filename',
      output: [
        String.raw`C:\some dir\part-123-file.ts-20- before`,
        String.raw`C:\some dir\part-123-file.ts:21: [needle]`,
        String.raw`C:\some dir\part-123-file.ts-22- after  `,
      ],
    },
    {
      name: 'numeric dash in a Windows UNC filename',
      output: [
        String.raw`\\server\some dir\part-123-file.ts-20- before`,
        String.raw`\\server\some dir\part-123-file.ts:21: [needle]`,
        String.raw`\\server\some dir\part-123-file.ts-22- after  `,
      ],
    },
    {
      name: 'nonnumeric colon and numeric dash in a POSIX filename',
      output: [
        'src/tags:notes-123-final.ts-20- before',
        'src/tags:notes-123-final.ts:21: [needle]',
        'src/tags:notes-123-final.ts-22- after  ',
      ],
    },
    {
      name: 'ambiguous orphan context before another file match',
      output: ['unseen-123-file.ts-20- before  ', 'known.ts:21: [needle]'],
    },
    {
      name: 'orphan context containing a colon-number delimiter',
      output: [
        'grep.ts-1- before-1 context-1 …',
        'grep.ts-2- log:404: context-2 …',
      ],
    },
    {
      name: '101 colon-containing orphan contexts without SDK metadata',
      output: Array.from(
        { length: 101 },
        (_, i) => `grep.ts-${i + 1}- log:404: context-${i + 1} …`,
      ),
    },
    {
      name: 'zero-candidate data, leading and trailing blanks around a match',
      output: ['', 'known.ts:21: [needle]', '', '  unstructured output  ', ''],
    },
    {
      name: 'native no-matches text',
      output: ['No matches found'],
    },
    {
      name: 'Windows context containing a colon-number delimiter',
      output: [
        String.raw`C:\some dir\part-123-file.ts-20- log:404: before`,
        String.raw`C:\some dir\part-123-file.ts:21: [needle]`,
      ],
    },
    {
      name: 'POSIX filename containing a colon-number delimiter',
      output: [
        'src/tags:123:notes.ts-20- before',
        'src/tags:123:notes.ts:21: [needle]',
        'src/tags:123:notes.ts-22- after  ',
      ],
    },
    {
      name: 'two established filenames fitting a context prefix',
      output: [
        'part:1: [needle]',
        'part-123-file.ts-20- before  ',
        'part-123-file.ts:21: [needle]',
      ],
    },
    {
      name: 'match and context interpretations of the same line',
      output: ['part:1: [needle]', 'part-123-file.ts:21: [needle]'],
    },
    {
      name: 'multiple match delimiters in Windows match content',
      output: [
        String.raw`C:\some dir\file.ts:1: [needle]`,
        '',
        String.raw`C:\some dir\file.ts:21: log:404: [needle]  `,
        '  unstructured output  ',
      ],
    },
    {
      name: 'overlapping colon delimiters in a POSIX filename and line number',
      output: ['src/name:123:21: [needle]'],
    },
    {
      name: 'overlapping dash delimiters fitting two established filenames',
      output: [
        'part:1: [needle]',
        'part-123:2: [needle]',
        'part-123-20- before  ',
      ],
    },
  ])('grep renders the whole result verbatim without phantom groups for $name', ({
    output,
  }) => {
    const grep = createCustomGrepTool(cwd, config);
    const { theme, styled } = trackingTheme();
    const lines = grep
      .renderResult(textResult(output.join('\n')), expanded, theme, {})
      .render(200);

    expect(
      styled
        .filter(({ color }) => color === 'toolOutput')
        .map(({ text }) => text),
    ).toEqual(output);
    expect(styled.filter(({ color }) => color === 'toolTitle')).toEqual([]);
    expect(styled.filter(({ color }) => color === 'warning')).toEqual([]);
    expect(lines).toHaveLength(output.length + 2);
    for (const [i, line] of output.entries()) {
      expect(lines[i + 1].slice(4, 4 + line.length)).toBe(line);
    }
    expect(lines[0]).toContain('╭');
    expect(lines.at(-1)).toContain('╯');
  });

  it('ls preserves the empty-directory filename among entries and entry whitespace', () => {
    const ls = createCustomLsTool(cwd, config);
    const { theme } = trackingTheme();
    const entries = ['(empty directory)', '  padded name  ', 'other.ts'];
    const lines = ls
      .renderResult(textResult(entries.join('\n')), expanded, theme, {})
      .render(200);

    expect(lines).toHaveLength(3);
    for (const entry of entries) {
      expect(lines.some((line) => line.endsWith(entry))).toBe(true);
    }
  });
});

describe('SDK-produced notice appendices', () => {
  beforeEach(() => vi.stubEnv('PI_OFFLINE', '1'));
  afterEach(() => vi.unstubAllEnvs());

  it.for([
    {
      name: 'ls',
      createSdk: createLsToolDefinition,
      createCustom: createCustomLsTool,
      notice: '[12 entries limit reached. Use limit=24 for more]',
      details: { entryLimitReached: 12 },
    },
    {
      name: 'find',
      createSdk: createFindToolDefinition,
      createCustom: createCustomFindTool,
      notice:
        '[12 results limit reached. Use limit=24 for more, or refine pattern]',
      details: { resultLimitReached: 12 },
    },
  ] as const)('recognizes the native $name appendix and expands every SDK data line', async ({
    createSdk,
    createCustom,
    notice,
    details,
  }, context) => {
    const dir = await mkdtemp(join(tmpdir(), 'pi-thoth-notice-'));
    const names = [
      '(empty directory)',
      '[notes for more]',
      '[truncated]',
      '[50KB limit reached]',
      '[50.0KB limit reached]',
      notice,
      ...Array.from({ length: 10 }, (_, i) => `file-${i}.ts`),
    ];
    try {
      await Promise.all(
        names.map((name) => writeFile(join(dir, name), 'data')),
      );
      const result = await createSdk(dir).execute(
        'sdk-list-notice',
        { path: '.', pattern: '*', limit: 12 },
        AbortSignal.timeout(3000),
        undefined,
        { cwd: dir } as ExtensionToolContext,
      );
      expect(result.details).toMatchObject(details);
      const text = sdkText(result);
      expect(text.endsWith(`\n\n${notice}`)).toBe(true);
      const data = text.slice(0, -`\n\n${notice}`.length).split('\n');
      expect(data).toHaveLength(12);

      const tool = createCustom(dir, config);
      const { theme, styled } = trackingTheme();
      const lines = tool.renderResult(result, expanded, theme, {}).render(300);
      expect(styled.filter(({ color }) => color === 'warning')).toEqual([
        { color: 'warning', text: notice },
      ]);
      expect(lines).toHaveLength(13);
      for (const entry of data) {
        expect(lines.some((line) => line.endsWith(entry))).toBe(true);
        expect(styled).toContainEqual({ color: 'toolOutput', text: entry });
      }
      const collapsed = tool
        .renderResult(result, { ...expanded, expanded: false }, theme, {})
        .render(300);
      expect(collapsed.some((line) => line.includes('ctrl+o to expand'))).toBe(
        true,
      );
      expect(collapsed.some((line) => line.endsWith(notice))).toBe(true);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'fd is not available and could not be downloaded'
      ) {
        context.skip('Optional native SDK test: fd is unavailable offline');
      }
      throw error;
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it.each([
    {
      name: 'ls',
      limit: 400,
      notice:
        '[400 entries limit reached. Use limit=800 for more. 50.0KB limit reached]',
    },
    {
      name: 'find',
      limit: 400,
      notice: '[400 results limit reached. 50.0KB limit reached]',
    },
    { name: 'ls', limit: 1000, notice: '[50.0KB limit reached]' },
    { name: 'find', limit: 1000, notice: '[50.0KB limit reached]' },
  ])('recognizes SDK $name byte truncation with limit=$limit and preserves all returned entries', async ({
    name,
    limit,
    notice,
  }) => {
    // Use SDK pluggable remote operations to exceed 50KB without filesystem or binary dependencies.
    const entries = [
      '[notes for more]',
      '[truncated]',
      '[50KB limit reached]',
      '[50.0KB limit reached]',
      ...Array.from(
        { length: 401 },
        (_, i) => `${String(i).padStart(4, '0')}-${'x'.repeat(190)}.ts`,
      ),
    ];
    const sdk =
      name === 'ls'
        ? createLsToolDefinition(cwd, {
            operations: {
              exists: () => true,
              stat: (path) => ({ isDirectory: () => path === cwd }),
              readdir: () => [...entries],
            },
          })
        : createFindToolDefinition(cwd, {
            operations: {
              exists: () => true,
              glob: (_pattern, _dir, options) =>
                entries.slice(0, options.limit),
            },
          });
    const result = await sdk.execute(
      'sdk-byte-notice',
      { path: '.', pattern: '*', limit },
      undefined,
      undefined,
      { cwd } as ExtensionToolContext,
    );
    expect(result.details).toMatchObject({ truncation: { truncated: true } });
    const text = sdkText(result);
    expect(text.endsWith(`\n\n${notice}`)).toBe(true);
    const data = text.slice(0, -`\n\n${notice}`.length).split('\n');
    expect(data.length).toBeGreaterThan(8);
    expect(data).toContain('[50.0KB limit reached]');

    const tool =
      name === 'ls'
        ? createCustomLsTool(cwd, config)
        : createCustomFindTool(cwd, config);
    const { theme, styled } = trackingTheme();
    const lines = tool.renderResult(result, expanded, theme, {}).render(400);
    expect(styled.filter(({ color }) => color === 'warning')).toEqual([
      { color: 'warning', text: notice },
    ]);
    expect(
      styled
        .filter(({ color }) => color === 'toolOutput')
        .map(({ text }) => text),
    ).toEqual(data);
    expect(lines).toHaveLength(data.length + 1);
    for (const entry of data) {
      expect(lines.some((line) => line.endsWith(entry))).toBe(true);
    }
  });

  it('renders SDK grep match/line-truncation results entirely raw without losing hyphenated context', async (context) => {
    const dir = await mkdtemp(join(tmpdir(), 'pi-thoth-grep-notice-'));
    const notice =
      '[1 matches limit reached. Use limit=2 for more, or refine pattern. Some lines truncated to 500 chars. Use read tool to see full lines]';
    try {
      await writeFile(
        join(dir, 'part-123-file.ts'),
        `before  \nneedle ${'x'.repeat(600)}\nafter  \n`,
      );
      const result = await createGrepToolDefinition(dir).execute(
        'sdk-grep-notice',
        { pattern: 'needle', limit: 1, context: 1 },
        AbortSignal.timeout(3000),
        undefined,
        { cwd: dir } as ExtensionToolContext,
      );
      expect(result.details).toMatchObject({
        matchLimitReached: 1,
        linesTruncated: true,
      });
      const text = sdkText(result);
      expect(text.endsWith(`\n\n${notice}`)).toBe(true);
      const data = text.slice(0, -`\n\n${notice}`.length).split('\n');
      expect(data).toHaveLength(3);
      expect(data[0]).toBe('part-123-file.ts-1- before  ');
      expect(data[2]).toBe('part-123-file.ts-3- after  ');
      const { theme, styled } = trackingTheme();
      const lines = createCustomGrepTool(dir, config)
        .renderResult(result, expanded, theme, {})
        .render(1000);
      expect(styled.filter(({ color }) => color === 'warning')).toEqual([
        { color: 'warning', text: notice },
      ]);
      expect(styled.filter(({ color }) => color === 'toolTitle')).toEqual([]);
      expect(
        styled
          .filter(({ color }) => color === 'toolOutput')
          .map(({ text }) => text),
      ).toEqual(data);
      expect(lines).toHaveLength(data.length + 4);
      for (const [i, line] of data.entries()) {
        expect(lines[i + 1].slice(4, 4 + line.length)).toBe(line);
      }
      expect(lines[data.length + 1].slice(4, -2)).toMatch(/^ *$/);
      expect(lines[data.length + 2].slice(4, 4 + notice.length)).toBe(notice);
      expect(lines[0]).toContain('╭');
      expect(lines.at(-1)).toContain('╯');
    } catch (error) {
      if (
        error instanceof Error &&
        error.message ===
          'ripgrep (rg) is not available and could not be downloaded'
      ) {
        context.skip('Optional native SDK test: rg is unavailable offline');
      }
      throw error;
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it.each([
    { name: 'match limit', details: { matchLimitReached: 1 } },
    {
      name: 'byte truncation',
      details: { truncation: { truncated: true, truncatedBy: 'bytes' } },
    },
    {
      name: 'line truncation',
      details: { truncation: { truncated: true, truncatedBy: 'lines' } },
    },
    { name: 'long-line truncation', details: { linesTruncated: true } },
  ])('renders uniquely interpretable grep output entirely raw when SDK metadata reports $name', ({
    details,
  }) => {
    const data = [
      'grep.ts-1- before  ',
      'grep.ts:2: needle',
      'grep.ts-3- after',
    ];
    const { theme, styled } = trackingTheme();
    const lines = createCustomGrepTool(cwd, config)
      .renderResult(textResult(data.join('\n'), details), expanded, theme, {})
      .render(200);

    expect(styled.filter(({ color }) => color === 'toolTitle')).toEqual([]);
    expect(
      styled
        .filter(({ color }) => color === 'toolOutput')
        .map(({ text }) => text),
    ).toEqual(data);
    expect(lines).toHaveLength(data.length + 2);
    for (const [i, line] of data.entries()) {
      expect(lines[i + 1].slice(4, 4 + line.length)).toBe(line);
    }
  });

  it.each([
    false,
    true,
  ])('keeps byte-truncated orphan contexts raw without phantom groups (all-colon=%s)', (allColon) => {
    const notice = '[50.0KB limit reached]';
    const data = Array.from(
      { length: 101 },
      (_, i) =>
        `grep.ts-${i + 1}- ${!allColon && i === 0 ? 'before-1' : 'log:404:'} context-${i + 1} …`,
    );
    const { theme, styled } = trackingTheme();
    const lines = createCustomGrepTool(cwd, config)
      .renderResult(
        textResult(`${data.join('\n')}\n\n${notice}`, {
          truncation: { truncated: true, truncatedBy: 'bytes' },
        }),
        expanded,
        theme,
        {},
      )
      .render(200);

    expect(styled.filter(({ color }) => color === 'toolTitle')).toEqual([]);
    expect(
      styled
        .filter(({ color }) => color === 'toolOutput')
        .map(({ text }) => text),
    ).toEqual(data);
    expect(styled.filter(({ color }) => color === 'warning')).toEqual([
      { color: 'warning', text: notice },
    ]);
    expect(lines).toHaveLength(data.length + 4);
    for (const [i, line] of data.entries()) {
      expect(lines[i + 1].slice(4, 4 + line.length)).toBe(line);
    }
    expect(lines[data.length + 1].slice(4, -2)).toMatch(/^ *$/);
    expect(lines[data.length + 2].slice(4, 4 + notice.length)).toBe(notice);
  });

  it('preserves the real SDK byte-truncated context prefix when its match has been removed', async (context) => {
    const dir = await mkdtemp(join(tmpdir(), 'pi-thoth-grep-byte-'));
    const notice = '[50.0KB limit reached]';
    try {
      const before = Array.from(
        { length: 150 },
        (_, i) =>
          `${i === 0 ? 'before-1' : 'log:404:'} context-${i + 1} ${'x'.repeat(450)}`,
      );
      await writeFile(
        join(dir, 'grep.ts'),
        [...before, 'needle', ''].join('\n'),
      );
      const result = await createGrepToolDefinition(dir).execute(
        'sdk-grep-byte',
        { pattern: 'needle', limit: 1000, context: 150 },
        AbortSignal.timeout(3000),
        undefined,
        { cwd: dir } as ExtensionToolContext,
      );
      expect(result.details).toMatchObject({
        truncation: { truncated: true, truncatedBy: 'bytes' },
      });
      expect(result.details?.matchLimitReached).toBeUndefined();
      expect(result.details?.linesTruncated).toBeUndefined();
      const text = sdkText(result);
      expect(text.endsWith(`\n\n${notice}`)).toBe(true);
      const data = text.slice(0, -`\n\n${notice}`.length).split('\n');
      expect(data.length).toBeGreaterThan(100);
      expect(data[0]).toBe(`grep.ts-1- ${before[0]}`);
      expect(data[1]).toBe(`grep.ts-2- ${before[1]}`);
      expect(data.some((line) => line.includes('needle'))).toBe(false);

      const { theme, styled } = trackingTheme();
      const lines = createCustomGrepTool(dir, config)
        .renderResult(result, expanded, theme, {})
        .render(1000);
      expect(styled.filter(({ color }) => color === 'toolTitle')).toEqual([]);
      expect(
        styled
          .filter(({ color }) => color === 'toolOutput')
          .map(({ text }) => text),
      ).toEqual(data);
      expect(styled.filter(({ color }) => color === 'warning')).toEqual([
        { color: 'warning', text: notice },
      ]);
      expect(lines).toHaveLength(data.length + 4);
      for (const [i, line] of data.entries()) {
        expect(lines[i + 1].slice(4, 4 + line.length)).toBe(line);
      }
      expect(lines[data.length + 1].slice(4, -2)).toMatch(/^ *$/);
      expect(lines[data.length + 2].slice(4, 4 + notice.length)).toBe(notice);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message ===
          'ripgrep (rg) is not available and could not be downloaded'
      ) {
        context.skip('Optional native SDK test: rg is unavailable offline');
      }
      throw error;
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('recognizes the SDK empty-directory result only as a whole result', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pi-thoth-empty-ls-'));
    try {
      const result = await createLsToolDefinition(dir).execute(
        'sdk-empty-ls',
        {},
        undefined,
        undefined,
        { cwd: dir } as ExtensionToolContext,
      );
      expect(sdkText(result)).toBe('(empty directory)');
      const { theme } = trackingTheme();
      expect(
        createCustomLsTool(dir, config)
          .renderResult(result, expanded, theme, {})
          .render(200),
      ).toEqual(['empty directory']);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
