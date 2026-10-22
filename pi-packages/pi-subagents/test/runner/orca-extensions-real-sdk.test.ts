import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  DefaultResourceLoader,
  ModelRuntime,
  SettingsManager,
} from '@earendil-works/pi-coding-agent';
import { afterEach, expect, it, vi } from 'vitest';
import { sdkSubagentRunner } from '../../src/runner/sdk-runner.js';
import { fixtureProvider } from './fixtures/provider-fixture.js';

const { loaderOptions } = vi.hoisted(() => ({ loaderOptions: [] as any[] }));
vi.mock('@earendil-works/pi-coding-agent', async (importOriginal) => {
  const sdk =
    await importOriginal<typeof import('@earendil-works/pi-coding-agent')>();
  return {
    ...sdk,
    DefaultResourceLoader: class extends sdk.DefaultResourceLoader {
      constructor(options: any) {
        super(options);
        loaderOptions.push(options);
      }
    },
  };
});

afterEach(() => {
  vi.unstubAllEnvs();
  delete (globalThis as any).__piSubagentsOrcaRegression;
  loaderOptions.length = 0;
});

it.each([
  'full',
  'lean',
] as const)('%s children skip Orca factories before loading but keep normal factories and root extensions', async (mode) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-orca-sdk-'));
  const cwd = path.join(root, 'project');
  const agentDir = path.join(root, 'agent');
  const write = (file: string, content: string) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
    return file;
  };
  fs.mkdirSync(cwd);
  const managed = write(
    path.join(agentDir, 'extensions', 'renamed.ts'),
    '// @orca-managed-pi-extension\nexport default () => { globalThis.__piSubagentsOrcaRegression.managed++; };',
  );
  const normal = write(
    path.join(agentDir, 'extensions', 'normal.ts'),
    'export default () => { globalThis.__piSubagentsOrcaRegression.normal++; };',
  );
  write(path.join(cwd, 'AGENTS.md'), 'FULL_CONTEXT_SENTINEL');
  vi.stubEnv('PI_CODING_AGENT_DIR', agentDir);
  vi.stubEnv('PI_SUBAGENTS_HISTORY_HOME', path.join(root, 'history'));
  const flags = { managed: 0, normal: 0 };
  (globalThis as any).__piSubagentsOrcaRegression = flags;
  const settingsManager = SettingsManager.create(cwd, agentDir);
  const runtime = await ModelRuntime.create({
    modelsPath: null,
    authPath: path.join(agentDir, 'auth.json'),
    allowModelNetwork: false,
  });
  runtime.registerProvider('orca-fixture', fixtureProvider('done'));
  await runtime.refresh({ allowNetwork: false });
  try {
    const parentLoader = new DefaultResourceLoader({
      cwd,
      agentDir,
      settingsManager,
    });
    await parentLoader.reload();
    expect(parentLoader.getExtensions().errors).toEqual([]);
    expect(flags).toEqual({ managed: 1, normal: 1 });
    loaderOptions.length = 0;

    const result = await sdkSubagentRunner({
      definition: {
        name: 'specialist',
        description: 'test',
        filePath: '',
        instructions: 'Reply done',
        tools: ['read'],
        model: { provider: 'orca-fixture', id: 'fixture' },
      },
      task: 'Reply done',
      cwd,
      ctx: { cwd, settingsManager, modelRuntime: runtime },
      config: {
        default_tools: ['read'],
        timeout_ms: 10000,
        stall_timeout_ms: 10000,
        max_concurrency: 1,
        session_resources: mode,
        enable_ask_orchestrator: false,
        enable_notify_orchestrator: false,
      },
      signal: new AbortController().signal,
    });
    expect(result.result).toBe('done');
    expect(flags).toEqual({ managed: 1, normal: 2 });
    expect(loaderOptions).toHaveLength(1);
    // noExtensions bypasses discovered paths; only the explicit clean set loads.
    expect(loaderOptions[0].noExtensions).toBe(true);
    expect(loaderOptions[0].additionalExtensionPaths).toEqual([normal]);
    expect(loaderOptions[0].additionalExtensionPaths).not.toContain(managed);
    expect(result.system_prompt?.includes('FULL_CONTEXT_SENTINEL')).toBe(
      mode === 'full',
    );
    expect(
      parentLoader.getExtensions().extensions.map((e) => e.path),
    ).toContain(managed);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
