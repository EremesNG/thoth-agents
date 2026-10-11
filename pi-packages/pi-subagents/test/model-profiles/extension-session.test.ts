import { expect, it, vi } from 'vitest';
import { SESSION_MODEL_PROFILE_ENTRY } from '../../src/model-profiles/session.js';
import { ModelProfileStore } from '../../src/model-profiles/store.js';
import { installSubagentTestEnv } from '../helpers/subagent-test-helpers.js';

vi.mock('../../src/model-profiles-ui.js', () => ({
  runSubagentModelsCommand: vi.fn(async (ctx: any) => ctx),
}));

import extension from '../../src/extension/subagents-extension.js';
import { runSubagentModelsCommand } from '../../src/model-profiles-ui.js';

const env = installSubagentTestEnv();
it('restores session selection on session_start and exposes persisted set/clear to the panel without config writes', async () => {
  env.writeAgent('analyst');
  const store = new ModelProfileStore({ cwd: env.tmp });
  store.save('project', 'fast', { agents: { analyst: { effort: 'max' } } });
  const entries: any[] = [
    {
      type: 'custom',
      customType: SESSION_MODEL_PROFILE_ENTRY,
      data: { profile: 'fast' },
    },
  ];
  const handlers = new Map<string, any>();
  const commands = new Map<string, any>();
  const tools = new Map<string, any>();
  extension({
    on: (name: string, handler: any) => handlers.set(name, handler),
    registerCommand: (name: string, command: any) =>
      commands.set(name, command),
    registerTool: (tool: any) => tools.set(tool.name, tool),
    appendEntry: (customType: string, data: any) =>
      entries.push({ type: 'custom', customType, data }),
  });
  const ctx = {
    cwd: env.tmp,
    sessionManager: { getBranch: () => entries },
    hasUI: false,
  };
  try {
    await handlers.get('session_start')({ reason: 'resume' }, ctx);
    const result = await tools
      .get('subagent_list_agents')
      .execute('list', {}, undefined, undefined, ctx);
    expect(result.details.agents[0]).toMatchObject({
      effort: 'max',
      profileName: 'fast',
    });
    await commands.get('subagents-model').handler('', ctx);
    const panelCtx = vi.mocked(runSubagentModelsCommand).mock.calls.at(-1)![0];
    expect(panelCtx.getSessionModelProfile()).toBe('fast');
    panelCtx.setSessionModelProfile(undefined);
    expect(entries.at(-1).data).toEqual({ profile: null });
    await handlers.get('session_start')({ reason: 'reload' }, ctx);
    const cleared = await tools
      .get('subagent_list_agents')
      .execute('list', {}, undefined, undefined, ctx);
    expect(cleared.details.agents[0].profileName).toBe('default');
    expect(store.read('project').active).toBeUndefined();
  } finally {
    await handlers.get('session_shutdown')();
  }
});
