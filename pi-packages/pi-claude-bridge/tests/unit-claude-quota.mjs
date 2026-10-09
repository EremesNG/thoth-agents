import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { CONFIG_DIR_NAME } from '@earendil-works/pi-coding-agent';
import { subscribeProviderLimits } from '@thoth-agents/pi-core';

const { fetchClaudeQuota } = await import('../src/quota.js');
const METHOD = 'usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET';
const reset = '2026-10-09T18:30:00.000Z';

function fakeQuery(usage) {
  let closeCount = 0;
  let finish;
  const closed = new Promise((resolve) => {
    finish = resolve;
  });
  const query = {
    [METHOD]: usage,
    [Symbol.asyncIterator]() {
      return {
        next: async () => {
          await closed;
          return { done: true };
        },
      };
    },
    close() {
      closeCount++;
      finish();
    },
  };
  return {
    query,
    get closeCount() {
      return closeCount;
    },
  };
}

describe('Claude quota control request', () => {
  it('keeps input open without a prompt, displays percentage and local resets, then closes', async () => {
    let firstInput;
    let inputSettled = false;
    let receivedOptions;
    const sdk = fakeQuery(async (options) => {
      assert.deepEqual(options, { skipBehaviors: true });
      await Promise.resolve();
      assert.equal(
        inputSettled,
        false,
        'input must neither yield nor finish before usage returns',
      );
      return {
        subscription_type: 'max',
        rate_limits_available: true,
        rate_limits: {
          five_hour: { utilization: 42.5, resets_at: reset },
          seven_day: { utilization: 8, resets_at: reset },
          seven_day_opus: { utilization: 0, resets_at: null },
          seven_day_sonnet: { utilization: 100, resets_at: reset },
          model_scoped: [
            { display_name: 'Fable', utilization: 12, resets_at: reset },
          ],
          extra_usage: {
            is_enabled: true,
            utilization: 5,
            monthly_limit: 100,
            used_credits: 5,
          },
        },
      };
    });
    const output = await fetchClaudeQuota(
      ({ prompt, options }) => {
        receivedOptions = options;
        firstInput = prompt[Symbol.asyncIterator]()
          .next()
          .then((item) => {
            inputSettled = true;
            return item;
          });
        return sdk.query;
      },
      {
        cwd: 'query-cwd',
        env: { AUTH: 'same' },
        pathToClaudeCodeExecutable: 'custom-cli',
      },
      'quota-session',
    );
    assert.match(output, /5 hour: 42\.5%/);
    assert.match(output, /Weekly: 8%/);
    assert.match(output, /Weekly Opus: 0%/);
    assert.match(output, /Weekly Sonnet: 100%/);
    assert.match(output, /Fable: 12%/);
    assert.match(output, /Extra usage: 5%/);
    assert.ok(output.includes(new Date(reset).toLocaleString()));
    assert.deepEqual(receivedOptions, {
      cwd: 'query-cwd',
      env: { AUTH: 'same' },
      pathToClaudeCodeExecutable: 'custom-cli',
      tools: [],
      persistSession: false,
    });
    assert.equal(sdk.closeCount, 1);
    assert.deepEqual(await firstInput, { value: undefined, done: true });
  });
});

it('explains missing experimental API and closes the query', async () => {
  const sdk = fakeQuery(undefined);
  const output = await fetchClaudeQuota(() => sdk.query, {}, 'quota-session');
  assert.match(output, /experimental usage API.*unavailable.*update/i);
  assert.equal(sdk.closeCount, 1);
});

it('explains unavailable plan limits for API key / Bedrock / Vertex and closes', async () => {
  const sdk = fakeQuery(async () => ({
    rate_limits: null,
    rate_limits_available: false,
  }));
  const output = await fetchClaudeQuota(() => sdk.query, {}, 'quota-session');
  assert.match(output, /plan limits unavailable/i);
  assert.match(output, /API key.*Bedrock.*Vertex/);
  assert.equal(sdk.closeCount, 1);
});

it('reports request errors and still closes', async () => {
  const sdk = fakeQuery(async () => {
    throw new Error('auth failed');
  });
  assert.match(
    await fetchClaudeQuota(() => sdk.query, {}, 'quota-session'),
    /Claude quota failed: auth failed/,
  );
  assert.equal(sdk.closeCount, 1);
});

it('times out at 30 seconds, closes, and settles the held input', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const sdk = fakeQuery(() => new Promise(() => {}));
  let input;
  const result = fetchClaudeQuota(
    ({ prompt }) => {
      input = prompt[Symbol.asyncIterator]().next();
      return sdk.query;
    },
    {},
    'quota-session',
  );
  t.mock.timers.tick(29999);
  assert.equal(sdk.closeCount, 0);
  t.mock.timers.tick(1);
  assert.match(await result, /timed out after 30 seconds/i);
  assert.equal(sdk.closeCount, 1);
  assert.deepEqual(await input, { value: undefined, done: true });
});

it('reports quota-query events synchronously to the originating Pi session', async () => {
  const reports = [];
  let reported;
  const observation = new Promise((resolve) => {
    reported = resolve;
  });
  const unsubscribe = subscribeProviderLimits((entry) => {
    reports.push(entry);
    reported();
  });
  const sdk = fakeQuery(async () => {
    await observation;
    assert.equal(reports[0].sessionId, 'quota-child');
    return { rate_limits: {} };
  });
  sdk.query[Symbol.asyncIterator] = async function* () {
    yield {
      type: 'rate_limit_event',
      session_id: 'sdk-id',
      rate_limit_info: {
        status: 'allowed',
        rateLimitType: 'five_hour',
        utilization: 0.25,
      },
    };
  };
  try {
    assert.match(
      await fetchClaudeQuota(() => sdk.query, {}, 'quota-child'),
      /No plan windows/,
    );
    assert.equal(sdk.closeCount, 1);
  } finally {
    unsubscribe();
  }
});

it('handles stream and spawn errors without leaving a process or input open', async () => {
  const sdk = fakeQuery(() => new Promise(() => {}));
  sdk.query[Symbol.asyncIterator] = () => ({
    next: async () => {
      throw new Error('CLI exited');
    },
  });
  assert.match(
    await fetchClaudeQuota(() => sdk.query, {}, 'quota-session'),
    /CLI exited/,
  );
  assert.equal(sdk.closeCount, 1);
  let input;
  assert.match(
    await fetchClaudeQuota(
      ({ prompt }) => {
        input = prompt[Symbol.asyncIterator]().next();
        throw new Error('spawn failed');
      },
      {},
      'quota-session',
    ),
    /spawn failed/,
  );
  assert.deepEqual(await input, { value: undefined, done: true });
});

it('registers /claude quota, reuses bridge child settings, and does not fetch on startup or invalid arguments', async (t) => {
  const { globalConfigPath } = await import('../src/config.js');
  const configPath = globalConfigPath();
  const previous = existsSync(configPath)
    ? readFileSync(configPath)
    : undefined;
  t.after(() => {
    if (previous) writeFileSync(configPath, previous);
    else rmSync(configPath, { force: true });
  });
  writeFileSync(
    configPath,
    JSON.stringify({
      provider: { pathToClaudeCodeExecutable: 'configured-cli' },
    }),
  );
  const { default: activate, __test } = await import(
    '../src/index.js?quota-provider-config'
  );
  const cwd = mkdtempSync(join(tmpdir(), 'claude-quota-config-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  mkdirSync(join(cwd, CONFIG_DIR_NAME));
  writeFileSync(
    join(cwd, CONFIG_DIR_NAME, 'claude-bridge.json'),
    JSON.stringify({
      provider: { pathToClaudeCodeExecutable: 'wrong-cli' },
    }),
  );
  let command;
  let calls = 0;
  const handlers = new Map();
  let initialized = false;
  const notices = [];
  activate({
    on: (name, handler) => {
      const list = handlers.get(name) ?? [];
      list.push(handler);
      handlers.set(name, list);
    },
    registerProvider() {},
    registerTool() {},
    registerCommand: (name, config) => {
      assert.equal(name, 'claude');
      command = config;
    },
    getCommands: () => {
      assert.ok(initialized, 'getCommands is runtime-only in Pi');
      return [{ name: 'claude', description: command.description }];
    },
  });
  const ctx = {
    cwd,
    ui: { notify: (...args) => notices.push(args) },
    sessionManager: { getSessionId: () => 'command-session' },
    modelRegistry: { getProvider: () => ({}) },
  };
  const sdk = fakeQuery(async () => ({
    rate_limits: { extra_usage: { is_enabled: false } },
  }));
  __test.setAuxiliaryQuery(({ options }) => {
    calls++;
    assert.equal(
      options.cwd,
      process.cwd(),
      'uses the provider cwd, not another command-context project',
    );
    assert.equal(options.pathToClaudeCodeExecutable, 'configured-cli');
    assert.equal(
      options.env.PI_CODING_AGENT_DIR,
      process.env.PI_CODING_AGENT_DIR,
    );
    assert.equal(options.env.DISABLE_AUTO_COMPACT, '1');
    assert.equal(options.env.ENABLE_CLAUDEAI_MCP_SERVERS, '0');
    assert.deepEqual(options.tools, []);
    return sdk.query;
  });
  try {
    initialized = true;
    for (const handler of handlers.get('session_start')) await handler({}, ctx);
    assert.equal(calls, 0);
    await command.handler('other', ctx);
    assert.match(notices.at(-1)[0], /Usage: \/claude quota/);
    assert.equal(calls, 0);
    await command.handler('quota', ctx);
    assert.match(notices.at(-1)[0], /Extra usage: disabled/);
    assert.equal(calls, 1);
    assert.equal(sdk.closeCount, 1);
    assert.equal(
      notices.filter(([text]) => /command conflict/.test(text)).length,
      0,
    );
  } finally {
    __test.setAuxiliaryQuery(null);
  }
});

for (const kind of ['renamed', 'shadowed']) {
  it(`warns once about a ${kind} claude command collision without renaming or disabling our handler`, async () => {
    const { default: activate, __test } = await import('../src/index.js');
    let command;
    const handlers = [];
    const notices = [];
    activate({
      on: (name, handler) => {
        if (name === 'session_start') handlers.push(handler);
      },
      registerProvider() {},
      registerTool() {},
      registerCommand: (name, config) => {
        assert.equal(name, 'claude');
        command = config;
      },
      getCommands: () => [
        ...(kind === 'renamed'
          ? [{ name: 'claude:1', description: command.description }]
          : []),
        {
          name: kind === 'renamed' ? 'claude:2' : 'claude',
          description: 'Other Claude command',
          sourceInfo: { path: 'other-extension.ts' },
        },
      ],
    });
    const ctx = {
      cwd: process.cwd(),
      ui: { notify: (...args) => notices.push(args) },
      sessionManager: { getSessionId: () => 'collision-session' },
      modelRegistry: { getProvider: () => ({}) },
    };
    const sdk = fakeQuery(async () => ({ rate_limits: {} }));
    __test.setAuxiliaryQuery(() => sdk.query);
    try {
      for (let n = 0; n < 2; n++)
        for (const handler of handlers) await handler({}, ctx);
      const warnings = notices.filter(([text]) =>
        /command conflict/.test(text),
      );
      assert.equal(warnings.length, 1);
      assert.match(warnings[0][0], /other-extension\.ts/);
      assert.equal(warnings[0][1], 'warning');
      await command.handler('quota', ctx);
      assert.match(notices.at(-1)[0], /No plan windows/);
      assert.equal(sdk.closeCount, 1);
    } finally {
      __test.setAuxiliaryQuery(null);
    }
  });
}
