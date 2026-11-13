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
  shortModelId,
  toAcpModelValue,
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
    expect(catalog.version).toBe(4);
    expect(catalog.models).toEqual([
      {
        id: 'gemini-3.7-flash',
        value: 'v1:12:jetbrains-ai:gemini-3.7-flash',
        name: 'Gemini 3.7 Flash',
      },
      { id: 'mix.auto', value: 'mix.auto', name: 'Junie Auto' },
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
      id: 'gemini-3.7-flash',
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
    { id: 'claude-opus-5', name: 'Claude Opus 5' },
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
    { id: 'gpt-6.1-terra', name: 'GPT-6.1 Terra' },
    {
      id: 'gemini-3.7-flash',
      name: 'Junie Gemini 3.7 Flash (Gemini 3.7 Flash Pro)',
    },
    { id: 'unknown', name: 'v1:12:jetbrains-ai:unknown' },
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
    for (const version of [1, 2, 3]) {
      writeFileSync(
        cache,
        JSON.stringify({
          version,
          refreshedAt: '2026-11-12T00:00:00.000Z',
          models: [
            {
              id: 'v1:12:jetbrains-ai:gemini-3.7-flash',
              name: 'GPT-6.1 Terra',
            },
          ],
          efforts: [],
        }),
      );
      expect(readCatalog(dir)).toBeUndefined();
    }
    writeFileSync(
      cache,
      JSON.stringify({
        version: 4,
        refreshedAt: '2026-11-12T00:00:00.000Z',
        models: [
          {
            id: 'mix.normal',
            value: 'mix.normal',
            name: 'Junie Normal (GPT-6.1 Terra)',
          },
        ],
        efforts: ['low'],
      }),
    );
    expect(readCatalog(dir)?.models[0].name).toBe(
      'Junie Normal (GPT-6.1 Terra)',
    );
    // A v4 catalog without the ACP value cannot translate a Pi model id.
    writeFileSync(
      cache,
      JSON.stringify({
        version: 4,
        refreshedAt: '2026-11-12T00:00:00.000Z',
        models: [{ id: 'mix.normal', name: 'Junie Normal (GPT-6.1 Terra)' }],
        efforts: [],
      }),
    );
    expect(readCatalog(dir)).toBeUndefined();
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
    // A Pi id alone never records: it may name a different ACP value later.
    recordContextWindow('gemini-3.7-flash', 64000, dir);
    expect(
      readCatalog(dir)!.models.find((m) => m.id === 'gemini-3.7-flash')
        ?.contextWindow,
    ).toBeUndefined();
    const models = projectModels(readCatalog(dir)!);
    expect(models.find((m) => m.id === 'mix.auto')?.contextWindow).toBe(
      1048576,
    );
    expect(models[0].contextWindow).toBe(32000);
    // The ACP value is the only key.
    recordContextWindow('v1:12:jetbrains-ai:gemini-3.7-flash', 200000, dir);
    recordContextWindow('mix.auto', NaN, dir);
    recordContextWindow('unknown', 42, dir);
    const refreshed = await refreshCatalog(opts);
    expect(
      refreshed.models.find((m) => m.id === 'mix.auto')?.contextWindow,
    ).toBe(1048576);
    expect(
      refreshed.models.find((m) => m.id === 'gemini-3.7-flash')?.contextWindow,
    ).toBe(200000);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Pi model ids are the last ACP segment, mixes are unchanged and colliding short ids fall back to the full value', () => {
  const catalog = parseCatalog([
    {
      id: 'model',
      name: 'Model',
      type: 'select',
      currentValue: 'mix.auto',
      options: [
        {
          value: 'v1:12:jetbrains-ai:gemini-3.7-flash',
          name: 'Gemini 3.7 Flash',
        },
        { value: 'mix.auto', name: 'Auto' },
        {
          value: 'v1:12:jetbrains-ai:claude-opus-5-5',
          name: 'Claude Opus 5.5',
        },
        // Same short id from another ACP revision: both keep the full value.
        {
          value: 'v1:99:jetbrains-ai:gemini-3.7-flash',
          name: 'Gemini 3.7 Flash (next)',
        },
        { value: 'plain-model', name: 'Plain' },
      ],
    },
  ]);
  expect(catalog.models.map(({ id, value }) => ({ id, value }))).toEqual([
    {
      id: 'v1:12:jetbrains-ai:gemini-3.7-flash',
      value: 'v1:12:jetbrains-ai:gemini-3.7-flash',
    },
    { id: 'mix.auto', value: 'mix.auto' },
    { id: 'claude-opus-5-5', value: 'v1:12:jetbrains-ai:claude-opus-5-5' },
    {
      id: 'v1:99:jetbrains-ai:gemini-3.7-flash',
      value: 'v1:99:jetbrains-ai:gemini-3.7-flash',
    },
    { id: 'plain-model', value: 'plain-model' },
  ]);
  // Pi sees the short id; Junie always receives the ACP value.
  expect(toAcpModelValue('claude-opus-5-5', catalog)).toBe(
    'v1:12:jetbrains-ai:claude-opus-5-5',
  );
  expect(toAcpModelValue('mix.auto', catalog)).toBe('mix.auto');
  // Both forms of an already-known model resolve to the same wire value.
  expect(toAcpModelValue('v1:12:jetbrains-ai:claude-opus-5-5', catalog)).toBe(
    'v1:12:jetbrains-ai:claude-opus-5-5',
  );
  expect(() => toAcpModelValue('nope', catalog)).toThrow(/nope/);
  expect(() => toAcpModelValue('v1:99:unknown', catalog)).toThrow(
    /v1:99:unknown/,
  );
  expect(() => toAcpModelValue('gemini-3.7-flash', catalog)).toThrow(
    /ambiguous.*gemini-3\.7-flash/i,
  );
  expect(toAcpModelValue('mix.normal', catalog)).toBe('mix.normal');
  expect(toAcpModelValue('nope')).toBe('nope');
});

test('short id derivation never returns an empty segment', () => {
  expect(shortModelId('v1:12:jetbrains-ai:gemini-3.7-flash')).toBe(
    'gemini-3.7-flash',
  );
  expect(shortModelId('mix.normal')).toBe('mix.normal');
  expect(shortModelId('a:b:c')).toBe('c');
  expect(shortModelId('v1:12:jetbrains-ai:')).toBe('v1:12:jetbrains-ai:');
});

test('refresh does not transfer capacity between ACP values sharing a short id', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'junie-capacity-identity-'));
  const opts = {
    agentDir: dir,
    command: { file: process.execPath, args: [fixture] },
  };
  try {
    const previous = await refreshCatalog(opts);
    previous.models[0].value = 'v1:99:jetbrains-ai:gemini-3.7-flash';
    previous.models[0].contextWindow = 200000;
    writeFileSync(
      join(dir, 'junie-bridge/models.json'),
      JSON.stringify(previous),
    );
    const refreshed = await refreshCatalog(opts);
    expect(refreshed.models[0].contextWindow).toBeUndefined();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a stale short id resolves a unique ACP tail even after its Pi id changes', () => {
  const catalog = {
    version: 4 as const,
    refreshedAt: '',
    efforts: [],
    models: [
      {
        id: 'v1:12:jetbrains-ai:gemini-3.7-flash',
        value: 'v1:12:jetbrains-ai:gemini-3.7-flash',
        name: 'Gemini',
      },
    ],
  };
  expect(toAcpModelValue('gemini-3.7-flash', catalog)).toBe(
    'v1:12:jetbrains-ai:gemini-3.7-flash',
  );
});
