import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import {
  readModelsDevCache,
  resolveModelsDevCachePath,
  writeModelsDevCacheAtomic,
} from './cache';
import { loadModelsDevCatalog } from './index';
import type { ModelOption } from './types';

const roots: string[] = [];

function temporaryCachePath(): string {
  const root = mkdtempSync(join(tmpdir(), 'thoth-model-cache-'));
  roots.push(root);
  return join(root, 'models-dev-v1.json');
}

const manual: ModelOption[] = [
  {
    id: 'manual',
    catalogId: 'custom/manual',
    label: 'Manual',
    provider: 'custom',
    efforts: ['careful'],
    source: 'manual',
  },
];

const validPayload = {
  openai: {
    models: {
      'gpt-5': {
        id: 'openai/gpt-5',
        reasoning_options: [{ type: 'effort', values: ['low', 'high'] }],
      },
    },
  },
};

afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

describe('models.dev cache', () => {
  test('uses platform cache conventions', () => {
    expect(
      resolveModelsDevCachePath({
        platform: 'win32',
        env: { LOCALAPPDATA: 'C:\\Cache' },
        homeDir: 'C:\\Users\\Ada',
      }),
    ).toBe(join('C:\\Cache', 'thoth-agents', 'models-dev-v1.json'));
    expect(
      resolveModelsDevCachePath({
        platform: 'linux',
        env: { XDG_CACHE_HOME: '/var/cache/ada' },
        homeDir: '/home/ada',
      }),
    ).toBe('/var/cache/ada/thoth-agents/models-dev-v1.json');
  });

  test('atomically writes and validates cache contents', () => {
    const cachePath = temporaryCachePath();
    writeModelsDevCacheAtomic(cachePath, {
      version: 1,
      etag: '"v1"',
      fetchedAt: '2026-07-11T00:00:00.000Z',
      catalog: {
        models: [
          {
            id: 'gpt-5',
            catalogId: 'openai/gpt-5',
            label: 'gpt-5',
            provider: 'openai',
            efforts: ['low'],
            source: 'lkg',
          },
        ],
      },
    });

    expect(readModelsDevCache(cachePath)?.etag).toBe('"v1"');
    expect(readdirSync(join(cachePath, '..'))).toEqual(['models-dev-v1.json']);
  });

  test('uses ETag for 304 and preserves LKG when a fresh response is invalid', async () => {
    const cachePath = temporaryCachePath();
    const first = await loadModelsDevCatalog({
      cachePath,
      manual,
      now: () => new Date('2026-07-11T00:00:00.000Z'),
      fetcher: async () =>
        new Response(JSON.stringify(validPayload), {
          status: 200,
          headers: { etag: '"v1"' },
        }),
    });
    expect(first.source).toBe('remote');
    const saved = readFileSync(cachePath, 'utf8');

    let conditionalHeader: string | null = null;
    const unchanged = await loadModelsDevCatalog({
      cachePath,
      manual,
      fetcher: async (_input, init) => {
        conditionalHeader = new Headers(init?.headers).get('If-None-Match');
        return new Response(null, { status: 304 });
      },
    });
    expect(conditionalHeader).toBe('"v1"');
    expect(unchanged.source).toBe('lkg');
    expect(unchanged.models[0]?.catalogId).toBe('openai/gpt-5');

    const invalid = await loadModelsDevCatalog({
      cachePath,
      manual,
      fetcher: async () =>
        new Response(
          JSON.stringify({
            openai: { models: { broken: { reasoning_options: 'high' } } },
          }),
          { status: 200, headers: { etag: '"broken"' } },
        ),
    });
    expect(invalid.source).toBe('lkg');
    expect(invalid.warnings.length).toBeGreaterThan(0);
    expect(readFileSync(cachePath, 'utf8')).toBe(saved);
  });

  test('falls back to manual models on first-run offline or corrupt cache', async () => {
    const cachePath = temporaryCachePath();
    expect(existsSync(cachePath)).toBe(false);
    const result = await loadModelsDevCatalog({
      cachePath,
      manual,
      fetcher: async () => {
        throw new Error('offline');
      },
    });
    expect(result.source).toBe('manual');
    expect(result.models).toEqual(manual);
  });
});
