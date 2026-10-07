import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type AtelierAssistantMessage,
  AtelierMetadataWriter,
  type AtelierMetadataWriterOptions,
  captureAtelierSessionOwner,
} from '../src/atelier-metadata.js';
import { SubagentManager } from '../src/manager.js';
import type { SubagentRunner } from '../src/types.js';

describe('Atelier child usage artifacts', () => {
  let directory: string;
  let sessionFile: string;
  let owner: { sessionId: string; sessionFile: string };
  let appendEntry: ReturnType<
    typeof vi.fn<NonNullable<AtelierMetadataWriterOptions['appendEntry']>>
  >;
  let currentOwner: { sessionId: string; sessionFile: string } | undefined;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-subagents-atelier-'));
    sessionFile = path.join(directory, 'root-session.jsonl');
    owner = { sessionId: 'root-session-a', sessionFile };
    currentOwner = owner;
    appendEntry = vi.fn();
  });

  afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));

  it('captures a root session id and falls back to its session file', () => {
    expect(
      captureAtelierSessionOwner({
        sessionManager: {
          getSessionId: () => 'root-session-a',
          getSessionFile: () => sessionFile,
        },
      }),
    ).toEqual(owner);
    expect(
      captureAtelierSessionOwner({
        sessionManager: {
          getSessionId: () => undefined,
          getSessionFile: () => sessionFile,
        },
      }),
    ).toEqual({ sessionId: sessionFile, sessionFile });
    expect(captureAtelierSessionOwner({})).toBeUndefined();
  });

  it('writes consumer-shaped status, per-attempt usage, references, and cost events without assistant text', () => {
    const writer = new AtelierMetadataWriter({
      appendEntry,
      getCurrentOwner: () => currentOwner,
    });
    const run = writer.createRun({ taskId: 'task-a', owner, cwd: directory })!;
    const step = run.beginStep({ agent: 'explorer', startedAt: 100 });

    run.recordAssistantMessage(
      step.index,
      'explorer',
      {
        role: 'assistant',
        timestamp: 120,
        usage: {
          input: 12,
          output: 7,
          cacheRead: 3,
          cacheWrite: 2,
          cost: { total: 0.25 },
        },
        content: 'private assistant response',
      } as AtelierAssistantMessage & { content: string },
      125,
    );
    run.finishStep(step.index, 'completed', {
      model: 'provider/model',
      exitCode: 0,
    });
    run.setState('completed');

    const status = JSON.parse(
      fs.readFileSync(path.join(run.asyncDir, 'status.json'), 'utf8'),
    );
    const metadata = JSON.parse(fs.readFileSync(step.metadataPath, 'utf8'));
    const events = fs
      .readFileSync(path.join(run.asyncDir, 'events.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(status).toMatchObject({
      runId: run.runId,
      mode: 'single',
      state: 'completed',
      sessionId: owner.sessionId,
      startedAt: 100,
      steps: [{ agent: 'explorer', status: 'completed', startedAt: 100 }],
    });
    expect(metadata).toMatchObject({
      runId: run.runId,
      agent: 'explorer',
      model: 'provider/model',
      exitCode: 0,
      usage: { input: 12, output: 7, cacheRead: 3, cacheWrite: 2, cost: 0.25 },
    });
    expect(events).toEqual([
      expect.objectContaining({
        type: 'message_end',
        subagentSource: 'child',
        subagentRunId: run.runId,
        subagentStepIndex: 0,
        subagentAgent: 'explorer',
        observedAt: 125,
        message: {
          role: 'assistant',
          timestamp: 120,
          usage: {
            input: 12,
            output: 7,
            cacheRead: 3,
            cacheWrite: 2,
            cost: { total: 0.25 },
          },
        },
      }),
    ]);
    expect(JSON.stringify({ status, metadata, events })).not.toContain(
      'private assistant response',
    );
    expect(appendEntry).toHaveBeenCalledWith('pi-atelier:subagent-metadata', {
      runIds: [run.runId],
      paths: [step.metadataPath],
      asyncDirs: [run.asyncDir],
    });
  });

  it('sums distinct same-owner continuation steps once and deduplicates a replayed message', () => {
    const writer = new AtelierMetadataWriter({
      appendEntry,
      getCurrentOwner: () => currentOwner,
    });
    const run = writer.createRun({ taskId: 'task-a', owner, cwd: directory })!;
    const first = run.beginStep({ agent: 'explorer', startedAt: 100 });
    const firstMessage = {
      role: 'assistant' as const,
      timestamp: 120,
      usage: {
        input: 4,
        output: 2,
        cacheRead: 1,
        cacheWrite: 0,
        cost: { total: 0.1 },
      },
    };
    run.recordAssistantMessage(first.index, 'explorer', firstMessage, 125);
    run.recordAssistantMessage(first.index, 'explorer', firstMessage, 126);
    run.finishStep(first.index, 'completed');

    const continued = run.beginStep({ agent: 'explorer', startedAt: 200 });
    run.recordAssistantMessage(
      continued.index,
      'explorer',
      {
        role: 'assistant',
        timestamp: 220,
        usage: {
          input: 6,
          output: 3,
          cacheRead: 2,
          cacheWrite: 1,
          cost: { total: 0.2 },
        },
      },
      225,
    );
    run.finishStep(continued.index, 'completed');

    const firstMetadata = JSON.parse(
      fs.readFileSync(first.metadataPath, 'utf8'),
    );
    const continuedMetadata = JSON.parse(
      fs.readFileSync(continued.metadataPath, 'utf8'),
    );
    const events = fs
      .readFileSync(path.join(run.asyncDir, 'events.jsonl'), 'utf8')
      .trim()
      .split('\n');
    expect(first.index).toBe(0);
    expect(continued.index).toBe(1);
    expect(firstMetadata.usage).toEqual({
      input: 4,
      output: 2,
      cacheRead: 1,
      cacheWrite: 0,
      cost: 0.1,
    });
    expect(continuedMetadata.usage).toEqual({
      input: 6,
      output: 3,
      cacheRead: 2,
      cacheWrite: 1,
      cost: 0.2,
    });
    expect(firstMetadata.usage.input + continuedMetadata.usage.input).toBe(10);
    expect(events).toHaveLength(2);
  });

  it('does not fabricate a cost when the assistant usage is unpriced', () => {
    const writer = new AtelierMetadataWriter({
      appendEntry,
      getCurrentOwner: () => currentOwner,
    });
    const run = writer.createRun({ taskId: 'task-a', owner, cwd: directory })!;
    const step = run.beginStep({ agent: 'explorer', startedAt: 100 });

    run.recordAssistantMessage(
      step.index,
      'explorer',
      {
        role: 'assistant',
        timestamp: 120,
        usage: { input: 12, output: 7, cacheRead: 3, cacheWrite: 2 },
      },
      125,
    );

    const metadata = JSON.parse(fs.readFileSync(step.metadataPath, 'utf8'));
    expect(metadata.usage).toEqual({
      input: 12,
      output: 7,
      cacheRead: 3,
      cacheWrite: 2,
    });
    const event = JSON.parse(
      fs.readFileSync(path.join(run.asyncDir, 'events.jsonl'), 'utf8'),
    );
    expect(event.message.usage).toEqual({
      input: 12,
      output: 7,
      cacheRead: 3,
      cacheWrite: 2,
    });
  });

  it('keeps late artifacts with their original owner and gives a replacement session a fresh run and step zero', () => {
    const writer = new AtelierMetadataWriter({
      appendEntry,
      getCurrentOwner: () => currentOwner,
    });
    const original = writer.createRun({
      taskId: 'task-a',
      owner,
      cwd: directory,
    })!;
    const oldStep = original.beginStep({ agent: 'explorer', startedAt: 100 });

    const referencesBeforeReplacement = appendEntry.mock.calls.length;
    currentOwner = {
      sessionId: 'root-session-b',
      sessionFile: path.join(directory, 'replacement.jsonl'),
    };
    original.recordAssistantMessage(
      oldStep.index,
      'explorer',
      {
        role: 'assistant',
        timestamp: 120,
        usage: {
          input: 9,
          output: 4,
          cacheRead: 2,
          cacheWrite: 1,
          cost: { total: 0.3 },
        },
      },
      125,
    );
    original.finishStep(oldStep.index, 'completed');

    const replacement = writer.createRun({
      taskId: 'task-a',
      owner: currentOwner,
      cwd: directory,
    })!;
    const newStep = replacement.beginStep({
      agent: 'explorer',
      startedAt: 200,
    });
    replacement.recordAssistantMessage(
      newStep.index,
      'explorer',
      {
        role: 'assistant',
        timestamp: 220,
        usage: {
          input: 2,
          output: 1,
          cacheRead: 0,
          cacheWrite: 0,
          cost: { total: 0.05 },
        },
      },
      225,
    );

    const oldStatus = JSON.parse(
      fs.readFileSync(path.join(original.asyncDir, 'status.json'), 'utf8'),
    );
    const newStatus = JSON.parse(
      fs.readFileSync(path.join(replacement.asyncDir, 'status.json'), 'utf8'),
    );
    const newMetadata = JSON.parse(
      fs.readFileSync(newStep.metadataPath, 'utf8'),
    );
    expect(original.runId).not.toBe(replacement.runId);
    expect(newStep.index).toBe(0);
    expect(oldStatus.sessionId).toBe(owner.sessionId);
    expect(newStatus.sessionId).toBe('root-session-b');
    expect(newMetadata.usage).toEqual({
      input: 2,
      output: 1,
      cacheRead: 0,
      cacheWrite: 0,
      cost: 0.05,
    });
    const replacementReferences = appendEntry.mock.calls.slice(
      referencesBeforeReplacement,
    );
    expect(
      replacementReferences.some(
        ([type, data]) =>
          type === 'pi-atelier:subagent-metadata' &&
          data.runIds.includes(original.runId),
      ),
    ).toBe(false);
    expect(
      replacementReferences.some(
        ([type, data]) =>
          type === 'pi-atelier:subagent-metadata' &&
          data.runIds.includes(replacement.runId),
      ),
    ).toBe(true);
  });

  it('swallows artifact storage failures so subagent execution can continue', () => {
    const blockedRoot = path.join(directory, 'not-a-directory');
    fs.writeFileSync(blockedRoot, 'file blocks directory creation');
    const writer = new AtelierMetadataWriter({
      appendEntry,
      getCurrentOwner: () => currentOwner,
      artifactRoot: blockedRoot,
    });
    const run = writer.createRun({ taskId: 'task-a', owner, cwd: directory })!;

    expect(() => {
      const step = run.beginStep({ agent: 'explorer', startedAt: 100 });
      run.recordAssistantMessage(
        step.index,
        'explorer',
        {
          role: 'assistant',
          timestamp: 120,
          usage: {
            input: 1,
            output: 1,
            cacheRead: 0,
            cacheWrite: 0,
            cost: { total: 0.01 },
          },
        },
        125,
      );
      run.finishStep(step.index, 'failed', { exitCode: 1 });
      run.setState('failed');
    }).not.toThrow();
    expect(appendEntry).not.toHaveBeenCalled();
  });

  it('exports only per-attempt usage across same-owner and replacement-owner continuations', async () => {
    let callIndex = 0;
    const sessionFile = path.join(directory, 'child-session.jsonl');
    fs.writeFileSync(sessionFile, '{"type":"session"}\n');
    const runner: SubagentRunner = async ({ onActivity }) => {
      const attempt = callIndex++;
      const input = [4, 6, 2][attempt]!;
      const cost = [0.1, 0.2, 0.05][attempt]!;
      const metrics = {
        contextTokens: 100 + attempt,
        contextWindow: 1000,
        contextPercent: 10,
        toolUses: 2 + attempt,
        turns: 1,
        compactions: attempt === 1 ? 1 : 0,
      };
      onActivity?.({
        message: 'assistant accounting',
        runtime_metrics: metrics,
        assistant_message: {
          role: 'assistant',
          timestamp: 100 + attempt,
          usage: {
            input,
            output: 2,
            cacheRead: 1,
            cacheWrite: 0,
            cost: { total: cost },
          },
        },
        observed_at: 200 + attempt,
      });
      return {
        result: 'done',
        model: 'mock/model',
        nested_session_path: sessionFile,
        usage: {
          input: [4, 10, 12][attempt]!,
          output: 6,
          cacheRead: 3,
          cacheWrite: 0,
          cost: 0.35,
          contextTokens: 100,
          turns: 1,
        },
        runtime_metrics: metrics,
      };
    };
    const fixture = await createManagerFixture(directory, runner);
    try {
      const first = await fixture.manager.run(
        { agent: 'analyst', task: 'delegate', mode: 'task' },
        fixture.context(),
      );
      const taskId = first.task_ids[0]!;
      expect(fixture.manager.getTask(taskId)?.usage?.input).toBe(4);
      expect(fixture.manager.getTask(taskId)?.runtime_metrics).toMatchObject({
        turns: 1,
        compactions: 0,
      });

      await fixture.manager.continueTask(
        { task_id: taskId, prompt: 'continue in same root' },
        fixture.context(),
      );
      expect(fixture.manager.getTask(taskId)?.usage?.input).toBe(10);
      expect(fixture.manager.getTask(taskId)?.runtime_metrics).toMatchObject({
        turns: 2,
        compactions: 1,
      });

      const oldRunId = fixture.references.at(-1)?.data.runIds[0];
      const oldAsyncDir = fixture.references.at(-1)?.data.asyncDirs[0];
      const rootAStatus = JSON.parse(
        fs.readFileSync(path.join(oldAsyncDir!, 'status.json'), 'utf8'),
      );
      expect(rootAStatus.steps.map((step: any) => step.status)).toEqual([
        'completed',
        'completed',
      ]);
      expect(
        rootAStatus.steps.map(
          (_step: any, index: number) =>
            JSON.parse(
              fs.readFileSync(
                path.join(
                  oldAsyncDir!,
                  `${oldRunId}_analyst_${index}_meta.json`,
                ),
                'utf8',
              ),
            ).usage.input,
        ),
      ).toEqual([4, 6]);

      fixture.setOwner({
        sessionId: 'root-session-b',
        sessionFile: path.join(directory, 'replacement.jsonl'),
      });
      const referencesBeforeReplacement = fixture.references.length;
      await fixture.manager.continueTask(
        { task_id: taskId, prompt: 'continue in replacement root' },
        fixture.context(),
      );

      const replacementReference = fixture.references
        .slice(referencesBeforeReplacement)
        .at(-1)?.data;
      expect(replacementReference?.runIds).toHaveLength(1);
      expect(replacementReference?.runIds[0]).not.toBe(oldRunId);
      expect(replacementReference?.runIds).not.toContain(oldRunId);
      const replacementStatus = JSON.parse(
        fs.readFileSync(
          path.join(replacementReference!.asyncDirs[0]!, 'status.json'),
          'utf8',
        ),
      );
      const replacementMetadata = JSON.parse(
        fs.readFileSync(replacementReference!.paths[0]!, 'utf8'),
      );
      expect(replacementStatus).toMatchObject({
        sessionId: 'root-session-b',
        steps: [{ status: 'completed', startedAt: expect.any(Number) }],
      });
      expect(replacementMetadata.usage).toMatchObject({
        input: 2,
        output: 2,
        cost: 0.05,
      });
      expect(fixture.manager.getTask(taskId)?.usage?.input).toBe(12);
      expect(fixture.manager.getTask(taskId)?.runtime_metrics).toMatchObject({
        turns: 3,
        compactions: 1,
      });
    } finally {
      await fixture.manager.close();
      fixture.restore();
    }
  });

  it('finishes Atelier status and usage on child failure and cancellation', async () => {
    const failingRunner: SubagentRunner = async ({ onActivity }) => {
      onActivity?.({
        message: 'assistant accounting',
        assistant_message: {
          role: 'assistant',
          timestamp: 300,
          usage: {
            input: 7,
            output: 3,
            cacheRead: 1,
            cacheWrite: 0,
            cost: { total: 0.2 },
          },
        },
        observed_at: 301,
      });
      throw new Error('child failed');
    };
    const failureFixture = await createManagerFixture(directory, failingRunner);
    try {
      const failed = await failureFixture.manager.run(
        { agent: 'analyst', task: 'fail', mode: 'task' },
        failureFixture.context(),
      );
      expect(failed.results?.[0]?.status).toBe('failed');
      const reference = failureFixture.references.at(-1)!.data;
      const status = JSON.parse(
        fs.readFileSync(
          path.join(reference.asyncDirs[0]!, 'status.json'),
          'utf8',
        ),
      );
      const metadata = JSON.parse(fs.readFileSync(reference.paths[0]!, 'utf8'));
      expect(status).toMatchObject({
        state: 'failed',
        steps: [{ status: 'failed' }],
      });
      expect(metadata.usage).toMatchObject({ input: 7, output: 3, cost: 0.2 });
    } finally {
      await failureFixture.manager.close();
      failureFixture.restore();
    }

    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const cancelledRunner: SubagentRunner = async ({ signal, onActivity }) => {
      onActivity?.({
        message: 'assistant accounting',
        assistant_message: {
          role: 'assistant',
          timestamp: 400,
          usage: { input: 5, output: 2, cacheRead: 0, cacheWrite: 1 },
        },
        observed_at: 401,
      });
      markStarted();
      await new Promise<never>((_resolve, reject) =>
        signal.addEventListener('abort', () => reject(new Error('aborted')), {
          once: true,
        }),
      );
      return { result: 'unreachable' };
    };
    const cancellationFixture = await createManagerFixture(
      directory,
      cancelledRunner,
    );
    try {
      const launched = await cancellationFixture.manager.run(
        { agent: 'analyst', task: 'cancel', mode: 'background' },
        cancellationFixture.context(),
      );
      const taskId = launched.task_ids[0]!;
      await started;
      cancellationFixture.manager.cancel(taskId, 'cancelled');
      await cancellationFixture.manager.close();
      const reference = cancellationFixture.references.at(-1)!.data;
      const status = JSON.parse(
        fs.readFileSync(
          path.join(reference.asyncDirs[0]!, 'status.json'),
          'utf8',
        ),
      );
      const metadata = JSON.parse(fs.readFileSync(reference.paths[0]!, 'utf8'));
      expect(cancellationFixture.manager.getTask(taskId)?.status).toBe(
        'cancelled',
      );
      expect(status).toMatchObject({
        state: 'cancelled',
        steps: [{ status: 'cancelled' }],
      });
      expect(metadata.usage).toEqual({
        input: 5,
        output: 2,
        cacheRead: 0,
        cacheWrite: 1,
      });
    } finally {
      await cancellationFixture.manager.close();
      cancellationFixture.restore();
    }
  });
});

async function createManagerFixture(
  directory: string,
  runner: SubagentRunner,
): Promise<{
  manager: SubagentManager;
  references: Array<{
    customType: string;
    data: { runIds: string[]; paths: string[]; asyncDirs: string[] };
  }>;
  context(): any;
  setOwner(owner: { sessionId: string; sessionFile: string }): void;
  restore(): void;
}> {
  const oldHistoryPath = process.env.PI_SUBAGENTS_HISTORY_DB_PATH;
  const oldAgentDir = process.env.PI_CODING_AGENT_DIR;
  const cwd = fs.mkdtempSync(path.join(directory, 'manager-'));
  const artifactRoot = path.join(cwd, 'artifacts');
  fs.mkdirSync(path.join(cwd, '.pi', 'subagents'), { recursive: true });
  fs.writeFileSync(
    path.join(cwd, '.pi', 'subagents', 'analyst.md'),
    '---\nname: analyst\ndescription: analyst agent\ntools:\n  - read\n---\n# Agent\n',
  );
  fs.writeFileSync(
    path.join(cwd, '.pi', 'subagents.json'),
    JSON.stringify({ enable_continue: true }),
  );
  process.env.PI_SUBAGENTS_HISTORY_DB_PATH = path.join(cwd, 'history.sqlite');
  process.env.PI_CODING_AGENT_DIR = path.join(cwd, 'agent-home');
  let owner = {
    sessionId: 'root-session-a',
    sessionFile: path.join(cwd, 'root-session-a.jsonl'),
  };
  const references: Array<{
    customType: string;
    data: { runIds: string[]; paths: string[]; asyncDirs: string[] };
  }> = [];
  const appendEntry: NonNullable<
    AtelierMetadataWriterOptions['appendEntry']
  > = (customType, data) => {
    references.push({ customType, data });
  };
  const metadataWriter = new AtelierMetadataWriter({
    appendEntry,
    artifactRoot,
    getCurrentOwner: () => owner,
  });
  const manager = new SubagentManager(
    runner,
    undefined,
    undefined,
    undefined,
    metadataWriter,
  );
  fs.writeFileSync(owner.sessionFile, '{"type":"session"}\n');
  return {
    manager,
    references,
    context: () => ({
      cwd,
      sessionManager: {
        getSessionId: () => owner.sessionId,
        getSessionFile: () => owner.sessionFile,
      },
    }),
    setOwner: (nextOwner) => {
      owner = nextOwner;
      fs.writeFileSync(owner.sessionFile, '{"type":"session"}\n');
    },
    restore: () => {
      if (oldHistoryPath === undefined)
        delete process.env.PI_SUBAGENTS_HISTORY_DB_PATH;
      else process.env.PI_SUBAGENTS_HISTORY_DB_PATH = oldHistoryPath;
      if (oldAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = oldAgentDir;
    },
  };
}
