import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Plugin } from '@opencode/plugin';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import plugin from '../index';

type Context = Plugin.Context;
type TransformDomain = 'agent' | 'tool' | 'mcp' | 'command' | 'skill';
type Transform<D extends TransformDomain> = Parameters<
  Context[D]['transform']
>[0];
type Editor<D extends TransformDomain> = Parameters<Transform<D>>[0];
type Callback = (input: never) => void | Promise<void>;

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'thoth-cache-'));
  // Exercise the real config loader without reading the operator's config.
  vi.stubEnv('OPENCODE_CONFIG_DIR', join(directory, 'config'));
});
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  await rm(directory, { recursive: true, force: true });
});

async function host() {
  const transforms: { [D in TransformDomain]: Transform<D>[] } = {
    agent: [],
    tool: [],
    mcp: [],
    command: [],
    skill: [],
  };
  const hooks = new Map<string, Callback[]>();
  const registrations: string[] = [];
  const registration = { dispose: async () => {} };
  function transform<D extends TransformDomain>(domain: D) {
    return async (callback: Transform<D>) => {
      registrations.push(`${domain}.transform`);
      transforms[domain].push(callback);
      return registration;
    };
  }
  function hook(domain: string) {
    return async (name: string, callback: Callback) => {
      const key = `${domain}.${name}`;
      registrations.push(key);
      hooks.set(key, [...(hooks.get(key) ?? []), callback]);
      return registration;
    };
  }
  const put = vi.fn<Context['session']['instructions']['entry']['put']>(
    async () => {},
  );
  const subscriptions: Parameters<Context['event']['subscribe']>[0][] = [];
  let finishEvents = () => {};
  const eventsDone = new Promise<void>((resolve) => {
    finishEvents = resolve;
  });
  const subscribe: Context['event']['subscribe'] = (options) => {
    registrations.push('event.subscribe');
    subscriptions.push(options);
    return {
      async *[Symbol.asyncIterator]() {
        // A finite subscription leaves no detached consumer after setup.
        yield* [];
        finishEvents();
      },
    };
  };
  const domains = {
    agent: { transform: transform('agent') },
    tool: { transform: transform('tool'), hook: hook('tool') },
    mcp: { transform: transform('mcp') },
    command: { transform: transform('command') },
    skill: { transform: transform('skill') },
    permission: { hook: hook('permission') },
    session: {
      hook: hook('session'),
      instructions: { entry: { put } },
    },
    event: { subscribe },
  } satisfies {
    [D in TransformDomain]: Pick<Context[D], 'transform'>;
  } & {
    permission: Pick<Context['permission'], 'hook'>;
    session: Pick<Context['session'], 'hook'> & {
      instructions: {
        entry: Pick<Context['session']['instructions']['entry'], 'put'>;
      };
    };
    event: Pick<Context['event'], 'subscribe'>;
  };
  // Only the registration surface is needed; absent host APIs fail loudly.
  await plugin.setup({
    location: { directory },
    ...domains,
  } as unknown as Context);
  await eventsDone;
  async function call(name: string, input: unknown) {
    const callbacks = hooks.get(name);
    expect(callbacks, `missing registration: ${name}`).toBeDefined();
    for (const callback of callbacks ?? []) await callback(input as never);
  }
  return { transforms, hooks, registrations, subscriptions, put, call };
}

type Host = Awaited<ReturnType<typeof host>>;

function definitions(h: Host) {
  const agents: { id: string; system: string | undefined }[] = [];
  const tools: { name: string; description: string; schema: unknown }[] = [];
  const editor = {
    update(id, update) {
      const agent = { id } as Parameters<typeof update>[0];
      update(agent);
      agents.push({ id, system: agent.system });
    },
    default() {},
    remove() {},
  } satisfies Pick<Editor<'agent'>, 'update' | 'default' | 'remove'>;
  for (const transform of h.transforms.agent)
    transform(editor as Editor<'agent'>);
  const toolEditor = {
    add(tool) {
      tools.push({
        name: tool.name,
        description: tool.description,
        schema: z.toJSONSchema(tool.input as z.ZodType),
      });
    },
  } satisfies Pick<Editor<'tool'>, 'add'>;
  for (const transform of h.transforms.tool)
    transform(toolEditor as Editor<'tool'>);
  return { agents, tools };
}

function prefix() {
  return {
    system: [{ text: 'Host system prefix' }],
    tools: {
      existing: { description: 'Host tool', input: { type: 'object' } },
    },
    messages: [
      { role: 'user', content: [{ type: 'text', text: 'Earlier request' }] },
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'Earlier answer' }],
      },
    ],
  };
}

async function record(id: string, title = id) {
  const root = join(directory, '.thoth', 'changes', id);
  await mkdir(root, { recursive: true });
  await writeFile(join(root, `${id}.md`), `# ${title}\n`);
}

describe('real v2 setup cache-stability guard', () => {
  it('captures every registration and explicitly forbids request context hooks', async () => {
    const h = await host();
    expect(h.registrations).toEqual([
      'agent.transform',
      'tool.transform',
      'mcp.transform',
      'command.transform',
      'skill.transform',
      'permission.evaluate',
      'tool.execute.after',
      'session.retry',
      'session.prompt',
      'session.compaction',
      'event.subscribe',
    ]);
    // A future context hook must trigger review, not silently escape this guard.
    expect(h.hooks.has('session.context')).toBe(false);
    expect(h.subscriptions).toEqual([
      {
        types: ['session.created', 'session.status', 'session.deleted'],
        signal: expect.any(AbortSignal),
      },
    ]);
  });

  it('renders byte-identical agent systems and tool definitions in independent setups', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));
    const first = definitions(await host());
    vi.setSystemTime(new Date('2026-06-15T12:34:56Z'));
    // No sorting/canonicalization: iteration order is part of the cached bytes.
    const second = definitions(await host());
    expect(first.agents).toHaveLength(6);
    expect(first.tools).toHaveLength(6);
    for (const agent of first.agents) expect(agent.system).toBeTruthy();
    for (const tool of first.tools) {
      expect(tool.description).toBeTruthy();
      expect(tool.schema).toMatchObject({ type: 'object' });
    }
    expect(JSON.stringify(second.agents)).toBe(JSON.stringify(first.agents));
    expect(JSON.stringify(second.tools)).toBe(JSON.stringify(first.tools));
  });

  it('publishes deterministic keyed instructions only when the rendered state changes', async () => {
    await record('zeta');
    await record('alpha');
    const first = await host();
    const second = await host();
    const input = { sessionID: 'parent', ...prefix() };
    const original = structuredClone(input);
    for (const h of [first, second]) {
      await h.call('session.prompt', input);
      await Promise.all([
        h.call('session.prompt', input),
        h.call('session.prompt', input),
      ]);
      expect(h.put).toHaveBeenCalledTimes(1);
    }
    expect(input).toEqual(original);
    expect(first.put.mock.calls).toEqual(second.put.mock.calls);
    expect(first.put.mock.calls[0][0]).toEqual({
      sessionID: 'parent',
      key: 'thoth.state',
      value:
        'Thoth state\nActive SDD records:\n- .thoth/changes/alpha/alpha.md — alpha\n- .thoth/changes/zeta/zeta.md — zeta\nRunning delegated sessions:\n- none',
    });
    // Inventory changed, rendered value did not: still no write.
    await record('alpha');
    await first.call('session.prompt', input);
    expect(first.put).toHaveBeenCalledTimes(1);
    await record('beta');
    await first.call('session.prompt', input);
    expect(first.put).toHaveBeenCalledTimes(2);
    expect(first.put.mock.calls[1][0].value).toContain('beta/beta.md — beta');
    await first.call('session.prompt', input);
    expect(first.put).toHaveBeenCalledTimes(2);
  });

  it('appends delegation verdicts only to the current result without editing history', async () => {
    const h = await host();
    const event = {
      ...prefix(),
      tool: 'subagent',
      input: { agent: 'oracle', description: 'Review plan', prompt: 'Review' },
      status: 'completed',
      result: {
        output: { sessionID: 'child', status: 'completed' },
        content:
          '<subagent sessionID="child" state="completed">\n```thoth-result\n{invalid json}\n```\n</subagent>',
      },
    };
    const original = structuredClone(event);
    const history = event.messages;
    await h.call('tool.execute.after', event);
    expect(event.result.content.startsWith(original.result.content)).toBe(true);
    expect(event.result.content.slice(original.result.content.length)).toMatch(
      /^\n\nthoth-gate-verdict /,
    );
    expect({ ...event, result: original.result }).toEqual(original);
    expect(event.messages).toBe(history);
    const delivered = structuredClone(event);
    await h.call('tool.execute.after', event);
    expect(event).toEqual(delivered);
  });

  it('keeps retry and permission decisions out of the cached prefix', async () => {
    const h = await host();
    const retry = {
      ...prefix(),
      sessionID: 'parent',
      agent: 'worker',
      model: { providerID: 'p', id: 'a' },
      error: { type: 'provider.rate-limit', message: 'limited' },
      attempt: 1,
      decision: { retry: false },
    };
    const original = structuredClone(retry);
    await h.call('session.retry', retry);
    expect({ ...retry, decision: original.decision }).toEqual(original);
    const permission = {
      ...prefix(),
      sessionID: 'parent',
      agent: 'worker',
      action: 'subagent',
      resources: ['oracle'],
      effect: 'allow',
    };
    const originalPermission = structuredClone(permission);
    await h.call('permission.evaluate', permission);
    expect(permission.effect).toBe('deny');
    expect(permission.system).toEqual(originalPermission.system);
    expect(permission.tools).toEqual(originalPermission.tools);
    expect(permission.messages).toEqual(originalPermission.messages);
  });

  it.each([
    false,
    true,
  ])('preserves the compaction prefix and host result (result=%s)', async (hasResult) => {
    const h = await host();
    const input = {
      sessionID: 'parent',
      ...prefix(),
      ...(hasResult
        ? { result: { summary: 'Host summary', metadata: { host: true } } }
        : {}),
    };
    const original = structuredClone(input);
    const result = input.result;
    const messages = [...input.messages];
    await h.call('session.compaction', input);
    expect(input.system).toEqual(original.system);
    expect(input.tools).toEqual(original.tools);
    expect(input.messages.slice(0, messages.length)).toEqual(original.messages);
    for (const [index, message] of messages.entries())
      expect(input.messages[index]).toBe(message);
    if (result) {
      expect(input.result).toBe(result);
      expect(input.result?.summary).toBe(
        `Host summary\n\n${h.put.mock.calls[0][0].value}`,
      );
      expect(input.result?.metadata).toEqual({ host: true });
      expect(input.messages).toHaveLength(messages.length);
    } else {
      expect(input).not.toHaveProperty('result');
      expect(input.messages).toHaveLength(messages.length + 1);
      expect(input.messages.at(-1)?.content[0].text).toBe(
        `Preserve this current Thoth state in the compaction summary:\n${h.put.mock.calls[0][0].value}`,
      );
    }
  });
});
