import type { Theme, ToolDefinition } from '@earendil-works/pi-coding-agent';
import { createTestRenderKit } from '@thoth-agents/pi-core/testing';
import { afterEach, describe, expect, expectTypeOf, it } from 'vitest';
import {
  getRenderKit,
  type RenderIndicatorContext,
  type RenderKitTheme,
  registerRenderKit,
  withdrawRenderKit,
} from '../src/index.js';

const registryKey = Symbol.for('thoth-agents.pi-core.render-kit.v1');
const shared = globalThis as typeof globalThis & { [registryKey]?: unknown };
const kit = createTestRenderKit();

afterEach(() => {
  delete shared[registryKey];
});

describe('render kit registry', () => {
  it('accepts SDK 1.0.2 theme and tool render context structurally', () => {
    type Context = Parameters<NonNullable<ToolDefinition['renderCall']>>[2];
    expectTypeOf<Theme>().toExtend<RenderKitTheme>();
    expectTypeOf<Context>().toExtend<RenderIndicatorContext>();
  });

  it('shares registrations across independently loaded copies of pi-core', async () => {
    const copy = await import(
      `${new URL('../src/render-kit.ts', import.meta.url).href}?copy`
    );
    const token = copy.registerRenderKit(kit, {});
    expect(getRenderKit()).toBe(kit);
    withdrawRenderKit(token);
    expect(copy.getRenderKit()).toBeUndefined();
  });

  it.each([
    null,
    {},
    { kit: { ...kit, version: 2 } },
    { kit: { version: 1 } },
    { kit: { ...kit, card: null } },
    {
      get kit() {
        throw new Error('foreign accessor');
      },
    },
  ])('ignores missing, incompatible or malformed foreign registrations', (value) => {
    shared[registryKey] = value;
    expect(getRenderKit()).toBeUndefined();
  });

  it('discovers the current kit and withdraws only the owning registration', () => {
    expect(getRenderKit()).toBeUndefined();
    const owner = {};
    const old = registerRenderKit(kit, owner);
    expect(getRenderKit()).toBe(kit);
    const replacement = { ...kit };
    const current = registerRenderKit(replacement, owner);
    expect(current).not.toBe(old);
    withdrawRenderKit(old);
    expect(getRenderKit()).toBe(replacement);
    withdrawRenderKit(Symbol('foreign'));
    expect(getRenderKit()).toBe(replacement);
    withdrawRenderKit(current);
    expect(getRenderKit()).toBeUndefined();
    withdrawRenderKit(current);
    expect(getRenderKit()).toBeUndefined();
  });
});
