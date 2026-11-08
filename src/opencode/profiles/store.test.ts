import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ModelProfileStore, modelProfilePaths } from './store.js';

let root: string;
let store: ModelProfileStore;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'thoth-profiles-'));
  store = new ModelProfileStore({
    cwd: root,
    configDir: path.join(root, 'config'),
    roster: { orchestrator: { model: 'base/main', variant: 'high' } },
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});
function write(scope: 'global' | 'project', value: unknown) {
  fs.mkdirSync(path.dirname(store.paths[scope]), { recursive: true });
  fs.writeFileSync(
    store.paths[scope],
    typeof value === 'string' ? value : JSON.stringify(value),
  );
}

it('matches OpenCode config path semantics with injected environment and home', () => {
  expect(modelProfilePaths({ cwd: root, homeDir: root, env: {} }).global).toBe(
    path.join(root, '.config/opencode/thoth/profiles.json'),
  );
  expect(
    modelProfilePaths({
      cwd: root,
      homeDir: root,
      env: { OPENCODE_CONFIG_DIR: '  custom  ', XDG_CONFIG_HOME: 'xdg' },
    }).global,
  ).toBe(path.join('custom', 'thoth/profiles.json'));
  expect(
    modelProfilePaths({
      cwd: root,
      homeDir: root,
      env: { OPENCODE_CONFIG_DIR: ' ', XDG_CONFIG_HOME: 'xdg' },
    }).global,
  ).toBe(path.join('xdg', 'opencode/thoth/profiles.json'));
  expect(store.paths.project).toBe(
    path.join(root, '.opencode/thoth/profiles.json'),
  );
});

it('selects session then project pin then global active then effective virtual default with shadowing', () => {
  write('global', {
    version: 1,
    active: 'shared',
    profiles: {
      shared: { agents: { worker: { model: 'global/worker' } } },
      session: { agents: {} },
    },
  });
  write('project', {
    version: 1,
    active: 'local',
    profiles: {
      shared: { agents: { worker: { model: 'project/worker' } } },
      local: { agents: {} },
    },
  });
  expect(store.resolve('session')).toMatchObject({
    name: 'session',
    scope: 'global',
  });
  expect(store.resolve()).toMatchObject({ name: 'local', scope: 'project' });
  write('project', {
    version: 1,
    profiles: { shared: { agents: { worker: { model: 'project/worker' } } } },
  });
  expect(store.resolve()).toMatchObject({
    name: 'shared',
    scope: 'project',
    profile: { agents: { worker: { model: 'project/worker' } } },
  });
  expect(store.resolve('default')).toMatchObject({
    name: 'default',
    profile: {
      agents: { orchestrator: { model: 'base/main', variant: 'high' } },
    },
  });
});

it('warns on missing pointers and invalid files without throwing during load', () => {
  write('global', { version: 1, active: 'gone', profiles: {} });
  write('project', { version: 1, active: 'also-gone', profiles: {} });
  const selection = store.resolve('session-gone');
  expect(selection.name).toBe('default');
  expect(selection.warnings).toHaveLength(3);
  for (const invalid of [
    '{',
    { version: 2, profiles: {} },
    { version: 1, profiles: { default: { agents: {} } } },
    { version: 1, profiles: { bad: { agents: { invented: {} } } } },
    {
      version: 1,
      profiles: { bad: { agents: { worker: { model: 'unqualified' } } } },
    },
  ]) {
    write('project', invalid);
    expect(store.read('project').profiles).toEqual({});
    expect(
      store
        .resolve()
        .warnings.some((warning) => warning.includes(store.paths.project)),
    ).toBe(true);
  }
});

it('atomically re-reads mutations, preserves other profiles, updates pointers and guards default', () => {
  store.create('global', 'one', {
    agents: { worker: { model: 'one/worker' } },
  });
  store.setGlobalActive('one');
  store.setProjectPin('one');
  store.create('global', 'two', { agents: {} });
  store.save('global', 'one', { agents: { worker: { variant: 'max' } } });
  expect(Object.keys(store.read('global').profiles)).toEqual(['one', 'two']);
  store.rename('global', 'one', 'renamed');
  expect(store.read('global').active).toBe('renamed');
  expect(store.read('project').active).toBe('renamed');
  expect(store.delete('global', 'renamed')).toEqual({ clearedActive: true });
  expect(store.read('global').active).toBeUndefined();
  expect(store.read('project').active).toBeUndefined();
  store.setGlobalActive('default');
  store.setGlobalActive();
  store.setProjectPin('default');
  store.setProjectPin();
  for (const operation of [
    () => store.save('global', 'default', { agents: {} }),
    () => store.create('project', 'default', { agents: {} }),
    () => store.rename('global', 'two', 'default'),
    () => store.delete('global', 'default'),
  ])
    expect(operation).toThrow(/reserved/);
  expect(() => store.create('global', 'two', { agents: {} })).toThrow(
    /already exists/,
  );
  expect(() => store.setGlobalActive('missing')).toThrow(/not found/);
  const original = fs.readFileSync(store.paths.global, 'utf8');
  const rename = vi.spyOn(fs, 'renameSync').mockImplementation(() => {
    throw new Error('rename failed');
  });
  expect(() =>
    store.save('global', 'two', {
      agents: { worker: { model: 'new/worker' } },
    }),
  ).toThrow('rename failed');
  expect(rename.mock.calls[0][0]).toMatch(/\.tmp$/);
  expect(rename.mock.calls[0][1]).toBe(store.paths.global);
  expect(fs.readFileSync(store.paths.global, 'utf8')).toBe(original);
  expect(fs.readdirSync(path.dirname(store.paths.global))).toEqual([
    'profiles.json',
  ]);
});

it('does not overwrite an invalid document on mutation and forwards load warnings', () => {
  const warn = vi.fn();
  const warned = new ModelProfileStore({ cwd: root, paths: store.paths, warn });
  write('global', '{bad json');
  expect(warned.resolve().name).toBe('default');
  expect(warn).toHaveBeenCalledWith(
    expect.stringContaining(store.paths.global),
  );
  expect(() => warned.save('global', 'new', { agents: {} })).toThrow(
    /Cannot read/,
  );
  expect(fs.readFileSync(store.paths.global, 'utf8')).toBe('{bad json');
});

it('does not follow global rename/delete through a shadowed project pin', () => {
  store.create('global', 'shared', { agents: {} });
  store.create('project', 'shared', { agents: {} });
  store.setProjectPin('shared');
  store.rename('global', 'shared', 'renamed');
  expect(store.read('project').active).toBe('shared');
  store.delete('global', 'renamed');
  expect(store.resolve()).toMatchObject({ name: 'shared', scope: 'project' });
});
