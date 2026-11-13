import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import {
  effortToThinking,
  parseCatalog,
  projectModels,
  readCatalog,
  recordContextWindow,
  refreshCatalog,
  toJunieEffort,
} from '../src/catalog.js';

const fixture = fileURLToPath(
  new URL('./fixtures/fake-junie.cjs', import.meta.url),
);

test('refresh discovers grouped ACP model IDs without inference and persists the catalog in the agent directory', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'junie-catalog-')),
    transcript = join(dir, 'wire.jsonl');
  try {
    expect(readCatalog(dir)).toBeUndefined();
    const catalog = await refreshCatalog({
      agentDir: dir,
      cwd: dir,
      command: { file: process.execPath, args: [fixture] },
      env: { FAKE_TRANSCRIPT: transcript },
    });
    expect(catalog.version).toBe(3);
    expect(catalog.models).toEqual([
      { id: 'v1:12:jetbrains-ai:gemini-3.7-flash', name: 'Gemini 3.7 Flash' },
      { id: 'mix.auto', name: 'Junie Auto' },
    ]);
    expect(catalog.efforts).toEqual(['low', 'medium', 'high']);
    expect(readCatalog(dir)).toEqual(catalog);
    expect(
      JSON.parse(readFileSync(join(dir, 'junie-bridge/models.json'), 'utf8')),
    ).toEqual(catalog);
    expect(
      readFileSync(transcript, 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line).method),
    ).toEqual(['initialize', 'session/new', 'session/close']);
    expect(projectModels(catalog)[0]).toMatchObject({
      id: 'v1:12:jetbrains-ai:gemini-3.7-flash',
      provider: 'junie',
      api: 'junie-bridge',
      reasoning: true,
      thinkingLevelMap: {
        off: null,
        low: 'low',
        medium: 'medium',
        high: 'high',
      },
    });
    expect(
      ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'].map((level) =>
        toJunieEffort(level as never),
      ),
    ).toEqual(['low', 'low', 'low', 'medium', 'high', 'high', 'high']);
    expect(
      ['low', 'medium', 'high'].map((level) =>
        effortToThinking(level as never),
      ),
    ).toEqual(['low', 'medium', 'high']);
    writeFileSync(join(dir, 'junie-bridge/models.json'), '{bad');
    expect(readCatalog(dir)).toBeUndefined();
  } finally {
    rmSync(dir, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    });
  }
}, 10000);

test('unauthenticated discovery gives login guidance without replacing a working cache', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'junie-auth-'));
  try {
    const opts = {
      agentDir: dir,
      cwd: dir,
      command: { file: process.execPath, args: [fixture] },
    };
    const saved = await refreshCatalog(opts);
    await expect(
      refreshCatalog({ ...opts, env: { FAKE_AUTH: '1' } }),
    ).rejects.toThrow('run `junie` and log in with your JetBrains Account');
    expect(readCatalog(dir)).toEqual(saved);
  } finally {
    rmSync(dir, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    });
  }
}, 10000);

test('mix options stay distinguishable from the concrete model they route to', () => {
  const catalog = parseCatalog([
    {
      id: 'model',
      name: 'Model',
      type: 'select',
      currentValue: 'mix.normal',
      options: [
        {
          value: 'mix.normal',
          name: 'Normal',
          _meta: {
            jetbrains: {
              air: {
                version: 1,
                eco: 'on',
                modelDisplayName: 'GPT-6.1 Terra',
              },
            },
          },
        },
        {
          value: 'mix.hard',
          name: 'Hard',
          _meta: {
            jetbrains: { air: { modelDisplayName: 'Claude Opus 5.5' } },
          },
        },
        { value: 'mix.frontier', name: 'Frontier' },
        { value: 'v1:12:jetbrains-ai:claude-opus-5', name: 'Claude Opus 5' },
      ],
    },
  ]);
  expect(projectModels(catalog).map(({ id, name }) => ({ id, name }))).toEqual([
    { id: 'mix.normal', name: 'Junie Normal (GPT-6.1 Terra)' },
    { id: 'mix.hard', name: 'Junie Hard (Claude Opus 5.5)' },
    { id: 'mix.frontier', name: 'Junie Frontier' },
    { id: 'v1:12:jetbrains-ai:claude-opus-5', name: 'Claude Opus 5' },
  ]);
});

test('non-mix display metadata only overrides a differing ACP name', () => {
  const catalog = parseCatalog([
    {
      id: 'model',
      name: 'Model',
      type: 'select',
      currentValue: 'v1:12:jetbrains-ai:gpt-6.1-terra',
      options: [
        {
          value: 'v1:12:jetbrains-ai:gpt-6.1-terra',
          name: 'GPT-6.1 Terra',
          _meta: {
            jetbrains: { air: { modelDisplayName: 'GPT-6.1 Terra' } },
          },
        },
        {
          value: 'v1:12:jetbrains-ai:gemini-3.7-flash',
          name: 'Gemini 3.7 Flash',
          _meta: { 'jetbrains.air.modelDisplayName': 'Gemini 3.7 Flash Pro' },
        },
        { value: 'v1:12:jetbrains-ai:unknown', name: '  ' },
      ],
    },
  ]);
  expect(projectModels(catalog).map(({ id, name }) => ({ id, name }))).toEqual([
    { id: 'v1:12:jetbrains-ai:gpt-6.1-terra', name: 'GPT-6.1 Terra' },
    {
      id: 'v1:12:jetbrains-ai:gemini-3.7-flash',
      name: 'Junie Gemini 3.7 Flash (Gemini 3.7 Flash Pro)',
    },
    { id: 'v1:12:jetbrains-ai:unknown', name: 'v1:12:jetbrains-ai:unknown' },
  ]);
});

test('stale catalog versions are invalidated so mix labels are rediscovered', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'junie-old-catalog-'));
  const cache = join(dir, 'junie-bridge/models.json');
  try {
    await refreshCatalog({
      agentDir: dir,
      command: { file: process.execPath, args: [fixture] },
    });
    for (const version of [1, 2]) {
      writeFileSync(
        cache,
        JSON.stringify({
          version,
          refreshedAt: '2026-11-12T00:00:00.000Z',
          models: [{ id: 'mix.normal', name: 'GPT-6.1 Terra' }],
          efforts: [],
        }),
      );
      expect(readCatalog(dir)).toBeUndefined();
    }
    writeFileSync(
      cache,
      JSON.stringify({
        version: 3,
        refreshedAt: '2026-11-12T00:00:00.000Z',
        models: [{ id: 'mix.normal', name: 'Junie Normal (GPT-6.1 Terra)' }],
        efforts: ['low'],
      }),
    );
    expect(readCatalog(dir)?.models[0].name).toBe(
      'Junie Normal (GPT-6.1 Terra)',
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('observed context capacity persists per model and survives catalog refresh', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'junie-context-'));
  const opts = {
    agentDir: dir,
    command: { file: process.execPath, args: [fixture] },
  };
  try {
    await refreshCatalog(opts);
    recordContextWindow('mix.auto', 1048576, dir);
    const models = projectModels(readCatalog(dir)!);
    expect(models.find((m) => m.id === 'mix.auto')?.contextWindow).toBe(
      1048576,
    );
    expect(models[0].contextWindow).toBe(32000);
    recordContextWindow('mix.auto', NaN, dir);
    recordContextWindow('unknown', 42, dir);
    expect(projectModels(await refreshCatalog(opts))[1].contextWindow).toBe(
      1048576,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
