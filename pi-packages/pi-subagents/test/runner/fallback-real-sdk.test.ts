import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRegistry,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from '@earendil-works/pi-coding-agent';
import { afterEach, expect, it, vi } from 'vitest';
import { SubagentHistoryStore } from '../../src/history.js';
import { SubagentManager } from '../../src/manager.js';

const providerExtension = fileURLToPath(
  new URL('./fixtures/fallback-provider.ts', import.meta.url),
);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

it('reopens the same persisted session on the fallback model after a mid-turn provider failure', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-subagents-fallback-'));
  const agentDir = path.join(root, 'agent');
  const cwd = path.join(root, 'workspace');
  fs.mkdirSync(agentDir, { recursive: true });
  fs.mkdirSync(path.join(cwd, '.pi', 'subagents'), { recursive: true });
  fs.writeFileSync(path.join(cwd, 'notes.txt'), 'NOTES-CONTENT-123\n');
  fs.writeFileSync(
    path.join(cwd, '.pi', 'subagents', 'worker.md'),
    [
      '---',
      'name: worker',
      'description: fallback worker',
      'model: fallback-fixture/one',
      'fallback_models:',
      '  - fallback-fixture/two',
      'tools:',
      '  - read',
      '---',
      'You are a worker.',
    ].join('\n'),
  );
  fs.writeFileSync(
    path.join(cwd, '.pi', 'subagents.json'),
    JSON.stringify({
      enable_ask_orchestrator: false,
      enable_notify_orchestrator: false,
      stall_timeout_ms: 20_000,
      timeout_ms: 60_000,
    }),
  );
  const traceFile = path.join(root, 'trace.jsonl');
  fs.writeFileSync(traceFile, '');
  vi.stubEnv('PI_CODING_AGENT_DIR', agentDir);
  vi.stubEnv('PI_SUBAGENTS_HISTORY_DB_PATH', path.join(root, 'history.sqlite'));
  vi.stubEnv('PI_SUBAGENTS_FALLBACK_TRACE', traceFile);

  const settingsManager = SettingsManager.inMemory({
    extensions: [providerExtension],
    retry: { enabled: false },
  });
  const loader = new DefaultResourceLoader({
    cwd,
    agentDir,
    settingsManager,
    noExtensions: true,
    additionalExtensionPaths: [providerExtension],
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
  });
  await loader.reload();
  const modelRuntime = await ModelRuntime.create({
    modelsPath: null,
    authPath: path.join(agentDir, 'auth.json'),
  });
  const parent = await createAgentSession({
    cwd,
    agentDir,
    settingsManager,
    modelRuntime,
    resourceLoader: loader,
    tools: [],
    sessionManager: SessionManager.inMemory(cwd),
  });
  const modelRegistry = new ModelRegistry(modelRuntime);
  await modelRegistry.refresh({ allowNetwork: false });
  const history = new SubagentHistoryStore();
  const manager = new SubagentManager(undefined, history);
  try {
    const run = await manager.run(
      { agent: 'worker', task: 'Summarize notes.txt', mode: 'task' },
      {
        cwd,
        modelRegistry,
        settingsManager,
        pi: { getActiveTools: () => ['read'], getAllTools: () => ['read'] },
      },
    );
    const task = run.results![0];
    expect(task.error).toBeUndefined();
    expect(task.status).toBe('completed');
    expect(task.result).toBe('finished on two');
    expect(task).toMatchObject({
      model: 'fallback-fixture/two',
      model_source: 'fallback',
      fallback_used: true,
      attempt: 2,
    });
    expect(task.fallback_attempts).toEqual([
      expect.objectContaining({
        attempt: 1,
        model: 'fallback-fixture/one',
        category: 'provider_api_error',
      }),
    ]);

    // One history row per model attempt, both on the same session file.
    const attempts = history.listTaskAttempts(cwd, task.id);
    expect(attempts.map((a) => [a.attempt, a.model, a.status])).toEqual([
      [1, 'fallback-fixture/one', 'failed'],
      [2, 'fallback-fixture/two', 'completed'],
    ]);
    expect(attempts[0].error_metadata?.category).toBe('provider_api_error');
    const sessionPath = attempts[1].nested_session_path;
    expect(sessionPath).toBeTruthy();
    expect(attempts[0].nested_session_path).toBe(sessionPath);

    // The persisted session holds turns from both models.
    const sessionText = fs.readFileSync(sessionPath!, 'utf8');
    expect(sessionText).toContain('"model":"one"');
    expect(sessionText).toContain('"model":"two"');
    expect(sessionText).toContain('NOTES-CONTENT-123');

    // The fallback model saw the earlier tool activity and the short
    // continuation, while the delegated task appears only as session history.
    const traces = fs
      .readFileSync(traceFile, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(traces.map((t) => t.event)).toEqual([
      'stream:one',
      'stream:one',
      'stream:two',
    ]);
    const contextForTwo = JSON.stringify(traces[2].payload);
    expect(contextForTwo).toContain('NOTES-CONTENT-123');
    expect(contextForTwo).toContain('call_notes');
    expect(contextForTwo).toContain('fallback-fixture/two');
    expect(contextForTwo.split('Summarize notes.txt')).toHaveLength(2);
  } finally {
    await manager.close();
    history.close();
    parent.session.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  }
}, 60_000);
