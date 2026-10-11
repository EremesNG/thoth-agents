import fs from 'node:fs';
import {
  ModelRuntime,
  type ProviderConfig,
} from '@earendil-works/pi-coding-agent';
import { expect, it, vi } from 'vitest';
import { runEvaluation } from './harness';
import { syntheticProvider } from './synthetic-provider';

function withWorkerProvider(
  parent: ReturnType<typeof syntheticProvider>,
  child: ReturnType<typeof syntheticProvider>,
): ProviderConfig {
  return {
    ...parent,
    streamSimple: (model, context, options) =>
      (context.messages.some(
        (message) =>
          message.role === 'system' &&
          JSON.stringify(message).includes('You are worker.'),
      )
        ? child
        : parent
      ).streamSimple(model, context, options),
  };
}

it('loads source extensions without a build, scripts questions and captures tools and workspace writes', async () => {
  const result = await runEvaluation({
    prompt: 'Do the fixture task.',
    offline: true,
    caps: { timeMs: 10000, cleanupMs: 2000 },
    provider: syntheticProvider([
      {
        calls: [
          {
            name: 'ask_user_question',
            args: {
              questions: [
                { id: 'approval', header: 'Approval', prompt: 'Proceed?' },
              ],
            },
          },
        ],
      },
      {
        calls: [
          { name: 'write', args: { path: 'answer.txt', content: 'done' } },
        ],
      },
      { text: 'Completed.' },
    ]),
    model: { provider: 'eval-fixture', id: 'fixture' },
    answers: [{ approval: 'yes' }],
    inspect: ({ agentDir }) => {
      expect(fs.existsSync(`${agentDir}/agents/thoth-worker.md`)).toBe(true);
    },
  });
  expect(result.status, result.reasons.join('\n')).toBe('PASS');
  expect(result.questions[0].payload.questions[0].id).toBe('approval');
  expect(result.questions[0].answer).toEqual({ approval: 'yes' });
  expect(result.tools.map((call) => call.name)).toEqual([
    'ask_user_question',
    'write',
  ]);
  expect(result.tools.every((call) => call.result !== undefined)).toBe(true);
  expect(result.writtenPaths).toContain('answer.txt');
}, 30_000);

it.each([
  {
    name: 'parent turn',
    caps: { turns: 1 },
    steps: [
      { calls: [{ name: 'read', args: { path: 'README.md' } }] },
      { text: 'second turn' },
    ],
    reason: 'parent turn cap',
  },
  {
    name: 'parent cost',
    caps: { caseUsd: 0.1 },
    steps: [{ text: 'expensive', cost: 0.2 }],
    reason: 'case cost cap',
  },
  {
    name: 'run cost',
    caps: { runUsd: 0.1 },
    steps: [{ text: 'expensive', cost: 0.2 }],
    reason: 'run cost cap',
  },
  {
    name: 'wall time',
    caps: { timeMs: 300 },
    steps: [{ wait: true }],
    reason: 'wall time cap',
  },
])('returns INCONCLUSIVE on $name cap, never grades PASS', async ({
  caps,
  steps,
  reason,
}) => {
  let graded = false;
  const result = await runEvaluation({
    prompt: 'Test caps.',
    offline: true,
    model: { provider: 'eval-fixture', id: 'fixture' },
    provider: syntheticProvider(steps),
    caps: { timeMs: 10000, cleanupMs: 2000, ...caps },
    grade: () => {
      graded = true;
      return [];
    },
  });
  expect(result.status, result.reasons.join('\n')).toBe('INCONCLUSIVE');
  expect(result.reasons).toContain(reason);
  expect(graded).toBe(false);
}, 30_000);

it('bounds stalled SDK setup before inspection or prompt can start', async () => {
  const before = { ...process.env };
  let setupFinished = false;
  let inspected = false;
  let release: ReturnType<typeof setTimeout> | undefined;
  const refresh = vi
    .spyOn(ModelRuntime.prototype, 'refresh')
    .mockImplementation(
      () =>
        new Promise<never>((_resolve, reject) => {
          release = setTimeout(() => {
            setupFinished = true;
            reject(new Error('SDK setup remained stalled'));
          }, 2000);
        }),
    );
  try {
    const result = await runEvaluation({
      prompt: 'Never start after setup times out.',
      offline: true,
      model: { provider: 'eval-fixture', id: 'fixture' },
      provider: syntheticProvider([{ text: 'Must not run.' }]),
      caps: { timeMs: 500 },
      inspect: () => {
        inspected = true;
      },
    });
    expect(refresh).toHaveBeenCalled();
    expect(setupFinished).toBe(false);
    expect(inspected).toBe(false);
    expect(result.status).toBe('INCONCLUSIVE');
    expect(result.reasons).toContain('wall time cap');
    expect(result.turns).toBe(0);
    expect(process.env).toEqual(before);
  } finally {
    clearTimeout(release);
    refresh.mockRestore();
  }
}, 30_000);

it('caps child cost using the typed usage channel, ignores unrelated sessions and restores environment', async () => {
  const before = { ...process.env };
  const result = await runEvaluation({
    prompt: 'Test child accounting.',
    offline: true,
    model: { provider: 'eval-fixture', id: 'fixture' },
    provider: syntheticProvider([{ wait: true }]),
    caps: { timeMs: 10000, cleanupMs: 2000, caseUsd: 0.1 },
    inspect: ({ session, events }) => {
      const payload = {
        v: 1,
        source: 'fixture',
        at: Date.now(),
        data: { totalCost: 0.2, runCount: 1 },
      };
      events.emit('thoth:subagents:usage', {
        ...payload,
        sessionId: 'unrelated',
      });
      events.emit('thoth:subagents:usage', {
        ...payload,
        sessionId: session.sessionManager.getSessionId(),
      });
    },
  });
  expect(result.status).toBe('INCONCLUSIVE');
  expect(result.childCost).toBe(0.2);
  expect(result.reasons).toContain('case cost cap');
  expect(process.env).toEqual(before);
}, 30_000);

it('terminates a running real thoth-worker child on a cap and leaves operator sentinel/auth untouched', async () => {
  const os = await import('node:os');
  const path = await import('node:path');
  const operator = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-operator-'));
  const env = { ...process.env };
  fs.mkdirSync(path.join(operator, '.pi/agent'), { recursive: true });
  const authSource = path.join(operator, '.pi/agent/auth.json');
  fs.writeFileSync(authSource, '{}');
  fs.writeFileSync(path.join(operator, '.pi/agent/sentinel'), 'do not touch');
  const operatorTree = fs.readdirSync(operator, { recursive: true }).sort();
  process.env.HOME = operator;
  process.env.USERPROFILE = operator;
  process.env.PI_CODING_AGENT_DIR = path.join(operator, '.pi/agent');
  let started = false;
  let aborted = false;
  try {
    const child = syntheticProvider([{ wait: true }], {
      started: () => {
        started = true;
      },
      aborted: () => {
        aborted = true;
      },
    });
    const parent = syntheticProvider([
      {
        calls: [
          {
            name: 'subagent_run',
            args: {
              agent: 'thoth-worker',
              task: 'MEMORY: none. Wait for cancellation.',
              mode: 'background',
            },
          },
        ],
      },
      { wait: true },
    ]);
    const provider = withWorkerProvider(parent, child);
    const result = await runEvaluation({
      prompt: 'Launch a child.',
      offline: true,
      authSource,
      model: { provider: 'eval-fixture', id: 'fixture' },
      provider,
      caps: { timeMs: 15000 },
      inspect: ({ agentDir }) => {
        // Retain the production role and tools; only route this offline child to the local provider.
        const file = path.join(agentDir, 'agents/thoth-worker.md');
        fs.writeFileSync(
          file,
          fs
            .readFileSync(file, 'utf8')
            .replace(/^model:.*$/m, 'model: "inherit"'),
        );
      },
    });
    expect(result.status, result.reasons.join('\n')).toBe('INCONCLUSIVE');
    expect(started).toBe(true);
    expect(aborted, JSON.stringify(result.subagents)).toBe(true);
    expect(result.subagents[0].result).toMatchObject({
      details: {
        mode: 'background',
        tasks: [expect.objectContaining({ agent: 'thoth-worker' })],
      },
    });
    expect(fs.readdirSync(path.join(operator, '.pi/agent')).sort()).toEqual([
      'auth.json',
      'sentinel',
    ]);
    expect(fs.readdirSync(operator, { recursive: true }).sort()).toEqual(
      operatorTree,
    );
    expect(fs.readFileSync(authSource, 'utf8')).toBe('{}');
    expect(
      fs.readFileSync(path.join(operator, '.pi/agent/sentinel'), 'utf8'),
    ).toBe('do not touch');
    expect(process.env.HOME).toBe(operator);
    expect(process.env.PI_CODING_AGENT_DIR).toBe(
      path.join(operator, '.pi/agent'),
    );
  } finally {
    for (const key of Object.keys(process.env))
      if (!(key in env)) delete process.env[key];
    Object.assign(process.env, env);
    fs.rmSync(operator, { recursive: true, force: true });
  }
}, 40_000);

it('records real completed child usage/runtime metrics and child writes outside the parent write tool', async () => {
  const child = syntheticProvider([
    {
      calls: [
        {
          name: 'write',
          args: { path: 'child.txt', content: 'child progress' },
        },
      ],
    },
    { text: 'Child completed.', cost: 0.02 },
  ]);
  const parent = syntheticProvider([
    {
      calls: [
        {
          name: 'subagent_run',
          args: {
            agent: 'thoth-worker',
            task: 'MEMORY: none. CHILD_SUCCESS',
            mode: 'task',
          },
        },
      ],
    },
    { text: 'Done.' },
  ]);
  const provider = withWorkerProvider(parent, child);
  const result = await runEvaluation({
    prompt: 'Delegate.',
    offline: true,
    caps: { timeMs: 10000, cleanupMs: 2000 },
    provider,
    model: { provider: 'eval-fixture', id: 'fixture' },
    inspect: ({ agentDir }) => {
      const file = `${agentDir}/agents/thoth-worker.md`;
      fs.writeFileSync(
        file,
        fs
          .readFileSync(file, 'utf8')
          .replace(/^model:.*$/m, 'model: "inherit"'),
      );
    },
  });
  expect(result.status, result.reasons.join('\n')).toBe('PASS');
  expect(result.childCost).toBe(0.02);
  expect(result.parentCost).toBe(0);
  expect(result.writtenPaths).toContain('child.txt');
  expect(result.tools.map((call) => call.name)).toEqual(['subagent_run']);
  expect(result.tasks).toContainEqual(
    expect.objectContaining({
      task: expect.objectContaining({
        agent: 'thoth-worker',
        status: 'completed',
        usage: expect.any(Object),
        runtime_metrics: expect.any(Object),
      }),
    }),
  );
}, 30_000);

it('restores the environment and cwd after a setup failure', async () => {
  const before = { ...process.env };
  const cwd = process.cwd();
  const result = await runEvaluation({
    prompt: 'Never streamed.',
    offline: true,
    caps: { timeMs: 10000, cleanupMs: 2000 },
    provider: syntheticProvider([]),
    model: { provider: 'unknown', id: 'missing' },
  });
  expect(result.status).toBe('INCONCLUSIVE');
  expect(result.reasons[0]).toContain('Unknown evaluation model');
  expect(process.env).toEqual(before);
  expect(process.cwd()).toBe(cwd);
}, 30_000);

it('awaits background child completion and its terminal parent follow-up before grading', async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const child = syntheticProvider([
    { text: 'CHILD_BACKGROUND_COMPLETED', gate },
  ]);
  const parent = syntheticProvider([
    {
      calls: [
        {
          name: 'subagent_run',
          args: {
            agent: 'thoth-worker',
            task: 'MEMORY: none. CHILD_BACKGROUND',
            mode: 'background',
          },
        },
      ],
    },
    { text: 'Delegated; awaiting completion.' },
    {
      calls: [
        {
          name: 'write',
          args: {
            path: 'follow-up.txt',
            content: 'Processed child completion.',
          },
        },
      ],
    },
    { text: 'Follow-up complete.' },
  ]);
  const result = await runEvaluation({
    prompt: 'Delegate in background.',
    offline: true,
    caps: { timeMs: 10000, cleanupMs: 2000 },
    model: { provider: 'eval-fixture', id: 'fixture' },
    provider: withWorkerProvider(parent, child),
    inspect: ({ agentDir, session }) => {
      session.subscribe((event) => {
        if (event.type === 'agent_settled') release();
      });
      const file = `${agentDir}/agents/thoth-worker.md`;
      fs.writeFileSync(
        file,
        fs
          .readFileSync(file, 'utf8')
          .replace(/^model:.*$/m, 'model: "inherit"'),
      );
    },
    grade: (result) =>
      result.writtenPaths.includes('follow-up.txt')
        ? []
        : ['Missing terminal follow-up'],
  });
  expect(result.status, result.reasons.join('\n')).toBe('PASS');
  expect(result.writtenPaths).toContain('follow-up.txt');
  expect(
    result.tasks.some(
      ({ task }) =>
        task.agent === 'thoth-worker' &&
        task.status === 'completed' &&
        task.result === 'CHILD_BACKGROUND_COMPLETED',
    ),
  ).toBe(true);
}, 30_000);

it('names available provider/model ids when the selected model is unknown', async () => {
  const result = await runEvaluation({
    prompt: 'Do not call a model.',
    offline: true,
    caps: { timeMs: 10000, cleanupMs: 2000 },
    provider: syntheticProvider([]),
    model: { provider: 'eval-fixture', id: 'missing' },
  });
  expect(result.status).toBe('INCONCLUSIVE');
  expect(result.reasons.join('; ')).toContain(
    'Unknown evaluation model eval-fixture/missing',
  );
  expect(result.reasons.join('; ')).toContain('eval-fixture/fixture');
  expect(result.turns).toBe(0);
}, 30_000);
