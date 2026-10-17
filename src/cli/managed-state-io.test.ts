import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  parseManagedModelStateJson,
  stableJson,
  writeManagedModelState,
  writeTextWithBackup,
} from './managed-state-io';

test('managed state updates preserve every unrelated field and replace owned maps', () => {
  const dir = mkdtempSync(join(tmpdir(), 'managed-state-'));
  const path = join(dir, 'state.json');
  const original = {
    version: 1,
    models: { worker: 'old' },
    configuredEfforts: { worker: 'high' },
    priorThreadsValue: '3',
    ownedHookTrustKeys: ['session', 'subagent'],
    roleDigests: { worker: 'a'.repeat(64) },
    roleStructureDigests: { worker: 'b'.repeat(64) },
    futureField: { nested: ['preserve', 42] },
  };
  try {
    writeFileSync(path, stableJson(original));
    expect(
      writeManagedModelState(path, 1, {
        models: { worker: 'new' },
        configuredEfforts: {},
      }),
    ).toBe(true);
    const expected = {
      ...original,
      models: { worker: 'new' },
      configuredEfforts: {},
    };
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(expected);
    expect(JSON.parse(readFileSync(`${path}.bak`, 'utf8'))).toEqual(original);
    expect(
      writeManagedModelState(path, 1, {
        models: { worker: 'new' },
        configuredEfforts: {},
      }),
    ).toBe(false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('managed model state effort compatibility', () => {
  test('retains durable TOML digests and ignores malformed digest entries', () => {
    const digest = 'a'.repeat(64);
    const parsed = parseManagedModelStateJson(
      JSON.stringify({
        version: 1,
        models: {},
        roleDigests: {
          'thoth-agents-worker.toml': digest,
          invalid: 'not-sha256',
          number: 42,
        },
        roleStructureDigests: {
          'thoth-agents-worker.toml': digest,
          invalid: 'z'.repeat(64),
        },
      }),
      1,
    );
    expect(parsed.roleDigests).toEqual({ 'thoth-agents-worker.toml': digest });
    expect(parsed.roleStructureDigests).toEqual({
      'thoth-agents-worker.toml': digest,
    });
    expect(parseManagedModelStateJson(stableJson(parsed), 1)).toEqual(parsed);
  });
  test('loads legacy v1 model-only state unchanged', () => {
    expect(
      parseManagedModelStateJson(
        JSON.stringify({
          version: 1,
          models: { worker: 'gpt-5' },
          configuredModels: { worker: 'gpt-5.6-sol' },
        }),
        1,
      ),
    ).toEqual({
      version: 1,
      models: { worker: 'gpt-5' },
      configuredModels: { worker: 'gpt-5.6-sol' },
    });
  });

  test('round-trips only explicit configured effort entries', () => {
    const parsed = parseManagedModelStateJson(
      JSON.stringify({
        version: 1,
        models: {},
        configuredEfforts: {
          worker: 'ultra',
          quick: 'inherit',
          explorer: 42,
        },
      }),
      1,
    );
    expect(parsed).toEqual({
      version: 1,
      models: {},
      configuredEfforts: { worker: 'ultra' },
    });
    expect(JSON.parse(stableJson(parsed))).toEqual(parsed);
  });
});

test.each([
  'symlink',
  'dangling',
  'directory',
])('rejects %s managed-file backup destinations', (kind) => {
  const dir = mkdtempSync(join(tmpdir(), 'managed-backup-'));
  try {
    const path = join(dir, 'owned.txt');
    const unrelated = join(dir, 'operator.txt');
    writeFileSync(path, 'original');
    if (kind === 'directory') mkdirSync(`${path}.bak`);
    else {
      if (kind === 'symlink') writeFileSync(unrelated, 'operator');
      symlinkSync(unrelated, `${path}.bak`);
    }
    expect(() => writeTextWithBackup(path, 'replacement')).toThrow();
    expect(readFileSync(path, 'utf8')).toBe('original');
    if (kind === 'symlink')
      expect(readFileSync(unrelated, 'utf8')).toBe('operator');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test.each([
  'symlink',
  'dangling',
  'regular',
] as const)('managed state preserves a pre-existing %s at the legacy temp path', (kind) => {
  const dir = mkdtempSync(join(tmpdir(), 'managed-staging-'));
  const path = join(dir, 'state.json');
  const unrelated = join(dir, 'unrelated');
  const staging = `${path}.tmp`;
  try {
    writeFileSync(path, stableJson({ version: 1, models: {} }));
    if (kind === 'regular') writeFileSync(staging, 'operator staging');
    else {
      if (kind === 'symlink') writeFileSync(unrelated, 'operator content');
      symlinkSync(unrelated, staging, 'file');
    }
    expect(writeManagedModelState(path, 1, { models: { worker: 'new' } })).toBe(
      true,
    );
    expect(JSON.parse(readFileSync(path, 'utf8')).models).toEqual({
      worker: 'new',
    });
    expect(lstatSync(path).isSymbolicLink()).toBe(false);
    if (kind === 'regular')
      expect(readFileSync(staging, 'utf8')).toBe('operator staging');
    else {
      expect(lstatSync(staging).isSymbolicLink()).toBe(true);
      if (kind === 'symlink')
        expect(readFileSync(unrelated, 'utf8')).toBe('operator content');
      else expect(existsSync(unrelated)).toBe(false);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
