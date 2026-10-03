import type {
  ExtensionAPI,
  ToolRendererResolver,
} from '@earendil-works/pi-coding-agent';
import { Text } from '@earendil-works/pi-tui';
import { describe, expect, it, vi } from 'vitest';
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
});
