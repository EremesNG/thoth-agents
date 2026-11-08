import type { Plugin } from '@opencode/plugin';
import { describe, expect, test } from 'vitest';
import type { OpenCodeDependencies } from './context';
import { registerDelegationHooks } from './delegation-hooks';

type Event = Extract<
  Parameters<Parameters<Plugin.Context['tool']['hook']>[1]>[0],
  { status: 'completed' | 'error' }
>;

async function setup() {
  let deliver: (event: Event) => Promise<void> | void = () => {};
  const ctx = {
    tool: {
      hook: async (name: string, callback: typeof deliver) => {
        expect(name).toBe('execute.after');
        deliver = callback;
      },
    },
  } as unknown as Plugin.Context;
  await registerDelegationHooks(ctx, {
    directory: process.cwd(),
  } as OpenCodeDependencies);
  return (event: unknown) => deliver(event as Event);
}

function completed(
  agent = 'oracle',
  status = 'completed',
  content = '```thoth-result\n{invalid json}\n```',
) {
  return {
    tool: 'subagent',
    input: { agent, description: 'Review plan', prompt: 'Review' },
    status: 'completed',
    result: {
      output: { sessionID: 'child', status, output: content },
      content: `<subagent sessionID="child" state="${status}">\n${content}\n</subagent>`,
    },
  };
}

describe('v2 delegation delivery', () => {
  test('appends exactly one verdict to completed foreground Oracle content', async () => {
    const deliver = await setup();
    const event = completed();
    const original = event.result.content;
    await deliver(event);
    expect(event.result.content).toMatch(/thoth-gate-verdict .*"valid":false/);
    expect(event.result.content.startsWith(original)).toBe(true);
    const delivered = structuredClone(event);
    await deliver(event);
    expect(event).toEqual(delivered);
  });

  test('recovers native subagent errors without modifying successful child prose', async () => {
    const deliver = await setup();
    const error = new Error('Invalid arguments: JSON parse error');
    const event = { tool: 'subagent', status: 'error', error };
    await deliver(event);
    expect(event.error).toBeInstanceOf(Error);
    expect(event.error.stack).toBe(error.stack);
    expect(event.error.message).toContain('[subagent retry suggestion]');
    expect(event.error.message).toContain(
      '[JSON PARSE ERROR - IMMEDIATE ACTION REQUIRED]',
    );
    const delivered = event.error.message;
    await deliver(event);
    expect(event.error.message).toBe(delivered);
  });

  test.each([
    [
      'explicit background',
      {
        ...completed('oracle', 'running'),
        input: { agent: 'oracle', background: true },
      },
    ],
    ['host-backgrounded', completed('oracle', 'running')],
    ['non-Oracle', completed('worker')],
    ['non-gate', completed('oracle', 'completed', 'Use the simpler plan.')],
  ])('leaves %s unchanged', async (_name, event) => {
    const deliver = await setup();
    const original = structuredClone(event);
    await deliver(event);
    expect(event).toEqual(original);
  });
});
