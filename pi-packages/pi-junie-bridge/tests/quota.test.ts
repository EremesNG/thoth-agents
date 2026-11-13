import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { fetchJunieQuota } from '../src/quota.js';

const fixture = fileURLToPath(
  new URL('./fixtures/fake-junie.cjs', import.meta.url),
);

test.each([
  ['timeout', {}, /timed out/i],
  ['not-advertised', {}, /stats.*advertised/i],
  ['thought', {}, /thought/i],
  ['tool', {}, /tool/i],
  ['cost', {}, /cost/i],
  ['success', { FAKE_AUTH: '1' }, /authentication/i],
  ['success', { FAKE_INIT_AUTH: '1' }, /authentication/i],
  ['success', { FAKE_PERMISSION: '1' }, /permission/i],
] as const)(
  'quota rejects unsafe or unavailable stats: %s',
  async (mode, extra, reason) => {
    const dir = mkdtempSync(join(tmpdir(), 'junie-quota-fallback-')),
      transcript = join(dir, 'wire.jsonl');
    try {
      const result = await fetchJunieQuota({
        command: { file: process.execPath, args: [fixture] },
        env: { FAKE_STATS: mode, FAKE_TRANSCRIPT: transcript, ...extra },
        timeoutMs: 1500,
        commandsTimeoutMs: 100,
        requestTimeoutMs: 1800,
      });
      expect(result).toContain('unavailable');
      expect(result).toContain('https://account.jetbrains.com');
      expect(result).toMatch(reason);
      const wire = readFileSync(transcript, 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      const pid = wire.find((m) => m.method === 'fixture/quota_pid')?.params
        .pid;
      if (pid) expect(() => process.kill(pid, 0)).toThrow();
      if (mode === 'not-advertised')
        expect(wire.some((m) => m.method === 'session/prompt')).toBe(false);
    } finally {
      rmSync(dir, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 100,
      });
    }
  },
  10000,
);

test('missing Junie returns actionable unavailable guidance', async () => {
  const result = await fetchJunieQuota({
    launcherPath: join(tmpdir(), 'missing-junie-quota-launcher'),
    timeoutMs: 100,
  });
  expect(result).toContain('unavailable');
  expect(result).toContain('launcher not found');
  expect(result).toContain('https://account.jetbrains.com');
});

test('zero-cost usage does not hide a valid quota response', async () => {
  const result = await fetchJunieQuota({
    command: { file: process.execPath, args: [fixture] },
    env: { FAKE_STATS: 'free' },
    timeoutMs: 3000,
  });
  expect(result).toContain('Balance left: 64.75 credits');
});

// Catches wrong parsing, inference prompts, unsafe session setup, and leaked children.
test('quota prints the captured balance using only /stats on a closed throwaway session', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'junie-quota-')),
    transcript = join(dir, 'wire.jsonl');
  try {
    const result = await fetchJunieQuota({
      cwd: dir,
      command: { file: process.execPath, args: [fixture] },
      env: { FAKE_STATS: 'success', FAKE_TRANSCRIPT: transcript },
      timeoutMs: 3000,
    });
    expect(result).toBe(
      'Junie (JetBrains AI Pro)\nBalance left: 64.75 credits\nTop-up: https://jb.gg/junie_top_up',
    );
    const wire = readFileSync(transcript, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(
      wire.filter((m) => m.method === 'session/new').map((m) => m.params),
    ).toEqual([{ cwd: dir, mcpServers: [] }]);
    expect(
      wire
        .filter((m) => m.method === 'session/prompt')
        .map((m) => m.params.prompt),
    ).toEqual([[{ type: 'text', text: '/stats' }]]);
    expect(
      wire.find((m) => m.method === 'session/set_config_option').params,
    ).toMatchObject({ configId: 'brave_mode', value: 'off' });
    expect(
      wire.some(
        (m) => m.method === 'session/resume' || m.method === 'session/fork',
      ),
    ).toBe(false);
    expect(wire.some((m) => m.method === 'session/close')).toBe(true);
    const pid = wire.find((m) => m.method === 'fixture/quota_pid').params.pid;
    expect(() => process.kill(pid, 0)).toThrow();
  } finally {
    rmSync(dir, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    });
  }
}, 10000);

test('malformed quota returns account-settings guidance instead of throwing', async () => {
  const result = await fetchJunieQuota({
    command: { file: process.execPath, args: [fixture] },
    env: { FAKE_STATS: 'malformed' },
    timeoutMs: 3000,
  });
  expect(result).toContain('unavailable');
  expect(result).toContain(
    'JetBrains Account → JetBrains AI settings (https://account.jetbrains.com)',
  );
  expect(result).toMatch(/parse/i);
}, 10000);
