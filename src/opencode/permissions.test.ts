import type { Plugin } from '@opencode/plugin';
import { describe, expect, test, vi } from 'vitest';
import { getAgentConfigs } from '../agents';
import { loadOpenCodeDependencies } from './context';
import { translatePermissionRules } from './permission-rules';
import { registerPermissions } from './permissions';

describe('ordered OpenCode role permissions', () => {
  test.each([
    ['orchestrator', 'allow', 'allow', 'allow', 'allow', 'allow'],
    ['explorer', 'deny', 'deny', 'allow', 'ask', 'deny'],
    ['librarian', 'deny', 'deny', 'allow', 'allow', 'deny'],
    ['oracle', 'deny', 'deny', 'allow', 'allow', 'deny'],
    ['designer', 'allow', 'deny', 'ask', 'ask', 'deny'],
    ['worker', 'allow', 'deny', 'ask', 'allow', 'deny'],
  ])('%s preserves every supported action', (role, edit, subagent, external, webfetch, todo) => {
    const rules = translatePermissionRules(getAgentConfigs()[role].permission);
    const effect = (action: string, resource = '*') =>
      rules
        .filter(
          (rule) =>
            (rule.action === '*' || rule.action === action) &&
            (rule.resource === '*' || rule.resource === resource),
        )
        .at(-1)?.effect ?? 'ask';
    for (const action of [
      'read',
      'glob',
      'grep',
      'shell',
      'question',
      'skill',
    ]) {
      expect(effect(action), action).toBe('allow');
    }
    expect(effect('edit')).toBe(edit);
    expect(effect('subagent')).toBe(subagent);
    expect(effect('external_directory')).toBe(external);
    expect(effect('external_directory', '~/.config/opencode/skills/**')).toBe(
      'allow',
    );
    expect(effect('webfetch')).toBe(webfetch);
    expect(effect('exa_*')).toBe(webfetch);
    expect(effect('todowrite')).toBe(todo);
    expect(effect('unknown-action')).toBe('ask');
    expect(rules[0]).toEqual({ action: '*', resource: '*', effect: 'ask' });
  });

  test('puts defaults before narrow rules and resolves alias conflicts restrictively', () => {
    expect(
      translatePermissionRules({
        write: 'allow',
        edit: 'deny',
        read: { '/safe/**': 'allow', '*': 'deny' },
      }),
    ).toEqual([
      { action: '*', resource: '*', effect: 'ask' },
      { action: 'edit', resource: '*', effect: 'deny' },
      { action: 'read', resource: '*', effect: 'deny' },
      { action: 'read', resource: '/safe/**', effect: 'allow' },
    ]);
    expect(translatePermissionRules('allow')).toEqual([
      { action: '*', resource: '*', effect: 'allow' },
    ]);
    expect(translatePermissionRules(undefined)).toEqual([
      { action: '*', resource: '*', effect: 'ask' },
    ]);
  });

  test('applies global defaults before action-specific and resource-specific exceptions', () => {
    expect(
      translatePermissionRules({
        edit: 'deny',
        '*': 'allow',
        read: { '/safe/**': 'allow', '*': 'ask' },
      }),
    ).toEqual([
      { action: '*', resource: '*', effect: 'ask' },
      { action: '*', resource: '*', effect: 'allow' },
      { action: 'edit', resource: '*', effect: 'deny' },
      { action: 'read', resource: '*', effect: 'ask' },
      { action: 'read', resource: '/safe/**', effect: 'allow' },
    ]);
  });

  test.each([
    'orchestrator',
    'explorer',
    'librarian',
    'oracle',
    'designer',
    'worker',
    'custom',
    undefined,
  ])('enforces delegation caller boundary for %s', async (agent) => {
    let evaluate: (event: {
      agent?: string;
      action: string;
      effect: string;
      message?: string;
    }) => void = () => {};
    const hook = vi.fn(async (_name, callback) => {
      evaluate = callback;
    });
    const ctx = {
      location: { directory: process.cwd() },
      permission: { hook },
    } as unknown as Plugin.Context;
    await registerPermissions(ctx, loadOpenCodeDependencies(ctx));
    expect(hook).toHaveBeenCalledWith('evaluate', expect.any(Function));
    const event = { agent, action: 'subagent', effect: 'allow' };
    evaluate(event);
    expect(event.effect).toBe(
      agent && !['orchestrator', 'custom'].includes(agent) ? 'deny' : 'allow',
    );
    if (event.effect === 'deny')
      expect(event).toHaveProperty(
        'message',
        expect.stringContaining('orchestrator'),
      );
    const unrelated = { agent, action: 'read', effect: 'ask' };
    evaluate(unrelated);
    expect(unrelated.effect).toBe('ask');
    const denied = {
      agent: 'orchestrator',
      action: 'subagent',
      effect: 'deny',
    };
    evaluate(denied);
    expect(denied.effect).toBe('deny');
  });
});
