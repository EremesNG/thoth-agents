import type {
  ToolDefinition,
  ToolRenderers,
} from '@earendil-works/pi-coding-agent';
import { afterEach, describe, expect, expectTypeOf, it } from 'vitest';
import {
  getPublishedToolDefinition,
  getToolDefinitionRegistryVersion,
  publishToolDefinitions,
  type ToolDefinitionHandle,
  type ToolDefinitionLike,
  type ToolRenderersLike,
} from '../src/index.js';

const handles: ToolDefinitionHandle[] = [];
const registryKey = Symbol.for('thoth-agents.pi-core.tool-definitions.v1');
const shared = globalThis as typeof globalThis & Record<symbol, unknown>;

afterEach(() => {
  for (const handle of handles.splice(0)) handle.withdraw();
  delete shared[registryKey];
});

describe('tool definition registry', () => {
  it.each([
    null,
    {},
    { entries: {}, version: 0 },
    { entries: new Map(), version: Number.NaN },
    { entries: new Map(), version: '1' },
    { entries: new Map([['foreign', {}]]), version: 0 },
    { entries: new Map([['foreign', [null]]]), version: 0 },
    {
      entries: new Map([['foreign', [{ token: Symbol(), definition: {} }]]]),
      version: 0,
    },
    {
      entries: new Map([
        [
          'foreign',
          [
            {
              token: Symbol(),
              definition: { name: 'foreign', renderCall: 42 },
            },
          ],
        ],
      ]),
      version: 0,
    },
    {
      entries: new Map([
        [
          'foreign',
          [
            {
              token: Symbol(),
              definition: { name: 'foreign', renderResult: 'bad' },
            },
          ],
        ],
      ]),
      version: 0,
    },
    {
      entries: new Map([
        [
          'foreign',
          [
            {
              token: Symbol(),
              definition: { name: 'foreign', renderShell: 'bad' },
            },
          ],
        ],
      ]),
      version: 0,
    },
    {
      get entries(): never {
        throw new Error('foreign accessor');
      },
      version: 0,
    },
  ])('uses no-registry behavior for malformed foreign records', (record) => {
    shared[registryKey] = record;
    expect(getPublishedToolDefinition('foreign')).toBeUndefined();
    expect(getToolDefinitionRegistryVersion()).toBe(0);
    const handle = publishToolDefinitions([{ name: 'own' }]);
    handles.push(handle);
    expect(() => handle.publish([{ name: 'later' }])).not.toThrow();
    expect(getPublishedToolDefinition('own')).toBeUndefined();
    expect(getPublishedToolDefinition('later')).toBeUndefined();
    expect(getToolDefinitionRegistryVersion()).toBe(0);
    expect(() => handle.withdraw()).not.toThrow();
    expect(getPublishedToolDefinition('own')).toBeUndefined();
    expect(shared[registryKey]).toBe(record);
  });

  it('accepts host definitions and renderer types without casts', () => {
    expectTypeOf<ToolDefinition>().toExtend<ToolDefinitionLike>();
    expectTypeOf<ToolRenderers>().toExtend<ToolRenderersLike>();
    expectTypeOf<ToolRenderersLike>().toExtend<ToolRenderers>();
  });

  it('resolves the latest live publication and reveals the earlier owner on withdrawal', () => {
    const earlier = { name: 'shared', label: 'earlier', renderCall: () => [] };
    const later = { name: 'shared', label: 'later', renderResult: () => [] };
    const first = publishToolDefinitions([earlier]);
    handles.push(first);
    expect(getPublishedToolDefinition('shared')).toBe(earlier);

    const second = publishToolDefinitions([later]);
    handles.push(second);
    expect(getPublishedToolDefinition('shared')).toBe(later);

    second.withdraw();
    expect(getPublishedToolDefinition('shared')).toBe(earlier);
    first.withdraw();
    expect(getPublishedToolDefinition('shared')).toBeUndefined();
  });

  it('publishes late definitions and replacements without dropping other tools', () => {
    const original = { name: 'shared' };
    const retained = { name: 'retained' };
    const competing = { name: 'shared' };
    const replacement = { name: 'shared', renderShell: 'self' as const };
    const late = { name: 'late' };
    const first = publishToolDefinitions([original, retained]);
    const second = publishToolDefinitions([competing]);
    handles.push(first, second);

    first.publish([late, replacement]);
    expect(getPublishedToolDefinition('shared')).toBe(replacement);
    expect(getPublishedToolDefinition('retained')).toBe(retained);
    expect(getPublishedToolDefinition('late')).toBe(late);

    first.withdraw();
    expect(getPublishedToolDefinition('shared')).toBe(competing);
    expect(getPublishedToolDefinition('retained')).toBeUndefined();
    expect(getPublishedToolDefinition('late')).toBeUndefined();
  });

  it('increments the version on each changed batch, including hidden withdrawals', () => {
    const version = getToolDefinitionRegistryVersion();
    const earlier = { name: 'shared' };
    const first = publishToolDefinitions([earlier, { name: 'other' }]);
    handles.push(first);
    expect(getToolDefinitionRegistryVersion()).toBe(version + 1);

    const second = publishToolDefinitions([{ name: 'shared' }]);
    handles.push(second);
    expect(getToolDefinitionRegistryVersion()).toBe(version + 2);

    first.publish([earlier]);
    expect(getToolDefinitionRegistryVersion()).toBe(version + 3);
    expect(getPublishedToolDefinition('shared')).toBe(earlier);
    second.withdraw();
    expect(getToolDefinitionRegistryVersion()).toBe(version + 4);
    expect(getPublishedToolDefinition('shared')).toBe(earlier);

    second.withdraw();
    expect(getToolDefinitionRegistryVersion()).toBe(version + 4);
    expect(getPublishedToolDefinition('shared')).toBe(earlier);
    first.withdraw();
    expect(getToolDefinitionRegistryVersion()).toBe(version + 5);
    expect(getPublishedToolDefinition('shared')).toBeUndefined();
  });

  it('keeps missing lookups and empty or withdrawn handles from changing the version', () => {
    const version = getToolDefinitionRegistryVersion();
    expect(getPublishedToolDefinition('missing')).toBeUndefined();
    const handle = publishToolDefinitions([]);
    handles.push(handle);
    handle.publish([]);
    expect(getToolDefinitionRegistryVersion()).toBe(version);

    handle.withdraw();
    handle.withdraw();
    handle.publish([{ name: 'too-late' }]);
    expect(getPublishedToolDefinition('too-late')).toBeUndefined();
    expect(getToolDefinitionRegistryVersion()).toBe(version);
  });

  it('can publish through an initially empty live handle', () => {
    const handle = publishToolDefinitions([]);
    handles.push(handle);
    const late = { name: 'late' };
    const version = getToolDefinitionRegistryVersion();
    handle.publish([late]);
    expect(getPublishedToolDefinition('late')).toBe(late);
    expect(getToolDefinitionRegistryVersion()).toBe(version + 1);
    handle.withdraw();
    expect(getPublishedToolDefinition('late')).toBeUndefined();
    expect(getToolDefinitionRegistryVersion()).toBe(version + 2);
  });

  it('shares live definitions and the version across independently loaded copies', async () => {
    const copy = await import(
      `${new URL('../src/tool-registry.ts', import.meta.url).href}?copy`
    );
    const version = getToolDefinitionRegistryVersion();
    const earlier = { name: 'shared' };
    const later = { name: 'shared' };
    const first = publishToolDefinitions([earlier]);
    const second = copy.publishToolDefinitions([later]);
    handles.push(first, second);
    expect(getPublishedToolDefinition('shared')).toBe(later);
    expect(copy.getPublishedToolDefinition('shared')).toBe(later);
    expect(getToolDefinitionRegistryVersion()).toBe(version + 2);
    expect(copy.getToolDefinitionRegistryVersion()).toBe(version + 2);

    second.withdraw();
    expect(copy.getPublishedToolDefinition('shared')).toBe(earlier);
    first.withdraw();
    expect(copy.getPublishedToolDefinition('shared')).toBeUndefined();
    expect(copy.getToolDefinitionRegistryVersion()).toBe(version + 4);
  });
});
