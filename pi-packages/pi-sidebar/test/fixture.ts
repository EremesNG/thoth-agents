import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import {
  registerRenderKit,
  registerWorkPanelProvider,
  type SemanticIconName,
  type SubagentTaskSummary,
  WORK_PANEL_VERSION,
  type WorkPanelRow,
  withdrawRenderKit,
} from '@thoth-agents/pi-core';
import { createTestRenderKit } from '@thoth-agents/pi-core/testing';
import type { SidebarConfig } from '../src/config.js';
import { CostTracker } from '../src/panels/cost.js';
import {
  SidebarPanels,
  type SidebarPanelsOptions,
} from '../src/panels/sidebar.js';

export const theme = { fg: (_role: string, value: string) => value };
export const strip = (text: string) =>
  // biome-ignore lint/suspicious/noControlCharactersInRegex: SGR stripping
  text.replace(/\x1b\[[0-9;]*m/g, '');

export const context = () =>
  ({
    cwd: '/project',
    model: { id: 'm', provider: 'p' },
    thinkingLevel: 'high',
    getContextUsage: () => undefined,
    sessionManager: { getEntries: () => [] },
  }) as unknown as ExtensionContext;

type Summary = {
  running?: number;
  completed?: number;
  failed?: number;
  total?: number;
};

/** Registers a work-panel source and returns its release. */
export function source(
  id: string,
  label: string,
  rows: WorkPanelRow[],
  summary?: Summary,
  priority = 10,
): () => void {
  return registerWorkPanelProvider(
    { on() {} } as never,
    {
      version: WORK_PANEL_VERSION,
      id,
      label,
      priority,
      listRows: () => rows,
      visibleCount: () => rows.length,
      ...(summary ? { summary: () => summary } : {}),
      detail: () => undefined,
      armCloseLabel: () => '',
      close() {},
    } as never,
  );
}

/** Keyed agent row; each metric is a separate right-aligned column. */
export function agentRow(
  id: string,
  name: string,
  status = 'running',
  metrics: Record<string, string> = {},
): WorkPanelRow {
  return {
    id,
    primary: name,
    status,
    state: status === 'running' ? 'running' : 'done',
    identity: [{ text: name, role: 'primary' }],
    metrics: Object.entries(metrics).map(([key, text]) => ({
      key: key as never,
      segments: [{ text, role: 'meta' }],
    })),
  };
}

export const FULL_METRICS = {
  model: 'gpt-5 · high',
  tokens: '↑12k ↓3.4k',
  cost: '$0.42',
  elapsed: '1m 05s',
};

export function sidebar(
  panels: SidebarConfig['panels'],
  options: Partial<SidebarPanelsOptions> = {},
): SidebarPanels {
  return new SidebarPanels({
    config: { startup: 'auto', panels },
    context,
    theme,
    thinking: () => 'off',
    subscriptionProviders: [],
    subagentCost: () => 0,
    workspace: () => ({ cwd: '/project' }),
    height: () => 40,
    ...options,
  });
}

export function task(
  id: string,
  cost: number,
  extra: Partial<SubagentTaskSummary> = {},
): SubagentTaskSummary {
  return {
    id,
    agent: 'worker',
    mode: 'task',
    status: 'completed',
    createdAt: 0,
    usage: { cost },
    ...extra,
  };
}

export function snapshot(
  tasks: SubagentTaskSummary[],
  history: SubagentTaskSummary[] = [],
) {
  const counts = {
    queued: 0,
    running: 0,
    stopping: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    interrupted: 0,
  };
  return { tasks, history, counts, totals: { ...counts, total: tasks.length } };
}

export function tracker(
  tasks: SubagentTaskSummary[],
  history: SubagentTaskSummary[] = [],
  at = 1000,
): CostTracker {
  const result = new CostTracker();
  result.update(snapshot(tasks, history), at);
  return result;
}

/** Only ASCII overrides the native glyphs; the rest falls back to defaults. */
const GLYPHS: Record<'nerd' | 'ascii', Record<string, string>> = {
  nerd: {},
  ascii: {
    agent: '*',
    boxTopLeft: '+',
    boxTopRight: '+',
    boxBottomLeft: '+',
    boxBottomRight: '+',
    boxHorizontal: '-',
    boxVertical: '|',
    ellipsis: '...',
  },
};

/** Registers a kit whose box glyphs identify the icon mode. */
export function useMode(mode: keyof typeof GLYPHS): () => void {
  const table = GLYPHS[mode];
  const token = registerRenderKit(
    createTestRenderKit({
      icon: (name: SemanticIconName) => table[name] as string,
    }),
    {},
  );
  return () => withdrawRenderKit(token);
}
