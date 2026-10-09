import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { ProviderLimitEntry } from '../src/index.js';
import { createTestRenderKit } from '../src/testing.js';
import { isolatedCore } from './isolated-core-fixture.js';

let first: Awaited<ReturnType<typeof isolatedCore>>;
let same: Awaited<ReturnType<typeof isolatedCore>>;
let different: Awaited<ReturnType<typeof isolatedCore>>;
const cleanups: Array<() => void> = [];
const shared = globalThis as typeof globalThis & Record<symbol, unknown>;
beforeAll(async () => {
  first = await isolatedCore();
  same = await isolatedCore();
  different = await isolatedCore(1, 2);
});
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  for (const version of [1, 2]) {
    delete shared[Symbol.for(`thoth-agents.pi-core.render-kit.v${version}`)];
    delete shared[
      Symbol.for(`thoth-agents.pi-core.tool-definitions.v${version}`)
    ];
  }
});
afterAll(async () => {
  await first?.dispose();
  await same?.dispose();
  await different?.dispose();
});

describe('isolated render-kit/tool-definition contracts', () => {
  it.each([
    false,
    true,
  ])('shares registrations only between compatible copies (other first: %s)', (reverse) => {
    const [owner, other] = reverse
      ? [same.core, first.core]
      : [first.core, same.core];
    expect(owner.getRenderKit).not.toBe(other.getRenderKit);
    const kit = createTestRenderKit();
    const token = owner.registerRenderKit(kit, {});
    expect(other.getRenderKit()).toBe(kit);
    other.withdrawRenderKit(token);
    expect(owner.getRenderKit()).toBeUndefined();
    const definition = { name: 'shared', renderCall: () => [] };
    const handle = owner.publishToolDefinitions([definition]);
    cleanups.push(() => handle.withdraw());
    expect(other.getPublishedToolDefinition('shared')).toBe(definition);
    expect(other.getToolDefinitionRegistryVersion()).toBe(1);
    handle.withdraw();
    expect(other.getPublishedToolDefinition('shared')).toBeUndefined();
  });

  it.each([
    false,
    true,
  ])('keeps incompatible contracts independent (v2 first: %s)', (reverse) => {
    const copies = reverse
      ? ([
          [different.core, 2],
          [first.core, 1],
        ] as const)
      : ([
          [first.core, 1],
          [different.core, 2],
        ] as const);
    for (const [core, version] of copies) {
      const kit = { ...createTestRenderKit(), version } as any;
      const token = core.registerRenderKit(kit, {});
      cleanups.push(() => core.withdrawRenderKit(token));
      const definition = { name: 'shared', label: `v${version}` };
      const handle = core.publishToolDefinitions([definition]);
      cleanups.push(() => handle.withdraw());
      expect(core.getRenderKit()).toBe(kit);
      expect(core.getPublishedToolDefinition('shared')).toBe(definition);
    }
    expect(first.core.getRenderKit()?.version).toBe(1);
    expect(different.core.getRenderKit()?.version).toBe(2);
    expect(first.core.getPublishedToolDefinition('shared')).toHaveProperty(
      'label',
      'v1',
    );
    expect(different.core.getPublishedToolDefinition('shared')).toHaveProperty(
      'label',
      'v2',
    );
    expect(first.core.getToolDefinitionRegistryVersion()).toBe(1);
    expect(different.core.getToolDefinitionRegistryVersion()).toBe(1);
  });
});

describe('isolated provider-limit contracts', () => {
  const key = Symbol.for('thoth.pi-core.provider-limits.v1');
  afterEach(() => {
    delete shared[key];
  });

  it.each([
    false,
    true,
  ])('shares reports, expiry reads, and subscriptions across copies (other first: %s)', (reverse) => {
    const [owner, other] = reverse
      ? [same.core, first.core]
      : [first.core, same.core];
    expect(owner.reportProviderLimit).not.toBe(other.reportProviderLimit);
    const entry = {
      provider: 'claude-bridge',
      window: 'five_hour',
      status: 'allowed_warning' as const,
      utilization: 0.95,
      resetsAt: 20_000,
      observedAt: 10_000,
      sessionId: 'child-session',
    };
    const captured: ProviderLimitEntry[] = [];
    const off = other.subscribeProviderLimits((value) => {
      captured.push(value);
    });
    cleanups.push(off);
    expect(owner.reportProviderLimit(entry)).toBe(true);
    expect(captured).toEqual([entry]);
    expect(other.listProviderLimits(10_000)).toEqual([entry]);
    expect(other.listProviderLimits(20_000)).toEqual([
      {
        provider: 'claude-bridge',
        window: 'five_hour',
        status: 'allowed',
        resetsAt: 20_000,
        observedAt: 10_000,
        sessionId: 'child-session',
      },
    ]);
    const replacement = { ...entry, sessionId: 'root-session' };
    expect(other.reportProviderLimit(replacement)).toBe(true);
    expect(owner.listProviderLimits(10_000)).toEqual([replacement]);
    expect(captured).toEqual([entry, replacement]);
    off();
    off();
    owner.reportProviderLimit(entry);
    expect(captured).toEqual([entry, replacement]);
  });

  it('lets both copies ignore an incompatible owner without replacing it', () => {
    const foreign = { version: 2, entries: new Map(), listeners: new Set() };
    shared[key] = foreign;
    for (const core of [first.core, same.core]) {
      const off = core.subscribeProviderLimits(() => {
        throw new Error('must not be called');
      });
      expect(
        core.reportProviderLimit({
          provider: 'claude-bridge',
          window: 'five_hour',
          status: 'rejected',
          observedAt: 10_000,
          sessionId: 'child-session',
        }),
      ).toBe(false);
      expect(core.listProviderLimits()).toEqual([]);
      expect(() => off()).not.toThrow();
      expect(shared[key]).toBe(foreign);
    }
  });
});
