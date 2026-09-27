import { describe, expect, test, vi } from 'vitest';
import type {
  PiModelSaveResult,
  PiModelSnapshot,
} from '../cli/pi-model-config';
import {
  createModelsPanel,
  type ModelsPanelCatalogModel,
} from './models-panel';

const roles = ['explorer', 'librarian', 'oracle', 'designer', 'quick', 'deep'];

function snapshot(): PiModelSnapshot {
  return {
    piRoot: '/global/.pi/agent',
    roles: roles.map((role) => ({
      role,
      model: 'inherit',
      effort: { kind: 'inherit' as const },
    })),
    contents: Object.fromEntries(roles.map((role) => [role, `${role}-v1`])),
  };
}

const catalog: ModelsPanelCatalogModel[] = [
  {
    provider: 'anthropic',
    id: 'claude-sonnet',
    name: 'Claude Sonnet',
    supportedEfforts: ['low', 'medium', 'high'],
  },
  {
    provider: 'openai',
    id: 'gpt-5.4',
    name: 'GPT 5.4',
    supportedEfforts: ['off', 'low', 'high', 'xhigh', 'max'],
  },
];

function successfulSave(
  base: PiModelSnapshot,
  draft = base.roles,
): PiModelSaveResult {
  return {
    success: true,
    changedRoles: ['explorer'],
    snapshot: { ...base, roles: structuredClone(draft) },
  };
}

describe('global Pi models panel', () => {
  test('renders the global scope, six roles, ambient-root warning and override boundary', () => {
    const panel = createModelsPanel({
      snapshot: snapshot(),
      catalog,
      save: vi.fn(),
      onDone: vi.fn(),
    });
    const text = panel.render(100).join('\n');
    expect(text).toContain('Global specialist models');
    expect(text).toContain('/global/.pi/agent');
    for (const role of roles) expect(text).toContain(role);
    expect(text).toContain('Ambient root model is unchanged');
    expect(text).toContain(
      'Native settings or project definitions may override',
    );
    expect(text).toContain('unpins native thinking');
  });

  test('keeps every rendered line within a narrow width', () => {
    const panel = createModelsPanel({
      snapshot: snapshot(),
      catalog,
      save: vi.fn(),
      onDone: vi.fn(),
    });
    const lines = panel.render(28);
    expect(lines.length).toBeGreaterThan(6);
    expect(lines.every((line) => [...line].length <= 28)).toBe(true);
    expect(lines.join('\n')).toContain('thinking inherit');
  });

  test('searches the live catalog and assigns only supported thinking, including max', () => {
    const panel = createModelsPanel({
      snapshot: snapshot(),
      catalog,
      save: vi.fn(),
      onDone: vi.fn(),
    });
    panel.handleInput('\r'); // edit explorer
    panel.handleInput('g');
    panel.handleInput('p');
    panel.handleInput('t');
    expect(panel.render(80).join('\n')).toContain('openai/gpt-5.4');
    expect(panel.render(80).join('\n')).not.toContain(
      'anthropic/claude-sonnet',
    );
    panel.handleInput('\x1b[B'); // select filtered model (after inherit)
    panel.handleInput('\r');
    expect(panel.render(80).join('\n')).toContain('Choose thinking');
    for (let index = 0; index < 5; index++) panel.handleInput('\x1b[B');
    panel.handleInput('\r');
    const draft = panel.getState().draft[0];
    expect(draft).toMatchObject({
      model: 'openai/gpt-5.4',
      effort: { kind: 'effort', value: 'max' },
      availableEfforts: ['off', 'low', 'high', 'xhigh', 'max'],
    });
  });

  test('retains draft on editor back but clean cancel performs zero writes', () => {
    const save = vi.fn();
    const done = vi.fn();
    const panel = createModelsPanel({
      snapshot: snapshot(),
      catalog,
      save,
      onDone: done,
    });
    panel.handleInput('\r');
    panel.handleInput('\x1b[B');
    panel.handleInput('\r');
    panel.handleInput('\x1b'); // effort -> model
    panel.handleInput('\x1b'); // model -> overview
    panel.handleInput('\x1b'); // clean close
    expect(save).not.toHaveBeenCalled();
    expect(done).toHaveBeenCalledWith({ kind: 'cancelled' });
  });

  test('ctrl-c follows the same safe cancellation path as escape', () => {
    const done = vi.fn();
    const save = vi.fn();
    const panel = createModelsPanel({
      snapshot: snapshot(),
      catalog,
      save,
      onDone: done,
    });
    panel.handleInput('\x03');
    expect(done).toHaveBeenCalledWith({ kind: 'cancelled' });
    expect(save).not.toHaveBeenCalled();
  });

  test('dirty escape requires discard confirmation and keep editing is the default', () => {
    const save = vi.fn();
    const done = vi.fn();
    const panel = createModelsPanel({
      snapshot: snapshot(),
      catalog,
      save,
      onDone: done,
    });
    panel.handleInput('\r');
    panel.handleInput('\x1b[B');
    panel.handleInput('\r');
    panel.handleInput('\r'); // inherit effort, return overview dirty
    panel.handleInput('\x1b');
    expect(panel.render(80).join('\n')).toContain('Discard unsaved draft?');
    panel.handleInput('\x1b');
    expect(done).not.toHaveBeenCalled();
    panel.handleInput('\x1b');
    panel.handleInput('d');
    expect(save).not.toHaveBeenCalled();
    expect(done).toHaveBeenCalledWith({ kind: 'cancelled' });
  });

  test('saves exactly once and reports changed roles', () => {
    const base = snapshot();
    const save = vi.fn((_base, draft) => successfulSave(base, draft));
    const done = vi.fn();
    const panel = createModelsPanel({
      snapshot: base,
      catalog,
      save,
      onDone: done,
    });
    panel.handleInput('\r');
    panel.handleInput('\x1b[B');
    panel.handleInput('\r');
    panel.handleInput('\r');
    panel.handleInput('s');
    expect(save).toHaveBeenCalledTimes(1);
    expect(done).toHaveBeenCalledWith({
      kind: 'saved',
      changedRoles: ['explorer'],
    });
  });

  test('preserves the draft and adopts the returned retry snapshot after partial failure', () => {
    const base = snapshot();
    const retry = snapshot();
    retry.contents.explorer = 'explorer-v2';
    retry.roles[0] = {
      role: 'explorer',
      model: 'openai/gpt-5.4',
      effort: { kind: 'inherit' },
    };
    const save = vi
      .fn()
      .mockReturnValueOnce({
        success: false,
        changedRoles: ['explorer'],
        snapshot: retry,
        error: 'designer write failed',
      })
      .mockImplementation((_snapshot, draft) => successfulSave(retry, draft));
    const panel = createModelsPanel({
      snapshot: base,
      catalog,
      save,
      onDone: vi.fn(),
    });
    panel.handleInput('\r');
    panel.handleInput('\x1b[B');
    panel.handleInput('\r');
    panel.handleInput('\r');
    panel.handleInput('s');
    expect(panel.render(100).join('\n')).toContain('designer write failed');
    expect(panel.render(100).join('\n')).toContain('Already changed: explorer');
    expect(panel.getState().draft[0].model).toBe('anthropic/claude-sonnet');
    panel.handleInput('s');
    expect(save.mock.calls[1]?.[0]).toBe(retry);
  });
});
