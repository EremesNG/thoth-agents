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
import { visibleWidth } from '../../src/render/text-width.js';
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
import { ARCH_ICON } from '../../src/ui/theme.js';
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
  it('keeps running cards and selection stationary while streaming inputs reorder', () => {
    const makeTask = (id: string, created_at: string) => ({
      id, agent: id, mode: 'background', status: 'running', task: `work ${id}`,
      created_at, started_at: '2026-01-01T00:00:00Z',
      last_activity_at: '2026-01-01T00:00:00Z', last_activity: 'initial',
      runtime_metrics: { turns: 0, toolUses: 0, contextPercent: 0 },
    }) as SubagentTask;
    const a = makeTask('A', '2026-01-01T00:00:02Z');
    const b = makeTask('B', '2026-01-01T00:00:01Z');
    let tasks = [b, a];
    const state = new ClaudeBackgroundWidgetState(() => tasks);
    const headers = () => state.renderLines({ width: 200, frame: 0 })
      .filter((line) => line.includes('work '));
    expect(headers()).toEqual(['  ╭─ ⠋ A · work A', '  ╭─ ⠋ B · work B']);
    state.handleTerminalInput('\u001b[B');
    expect(state.getSelectedKey()).toBe('A');
    for (const [index, input] of [[a, b], [b, a]].entries()) {
      tasks = input;
      const before = [...input];
      a.last_activity_at = `2026-01-01T00:00:0${index + 3}Z`;
      a.started_at = `2026-01-01T00:00:0${index + 1}Z`;
      a.last_activity = `stream ${index}`;
      a.runtime_metrics = { turns: index + 1, toolUses: index + 2, contextPercent: 50 + index };
      expect(headers()).toEqual(['● ┏━ ⠋ A · work A', '  ╭─ ⠋ B · work B']);
      expect(state.getSelectedKey()).toBe('A');
      const text = state.renderLines({ width: 200 }).join('\n');
      expect(text).toContain(`stream ${index}`);
      expect(text).toContain(`turns ${index + 1} · ⚙ tools ${index + 2}`);
      expect(text).toContain(`context ${50 + index}.0%`);
      expect(renderClaudeBackgroundWidgetLines(tasks, undefined, {
        now: Date.parse('2026-01-01T00:00:10Z'), width: 200,
      })?.join('\n')).toContain(`elapsed ${9 - index}.0s`);
      expect(tasks).toEqual(before);
    }
    state.handleTerminalInput('\u001b[B');
    expect(state.getSelectedKey()).toBe('B');
    state.handleTerminalInput('\u001b[A');
    expect(state.handleTerminalInput('\r')).toEqual({
      consume: true, action: { type: 'open-task', taskId: 'A' },
    });
  });
  it('keeps the newest three visible with binary descending ID ties across streaming reorders', () => {
    const tasks = ['a', 'Z', 'z', 'older'].map((id) => ({
      id, agent: id, mode: 'background', status: 'running', task: `work ${id}`,
      created_at: id === 'older' ? '2026-01-01T00:00:00Z' : '2026-01-01T00:00:01Z',
    })) as SubagentTask[];
    let current = [...tasks];
    const state = new ClaudeBackgroundWidgetState(() => current);
    state.handleTerminalInput('\u001b[B');
    state.handleTerminalInput('\u001b[B');
    expect(state.getSelectedKey()).toBe('a');
    for (const input of [[tasks[3]!, tasks[1]!, tasks[0]!, tasks[2]!], [...tasks].reverse()]) {
      current = input;
      tasks[3]!.last_activity_at = '2026-01-01T00:00:59Z';
      const before = [...input];
      const lines = state.renderLines({ frame: 0 });
      expect(lines.filter((line) => line.includes('work '))).toEqual([
        '  ╭─ ⠋ z · work z', '● ┏━ ⠋ a · work a', '  ╭─ ⠋ Z · work Z',
      ]);
      expect(lines.join('\n')).toContain('+1 more active');
      expect(lines.join('\n')).not.toContain('work older');
      expect(state.getSelectedKey()).toBe('a');
      expect(input).toEqual(before);
    }
    state.handleTerminalInput('\u001b[B');
    expect(state.getSelectedKey()).toBe('Z');
    state.handleTerminalInput('\u001b[B');
    expect(state.getSelectedKey()).toBe('overflow');
    state.handleTerminalInput('\u001b[A');
    expect(state.handleTerminalInput('\r')).toEqual({
      consume: true, action: { type: 'open-task', taskId: 'Z' },
    });
  });

  it('shows context usage with exactly one decimal place', () => {
    const task = {
      id: 'context-task',
      agent: 'worker',
      mode: 'background',
      status: 'running',
      task: 'work',
      runtime_metrics: { contextPercent: 1.134191176470588 },
    } as any;
    const render = () =>
      renderClaudeBackgroundWidgetLines([task])?.join(' ') ?? '';

    expect(render()).toContain('context 1.1%');
    task.runtime_metrics.contextPercent = 0;
    expect(render()).toContain('context 0.0%');
    task.runtime_metrics.contextPercent = 62;
    expect(render()).toContain('context 62.0%');
  });

  it('animates running status across frames while queue keeps a hollow dot', () => {
    const running = {
      id: 'r',
      agent: 'worker',
      mode: 'background',
      status: 'running',
      task: 'work',
    } as any;
    const queued = {
      id: 'q',
      agent: 'worker',
      mode: 'background',
      status: 'queued',
      task: 'wait',
    } as any;
    const first = renderClaudeBackgroundWidgetLines(
      [running, queued],
      undefined,
      { frame: 0 },
    );
    const next = renderClaudeBackgroundWidgetLines(
      [running, queued],
      undefined,
      { frame: 1 },
    );
    expect(first?.[1]).toContain('⠋ worker');
    expect(next?.[1]).toContain('⠙ worker');
    expect(first?.at(-1)).toBe('  ○ 1 queued');
  });
  it('keeps live metrics visible beside a long task at narrow widths and marks absent values', () => {
    const task = {
      id: 'long',
      agent: 'worker',
      mode: 'background',
      status: 'running',
      task: 'PHASE / CHANGE: examine a lengthy migration task that fills the row',
      model: 'provider/a-very-long-model-name',
      created_at: '2026-01-01T00:00:00Z',
      started_at: '2026-01-01T00:00:00Z',
      usage: {
        input: 20000,
        output: 10000,
        cacheWrite: 3800,
        cacheRead: 90000,
        turns: 0,
      },
      runtime_metrics: {
        turns: 0,
        toolUses: 5,
        contextPercent: 62,
        compactions: 1,
      },
    } as any;
    const state = new ClaudeBackgroundWidgetState(() => [task]);
    const widget = new ClaudeBackgroundWidget(state, {});
    for (const width of [100, 80, 50]) {
      const lines = widget.render(width);
      expect(
        lines.some(
          (line) => line.includes('turns 0') && line.includes('tools 5'),
        ),
      ).toBe(true);
      expect(lines.join(' ')).toContain('tokens 33.8k');
      expect(lines.join(' ')).toContain('context 62.0%');
      expect(lines.join(' ')).toContain('compaction');
      expect(lines.every((line) => line.length <= width)).toBe(true);
    }
    task.usage = undefined;
    task.runtime_metrics = undefined;
    const unknown = widget.render(50).join(' ');
    expect(unknown).toContain('turns ?');
    expect(unknown).toContain('tools ?');
    expect(unknown).toContain('tokens ?');
    expect(unknown).toContain('context ?');
    expect(unknown).toMatch(/elapsed \d/);
  });

  it('keeps multiple agents compact and makes a wrapped metrics row open its owner', () => {
    const tasks = ['one', 'two'].map((id, i) => ({
      created_at: `2026-01-01T00:00:0${2 - i}Z`,
      id,
      agent: id,
      mode: 'background',
      status: 'running',
      task: 'PHASE / CHANGE: inspect the long migration surface and report back',
      started_at: new Date(Date.now() - 12000).toISOString(),
      runtime_metrics: { turns: 2, toolUses: 3, contextPercent: 40 },
      usage: {
        input: 1000,
        output: 500,
        cacheWrite: 0,
        cacheRead: 2000,
        turns: 2,
      },
    })) as any;
    const actions: any[] = [];
    const widget = new ClaudeBackgroundWidget(
      new ClaudeBackgroundWidgetState(() => tasks),
      {},
      {},
      (action) => actions.push(action),
    );
    const lines = widget.render(50);
    expect(lines.filter((line) => line.includes('turns 2'))).toHaveLength(2);
    expect(lines.filter((line) => line.includes('tokens 1.5k'))).toHaveLength(
      2,
    );
    expect(lines.every((line) => line.length <= 50)).toBe(true);
    widget.handleMouse({ row: 3, type: 'click' });
    expect(actions).toEqual([{ type: 'open-task', taskId: 'one' }]);
  });

  it('shows minimalist child metrics with dim labels without counting cache reads', () => {
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
      frame: 0,
      now: Date.parse('2026-01-01T00:00:12.300Z'),
    });
    expect(lines).toEqual([
      '● Agents  (↑↓ navigate · ↵ open)',
      '  ╭─ ⠋ worker [openai/gpt-6] · Review the migration',
      '  │  ↻ turns 5 · ⚙ tools 5 · ◈ tokens 33.8k · ▣ context 62.0% · ⧗ elapsed 12.3s',
      '  │  ≋ 1 compaction',
      '  ╰⎿ editing…',
    ]);

    const widget = new ClaudeBackgroundWidget(
      new ClaudeBackgroundWidgetState(() => [task]),
      {
        fg: (color: string, text: string) =>
          color === 'dim' ? `\x1b[2m${text}\x1b[0m` : text,
      },
    );
    const styled = widget.render(80).join('\n');
    for (const metric of [
      '↻ \x1b[2mturns\x1b[0m 5',
      '⚙ \x1b[2mtools\x1b[0m 5',
      '◈ \x1b[2mtokens\x1b[0m 33.8k',
      '▣ \x1b[2mcontext\x1b[0m 62.0%',
      '⧗ \x1b[2melapsed\x1b[0m ',
      '≋ 1 \x1b[2mcompaction\x1b[0m',
    ]) {
      expect(styled).toContain(metric);
    }
    task.runtime_metrics.compactions = 2;
    expect(widget.render(80).join('\n')).toContain(
      '≋ 2 \x1b[2mcompactions\x1b[0m',
    );
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
      '● Agents  (↑↓ navigate · ↵ open)',
      '  ○ 2 queued',
    ]);
    const state = new ClaudeBackgroundWidgetState(() => tasks);
    const widget = new ClaudeBackgroundWidget(state, {
      fg: (_: string, text: string) => text,
      bold: (text: string) => text,
    });
    expect(widget.render(8)).toEqual(['● Agents', '  ○ 2 q…']);
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
    expect(lines[0]).toBe('● Agents  (↑↓ navigate · ↵ open)');
    expect(lines[1]).toContain('claude · ping-pong loop command');
    expect(lines[3]).toBe('  ╰⎿ Running ping-pong loop command.');
    expect(lines[4]).toBe('  ○ 1 queued');
    expect(renderClaudeBackgroundWidgetLines(tasks, 'task-2')?.at(-1)).toBe(
      '● ○ 1 queued',
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

    expect(widget.render(200)[0]).toBe('● Agents  (↑↓ navigate · ↵ open)');
    expect(widget.render(200).at(-1)).toBe('  ○ 1 queued');

    expect(state.handleTerminalInput('\u001b[B')).toEqual({ consume: true });
    expect(requestRender).toHaveBeenCalledTimes(1);
    expect(widget.render(200)[1]).toMatch(
      /● ┏━ [⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏] tool-smoke · sleep 15/,
    );

    expect(state.handleTerminalInput('q')).toEqual({ consume: true });
    expect(widget.render(200)[1]).toMatch(
      /● ┏━ [⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏] tool-smoke · sleep 15/,
    );

    expect(state.handleTerminalInput('\u001b[B')).toEqual({ consume: true });
    expect(widget.render(200).at(-1)).toBe('● ○ 1 queued');

    expect(state.handleTerminalInput('\u001b[A')).toEqual({ consume: true });
    expect(widget.render(200)[1]).toMatch(
      /● ┏━ [⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏] tool-smoke · sleep 15/,
    );

    expect(state.handleTerminalInput('\u001b[A')).toEqual({ consume: true });
    expect(widget.render(200)[0]).toBe(
      '● Agents  (↑↓ navigate · ↵ open · esc dismiss)',
    );

    expect(state.handleTerminalInput('\u001b[D')).toEqual({
      consume: true,
      action: { type: 'focus-editor' },
    });
    expect(widget.render(200)[0]).toBe('● Agents  (↑↓ navigate · ↵ open)');

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
    expect(widget.render(200)[0]).toBe('● Agents  (↑↓ navigate · ↵ open)');

    expect(state.handleTerminalInput('\u001b[B')).toEqual({ consume: true });
    expect(widget.render(200)[1]).toMatch(
      /● ┏━ [⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏] tool-smoke · sleep 15/,
    );
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
      expect.stringMatching(/● ┏━ [⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏] tool-smoke · sleep 15/),
    );
    expect(bold).toHaveBeenCalledWith(
      expect.stringMatching(/● ┏━ [⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏] tool-smoke · sleep 15/),
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

  it('caps visible running cards at at most 3 when 10 tasks run, shows truthful overflow footer, and keeps grouped queue', () => {
    const tasks = Array.from({ length: 10 }, (_, i) => ({
      id: `task-${i + 1}`,
      agent: `worker-${i + 1}`,
      mode: 'background',
      status: 'running',
      task: `task ${i + 1}`,
      created_at: new Date(Date.parse('2026-01-01T00:00:10Z') - i * 1000).toISOString(),
    }));
    const queuedTasks = [
      {
        id: 'q-1',
        agent: 'worker',
        mode: 'background',
        status: 'queued',
        task: 'q1',
        created_at: new Date().toISOString(),
      },
      {
        id: 'q-2',
        agent: 'worker',
        mode: 'background',
        status: 'queued',
        task: 'q2',
        created_at: new Date().toISOString(),
      },
    ];
    const all = [...tasks, ...queuedTasks] as any;
    const lines = renderClaudeBackgroundWidgetLines(all)!;
    expect(lines[0]).toBe('● Agents  (↑↓ navigate · ↵ open)');
    expect(lines.some((l) => l.includes('worker-1'))).toBe(true);
    expect(lines.some((l) => l.includes('worker-2'))).toBe(true);
    expect(lines.some((l) => l.includes('worker-3'))).toBe(true);
    expect(lines.some((l) => l.includes('worker-4'))).toBe(false);
    expect(lines.some((l) => l.includes('worker-10'))).toBe(false);
    expect(lines.some((l) => l.includes('+7 more active · /subagents'))).toBe(
      true,
    );
    expect(lines.at(-1)).toBe('  ○ 2 queued');
  });

  it('supports full keyboard navigation through visible cards, overflow footer, and queue with footer activation', () => {
    const tasks = Array.from({ length: 5 }, (_, i) => ({
      id: `task-${i + 1}`,
      agent: `worker-${i + 1}`,
      mode: 'background',
      status: 'running',
      task: `task ${i + 1}`,
      created_at: new Date(Date.parse('2026-01-01T00:00:10Z') - i * 1000).toISOString(),
    }));
    const queued = [
      {
        id: 'q-1',
        agent: 'worker',
        mode: 'background',
        status: 'queued',
        task: 'q1',
        created_at: new Date().toISOString(),
      },
    ];
    const state = new ClaudeBackgroundWidgetState(
      () => [...tasks, ...queued] as any,
    );

    expect(state.handleTerminalInput('\u001b[B')).toEqual({ consume: true });
    expect(state.getSelectedKey()).toBe('task-1');
    expect(state.handleTerminalInput('\u001b[B')).toEqual({ consume: true });
    expect(state.getSelectedKey()).toBe('task-2');
    expect(state.handleTerminalInput('\u001b[B')).toEqual({ consume: true });
    expect(state.getSelectedKey()).toBe('task-3');
    expect(state.handleTerminalInput('\u001b[B')).toEqual({ consume: true });
    expect(state.getSelectedKey()).toBe('overflow');
    expect(state.handleTerminalInput('\r')).toEqual({
      consume: true,
      action: { type: 'open-history' },
    });

    expect(state.handleTerminalInput('\u001b[B')).toEqual({ consume: true });
    expect(state.handleTerminalInput('\u001b[B')).toEqual({ consume: true });
    expect(state.handleTerminalInput('\u001b[B')).toEqual({ consume: true });
    expect(state.handleTerminalInput('\u001b[B')).toEqual({ consume: true });
    expect(state.handleTerminalInput('\u001b[B')).toEqual({ consume: true });
    expect(state.getSelectedKey()).toBe('q-1');
    expect(state.handleTerminalInput('\r')).toEqual({
      consume: true,
      action: { type: 'open-task', taskId: 'q-1' },
    });
  });

  it('maintains stable selected item when tasks finish during navigation', () => {
    let currentTasks = [
      {
        id: 'task-1',
        agent: 'w1',
        mode: 'background',
        status: 'running',
        task: 't1',
        created_at: '2026-01-01T00:00:03Z',
      },
      {
        id: 'task-2',
        agent: 'w2',
        mode: 'background',
        status: 'running',
        task: 't2',
        created_at: '2026-01-01T00:00:02Z',
      },
      {
        id: 'task-3',
        agent: 'w3',
        mode: 'background',
        status: 'running',
        task: 't3',
        created_at: '2026-01-01T00:00:01Z',
      },
    ] as any[];

    const state = new ClaudeBackgroundWidgetState(() => currentTasks);
    state.handleTerminalInput('\u001b[B');
    state.handleTerminalInput('\u001b[B');
    expect(state.getSelectedKey()).toBe('task-2');

    currentTasks = [currentTasks[0], currentTasks[2]];
    expect(state.getSelectedKey()).toBe('task-3');
  });

  it('bounds widget height for 10 running tasks at normal and narrow widths while preserving all telemetry', () => {
    const tasks = Array.from({ length: 10 }, (_, i) => ({
      id: `task-${i + 1}`,
      agent: `worker-${i + 1}`,
      mode: 'background',
      status: 'running',
      task: `task ${i + 1}`,
      created_at: new Date(Date.parse('2026-01-01T00:00:10Z') - i * 1000).toISOString(),
      started_at: '2026-01-01T00:00:00Z',
      runtime_metrics: {
        turns: i + 1,
        toolUses: i + 2,
        contextPercent: 25.5,
        compactions: i === 0 ? 1 : 0,
      },
      usage: {
        input: 1000,
        output: 500,
        cacheWrite: 0,
        cacheRead: 0,
        turns: i + 1,
      },
      live_activity: { current: { label: `activity ${i + 1}` } },
    })) as any;

    const widget = new ClaudeBackgroundWidget(
      new ClaudeBackgroundWidgetState(() => tasks),
      {},
    );
    const normalLines = widget.render(100);
    expect(normalLines.length).toBeLessThanOrEqual(14);
    expect(normalLines.join(' ')).toContain('turns 1');
    expect(normalLines.join(' ')).toContain('tools 2');
    expect(normalLines.join(' ')).toContain('tokens 1.5k');
    expect(normalLines.join(' ')).toContain('context 25.5%');
    expect(normalLines.join(' ')).toContain('+7 more active · /subagents');

    const narrowLines = widget.render(45);
    expect(narrowLines.length).toBeLessThanOrEqual(18);
    expect(narrowLines.every((l) => visibleWidth(l) <= 45)).toBe(true);
    expect(narrowLines.join(' ')).toContain('turns 1');
    expect(narrowLines.join(' ')).toContain('tools 2');
  });

  it('avoids huge task prompt in identity row while keeping short summary readable', () => {
    const task = {
      id: 'huge',
      agent: 'worker',
      mode: 'background',
      status: 'running',
      task: '# delegated task\n' + 'A'.repeat(500) + '\nmore prompt lines',
      created_at: new Date().toISOString(),
    } as any;
    const lines = renderClaudeBackgroundWidgetLines([task])!;
    expect(lines[1]?.length).toBeLessThan(120);
    expect(lines[1]).toContain('…');
  });

  it('safely handles terminal cell width with CJK and emoji without splitting sequences or overflowing', async () => {
    const { visibleWidth, truncateToWidth } = await import(
      '../../src/render/text-width.js'
    );
    expect(visibleWidth('你好世界')).toBe(8);
    expect(visibleWidth('🚀 rocket')).toBe(9);
    const truncated = truncateToWidth('你好世界朋友', 7, '…');
    expect(visibleWidth(truncated)).toBeLessThanOrEqual(7);
  });

  it('correctly renders whole widget output containing ANSI, CJK, combining characters, and ZWJ emojis without sequence corruption or boundary overflow', () => {
    const taskCjkZwj = {
      id: 'task-cjk-zwj',
      agent: 'worker-🚀',
      mode: 'background',
      status: 'running',
      task: '日本語テキストと絵文字 👩‍💻 👨‍👩‍👧‍👦 combining e\u0301 accent test',
      started_at: '2026-01-01T00:00:00Z',
      runtime_metrics: {
        turns: 3,
        toolUses: 4,
        contextPercent: 55.5,
      },
      usage: {
        input: 1000,
        output: 500,
        cacheWrite: 0,
        cacheRead: 0,
        turns: 3,
      },
      live_activity: { current: { label: '実行中 ⚡ 👩‍🔬' } },
    } as any;

    const queuedTask = {
      id: 'q-cjk',
      agent: 'worker',
      mode: 'background',
      status: 'queued',
      task: '待ち行列',
      created_at: new Date().toISOString(),
    } as any;

    const tasks = [taskCjkZwj, queuedTask];
    const options = { archIndicator: true };
    const createSelectedState = () => {
      const state = new ClaudeBackgroundWidgetState(() => tasks);
      state.handleTerminalInput('\u001b[B');
      state.handleTerminalInput('\u001b[A');
      return state;
    };
    const widget = new ClaudeBackgroundWidget(
      createSelectedState(),
      {
        fg: (_name: string, text: string) => `\u001b[36m${text}\u001b[39m`,
        bold: (text: string) => `\u001b[1m${text}\u001b[22m`,
      },
      options,
    );
    const styledOutput = widget.render(80).join('\n');
    const plainOutput = new ClaudeBackgroundWidget(
      createSelectedState(),
      undefined,
      options,
    )
      .render(80)
      .join('\n');
    expect(styledOutput).toContain(`\u001b[36m${ARCH_ICON}\u001b[39m`);
    expect(styledOutput).toContain('\u001b[36mtools\u001b[39m');
    expect(styledOutput).toContain('\u001b[36mtokens\u001b[39m');
    expect(stripAnsi(styledOutput)).toBe(plainOutput);
    expect(styledOutput).not.toMatch(
      /[\uD800-\uDBFF]\u001b\[[0-9;]*m[\uDC00-\uDFFF]/,
    );

    for (const width of [80, 50, 35, 20]) {
      const rendered = widget.render(width);
      expect(rendered.length).toBeGreaterThan(0);
      for (const line of rendered) {
        expect(visibleWidth(line)).toBeLessThanOrEqual(width);
        expect(line).not.toMatch(/\u001b(?:\[[0-9;]*)?$/);
      }
    }
  });
});
