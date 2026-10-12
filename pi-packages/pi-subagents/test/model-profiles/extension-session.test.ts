import fs from 'node:fs';
import path from 'node:path';
import { SessionManager } from '@earendil-works/pi-coding-agent';
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

it.each([
  ['new', true, true],
  ['startup', false, true],
  ['startup', true, false],
  ['resume', false, false],
  ['reload', false, false],
  ['fork', false, false],
] as const)('session_start %s with history=%s applies=%s using full session history', async (reason, history, applies) => {
  const store = new ModelProfileStore({ cwd: env.tmp });
  store.save('global', 'global', {
    agents: {},
    orchestrator: { model: 'openai/global' },
  });
  store.setGlobalActive('global');
  store.save('project', 'pin', {
    agents: {},
    orchestrator: { model: 'openai/pin', effort: 'max' },
  });
  store.setProjectPin('pin');
  const sessionManager = SessionManager.inMemory(env.tmp);
  sessionManager.appendModelChange('openai', 'initial');
  sessionManager.appendThinkingLevelChange('low');
  sessionManager.appendSessionInfo('initialized');
  if (history) {
    sessionManager.appendMessage({
      role: 'user',
      content: 'historical message',
      timestamp: Date.now(),
    });
    sessionManager.resetLeaf();
    expect(sessionManager.getBranch()).toEqual([]);
  }
  const settings = path.join(process.env.PI_CODING_AGENT_DIR!, 'settings.json');
  fs.mkdirSync(path.dirname(settings), { recursive: true });
  fs.writeFileSync(settings, '{"defaultModel":"initial"}');
  const write = vi.spyOn(fs, 'writeFileSync');
  const handlers = new Map<string, any>();
  const pi = {
    on: (name: string, handler: any) => handlers.set(name, handler),
    registerTool: vi.fn(),
    setModel: vi.fn(async () => true),
    setThinkingLevel: vi.fn(),
    getThinkingLevel: () => 'high',
  };
  extension(pi);
  const model = { provider: 'openai', id: 'pin' };
  const ctx = {
    cwd: env.tmp,
    hasUI: false,
    sessionManager,
    modelRegistry: { find: vi.fn(() => model) },
    ui: { notify: vi.fn() },
  };
  try {
    await handlers.get('session_start')({ reason }, ctx);
    expect(pi.setModel).toHaveBeenCalledTimes(applies ? 1 : 0);
    if (applies) {
      expect(ctx.modelRegistry.find).toHaveBeenCalledWith('openai', 'pin');
      expect(pi.setThinkingLevel).toHaveBeenCalledWith('max');
      expect(ctx.ui.notify).toHaveBeenCalledWith(
        expect.stringContaining('clamped'),
        'warning',
      );
    } else expect(pi.setThinkingLevel).not.toHaveBeenCalled();
    expect(
      write.mock.calls.some(([file]) => String(file).endsWith('settings.json')),
    ).toBe(false);
    expect(fs.readFileSync(settings, 'utf8')).toBe(
      '{"defaultModel":"initial"}',
    );
  } finally {
    write.mockRestore();
    await handlers.get('session_shutdown')();
  }
});
it('exposes live model accessors and applies the resulting effective profile after activation', async () => {
  const store = new ModelProfileStore({ cwd: env.tmp });
  store.save('global', 'global', {
    agents: {},
    orchestrator: { model: 'openai/global' },
  });
  store.save('project', 'pin', {
    agents: {},
    orchestrator: { model: 'openai/pin' },
  });
  store.save('project', 'session', {
    agents: {},
    orchestrator: { model: 'openai/session' },
  });
  store.setProjectPin('pin');
  let model = { provider: 'openai', id: 'initial' };
  let effort = 'low';
  const commands = new Map<string, any>();
  const handlers = new Map<string, any>();
  const pi = {
    on: (name: string, handler: any) => handlers.set(name, handler),
    registerCommand: (name: string, command: any) =>
      commands.set(name, command),
    registerTool: vi.fn(),
    appendEntry: vi.fn(),
    setModel: vi.fn(async (next: any) => {
      model = next;
      return true;
    }),
    getThinkingLevel: () => effort,
    setThinkingLevel: (next: string) => {
      effort = next;
    },
  };
  extension(pi);
  const ctx = {
    cwd: env.tmp,
    hasUI: false,
    get model() {
      return model;
    },
    modelRegistry: {
      find: (provider: string, id: string) => ({ provider, id }),
    },
  };
  try {
    await commands.get('subagents-model').handler('', ctx);
    const panel = vi.mocked(runSubagentModelsCommand).mock.calls.at(-1)![0];
    expect(panel.getSessionModel()).toEqual({
      provider: 'openai',
      id: 'initial',
    });
    store.setGlobalActive('global');
    expect(await panel.applyEffectiveProfileOrchestrator()).toMatchObject({
      status: 'applied',
    });
    expect(model.id).toBe('pin'); // A global activation cannot override the pin.
    panel.setSessionModelProfile('session');
    await panel.applyEffectiveProfileOrchestrator();
    expect(panel.model.id).toBe('session');
    expect(panel.getSessionModel().id).toBe('session');
    effort = 'high';
    expect(panel.getSessionThinkingLevel()).toBe('high');
    panel.setSessionModelProfile('default');
    expect(await panel.applyEffectiveProfileOrchestrator()).toMatchObject({
      status: 'untouched',
    });
    expect(model.id).toBe('session');
  } finally {
    await handlers.get('session_shutdown')();
  }
});

it('startup ignores restored session selection, falls back to global and warns on unavailable model', async () => {
  const store = new ModelProfileStore({ cwd: env.tmp });
  store.save('global', 'root', {
    agents: {},
    orchestrator: { model: 'openai/root', effort: 'high' },
  });
  store.setGlobalActive('root');
  const sessionManager = SessionManager.inMemory(env.tmp);
  sessionManager.appendCustomEntry(SESSION_MODEL_PROFILE_ENTRY, {
    profile: 'default',
  });
  const handlers = new Map<string, any>();
  const pi = {
    on: (name: string, handler: any) => handlers.set(name, handler),
    registerTool: vi.fn(),
    setModel: vi.fn(async () => false),
    setThinkingLevel: vi.fn(),
    getThinkingLevel: () => 'low',
  };
  extension(pi);
  const ctx = {
    cwd: env.tmp,
    hasUI: false,
    sessionManager,
    modelRegistry: { find: vi.fn(() => ({ provider: 'openai', id: 'root' })) },
    ui: { notify: vi.fn() },
  };
  try {
    await handlers.get('session_start')({ reason: 'startup' }, ctx);
    expect(ctx.modelRegistry.find).toHaveBeenCalledWith('openai', 'root');
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining('unavailable'),
      'warning',
    );
    expect(pi.setThinkingLevel).not.toHaveBeenCalled();
  } finally {
    await handlers.get('session_shutdown')();
  }
});
