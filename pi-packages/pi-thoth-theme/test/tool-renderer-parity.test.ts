import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  ExtensionAPI,
  ExtensionContext,
  ExtensionEvent,
} from '@earendil-works/pi-coding-agent';
import { Text } from '@earendil-works/pi-tui';
import { getRenderKit, type ToolRenderersLike } from '@thoth-agents/pi-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import thothTheme from '../src/index.ts';

type Handler = (event: ExtensionEvent, ctx: ExtensionContext) => unknown;
interface ToolInfo {
  name: string;
  sourceInfo?: { baseDir?: string };
}
const downstream = {
  renderShell: 'default' as const,
  renderCall: () => new Text('custom call', 0, 0),
  renderResult: () => new Text('custom result', 0, 0),
};
let agentDir: string;
const shutdowns: Array<() => Promise<void>> = [];

beforeEach(() => {
  agentDir = mkdtempSync(join(tmpdir(), 'pi-thoth-theme-parity-'));
  vi.stubEnv('PI_CODING_AGENT_DIR', agentDir);
});

afterEach(async () => {
  for (const shutdown of shutdowns) await shutdown();
  shutdowns.length = 0;
  vi.unstubAllEnvs();
  rmSync(agentDir, { recursive: true, force: true });
});

function packageDir(name: string): string {
  const dir = join(agentDir, 'packages', name);
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name }));
  return join(dir, 'src');
}

function expectGeneric(renderers: ToolRenderersLike | undefined, name: string) {
  expect(renderers?.renderShell).toBe('self');
  expect(typeof renderers?.renderCall).toBe('function');
  expect(typeof renderers?.renderResult).toBe('function');
  const call = renderers?.renderCall?.(
    { query: 'search' },
    { fg: (_role: string, text: string) => text },
    {},
  );
  const output = call?.render(80).join('\n');
  expect(output).toContain(`* ${name}`);
  expect(output).toContain('query="search"');
}

async function loadTheme(tools: ToolInfo[] = [], respectPackages?: string[]) {
  writeFileSync(
    join(agentDir, 'pi-thoth-theme.json'),
    JSON.stringify({
      icons: 'ascii',
      tools: { enabled: true, respectPackages },
      statusLine: { enabled: false },
      welcome: { enabled: false },
      images: { enabled: false },
    }),
  );
  const handlers = new Map<string, Set<Handler>>();
  const registerToolRenderer = vi.fn<ExtensionAPI['registerToolRenderer']>();
  const getAllTools = vi.fn(() => tools);
  thothTheme({
    registerToolRenderer,
    getAllTools,
    on(event: string, handler: Handler) {
      const listeners = handlers.get(event) ?? new Set();
      listeners.add(handler);
      handlers.set(event, listeners);
      return () => listeners.delete(handler);
    },
  } as unknown as ExtensionAPI);
  const emit = async (event: ExtensionEvent) => {
    for (const handler of handlers.get(event.type) ?? []) {
      await handler(event, { hasUI: true, ui: {} } as ExtensionContext);
    }
  };
  shutdowns.push(() => emit({ type: 'session_shutdown', reason: 'quit' }));
  await emit({ type: 'session_start', reason: 'startup' });
  const registeredResolver = registerToolRenderer.mock.calls[0]?.[0];
  const kitResolver = getRenderKit()?.resolveToolRenderers;
  expect(typeof kitResolver).toBe('function');
  if (!registeredResolver || !kitResolver) throw new Error('No tool resolver');
  return { registeredResolver, kitResolver, getAllTools };
}

describe('registered and kit tool-renderer parity', () => {
  it('uses the same themed built-ins without consulting downstream or tool ownership', async () => {
    const { registeredResolver, kitResolver, getAllTools } = await loadTheme();
    const downstream = {
      renderCall: () => new Text('native call', 0, 0),
      renderResult: () => new Text('native result', 0, 0),
    };
    const next = vi.fn(() => downstream);
    for (const name of [
      'read',
      'bash',
      'powershell',
      'ls',
      'grep',
      'find',
      'edit',
      'write',
    ]) {
      const renderers = registeredResolver(name, next);
      expect(kitResolver(name, next)).toBe(renderers);
      expect(renderers?.renderShell).toBe('self');
      expect(typeof renderers?.renderCall).toBe('function');
      expect(typeof renderers?.renderResult).toBe('function');
      expect(renderers?.renderCall).not.toBe(downstream.renderCall);
      expect(renderers?.renderResult).not.toBe(downstream.renderResult);
    }
    expect(next).not.toHaveBeenCalled();
    expect(getAllTools).not.toHaveBeenCalled();
  });

  describe.each([
    'thoth-agents',
    '@thoth-agents/pi-custom',
    'thoth-mem',
  ])('default respected package %s', (packageName) => {
    it.each([
      { renderCall: downstream.renderCall },
      { renderResult: downstream.renderResult },
      downstream,
    ])('keeps available downstream renderers %j', async (renderers) => {
      const { registeredResolver, kitResolver } = await loadTheme([
        { name: 'custom', sourceInfo: { baseDir: packageDir(packageName) } },
      ]);
      const next = vi.fn(() => renderers);
      expect(registeredResolver('custom', next)).toBe(renderers);
      expect(kitResolver('custom', next)).toBe(renderers);
      expect(next).toHaveBeenCalledTimes(2);
    });

    it('uses the same cached generic card when downstream is unavailable', async () => {
      const { registeredResolver, kitResolver } = await loadTheme([
        { name: 'custom', sourceInfo: { baseDir: packageDir(packageName) } },
      ]);
      const next = vi.fn(() => undefined);
      const renderers = kitResolver('custom', next);
      expect(registeredResolver('custom', next)).toBe(renderers);
      expectGeneric(renderers, 'custom');
      expect(next).toHaveBeenCalledTimes(2);
    });
  });

  it.each([
    {
      label: 'third-party package by default',
      packageName: 'pi-mcp-adapter',
      respectPackages: undefined,
      respected: false,
    },
    {
      label: 'explicitly included third-party package',
      packageName: 'pi-mcp-adapter',
      respectPackages: ['pi-mcp-adapter'],
      respected: true,
    },
    {
      label: 'configured package scope',
      packageName: '@custom/renderer',
      respectPackages: ['@custom/*'],
      respected: true,
    },
    {
      label: 'default package excluded by an empty list',
      packageName: 'thoth-agents',
      respectPackages: [],
      respected: false,
    },
    {
      label: 'thoth-mem excluded from a replacement list',
      packageName: 'thoth-mem',
      respectPackages: ['thoth-agents', '@thoth-agents/*'],
      respected: false,
    },
    {
      label: 'default package excluded by custom inclusion',
      packageName: 'thoth-agents',
      respectPackages: ['pi-mcp-adapter'],
      respected: false,
    },
  ])('follows configured ownership for $label', async ({
    packageName,
    respectPackages,
    respected,
  }) => {
    const { registeredResolver, kitResolver } = await loadTheme(
      [{ name: 'custom', sourceInfo: { baseDir: packageDir(packageName) } }],
      respectPackages,
    );
    const next = vi.fn(() => downstream);
    const renderers = registeredResolver('custom', next);
    expect(kitResolver('custom', next)).toBe(renderers);
    if (respected) {
      expect(renderers).toBe(downstream);
    } else {
      expect(renderers).not.toBe(downstream);
      expectGeneric(renderers, 'custom');
    }
    expect(next).toHaveBeenCalledTimes(2);
  });

  it.each([
    { renderCall: downstream.renderCall },
    { renderResult: downstream.renderResult },
    downstream,
  ])('keeps downstream %j when the tool is absent from getAllTools', async (renderers) => {
    const { registeredResolver, kitResolver } = await loadTheme();
    const next = vi.fn(() => renderers);
    expect(registeredResolver('missing', next)).toBe(renderers);
    expect(kitResolver('missing', next)).toBe(renderers);
    expect(next).toHaveBeenCalledTimes(2);
  });

  it.each([
    {},
    { renderShell: 'self' as const },
  ])('uses the same generic card for callback-free downstream %j', async (downstream) => {
    const { registeredResolver, kitResolver } = await loadTheme([
      { name: 'custom', sourceInfo: { baseDir: packageDir('thoth-mem') } },
    ]);
    const next = () => downstream;
    const renderers = registeredResolver('custom', next);
    expect(kitResolver('custom', next)).toBe(renderers);
    expectGeneric(renderers, 'custom');
  });

  it.each([
    { name: 'custom' },
    { name: 'custom', sourceInfo: {} },
  ])('uses the same generic card for a registered tool without ownership %j', async (tool) => {
    const { registeredResolver, kitResolver } = await loadTheme([tool]);
    const next = () => downstream;
    const renderers = registeredResolver('custom', next);
    expect(kitResolver('custom', next)).toBe(renderers);
    expect(renderers).not.toBe(downstream);
    expectGeneric(renderers, 'custom');
  });

  it('reads live tool replacements in both paths without caching ownership by tool name', async () => {
    const ownedTool = {
      name: 'custom',
      sourceInfo: { baseDir: packageDir('thoth-agents') },
    };
    const { registeredResolver, kitResolver, getAllTools } = await loadTheme([
      ownedTool,
    ]);
    const next = () => downstream;
    expect(registeredResolver('custom', next)).toBe(downstream);
    expect(kitResolver('custom', next)).toBe(downstream);

    getAllTools.mockReturnValue([
      { name: 'custom', sourceInfo: { baseDir: packageDir('pi-mcp-adapter') } },
    ]);
    const generic = kitResolver('custom', next);
    expect(registeredResolver('custom', next)).toBe(generic);
    expectGeneric(generic, 'custom');

    getAllTools.mockReturnValue([]);
    expect(registeredResolver('custom', next)).toBe(downstream);
    expect(kitResolver('custom', next)).toBe(downstream);
    getAllTools.mockReturnValue([ownedTool]);
    expect(registeredResolver('custom', next)).toBe(downstream);
    expect(kitResolver('custom', next)).toBe(downstream);
  });

  it('binds each kit to its own theme instance tool accessor', async () => {
    const older = await loadTheme([
      { name: 'custom', sourceInfo: { baseDir: packageDir('thoth-agents') } },
    ]);
    const newer = await loadTheme([
      { name: 'custom', sourceInfo: { baseDir: packageDir('pi-mcp-adapter') } },
    ]);
    const next = () => downstream;
    expect(older.registeredResolver('custom', next)).toBe(downstream);
    expect(older.kitResolver('custom', next)).toBe(downstream);
    const generic = newer.kitResolver('custom', next);
    expect(newer.registeredResolver('custom', next)).toBe(generic);
    expectGeneric(generic, 'custom');
  });
});
