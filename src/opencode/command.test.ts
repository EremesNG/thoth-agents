import type { Plugin } from '@opencode/plugin';
import { expect, test, vi } from 'vitest';
import { createOpenCodeInitCommand } from '../harness/opencode-init-command';
import { registerCommand } from './command';
import type { OpenCodeDependencies } from './context';

test.each([
  '',
  '   ',
  '  inspect existing governance  ',
])('init switches agent before submitting template and trimmed arguments: %j', async (text) => {
  const calls: string[] = [];
  const switchAgent = vi.fn(async () => {
    calls.push('switch');
  });
  const prompt = vi.fn(async () => {
    calls.push('prompt');
  });
  const add = vi.fn();
  const ctx = {
    command: {
      transform: async (edit: (editor: { add: typeof add }) => void) =>
        edit({ add }),
    },
    session: { switchAgent, prompt },
  } as unknown as Plugin.Context;
  const deps = {
    directory: '/project',
    packageRoot: process.cwd(),
  } as OpenCodeDependencies;
  await registerCommand(ctx, deps);
  expect(add).toHaveBeenCalledOnce();
  const command = add.mock.calls[0][0];
  expect(command.name).toBe('thoth-init');
  await command.execute({
    sessionID: 'session',
    prompt: { text },
    delivery: 'queue',
  });
  expect(calls).toEqual(['switch', 'prompt']);
  expect(switchAgent).toHaveBeenCalledWith({
    sessionID: 'session',
    agent: 'orchestrator',
  });
  const template = createOpenCodeInitCommand({
    projectRoot: '/project',
    packageRoot: process.cwd(),
  }).template;
  expect(prompt).toHaveBeenCalledWith({
    sessionID: 'session',
    text: template + (text.trim() ? `\n\n${text.trim()}` : ''),
    delivery: 'queue',
  });
});
