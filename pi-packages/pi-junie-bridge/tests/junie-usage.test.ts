import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { junieUsageLine, readJunieModel } from '../src/junie-usage.js';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
function fixture(
  settings: unknown = {
    formatVersion: 1,
    model: { modelId: 'gpt-6.1-terra', effortWireId: 'low' },
  },
) {
  const home = mkdtempSync(join(tmpdir(), 'junie-model-'));
  dirs.push(home);
  const dir = join(home, 'sessions', 'session-1');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'settings.json'),
    typeof settings === 'string' ? settings : JSON.stringify(settings),
  );
  return { home, dir };
}

test('display line shows the Pi model, the real Junie model, effort and this turn cost', () => {
  expect(
    junieUsageLine({
      piModel: 'mix.normal',
      junie: { modelId: 'gpt-6.1-terra', effortWireId: 'low' },
      cost: 0.0313,
    }),
  ).toBe('Junie · mix.normal → gpt-6.1-terra (low) · $0.0313');
});

test('display line omits effort and cost segments when they are unavailable', () => {
  expect(
    junieUsageLine({
      piModel: 'mix.normal',
      junie: { modelId: 'gpt-6.1-terra' },
    }),
  ).toBe('Junie · mix.normal → gpt-6.1-terra');
  expect(
    junieUsageLine({
      piModel: 'mix.normal',
      junie: { modelId: 'gpt-6.1-terra', effortWireId: 'high' },
      cost: 0,
    }),
  ).toBe('Junie · mix.normal → gpt-6.1-terra (high)');
});

test.each([
  [0.1234567, ' · $0.1235'],
  [0.0001, ' · $0.0001'],
  [0.00009, ' · <$0.0001'],
  [0.000001, ' · <$0.0001'],
])('formats a positive attributed cost of %d as %s instead of showing it as free', (cost, segment) => {
  expect(
    junieUsageLine({
      piModel: 'mix.normal',
      junie: { modelId: 'gpt-6.1-terra' },
      cost,
    }),
  ).toBe(`Junie · mix.normal → gpt-6.1-terra${segment}`);
});

test('reads the concrete model and effort from the ACP session settings', async () => {
  const { home } = fixture();
  expect(await readJunieModel({ sessionId: 'session-1', home })).toEqual({
    modelId: 'gpt-6.1-terra',
    effortWireId: 'low',
  });
});

test('reads the model alone when settings has no effort', async () => {
  const { home } = fixture({ model: { modelId: 'gpt-6.1-terra' } });
  expect(await readJunieModel({ sessionId: 'session-1', home })).toEqual({
    modelId: 'gpt-6.1-terra',
  });
});

test('falls back to JUNIE_HOME for the sessions root', async () => {
  const { home } = fixture();
  const previous = process.env.JUNIE_HOME;
  process.env.JUNIE_HOME = home;
  try {
    expect(await readJunieModel({ sessionId: 'session-1' })).toEqual({
      modelId: 'gpt-6.1-terra',
      effortWireId: 'low',
    });
  } finally {
    if (previous === undefined) delete process.env.JUNIE_HOME;
    else process.env.JUNIE_HOME = previous;
  }
});

test.each([
  'missing',
  'malformed',
  'no-model',
  'empty-model-id',
])('silently skips %s settings with a debug diagnostic', async (kind) => {
  const { home, dir } = fixture();
  if (kind === 'missing') rmSync(join(dir, 'settings.json'));
  else if (kind === 'malformed') writeFileSync(join(dir, 'settings.json'), '{');
  else if (kind === 'no-model')
    writeFileSync(join(dir, 'settings.json'), '{"formatVersion":1}');
  else writeFileSync(join(dir, 'settings.json'), '{"model":{"modelId":""}}');
  const debug: string[] = [];
  expect(
    await readJunieModel({
      sessionId: 'session-1',
      home,
      debug: (line) => debug.push(line),
    }),
  ).toBeUndefined();
  expect(debug).toHaveLength(1);
});

test.each([
  '..',
  '../other',
  'a/b',
  'a\\b',
  '',
])('rejects traversal session id %j without leaving the sessions root', async (sessionId) => {
  const { home } = fixture();
  const debug: string[] = [];
  expect(
    await readJunieModel({
      sessionId,
      home,
      debug: (line) => debug.push(line),
    }),
  ).toBeUndefined();
  expect(debug).toHaveLength(1);
});
