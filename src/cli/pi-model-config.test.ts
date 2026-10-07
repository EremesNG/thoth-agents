import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import { PI_SPECIALIST_ROLES } from '../harness/pi-specialists';
import * as managedWrite from './pi-managed-write';
import { readPiModelConfig, savePiModelConfig } from './pi-model-config';

const roots: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'thoth-models-'));
  roots.push(root);
  mkdirSync(join(root, 'agents'));
  for (const role of PI_SPECIALIST_ROLES) {
    writeFileSync(
      join(root, 'agents', `thoth-${role}.md`),
      `---\nname: thoth-${role}\nmanaged-by: thoth-agents\nmodel: "provider/old"\neffort: low\ntools: read\n---\nmodel: body-example\n`,
    );
  }
  return root;
}

test('rejects malformed frontmatter and unsafe directory links, and no-op saves do not write', () => {
  const piRoot = fixture();
  const snapshot = readPiModelConfig(piRoot);
  expect(savePiModelConfig(snapshot, snapshot.roles).changedRoles).toEqual([]);
  expect(readdirSync(join(piRoot, 'agents'))).toHaveLength(5);
  const path = join(piRoot, 'agents', 'thoth-worker.md');
  writeFileSync(
    path,
    readFileSync(path, 'utf8').replace(
      'model: "provider/old"',
      'model: "provider/old"\nmodel: shadow/model',
    ),
  );
  expect(() => readPiModelConfig(piRoot)).toThrow(/duplicate/i);
  const linked = join(piRoot, 'linked');
  mkdirSync(linked);
  symlinkSync(join(piRoot, 'agents'), join(linked, 'agents'), 'junction');
  expect(() => readPiModelConfig(linked)).toThrow(/symlink/i);
});

test('reports partial writes and returns a retry snapshot without losing the draft', () => {
  const piRoot = fixture();
  const snapshot = readPiModelConfig(piRoot);
  const draft = snapshot.roles.map((role) => ({
    ...role,
    model: 'provider/new',
  }));
  const originalWrite = managedWrite.writePiManagedText;
  let count = 0;
  const spy = vi
    .spyOn(managedWrite, 'writePiManagedText')
    .mockImplementation((path, content) => {
      if (++count === 2) throw new Error('File locked');
      return originalWrite(path, content);
    });
  const result = savePiModelConfig(snapshot, draft);
  expect(result.success).toBe(false);
  expect(result.changedRoles).toEqual(['explorer']);
  expect(result.error).toContain('File locked');
  spy.mockRestore();
  const retry = savePiModelConfig(result.snapshot, draft);
  expect(retry.success).toBe(true);
  expect(retry.changedRoles).toHaveLength(4);
  expect(
    readPiModelConfig(piRoot).roles.every(
      ({ model }) => model === 'provider/new',
    ),
  ).toBe(true);
  expect(snapshot.roles[0]?.model).toBe('provider/old');
});

test('validates the full draft and supports native max and explicit inheritance', () => {
  const piRoot = fixture();
  const snapshot = readPiModelConfig(piRoot);
  expect(
    savePiModelConfig(snapshot, [
      {
        role: 'worker',
        model: 'new/model',
        effort: { kind: 'effort', value: 'ultra' },
      },
    ]).success,
  ).toBe(false);
  expect(
    savePiModelConfig(snapshot, [
      {
        role: 'worker',
        model: 'new/model',
        availableEfforts: ['low'],
        effort: { kind: 'effort', value: 'high' },
      },
    ]).success,
  ).toBe(false);
  expect(
    savePiModelConfig(snapshot, [{ role: 'worker', model: '' }]).success,
  ).toBe(false);
  expect(
    savePiModelConfig(snapshot, [
      { role: 'worker', model: 'a' },
      { role: 'worker', model: 'b' },
    ]).success,
  ).toBe(false);
  expect(
    savePiModelConfig(snapshot, [
      {
        role: 'worker',
        model: 'new/model',
        availableEfforts: ['max'],
        effort: { kind: 'effort', value: 'max' },
      },
    ]).success,
  ).toBe(true);
  const maxConfig = readFileSync(
    join(piRoot, 'agents', 'thoth-worker.md'),
    'utf8',
  );
  expect(maxConfig).toContain('effort: "max"');
  expect(maxConfig).not.toContain('thinking:');
  const next = readPiModelConfig(piRoot);
  expect(
    savePiModelConfig(next, [
      { role: 'worker', model: 'inherit', effort: { kind: 'inherit' } },
    ]).success,
  ).toBe(true);
  expect(
    readPiModelConfig(piRoot).roles.find(({ role }) => role === 'worker'),
  ).toMatchObject({ model: 'inherit', effort: { kind: 'inherit' } });
  const inheritedConfig = readFileSync(
    join(piRoot, 'agents', 'thoth-worker.md'),
    'utf8',
  );
  expect(inheritedConfig).not.toContain('effort:');
  expect(inheritedConfig).not.toContain('thinking:');
});

test('rejects stale or unowned definitions before writing any role', () => {
  const piRoot = fixture();
  const snapshot = readPiModelConfig(piRoot);
  const path = join(piRoot, 'agents', 'thoth-worker.md');
  writeFileSync(
    path,
    (snapshot.contents.worker ?? '').replace(
      'managed-by: thoth-agents',
      'managed-by: someone-else',
    ),
  );
  const result = savePiModelConfig(
    snapshot,
    snapshot.roles.map((role) => ({ ...role, model: 'provider/new' })),
  );
  expect(result.success).toBe(false);
  expect(result.changedRoles).toEqual([]);
  expect(
    readFileSync(join(piRoot, 'agents', 'thoth-explorer.md'), 'utf8'),
  ).toBe(snapshot.contents.explorer);
  expect(() => readPiModelConfig(piRoot)).toThrow(/owned|managed/i);
});

test('reads and saves global specialist choices without changing prompt content', () => {
  const piRoot = fixture();
  const snapshot = readPiModelConfig(piRoot);
  expect(snapshot.roles).toHaveLength(5);
  expect(snapshot.roles.find(({ role }) => role === 'worker')).toMatchObject({
    model: 'provider/old',
    effort: { kind: 'effort', value: 'low' },
  });
  const roles = snapshot.roles.map((role) =>
    role.role === 'worker'
      ? {
          ...role,
          model: 'provider/new',
          effort: { kind: 'effort' as const, value: 'high' },
        }
      : role,
  );
  const result = savePiModelConfig(snapshot, roles);
  expect(result.success).toBe(true);
  expect(result.changedRoles).toEqual(['worker']);
  expect(
    readPiModelConfig(piRoot).roles.find(({ role }) => role === 'worker')
      ?.model,
  ).toBe('provider/new');
  const text = readFileSync(join(piRoot, 'agents', 'thoth-worker.md'), 'utf8');
  expect(text).toContain('effort: "high"');
  expect(text).toContain('tools: read\n---\nmodel: body-example\n');
  expect(text).not.toContain('thinking:');
});
