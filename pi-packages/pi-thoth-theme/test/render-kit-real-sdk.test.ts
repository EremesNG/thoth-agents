import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AssistantMessage } from '@earendil-works/pi-ai';
import {
  AgentSession,
  createAgentSession,
  DefaultResourceLoader,
  type ExtensionUIContext,
  initTheme,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  ToolExecutionComponent,
  VERSION,
} from '@earendil-works/pi-coding-agent';
import { stripTerminalSequences, type TUI } from '@earendil-works/pi-tui';
import { getRenderKit } from '@thoth-agents/pi-core';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { sdkSubagentRunner } from '../../pi-subagents/src/runner/sdk-runner.js';

const themePackage = fileURLToPath(new URL('..', import.meta.url));
const producerPath = fileURLToPath(
  new URL('./fixtures/render-kit-producer.ts', import.meta.url),
);
let root: string;
let cwd: string;
let agentDir: string;
let producerPackage: string;
let modelRuntime: ModelRuntime;
const sessions: AgentSession[] = [];
const errors: unknown[] = [];

beforeAll(() => initTheme('dark', false));
beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'pi-thoth-theme-real-sdk-'));
  cwd = join(root, 'workspace');
  agentDir = join(root, 'agent');
  mkdirSync(cwd);
  mkdirSync(agentDir);
  producerPackage = join(root, 'producer');
  mkdirSync(producerPackage);
  writeFileSync(
    join(producerPackage, 'package.json'),
    JSON.stringify({
      name: '@thoth-agents/kit-probe',
      pi: { extensions: ['./index.ts'] },
    }),
  );
  writeFileSync(
    join(producerPackage, 'index.ts'),
    `export { default } from ${JSON.stringify(producerPath)};\n`,
  );
  vi.stubEnv('PI_CODING_AGENT_DIR', agentDir);
  vi.stubEnv('PI_SUBAGENTS_HISTORY_HOME', join(root, 'history'));
  writeFileSync(
    join(agentDir, 'pi-thoth-theme.json'),
    JSON.stringify({
      tools: { enabled: true },
      statusLine: { enabled: false },
      welcome: { enabled: false },
    }),
  );
  modelRuntime = await ModelRuntime.create({
    modelsPath: null,
    authPath: join(agentDir, 'auth.json'),
    allowModelNetwork: false,
  });
});

afterEach(async () => {
  try {
    for (const session of sessions.reverse()) {
      await session.extensionRunner.emit({
        type: 'session_shutdown',
        reason: 'quit',
      });
      await session.dispose();
    }
    expect(errors).toEqual([]);
  } finally {
    sessions.length = 0;
    errors.length = 0;
    vi.restoreAllMocks();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  }
});

async function loadSession(order = 'theme first', hasUI = true) {
  const packages =
    order === 'theme first'
      ? [themePackage, producerPackage]
      : [producerPackage, themePackage];
  const settingsManager = SettingsManager.inMemory({ packages });
  const resourceLoader = new DefaultResourceLoader({
    cwd,
    agentDir,
    settingsManager,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
  });
  await resourceLoader.reload();
  expect(resourceLoader.getExtensions().errors).toEqual([]);
  const { session } = await createAgentSession({
    cwd,
    agentDir,
    modelRuntime,
    resourceLoader,
    settingsManager,
    sessionManager: SessionManager.inMemory(cwd),
  });
  sessions.push(session);
  await session.bindExtensions({
    ...(hasUI
      ? { uiContext: {} as ExtensionUIContext, mode: 'tui' as const }
      : {}),
    onError: (error) => errors.push(error),
  });
  expect(session.extensionRunner.hasUI()).toBe(hasUI);
  return session;
}

function toolComponent(session: AgentSession, name = 'kit_probe') {
  const runner = session.extensionRunner;
  const definition = runner.getToolDefinition(name);
  const renderers = runner.resolveToolRenderers(name, () => definition);
  expect(renderers?.renderShell).toBe('self');
  const requestRender = vi.fn();
  const component = new ToolExecutionComponent(
    name,
    `real-sdk-${name}`,
    name === 'bash' ? { command: 'sleep 10' } : {},
    {},
    renderers,
    { requestRender } as unknown as TUI,
    cwd,
  );
  return { component, requestRender };
}

const text = (component: ToolExecutionComponent) =>
  component.render(64).map(stripTerminalSequences).join('\n');

describe('render kit through Pi SDK 1.0.2', () => {
  it.each([
    'theme first',
    'producer first',
  ])('discovers at render time with %s and leaves package-owned self shells untouched', async (order) => {
    expect(VERSION).toBe('1.0.2');
    const session = await loadSession(order);
    const themeExtension = join(themePackage, 'src', 'index.ts');
    const producerExtension = join(producerPackage, 'index.ts');
    expect(session.extensionRunner.getExtensionPaths()).toEqual(
      order === 'theme first'
        ? [themeExtension, producerExtension]
        : [producerExtension, themeExtension],
    );
    expect(getRenderKit()?.version).toBe(1);
    expect(
      session.getAllTools().find((tool) => tool.name === 'kit_probe')
        ?.sourceInfo?.baseDir,
    ).toBe(producerPackage);
    const { component } = toolComponent(session);
    const themed = text(component);
    expect(themed).toContain('Probe');
    expect(themed).toContain('kit active');
    expect(themed.match(/╭/g)).toHaveLength(1);
    await session.extensionRunner.emit({
      type: 'session_shutdown',
      reason: 'quit',
    });
    component.invalidate();
    expect(text(component)).toContain('native fallback');
    expect(text(component)).not.toContain('╭');
  }, 30_000);

  it('replaces the kit on native reload and removes it when styling is disabled on reload', async () => {
    const session = await loadSession();
    const original = getRenderKit();
    await session.reload();
    expect(getRenderKit()).toBeDefined();
    expect(getRenderKit()).not.toBe(original);
    expect(text(toolComponent(session).component)).toContain('kit active');
    writeFileSync(
      join(agentDir, 'pi-thoth-theme.json'),
      JSON.stringify({
        tools: { enabled: false },
        statusLine: { enabled: false },
        welcome: { enabled: false },
      }),
    );
    await session.reload();
    expect(getRenderKit()).toBeUndefined();
    expect(text(toolComponent(session).component)).toContain('native fallback');
  }, 30_000);

  it('publishes nothing for a standalone headless SDK session, including reload', async () => {
    const session = await loadSession('theme first', false);
    expect(getRenderKit()).toBeUndefined();
    await session.extensionRunner.emit({ type: 'agent_end', messages: [] });
    await session.reload();
    expect(getRenderKit()).toBeUndefined();
    await session.extensionRunner.emit({
      type: 'session_shutdown',
      reason: 'quit',
    });
    expect(getRenderKit()).toBeUndefined();
  }, 30_000);

  it.each([
    ['default lean', undefined],
    ['theme-passthrough lean', ['@thoth-agents/pi-thoth-theme']],
  ] as const)(
    'preserves the parent kit and ticker across a real %s child start/end/shutdown',
    async (_kind, passthrough) => {
      const parent = await loadSession();
      const kit = getRenderKit();
      expect(kit).toBeDefined();
      vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
      const { component, requestRender } = toolComponent(parent, 'bash');
      component.markExecutionStarted();
      expect(text(component)).toContain('running… · 0s');
      requestRender.mockClear();
      let childPrompts = 0;
      const prompt = vi
        .spyOn(AgentSession.prototype, 'prompt')
        .mockImplementation(async function (this: AgentSession) {
          childPrompts++;
          expect(this.extensionRunner.hasUI()).toBe(false);
          expect(this.extensionRunner.hasHandlers('session_start')).toBe(
            Boolean(passthrough),
          );
          // The child runner has already dispatched its (filtered) startup event.
          expect(getRenderKit()).toBe(kit);
          vi.advanceTimersByTime(1000);
          expect(requestRender).toHaveBeenCalledTimes(1);
          requestRender.mockClear();
          const message = {
            role: 'assistant',
            content: [{ type: 'text', text: 'done' }],
          } as AssistantMessage;
          this.agent.state.messages.push(message);
          await this.extensionRunner.emit({
            type: 'agent_end',
            messages: [message],
          });
          expect(getRenderKit()).toBe(kit);
          vi.advanceTimersByTime(1000);
          expect(requestRender).toHaveBeenCalledTimes(1);
          requestRender.mockClear();
        });
      try {
        await sdkSubagentRunner({
          definition: {
            name: 'kit-child',
            description: 'Offline kit lifecycle check',
            filePath: join(cwd, 'kit-child.md'),
            instructions: 'No network; check the headless lifecycle.',
            tools: ['read'],
          },
          task: 'check kit lifecycle',
          taskId: 'kit-child',
          cwd,
          ctx: {
            modelRuntime,
            settingsManager: parent.settingsManager,
            pi: {
              getActiveTools: () => ['read'],
              getAllTools: () => parent.getAllTools(),
            },
          },
          config: {
            timeout_ms: 10_000,
            stall_timeout_ms: 10_000,
            max_concurrency: 1,
            default_tools: ['read'],
            model_profiles: {},
            session_resources: 'lean',
            enable_ask_orchestrator: false,
            ...(passthrough ? { lifecycle_passthrough: [...passthrough] } : {}),
          },
          signal: new AbortController().signal,
          onActivity: (activity) => {
            if (activity.diagnostic) errors.push(activity.message);
          },
        });
      } finally {
        prompt.mockRestore();
      }
      expect(childPrompts).toBe(1);
      // Runner teardown has emitted the child's real shutdown callbacks.
      expect(getRenderKit()).toBe(kit);
      vi.advanceTimersByTime(1000);
      expect(requestRender).toHaveBeenCalledTimes(1);
      expect(text(component)).toContain('running… · 3s');
      await parent.extensionRunner.emit({ type: 'agent_end', messages: [] });
      requestRender.mockClear();
      vi.advanceTimersByTime(1000);
      expect(requestRender).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
      expect(getRenderKit()).toBe(kit);
      await parent.extensionRunner.emit({
        type: 'session_shutdown',
        reason: 'quit',
      });
      expect(getRenderKit()).toBeUndefined();
    },
    30_000,
  );
});
