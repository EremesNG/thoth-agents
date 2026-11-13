import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRegistry,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from '@earendil-works/pi-coding-agent';
import { expect, test, vi } from 'vitest';
import { sdkSubagentRunner } from '../../pi-subagents/src/runner/sdk-runner.js';

const key = Symbol.for('thoth-agents.pi-junie-bridge.registration.v1');
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

test('default lean SDK child keeps Junie workspace and closes its MCP endpoint and Windows descendants', async () => {
  const root = mkdtempSync(join(tmpdir(), 'junie-child-'));
  const cwd = join(root, 'child');
  const agentDir = join(root, 'agent');
  mkdirSync(cwd);
  mkdirSync(join(agentDir, 'junie-bridge'), { recursive: true });
  writeFileSync(
    join(agentDir, 'junie-bridge/models.json'),
    JSON.stringify({
      version: 4,
      models: [{ id: 'mix.auto', value: 'mix.auto', name: 'Auto' }],
      efforts: [],
    }),
  );
  const fake = fileURLToPath(
    new URL('./fixtures/fake-junie.cjs', import.meta.url),
  );
  const extension = fileURLToPath(new URL('../dist/index.ts', import.meta.url));
  const shim = join(root, process.platform === 'win32' ? 'junie.bat' : 'junie');
  writeFileSync(
    shim,
    process.platform === 'win32'
      ? `@echo off\r\n"${process.execPath}" "${fake}" %*\r\n`
      : `#!/bin/sh\nexec "${process.execPath}" "${fake}" "$@"\n`,
  );
  chmodSync(shim, 0o755);
  const transcript = join(root, 'wire.jsonl');
  vi.stubEnv('PI_CODING_AGENT_DIR', agentDir);
  vi.stubEnv('PI_SUBAGENTS_HISTORY_HOME', join(root, 'history'));
  vi.stubEnv('JUNIE_BRIDGE_LAUNCHER', shim);
  vi.stubEnv('FAKE_TRANSCRIPT', transcript);
  vi.stubEnv('FAKE_STREAM', '1');
  vi.stubEnv('FAKE_MCP', '1');
  // Descendant containment is a Windows Job Object contract, not a POSIX guarantee.
  if (process.platform === 'win32') vi.stubEnv('FAKE_DESCENDANT', '1');
  Reflect.deleteProperty(globalThis, key);
  let parent: Awaited<ReturnType<typeof createAgentSession>> | undefined;
  try {
    const settingsManager = SettingsManager.inMemory({
      extensions: [extension],
      retry: { enabled: false },
    });
    const loader = new DefaultResourceLoader({
      cwd: root,
      agentDir,
      settingsManager,
      noExtensions: true,
      additionalExtensionPaths: [extension],
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
    });
    await loader.reload();
    expect(loader.getExtensions().errors).toEqual([]);
    const runtime = await ModelRuntime.create({
      modelsPath: null,
      authPath: join(agentDir, 'auth.json'),
      allowModelNetwork: false,
    });
    parent = await createAgentSession({
      cwd: root,
      agentDir,
      settingsManager,
      modelRuntime: runtime,
      resourceLoader: loader,
      tools: [],
      sessionManager: SessionManager.inMemory(root),
    });
    await parent.session.extensionRunner?.emit({
      type: 'session_start',
      reason: 'startup',
    });
    const modelRegistry = new ModelRegistry(runtime);
    await modelRegistry.refresh({ allowNetwork: false });
    const result = await sdkSubagentRunner({
      definition: {
        name: 'junie-child',
        description: 'Junie lifecycle regression',
        filePath: '',
        instructions: 'Read the file and reply.',
        tools: ['read'],
        model: { provider: 'junie', id: 'mix.auto' },
      },
      task: 'Read a file.',
      cwd,
      ctx: { modelRegistry, settingsManager },
      config: {
        default_tools: ['read'],
        timeout_ms: 15000,
        stall_timeout_ms: 15000,
        max_concurrency: 1,
        session_resources: 'lean',
        enable_ask_orchestrator: false,
        enable_notify_orchestrator: false,
      },
      signal: new AbortController().signal,
    });
    expect(result.result).toContain('Tool results received in same turn');
    const wire = readFileSync(transcript, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    const session = wire.find((frame) => frame.method === 'session/new');
    const mcp = session.params.mcpServers.find(
      (server: any) => server.name === 'pi',
    );
    // A real Pi tool result proves the authenticated endpoint was live during the turn.
    expect(wire.some((frame) => frame.method === 'fixture/mcp_result')).toBe(
      true,
    );
    const endpoint = fetch(mcp.url, {
      method: 'POST',
      signal: AbortSignal.timeout(2000),
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        ...Object.fromEntries(mcp.headers.map((h: any) => [h.name, h.value])),
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 99,
        method: 'tools/list',
        params: {},
      }),
    });
    await expect(endpoint).rejects.toMatchObject({
      cause: { code: 'ECONNREFUSED' },
    });
    if (process.platform === 'win32') {
      const descendant = wire.find(
        (frame) => frame.method === 'fixture/descendant',
      ).params;
      await expect
        .poll(() => alive(descendant.pid), { timeout: 5000 })
        .toBe(false);
      expect(alive(descendant.leader)).toBe(false);
    }
    expect(session.params.cwd).toBe(cwd);
  } finally {
    // Also reconcile processes/endpoints when the pre-fix regression fails.
    await (globalThis as any)[key]?.provider.close();
    parent?.session.dispose();
    Reflect.deleteProperty(globalThis, key);
    vi.unstubAllEnvs();
    rmSync(root, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    });
  }
}, 30000);
