import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import {
  registerRenderKit,
  registerWorkPanelProvider,
  WORK_PANEL_VERSION,
  withdrawRenderKit,
} from '@thoth-agents/pi-core';
import { createTestRenderKit } from '@thoth-agents/pi-core/testing';
import { afterEach, expect, it } from 'vitest';
import type { SidebarConfig } from '../src/config.js';
import { SidebarPanels, sessionRows } from '../src/panels/sidebar.js';

const disposers: Array<() => void> = [];
afterEach(() => {
  for (const off of disposers.splice(0).reverse()) off();
});
const theme = { fg: (_role: string, value: string) => value };
function context() {
  return {
    cwd: '/project',
    model: { id: 'test-model', provider: 'claude-bridge' },
    thinkingLevel: 'high',
    getContextUsage: () => ({
      tokens: 12345,
      percent: 12.345,
      contextWindow: 100000,
    }),
    sessionManager: {
      getEntries: () => [
        {
          type: 'message',
          message: { role: 'assistant', usage: { cost: { total: 1.25 } } },
        },
      ],
    },
  } as unknown as ExtensionContext;
}

it('renders current session values and subscription classification with cumulative subagent cost', () => {
  const ctx = context();
  expect(sessionRows(ctx, 'off', ['claude-bridge'], 0.75)).toEqual([
    'claude-bridge / test-model',
    'Thinking: high',
    'Context: 12.3% · 12,345 / 100,000',
    'Cost: $2.000 (sub)',
  ]);
  ctx.model = { id: 'other', provider: 'paid' } as ExtensionContext['model'];
  ctx.thinkingLevel = undefined;
  ctx.getContextUsage = () => ({
    tokens: null,
    percent: null,
    contextWindow: 200000,
  });
  expect(sessionRows(ctx, 'medium', ['claude-bridge'], 1)[1]).toBe(
    'Thinking: medium',
  );
  expect(sessionRows(ctx, 'medium', ['claude-bridge'], 1).slice(2)).toEqual([
    'Context: unknown / 200,000',
    'Cost: $2.250',
  ]);
});

it('stacks configured panels in order, uses fresh discovered rows and kit, bounds height and hides disabled panels', () => {
  let primary = 'First task';
  const off = registerWorkPanelProvider(
    { on() {} } as any,
    {
      version: WORK_PANEL_VERSION,
      id: 'test-source',
      label: 'Tasks',
      priority: 10,
      visibleCount: () => 1,
      listRows: () => [{ id: 'one', primary, status: 'running' }],
      detail: () => undefined,
      armCloseLabel: () => '',
      close: () => {},
    } as any,
  );
  disposers.push(off);
  const config: SidebarConfig = {
    startup: 'auto',
    panels: [
      { id: 'test-source', visible: true },
      { id: 'workspace', visible: true },
      { id: 'session', visible: true },
    ],
  };
  const panel = new SidebarPanels({
    config,
    context: context,
    theme,
    thinking: () => 'off',
    subscriptionProviders: [],
    subagentCost: () => 0,
    workspace: () => ({ cwd: '/project', branch: 'main', status: 'Clean' }),
    height: () => 30,
  });
  const token = registerRenderKit(createTestRenderKit(), {});
  disposers.push(() => withdrawRenderKit(token));
  const text = panel.render(44).join('\n');
  expect(text.indexOf('Tasks')).toBeLessThan(text.indexOf('Workspace'));
  expect(text.indexOf('Workspace')).toBeLessThan(text.indexOf('Session'));
  expect(text).toContain('First task');
  primary = 'Updated task';
  expect(panel.render(44).join('\n')).toContain('Updated task');
  expect(panel.sourceIds()).toEqual(['test-source']);
  config.panels[0].visible = false;
  expect(panel.render(44).join('\n')).not.toContain('Updated task');
  expect(panel.sourceIds()).toEqual([]);
  config.panels[0].visible = true;
  for (let height = 0; height < 20; height++) {
    const lines = panel.renderAt(28, height);
    expect(lines.length).toBeLessThanOrEqual(height);
  }
  expect(panel.renderAt(44, 6).join('\n')).toContain('Session');
  expect(panel.renderAt(44, 6).join('\n')).not.toContain('Workspace');
  withdrawRenderKit(token);
  expect(panel.render(44).join('\n')).toContain('Session');
});
