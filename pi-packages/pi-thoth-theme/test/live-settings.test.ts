import {
  type ExtensionAPI,
  type ExtensionContext,
  keyHint,
  keyText,
  SessionManager,
  type Theme,
  type ToolRenderers,
} from '@earendil-works/pi-coding-agent';
import {
  getRenderKit,
  registerRenderKit,
  withdrawRenderKit,
} from '@thoth-agents/pi-core';
import { describe, expect, it, vi } from 'vitest';
import { boxedComponent } from '../../pi-subagents/src/render/tools/components.ts';
import { renderTodoCall, renderTodoResult } from '../../pi-todo/view/format.ts';
import { registerAnimation } from '../src/animation.ts';
import { createRenderKit } from '../src/render-kit/index.ts';
import { loadConfig, type ThemeConfig } from '../src/shared/config.ts';
import {
  applyLiveSettings,
  bindLiveSettings,
} from '../src/shared/live-settings.ts';
import { createCustomBashTool } from '../src/tools/bash.ts';
import { createCodemodeRenderer } from '../src/tools/codemode.ts';
import { createCustomEditTool } from '../src/tools/edit.ts';
import { createCustomFindTool } from '../src/tools/find.ts';
import { createGenericTool } from '../src/tools/generic.ts';
import { createCustomGrepTool } from '../src/tools/grep.ts';
import { createCustomLsTool } from '../src/tools/ls.ts';
import { createCustomPowerShellTool } from '../src/tools/powershell.ts';
import { createCustomReadTool } from '../src/tools/read.ts';
import { createCustomWriteTool } from '../src/tools/write.ts';
import { fetchRecentSessions, WelcomeComponent } from '../src/welcome/index.ts';

const plainTheme = {
  fg: (_role: string, text: string) => text,
  bold: (text: string) => text,
};
const theme = plainTheme as Theme;

describe('live mounted settings', () => {
  it('keeps installed native animation live even when module flags are saved for reload', () => {
    const config = loadConfig('missing-live-settings-fixture.json');
    registerAnimation(
      { on: vi.fn(), registerCommand: vi.fn() } as unknown as ExtensionAPI,
      config,
    );
    const setWorkingIndicator = vi.fn();
    const setWorkingMessage = vi.fn();
    const requestRender = vi.fn();
    applyLiveSettings(
      config,
      {
        icons: 'ascii',
        animation: 'off',
        statusLine: { enabled: false },
        inputBox: { enabled: false },
      },
      {
        requestRender,
        context: {
          hasUI: true,
          ui: { setWorkingIndicator, setWorkingMessage },
        } as unknown as ExtensionContext,
      },
    );
    expect(setWorkingIndicator).toHaveBeenCalledWith({
      frames: ['*'],
      intervalMs: 500,
    });
    expect(setWorkingMessage).toHaveBeenCalledWith('working...');
    expect(config.statusLine.enabled).toBe(false);
    expect(requestRender).toHaveBeenCalledOnce();
  });
  it('refreshes real todo and subagents producer memos by republishing a new theme kit', () => {
    const config = loadConfig('missing-live-settings-fixture.json');
    config.animation = 'off';
    const owner = {};
    let token = registerRenderKit(
      createRenderKit(owner, undefined, config),
      owner,
    );
    bindLiveSettings(config, () => {
      withdrawRenderKit(token);
      token = registerRenderKit(
        createRenderKit(owner, undefined, config),
        owner,
      );
    });
    try {
      const context = {
        state: {},
        executionStarted: true,
        isPartial: false,
        expanded: false,
      };
      const call = renderTodoCall({ action: 'list' }, theme, context);
      const todo = renderTodoResult(
        { content: [{ type: 'text', text: 'done' }] },
        theme,
        { expanded: false },
        context,
      );
      const subagent = boxedComponent(['first line', 'second line'], {
        theme,
        title: 'subagent',
        label: 'subagent',
        expanded: false,
        status: 'completed',
        context,
      });
      const initial = [call.render(80), todo.render(80), subagent.render(80)];
      const oldKit = getRenderKit();
      applyLiveSettings(
        config,
        { icons: 'ascii', tools: { collapsed: 'line' } },
        { requestRender() {} },
      );
      expect(getRenderKit()).not.toBe(oldKit);
      for (const component of [todo, subagent]) {
        expect(component.render(80)).toHaveLength(1);
        expect(component.render(80)[0]).toMatch(/^\+ /);
      }
      applyLiveSettings(
        config,
        { icons: 'unicode', tools: { collapsed: 'compact' } },
        { requestRender() {} },
      );
      expect(subagent.render(80)).toHaveLength(2);
      expect(subagent.render(80)[0]).toMatch(/^✓ /);
      applyLiveSettings(
        config,
        { icons: 'nerd', tools: { collapsed: 'frame' } },
        { requestRender() {} },
      );
      expect([call.render(80), todo.render(80), subagent.render(80)]).toEqual(
        initial,
      );
    } finally {
      withdrawRenderKit(token);
    }
  });

  it('updates ellipses in collected welcome session titles, not just render-time truncation', async () => {
    const list = vi
      .spyOn(SessionManager, 'list')
      .mockResolvedValue([
        { name: 'a'.repeat(60), modified: new Date() },
      ] as Awaited<ReturnType<typeof SessionManager.list>>);
    try {
      const config = loadConfig('missing-live-settings-fixture.json');
      const sessions = await fetchRecentSessions('.', 4, 'nerd');
      const welcome = new WelcomeComponent(plainTheme, config, {
        version: '1.0',
        resources: {},
        providers: [],
        sessions,
      });
      expect(welcome.render(200).join('\n')).toContain(`${'a'.repeat(44)}…`);
      applyLiveSettings(config, { icons: 'ascii' }, { requestRender() {} });
      expect(welcome.render(200).join('\n')).toContain(`${'a'.repeat(44)}...`);
    } finally {
      list.mockRestore();
    }
  });

  it('refreshes mounted welcome icons at the same width', () => {
    const config = loadConfig('missing-live-settings-fixture.json');
    const welcome = new WelcomeComponent(plainTheme, config, {
      version: '1.0',
      resources: { tools: 4, skills: 2 },
      providers: [],
      sessions: [{ name: 'Recent session', timeAgo: '1h' }],
    });
    const initial = welcome.render(100);
    applyLiveSettings(config, { icons: 'ascii' }, { requestRender() {} });
    expect(welcome.render(100)).not.toEqual(initial);
    expect(welcome.render(100).join('\n')).toContain('* Recent session');
    applyLiveSettings(config, { icons: 'nerd' }, { requestRender() {} });
    expect(welcome.render(100)).toEqual(initial);
  });
  it.each([
    'bash',
    'powershell',
    'read',
    'generic',
    'codemode',
    'ls',
    'grep',
    'find',
    'write',
    'edit',
  ])('refreshes mounted %s cards at the same width, including frame/compact/line transitions', (name) => {
    const config = loadConfig('missing-live-settings-fixture.json');
    config.animation = 'off';
    const factories: Record<string, (config: ThemeConfig) => ToolRenderers> = {
      bash: (config) => createCustomBashTool('.', config),
      powershell: (config) => createCustomPowerShellTool('.', config),
      read: (config) => createCustomReadTool('.', config),
      generic: (config) => createGenericTool('custom', config),
      codemode: createCodemodeRenderer,
      ls: (config) => createCustomLsTool('.', config),
      grep: (config) => createCustomGrepTool('.', config),
      find: (config) => createCustomFindTool('.', config),
      write: (config) => createCustomWriteTool('.', config),
      edit: (config) => createCustomEditTool('.', config),
    };
    const tool = factories[name](config);
    const args = { command: 'echo hello', path: 'example.ts' };
    const context: Parameters<NonNullable<ToolRenderers['renderResult']>>[3] = {
      args,
      state: {},
      executionStarted: false,
      expanded: false,
      isPartial: false,
      isError: false,
      argsComplete: true,
      toolCallId: name,
      invalidate: vi.fn(),
      keyHint,
      keyText,
      lastComponent: undefined,
      cwd: process.cwd(),
      showImages: false,
      durationMs: undefined,
      outputPad: 0,
    };
    if (!tool.renderCall || !tool.renderResult)
      throw new Error('Missing tool renderers');
    const call = tool.renderCall(args, theme, context);
    const result = tool.renderResult(
      { content: [{ type: 'text', text: 'hello\nworld' }], details: {} },
      { expanded: false, isPartial: false },
      theme,
      context,
    );
    if (!call || !result) throw new Error('Missing tool components');
    const initial = [...call.render(80), ...result.render(80)];
    const requestRender = vi.fn();
    applyLiveSettings(
      config,
      { icons: 'nerd', tools: { collapsed: 'frame' }, animation: 'off' },
      { requestRender },
    );
    expect([...call.render(80), ...result.render(80)]).toEqual(initial);
    applyLiveSettings(config, { icons: 'ascii' }, { requestRender });
    expect([...call.render(80), ...result.render(80)]).not.toEqual(initial);
    expect(result.render(80).join('\n')).toContain('+');
    applyLiveSettings(config, { icons: 'nerd' }, { requestRender });
    expect([...call.render(80), ...result.render(80)]).toEqual(initial);
    applyLiveSettings(
      config,
      { icons: 'ascii', tools: { collapsed: 'line' } },
      { requestRender },
    );
    expect(call.render(80)).toEqual([]);
    const line = result.render(80);
    expect(line).toHaveLength(1);
    expect(line.join('\n')).toMatch(/^\+ /);
    expect(line.join('\n')).not.toContain('╭');
    applyLiveSettings(
      config,
      { icons: 'unicode', tools: { collapsed: 'compact' } },
      { requestRender },
    );
    expect(result.render(80)).toHaveLength(2);
    expect(result.render(80).join('\n')).toContain('✓');
    applyLiveSettings(
      config,
      { icons: 'nerd', tools: { collapsed: 'frame' } },
      { requestRender },
    );
    expect([...call.render(80), ...result.render(80)]).toEqual(initial);
    expect(requestRender).toHaveBeenCalledTimes(6);
  });
});
