import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import {
  effortToThinking,
  projectModels,
  readCatalog,
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
    expect(catalog.models).toEqual([
      { id: 'v1:12:jetbrains-ai:gemini-3.7-flash', name: 'Gemini 3.7 Flash' },
      { id: 'mix.auto', name: 'Auto' },
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
