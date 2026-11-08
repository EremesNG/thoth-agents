import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Plugin } from '@opencode/plugin';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OpenCodeDependencies } from './context';
import { registerProfileRuntime } from './profile-runtime';
import { ModelProfileStore } from './profiles';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    fs.rmSync(directory, { recursive: true, force: true });
});

async function setup() {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'thoth-profile-hook-'),
  );
  directories.push(directory);
  const roster = { worker: { model: 'base/worker', variant: 'high' } };
  const store = new ModelProfileStore({
    cwd: directory,
    roster,
    paths: {
      global: path.join(directory, 'global.json'),
      project: path.join(directory, 'project.json'),
    },
  });
  store.save('global', 'global', {
    agents: { worker: { model: 'provider/global', variant: 'max' } },
  });
  store.setActive('global', 'global');
  const storage = new Map<string, unknown>();
  const get = vi.fn(async (key: string) => storage.get(key));
  let executeBefore!: (event: {
    tool: string;
    sessionID: string;
    input: unknown;
  }) => Promise<void>;
  const hook = vi.fn(async (name: string, callback: typeof executeBefore) => {
    expect(name).toBe('execute.before');
    executeBefore = callback;
    return () => {};
  });
  await registerProfileRuntime(
    { tool: { hook }, storage: { get } } as unknown as Plugin.Context,
    {
      directory,
      profileState: { store, roster },
    } as unknown as OpenCodeDependencies,
  );
  return { executeBefore, store, storage, get, directory };
}

describe('native subagent profile runtime', () => {
  it('injects the effective role model and variant when model is absent', async () => {
    const { executeBefore } = await setup();
    const input: Record<string, unknown> = { agent: 'worker' };
    await executeBefore({ tool: 'subagent', sessionID: 'parent', input });
    expect(input.model).toBe('provider/global#max');
  });

  it.each([
    'legacy',
    'structured',
  ])('uses the parent %s session selection ahead of project and global selections', async (format) => {
    const { executeBefore, store, storage, get, directory } = await setup();
    store.save('project', 'project', {
      agents: { worker: { model: 'provider/project' } },
    });
    store.setActive('project', 'project');
    store.save('global', 'session', {
      agents: { worker: { model: 'provider/session', variant: 'low' } },
    });
    storage.set(
      'model-profiles/session/parent',
      format === 'legacy'
        ? 'session'
        : { name: 'session', projectDir: directory },
    );
    storage.set('model-profiles/session/child', 'project');
    const input: Record<string, unknown> = {
      agent: 'worker',
      sessionID: 'child',
    };
    await executeBefore({ tool: 'subagent', sessionID: 'parent', input });
    expect(input.model).toBe('provider/session#low');
    expect(get).toHaveBeenCalledWith('model-profiles/session/parent');
  });

  it.each([
    'custom/model#effort',
    '',
    null,
  ])('preserves explicit model %j without resolving profiles', async (model) => {
    const { executeBefore, get } = await setup();
    const input = { agent: 'worker', model };
    await executeBefore({ tool: 'subagent', sessionID: 'parent', input });
    expect(input.model).toBe(model);
    expect(get).not.toHaveBeenCalled();
  });

  it.each([
    { tool: 'shell', input: { agent: 'worker' } },
    { tool: 'subagent', input: { agent: 'Worker' } },
    { tool: 'subagent', input: { agent: 'custom-worker' } },
    { tool: 'subagent', input: { agent: '__proto__' } },
    { tool: 'subagent', input: {} },
    { tool: 'subagent', input: null },
    { tool: 'subagent', input: 'worker' },
    { tool: 'subagent', input: [] },
  ])('leaves unrelated or invalid input untouched: %j', async (event) => {
    const { executeBefore, get } = await setup();
    const original = structuredClone(event.input);
    await executeBefore({ ...event, sessionID: 'parent' });
    expect(event.input).toEqual(original);
    expect(get).not.toHaveBeenCalled();
  });

  it('uses project then default and never inherits a variant from a different model', async () => {
    const { executeBefore, store } = await setup();
    store.save('project', 'project', {
      agents: { worker: { model: 'provider/project' } },
    });
    store.setActive('project', 'project');
    const project: Record<string, unknown> = { agent: 'worker' };
    await executeBefore({
      tool: 'subagent',
      sessionID: 'parent',
      input: project,
    });
    expect(project.model).toBe('provider/project');
    store.setActive('project');
    store.setActive('global');
    const fallback: Record<string, unknown> = { agent: 'worker' };
    await executeBefore({
      tool: 'subagent',
      sessionID: 'parent',
      input: fallback,
    });
    expect(fallback.model).toBe('base/worker#high');
  });

  it('does not inject when the canonical role has no effective model', async () => {
    const { executeBefore } = await setup();
    const input = { agent: 'designer' };
    await executeBefore({ tool: 'subagent', sessionID: 'parent', input });
    expect(input).toEqual({ agent: 'designer' });
  });
});
