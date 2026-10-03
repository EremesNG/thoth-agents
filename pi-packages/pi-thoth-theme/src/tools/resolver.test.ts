import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  ExtensionAPI,
  ToolRendererResolver,
} from '@earendil-works/pi-coding-agent';
import { Text } from '@earendil-works/pi-tui';
import { afterAll, describe, expect, it, vi } from 'vitest';
import type { ThemeConfig } from '../shared/config.ts';
import { registerTools } from './index.ts';

const config: ThemeConfig = {
  icons: 'nerd',
  statusLine: { enabled: true, subscriptionProviders: ['claude-bridge'] },
  tools: { enabled: true },
  images: { enabled: true },
  welcome: { enabled: true },
};

function loadResolver() {
  const registerTool = vi.fn();
  const registerToolRenderer =
    vi.fn<(resolver: ToolRendererResolver) => void>();
  const pi = { registerTool, registerToolRenderer } as unknown as ExtensionAPI;
  const dispose = registerTools(pi, config);
  const resolver = registerToolRenderer.mock.calls[0]?.[0];
  if (!resolver) throw new Error('Tool renderer resolver was not registered');
  return { registerTool, registerToolRenderer, resolver, dispose };
}

describe('registerTools resolver', () => {
  it('frames all eight built-ins before downstream native callbacks without replacing execution', () => {
    const { registerTool, registerToolRenderer, resolver, dispose } =
      loadResolver();
    const native = {
      renderCall: vi.fn(() => new Text('native call', 0, 0)),
      renderResult: vi.fn(() => new Text('native result', 0, 0)),
    };
    const next = vi.fn(() => native);

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
      const renderers = resolver(name, next);
      expect(renderers?.renderShell).toBe('self');
      expect(typeof renderers?.renderCall).toBe('function');
      expect(typeof renderers?.renderResult).toBe('function');
      expect(renderers?.renderCall).not.toBe(native.renderCall);
      expect(renderers?.renderResult).not.toBe(native.renderResult);
      expect(Object.keys(renderers ?? {}).sort()).toEqual([
        'renderCall',
        'renderResult',
        'renderShell',
      ]);
    }

    expect(next).not.toHaveBeenCalled();
    expect(registerTool).not.toHaveBeenCalled();
    expect(registerToolRenderer).toHaveBeenCalledTimes(1);
    dispose();
  });

  it.each([
    { renderCall: () => new Text('custom call', 0, 0) },
    { renderResult: () => new Text('custom result', 0, 0) },
    {
      renderCall: () => new Text('custom call', 0, 0),
      renderResult: () => new Text('custom result', 0, 0),
    },
  ])('delegates other names unchanged for downstream %j', (downstream) => {
    const { resolver, dispose } = loadResolver();
    for (const name of [
      'mcp__docs__search',
      'ask_user_question',
      'constructor',
    ]) {
      const next = vi.fn(() => downstream);
      expect(resolver(name, next)).toBe(downstream);
      expect(next).toHaveBeenCalledTimes(1);
    }
    dispose();
  });

  it.each([
    { renderShell: 'self' as const },
    {},
    undefined,
  ])('returns the generic frame for callback-free downstream %j', (downstream) => {
    const { resolver, dispose } = loadResolver();
    const renderers = resolver('mcp__docs__search', () => downstream);
    expect(renderers?.renderShell).toBe('self');
    expect(typeof renderers?.renderCall).toBe('function');
    expect(typeof renderers?.renderResult).toBe('function');
    expect(renderers).not.toBe(downstream);
    dispose();
  });

  it.each([
    { reason: 'the renderer API is absent', enabled: true, supported: false },
    { reason: 'tools are disabled', enabled: false, supported: true },
  ])('registers nothing when $reason', ({ enabled, supported }) => {
    const registerTool = vi.fn();
    const registerToolRenderer = vi.fn();
    const on = vi.fn(() => vi.fn());
    const pi = {
      registerTool,
      ...(supported ? { registerToolRenderer } : {}),
      on,
    } as unknown as ExtensionAPI;

    const dispose = registerTools(pi, { ...config, tools: { enabled } });
    dispose();
    dispose();

    expect(registerTool).not.toHaveBeenCalled();
    expect(registerToolRenderer).not.toHaveBeenCalled();
    expect(on).not.toHaveBeenCalled();
  });

  describe('ownership of downstream renderers', () => {
    const downstream = { renderCall: () => new Text('custom', 0, 0) };

    function loadWith(
      tools: Array<{ name: string; sourceInfo?: { baseDir?: string } }>,
    ) {
      const registerToolRenderer =
        vi.fn<(resolver: ToolRendererResolver) => void>();
      const getAllTools = vi.fn(() => tools);
      const pi = {
        registerToolRenderer,
        getAllTools,
      } as unknown as ExtensionAPI;
      const dispose = registerTools(pi, config);
      const resolver = registerToolRenderer.mock.calls[0]?.[0];
      if (!resolver) throw new Error('no resolver');
      return { resolver, getAllTools, dispose, tools };
    }

    const tmp = mkdtempSync(join(tmpdir(), 'thoth-own-'));
    const write = (dir: string, name: string) => {
      mkdirSync(join(dir, 'src'), { recursive: true });
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ name }));
      return dir;
    };
    const repoRoot = write(join(tmp, 'fork'), 'thoth-agents');
    const npmRoot = write(join(tmp, 'npm'), '@thoth-agents/pi-thoth-theme');
    const foreign = write(join(tmp, 'mcp'), 'pi-mcp-adapter');
    afterAll(() => rmSync(tmp, { recursive: true, force: true }));

    it('respects owned tools at the package root, nested src/ and npm root', () => {
      const { resolver, dispose } = loadWith([
        { name: 'a', sourceInfo: { baseDir: repoRoot } },
        { name: 'b', sourceInfo: { baseDir: join(repoRoot, 'src') } },
        { name: 'c', sourceInfo: { baseDir: npmRoot } },
      ]);
      for (const name of ['a', 'b', 'c']) {
        expect(resolver(name, () => downstream)).toBe(downstream);
      }
      dispose();
    });

    it('frames third-party tools that ship renderers', () => {
      const { resolver, dispose } = loadWith([
        { name: 'g', sourceInfo: { baseDir: join(foreign, 'src') } },
      ]);
      expect(resolver('g', () => downstream)).not.toBe(downstream);
      dispose();
    });

    it('frames tools whose nearest manifest is malformed', () => {
      writeFileSync(join(foreign, 'src', 'package.json'), '{bad');
      const { resolver, dispose } = loadWith([
        { name: 'm', sourceInfo: { baseDir: join(foreign, 'src') } },
      ]);
      expect(resolver('m', () => downstream)).not.toBe(downstream);
      dispose();
    });

    it.each([
      { label: 'no sourceInfo', info: undefined },
      { label: 'no baseDir', info: {} },
      {
        label: 'baseDir without manifest',
        info: { baseDir: '/nonexistent/zzz' },
      },
    ])('frames a registered tool with $label', ({ info }) => {
      const { resolver, dispose } = loadWith([{ name: 't', sourceInfo: info }]);
      const r = resolver('t', () => downstream);
      expect(r).not.toBe(downstream);
      expect(r?.renderShell).toBe('self');
      dispose();
    });

    it('keeps respecting tools absent from the registry', () => {
      const { resolver, dispose } = loadWith([]);
      expect(resolver('ghost', () => downstream)).toBe(downstream);
      dispose();
    });

    it('re-reads ownership on same-name replacement', () => {
      const { resolver, tools, dispose } = loadWith([
        { name: 't', sourceInfo: { baseDir: repoRoot } },
      ]);
      expect(resolver('t', () => downstream)).toBe(downstream);
      tools[0] = { name: 't', sourceInfo: { baseDir: '/nonexistent/zzz' } };
      expect(resolver('t', () => downstream)).not.toBe(downstream);
      dispose();
    });

    it('never consults the registry for built-in names, incl. shadows', () => {
      const { resolver, getAllTools, dispose } = loadWith([
        { name: 'bash', sourceInfo: { baseDir: '/nonexistent/zzz' } },
      ]);
      const r = resolver('bash', () => downstream);
      expect(r).not.toBe(downstream);
      expect(getAllTools).not.toHaveBeenCalled();
      dispose();
    });
  });
});
