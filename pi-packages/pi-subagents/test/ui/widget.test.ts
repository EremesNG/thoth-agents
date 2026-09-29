import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import extension, {
  ClaudeBackgroundWidget,
  ClaudeBackgroundWidgetState,
  completionMessage,
  createSubagentsPanelKeyMatcher,
  moveClaudeBackgroundWidgetSelection,
  renderClaudeBackgroundWidgetLines,
  resolveRegisteredToolDefinition,
  sendSubagentCompletionMessage,
} from '../../index.js';
import {
  loadSubagents,
  parseFrontmatter,
  readSubagentsConfig,
  resetGlobalSubagentModelProfileField,
  saveGlobalSubagentModelProfile,
  subagentSourceWarnings,
} from '../../src/config.js';
import {
  isSubagentsDebugEnabled,
  writeSubagentsDebugLog,
} from '../../src/debug.js';
import {
  deriveErrorString,
  normalizeErrorMetadata,
  parseErrorMetadata,
  SubagentStructuredError,
  safeErrorMetadataDetails,
  serializeErrorMetadata,
} from '../../src/error-metadata.js';
import {
  resolveSubagentHistoryDbPath,
  resolveSubagentsHistoryHome,
  SubagentHistoryStore,
} from '../../src/history.js';
import { SubagentManager } from '../../src/manager.js';
import {
  applyDirtyProfileEdit,
  buildModelProfileRows,
  buildNoChangesModelProfilesMessage,
  buildNonTuiModelProfilesMessage,
  commitStagedModelProfiles,
  createSubagentModelProfilesModal,
  globalSubagentsConfigPath,
  groupAvailableModelsByProvider,
  runSubagentModelsCommand,
  stageModelProfileEdit,
} from '../../src/model-profiles-ui.js';
import { resolveEffectiveSubagentProfile } from '../../src/profile-resolver.js';
import {
  createSubagentsRenderLogger,
  DEFAULT_RENDER_DEBUG_LOG_PATH,
} from '../../src/render-debug.js';
import { buildPrompt, ThreadSnapshotBuilder } from '../../src/runner.js';
import {
  boundThreadSnapshot,
  isValidThreadSnapshot,
  registerSubagentRuntimeToolDefinition,
  renderThreadBody,
  resetPiComponentCacheForTests,
} from '../../src/thread-view.js';
import { registerSubagentTools } from '../../src/tools.js';
import type {
  EffectiveSubagentProfile,
  SubagentErrorMetadata,
  SubagentModelProfiles,
  SubagentRunner,
  SubagentTask,
} from '../../src/types.js';
import { SubagentsHistoryPanel } from '../../src/ui.js';

const require = createRequire(import.meta.url);

let tmp: string;
let oldAgentDir: string | undefined;
let oldHistoryDbPath: string | undefined;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-subagents-test-'));
  oldAgentDir = process.env.PI_CODING_AGENT_DIR;
  oldHistoryDbPath = process.env.PI_SUBAGENTS_HISTORY_DB_PATH;
  process.env.PI_CODING_AGENT_DIR = path.join(tmp, 'isolated-agent');
  process.env.PI_SUBAGENTS_HISTORY_DB_PATH = path.join(
    tmp,
    'global-agent',
    'subagents-history.sqlite',
  );
  fs.mkdirSync(path.join(tmp, '.pi', 'subagents'), { recursive: true });
});
afterEach(() => {
  if (oldAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = oldAgentDir;
  if (oldHistoryDbPath === undefined)
    delete process.env.PI_SUBAGENTS_HISTORY_DB_PATH;
  else process.env.PI_SUBAGENTS_HISTORY_DB_PATH = oldHistoryDbPath;
  fs.rmSync(tmp, { recursive: true, force: true });
});

function writeAgent(name: string, body = '# Agent\nhello') {
  fs.writeFileSync(
    path.join(tmp, '.pi', 'subagents', `${name}.md`),
    `---\nname: ${name}\ndescription: ${name} agent\ntools:\n  - read\n  - memory_search\n---\n${body}`,
  );
}

function mockRunner(delay = 0): SubagentRunner {
  return async ({ definition, task }) => {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    return {
      result: `${definition.name} handled ${task}`,
      model: 'mock/model',
      fallback_used: false,
    };
  };
}

function statusSnapshot(text: string) {
  return {
    version: 1 as const,
    source: 'events' as const,
    items: [{ type: 'status' as const, text }],
  };
}

function stripAnsi(text: string): string {
  return text
    .replace(/\u001b\[[0-9;]*m/g, '')
    .replace(/\u001b\][^\u001b]*(?:\u001b\\|\u0007)/g, '');
}

function renderText(
  snapshot: unknown,
  overrides: Partial<Parameters<typeof renderThreadBody>[1]> = {},
): string {
  const context = {
    cwd: tmp,
    visibleWidth: (text: string) => stripAnsi(text).length,
    truncateToWidth: (text: string, width: number) =>
      text.length > width ? `${text.slice(0, Math.max(0, width - 1))}…` : text,
    ...overrides,
  };
  return stripAnsi(renderThreadBody(snapshot, context).join('\n'))
    .replace(/\s+/g, ' ')
    .trim();
}

function withAgentDir<T>(agentDir: string, run: () => T): T {
  const old = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  try {
    return run();
  } finally {
    if (old === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = old;
  }
}

function readJsonl(file: string): any[] {
  return fs
    .readFileSync(file, 'utf8')
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

describe('background widget', () => {
  it('shows real child metrics in an Agents tree without counting cache reads', () => {
    const task = {
      id: 'metric-task',
      agent: 'worker',
      mode: 'background',
      status: 'running',
      task: 'Review the migration',
      created_at: '2026-01-01T00:00:00.000Z',
      started_at: '2026-01-01T00:00:00.000Z',
      model: 'openai/gpt-6',
      usage: {
        input: 20000,
        output: 10000,
        cacheWrite: 3800,
        cacheRead: 90000,
        turns: 5,
      },
      runtime_metrics: {
        turns: 5,
        toolUses: 5,
        contextPercent: 62,
        compactions: 1,
      },
      live_activity: {
        current: { kind: 'tool_running', label: 'editing…' },
        trail: [],
      },
    } as any;
    const lines = renderClaudeBackgroundWidgetLines([task], undefined, {
      now: Date.parse('2026-01-01T00:00:12.300Z'),
    });
    expect(lines).toEqual([
      '● Agents',
      '└─ ◌ worker [openai/gpt-6] Review the migration · ↻5 · 5 tool uses · 33.8k tokens (62%) · 12.3s · 1 compaction',
      '   ⎿ editing…',
    ]);
  });

  it('shows a queue without invented runtime values and clips narrow rows', () => {
    const tasks = [
      {
        id: 'q1',
        agent: 'worker',
        mode: 'background',
        status: 'queued',
        task: 'first',
        created_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 'q2',
        agent: 'worker',
        mode: 'background',
        status: 'queued',
        task: 'second',
        created_at: '2026-01-01T00:00:00Z',
      },
    ] as any;
    expect(renderClaudeBackgroundWidgetLines(tasks)).toEqual([
      '● Agents',
      '└─ 2 queued',
    ]);
    const state = new ClaudeBackgroundWidgetState(() => tasks);
    const widget = new ClaudeBackgroundWidget(state, {
      fg: (_: string, text: string) => text,
      bold: (text: string) => text,
    });
    expect(widget.render(8)).toEqual(['● Agents', '└─ 2 qu…']);
    expect(state.handleTerminalInput('\u001b[B')).toEqual({ consume: true });
    expect(state.handleTerminalInput('\r')).toEqual({
      consume: true,
      action: { type: 'open-task', taskId: 'q1' },
    });
  });
  it('renders claude background widget lines for running background tasks only', () => {
    const now = new Date().toISOString();
    const tasks = [
      {
        id: 'task-main-ignore',
        agent: 'main-agent',
        mode: 'task',
        status: 'running',
        task: 'foreground task',
        created_at: now,
      },
      {
        id: 'task-finished-ignore',
        agent: 'reviewer',
        mode: 'background',
        status: 'completed',
        task: 'finished task',
        created_at: now,
      },
      {
        id: 'task-1',
        agent: 'claude',
        mode: 'background',
        status: 'running',
        task: 'ping-pong loop command',
        last_activity: 'Running ping-pong loop command.',
        created_at: now,
      },
      {
        id: 'task-2',
        agent: 'claude',
        mode: 'background',
        status: 'queued',
        task: 'PING-PONG loop bash',
        last_activity: 'Running PING-PONG loop bash.',
        created_at: now,
      },
    ] as any;

    const lines = renderClaudeBackgroundWidgetLines(tasks)!;
    expect(lines[0]).toBe('● Agents');
    expect(lines[1]).toContain('claude ping-pong loop command');
    expect(lines[2]).toBe('   ⎿ Running ping-pong loop command.');
    expect(lines[3]).toBe('└─ 1 queued');
    expect(renderClaudeBackgroundWidgetLines(tasks, 'task-2')?.at(-1)).toBe(
      '● └─ 1 queued',
    );
    expect(moveClaudeBackgroundWidgetSelection(tasks, 'main', 'down')).toBe(
      'task-1',
    );
    expect(moveClaudeBackgroundWidgetSelection(tasks, 'task-1', 'down')).toBe(
      'task-2',
    );
    expect(moveClaudeBackgroundWidgetSelection(tasks, 'task-2', 'up')).toBe(
      'task-1',
    );
    expect(
      renderClaudeBackgroundWidgetLines([
        {
          id: 'done',
          agent: 'claude',
          mode: 'background',
          status: 'completed',
          task: 'done',
          created_at: now,
        },
      ] as any),
    ).toBeUndefined();
  });

  it('allows navigating the claude background widget selection with arrow keys', () => {
    const now = new Date().toISOString();
    const requestRender = vi.fn();
    const state = new ClaudeBackgroundWidgetState(
      () =>
        [
          {
            id: 'task-1',
            agent: 'tool-smoke',
            mode: 'background',
            status: 'running',
            task: 'sleep 15',
            last_activity: 'Running sleep 15.',
            created_at: now,
          },
          {
            id: 'task-2',
            agent: 'tool-smoke',
            mode: 'background',
            status: 'queued',
            task: 'sleep 30',
            last_activity: 'Queued sleep 30.',
            created_at: now,
          },
        ] as any,
      requestRender,
    );
    const widget = new ClaudeBackgroundWidget(state, {
      fg: (_name: string, text: string) => text,
      bold: (text: string) => text,
    });

    expect(widget.render(200)[0]).toBe('● Agents');
    expect(widget.render(200).at(-1)).toBe('└─ 1 queued');

    expect(state.handleTerminalInput('\u001b[B')).toEqual({ consume: true });
    expect(requestRender).toHaveBeenCalledTimes(1);
    expect(widget.render(200)[1]).toContain('● ├─ ◌ tool-smoke sleep 15');

    expect(state.handleTerminalInput('q')).toEqual({ consume: true });
    expect(widget.render(200)[1]).toContain('● ├─ ◌ tool-smoke sleep 15');

    expect(state.handleTerminalInput('\u001b[B')).toEqual({ consume: true });
    expect(widget.render(200).at(-1)).toBe('● └─ 1 queued');

    expect(state.handleTerminalInput('\u001b[A')).toEqual({ consume: true });
    expect(widget.render(200)[1]).toContain('● ├─ ◌ tool-smoke sleep 15');

    expect(state.handleTerminalInput('\u001b[A')).toEqual({ consume: true });
    expect(widget.render(200)[0]).toBe('● Agents');

    expect(state.handleTerminalInput('\u001b[D')).toEqual({
      consume: true,
      action: { type: 'focus-editor' },
    });
    expect(widget.render(200)[0]).toBe('● Agents');

    expect(state.handleTerminalInput('\u001b[A')).toBeUndefined();
    expect(state.handleTerminalInput('x')).toBeUndefined();
  });

  it('does not activate background widget navigation with down when activation is disallowed', () => {
    const now = new Date().toISOString();
    const requestRender = vi.fn();
    const state = new ClaudeBackgroundWidgetState(
      () =>
        [
          {
            id: 'task-1',
            agent: 'tool-smoke',
            mode: 'background',
            status: 'running',
            task: 'sleep 15',
            last_activity: 'Running sleep 15.',
            created_at: now,
          },
        ] as any,
      requestRender,
    );
    const widget = new ClaudeBackgroundWidget(state, {
      fg: (_name: string, text: string) => text,
      bold: (text: string) => text,
    });

    expect(
      state.handleTerminalInput('\u001b[B', { allowActivate: false }),
    ).toBeUndefined();
    expect(requestRender).not.toHaveBeenCalled();
    expect(widget.render(200)[0]).toBe('● Agents');

    expect(state.handleTerminalInput('\u001b[B')).toEqual({ consume: true });
    expect(widget.render(200)[1]).toContain('● └─ ◌ tool-smoke sleep 15');
  });

  it('renders the selected claude background widget row with warning styling only while navigation is active', () => {
    const now = new Date().toISOString();
    const state = new ClaudeBackgroundWidgetState(
      () =>
        [
          {
            id: 'task-1',
            agent: 'tool-smoke',
            mode: 'background',
            status: 'running',
            task: 'sleep 15',
            last_activity: 'Running sleep 15.',
            created_at: now,
          },
        ] as any,
    );
    const fg = vi.fn((_: string, text: string) => text);
    const bold = vi.fn((text: string) => text);
    const widget = new ClaudeBackgroundWidget(state, { fg, bold });

    widget.render(200);
    expect(fg).not.toHaveBeenCalledWith('warning', expect.any(String));

    state.handleTerminalInput('\u001b[B');
    widget.render(200);

    expect(fg).toHaveBeenCalledWith(
      'warning',
      expect.stringContaining('● └─ ◌ tool-smoke sleep 15'),
    );
    expect(bold).toHaveBeenCalledWith(
      expect.stringContaining('● └─ ◌ tool-smoke sleep 15'),
    );
  });

  it('renders one wrapped current background activity and never a trail', () => {
    const now = new Date().toISOString();
    const state = new ClaudeBackgroundWidgetState(
      () =>
        [
          {
            id: 'task-1',
            agent: 'tool-smoke',
            mode: 'background',
            status: 'running',
            task: 'sleep 15',
            created_at: now,
            live_activity: {
              trail: [
                { kind: 'thinking', label: 'thinking' },
                { kind: 'streaming_response', label: 'streaming response' },
                {
                  kind: 'tool_running',
                  label:
                    'running tool: workspace_graph_status_with_a_very_long_public_name',
                  tool_names: [
                    'workspace_graph_status_with_a_very_long_public_name',
                  ],
                },
              ],
              current: {
                kind: 'tool_running',
                label:
                  'running tool: workspace_graph_status_with_a_very_long_public_name',
                tool_names: [
                  'workspace_graph_status_with_a_very_long_public_name',
                ],
              },
            },
          },
        ] as any,
    );
    const widget = new ClaudeBackgroundWidget(state, {
      fg: (_name: string, text: string) => `\u001b[33m${text}\u001b[39m`,
      bold: (text: string) => `\u001b[1m${text}\u001b[22m`,
    });

    const rendered = widget
      .render(24)
      .map((line) => line.replace(/\u001b\[[0-9;]*m/g, ''));
    const normalized = rendered.join(' ').replace(/\s+/g, ' ');
    const condensed = normalized.replace(/\s+/g, '');

    expect(condensed).toContain('runningtool:work');
    expect(normalized).not.toContain('thinking');
    expect(normalized).not.toContain('streaming response');
    expect(rendered.every((line) => line.length <= 24)).toBe(true);
  });

  it('returns to input on main enter and opens the selected subagent on enter', () => {
    const now = new Date().toISOString();
    const state = new ClaudeBackgroundWidgetState(
      () =>
        [
          {
            id: 'task-1',
            agent: 'tool-smoke',
            mode: 'background',
            status: 'running',
            task: 'sleep 15',
            last_activity: 'Running sleep 15.',
            created_at: now,
          },
        ] as any,
    );

    expect(state.handleTerminalInput('\u001b[B')).toEqual({ consume: true });
    expect(state.handleTerminalInput('\r')).toEqual({
      consume: true,
      action: { type: 'open-task', taskId: 'task-1' },
    });

    expect(state.handleTerminalInput('\u001b[B')).toEqual({ consume: true });
    expect(state.handleTerminalInput('\u001b[A')).toEqual({ consume: true });
    expect(state.handleTerminalInput('\r')).toEqual({
      consume: true,
      action: { type: 'focus-editor' },
    });
  });
});
