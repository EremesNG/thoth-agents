import { visibleWidth } from '@earendil-works/pi-tui';
import { describe, expect, it, vi } from 'vitest';
import type { ThemeConfig } from '../shared/config.ts';
import { formatAge } from './age.ts';
import { registerWelcome, WelcomeComponent } from './index.ts';
import { getThothLogoLines } from './logo.ts';
import { renderWelcomeHeader } from './render.ts';
import {
  collectStartupResources,
  type WelcomeData,
  type WelcomeSession,
} from './resources.ts';

// Mock theme providing fg method for testing
const mockTheme = {
  fg: (_token: string, text: string) => `\x1b[33m${text}\x1b[0m`, // gold-ish representation
  bold: (text: string) => `\x1b[1m${text}\x1b[22m`,
};

describe('formatAge', () => {
  const now = 1000000000000;

  it('formats just now for less than 60 seconds', () => {
    expect(formatAge(now - 30 * 1000, now)).toBe('just now');
  });

  it('formats minutes ago', () => {
    expect(formatAge(now - 15 * 60 * 1000, now)).toBe('15m ago');
  });

  it('formats hours ago', () => {
    expect(formatAge(now - 3 * 3600 * 1000, now)).toBe('3h ago');
  });

  it('formats days ago', () => {
    expect(formatAge(now - 4 * 86400 * 1000, now)).toBe('4d ago');
  });

  it('formats months ago', () => {
    expect(formatAge(now - 65 * 86400 * 1000, now)).toBe('2mo ago');
  });
});

describe('Thoth Logo', () => {
  it('provides nerd mode Egyptian ibis/horus art and wordmark', () => {
    const lines = getThothLogoLines('nerd');
    expect(lines.length).toBeGreaterThan(3);
    for (const line of lines) {
      expect(typeof line).toBe('string');
    }
  });

  it('provides ascii mode art without unicode block characters', () => {
    const lines = getThothLogoLines('ascii');
    expect(lines.length).toBeGreaterThan(3);
    for (const line of lines) {
      // Must not contain block elements like █, ▄, ▀
      expect(line).not.toMatch(/[█▀▄▌▐╔╗╚╝║═╠╣╦╩╬]/);
    }
  });
});

describe('renderWelcomeHeader', () => {
  const sampleData: WelcomeData = {
    version: '0.99.1',
    model: 'claude-3-7-sonnet',
    provider: 'anthropic',
    resources: {
      tools: 14,
      skills: 5,
      extensions: 3,
    },
    providers: [
      { name: 'core', detail: 'read  write  edit  +4' },
      { name: 'mcp__github', detail: 'create_issue  list_pull_requests' },
    ],
    sessions: [
      { name: 'Fix welcome header responsiveness', timeAgo: '2h ago' },
      { name: 'Implement status line', timeAgo: '1d ago' },
    ],
  };

  it('renders wide layout (80 columns) in nerd mode without exceeding width', () => {
    const lines = renderWelcomeHeader(mockTheme, sampleData, 80, 'nerd');
    expect(lines.length).toBeGreaterThan(5);
    for (const line of lines) {
      expect(visibleWidth(line)).toBeLessThanOrEqual(80);
    }
    const fullText = lines.join('\n');
    expect(fullText).toContain('0.99.1');
    expect(fullText).toContain('claude-3-7-sonnet');
    expect(fullText).toContain('anthropic');
    expect(fullText).toContain('Fix welcome header');
    expect(fullText).toContain('core');
  });

  it('renders wide layout (80 columns) in ascii mode without exceeding width', () => {
    const lines = renderWelcomeHeader(mockTheme, sampleData, 80, 'ascii');
    for (const line of lines) {
      expect(visibleWidth(line)).toBeLessThanOrEqual(80);
      expect(line).not.toMatch(/[╭╮╰╯│─]/);
    }
    const fullText = lines.join('\n');
    expect(fullText).toContain('0.99.1');
    expect(fullText).toContain('claude-3-7-sonnet');
  });

  it('renders medium layout (50 columns) responsively without exceeding width', () => {
    const lines = renderWelcomeHeader(mockTheme, sampleData, 50, 'nerd');
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(visibleWidth(line)).toBeLessThanOrEqual(50);
    }
    const fullText = lines.join('\n');
    expect(fullText).toContain('claude-3-7-sonnet');
  });

  it('renders narrow layout (30 columns) minimally without exceeding width', () => {
    const lines = renderWelcomeHeader(mockTheme, sampleData, 30, 'nerd');
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(visibleWidth(line)).toBeLessThanOrEqual(30);
    }
  });

  it('gracefully handles empty sessions and providers', () => {
    const emptyData: WelcomeData = {
      version: '0.99.1',
      model: undefined,
      provider: undefined,
      resources: { tools: 0, skills: 0, extensions: 0 },
      providers: [],
      sessions: [],
    };
    const lines = renderWelcomeHeader(mockTheme, emptyData, 80, 'nerd');
    for (const line of lines) {
      expect(visibleWidth(line)).toBeLessThanOrEqual(80);
    }
    const fullText = lines.join('\n');
    expect(fullText).toContain('No recent sessions');
    expect(fullText).toContain('No tool providers');
  });

  it('renders correctly when extensions or skills resource count is omitted', () => {
    const dataWithoutExts: WelcomeData = {
      version: '0.99.1',
      model: 'test-model',
      provider: 'test-provider',
      resources: {
        tools: 5,
        skills: 2,
        extensions: undefined,
      },
      providers: [{ name: 'core', detail: 'read  write' }],
      sessions: [],
    };
    const lines = renderWelcomeHeader(mockTheme, dataWithoutExts, 80, 'nerd');
    const fullText = lines.join('\n');
    expect(fullText).toContain('tools');
    expect(fullText).toContain('skills');
    expect(fullText).not.toContain('exts');
    expect(fullText).not.toContain('undefined');
  });
});

describe('collectStartupResources', () => {
  it('collects data using injected data providers', async () => {
    const mockPi = {
      getAllTools: () => [
        { name: 'read', sourceInfo: { source: 'builtin' } },
        {
          name: 'custom_tool',
          sourceInfo: { source: 'npm:@thoth-agents/test' },
        },
      ],
      getActiveTools: () => ['read', 'custom_tool'],
    };

    const mockCtx = {
      cwd: '/workspace/project',
      model: {
        id: 'test-model',
        name: 'Test Model',
        provider: 'test-provider',
      },
    };

    const mockSessions: WelcomeSession[] = [
      { name: 'Test Session 1', timeAgo: '1h ago' },
    ];

    const data = await collectStartupResources(mockPi as any, mockCtx as any, {
      sessionLister: async () => mockSessions,
      skillCountLister: () => 3,
      extensionCountLister: () => 1,
    });

    expect(data.model).toBe('Test Model');
    expect(data.provider).toBe('test-provider');
    expect(data.resources.tools).toBe(2);
    expect(data.resources.skills).toBe(3);
    expect(data.resources.extensions).toBe(1);
    expect(data.sessions).toEqual(mockSessions);
    expect(data.providers.length).toBeGreaterThan(0);
  });

  it('collects live loaded skills from pi.getCommands(), including explicit-path and package-loaded skills', async () => {
    const mockPi = {
      getAllTools: () => [],
      getCommands: () => [
        {
          name: 'skill:tdd',
          description: 'Test-driven development',
          source: 'skill',
          sourceInfo: {
            path: '/custom/explicit/skills/tdd/SKILL.md',
            source: 'explicit',
            scope: 'project',
            origin: 'top-level',
          },
        },
        {
          name: 'skill:vitest',
          description: 'Vitest testing',
          source: 'skill',
          sourceInfo: {
            path: '/node_modules/@scope/pkg/skills/vitest/SKILL.md',
            source: 'npm:@scope/pkg',
            scope: 'project',
            origin: 'package',
          },
        },
        {
          name: 'clear',
          description: 'Clear transcript',
          source: 'extension',
          sourceInfo: { source: 'builtin' },
        },
      ],
    };

    const mockCtx = { cwd: '/workspace' };
    const data = await collectStartupResources(mockPi as any, mockCtx as any, {
      sessionLister: async () => [],
    });

    expect(data.resources.skills).toBe(2);
  });

  it('reads skills and extensions from resource loader results when available', async () => {
    const mockPi = {
      getAllTools: () => [{ name: 'read', sourceInfo: { source: 'builtin' } }],
    };
    const mockLoader = {
      getSkills: () => ({
        skills: [{ name: 'explicit-skill' }, { name: 'package-skill' }],
      }),
      getExtensions: () => ({
        extensions: [
          { path: '/ext1.js' },
          { path: '/ext2.js' },
          { path: '/ext3.js' },
        ],
      }),
    };
    const mockCtx = {
      cwd: '/workspace',
      resourceLoader: mockLoader,
    };

    const data = await collectStartupResources(mockPi as any, mockCtx as any, {
      sessionLister: async () => [],
    });

    expect(data.resources.skills).toBe(2);
    expect(data.resources.extensions).toBe(3);
    expect(data.providers.length).toBe(1);
  });

  it('omits skill and extension counts when no public live source is available, rather than guessing', async () => {
    const mockPi = {
      getAllTools: () => [
        { name: 'read', sourceInfo: { source: 'builtin' } },
        { name: 'jira_create', sourceInfo: { source: 'npm:@jira/mcp' } },
      ],
    };
    const mockCtx = { cwd: '/workspace' };

    const data = await collectStartupResources(mockPi as any, mockCtx as any, {
      sessionLister: async () => [],
    });

    expect(data.resources.tools).toBe(2);
    expect(data.resources.skills).toBeUndefined();
    expect(data.resources.extensions).toBeUndefined();
    expect(data.providers.length).toBe(2);
    expect(data.providers.map((p) => p.name)).toEqual(['core', '@jira/mcp']);
  });
});

describe('WelcomeComponent', () => {
  it('ignores updateData and flags isDisposed after dispose()', () => {
    const initialData: WelcomeData = {
      version: '0.99.1',
      model: 'initial-model',
      resources: { tools: 1 },
      providers: [],
      sessions: [],
    };
    const comp = new WelcomeComponent(
      mockTheme,
      { icons: 'nerd' } as ThemeConfig,
      initialData,
    );
    expect(comp.isDisposed).toBe(false);

    comp.dispose();
    expect(comp.isDisposed).toBe(true);

    const updatedData: WelcomeData = {
      ...initialData,
      model: 'updated-model',
    };
    comp.updateData(updatedData);

    const output = comp.render(80).join('\n');
    expect(output).toContain('initial-model');
    expect(output).not.toContain('updated-model');
  });
});

describe('registerWelcome', () => {
  it('sets header component on ctx.ui.setHeader', () => {
    let capturedFactory: ((tui: any, theme: any) => any) | undefined;
    const mockCtx = {
      hasUI: true,
      cwd: '/workspace/test',
      model: { id: 'model-1', name: 'Model 1', provider: 'prov-1' },
      ui: {
        setHeader: vi.fn((factory) => {
          capturedFactory = factory;
        }),
      },
    };

    const mockConfig: ThemeConfig = {
      icons: 'nerd',
      statusLine: { enabled: true },
      tools: { enabled: true },
      images: { enabled: true },
      welcome: { enabled: true },
    };

    registerWelcome({} as any, mockCtx as any, mockConfig);
    expect(mockCtx.ui.setHeader).toHaveBeenCalled();
    expect(capturedFactory).toBeDefined();

    if (!capturedFactory) throw new Error('capturedFactory was not set');
    const component = capturedFactory({ requestRender: vi.fn() }, mockTheme);
    expect(component).toBeInstanceOf(WelcomeComponent);
    const lines = component.render(80);
    expect(lines.length).toBeGreaterThan(0);
  });

  it('guards against late async updates when component is disposed before completion', async () => {
    let capturedFactory: ((tui: any, theme: any) => any) | undefined;
    const mockCtx = {
      hasUI: true,
      cwd: '/workspace/test',
      model: { id: 'model-1', name: 'Model 1', provider: 'prov-1' },
      ui: {
        setHeader: vi.fn((factory) => {
          capturedFactory = factory;
        }),
      },
    };
    const mockConfig: ThemeConfig = {
      icons: 'nerd',
      statusLine: { enabled: true },
      tools: { enabled: true },
      images: { enabled: true },
      welcome: { enabled: true },
    };

    let resolveSessions: (sessions: WelcomeSession[]) => void = () => {};
    const sessionPromise = new Promise<WelcomeSession[]>((res) => {
      resolveSessions = res;
    });

    registerWelcome({} as any, mockCtx as any, mockConfig, {
      sessionLister: () => sessionPromise,
    });

    const mockTui = { requestRender: vi.fn() };
    if (!capturedFactory) throw new Error('capturedFactory was not set');
    const comp = capturedFactory(mockTui, mockTheme);

    // Dispose the component immediately, simulating early tear-down or replacement
    comp.dispose();

    // Now resolve the async collection
    resolveSessions([{ name: 'Late session', timeAgo: 'just now' }]);
    await sessionPromise;
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(mockTui.requestRender).not.toHaveBeenCalled();
    expect(comp.render(80).join('\n')).not.toContain('Late session');
  });

  it('disposes previous component when header is replaced', async () => {
    let capturedFactory: ((tui: any, theme: any) => any) | undefined;
    const mockCtx = {
      hasUI: true,
      cwd: '/workspace/test',
      model: { id: 'model-1', name: 'Model 1', provider: 'prov-1' },
      ui: {
        setHeader: vi.fn((factory) => {
          capturedFactory = factory;
        }),
      },
    };
    const mockConfig: ThemeConfig = {
      icons: 'nerd',
      statusLine: { enabled: true },
      tools: { enabled: true },
      images: { enabled: true },
      welcome: { enabled: true },
    };

    let resolveFirstSessions: (sessions: WelcomeSession[]) => void = () => {};
    const firstPromise = new Promise<WelcomeSession[]>((res) => {
      resolveFirstSessions = res;
    });

    let currentPromise = firstPromise;
    registerWelcome({} as any, mockCtx as any, mockConfig, {
      sessionLister: () => currentPromise,
    });

    const mockTui = { requestRender: vi.fn() };
    if (!capturedFactory) throw new Error('capturedFactory was not set');
    const firstComp = capturedFactory(mockTui, mockTheme);
    expect(firstComp.isDisposed).toBe(false);

    // Call factory again, simulating replacement
    const secondPromise = Promise.resolve([
      { name: 'Second session', timeAgo: '1m ago' },
    ]);
    currentPromise = secondPromise;
    const secondComp = capturedFactory(mockTui, mockTheme);

    expect(firstComp.isDisposed).toBe(true);
    expect(secondComp.isDisposed).toBe(false);

    // Late resolution of first session list
    resolveFirstSessions?.([{ name: 'First session', timeAgo: '10m ago' }]);
    await firstPromise;
    await secondPromise;
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(firstComp.render(80).join('\n')).not.toContain('First session');
  });
});
