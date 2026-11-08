import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { isDraft, isEntryDirty, ModelProfileWorkspace } from './editor.js';
import { ModelProfileStore, ProfileConflictError } from './store.js';

let root: string;
let store: ModelProfileStore;
let workspace: ModelProfileWorkspace;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'thoth-editor-'));
  store = new ModelProfileStore({
    cwd: root,
    configDir: path.join(root, 'config'),
    roster: {
      orchestrator: { model: 'base/main' },
      worker: { model: 'base/worker', variant: 'high' },
    },
  });
  workspace = new ModelProfileWorkspace(store);
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

it('keeps drafts in memory until save, clones effective values and detects discard', () => {
  const defaults = workspace.entries()[0];
  expect(() =>
    workspace.edit(defaults, 'worker', { model: 'new/worker' }),
  ).toThrow(/read-only/);
  expect(() => workspace.rename(defaults, 'new')).toThrow(/read-only/);
  expect(() => workspace.delete(defaults)).toThrow(/read-only/);
  expect(() => workspace.save(defaults)).toThrow(/read-only/);
  const draft = workspace.createDraft(defaults, 'mine', 'global');
  expect(isDraft(draft)).toBe(true);
  expect(workspace.pendingCount()).toBe(1);
  workspace.edit(draft, 'worker', { model: 'new/worker', variant: 'max' });
  expect(fs.existsSync(store.paths.global)).toBe(false);
  workspace.rename(draft, 'renamed');
  workspace.save(draft);
  const saved = findEntry('renamed');
  expect(isEntryDirty(saved)).toBe(false);
  expect(store.lookup('renamed')?.profile.agents).toMatchObject({
    orchestrator: { model: 'base/main' },
    worker: { model: 'new/worker', variant: 'max' },
  });
  workspace.edit(saved, 'worker', { variant: null });
  expect(isEntryDirty(saved)).toBe(true);
  expect(workspace.valuesFor(saved, 'worker').variant).toBeUndefined();
  workspace.discard(saved);
  expect(workspace.pendingCount()).toBe(0);
  const clone = workspace.createDraft(findEntry('renamed'), 'clone', 'project');
  expect(clone.agents.worker?.variant).toBe('max');
  workspace.discard(clone);
  expect(workspace.entries().some((entry) => entry.name === 'clone')).toBe(
    false,
  );
});

it('reads, clones and saves model-only overrides without inheriting the base variant', () => {
  store.save('global', 'model-only', {
    agents: { worker: { model: 'new/worker' } },
  });
  workspace.reload();
  const entry = findEntry('model-only');
  expect(workspace.valuesFor(entry, 'worker')).toEqual({ model: 'new/worker' });
  const clone = workspace.createDraft(entry, 'clone', 'global');
  expect(clone.agents.worker).toEqual({ model: 'new/worker' });
  workspace.save(entry);
  expect(store.lookup('model-only')?.profile.agents.worker).toEqual({
    model: 'new/worker',
  });
});

it('preserves unrelated concurrent changes but rejects stale profile saves with a typed conflict', () => {
  store.create('global', 'mine', {
    agents: { worker: { model: 'one/worker' } },
  });
  workspace.reload();
  const entry = findEntry('mine');
  workspace.edit(entry, 'worker', { variant: 'max' });
  store.create('global', 'other', { agents: {} });
  workspace.save(entry);
  expect(store.lookup('other')).toBeDefined();
  const saved = findEntry('mine');
  workspace.edit(saved, 'worker', { variant: 'low' });
  store.save('global', 'mine', {
    agents: { worker: { model: 'external/worker' } },
  });
  workspace.reload();
  expect(() => workspace.save(saved)).toThrow(ProfileConflictError);
  try {
    workspace.save(saved);
  } catch (error) {
    expect(error).toMatchObject({ code: 'PROFILE_CONFLICT' });
  }
  expect(store.lookup('mine')?.profile.agents.worker?.model).toBe(
    'external/worker',
  );
  expect(workspace.pendingCount()).toBe(1);
  workspace.discard(saved);
  expect(workspace.pendingCount()).toBe(0);
  expect(
    workspace.entries().find((item) => item.name === 'mine')?.agents.worker
      ?.model,
  ).toBe('external/worker');
  const draft = workspace.createDraft(
    workspace.entries()[0],
    'collision',
    'global',
  );
  store.create('global', 'collision', { agents: {} });
  expect(() => workspace.save(draft)).toThrow(ProfileConflictError);
});

it('renames saved entries without losing staged edits and deletes saved profiles and drafts', () => {
  store.create('global', 'shared', {
    agents: { worker: { model: 'global/worker' } },
  });
  store.create('project', 'shared', {
    agents: { worker: { model: 'project/worker' } },
  });
  workspace.reload();
  const global = findEntry('shared', 'global');
  expect(global.shadowed).toBe(true);
  workspace.edit(global, 'worker', { variant: 'max' });
  workspace.rename(global, 'renamed');
  const renamed = findEntry('renamed');
  expect(isEntryDirty(renamed)).toBe(true);
  workspace.save(renamed);
  expect(store.lookup('renamed')?.profile.agents.worker?.variant).toBe('max');
  workspace.delete(findEntry('renamed'));
  expect(store.lookup('renamed')).toBeUndefined();
  const draft = workspace.createDraft(
    workspace.entries()[0],
    'temporary',
    'project',
  );
  workspace.delete(draft);
  expect(workspace.pendingCount()).toBe(0);
});

function findEntry(name: string, scope?: 'global' | 'project') {
  const entry = workspace
    .entries()
    .find((item) => item.name === name && (!scope || item.scope === scope));
  if (!entry) throw new Error(`Missing test entry: ${name}`);
  return entry;
}
