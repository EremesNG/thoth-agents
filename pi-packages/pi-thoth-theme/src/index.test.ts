import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  ExtensionAPI,
  ExtensionContext,
  SessionStartEvent,
} from '@earendil-works/pi-coding-agent';
import {
  Markdown,
  type MarkdownTheme,
  visibleWidth,
} from '@earendil-works/pi-tui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import thothTheme from './index.ts';
import type { ThemeConfig } from './shared/config.ts';

type LifecycleHandler = (
  event: SessionStartEvent,
  ctx: ExtensionContext,
) => void | Promise<void>;

let agentDir: string;

beforeEach(() => {
  agentDir = mkdtempSync(join(tmpdir(), 'pi-thoth-theme-composition-'));
  vi.stubEnv('PI_CODING_AGENT_DIR', agentDir);
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(agentDir, { recursive: true, force: true });
});

function loadTheme(config: Partial<ThemeConfig> = {}) {
  writeFileSync(join(agentDir, 'pi-thoth-theme.json'), JSON.stringify(config));
  const subscriptions: Array<{
    event: string;
    handler: LifecycleHandler;
  }> = [];
  const registerTool = vi.fn();
  const registerToolRenderer = vi.fn<ExtensionAPI['registerToolRenderer']>();
  const registerMarkdownTransformer =
    vi.fn<ExtensionAPI['registerMarkdownTransformer']>();
  const on = vi.fn((event: string, handler: LifecycleHandler) => {
    subscriptions.push({ event, handler });
    return () => {};
  });
  const settingsAccess = vi.fn(() => {
    throw new Error('Pi settings are unavailable during extension load');
  });
  const pi = {
    registerTool,
    registerToolRenderer,
    registerMarkdownTransformer,
    on,
    get getSettings() {
      return settingsAccess();
    },
  } as unknown as ExtensionAPI;
  const ui = {
    setFooter: vi.fn<ExtensionContext['ui']['setFooter']>(),
    setHeader: vi.fn<ExtensionContext['ui']['setHeader']>(),
    setEditorComponent: vi.fn<ExtensionContext['ui']['setEditorComponent']>(),
    setWorkingIndicator: vi.fn<ExtensionContext['ui']['setWorkingIndicator']>(),
    setWorkingMessage: vi.fn<ExtensionContext['ui']['setWorkingMessage']>(),
  };
  const ctx = {
    hasUI: true,
    ui,
    get getSettings() {
      return settingsAccess();
    },
  } as unknown as ExtensionContext;

  thothTheme(pi);

  return {
    registerTool,
    registerToolRenderer,
    registerMarkdownTransformer,
    on,
    ui,
    settingsAccess,
    async start() {
      const handlers = subscriptions.filter(
        ({ event }) => event === 'session_start',
      );
      if (handlers.length === 0)
        throw new Error('session_start was not registered');
      for (const { handler } of handlers) {
        await handler({ type: 'session_start', reason: 'startup' }, ctx);
      }
    },
  };
}

describe('Thoth extension composition', () => {
  it('frames user markdown at the available content width', () => {
    const session = loadTheme({ icons: 'unicode' });
    expect(session.registerMarkdownTransformer).toHaveBeenCalledTimes(1);
    const transform = session.registerMarkdownTransformer.mock.calls[0][0];
    const markdown = 'Keep **this** markdown.\n\nAnd this paragraph.';
    expect(
      transform(markdown, {
        messageType: 'user',
        isStreaming: false,
        availableWidth: 80,
      }),
    ).toBe(
      `╭── ● user ${'─'.repeat(68)}╮\n\n${markdown}\n\n╰${'─'.repeat(78)}╯`,
    );
  });
  it.each([
    'assistant',
    'assistant-thinking',
  ] as const)('leaves %s markdown untouched', (messageType) => {
    const session = loadTheme();
    const transform = session.registerMarkdownTransformer.mock.calls[0][0];
    const markdown = '**Answer**\n\nThinking or response.';
    for (const isStreaming of [false, true]) {
      expect(
        transform(markdown, { messageType, isStreaming, availableWidth: 20 }),
      ).toBe(markdown);
    }
  });

  it.each([
    '',
    ' ',
    '\n\t  ',
  ])('leaves blank content %j untouched', (markdown) => {
    const session = loadTheme();
    const transform = session.registerMarkdownTransformer.mock.calls[0][0];
    expect(
      transform(markdown, {
        messageType: 'user',
        isStreaming: false,
        availableWidth: 80,
      }),
    ).toBe(markdown);
  });

  it.each([
    ['nerd', '\uF007'],
    ['unicode', '●'],
    ['ascii', '@'],
  ] as const)('uses %s icons with equal-width borders and no double frame', (icons, glyph) => {
    const transform = loadTheme({ icons }).registerMarkdownTransformer.mock
      .calls[0][0];
    const context = {
      messageType: 'user',
      isStreaming: false,
      availableWidth: 32,
    } as const;
    const framed = transform('Hello', context);
    const lines = framed.split('\n');
    expect(lines[0]).toMatch(new RegExp(`^╭── ${glyph} user ─+╮$`));
    expect(lines.slice(1, 4)).toEqual(['', 'Hello', '']);
    expect(visibleWidth(lines[0])).toBe(32);
    expect(visibleWidth(lines[4])).toBe(32);
    expect(transform(framed, context)).toBe(framed);
    for (const previousIcons of ['nerd', 'unicode', 'ascii'] as const) {
      const previousTransform = loadTheme({ icons: previousIcons })
        .registerMarkdownTransformer.mock.calls[0][0];
      const previous = previousTransform('Hello', context);
      expect(transform(previous, context)).toBe(previous);
    }
  });

  it.each([
    undefined,
    0,
    -1,
    1,
    10,
    11,
    12,
    12.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ])('skips framing when width %s is unavailable or too small', (availableWidth) => {
    const transform = loadTheme().registerMarkdownTransformer.mock.calls[0][0];
    expect(
      transform('Hello', {
        messageType: 'user',
        isStreaming: false,
        availableWidth: availableWidth as number,
      }),
    ).toBe('Hello');
  });

  it.each([
    'nerd',
    'unicode',
    'ascii',
  ] as const)('renders %s borders without wrapping and recomputes them on resize', (icons) => {
    const transform = loadTheme({ icons }).registerMarkdownTransformer.mock
      .calls[0][0];
    const identity = (text: string) => text;
    const theme: MarkdownTheme = {
      heading: identity,
      link: identity,
      linkUrl: identity,
      code: identity,
      codeBlock: identity,
      codeBlockBorder: identity,
      quote: identity,
      quoteBorder: identity,
      hr: identity,
      listBullet: identity,
      bold: identity,
      italic: identity,
      strikethrough: identity,
      underline: identity,
    };
    const renderTransform = vi.fn((markdown: string, availableWidth: number) =>
      transform(markdown, {
        messageType: 'user',
        isStreaming: false,
        availableWidth,
      }),
    );
    const renderer = new Markdown('Hello', 1, 1, theme, undefined, {
      transform: renderTransform,
    });
    for (const width of [34, 52, 15]) {
      const lines = renderer.render(width).map((line) => line.trim());
      expect(lines.filter(Boolean)).toHaveLength(3);
      expect(lines).toContain('Hello');
      const borders = lines.filter(
        (line) => line.startsWith('╭') || line.startsWith('╰'),
      );
      expect(borders).toHaveLength(2);
      expect(borders.map(visibleWidth)).toEqual([width - 2, width - 2]);
      expect(renderTransform).toHaveBeenLastCalledWith('Hello', width - 2);
    }
    expect(renderTransform).toHaveBeenCalledTimes(3);
    renderer.render(15);
    expect(renderTransform).toHaveBeenCalledTimes(3);
  });

  it('configures the native working animation and message only after UI session startup', async () => {
    const session = loadTheme();
    expect(session.ui.setWorkingIndicator).not.toHaveBeenCalled();
    expect(session.ui.setWorkingMessage).not.toHaveBeenCalled();

    await session.start();
    expect(session.ui.setWorkingIndicator).toHaveBeenCalledExactlyOnceWith({
      frames: ['△', '◭', '▲', '◮'],
      intervalMs: 200,
    });
    expect(session.ui.setWorkingMessage).toHaveBeenCalledExactlyOnceWith(
      'working…',
    );
    expect(session.ui.setEditorComponent).not.toHaveBeenCalled();
  });

  it('installs default surfaces without Pi settings or registering an editor factory', async () => {
    const session = loadTheme();

    expect(session.registerTool).not.toHaveBeenCalled();
    expect(session.registerToolRenderer).toHaveBeenCalledExactlyOnceWith(
      expect.any(Function),
    );
    expect(session.registerMarkdownTransformer).toHaveBeenCalledExactlyOnceWith(
      expect.any(Function),
    );
    expect(session.on).toHaveBeenCalledWith(
      'session_start',
      expect.any(Function),
    );
    expect(session.settingsAccess).not.toHaveBeenCalled();
    expect(session.ui.setFooter).not.toHaveBeenCalled();
    expect(session.ui.setHeader).not.toHaveBeenCalled();
    expect(session.ui.setEditorComponent).not.toHaveBeenCalled();

    expect(session.on).not.toHaveBeenCalledWith(
      'agent_start',
      expect.any(Function),
    );

    await session.start();

    expect(session.ui.setFooter).toHaveBeenCalledExactlyOnceWith(
      expect.any(Function),
    );
    expect(session.ui.setHeader).toHaveBeenCalledExactlyOnceWith(
      expect.any(Function),
    );
    expect(session.ui.setEditorComponent).not.toHaveBeenCalled();
  });

  it('keeps the footer and native indicator settings when the input box is disabled', async () => {
    const session = loadTheme({ inputBox: { enabled: false } });
    await session.start();
    expect(session.ui.setFooter).toHaveBeenCalledTimes(1);
    expect(session.ui.setWorkingIndicator).not.toHaveBeenCalled();
    expect(session.ui.setWorkingMessage).not.toHaveBeenCalled();
    expect(session.ui.setEditorComponent).not.toHaveBeenCalled();
  });

  it.each([
    {
      disabled: 'statusLine',
      resolverCount: 1,
      footerCount: 0,
      headerCount: 1,
    },
    {
      disabled: 'tools',
      resolverCount: 0,
      footerCount: 1,
      headerCount: 1,
    },
    {
      disabled: 'welcome',
      resolverCount: 1,
      footerCount: 1,
      headerCount: 0,
    },
  ] as const)('leaves native $disabled behavior while retaining other defaults', async ({
    disabled,
    resolverCount,
    footerCount,
    headerCount,
  }) => {
    const session = loadTheme({ [disabled]: { enabled: false } });

    await session.start();

    expect(session.registerTool).not.toHaveBeenCalled();
    expect(session.registerToolRenderer).toHaveBeenCalledTimes(resolverCount);
    expect(session.registerMarkdownTransformer).toHaveBeenCalledTimes(1);
    expect(session.ui.setFooter).toHaveBeenCalledTimes(footerCount);
    expect(session.ui.setHeader).toHaveBeenCalledTimes(headerCount);
    expect(session.ui.setEditorComponent).not.toHaveBeenCalled();
  });

  it('leaves optional native surfaces untouched when all modules are disabled', async () => {
    const session = loadTheme({
      statusLine: { enabled: false },
      inputBox: { enabled: false },
      tools: { enabled: false },
      welcome: { enabled: false },
    });

    await session.start();

    expect(session.registerTool).not.toHaveBeenCalled();
    expect(session.registerToolRenderer).not.toHaveBeenCalled();
    expect(session.registerMarkdownTransformer).toHaveBeenCalledExactlyOnceWith(
      expect.any(Function),
    );
    expect(session.ui.setFooter).not.toHaveBeenCalled();
    expect(session.ui.setHeader).not.toHaveBeenCalled();
    expect(session.ui.setWorkingIndicator).not.toHaveBeenCalled();
    expect(session.ui.setWorkingMessage).not.toHaveBeenCalled();
    expect(session.ui.setEditorComponent).not.toHaveBeenCalled();
  });
});
