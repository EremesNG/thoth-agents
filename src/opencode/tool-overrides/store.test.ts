import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ToolsConflictError,
  ToolsOverrideStore,
  toolsOverridePaths,
} from './store.js';
import { SPECIALIST_ROLES } from './types.js';

let dir: string;
let store: ToolsOverrideStore;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'thoth-tools-'));
  store = new ToolsOverrideStore({
    cwd: dir,
    configDir: path.join(dir, 'config'),
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});
const allow = [{ action: 'read', effect: 'allow' }] as const;
const deny = [{ action: 'read', effect: 'deny' }] as const;
function raw(scope: 'global' | 'project', content: string) {
  fs.mkdirSync(path.dirname(store.paths[scope]), { recursive: true });
  fs.writeFileSync(store.paths[scope], content);
}

it('resolves hermetic paths with the CLI precedence', () => {
  expect(
    toolsOverridePaths({ cwd: '/project', homeDir: '/home', env: {} }),
  ).toEqual({
    global: path.join('/home', '.config/opencode/thoth/tools.json'),
    project: path.join('/project', '.opencode/thoth/tools.json'),
  });
  expect(
    toolsOverridePaths({
      cwd: dir,
      env: { OPENCODE_CONFIG_DIR: ' /custom ', XDG_CONFIG_HOME: '/xdg' },
    }).global,
  ).toBe(path.join('/custom', 'thoth/tools.json'));
  expect(
    toolsOverridePaths({
      cwd: dir,
      env: { OPENCODE_CONFIG_DIR: ' ', XDG_CONFIG_HOME: '/xdg' },
    }).global,
  ).toBe(path.join('/xdg', 'opencode/thoth/tools.json'));
  expect(
    toolsOverridePaths({ cwd: dir, paths: { global: 'g', project: 'p' } }),
  ).toEqual({ global: 'g', project: 'p' });
  expect([...SPECIALIST_ROLES].sort()).toEqual([
    'designer',
    'explorer',
    'librarian',
    'oracle',
    'worker',
  ]);
});

it('project replaces a global role, including empty overrides, and reset restores inheritance', () => {
  expect(store.read('global').warnings).toEqual([]);
  store.save('global', 'worker', allow, store.read('global').revision);
  store.save('global', 'explorer', deny, store.read('global').revision);
  store.save('project', 'worker', [], store.read('project').revision);
  expect(store.resolve().effective).toEqual({
    worker: { origin: 'project', overrides: [] },
    explorer: { origin: 'global', overrides: deny },
  });
  store.reset('project', 'worker', store.read('project').revision);
  expect(store.resolve().effective.worker).toEqual({
    origin: 'global',
    overrides: allow,
  });
  store.reset('global', 'worker', store.read('global').revision);
  expect(store.resolve().effective.worker).toBeUndefined();
});

it('preserves ordered duplicate rules on read and save without changing other roles', () => {
  raw(
    'global',
    JSON.stringify({
      version: 1,
      roles: {
        worker: { overrides: [...allow, ...deny] },
        explorer: { overrides: allow },
        unknown: null,
        orchestrator: null,
      },
    }),
  );
  const snapshot = store.read('global');
  expect(snapshot.document.roles.worker?.overrides).toEqual([
    ...allow,
    ...deny,
  ]);
  expect(snapshot.warnings).toHaveLength(2);
  expect(snapshot.document.roles).not.toHaveProperty('orchestrator');
  store.save('global', 'worker', [...allow, ...deny], snapshot.revision);
  expect(store.read('global').document.roles).toEqual({
    worker: { overrides: [...allow, ...deny] },
    explorer: { overrides: allow },
  });
});

describe('invalid file handling', () => {
  it.each([
    '{broken',
    JSON.stringify({ version: 2, roles: {} }),
    JSON.stringify({ version: 1, roles: [] }),
    JSON.stringify({
      version: 1,
      roles: { worker: { overrides: [{ action: '  ', effect: 'deny' }] } },
    }),
    JSON.stringify({
      version: 1,
      roles: { worker: { overrides: [{ action: 'read', effect: 'maybe' }] } },
    }),
    JSON.stringify({ version: 1, roles: { worker: { overrides: 'read' } } }),
  ])('warns and treats %s as empty; mutations never overwrite it', (content) => {
    raw('global', content);
    const snapshot = store.read('global');
    expect(snapshot.document).toEqual({ version: 1, roles: {} });
    expect(snapshot.warnings.length).toBeGreaterThan(0);
    expect(() =>
      store.save('global', 'worker', allow, snapshot.revision),
    ).toThrow();
    expect(() => store.reset('global', 'worker', snapshot.revision)).toThrow();
    expect(fs.readFileSync(store.paths.global, 'utf8')).toBe(content);
  });
});

it('warns on unreadable paths and falls back from an invalid project file', () => {
  store.save('global', 'worker', allow, store.read('global').revision);
  fs.mkdirSync(store.paths.project, { recursive: true });
  const state = store.resolve();
  expect(state.project.warnings).toHaveLength(1);
  expect(state.effective.worker).toEqual({
    origin: 'global',
    overrides: allow,
  });
  expect(() =>
    store.reset('project', 'worker', state.project.revision),
  ).toThrow();
});

it('rejects invalid mutation inputs and trims nonempty patterns', () => {
  const revision = store.read('global').revision;
  expect(() =>
    store.save('global', 'worker', [{ action: '', effect: 'deny' }], revision),
  ).toThrow();
  expect(() =>
    store.save(
      'global',
      'worker',
      [{ action: 'read', effect: 'unknown' }],
      revision,
    ),
  ).toThrow();
  store.save(
    'global',
    'worker',
    [{ action: ' read ', effect: 'ask' }],
    revision,
  );
  expect(store.read('global').document.roles.worker?.overrides).toEqual([
    { action: 'read', effect: 'ask' },
  ]);
});

it('detects stale file tokens even when another role changed, for save and reset', () => {
  const revision = store.read('global').revision;
  store.save('global', 'explorer', allow, revision);
  expect(() => store.save('global', 'worker', deny, revision)).toThrow(
    ToolsConflictError,
  );
  try {
    store.reset('global', 'worker', revision);
  } catch (error) {
    expect(error).toMatchObject({ code: 'TOOLS_CONFLICT', scope: 'global' });
  }
  expect(store.read('global').document.roles).toEqual({
    explorer: { overrides: allow },
  });
  expect(store.read('project').revision).toBe(revision);
});

it('rechecks revisions after preparing the temporary file and preserves external edits', () => {
  const revision = store.read('global').revision;
  const write = fs.writeFileSync.bind(fs);
  const external = JSON.stringify({
    version: 1,
    roles: { explorer: { overrides: allow } },
  });
  vi.spyOn(fs, 'writeFileSync').mockImplementation((file, data, options) => {
    write(file, data, options);
    if (String(file).endsWith('.tmp')) write(store.paths.global, external);
  });
  expect(() => store.save('global', 'worker', deny, revision)).toThrow(
    ToolsConflictError,
  );
  expect(fs.readFileSync(store.paths.global, 'utf8')).toBe(external);
  expect(fs.readdirSync(path.dirname(store.paths.global))).toEqual([
    'tools.json',
  ]);
});

it('atomically renames a complete temporary file, cleaning it on success and failure', () => {
  store.save('global', 'worker', allow, store.read('global').revision);
  const before = fs.readFileSync(store.paths.global, 'utf8');
  const rename = fs.renameSync.bind(fs);
  const spy = vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
    expect(to).toBe(store.paths.global);
    expect(String(from)).not.toBe(to);
    expect(fs.readFileSync(to, 'utf8')).toBe(before);
    expect(
      JSON.parse(fs.readFileSync(from, 'utf8')).roles.worker.overrides,
    ).toEqual(deny);
    rename(from, to);
  });
  store.save('global', 'worker', deny, store.read('global').revision);
  expect(spy).toHaveBeenCalledOnce();
  expect(fs.readdirSync(path.dirname(store.paths.global))).toEqual([
    'tools.json',
  ]);
  spy.mockImplementation(() => {
    throw new Error('rename failed');
  });
  const revision = store.read('global').revision;
  expect(() => store.reset('global', 'worker', revision)).toThrow(
    'rename failed',
  );
  expect(store.read('global').revision).toBe(revision);
  expect(fs.readdirSync(path.dirname(store.paths.global))).toEqual([
    'tools.json',
  ]);
});
