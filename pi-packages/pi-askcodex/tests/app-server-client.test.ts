import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import {
  JobLauncherUnavailable,
  launchInJob,
} from '@thoth-agents/pi-core/windows-job';
import { afterEach, expect, it } from 'vitest';
import { AppServerClient } from '../src/app-server-client.js';

const clients: AppServerClient[] = [];
const fixture = fileURLToPath(
  new URL('./fixtures/fake-app-server.mjs', import.meta.url),
);
function client(
  scenario = 'normal',
  extra: Partial<ConstructorParameters<typeof AppServerClient>[0]> = {},
) {
  const c = new AppServerClient({
    binaryPath: process.execPath,
    commandPrefixArgs: [fixture],
    env: { ...process.env, FAKE_SCENARIO: scenario },
    requestTimeoutMs: 5000,
    ...extra,
  });
  clients.push(c);
  return c;
}
afterEach(async () => {
  await Promise.all(clients.splice(0).map((c) => c.close()));
});
it('handshakes, starts/resumes threads and streams split UTF-8 deltas, usage and completion', async () => {
  const c = client();
  const deltas: string[] = [];
  const usage: number[] = [];
  c.onNotification('item/agentMessage/delta', (p) => deltas.push(p.delta));
  c.onNotification('thread/tokenUsage/updated', (p) =>
    usage.push(p.tokenUsage.total.totalTokens),
  );
  expect((await c.initialize()).userAgent).toBe('fake');
  expect((await c.threadStart({})).thread.id).toBe('thread-1');
  expect((await c.threadResume({ threadId: 'resumed' })).thread.id).toBe(
    'resumed',
  );
  const { turn } = await c.turnStart({ threadId: 'thread-1', input: [] });
  expect((await c.waitForTurnCompleted(turn.id)).turn.status).toBe('completed');
  expect(deltas).toEqual(['héllo']);
  expect(usage).toEqual([12]);
  expect((await c.waitForTurnCompleted(turn.id)).turn.id).toBe(turn.id);
});
it('interrupts a running turn and resolves all completion waiters', async () => {
  const c = client('interrupt');
  await c.initialize();
  const { turn } = await c.turnStart({ threadId: 'thread-1', input: [] });
  const one = c.waitForTurnCompleted(turn.id);
  const two = c.waitForTurnCompleted(turn.id);
  await c.turnInterrupt({ threadId: 'thread-1', turnId: turn.id });
  expect((await one).turn.status).toBe('interrupted');
  expect((await two).turn.status).toBe('interrupted');
});
it('answers elicitation with the original string id', async () => {
  let seen = false;
  const c = client('elicitation', {
    serverRequestHandler: async (req, { signal }) => {
      seen = req.method === 'mcpServer/elicitation/request' && !signal.aborted;
      return { action: 'accept', content: { persist: 'session' }, _meta: null };
    },
  });
  const replies: string[] = [];
  c.onNotification('item/agentMessage/delta', (p) => replies.push(p.delta));
  await c.initialize();
  await c.turnStart({ threadId: 'thread-1', input: [] });
  await c.waitForTurnCompleted('turn-1');
  expect(seen).toBe(true);
  expect(JSON.parse(replies[0])).toEqual({
    id: 'server-1',
    result: { action: 'accept', content: { persist: 'session' }, _meta: null },
  });
});
it.each([
  'throw',
  'timeout',
  'missing',
  'error',
  'unknown',
])('declines safely for %s handlers', async (kind) => {
  let aborted = false;
  const c = client(kind === 'unknown' ? 'unknown' : 'elicitation', {
    serverRequestTimeoutMs: 30,
    serverRequestHandler:
      kind === 'missing'
        ? undefined
        : async (req, { signal }) => {
            if (kind === 'unknown') {
              expect(req.method).toBe('unknown');
              return { decision: 'accept' };
            }
            if (kind === 'throw') throw new Error('handler failed');
            if (kind === 'error')
              return { error: { code: -32601, message: 'denied' } };
            signal.addEventListener('abort', () => {
              aborted = true;
            });
            return new Promise(() => {});
          },
  });
  const replies: string[] = [];
  c.onNotification('item/agentMessage/delta', (p) => replies.push(p.delta));
  await c.initialize();
  await c.turnStart({ threadId: 'thread-1', input: [] });
  await c.waitForTurnCompleted('turn-1');
  expect(JSON.parse(replies[0])).toMatchObject({
    id: 'server-1',
    error: { code: expect.any(Number) },
  });
  if (kind === 'timeout') expect(aborted).toBe(true);
});
it('recovers from malformed and oversized lines while isolating diagnostic callbacks', async () => {
  const errors: string[] = [];
  const c = client('malformed', {
    maxLineBytes: 1024,
    onProtocolError: (e) => {
      errors.push(e.message);
      throw new Error('diagnostic failed');
    },
  });
  await c.initialize();
  await c.turnStart({ threadId: 'thread-1', input: [] });
  expect((await c.waitForTurnCompleted('turn-1')).turn.status).toBe(
    'completed',
  );
  expect(errors).toHaveLength(3);
});
it('rejects pending turn waits and RPCs on exit with stderr diagnostics', async () => {
  const c = client('exit');
  await c.initialize();
  const { turn } = await c.turnStart({ threadId: 'thread-1', input: [] });
  const wait = expect(c.waitForTurnCompleted(turn.id)).rejects.toThrow(
    /exited.*17.*diagnostic crash tail/,
  );
  const rpc = expect(c.threadStart({})).rejects.toThrow(
    /exited.*diagnostic crash tail/,
  );
  await Promise.all([wait, rpc]);
});
it.each([
  'unsupported',
  'slow',
])('fails closed with actionable handshake diagnostics: %s', async (scenario) => {
  const c = client(scenario, { requestTimeoutMs: 150 });
  await expect(c.initialize()).rejects.toThrow(
    /experimental.*ASKCODEX_BIN.*Handshake failed/,
  );
  await expect(c.threadStart({})).rejects.toThrow(/experimental/);
});
it('reports an unknown binary without hanging', async () => {
  const c = client('normal', { binaryPath: `${fixture}.missing` });
  await expect(c.initialize()).rejects.toThrow(/Cannot start Codex app-server/);
});
it('allows wait cancellation and timeout without poisoning another waiter', async () => {
  const c = client('interrupt');
  await c.initialize();
  await c.turnStart({ threadId: 'thread-1', input: [] });
  const controller = new AbortController();
  const aborted = expect(
    c.waitForTurnCompleted('turn-1', { signal: controller.signal }),
  ).rejects.toThrow(/aborted/);
  controller.abort();
  await aborted;
  await expect(
    c.waitForTurnCompleted('turn-1', { timeoutMs: 10 }),
  ).rejects.toThrow(/timed out/);
  const done = c.waitForTurnCompleted('turn-1');
  await c.turnInterrupt({ threadId: 'thread-1', turnId: 'turn-1' });
  expect((await done).turn.status).toBe('interrupted');
});
it('bounds stderr tail and terminates a server that ignores graceful EOF', async () => {
  const c = client('ignore-eof', {
    closeGraceMs: 10,
    terminationTimeoutMs: 1000,
    stderrTailBytes: 8,
  });
  await c.initialize();
  const wait = expect(c.waitForTurnCompleted('never')).rejects.toThrow(
    /closed/,
  );
  await Promise.all([c.close(), c.close(), wait]);
});
it('rejects requests immediately when the leader exits even if inherited stdout stays open', async () => {
  const c = client('inherited-pipe', { requestTimeoutMs: 2000 });
  await c.initialize();
  const { turn } = await c.turnStart({ threadId: 'thread-1', input: [] });
  await expect(
    c.waitForTurnCompleted(turn.id, { timeoutMs: 10000 }),
  ).rejects.toThrow(/exited/);
}, 30000);
it.each([
  'persistent-descendant',
  'persistent-descendant-exit',
])('close kills a persistent descendant across leader exit (%s)', async (scenario) => {
  const c = client(scenario);
  let pid = 0;
  let confirmedGone = false;
  c.onNotification('item/agentMessage/delta', ({ delta }) => {
    pid = Number(delta);
  });
  await c.initialize();
  try {
    await expect.poll(() => pid, { timeout: 10000 }).toBeGreaterThan(0);
    if (scenario.endsWith('-exit')) {
      await c.turnStart({ threadId: 'thread-1', input: [] });
      await expect(c.waitForTurnCompleted('turn-1')).rejects.toThrow(/exited/);
    }
    await c.close();
    await expect
      .poll(
        () => {
          try {
            process.kill(pid, 0);
            return 'alive';
          } catch (error) {
            const code = (error as NodeJS.ErrnoException).code;
            if (code === 'ESRCH') confirmedGone = true;
            return code;
          }
        },
        { timeout: 10000 },
      )
      .toBe('ESRCH');
  } finally {
    try {
      if (pid > 0 && !confirmedGone) process.kill(pid, 'SIGKILL');
    } catch {
      /* already gone */
    }
  }
}, 25000);
it('captures only the bounded stderr tail', async () => {
  const c = client('stderr', { stderrTailBytes: 8 });
  await c.initialize();
  await expect.poll(() => c.stderrTail).toBe('lasttail');
});
it('forwards cwd, env and literal config arguments without shell interpretation', async () => {
  const c = client('normal', {
    cwd: fileURLToPath(new URL('./fixtures/', import.meta.url)),
    env: { ...process.env, FAKE_MARKER: 'injected' },
    extraArgs: ['-c', 'key="literal & value"'],
  });
  await c.initialize();
  const { thread } = await c.threadStart({});
  expect(thread.cwd).toBe(
    fileURLToPath(new URL('./fixtures', import.meta.url)),
  );
  expect(thread.marker).toBe('injected');
  expect(thread.argv).toEqual([
    'app-server',
    '--stdio',
    '-c',
    'key="literal & value"',
  ]);
});

it.skipIf(process.platform !== 'win32')(
  'unavailable launcher warns and kills only the leader, leaving descendants alive',
  async () => {
    const warnings: Array<{ message: string; data: unknown }> = [];
    const c = client('persistent-descendant', {
      launchInJob: async () => {
        throw new JobLauncherUnavailable('compilation blocked');
      },
      log: (message, data) => warnings.push({ message, data }),
    });
    let pid = 0;
    let confirmedGone = false;
    c.onNotification('item/agentMessage/delta', ({ delta }) => {
      pid = Number(delta);
    });
    try {
      await c.initialize();
      await expect.poll(() => pid, { timeout: 10000 }).toBeGreaterThan(0);
      const { thread } = await c.threadStart({});
      const leader = Number(thread.pid);
      expect(leader).toBeGreaterThan(0);
      await c.close();
      await expect
        .poll(
          () => {
            try {
              process.kill(leader, 0);
              return 'alive';
            } catch (error) {
              return (error as NodeJS.ErrnoException).code;
            }
          },
          { timeout: 3000 },
        )
        .toBe('ESRCH');
      expect(() => {
        try {
          process.kill(pid, 0);
        } catch (error) {
          confirmedGone = (error as NodeJS.ErrnoException).code === 'ESRCH';
          throw error;
        }
      }).not.toThrow();
      expect(warnings).toEqual([
        {
          message: 'termination-warning',
          data: {
            reason: expect.stringMatching(
              /launcher unavailable.*compilation blocked.*only.*leader/,
            ),
          },
        },
      ]);
      await expect(c.threadStart({})).rejects.toThrow(/closed/);
    } finally {
      if (pid > 0 && !confirmedGone) {
        try {
          process.kill(pid, 'SIGKILL');
        } catch {}
      }
    }
  },
  20000,
);
it.skipIf(process.platform !== 'win32')(
  'does not fall back on unclassified launch errors',
  async () => {
    const c = client('normal', {
      launchInJob: async () => {
        throw new Error('ambiguous start');
      },
    });
    await expect(c.initialize()).rejects.toThrow(
      /Cannot start.*ambiguous start/,
    );
  },
);
it.skipIf(process.platform !== 'win32')(
  'job close leaves an independently spawned out-of-job process alive',
  async () => {
    // A stale equal parent PID needs OS PID reuse or a privileged parent-attribute
    // launcher. Do not fake ancestry: real disjoint job membership is the invariant.
    const foreign = spawn(
      process.execPath,
      ['-e', "console.log('ready');setInterval(()=>{},1000)"],
      {
        detached: true,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    );
    try {
      await once(foreign.stdout, 'data', {
        signal: AbortSignal.timeout(10000),
      });
      const c = client();
      await c.initialize();
      await c.close();
      expect(foreign.exitCode).toBeNull();
      expect(foreign.signalCode).toBeNull();
      const foreignPid = foreign.pid;
      if (!foreignPid || foreignPid <= 0)
        throw new Error('Missing foreign PID');
      expect(() => process.kill(foreignPid, 0)).not.toThrow();
    } finally {
      if (foreign.exitCode === null && foreign.signalCode === null)
        foreign.kill();
    }
  },
  30000,
);

it.skipIf(process.platform !== 'win32').each(['terminate', 'release', 'both'])(
  'close warns instead of rejecting when job %s fails',
  async (failure) => {
    const warnings: unknown[] = [];
    let released = false;
    const c = client('normal', {
      log: (_message, data) => warnings.push(data),
      launchInJob: async (options) => {
        const job = await launchInJob(options);
        return {
          ...job,
          terminate: async (timeoutMs) => {
            await job.terminate(timeoutMs);
            if (failure !== 'release')
              throw new Error('injected terminate failure');
          },
          release: async () => {
            released = true;
            await job.release();
            if (failure !== 'terminate')
              throw new Error('injected release failure');
          },
        };
      },
    });
    await c.initialize();
    await expect(c.close()).resolves.toBeUndefined();
    expect(released).toBe(true);
    expect(warnings).toEqual([
      expect.objectContaining({
        reason: expect.stringMatching(/injected.*failure/),
      }),
    ]);
  },
  30000,
);
