import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ImageContent, TextContent } from '@earendil-works/pi-ai';
import type {
  AgentToolResult,
  ExtensionToolContext,
  Theme,
  ToolRenderResultOptions,
} from '@earendil-works/pi-coding-agent';
import { createReadToolDefinition } from '@earendil-works/pi-coding-agent';
import { stripTerminalSequences, visibleWidth } from '@earendil-works/pi-tui';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ThemeConfig } from '../shared/config.ts';
import { createCustomBashTool } from './bash.ts';
import { createCustomEditTool } from './edit.ts';
import { createCustomFindTool } from './find.ts';
import { createCustomGrepTool } from './grep.ts';
import { createCustomLsTool } from './ls.ts';
import { createCustomReadTool } from './read.ts';
import { createCustomWriteTool } from './write.ts';

function createConfig(icons: 'nerd' | 'ascii'): ThemeConfig {
  return {
    icons,
    statusLine: { enabled: true },
    tools: { enabled: true },
    images: { enabled: true },
    welcome: { enabled: true },
  };
}

function resultOpts(
  expanded = false,
  isPartial = false,
): ToolRenderResultOptions {
  return { expanded, isPartial };
}

function textResult(
  text: string,
  details: Record<string, unknown> = {},
): AgentToolResult<unknown> {
  return {
    content: [{ type: 'text', text } as TextContent],
    details,
  };
}

function createAnsiTheme(): Theme {
  return {
    fg: (_color: string, text: string) => `\x1b[33m${text}\x1b[39m`,
    bg: (_color: string, text: string) => `\x1b[40m${text}\x1b[49m`,
    bold: (text: string) => `\x1b[1m${text}\x1b[22m`,
    italic: (text: string) => text,
    underline: (text: string) => text,
    strikethrough: (text: string) => text,
    inverse: (text: string) => text,
    reset: (text: string) => text,
  } as unknown as Theme;
}

function createTrackingTheme() {
  const colorsUsed: string[] = [];
  const theme = {
    fg: (color: string, text: string) => {
      colorsUsed.push(color);
      return text;
    },
    bg: (_color: string, text: string) => text,
    bold: (text: string) => text,
    italic: (text: string) => text,
    underline: (text: string) => text,
    strikethrough: (text: string) => text,
    inverse: (text: string) => text,
    reset: (text: string) => text,
  } as unknown as Theme;
  return { theme, colorsUsed };
}

// Decode only presentation (ANSI, tree prefixes, icons, headers and box padding),
// never parse the SDK input. Compare against escaped SDK rows, using literal
// control-picture expectations independent of the production escape helper.
function expectGrepDataRows(
  rendered: string[],
  sdkRows: string[],
  mode: 'grouped' | 'raw',
) {
  const plain = rendered.map(stripTerminalSequences);
  const escapedSdkRows = sdkRows.map((row) =>
    row
      .replaceAll('\r', '␍')
      .replaceAll('\x1b', '␛')
      .replaceAll('\x00', '␀')
      .replaceAll('\x07', '␇'),
  );
  if (mode === 'raw') {
    expect(plain.at(-1)).toMatch(/^╰─+╯$/);
    const rawLines = plain[0].startsWith('╭')
      ? plain.slice(1, -1)
      : plain.slice(0, -1);
    expect(rawLines).toHaveLength(sdkRows.length);
    const data = rawLines.map((line, i) => {
      expect(line.startsWith('│   ')).toBe(true);
      expect(line.endsWith(' │')).toBe(true);
      // Padding is decoration, but SDK whitespace within each row is data.
      expect(line.slice(4 + escapedSdkRows[i].length, -2)).toMatch(/^ *$/);
      return line.slice(4, 4 + escapedSdkRows[i].length);
    });
    expect(data).toEqual(escapedSdkRows);
    return;
  }

  let file: string | undefined;
  const data: string[] = [];
  for (const line of plain) {
    if (line.startsWith('╭') || line.startsWith('╰')) continue;
    const contentLine =
      line.startsWith('│ ') && line.endsWith(' │') ? line.slice(2, -2) : line;
    const header = /^(?: {2})?[├└]─ \S+ (.*) \(\d+ match(?:es)?\)/.exec(
      contentLine.trimEnd(),
    );
    if (header) {
      file = header[1];
      continue;
    }
    const row = /^(?: {4,5}| {1,2}│ {2}) *(\d+)([:-]) (.*)$/.exec(contentLine);
    if (!row || file === undefined) {
      throw new Error(`Unexpected grouped grep row: ${line}`);
    }
    const [, lineNumber, separator, rawContent] = row;
    const expected = escapedSdkRows[data.length];
    const prefix = `${file}${separator}${lineNumber}${separator}`;
    let content = rawContent;
    if (expected?.startsWith(prefix)) {
      const expectedContent = expected.slice(prefix.length);
      if (
        content.startsWith(expectedContent) &&
        /^ *$/.test(content.slice(expectedContent.length))
      ) {
        content = expectedContent;
      }
    }
    data.push(`${file}${separator}${lineNumber}${separator}${content}`);
  }
  expect(data).toEqual(escapedSdkRows);
}

describe('Built-in tool renderers', () => {
  const cwd = process.cwd();
  const baseContext = {
    args: {},
    toolCallId: 'call-1',
    invalidate: () => {},
    state: {},
    cwd,
    executionStarted: true,
    argsComplete: true,
    isPartial: false,
    expanded: false,
    showImages: true,
    isError: false,
  };

  beforeEach(() => {
    baseContext.state = {};
  });

  describe('read tool', () => {
    it('renders call in nerd and ascii modes', () => {
      const readNerd = createCustomReadTool(cwd, createConfig('nerd'));
      const readAscii = createCustomReadTool(cwd, createConfig('ascii'));
      const theme = createAnsiTheme();

      const nerdLines = readNerd
        .renderCall(
          { path: 'src/main.ts', offset: 1, limit: 10 },
          theme,
          baseContext,
        )
        .render(80);
      const asciiLines = readAscii
        .renderCall(
          { path: 'src/main.ts', offset: 1, limit: 10 },
          theme,
          baseContext,
        )
        .render(80);

      expect(nerdLines.length).toBe(2);
      expect(asciiLines.length).toBe(2);
      expect(nerdLines[0]).toContain('\ue628'); // Nerd icon for ts
      expect(asciiLines[0]).toContain('[ts]'); // ASCII icon for ts
      expect(nerdLines[0]).toContain('src/main.ts:1-10');
      expect(asciiLines[0]).toContain('src/main.ts:1-10');
    });

    it('renders collapsed result with line count and expanded with full output', () => {
      const read = createCustomReadTool(cwd, createConfig('nerd'));
      const theme = createAnsiTheme();
      const content = 'line 1\nline 2\nline 3\nline 4\nline 5';
      const result = textResult(content);

      const collapsed = read
        .renderResult(result, resultOpts(false), theme, baseContext)
        .render(80);
      expect(collapsed.length).toBe(2);
      expect(collapsed[0]).toContain('5 lines');
      expect(collapsed[0]).toContain('ctrl+o to expand');

      const expanded = read
        .renderResult(result, resultOpts(true), theme, baseContext)
        .render(80);
      expect(expanded.length).toBe(6);
      expect(expanded[0]).toContain('line 1');
      expect(expanded[4]).toContain('line 5');
    });

    it('renders error case', () => {
      const read = createCustomReadTool(cwd, createConfig('nerd'));
      const { theme, colorsUsed } = createTrackingTheme();
      const result = textResult('ENOENT: no such file or directory');
      const lines = read
        .renderResult(result, resultOpts(false), theme, {
          ...baseContext,
          isError: true,
        })
        .render(80);
      expect(lines[0]).toContain('ENOENT');
      expect(colorsUsed).toContain('error');
    });

    it.each([
      false,
      true,
    ])('preserves executed image content with expanded=%s', async (expanded) => {
      const dir = await mkdtemp(join(tmpdir(), 'pi-thoth-theme-read-'));
      const imageData =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/av8AAAAASUVORK5CYII=';
      const imageBlock: ImageContent = {
        type: 'image',
        data: imageData,
        mimeType: 'image/png',
      };

      try {
        await writeFile(
          join(dir, 'image.png'),
          Buffer.from(imageData, 'base64'),
        );
        const read = createCustomReadTool(
          dir,
          createConfig('nerd'),
          createReadToolDefinition(dir, { autoResizeImages: false }),
        );
        const result = await read.execute(
          'read-image',
          { path: 'image.png' },
          undefined,
          undefined,
          { cwd: dir } as ExtensionToolContext,
        );
        const content = result.content;
        const originalContent = structuredClone(content);
        const context = { ...baseContext, expanded };

        const rendered = read
          .renderResult(
            result,
            resultOpts(expanded),
            createAnsiTheme(),
            context,
          )
          .render(80);

        expect(result.content).toBe(content);
        expect(result.content).toEqual(originalContent);
        expect(result.content).toContainEqual(imageBlock);
        expect(rendered[0]).toContain('Read image file');
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  });

  describe('bash tool', () => {
    it('renders call in nerd and ascii modes', () => {
      const bashNerd = createCustomBashTool(cwd, createConfig('nerd'));
      const bashAscii = createCustomBashTool(cwd, createConfig('ascii'));
      const theme = createAnsiTheme();

      const nerdLines = bashNerd
        .renderCall({ command: 'pnpm test' }, theme, baseContext)
        .render(80);
      const asciiLines = bashAscii
        .renderCall({ command: 'pnpm test' }, theme, baseContext)
        .render(80);

      expect(nerdLines.some((l) => l.includes('\uf489'))).toBe(true);
      expect(asciiLines.some((l) => l.includes('$'))).toBe(true);
      expect(nerdLines.some((l) => l.includes('pnpm test'))).toBe(true);
    });

    it('renders collapsed result with output preview, exit status, and elapsed time', () => {
      const bash = createCustomBashTool(cwd, createConfig('nerd'));
      const theme = createAnsiTheme();
      const longOutput = Array.from(
        { length: 20 },
        (_, i) => `output line ${i + 1}`,
      ).join('\n');
      const result = textResult(longOutput, { exitCode: 0 });
      const context = {
        ...baseContext,
        state: { startedAt: Date.now() - 150 },
      };

      const collapsed = bash
        .renderResult(result, resultOpts(false), theme, context)
        .render(80);
      expect(collapsed.some((l) => l.includes('Exit 0'))).toBe(true);
      expect(collapsed.some((l) => l.includes('20 lines'))).toBe(true);
      expect(collapsed.some((l) => l.includes('~60 words'))).toBe(true);
      expect(collapsed.some((l) => l.includes('ctrl+o to expand'))).toBe(true);

      const expanded = bash
        .renderResult(result, resultOpts(true), theme, context)
        .render(80);
      expect(expanded.some((l) => l.includes('output line 20'))).toBe(true);
      expect(expanded.some((l) => l.includes('Exit 0'))).toBe(true);
    });

    it('renders error case with error styling and exit code', () => {
      const bash = createCustomBashTool(cwd, createConfig('nerd'));
      const { theme, colorsUsed } = createTrackingTheme();
      const result = textResult('Command failed with exit code 1', {
        exitCode: 1,
      });
      const lines = bash
        .renderResult(result, resultOpts(false), theme, {
          ...baseContext,
          isError: true,
        })
        .render(80);
      expect(lines.some((l) => l.includes('Exit 1'))).toBe(true);
      expect(colorsUsed).toContain('error');
    });
  });

  describe('ls tool', () => {
    it('renders call in nerd and ascii modes', () => {
      const lsNerd = createCustomLsTool(cwd, createConfig('nerd'));
      const lsAscii = createCustomLsTool(cwd, createConfig('ascii'));
      const theme = createAnsiTheme();

      const nerdLines = lsNerd
        .renderCall({ path: 'src' }, theme, baseContext)
        .render(80);
      const asciiLines = lsAscii
        .renderCall({ path: 'src' }, theme, baseContext)
        .render(80);

      expect(nerdLines[0]).toContain('\uf07b');
      expect(asciiLines[0]).toContain('[dir]');
      expect(nerdLines[0]).toContain('src');
    });

    it('renders result as a tree with file-type icons in nerd and ascii modes', () => {
      const lsNerd = createCustomLsTool(cwd, createConfig('nerd'));
      const lsAscii = createCustomLsTool(cwd, createConfig('ascii'));
      const theme = createAnsiTheme();
      const entries = 'index.ts\npackage.json\nreadme.md';
      const result = textResult(entries);

      const nerdLines = lsNerd
        .renderResult(result, resultOpts(false), theme, baseContext)
        .render(80);
      const asciiLines = lsAscii
        .renderResult(result, resultOpts(false), theme, baseContext)
        .render(80);

      expect(
        nerdLines.some((l) => l.includes('├─') && l.includes('\ue628')),
      ).toBe(true); // ts icon
      expect(nerdLines.some((l) => l.includes('\ue71e'))).toBe(true); // package.json icon
      expect(asciiLines.some((l) => l.includes('[ts]'))).toBe(true);
      expect(asciiLines.some((l) => l.includes('{ }'))).toBe(true);
    });

    it('collapses long lists and expands on request', () => {
      const ls = createCustomLsTool(cwd, createConfig('nerd'));
      const theme = createAnsiTheme();
      const entries = Array.from({ length: 25 }, (_, i) => `file_${i}.ts`).join(
        '\n',
      );
      const result = textResult(entries);

      const collapsed = ls
        .renderResult(result, resultOpts(false), theme, baseContext)
        .render(80);
      expect(
        collapsed.some((l) => l.includes('more files · ctrl+o to expand')),
      ).toBe(true);
      expect(collapsed.length).toBeLessThan(15);

      const expanded = ls
        .renderResult(result, resultOpts(true), theme, baseContext)
        .render(80);
      expect(expanded.length).toBe(26);
    });

    it('renders error case', () => {
      const ls = createCustomLsTool(cwd, createConfig('nerd'));
      const { theme, colorsUsed } = createTrackingTheme();
      const result = textResult('Cannot open directory');
      const lines = ls
        .renderResult(result, resultOpts(false), theme, {
          ...baseContext,
          isError: true,
        })
        .render(80);
      expect(lines[0]).toContain('Cannot open directory');
      expect(colorsUsed).toContain('error');
    });
  });

  describe('grep tool', () => {
    it('renders call in nerd and ascii modes', () => {
      const grepNerd = createCustomGrepTool(cwd, createConfig('nerd'));
      const grepAscii = createCustomGrepTool(cwd, createConfig('ascii'));
      const theme = createAnsiTheme();

      const nerdLines = grepNerd
        .renderCall({ pattern: 'ThemeConfig' }, theme, baseContext)
        .render(80);
      const asciiLines = grepAscii
        .renderCall({ pattern: 'ThemeConfig' }, theme, baseContext)
        .render(80);

      expect(nerdLines[0]).toContain('\uf002');
      expect(asciiLines[0]).toContain('?');
      expect(nerdLines[0]).toContain('ThemeConfig');
    });

    it('renders result grouped by file with match counts in nerd and ascii modes', () => {
      const grepNerd = createCustomGrepTool(cwd, createConfig('nerd'));
      const grepAscii = createCustomGrepTool(cwd, createConfig('ascii'));
      const theme = createAnsiTheme();
      const output = [
        'src/config.ts:5:export interface ThemeConfig {',
        'src/config.ts:12:export function loadConfig(): ThemeConfig',
        'src/index.ts:8:  const config: ThemeConfig = loadConfig();',
      ].join('\n');
      const result = textResult(output);

      const nerdLines = grepNerd
        .renderResult(result, resultOpts(true), theme, baseContext)
        .render(80);
      const asciiLines = grepAscii
        .renderResult(result, resultOpts(true), theme, baseContext)
        .render(80);

      expect(
        nerdLines.some(
          (l) => l.includes('src/config.ts') && l.includes('(2 matches)'),
        ),
      ).toBe(true);
      expect(
        nerdLines.some(
          (l) => l.includes('src/index.ts') && l.includes('(1 match)'),
        ),
      ).toBe(true);
      expect(nerdLines.some((l) => l.includes('\ue628'))).toBe(true);
      expect(asciiLines.some((l) => l.includes('[ts]'))).toBe(true);
    });

    it.each([
      {
        name: 'interleaved files',
        data: ['a.ts:1: first', 'b.ts:2: middle', 'a.ts:3: last'],
      },
      { name: 'zero-padded line token', data: ['grep.ts:001: needle  '] },
      {
        name: 'CR data at LF row boundaries',
        data: ['a\rb.ts:2: needle\r', 'a\rb.ts-3- after\r'],
      },
      {
        name: 'line token beyond numeric precision',
        data: ['grep.ts:9007199254740993: needle'],
      },
    ])('round-trips grouped SDK data in order for $name', ({ data }) => {
      const grep = createCustomGrepTool(cwd, createConfig('ascii'));
      const lines = grep
        .renderResult(
          textResult(data.join('\n')),
          resultOpts(true),
          createAnsiTheme(),
          baseContext,
        )
        .render(200);
      expectGrepDataRows(lines, data, 'grouped');
    });

    it.each([
      'nerd',
      'ascii',
    ] as const)('round-trips generated tricky SDK data without ever mixing raw and grouped rows (%s)', (icons) => {
      const files = [
        { file: 'src/plain.ts', ambiguous: false },
        { file: 'src/name-notes9.ts', ambiguous: false },
        { file: 'src/name:notes9.ts', ambiguous: false },
        { file: 'src/name-42.ts', ambiguous: false },
        { file: 'src/[123].ts', ambiguous: false },
        { file: 'src/name\r.ts', ambiguous: false },
        { file: 'src/name\x1b[2J.ts', ambiguous: false },
        { file: 'src/name\x00\x07.ts', ambiguous: false },
        { file: 'src/control␍␛.ts', ambiguous: false },
        { file: 'src/name\r-123-final.ts', ambiguous: true },
        { file: String.raw`C:\some dir\part-final99.ts`, ambiguous: false },
        {
          file: String.raw`\\server\some dir\part-final99.ts`,
          ambiguous: false,
        },
        { file: 'src/name:123:notes.ts', ambiguous: true },
        { file: 'src/part-123-file.ts', ambiguous: true },
        { file: 'src/part:1:2.ts', ambiguous: true },
        { file: String.raw`C:\some dir\part-123-file.ts`, ambiguous: true },
        {
          file: String.raw`\\server\some dir\part-123-file.ts`,
          ambiguous: true,
        },
      ];
      const contents = [
        { content: '', ambiguous: false },
        { content: ' needle', ambiguous: false },
        { content: '  padded needle  ', ambiguous: false },
        { content: ' colon:notes + dash-final  ', ambiguous: false },
        { content: ' digit123-tail', ambiguous: false },
        { content: ' carriage\rreturn  ', ambiguous: false },
        { content: ' trailing carriage\r', ambiguous: false },
        { content: ' ansi \x1b[2J and bell\x07\x00\t  ', ambiguous: false },
        { content: String.raw` literal \r + ␍ and ␛  `, ambiguous: false },
        { content: ' before\rlog:404: needle\x1b[2J', ambiguous: true },
        { content: String.raw` C:\dir\file99.ts`, ambiguous: false },
        { content: ' log:404: needle', ambiguous: true },
        { content: ' prefix-12- context', ambiguous: true },
        { content: ' :1:2:', ambiguous: true },
        { content: ' -1-2-', ambiguous: true },
      ];
      const grep = createCustomGrepTool(cwd, createConfig(icons));
      const theme = createAnsiTheme();
      for (const { file, ambiguous: ambiguousFile } of files) {
        for (const { content, ambiguous: ambiguousContent } of contents) {
          for (const line of ['1', '21', '0007', '9007199254740993']) {
            const data = [
              'orphan.ts-9- before any visible match  ',
              `${file}-19- before`,
              `${file}:${line}:${content}`,
              'other.ts:8: middle',
              `${file}-22- after  `,
              `${file}:23: final`,
            ];
            const rendered = grep
              .renderResult(
                textResult(data.join('\n'), {
                  linesTruncated: false,
                  truncation: { truncated: false },
                }),
                resultOpts(true),
                theme,
                baseContext,
              )
              .render(1000);
            expectGrepDataRows(
              rendered,
              data,
              ambiguousFile || ambiguousContent ? 'raw' : 'grouped',
            );
          }
        }
        for (const extra of ['', '  opaque data  ', '[50.0KB limit reached]']) {
          const data = [`${file}:1: needle`, extra, `${file}-2- after`, ''];
          const rendered = grep
            .renderResult(
              textResult(data.join('\n')),
              resultOpts(true),
              theme,
              baseContext,
            )
            .render(1000);
          expectGrepDataRows(rendered, data, 'raw');
        }
      }
    });

    it('collapses results and expands on request', () => {
      const grep = createCustomGrepTool(cwd, createConfig('nerd'));
      const theme = createAnsiTheme();
      const output = Array.from(
        { length: 15 },
        (_, i) => `file_${i}.ts:10:match found here`,
      ).join('\n');
      const result = textResult(output);

      const collapsed = grep
        .renderResult(result, resultOpts(false), theme, baseContext)
        .render(80);
      expect(
        collapsed.some(
          (l) =>
            l.includes('more matches across') && l.includes('ctrl+o to expand'),
        ),
      ).toBe(true);

      const expanded = grep
        .renderResult(result, resultOpts(true), theme, baseContext)
        .render(80);
      expect(expanded.some((l) => l.includes('file_14.ts'))).toBe(true);
    });

    it.each([
      { name: 'confirmed', details: { matchLimitReached: 1 } },
      { name: 'unconfirmed', details: {} },
    ])('preserves every raw SDK line including blanks before a $name trailing notice', ({
      details,
    }) => {
      const notice =
        '[1 matches limit reached. Use limit=2 for more, or refine pattern]';
      const grep = createCustomGrepTool(cwd, createConfig('ascii'));
      for (const text of [
        ['', 'grep.ts-1- before  ', 'grep.ts:2: needle', '', '', notice].join(
          '\n',
        ),
        `\n\n${notice}`,
      ]) {
        const rendered = grep
          .renderResult(
            textResult(text, details),
            resultOpts(true),
            createAnsiTheme(),
            baseContext,
          )
          .render(200);
        expectGrepDataRows(rendered, text.split('\n'), 'raw');
      }
    });

    it('keeps ambiguous results raw across native expansion and retains SDK notices', () => {
      const grep = createCustomGrepTool(cwd, createConfig('ascii'));
      const { theme, colorsUsed } = createTrackingTheme();
      const data = [
        String.raw`C:\some dir\part-123-file.ts-20- log:404: before`,
        String.raw`C:\some dir\part-123-file.ts:21: [needle]`,
        String.raw`C:\some dir\part-123-file.ts-22- after  `,
        ...Array.from({ length: 11 }, (_, i) => `file_${i}.ts:10: [needle]`),
      ];
      const notice =
        '[12 matches limit reached. Use limit=24 for more, or refine pattern]';
      const result = textResult(`${data.join('\n')}\n\n${notice}`, {
        matchLimitReached: 12,
      });

      const collapsed = grep
        .renderResult(result, resultOpts(false), theme, baseContext)
        .render(200);
      expect(collapsed.some((line) => line.includes(data[0]))).toBe(true);
      expect(
        collapsed.some((line) => line.includes(data[data.length - 1])),
      ).toBe(false);
      expect(collapsed.some((line) => line.includes('ctrl+o to expand'))).toBe(
        true,
      );
      expect(collapsed.some((line) => line.includes(notice))).toBe(true);

      const expanded = grep
        .renderResult(result, resultOpts(true), theme, baseContext)
        .render(200);
      for (const line of data) {
        expect(expanded.some((rendered) => rendered.includes(line))).toBe(true);
      }
      expect(expanded.some((line) => line.includes('ctrl+o to expand'))).toBe(
        false,
      );
      expect(expanded.some((line) => line.includes(notice))).toBe(true);
      expect(expanded[0]).toContain('│');
      expect(expanded.at(-1)).toContain('╯');
      expect(colorsUsed).toContain('toolOutput');
      expect(colorsUsed).toContain('warning');
      expect(colorsUsed).not.toContain('toolTitle');
    });

    it('bounds boxed raw fallback output at zero, narrow, and wide widths', () => {
      const grep = createCustomGrepTool(cwd, createConfig('nerd'));
      const theme = createAnsiTheme();
      const result = textResult(
        'src/tags:123:notes.ts-20- before\nsrc/tags:123:notes.ts:21: [needle]',
      );
      for (const width of [0, 1, 2, 4, 10, 80]) {
        for (const expanded of [false, true]) {
          const lines = grep
            .renderResult(result, resultOpts(expanded), theme, baseContext)
            .render(width);
          if (width === 0) expect(lines).toEqual([]);
          for (const line of lines) {
            expect(visibleWidth(line)).toBeLessThanOrEqual(width);
          }
        }
      }
    });

    it('renders error case', () => {
      const grep = createCustomGrepTool(cwd, createConfig('nerd'));
      const { theme, colorsUsed } = createTrackingTheme();
      const result = textResult('grep process error');
      const lines = grep
        .renderResult(result, resultOpts(false), theme, {
          ...baseContext,
          isError: true,
        })
        .render(80);
      expect(lines[0]).toContain('grep process error');
      expect(colorsUsed).toContain('error');
    });
  });

  describe('find tool', () => {
    it('renders call in nerd and ascii modes', () => {
      const findNerd = createCustomFindTool(cwd, createConfig('nerd'));
      const findAscii = createCustomFindTool(cwd, createConfig('ascii'));
      const theme = createAnsiTheme();

      const nerdLines = findNerd
        .renderCall({ pattern: '*.json' }, theme, baseContext)
        .render(80);
      const asciiLines = findAscii
        .renderCall({ pattern: '*.json' }, theme, baseContext)
        .render(80);

      expect(nerdLines[0]).toContain('\uf002');
      expect(asciiLines[0]).toContain('?');
      expect(nerdLines[0]).toContain('*.json');
    });

    it('renders result with file icons, collapsing and expanding', () => {
      const find = createCustomFindTool(cwd, createConfig('nerd'));
      const theme = createAnsiTheme();
      const paths = Array.from(
        { length: 20 },
        (_, i) => `src/file_${i}.ts`,
      ).join('\n');
      const result = textResult(paths);

      const collapsed = find
        .renderResult(result, resultOpts(false), theme, baseContext)
        .render(80);
      expect(
        collapsed.some((l) => l.includes('more matches · ctrl+o to expand')),
      ).toBe(true);

      const expanded = find
        .renderResult(result, resultOpts(true), theme, baseContext)
        .render(80);
      expect(expanded.length).toBe(21);
    });

    it('renders error case', () => {
      const find = createCustomFindTool(cwd, createConfig('nerd'));
      const { theme, colorsUsed } = createTrackingTheme();
      const result = textResult('Search directory missing');
      const lines = find
        .renderResult(result, resultOpts(false), theme, {
          ...baseContext,
          isError: true,
        })
        .render(80);
      expect(lines[0]).toContain('Search directory missing');
      expect(colorsUsed).toContain('error');
    });
  });

  describe('edit tool', () => {
    it('renders call in nerd and ascii modes', () => {
      const editNerd = createCustomEditTool(cwd, createConfig('nerd'));
      const editAscii = createCustomEditTool(cwd, createConfig('ascii'));
      const theme = createAnsiTheme();

      const nerdLines = editNerd
        .renderCall({ path: 'src/box.ts' }, theme, baseContext)
        .render(80);
      const asciiLines = editAscii
        .renderCall({ path: 'src/box.ts' }, theme, baseContext)
        .render(80);

      expect(nerdLines[0]).toContain('\uf044');
      expect(asciiLines[0]).toContain('[edit]');
      expect(nerdLines[0]).toContain('src/box.ts');
    });

    it('renders diff with toolDiffAdded and toolDiffRemoved colors and line counts', () => {
      const edit = createCustomEditTool(cwd, createConfig('nerd'));
      const { theme, colorsUsed } = createTrackingTheme();
      const diff = [
        '--- a/src/box.ts',
        '+++ b/src/box.ts',
        '@@ -1,3 +1,4 @@',
        ' line 1',
        '-old line 2',
        '+new line 2',
        '+new line 3',
      ].join('\n');
      const result: AgentToolResult<unknown> = {
        content: [
          { type: 'text', text: 'Edit applied successfully' } as TextContent,
        ],
        details: { diff },
      };

      const collapsed = edit
        .renderResult(result, resultOpts(false), theme, baseContext)
        .render(80);
      expect(collapsed.some((l) => l.includes('+2') && l.includes('-1'))).toBe(
        true,
      );
      expect(colorsUsed).toContain('toolDiffAdded');
      expect(colorsUsed).toContain('toolDiffRemoved');

      const expanded = edit
        .renderResult(result, resultOpts(true), theme, baseContext)
        .render(80);
      expect(expanded.some((l) => l.includes('+new line 3'))).toBe(true);
    });

    it('renders error case', () => {
      const edit = createCustomEditTool(cwd, createConfig('nerd'));
      const { theme, colorsUsed } = createTrackingTheme();
      const result = textResult('Could not find target content to replace');
      const lines = edit
        .renderResult(result, resultOpts(false), theme, {
          ...baseContext,
          isError: true,
        })
        .render(80);
      expect(lines.some((l) => l.includes('target content'))).toBe(true);
      expect(colorsUsed).toContain('error');
    });
  });

  describe('write tool', () => {
    it('renders call in nerd and ascii modes', () => {
      const writeNerd = createCustomWriteTool(cwd, createConfig('nerd'));
      const writeAscii = createCustomWriteTool(cwd, createConfig('ascii'));
      const theme = createAnsiTheme();

      const nerdLines = writeNerd
        .renderCall({ path: 'src/test.txt' }, theme, baseContext)
        .render(80);
      const asciiLines = writeAscii
        .renderCall({ path: 'src/test.txt' }, theme, baseContext)
        .render(80);

      expect(nerdLines[0]).toContain('\uf0c7');
      expect(asciiLines[0]).toContain('[write]');
      expect(nerdLines[0]).toContain('src/test.txt');
    });

    it('renders result with toolDiffAdded line counts', () => {
      const write = createCustomWriteTool(cwd, createConfig('nerd'));
      const { theme, colorsUsed } = createTrackingTheme();
      const content = 'first line\nsecond line\nthird line\nfourth line';
      const result = textResult('Wrote 4 lines');
      const context = {
        ...baseContext,
        args: { content },
      };

      const collapsed = write
        .renderResult(result, resultOpts(false), theme, context)
        .render(80);
      expect(collapsed.some((l) => l.includes('+4 lines'))).toBe(true);
      expect(colorsUsed).toContain('toolDiffAdded');

      const expanded = write
        .renderResult(result, resultOpts(true), theme, context)
        .render(80);
      expect(expanded.some((l) => l.includes('fourth line'))).toBe(true);
    });

    it('renders error case', () => {
      const write = createCustomWriteTool(cwd, createConfig('nerd'));
      const { theme, colorsUsed } = createTrackingTheme();
      const result = textResult('EACCES: permission denied');
      const lines = write
        .renderResult(result, resultOpts(false), theme, {
          ...baseContext,
          isError: true,
        })
        .render(80);
      expect(lines.some((l) => l.includes('EACCES'))).toBe(true);
      expect(colorsUsed).toContain('error');
    });
  });

  describe('Terminal width constraints (never exceed width)', () => {
    const testWidths = [10, 20, 40, 80, 120];
    const theme = createAnsiTheme();

    it('all tool calls and results strictly respect viewport width across narrow and wide terminals', () => {
      const tools = [
        createCustomReadTool(cwd, createConfig('nerd')),
        createCustomBashTool(cwd, createConfig('nerd')),
        createCustomLsTool(cwd, createConfig('nerd')),
        createCustomGrepTool(cwd, createConfig('nerd')),
        createCustomFindTool(cwd, createConfig('nerd')),
        createCustomEditTool(cwd, createConfig('nerd')),
        createCustomWriteTool(cwd, createConfig('nerd')),
      ];

      const callArgs = [
        {
          path: 'a/very/long/nested/path/to/some/deeply/nested/component/file.ts',
          offset: 10,
          limit: 100,
        },
        {
          command:
            'find . -name "*.ts" -exec grep -H "long search string here" {} \\; | head -n 50',
        },
        {
          path: 'a/very/long/directory/path/that/might/exceed/viewport/easily',
        },
        {
          pattern:
            'a very long pattern to search across the whole repository codebase',
          path: 'src/components',
        },
        {
          pattern: 'long-pattern-name-here-to-match-files-in-repository.ts',
          path: 'deeply/nested/dir',
        },
        {
          path: 'very/long/path/to/file/that/we/are/currently/editing/in/our/workspace.tsx',
        },
        {
          path: 'another/very/long/path/to/a/newly/written/configuration/file.json',
        },
      ];

      const dummyResult: AgentToolResult<unknown> = {
        content: [
          {
            type: 'text',
            text: 'A very long output string that goes on and on and contains lots of characters to test whether wrapping and truncation work reliably across different terminal widths without throwing any exceptions or overflowing the boundary.',
          } as TextContent,
        ],
        details: {
          exitCode: 0,
          diff: '--- a\n+++ b\n+a very long added line inside diff that should be safely bounded',
        },
      };

      for (let i = 0; i < tools.length; i++) {
        const tool = tools[i];
        const args = callArgs[i];

        for (const width of testWidths) {
          const callLines = tool
            .renderCall(args, theme, { ...baseContext, args })
            .render(width);
          for (const line of callLines) {
            expect(visibleWidth(line)).toBeLessThanOrEqual(width);
          }

          const collapsedLines = tool
            .renderResult(dummyResult, resultOpts(false), theme, {
              ...baseContext,
              args,
            })
            .render(width);
          for (const line of collapsedLines) {
            expect(visibleWidth(line)).toBeLessThanOrEqual(width);
          }

          const expandedLines = tool
            .renderResult(dummyResult, resultOpts(true), theme, {
              ...baseContext,
              args,
            })
            .render(width);
          for (const line of expandedLines) {
            expect(visibleWidth(line)).toBeLessThanOrEqual(width);
          }
        }
      }
    });
  });

  describe('Regression: Oracle blocker repairs', () => {
    const theme = createAnsiTheme();
    const controls = String.fromCharCode(
      ...Array.from({ length: 32 }, (_, code) => code),
    );
    const displayedControls = '␀␁␂␃␄␅␆␇␈\t␊␋␌␍␎␏␐␑␒␓␔␕␖␗␘␙␚␛␜␝␞␟';

    it.each([
      ['ls', createCustomLsTool],
      ['find', createCustomFindTool],
      ['grep', createCustomGrepTool],
    ] as const)('%s escapes every C0 control except tab in call data before styling', (_name, createTool) => {
      const tool = createTool(cwd, createConfig('ascii'));
      const args = { path: `a${controls}b.ts`, pattern: `a${controls}b.ts` };
      for (const theme of [createTrackingTheme().theme, createAnsiTheme()]) {
        const rendered = tool.renderCall(args, theme, baseContext).render(300);
        const plain = rendered.map(stripTerminalSequences);
        expect(plain.join('\n')).toContain(`a${displayedControls}b.ts`);
        expect(
          plain.some((line) =>
            [...line].some(
              (char) => char !== '\t' && char.charCodeAt(0) < 0x20,
            ),
          ),
        ).toBe(false);
      }
    });

    it.each([
      ['ls', createCustomLsTool],
      ['find', createCustomFindTool],
      ['grep', createCustomGrepTool],
    ] as const)('%s escapes every C0 control except tab in errors before styling', (_name, createTool) => {
      const tool = createTool(cwd, createConfig('ascii'));
      for (const theme of [createTrackingTheme().theme, createAnsiTheme()]) {
        const rendered = tool
          .renderResult(
            textResult(`a${controls}b.ts`),
            resultOpts(true),
            theme,
            { ...baseContext, isError: true },
          )
          .render(300);
        const plain = rendered.map(stripTerminalSequences);
        expect(plain[0]).toContain(`! a${displayedControls}b.ts`);
        expect(plain[0]).toContain('│');
        expect(plain.at(-1)).toContain('╰');
      }
    });

    it.each([
      ['read', createCustomReadTool],
      ['bash', createCustomBashTool],
      ['edit', createCustomEditTool],
      ['write', createCustomWriteTool],
    ] as const)('%s retains existing CRLF result normalization', (_name, createTool) => {
      const rendered = createTool(cwd, createConfig('ascii'))
        .renderResult(
          textResult('first\r\nsecond\r'),
          resultOpts(true),
          theme,
          baseContext,
        )
        .render(200);
      const plain = rendered.map(stripTerminalSequences).join('\n');
      expect(plain).toContain('first');
      expect(plain).toContain('second');
      expect(rendered.some((line) => line.includes('\r'))).toBe(false);
      expect(plain).not.toContain('␍');
    });

    it('ls and find preserve bracketed filenames and SDK limit notices in expanded output', () => {
      const ls = createCustomLsTool(cwd, createConfig('nerd'));
      const find = createCustomFindTool(cwd, createConfig('nerd'));

      const lsOutput = [
        '[filename]',
        '[id].tsx',
        'regular.ts',
        '[50 entries limit reached. Use limit=100 for more]',
      ].join('\n');
      const lsResult = textResult(lsOutput);
      const lsExpanded = ls
        .renderResult(lsResult, resultOpts(true), theme, baseContext)
        .render(80);

      expect(lsExpanded.some((l) => l.includes('[filename]'))).toBe(true);
      expect(lsExpanded.some((l) => l.includes('[id].tsx'))).toBe(true);
      expect(lsExpanded.some((l) => l.includes('regular.ts'))).toBe(true);
      expect(
        lsExpanded.some((l) =>
          l.includes('50 entries limit reached. Use limit=100 for more'),
        ),
      ).toBe(true);

      const findOutput = [
        'src/[component].tsx',
        'src/[slug]',
        '[100 results limit reached]',
      ].join('\n');
      const findResult = textResult(findOutput);
      const findExpanded = find
        .renderResult(findResult, resultOpts(true), theme, baseContext)
        .render(80);

      expect(findExpanded.some((l) => l.includes('[component].tsx'))).toBe(
        true,
      );
      expect(findExpanded.some((l) => l.includes('[slug]'))).toBe(true);
      expect(
        findExpanded.some((l) => l.includes('100 results limit reached')),
      ).toBe(true);
    });

    it('grep preserves requested context lines, bracketed filenames, and limit notices in expanded output', () => {
      const grep = createCustomGrepTool(cwd, createConfig('nerd'));
      const output = [
        'src/[id].tsx-10-const before = true;',
        'src/[id].tsx:11:const match = 42;',
        'src/[id].tsx-12-const after = true;',
        '[100 matches limit reached. Use limit=200 for more, or refine pattern]',
      ].join('\n');
      const result = textResult(output);
      const expanded = grep
        .renderResult(result, resultOpts(true), theme, baseContext)
        .render(80);

      expect(expanded.some((l) => l.includes('[id].tsx'))).toBe(true);
      expect(expanded.some((l) => l.includes('const before = true;'))).toBe(
        true,
      );
      expect(expanded.some((l) => l.includes('const match = 42;'))).toBe(true);
      expect(expanded.some((l) => l.includes('const after = true;'))).toBe(
        true,
      );
      expect(
        expanded.some((l) => l.includes('100 matches limit reached')),
      ).toBe(true);
    });

    it('strictly enforces width bounds at widths 0, 1, 2, and 10 across all tools', () => {
      const tools = [
        createCustomReadTool(cwd, createConfig('nerd')),
        createCustomBashTool(cwd, createConfig('nerd')),
        createCustomLsTool(cwd, createConfig('nerd')),
        createCustomGrepTool(cwd, createConfig('nerd')),
        createCustomFindTool(cwd, createConfig('nerd')),
        createCustomEditTool(cwd, createConfig('nerd')),
        createCustomWriteTool(cwd, createConfig('nerd')),
      ];

      const callArgs = [
        { path: 'src/main.ts', offset: 1, limit: 10 },
        { command: 'pnpm test --coverage' },
        { path: 'src' },
        { pattern: 'test', path: 'src' },
        { pattern: '*.ts', path: 'src' },
        { path: 'src/main.ts' },
        { path: 'src/main.ts', content: 'console.log("hello");' },
      ];

      const dummyResult: AgentToolResult<unknown> = {
        content: [
          {
            type: 'text',
            text: 'line 1: content\nline 2: more content',
          } as TextContent,
        ],
        details: {
          exitCode: 0,
          diff: '--- a\n+++ b\n+added',
        },
      };

      for (const w of [0, 1, 2, 10]) {
        for (let i = 0; i < tools.length; i++) {
          const tool = tools[i];
          const args = callArgs[i];

          const callLines = tool
            .renderCall(args, theme, { ...baseContext, args })
            .render(w);
          for (const line of callLines) {
            expect(visibleWidth(line)).toBeLessThanOrEqual(w);
          }

          const collapsed = tool
            .renderResult(dummyResult, resultOpts(false), theme, {
              ...baseContext,
              args,
            })
            .render(w);
          for (const line of collapsed) {
            expect(visibleWidth(line)).toBeLessThanOrEqual(w);
          }

          const exp = tool
            .renderResult(dummyResult, resultOpts(true), theme, {
              ...baseContext,
              args,
            })
            .render(w);
          for (const line of exp) {
            expect(visibleWidth(line)).toBeLessThanOrEqual(w);
          }
        }
      }
    });

    it('ensures consistent framing across all seven tools', () => {
      const read = createCustomReadTool(cwd, createConfig('nerd'));
      const bash = createCustomBashTool(cwd, createConfig('nerd'));
      const ls = createCustomLsTool(cwd, createConfig('nerd'));
      const grep = createCustomGrepTool(cwd, createConfig('nerd'));
      const find = createCustomFindTool(cwd, createConfig('nerd'));
      const edit = createCustomEditTool(cwd, createConfig('nerd'));
      const write = createCustomWriteTool(cwd, createConfig('nerd'));

      // All seven tools draw explicit border framing (╭─...─╮ and ╰─...─╯) when call is alone
      const boxedTools = [
        { tool: read, args: { path: 'src/index.ts' }, name: 'Read' },
        { tool: bash, args: { command: 'pnpm test' }, name: 'Bash' },
        { tool: edit, args: { path: 'src/file.ts' }, name: 'Edit' },
        { tool: write, args: { path: 'src/file.ts' }, name: 'Write' },
        { tool: ls, args: { path: 'src' }, name: 'List' },
        { tool: find, args: { pattern: '*.ts' }, name: 'Find' },
        { tool: grep, args: { pattern: 'foo' }, name: 'Grep' },
      ];

      for (const { tool, args, name } of boxedTools) {
        const lines = tool.renderCall(args, theme, baseContext).render(80);
        expect(lines.length).toBeGreaterThanOrEqual(2);
        // Top border has rounded top left and title
        expect(lines[0]).toContain('╭');
        expect(lines[0]).toContain('╮');
        expect(lines[0]).toContain(name);
        // Bottom border has rounded bottom left
        expect(lines[lines.length - 1]).toContain('╰');
        expect(lines[lines.length - 1]).toContain('╯');
      }
    });
  });

  describe('AC-3: Unified framed tool blocks', () => {
    const theme = createAnsiTheme();

    it('bash joins call and result into one continuous frame with Output divider and exit footer', () => {
      const bash = createCustomBashTool(cwd, createConfig('nerd'));
      const context = { ...baseContext, state: {} };
      const call = bash.renderCall({ command: 'echo hello' }, theme, context);
      const res = bash.renderResult(
        textResult('hello world\nsecond line'),
        resultOpts(false),
        theme,
        context,
      );

      const callLines = call.render(80);
      const resLines = res.render(80);
      const joined = [...callLines, ...resLines];

      // Top border
      expect(callLines[0]).toContain('╭');
      expect(callLines[0]).toContain('╮');
      expect(callLines[0]).toContain('Bash');

      // Command line inside call
      expect(
        callLines
          .map(stripTerminalSequences)
          .some((l) => l.includes('$ echo hello')),
      ).toBe(true);

      // Output divider at bottom of call
      expect(callLines.at(-1)).toContain('├');
      expect(callLines.at(-1)).toContain('┤');
      expect(callLines.at(-1)).toContain('Output');

      // Result body rows have vertical borders
      expect(resLines[0]).toContain('│');
      expect(resLines[0]).toContain('hello world');

      // Bottom border at end of result
      expect(resLines.at(-1)).toContain('╰');
      expect(resLines.at(-1)).toContain('╯');
      expect(resLines.at(-1)).toContain('Exit 0');
      expect(resLines.at(-1)).toContain('~4 words');

      // No blank lines in joined frame
      expect(joined.some((l) => l.trim() === '')).toBe(false);
    });

    it('edit joins call and result seamlessly into one continuous frame with relative path', () => {
      const edit = createCustomEditTool(cwd, createConfig('nerd'));
      const context = { ...baseContext, state: {} };
      const absPath = join(cwd, 'src', 'box.ts');
      const diff = '--- a/src/box.ts\n+++ b/src/box.ts\n@@ -1,2 +1,3 @@\n+line';
      const result: AgentToolResult<unknown> = {
        content: [{ type: 'text', text: 'applied' } as TextContent],
        details: { diff },
      };

      const call = edit.renderCall({ path: absPath }, theme, context);
      const res = edit.renderResult(result, resultOpts(false), theme, context);

      const callLines = call.render(80);
      const resLines = res.render(80);
      const joined = [...callLines, ...resLines];

      // Call is only the top border when result is present
      expect(callLines.length).toBe(1);
      expect(callLines[0]).toContain('╭');
      expect(callLines[0]).toContain('╮');
      expect(callLines[0]).toContain('Edit');
      expect(callLines[0]).toContain('src/box.ts');
      expect(callLines[0]).not.toContain(absPath);

      // Result starts with diff rows and ends with bottom border
      expect(resLines[0]).toContain('│');
      expect(resLines.at(-1)).toContain('╰');
      expect(resLines.at(-1)).toContain('╯');
      expect(resLines.at(-1)).toContain('1 file');

      // No blank lines between call and result
      expect(joined.some((l) => l.trim() === '')).toBe(false);
    });

    it('write joins call and result seamlessly into one continuous frame with relative path', () => {
      const write = createCustomWriteTool(cwd, createConfig('nerd'));
      const context = {
        ...baseContext,
        state: {},
        args: { content: 'hello\nworld' },
      };
      const absPath = join(cwd, 'src', 'new-file.ts');
      const result = textResult('Wrote 2 lines');

      const call = write.renderCall({ path: absPath }, theme, context);
      const res = write.renderResult(result, resultOpts(false), theme, context);

      const callLines = call.render(80);
      const resLines = res.render(80);
      const joined = [...callLines, ...resLines];

      // Call is top border only
      expect(callLines.length).toBe(1);
      expect(callLines[0]).toContain('╭');
      expect(callLines[0]).toContain('Write');
      expect(callLines[0]).toContain('src/new-file.ts');

      // Result has content and bottom border
      expect(resLines[0]).toContain('│');
      expect(resLines.at(-1)).toContain('╰');
      expect(resLines.at(-1)).toContain('+2 lines');

      // Seamless join
      expect(joined.some((l) => l.trim() === '')).toBe(false);
    });

    it('running call alone draws a closed frame before any result exists', () => {
      const bash = createCustomBashTool(cwd, createConfig('nerd'));
      const edit = createCustomEditTool(cwd, createConfig('nerd'));
      const write = createCustomWriteTool(cwd, createConfig('nerd'));

      const bashLines = bash
        .renderCall({ command: 'sleep 10' }, theme, {
          ...baseContext,
          state: {},
        })
        .render(80);
      expect(bashLines[0]).toContain('╭');
      expect(bashLines.at(-1)).toContain('╰');
      expect(bashLines.some((l) => l.includes('Output'))).toBe(false);

      const editLines = edit
        .renderCall({ path: 'src/main.ts' }, theme, {
          ...baseContext,
          state: {},
        })
        .render(80);
      expect(editLines.length).toBe(2);
      expect(editLines[0]).toContain('╭');
      expect(editLines.at(-1)).toContain('╰');

      const writeLines = write
        .renderCall({ path: 'src/main.ts' }, theme, {
          ...baseContext,
          state: {},
        })
        .render(80);
      expect(writeLines.length).toBe(2);
      expect(writeLines[0]).toContain('╭');
      expect(writeLines.at(-1)).toContain('╰');
    });

    it('relativizes paths for read, ls, find, and grep when inside cwd', () => {
      const read = createCustomReadTool(cwd, createConfig('nerd'));
      const ls = createCustomLsTool(cwd, createConfig('nerd'));
      const find = createCustomFindTool(cwd, createConfig('nerd'));
      const grep = createCustomGrepTool(cwd, createConfig('nerd'));

      const absPath = join(cwd, 'src', 'index.ts');
      const absDir = join(cwd, 'src');

      const readLines = read
        .renderCall({ path: absPath }, theme, baseContext)
        .render(80);
      expect(readLines[0]).toContain('src/index.ts');
      expect(readLines[0]).not.toContain(cwd);

      const lsLines = ls
        .renderCall({ path: absDir }, theme, baseContext)
        .render(80);
      expect(lsLines[0]).toContain('src');
      expect(lsLines[0]).not.toContain(cwd);

      const findLines = find
        .renderCall({ path: absDir, pattern: '*.ts' }, theme, baseContext)
        .render(80);
      expect(findLines[0]).toContain('src');
      expect(findLines[0]).not.toContain(cwd);

      const grepLines = grep
        .renderCall({ path: absDir, pattern: 'test' }, theme, baseContext)
        .render(80);
      expect(grepLines[0]).toContain('src');
      expect(grepLines[0]).not.toContain(cwd);
    });
  });
});
