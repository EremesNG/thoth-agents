import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  isEntryDirty,
  type ModelProfileWorkspace,
} from '../../src/model-profiles/editor.js';
import { useProfileEnv } from './support.js';

const ref = (provider: string, id: string) => ({ provider, id });

function fastEntry(ws: ModelProfileWorkspace) {
  const entry = ws.entries().find((item) => item.name === 'fast');
  assert(entry, 'Expected a saved fast profile');
  return entry;
}

describe('workspace fallback profiles', () => {
  const env = useProfileEnv();

  it('preserves the ordered profile list when cloning and saving a draft', () => {
    const { store, workspace, readFile } = env();
    const fallback_models = ['openai/gpt-5.5', 'openrouter/org/backup'];
    store.create('global', 'fast', {
      agents: { analyst: { effort: 'high', fallback_models } },
    });
    const ws = workspace();
    const draft = ws.createDraft(fastEntry(ws), 'copy', 'project');
    ws.save(draft);
    expect(readFile('project').profiles.copy.agents.analyst).toMatchObject({
      fallback_models,
    });
  });

  it('preserves an in-place list on both an unedited save and an unrelated edit', () => {
    const { store, workspace, readFile } = env();
    const fallback_models = ['anthropic/claude-x', 'openrouter/org/backup'];
    store.create('global', 'fast', {
      agents: { analyst: { effort: 'high', fallback_models } },
    });
    const ws = workspace();
    ws.save(fastEntry(ws));
    expect(readFile('global').profiles.fast.agents.analyst).toMatchObject({
      effort: 'high',
      fallback_models,
    });
    const edited = fastEntry(ws);
    ws.edit(edited, 'analyst', { effort: 'max' });
    ws.edit(edited, 'analyst', { reset: 'model' });
    ws.save(edited);
    expect(readFile('global').profiles.fast.agents.analyst).toMatchObject({
      effort: 'max',
      fallback_models,
    });
  });

  it('tracks list order and edits, reloads staging, and reverts when the original list is restored', () => {
    const { store, workspace } = env();
    const a = ref('anthropic', 'claude-x');
    const b = ref('openrouter', 'org/backup');
    const c = ref('openai', 'another');
    store.create('project', 'fast', {
      agents: { analyst: { effort: 'high', fallback_models: [a, b] } },
    });
    const ws = workspace();
    let entry = fastEntry(ws);
    expect(ws.appendFallback(entry, 'analyst', a)).toBe(false);
    expect(ws.appendFallback(entry, 'analyst', ref('openai', 'gpt-5.5'))).toBe(
      false,
    );
    expect(ws.moveFallback(entry, 'analyst', 0, -1)).toBe(false);
    expect(ws.removeFallback(entry, 'analyst', -1)).toBe(false);
    expect(isEntryDirty(entry)).toBe(false);
    expect(ws.moveFallback(entry, 'analyst', 1, -1)).toBe(true);
    expect(entry.agents.analyst.fallback_models).toEqual([b, a]);
    expect(isEntryDirty(entry)).toBe(true);
    expect(ws.appendFallback(entry, 'analyst', c)).toBe(true);
    ws.reload();
    entry = fastEntry(ws);
    expect(entry.agents.analyst.fallback_models).toEqual([b, a, c]);
    expect(ws.removeFallback(entry, 'analyst', 2)).toBe(true);
    expect(ws.moveFallback(entry, 'analyst', 0, 1)).toBe(true);
    expect(entry.agents.analyst.fallback_models).toEqual([a, b]);
    expect(ws.pendingCount()).toBe(0);
    expect(() => ws.clearFallbacks(ws.entries()[0], 'analyst')).toThrow(
      /read-only/,
    );
  });

  it('clears through save and reload while retaining the effort override', () => {
    const { store, workspace, readFile } = env();
    store.create('project', 'fast', {
      agents: {
        analyst: { effort: 'high', fallback_models: ['anthropic/claude-x'] },
      },
    });
    const ws = workspace();
    const entry = fastEntry(ws);
    expect(ws.clearFallbacks(entry, 'analyst')).toBe(true);
    expect(ws.clearFallbacks(entry, 'analyst')).toBe(false);
    expect(isEntryDirty(entry)).toBe(true);
    ws.save(entry);
    expect(readFile('project').profiles.fast.agents.analyst).not.toHaveProperty(
      'fallback_models',
    );
    expect(fastEntry(workspace()).agents.analyst).toEqual({
      model: ref('openai', 'gpt-5.5'),
      effort: 'high',
    });
  });

  it('does not leave a dirty override after resetting a new list to inherit', () => {
    const { store, workspace } = env();
    store.create('project', 'fast', { agents: {} });
    const ws = workspace();
    const entry = fastEntry(ws);
    ws.edit(entry, 'analyst', { fallback_models: [ref('openai', 'backup')] });
    expect(isEntryDirty(entry)).toBe(true);
    ws.edit(entry, 'analyst', { reset: 'fallback_models' });
    expect(isEntryDirty(entry)).toBe(false);
  });

  it('resolves fallback values from the first non-empty source before filtering the current primary', () => {
    const { cwd, store, workspace } = env();
    const primary = ref('openai', 'gpt-5.5');
    const agentBackup = ref('openai', 'agent-backup');
    const defaultBackup = ref('openai', 'config-backup');
    const analystFile = path.join(cwd, '.pi', 'subagents', 'analyst.md');
    fs.writeFileSync(
      analystFile,
      fs
        .readFileSync(analystFile, 'utf8')
        .replace(
          'description: analyst agent',
          'description: analyst agent\nfallback_models: [openai/gpt-5.5, openai/agent-backup]',
        ),
    );
    fs.writeFileSync(
      path.join(cwd, '.pi', 'subagents.json'),
      JSON.stringify({ default_fallback_models: ['openai/config-backup'] }),
    );
    store.create('project', 'fast', {
      agents: {
        analyst: { fallback_models: ['openai/gpt-5.5'] },
      },
    });
    const ws = workspace();
    const entry = fastEntry(ws);
    const analyst = ws.rows.find((row) => row.key === 'analyst');
    const reviewer = ws.rows.find((row) => row.key === 'reviewer');
    assert(analyst && reviewer);
    ws.edit(entry, 'analyst', {
      fallback_models: [primary, defaultBackup, defaultBackup, agentBackup],
    });
    expect(ws.valuesFor(entry, analyst)).toMatchObject({
      fallback_models: [defaultBackup, agentBackup],
      fallbackSource: 'profile',
    });
    ws.edit(entry, 'analyst', { fallback_models: [primary] });
    expect(ws.valuesFor(entry, analyst)).toMatchObject({
      fallback_models: [],
      fallbackSource: 'profile',
    });
    ws.clearFallbacks(entry, 'analyst');
    expect(ws.valuesFor(entry, analyst)).toMatchObject({
      fallback_models: [agentBackup],
      fallbackSource: 'agent',
    });
    ws.edit(entry, 'analyst', { model: agentBackup });
    expect(ws.valuesFor(entry, analyst)).toMatchObject({
      fallback_models: [primary],
      fallbackSource: 'agent',
    });
    expect(ws.valuesFor(entry, reviewer)).toMatchObject({
      fallback_models: [defaultBackup],
      fallbackSource: 'default',
    });
    const draft = ws.createDraft(ws.entries()[0], 'plain', 'project');
    expect(draft.agents.analyst.fallback_models).toBeUndefined();
    expect(ws.valuesFor(draft, analyst)).toMatchObject({
      fallback_models: [agentBackup],
      fallbackSource: 'agent',
    });
    fs.unlinkSync(path.join(cwd, '.pi', 'subagents.json'));
    const withoutDefault = workspace();
    const reviewerWithoutDefault = withoutDefault.rows.find(
      (row) => row.key === 'reviewer',
    );
    assert(reviewerWithoutDefault);
    expect(
      withoutDefault.valuesFor(
        withoutDefault.entries()[0],
        reviewerWithoutDefault,
      ),
    ).toMatchObject({ fallback_models: [], fallbackSource: 'none' });
  });
});
