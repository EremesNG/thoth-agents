import type {
  ExtensionAPI,
  ExtensionContext,
} from '@earendil-works/pi-coding-agent';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createAdaptiveToolRegistrar } from '../src/index.js';

function host(active: string[] = []) {
  let start: (_event: unknown, ctx: ExtensionContext) => unknown = () => {};
  const pi = {
    registerTool: vi.fn(
      (_definition: { name: string; exposure?: string }) => {},
    ),
    on: vi.fn((_event, handler) => {
      start = handler;
    }),
    getActiveTools: vi.fn(() => [...active]),
    setActiveTools: vi.fn((next: string[]) => {
      active = next;
    }),
  };
  const notify = vi.fn();
  return {
    pi,
    notify,
    start: (ctx = { ui: { notify } }) =>
      start({}, ctx as unknown as ExtensionContext),
  };
}
const tool = {
  name: 'occasional',
  label: 'Occasional',
  description: 'Test',
  namespace: { name: 'test', description: 'Test namespace' },
  parameters: { type: 'object', properties: {} },
  execute: vi.fn(),
} as unknown as Parameters<ExtensionAPI['registerTool']>[0];

beforeEach(() => vi.stubEnv('THOTH_AGENTS_PI_EXPOSURE', undefined));
afterEach(() => vi.unstubAllEnvs());

it('registers direct and active at load without reading unbound action APIs', () => {
  const h = host();
  const registrar = createAdaptiveToolRegistrar(
    h.pi as unknown as ExtensionAPI,
  );
  registrar.register(tool);
  expect(h.pi.registerTool).toHaveBeenCalledExactlyOnceWith({
    ...tool,
    exposure: 'direct',
    defaultActive: true,
  });
  expect(h.pi.getActiveTools).not.toHaveBeenCalled();
  expect(h.pi.on).toHaveBeenCalledOnce();
});

it.each([
  'codemode',
  'tool_search',
])('defers with %s active and preserves other tools and the definition', (discovery) => {
  vi.stubEnv('THOTH_AGENTS_PI_EXPOSURE', 'auto');
  const h = host(['read', discovery, 'occasional']);
  createAdaptiveToolRegistrar(h.pi as unknown as ExtensionAPI).register(tool);
  h.start();
  expect(h.pi.registerTool).toHaveBeenLastCalledWith({
    ...tool,
    exposure: 'deferred',
    defaultActive: false,
  });
  expect(h.pi.setActiveTools).toHaveBeenCalledExactlyOnceWith([
    'read',
    discovery,
  ]);
  h.start();
  expect(h.pi.registerTool).toHaveBeenCalledTimes(2);
  expect(h.pi.setActiveTools).toHaveBeenCalledTimes(1);
});

it.each([
  undefined,
  'auto',
  'direct',
  'invalid',
])('resolves env %s and warns at most once per session', (value) => {
  vi.stubEnv('THOTH_AGENTS_PI_EXPOSURE', value);
  const h = host(['codemode', 'occasional']);
  createAdaptiveToolRegistrar(h.pi as unknown as ExtensionAPI).register(tool);
  h.start();
  expect(h.pi.registerTool).toHaveBeenLastCalledWith(
    expect.objectContaining({
      exposure: value === 'direct' ? 'direct' : 'deferred',
    }),
  );
  expect(h.notify).toHaveBeenCalledTimes(value === 'invalid' ? 1 : 0);
  if (value === 'invalid') {
    expect(h.notify).toHaveBeenCalledWith(
      expect.stringContaining('THOTH_AGENTS_PI_EXPOSURE'),
      'warning',
    );
    h.start();
    expect(h.notify).toHaveBeenCalledTimes(2);
  }
});

it.each([
  'get missing',
  'get throws',
  'set missing',
  'set throws',
])('keeps direct when %s', (failure) => {
  vi.stubEnv('THOTH_AGENTS_PI_EXPOSURE', 'auto');
  const h = host(['codemode', 'occasional']);
  if (failure === 'get missing')
    Object.assign(h.pi, { getActiveTools: undefined });
  if (failure === 'set missing')
    Object.assign(h.pi, { setActiveTools: undefined });
  if (failure === 'get throws')
    h.pi.getActiveTools.mockImplementation(() => {
      throw Error('unbound');
    });
  if (failure === 'set throws')
    h.pi.setActiveTools.mockImplementation(() => {
      throw Error('unbound');
    });
  createAdaptiveToolRegistrar(h.pi as unknown as ExtensionAPI).register(tool);
  expect(() => h.start()).not.toThrow();
  expect(h.pi.registerTool).toHaveBeenLastCalledWith(
    expect.objectContaining({ exposure: 'direct', defaultActive: true }),
  );
});

it('keeps direct active without discovery and avoids redundant writes', () => {
  const h = host(['read']);
  const registrar = createAdaptiveToolRegistrar(
    h.pi as unknown as ExtensionAPI,
  );
  registrar.register(tool);
  h.start();
  h.start();
  expect(h.pi.setActiveTools).toHaveBeenCalledExactlyOnceWith([
    'read',
    'occasional',
  ]);
  expect(h.pi.registerTool).toHaveBeenCalledTimes(1);
});

it('restores direct exposure and activation when discovery disappears', () => {
  const h = host(['codemode', 'occasional']);
  createAdaptiveToolRegistrar(h.pi as unknown as ExtensionAPI).register(tool);
  h.start();
  h.pi.getActiveTools.mockReturnValue(['read']);
  h.start();
  expect(h.pi.registerTool).toHaveBeenLastCalledWith({
    ...tool,
    exposure: 'direct',
    defaultActive: true,
  });
  expect(h.pi.setActiveTools).toHaveBeenLastCalledWith(['read', 'occasional']);
});

it('uses the resolved exposure for late registrations without repeating warnings', () => {
  vi.stubEnv('THOTH_AGENTS_PI_EXPOSURE', 'bad');
  const h = host(['codemode']);
  const registrar = createAdaptiveToolRegistrar(
    h.pi as unknown as ExtensionAPI,
  );
  h.start();
  registrar.register(tool);
  registrar.register({ ...tool, name: 'other' });
  expect(h.pi.registerTool).toHaveBeenCalledTimes(2);
  expect(h.pi.registerTool).toHaveBeenNthCalledWith(1, {
    ...tool,
    exposure: 'deferred',
    defaultActive: false,
  });
  expect(h.notify).toHaveBeenCalledTimes(1);
  expect(h.pi.setActiveTools).not.toHaveBeenCalled();
});

it('invalid env without a UI is harmless', () => {
  vi.stubEnv('THOTH_AGENTS_PI_EXPOSURE', '');
  const h = host(['tool_search']);
  createAdaptiveToolRegistrar(h.pi as unknown as ExtensionAPI).register(tool);
  expect(() => h.start({} as never)).not.toThrow();
  expect(h.pi.registerTool).toHaveBeenLastCalledWith(
    expect.objectContaining({ exposure: 'deferred' }),
  );
});

it.each([
  'getter',
  'setter',
])('recovers previously deferred tools if the %s later fails', (failure) => {
  const h = host(['codemode', 'occasional']);
  createAdaptiveToolRegistrar(h.pi as unknown as ExtensionAPI).register(tool);
  h.start();
  if (failure === 'getter')
    h.pi.getActiveTools.mockImplementation(() => {
      throw Error('unbound');
    });
  else {
    h.pi.getActiveTools.mockReturnValue(['codemode', 'occasional']);
    h.pi.setActiveTools.mockImplementation(() => {
      throw Error('unbound');
    });
  }
  expect(() => h.start()).not.toThrow();
  expect(h.pi.registerTool).toHaveBeenLastCalledWith({
    ...tool,
    exposure: 'direct',
    defaultActive: true,
  });
});

it('restores tools when the override changes to direct on another session', () => {
  const h = host(['tool_search', 'occasional']);
  createAdaptiveToolRegistrar(h.pi as unknown as ExtensionAPI).register(tool);
  h.start();
  vi.stubEnv('THOTH_AGENTS_PI_EXPOSURE', 'direct');
  h.start();
  expect(h.pi.registerTool).toHaveBeenLastCalledWith({
    ...tool,
    exposure: 'direct',
    defaultActive: true,
  });
  expect(h.pi.setActiveTools).toHaveBeenLastCalledWith([
    'tool_search',
    'occasional',
  ]);
});

it('removes all occasional tools after allowlist-driven registry refreshes', () => {
  const names = [
    'bg_task_list',
    'bg_task_log',
    'bg_task_stop',
    'bg_task_clear',
  ];
  const allowlist = new Set(['tool_search', 'read', ...names]);
  const h = host([...allowlist]);
  const definitions = new Map<string, { exposure?: string }>();
  h.pi.registerTool.mockImplementation((definition) => {
    definitions.set(definition.name, definition);
    // AgentSession._refreshToolRegistry preserves current active names and
    // re-adds allowlisted declarable tools on EVERY registerTool call.
    const active = new Set(h.pi.getActiveTools());
    for (const [name, registered] of definitions) {
      if (allowlist.has(name) && registered.exposure === 'direct')
        active.add(name);
    }
    // A tool registered by another extension during refresh must be preserved.
    if (definition.exposure === 'deferred') active.add('other_extension_tool');
    h.pi.getActiveTools.mockReturnValue([...active]);
  });
  h.pi.setActiveTools.mockImplementation((next) => {
    h.pi.getActiveTools.mockReturnValue([...next]);
  });
  const registrar = createAdaptiveToolRegistrar(
    h.pi as unknown as ExtensionAPI,
  );
  for (const name of names) registrar.register({ ...tool, name });
  h.start();
  expect(h.pi.getActiveTools()).toEqual([
    'tool_search',
    'read',
    'other_extension_tool',
  ]);
  for (const name of names)
    expect(definitions.get(name)?.exposure).toBe('deferred');
  expect(h.pi.setActiveTools).toHaveBeenCalledExactlyOnceWith([
    'tool_search',
    'read',
    'other_extension_tool',
  ]);
  h.start();
  expect(h.pi.registerTool).toHaveBeenCalledTimes(8);
  expect(h.pi.setActiveTools).toHaveBeenCalledTimes(1);
});

it('reactivates direct tools best-effort if a setter partially applies then throws', () => {
  const h = host(['codemode', 'occasional']);
  h.pi.setActiveTools
    .mockImplementationOnce((next) => {
      h.pi.getActiveTools.mockReturnValue([...next]);
      throw Error('setter failed after updating loadout');
    })
    .mockImplementation((next) => {
      h.pi.getActiveTools.mockReturnValue([...next]);
    });
  createAdaptiveToolRegistrar(h.pi as unknown as ExtensionAPI).register(tool);
  expect(() => h.start()).not.toThrow();
  expect(h.pi.registerTool).toHaveBeenLastCalledWith({
    ...tool,
    exposure: 'direct',
    defaultActive: true,
  });
  expect(h.pi.getActiveTools()).toEqual(['codemode', 'occasional']);
  expect(h.pi.setActiveTools).toHaveBeenCalledTimes(2);
});

it('restores direct tools and activation if the post-registration getter fails', () => {
  const h = host(['tool_search']);
  h.pi.getActiveTools
    .mockImplementationOnce(() => ['tool_search'])
    .mockImplementationOnce(() => {
      throw Error('refresh failed');
    });
  createAdaptiveToolRegistrar(h.pi as unknown as ExtensionAPI).register(tool);
  expect(() => h.start()).not.toThrow();
  expect(h.pi.registerTool).toHaveBeenLastCalledWith({
    ...tool,
    exposure: 'direct',
    defaultActive: true,
  });
  expect(h.pi.setActiveTools).toHaveBeenLastCalledWith([
    'tool_search',
    'occasional',
  ]);
});

it('recovers a partially registered deferred batch when registration fails', () => {
  const h = host(['tool_search']);
  h.pi.registerTool.mockImplementation((definition) => {
    if (definition.name === 'second' && definition.exposure === 'deferred') {
      throw Error('registration failed');
    }
  });
  const registrar = createAdaptiveToolRegistrar(
    h.pi as unknown as ExtensionAPI,
  );
  registrar.register(tool);
  registrar.register({ ...tool, name: 'second' });
  expect(() => h.start()).not.toThrow();
  expect(h.pi.registerTool).toHaveBeenLastCalledWith({
    ...tool,
    exposure: 'direct',
    defaultActive: true,
  });
  expect(h.pi.getActiveTools()).toEqual([
    'tool_search',
    'occasional',
    'second',
  ]);
  registrar.register({ ...tool, name: 'late' });
  expect(h.pi.registerTool).toHaveBeenLastCalledWith(
    expect.objectContaining({ name: 'late', exposure: 'direct' }),
  );
});

it('continues best-effort recovery when one direct registration fails', () => {
  const h = host(['tool_search', 'occasional', 'second']);
  const registrar = createAdaptiveToolRegistrar(
    h.pi as unknown as ExtensionAPI,
  );
  registrar.register(tool);
  registrar.register({ ...tool, name: 'second' });
  h.start();
  h.pi.registerTool.mockImplementation((definition) => {
    if (definition.name === 'occasional' && definition.exposure === 'direct') {
      throw Error('registration unavailable');
    }
  });
  h.pi.getActiveTools.mockImplementationOnce(() => {
    throw Error('getter unavailable');
  });
  expect(() => h.start()).not.toThrow();
  expect(h.pi.registerTool).toHaveBeenLastCalledWith(
    expect.objectContaining({ name: 'second', exposure: 'direct' }),
  );
  expect(h.pi.setActiveTools).toHaveBeenLastCalledWith([
    'tool_search',
    'occasional',
    'second',
  ]);
});
