import type { Theme, ToolDefinition } from '@earendil-works/pi-coding-agent';
import { createKitRenderMemo } from '@thoth-agents/pi-core';
import { createTestRenderKit } from '@thoth-agents/pi-core/testing';
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import {
  getRenderKit,
  type RenderIndicatorContext,
  type RenderKitTheme,
  registerRenderKit,
  type ThothRenderKit,
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

describe('render kit memo', () => {
  it('reuses lines at the same width and kit without rebuilding', () => {
    registerRenderKit(kit, {});
    const memo = createKitRenderMemo();
    const lines = ['card'];
    const build = vi.fn(() => lines);

    expect(memo.render(80, build)).toBe(lines);
    expect(memo.render(80, build)).toBe(lines);
    expect(build).toHaveBeenCalledExactlyOnceWith(kit);
  });

  it('rebuilds when the width changes', () => {
    registerRenderKit(kit, {});
    const memo = createKitRenderMemo();
    const build = vi.fn(() => ['card']);
    const first = memo.render(80, build);
    const resized = memo.render(100, build);

    expect(resized).toEqual(['card']);
    expect(resized).not.toBe(first);
    expect(memo.render(100, build)).toBe(resized);
    expect(build).toHaveBeenCalledTimes(2);
  });

  it('rebuilds when a kit is registered, replaced or withdrawn', () => {
    const memo = createKitRenderMemo();
    const build = vi.fn((current: ThothRenderKit | undefined) => [
      current ? 'kit card' : 'native shell',
    ]);
    const native = memo.render(80, build);
    expect(native).toEqual(['native shell']);

    registerRenderKit(kit, {});
    const card = memo.render(80, build);
    expect(card).toEqual(['kit card']);
    expect(build).toHaveBeenLastCalledWith(kit);

    const replacement = { ...kit };
    const token = registerRenderKit(replacement, {});
    const replaced = memo.render(80, build);
    expect(replaced).toEqual(['kit card']);
    expect(replaced).not.toBe(card);
    expect(build).toHaveBeenLastCalledWith(replacement);

    withdrawRenderKit(token);
    const withdrawn = memo.render(80, build);
    expect(withdrawn).toEqual(['native shell']);
    expect(withdrawn).not.toBe(native);
    expect(memo.render(80, build)).toBe(withdrawn);
    expect(build).toHaveBeenLastCalledWith(undefined);
    expect(build).toHaveBeenCalledTimes(4);
  });

  it.each([
    { label: 'present', current: kit },
    { label: 'absent', current: undefined },
  ])('rebuilds after invalidation with kit $label', ({ current }) => {
    if (current) registerRenderKit(current, {});
    const memo = createKitRenderMemo();
    const build = vi.fn(() => ['card']);
    const first = memo.render(80, build);
    memo.invalidate();
    const rebuilt = memo.render(80, build);

    expect(rebuilt).toEqual(['card']);
    expect(rebuilt).not.toBe(first);
    expect(memo.render(80, build)).toBe(rebuilt);
    expect(build).toHaveBeenCalledTimes(2);
  });

  it('looks up the kit on every render, including cache hits', () => {
    const version = vi.fn(() => 1 as const);
    const observedKit: ThothRenderKit = {
      ...kit,
      get version() {
        return version();
      },
    };
    registerRenderKit(observedKit, {});
    const memo = createKitRenderMemo();
    const build = vi.fn(() => ['card']);

    memo.render(80, build);
    memo.render(80, build);

    expect(version).toHaveBeenCalledTimes(2);
    expect(build).toHaveBeenCalledExactlyOnceWith(observedKit);
  });

  it('reuses empty output when no kit is registered', () => {
    const memo = createKitRenderMemo();
    const build = vi.fn(() => []);
    const empty = memo.render(80, build);

    expect(empty).toEqual([]);
    expect(memo.render(80, build)).toBe(empty);
    expect(build).toHaveBeenCalledExactlyOnceWith(undefined);
  });
});
