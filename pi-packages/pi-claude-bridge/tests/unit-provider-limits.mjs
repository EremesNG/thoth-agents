import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { subscribeProviderLimits } from '@thoth-agents/pi-core';
import { QueryContext } from '../src/query-state.js';

const { __test } = await import('../src/index.js');
const model = {
  api: 'anthropic-messages',
  provider: 'claude-bridge',
  id: 'test',
};
const event = (info) => ({
  type: 'rate_limit_event',
  session_id: 'not-the-pi-session',
  rate_limit_info: info,
});

async function consume(c, messages, aborted = () => false) {
  async function* query() {
    yield* messages;
  }
  await __test.consumeQuery(query(), new Map(), model, aborted, c);
}

describe('provider limit observations', () => {
  it('reports fractions, Unix milliseconds and only registry fields synchronously, without changing notification dedupe', async () => {
    const reports = [];
    const notices = [];
    const unsubscribe = subscribeProviderLimits((entry) => reports.push(entry));
    __test.setPiUI({ notify: (...args) => notices.push(args) });
    try {
      const c = new QueryContext();
      c.piSessionId = 'child-a';
      const message = event({
        status: 'allowed_warning',
        rateLimitType: 'five_hour',
        utilization: 0.83,
        resetsAt: 1786141800,
        windowType: 'rolling',
        overageInUse: false,
        overageEnabled: true,
        isUsingOverage: false,
        surpassedThreshold: 0.8,
      });
      await consume(c, [message, message]);
      assert.equal(
        reports.length,
        2,
        'each event is reported even with no Pi stream and a deduped notice',
      );
      assert.deepEqual(reports[0], {
        provider: 'claude-bridge',
        window: 'five_hour',
        status: 'allowed_warning',
        utilization: 0.83,
        resetsAt: 1786141800000,
        observedAt: reports[0].observedAt,
        windowType: 'rolling',
        overageInUse: false,
        overageEnabled: true,
        isUsingOverage: false,
        sessionId: 'child-a',
      });
      assert.ok(Number.isInteger(reports[0].observedAt));
      assert.deepEqual(notices, [
        ['Claude rate limit warning: 83% used (five_hour)', 'warning'],
      ]);
    } finally {
      unsubscribe();
      __test.setPiUI(null);
    }
  });
});

describe('query-local attribution', () => {
  it("keeps two interleaved sessions and an iterator's captured id independent", async () => {
    const reports = [];
    const unsubscribe = subscribeProviderLimits((entry) => reports.push(entry));
    try {
      const a = new QueryContext();
      a.piSessionId = 'parent';
      const b = new QueryContext();
      b.piSessionId = 'child';
      let release;
      const gate = new Promise((resolve) => {
        release = resolve;
      });
      async function* paused() {
        await gate;
        yield event({ status: 'rejected', rateLimitType: 'seven_day' });
      }
      const first = __test.consumeQuery(
        paused(),
        new Map(),
        model,
        () => true,
        a,
      );
      a.piSessionId = 'reused-context';
      await consume(b, [
        event({ status: 'allowed', rateLimitType: 'seven_day' }),
      ]);
      release();
      await first;
      assert.deepEqual(
        reports.map((entry) => [entry.sessionId, entry.status]),
        [
          ['child', 'allowed'],
          ['parent', 'rejected'],
        ],
      );
    } finally {
      unsubscribe();
    }
  });

  it('attributes isolated summaries and AskClaude to their options, not the SDK session', async () => {
    const reports = [];
    const unsubscribe = subscribeProviderLimits((entry) => reports.push(entry));
    let closes = 0;
    __test.setAuxiliaryQuery(() => ({
      async *[Symbol.asyncIterator]() {
        yield event({
          status: 'allowed_warning',
          rateLimitType: 'seven_day_opus',
          utilization: 0.9,
        });
        yield {
          type: 'result',
          subtype: 'success',
          result: 'summary',
          is_error: false,
        };
      },
      close() {
        closes++;
      },
    }));
    try {
      const stream = __test.isolatedStreamFn(
        model,
        { messages: [{ role: 'user', content: 'summarize', timestamp: 0 }] },
        { sessionId: 'summary-child', cacheRetention: 'none' },
      );
      await stream.result();
      await __test.promptAndWait('hello', 'none', new Map(), undefined, {
        piSessionId: 'ask-child',
        isolated: true,
        appendSkills: false,
      });
      assert.deepEqual(
        reports.map((entry) => entry.sessionId),
        ['summary-child', 'ask-child'],
      );
      assert.equal(closes, 2);
    } finally {
      unsubscribe();
      __test.setAuxiliaryQuery(null);
    }
  });
});

describe('summary takeovers', () => {
  it('captures the event session for split-turn compact and branch summary queries', async () => {
    const { activateWithMockPi } = await import('./lib/mock-pi.mjs');
    const handlers = activateWithMockPi();
    const reports = [];
    const unsubscribe = subscribeProviderLimits((entry) => reports.push(entry));
    let sessionId = 'compacting-child';
    __test.setAuxiliaryQuery(() => ({
      async *[Symbol.asyncIterator]() {
        sessionId = 'changed-during-query';
        yield event({ status: 'allowed', rateLimitType: 'five_hour' });
        yield {
          type: 'result',
          subtype: 'success',
          result: 'summary',
          is_error: false,
        };
      },
      close() {},
    }));
    const notices = [];
    const ctx = {
      model: { ...model, baseUrl: 'claude-bridge', maxTokens: 4096 },
      sessionManager: { getSessionId: () => sessionId },
      ui: { notify: (text) => notices.push(text) },
    };
    const message = { role: 'user', content: 'summarize this', timestamp: 0 };
    try {
      const compact = await handlers.get('session_before_compact')(
        {
          reason: 'manual',
          branchEntries: [],
          signal: new AbortController().signal,
          preparation: {
            firstKeptEntryId: 'kept',
            messagesToSummarize: [message],
            turnPrefixMessages: [message],
            isSplitTurn: true,
            tokensBefore: 100,
            fileOps: { read: new Set(), edited: new Set(), written: new Set() },
            settings: { reserveTokens: 4096 },
          },
        },
        ctx,
      );
      assert.ok(compact.compaction, notices.join('\n'));
      sessionId = 'branching-child';
      const branch = await handlers.get('session_before_tree')(
        {
          signal: new AbortController().signal,
          preparation: {
            targetId: 'target',
            userWantsSummary: true,
            entriesToSummarize: [{ type: 'message', id: 'entry', message }],
          },
        },
        ctx,
      );
      assert.ok(
        branch.summary,
        'the branch takeover actually consumed its query',
      );
      assert.deepEqual(
        reports.map((entry) => entry.sessionId),
        ['compacting-child', 'compacting-child', 'branching-child'],
      );
    } finally {
      unsubscribe();
      __test.setAuxiliaryQuery(null);
    }
  });
});

it('attributes concurrent provider queries from their SimpleStreamOptions session ids', async () => {
  const { default: activate } = await import(
    '../src/index.js?limit-provider-entry'
  );
  let provider;
  const starts = [];
  activate({
    on: (name, handler) => {
      if (name === 'session_start') starts.push(handler);
    },
    registerTool() {},
    registerProvider: (_name, config) => {
      provider = config;
    },
  });
  for (const handler of starts)
    handler(
      {},
      {
        ui: { notify() {} },
        modelRegistry: { getProvider: () => undefined },
        sessionManager: { getSessionId: () => 'fixture' },
      },
    );
  assert.ok(provider, "capture registration in this session's model registry");
  const { __test: providerTest } = await import(
    '../src/index.js?limit-provider-entry'
  );
  const reports = [];
  const unsubscribe = subscribeProviderLimits((entry) => reports.push(entry));
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let ready;
  const started = new Promise((resolve) => {
    ready = resolve;
  });
  let count = 0;
  providerTest.setQuery(() => {
    const parent = count++ === 0;
    return {
      async *[Symbol.asyncIterator]() {
        if (parent) {
          ready();
          await gate;
        }
        yield event({
          status: parent ? 'rejected' : 'allowed_warning',
          rateLimitType: 'five_hour',
          utilization: parent ? 1 : 0.8,
        });
        yield {
          type: 'result',
          subtype: 'success',
          is_error: false,
          result: 'done',
        };
      },
      close() {},
      interrupt: async () => {},
    };
  });
  const context = {
    messages: [{ role: 'user', content: 'test', timestamp: 0 }],
    tools: [],
  };
  try {
    const parent = provider.streamSimple(provider.models[0], context, {
      sessionId: 'provider-parent',
    });
    await started;
    await provider
      .streamSimple(provider.models[0], context, {
        sessionId: 'provider-child',
      })
      .result();
    release();
    await parent.result();
    assert.deepEqual(
      reports.map((entry) => [entry.sessionId, entry.status]),
      [
        ['provider-child', 'allowed_warning'],
        ['provider-parent', 'rejected'],
      ],
    );
  } finally {
    release();
    unsubscribe();
    providerTest.setQuery(null);
    providerTest.resetSharedSession();
  }
});
