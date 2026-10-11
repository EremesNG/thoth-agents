import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import {
  ModelProfileStore,
  modelProfilePaths,
} from '../../src/model-profiles/store.js';

const roots: string[] = [];
function store() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'profiles-'));
  roots.push(cwd);
  return new ModelProfileStore({ cwd, agentDir: path.join(cwd, 'agent') });
}
afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true });
});
it('saves normalized agent overrides in the independent versioned store and preserves unrelated fields', () => {
  const s = store();
  fs.mkdirSync(path.dirname(s.paths.global), { recursive: true });
  fs.writeFileSync(
    s.paths.global,
    JSON.stringify({ version: 1, profiles: {}, extra: { keep: true } }),
  );
  s.save('global', 'fast', {
    agents: {
      ' Worker ': { model: { provider: 'openai', id: 'gpt' }, effort: 'max' },
    },
  });
  expect(s.read('global').profiles.fast.agents.worker).toEqual({
    model: { provider: 'openai', id: 'gpt' },
    effort: 'max',
  });
  expect(JSON.parse(fs.readFileSync(s.paths.global, 'utf8'))).toMatchObject({
    extra: { keep: true },
    version: 1,
  });
  expect(fs.readdirSync(path.dirname(s.paths.global))).toEqual([
    'profiles.json',
  ]);
});
it('clones, renames and deletes profiles, updating only the owning active pointer', () => {
  const s = store();
  s.create('global', 'fast', { agents: { worker: { effort: 'low' } } });
  s.setGlobalActive('fast');
  s.clone('fast', 'project', 'local');
  s.setProjectPin('local');
  s.rename('project', 'local', 'renamed');
  expect(s.read('project').active).toBe('renamed');
  expect(s.delete('project', 'renamed')).toEqual({ clearedActive: true });
  expect(s.read('project').active).toBeUndefined();
  expect(s.read('global').active).toBe('fast');
});
it('never overwrites malformed files or accepts reserved names and invalid values', () => {
  const s = store();
  fs.mkdirSync(path.dirname(s.paths.global), { recursive: true });
  fs.writeFileSync(s.paths.global, 'broken');
  expect(() => s.save('global', 'fast', { agents: {} })).toThrow(/Cannot read/);
  expect(fs.readFileSync(s.paths.global, 'utf8')).toBe('broken');
  for (const action of [
    () => s.save('project', 'default', { agents: {} }),
    () => s.rename('project', 'default', 'other'),
    () => s.delete('project', 'default'),
  ])
    expect(action).toThrow(/reserved/);
  expect(() =>
    s.save('project', 'bad', {
      agents: { worker: { effort: 'invalid' as any } },
    }),
  ).toThrow(/effort/);
  expect(() =>
    s.save('project', 'bad', { agents: { worker: { model: 'bare' as any } } }),
  ).toThrow(/model/);
});
it('selects session then pin then global, shadows globally named profiles and warns on missing references', () => {
  const s = store();
  s.save('global', 'fast', { agents: { worker: { effort: 'low' } } });
  s.setGlobalActive('fast');
  s.save('project', 'fast', { agents: { worker: { effort: 'max' } } });
  expect(s.resolve()).toEqual({
    name: 'fast',
    scope: 'project',
    profile: { agents: { worker: { effort: 'max' } } },
    warnings: [],
  });
  s.save('project', 'local', { agents: { worker: { effort: 'high' } } });
  s.setProjectPin('local');
  expect(s.resolve().name).toBe('local');
  expect(s.resolve('fast').scope).toBe('project');
  expect(s.resolve('missing')).toMatchObject({
    name: 'local',
    warnings: [expect.stringContaining('Missing session')],
  });
  expect(s.resolve('default').name).toBe('default');
});
it('warns and falls back when a dangling global active name exists only in the project', () => {
  const s = store();
  fs.mkdirSync(path.dirname(s.paths.global), { recursive: true });
  fs.writeFileSync(
    s.paths.global,
    JSON.stringify({ version: 1, active: 'orphan', profiles: {} }),
  );
  s.save('project', 'orphan', { agents: { worker: { effort: 'max' } } });
  expect(s.resolve()).toEqual({
    name: 'default',
    profile: { agents: {} },
    warnings: ['Missing global model profile "orphan"; falling back.'],
  });
  expect(s.resolve('orphan')).toMatchObject({
    name: 'orphan',
    scope: 'project',
    warnings: [],
  });
  s.setProjectPin('orphan');
  expect(s.resolve()).toMatchObject({
    name: 'orphan',
    scope: 'project',
    warnings: [],
  });
});
it('preserves unrelated per-agent fields when model and effort are edited', () => {
  const s = store();
  s.save('project', 'fast', {
    extra: true,
    agents: {
      worker: { model: 'openai/old', effort: 'high', future: { keep: true } },
    },
  });
  s.save('project', 'fast', { agents: { worker: { effort: 'low' } } });
  expect(
    JSON.parse(fs.readFileSync(s.paths.project, 'utf8')).profiles.fast,
  ).toMatchObject({
    extra: true,
    agents: { worker: { effort: 'low', future: { keep: true } } },
  });
  expect(s.read('project').profiles.fast.agents.worker.model).toBeUndefined();
});
it('supports profile names that coincide with object prototype keys', () => {
  const s = store();
  s.create('global', '__proto__', { agents: { worker: { effort: 'max' } } });
  s.setGlobalActive('__proto__');
  expect(s.resolve().name).toBe('__proto__');
  expect(s.read('global').profiles.__proto__.agents.worker.effort).toBe('max');
});
it('global activation must be portable outside the current project, while pins can reference global profiles', () => {
  const s = store();
  s.create('project', 'local', { agents: {} });
  expect(() => s.setGlobalActive('local')).toThrow(/not found/);
  s.create('global', 'shared', { agents: {} });
  s.setProjectPin('shared');
  expect(s.resolve().name).toBe('shared');
  s.setProjectPin();
  expect(s.read('project').active).toBeUndefined();
});
it('reports malformed stores and missing persistent references while falling through to default', () => {
  const s = store();
  fs.mkdirSync(path.dirname(s.paths.global), { recursive: true });
  fs.writeFileSync(
    s.paths.global,
    JSON.stringify({ version: 1, active: 'gone', profiles: {} }),
  );
  fs.mkdirSync(path.dirname(s.paths.project), { recursive: true });
  fs.writeFileSync(
    s.paths.project,
    JSON.stringify({ version: 1, active: 'missing', profiles: {} }),
  );
  expect(s.resolve()).toMatchObject({
    name: 'default',
    warnings: [
      expect.stringContaining('Missing project'),
      expect.stringContaining('Missing global'),
    ],
  });
  fs.writeFileSync(s.paths.project, 'bad');
  expect(s.resolve().warnings).toEqual([
    expect.stringContaining('Cannot read'),
    expect.stringContaining('Missing global'),
  ]);
  expect(fs.readFileSync(s.paths.project, 'utf8')).toBe('bad');
});
it('can clone a shadowed global profile explicitly without copying its local replacement', () => {
  const s = store();
  s.save('global', 'same', { agents: { worker: { effort: 'low' } } });
  s.save('project', 'same', { agents: { worker: { effort: 'max' } } });
  s.clone('same', 'project', 'copy', 'global');
  expect(s.read('project').profiles.copy.agents.worker.effort).toBe('low');
});
it('writes a same-directory temporary file and preserves the old store if rename fails', () => {
  const s = store();
  s.save('global', 'fast', { agents: { worker: { effort: 'low' } } });
  const before = fs.readFileSync(s.paths.global, 'utf8');
  const rename = vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
    expect(path.dirname(String(from))).toBe(path.dirname(String(to)));
    expect(
      JSON.parse(fs.readFileSync(from, 'utf8')).profiles.fast.agents.worker
        .effort,
    ).toBe('max');
    throw new Error('rename failed');
  });
  try {
    expect(() =>
      s.save('global', 'fast', { agents: { worker: { effort: 'max' } } }),
    ).toThrow('rename failed');
    expect(fs.readFileSync(s.paths.global, 'utf8')).toBe(before);
    expect(fs.readdirSync(path.dirname(s.paths.global))).toEqual([
      'profiles.json',
    ]);
  } finally {
    rename.mockRestore();
  }
});
it('honors explicit agentDir before PI_CODING_AGENT_DIR and otherwise uses the Pi default', () => {
  const previous = process.env.PI_CODING_AGENT_DIR;
  try {
    process.env.PI_CODING_AGENT_DIR = '/custom/agent';
    expect(modelProfilePaths({ cwd: '/project' }).global).toBe(
      path.join('/custom/agent', 'thoth', 'profiles.json'),
    );
    expect(
      modelProfilePaths({ cwd: '/project', agentDir: '/explicit' }),
    ).toEqual({
      global: path.join('/explicit', 'thoth', 'profiles.json'),
      project: path.join('/project', '.pi', 'thoth', 'profiles.json'),
    });
    delete process.env.PI_CODING_AGENT_DIR;
    expect(modelProfilePaths({ cwd: '/project' }).global).toBe(
      path.join(os.homedir(), '.pi', 'agent', 'thoth', 'profiles.json'),
    );
  } finally {
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previous;
  }
});
