import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  resetExpandKeybindingProviderForTests,
  setExpandKeybindingProviderForTests,
} from '../../src/render/tools/expansion-hint.js';
import { statusGlyph } from '../../src/render/tools/progress.js';
import { registerSubagentTools } from '../../src/tools.js';
import type { SubagentTask } from '../../src/types.js';
import { installSubagentTestEnv } from '../helpers/subagent-test-helpers.js';

const env = installSubagentTestEnv();

describe('tool render helpers', () => {
  it('uses distinct task state glyphs', () => {
    expect(
      [
        'running',
        'completed',
        'cancelled',
        'interrupted',
        'stopping',
        'failed',
        'queued',
      ].map((state) => statusGlyph(state)),
    ).toEqual(['⠋', '✓', '■', '■', '■', '✗', '○']);
    expect(statusGlyph('running', 9)).toBe('⠏');
    expect(statusGlyph('running', 10)).toBe('⠋');
  });
  it('renders agent, model, and effort as explicit labels in tool results', async () => {
    env.writeAgent('analyst');
    const manager = env.createManager(async () => ({
      result: 'clear render',
      model: 'mock/model',
      effort: 'high',
      fallback_used: false,
    }));
    let runTool: any;
    registerSubagentTools(
      {
        registerTool: (tool: any) => {
          if (tool.name === 'subagent_run') runTool = tool;
        },
      },
      manager,
    );
    const result = await runTool.execute(
      '1',
      { agent: 'analyst', task: 'render clearly', mode: 'task' },
      undefined,
      undefined,
      { cwd: env.tmp },
    );
    const rendered = runTool
      .renderResult(
        result,
        { isPartial: false },
        { fg: (_name: string, text: string) => text },
      )
      .render(200)
      .join('\n');
    expect(rendered).toContain('agent: analyst');
    expect(rendered).toContain('model: mock/model');
    expect(rendered).toContain('effort: high');
  });

  it('renders a dim history shortcut and command hint in expanded subagent results and returns empty tool call lines to avoid separate outer text', () => {
    const manager = env.createManager(env.mockRunner());
    let runTool: any;
    const dim = vi.fn((_name: string, text: string) => text);
    registerSubagentTools(
      {
        registerTool: (tool: any) => {
          if (tool.name === 'subagent_run') runTool = tool;
        },
      },
      manager,
    );

    const callLines = runTool
      .renderCall(
        { agent: 'analyst', mode: 'task' },
        { fg: dim, bold: (text: string) => text },
      )
      .render(200);
    expect(callLines).toHaveLength(0);

    const dummyResult = {
      details: {
        task: {
          id: '1',
          agent: 'analyst',
          status: 'completed',
          attempt: 1,
          model: 'mock/model',
          effort: 'medium',
        },
      },
    };
    const expanded = runTool
      .renderResult(
        dummyResult,
        { expanded: true, isPartial: false },
        { fg: dim, bold: (text: string) => text },
      )
      .render(200)
      .join('\n');
    expect(expanded).toContain('(ctrl+, or /subagents for details)');
    expect(dim).toHaveBeenCalledWith(
      'dim',
      '(click to view execution) · (ctrl+, or /subagents for details)',
    );
  });

  it('renders the effective subagent_run mode in execution title and returns empty tool call lines', () => {
    fs.writeFileSync(
      path.join(env.tmp, '.pi', 'subagents.json'),
      JSON.stringify({ default_mode: 'background' }),
    );
    env.writeAgent('analyst');
    const previousCwd = process.cwd();
    process.chdir(env.tmp);
    try {
      const manager = env.createManager(env.mockRunner());
      let runTool: any;
      registerSubagentTools(
        {
          registerTool: (tool: any) => {
            if (tool.name === 'subagent_run') runTool = tool;
          },
        },
        manager,
      );

      const callLines = runTool
        .renderCall(
          { agent: 'analyst' },
          {
            fg: (_name: string, text: string) => text,
            bold: (text: string) => text,
          },
        )
        .render(200);
      expect(callLines).toHaveLength(0);

      const bgResult = {
        details: {
          mode: 'background',
          task: {
            id: 't1',
            agent: 'analyst',
            status: 'running',
            mode: 'background',
            model: 'mock/model',
            effort: 'high',
          },
        },
      };
      const renderedBg = runTool
        .renderResult(
          bgResult,
          { expanded: false, isPartial: false },
          {
            fg: (_name: string, text: string) => text,
            bold: (text: string) => text,
          },
        )
        .render(200)
        .join('\n');
      expect(renderedBg).toContain('running (background)');

      const taskResult = {
        details: {
          mode: 'task',
          task: {
            id: 't2',
            agent: 'analyst',
            status: 'running',
            mode: 'task',
            model: 'mock/model',
            effort: 'high',
          },
        },
      };
      const renderedTask = runTool
        .renderResult(
          taskResult,
          { expanded: false, isPartial: false },
          {
            fg: (_name: string, text: string) => text,
            bold: (text: string) => text,
          },
        )
        .render(200)
        .join('\n');
      expect(renderedTask).toContain('subagent · analyst · running');
      expect(renderedTask).not.toContain('running (background)');
    } finally {
      process.chdir(previousCwd);
    }
  });

  it('renders the configured history shortcut in expanded subagent results', () => {
    fs.writeFileSync(
      path.join(env.tmp, '.pi', 'subagents.json'),
      JSON.stringify({ history_panel_shortcut: 'ctrl+p' }),
    );
    const previousCwd = process.cwd();
    process.chdir(env.tmp);
    try {
      const manager = env.createManager(env.mockRunner());
      let runTool: any;
      const dim = vi.fn((_name: string, text: string) => text);
      registerSubagentTools(
        {
          registerTool: (tool: any) => {
            if (tool.name === 'subagent_run') runTool = tool;
          },
        },
        manager,
      );

      const dummyResult = {
        details: {
          task: {
            id: '1',
            agent: 'analyst',
            status: 'completed',
            attempt: 1,
            model: 'mock/model',
            effort: 'medium',
          },
        },
      };
      const rendered = runTool
        .renderResult(
          dummyResult,
          { expanded: true, isPartial: false },
          { fg: dim, bold: (text: string) => text },
        )
        .render(200)
        .join('\n');
      expect(rendered).toContain('(ctrl+p or /subagents for details)');
      expect(dim).toHaveBeenCalledWith(
        'dim',
        '(click to view execution) · (ctrl+p or /subagents for details)',
      );
    } finally {
      process.chdir(previousCwd);
    }
  });

  it('keeps ansi-styled subagent_run title hints visible when visual width fits', () => {
    const manager = env.createManager(env.mockRunner());
    let runTool: any;
    const theme = {
      fg: (_name: string, text: string) => `\u001b[36m${text}\u001b[39m`,
      bold: (text: string) => `\u001b[1m${text}\u001b[22m`,
    };
    registerSubagentTools(
      {
        registerTool: (tool: any) => {
          if (tool.name === 'subagent_run') runTool = tool;
        },
      },
      manager,
    );

    const dummyResult = {
      details: {
        task: {
          id: '1',
          agent: 'discovery',
          status: 'completed',
          attempt: 1,
          model: 'mock/model',
          effort: 'medium',
        },
      },
    };
    const rendered = runTool
      .renderResult(dummyResult, { expanded: true, isPartial: false }, theme)
      .render(80)
      .join('\n');
    const plain = env.stripAnsi(rendered);
    expect(plain).toContain('(ctrl+, or /subagents for details)');
    expect(plain).not.toContain('�');
  });

  describe.each([
    true,
    false,
  ])('foreground partial progress (backgroundable: %s)', (backgroundable) => {
    it.each([
      {
        label: 'usage and runtime',
        metrics: {
          started_at: '2026-01-01T00:00:00.000Z',
          usage: { turns: 2, input: 1500, output: 100 },
          runtime_metrics: {
            generationOutputTokens: 100,
            generationMs: 4000,
          },
        },
        usageLine: '↳ usage: 2 turns ↑1.5k ↓100 · 25 tok/s',
        duration: '3s',
      },
      { label: 'no usage or runtime', metrics: {}, usageLine: undefined },
      { label: 'empty usage', metrics: { usage: {} }, usageLine: undefined },
      {
        label: 'usage without runtime',
        metrics: { usage: { turns: 1 } },
        usageLine: '↳ usage: 1 turn',
      },
      {
        label: 'speed only',
        metrics: {
          runtime_metrics: { generationOutputTokens: 100, generationMs: 4000 },
        },
        usageLine: '↳ usage: 25 tok/s',
      },
      {
        label: 'elapsed only',
        metrics: { started_at: '2026-01-01T00:00:00.000Z' },
        usageLine: undefined,
        duration: '3s',
      },
    ])('separates model and usage while highlighting the current activity with $label', ({
      metrics,
      usageLine,
      duration,
    }) => {
      let runTool: any;
      registerSubagentTools(
        {
          registerTool: (tool: any) => {
            if (tool.name === 'subagent_run') runTool = tool;
          },
        },
        env.createManager(env.mockRunner()),
      );
      const fg = vi.fn((_name: string, text: string) => text);
      const bold = vi.fn((text: string) => text);
      const now = vi
        .spyOn(Date, 'now')
        .mockReturnValue(Date.parse('2026-01-01T00:00:03.000Z'));
      try {
        const lines = runTool
          .renderResult(
            {
              details: {
                backgroundable,
                backgroundShortcut: 'ctrl+b',
                tasks: [
                  {
                    agent: 'analyst',
                    status: 'running',
                    mode: 'task',
                    effort: 'high',
                    model: 'mock/model',
                    live_activity: {
                      trail: [
                        { kind: 'thinking', label: 'thinking' },
                        { kind: 'tool_running', label: 'running tool: read' },
                      ],
                      current: {
                        kind: 'tool_running',
                        label: 'running tool: read',
                      },
                    },
                    ...metrics,
                  },
                ],
              },
            },
            { isPartial: true },
            { fg, bold },
          )
          .render(200);
        expect(lines[0]).toContain(
          `subagent · analyst · running${duration ? ` · ${duration}` : ''}`,
        );
        if (!duration) expect(lines[0]).not.toContain('running ·');
        expect(lines.join('\n')).not.toContain('⧗ elapsed');
        const body = lines
          .slice(1, -1)
          .map((line: string) => line.replace(/^│\s*|\s*│$/g, '').trim());
        expect(body).toEqual([
          '⠋ agent: analyst · status: running · attempt: 1 · effort: high',
          '↳ model: mock/model',
          ...(usageLine ? [usageLine] : []),
          '↳ thinking',
          '↳ running tool: read',
          ...(backgroundable ? ['↳ ctrl+b to send to background'] : []),
        ]);
        expect(fg).toHaveBeenCalledWith('warning', body[0]);
        for (const line of [
          '↳ model: mock/model',
          ...(usageLine ? [usageLine] : []),
          '↳ thinking',
          ...(backgroundable ? ['↳ ctrl+b to send to background'] : []),
        ]) {
          expect(fg).toHaveBeenCalledWith('dim', line);
          expect(bold).not.toHaveBeenCalledWith(line);
        }
        expect(fg).toHaveBeenCalledWith('accent', '↳ running tool: read');
        expect(bold).toHaveBeenCalledWith('↳ running tool: read');
      } finally {
        now.mockRestore();
      }
    });
  });

  it.each([
    {
      started_at: '2026-01-01T00:00:00.000Z',
      title: 'subagent · analyst · running · 1m 25s (background)',
    },
    {
      started_at: undefined,
      title: 'subagent · analyst · running (background)',
    },
    {
      started_at: 'invalid',
      title: 'subagent · analyst · running (background)',
    },
  ])('keeps the background suffix after any partial title duration ($started_at)', ({
    started_at,
    title,
  }) => {
    let runTool: any;
    registerSubagentTools(
      {
        registerTool: (tool: any) => {
          if (tool.name === 'subagent_run') runTool = tool;
        },
      },
      env.createManager(env.mockRunner()),
    );
    const now = vi
      .spyOn(Date, 'now')
      .mockReturnValue(Date.parse('2026-01-01T00:01:25.100Z'));
    try {
      const lines = runTool
        .renderResult(
          {
            details: {
              task: {
                agent: 'analyst',
                status: 'running',
                mode: 'background',
                started_at,
                usage: { turns: 1 },
                runtime_metrics: {
                  generationOutputTokens: 100,
                  generationMs: 4000,
                },
              },
            },
          },
          { isPartial: true },
          {
            fg: (_name: string, text: string) => text,
            bold: (text: string) => text,
          },
        )
        .render(200);
      const rendered = lines.join('\n');
      expect(lines[0]).toContain(title);
      expect(rendered).toContain('↳ usage: 1 turn');
      expect(rendered).not.toContain('tok/s');
      expect(rendered).not.toContain('⧗ elapsed');
    } finally {
      now.mockRestore();
    }
  });

  it('renders current-last foreground activity without clipping complete tool names', () => {
    const manager = env.createManager(env.mockRunner());
    let runTool: any;
    registerSubagentTools(
      {
        registerTool: (tool: any) => {
          if (tool.name === 'subagent_run') runTool = tool;
        },
      },
      manager,
    );
    const longToolName = 'workspace_graph_status_with_a_very_long_public_name';

    const rendered = runTool
      .renderResult(
        {
          details: {
            frame: 0,
            tasks: [
              {
                agent: 'analyst',
                status: 'running',
                attempt: 1,
                effort: 'high',
                model: 'mock/model',
                last_activity: `running tool: ${longToolName}`,
                live_activity: {
                  trail: [
                    { kind: 'thinking', label: 'thinking' },
                    { kind: 'streaming_response', label: 'streaming response' },
                    {
                      kind: 'tool_running',
                      label: `running tool: ${longToolName}`,
                      tool_names: [longToolName],
                    },
                  ],
                  current: {
                    kind: 'tool_running',
                    label: `running tool: ${longToolName}`,
                    tool_names: [longToolName],
                  },
                },
              },
            ],
          },
        },
        { isPartial: true },
        {
          fg: (_name: string, text: string) => text,
          bold: (text: string) => text,
        },
      )
      .render(30);
    const plain = rendered.map(env.stripAnsi);
    const bodyContent = plain
      .slice(1, -1)
      .map((line: string) => line.replace(/^[╭│╰]\s*|\s*[╮│╯]$/g, '').trim())
      .join(' ');
    const unwrappedWord = plain
      .map((line: string) => line.replace(/^[╭│╰]\s*|\s*[╮│╯]$/g, ''))
      .filter((line: string) => line.includes('_'))
      .join('');

    expect(bodyContent).toContain('thinking');
    expect(bodyContent).toContain('streaming response');
    expect(unwrappedWord).toContain(longToolName);
    expect(bodyContent).not.toContain('…');
    expect(plain.every((line: string) => [...line].length <= 30)).toBe(true);
    expect(plain.some((line: string) => line.includes('╭'))).toBe(true);
    expect(plain.some((line: string) => line.includes('│'))).toBe(true);
    expect(plain.some((line: string) => line.includes('╰'))).toBe(true);
  });

  it('renders the effective continuation mode from explicit override, previous task state, and config fallback', async () => {
    const { resolveContinuationEffectiveMode } = await import(
      '../../src/continuation-mode.js'
    );
    fs.writeFileSync(
      path.join(env.tmp, '.pi', 'subagents.json'),
      JSON.stringify({ enable_continue: true, default_mode: 'background' }),
    );
    env.writeAgent('analyst');
    const previousCwd = process.cwd();
    process.chdir(env.tmp);
    try {
      const manager = env.createManager(env.mockRunner());
      let continueTool: any;
      registerSubagentTools(
        {
          registerTool: (tool: any) => {
            if (tool.name === 'subagent_continue') continueTool = tool;
          },
        },
        manager,
      );

      const backgroundTask = await manager.run(
        {
          agent: 'analyst',
          task: 'persist background mode',
          mode: 'background',
        },
        { cwd: env.tmp },
      );
      const bgTaskObj = manager.getTask(backgroundTask.task_ids[0]!, env.tmp);
      expect(
        resolveContinuationEffectiveMode({
          previousTask: bgTaskObj,
          config: { default_mode: 'background' },
        }),
      ).toBe('background');

      expect(
        resolveContinuationEffectiveMode({
          explicitMode: 'task',
          previousTask: bgTaskObj,
          config: { default_mode: 'background' },
        }),
      ).toBe('task');

      const taskTask = await manager.run(
        { agent: 'analyst', task: 'persist task mode', mode: 'task' },
        { cwd: env.tmp },
      );
      const taskTaskObj = manager.getTask(taskTask.task_ids[0]!, env.tmp);
      expect(
        resolveContinuationEffectiveMode({
          explicitMode: 'background',
          previousTask: taskTaskObj,
          config: { default_mode: 'background' },
        }),
      ).toBe('background');

      const legacyTaskId = 'subtask_legacy_render_continue';
      const legacySessionPath = path.join(
        env.tmp,
        'legacy-render-session.jsonl',
      );
      fs.writeFileSync(legacySessionPath, '{"type":"session"}\n');
      (manager as any).history.upsertTask(env.tmp, {
        id: legacyTaskId,
        agent: 'analyst',
        mode: 'legacy',
        status: 'completed',
        task: 'legacy task',
        created_at: new Date().toISOString(),
        nested_session_path: legacySessionPath,
        result: 'legacy result',
        attempt: 1,
      } as any);
      const legacyTaskObj = manager.getTask(legacyTaskId, env.tmp);
      expect(
        resolveContinuationEffectiveMode({
          previousTask: legacyTaskObj,
          config: { default_mode: 'background' },
        }),
      ).toBe('background');

      // Call lines return 0 lines to avoid separate text outside frame
      const callLines = continueTool
        .renderCall(
          { task_id: legacyTaskId, prompt: 'Resume the legacy task.' },
          {
            fg: (_name: string, text: string) => text,
            bold: (text: string) => text,
          },
        )
        .render(200);
      expect(callLines).toHaveLength(0);
    } finally {
      process.chdir(previousCwd);
    }
  });

  it('renders a ctrl+h background hint in partial task-mode results', () => {
    const manager = env.createManager(env.mockRunner());
    let runTool: any;
    registerSubagentTools(
      {
        registerTool: (tool: any) => {
          if (tool.name === 'subagent_run') runTool = tool;
        },
      },
      manager,
    );

    const rendered = runTool
      .renderResult(
        {
          details: {
            frame: 0,
            backgroundable: true,
            tasks: [
              {
                agent: 'analyst',
                status: 'running',
                effort: 'high',
                model: 'mock/model',
                last_activity: 'working',
              },
            ],
          },
        },
        { isPartial: true },
        { fg: (_name: string, text: string) => text },
      )
      .render(200)
      .join('\n');
    expect(rendered).toContain('ctrl+h to send to background');
  });

  it('renders completed subagent_run results collapsed by default and expanded on demand', () => {
    const manager = env.createManager(env.mockRunner());
    let runTool: any;
    const theme = {
      fg: (_name: string, text: string) => `\u001b[2m${text}\u001b[22m`,
      bold: (text: string) => `\u001b[1m${text}\u001b[22m`,
    };
    registerSubagentTools(
      {
        registerTool: (tool: any) => {
          if (tool.name === 'subagent_run') runTool = tool;
        },
      },
      manager,
    );
    const rawResponse =
      '{"id":"mem_j0k3r_j0k3r-pi_1782144305930_cc027e8afb154ba5"} to=functions.memory_get '.repeat(
        4,
      );

    const dummyResult = {
      content: [
        {
          type: 'text',
          text: `Completed 1 subagent task:\n${rawResponse}`,
        },
      ],
      details: {
        task: {
          id: 'subtask_sdd-verify_1782157254429_2b614a8e',
          agent: 'sdd-verify',
          mode: 'task',
          status: 'completed',
          task: 'verify',
          created_at: new Date().toISOString(),
          result: rawResponse,
          usage: {
            turns: 11,
            input: 87000,
            output: 6800,
            cacheRead: 574000,
            cost: 0.462,
            contextTokens: 79000,
          },
          model: 'openai-codex/gpt-5.4',
          effort: 'medium',
        },
      },
    };

    // 1. Collapsed by default (options without expanded, or expanded: false)
    const collapsedLines = runTool
      .renderResult(dummyResult, { isPartial: false }, theme)
      .render(60);
    const plainCollapsed = collapsedLines.map(env.stripAnsi);
    const collapsedPlain = plainCollapsed.join('\n');

    // Collapsed completed result: exactly 4 rows (top border with title, ONE metadata line, hint, bottom border)
    expect(collapsedLines).toHaveLength(4);
    expect(env.stripAnsi(collapsedLines[0])).toContain(
      '✓ [subagent] sdd-verify · verify · completed',
    );
    expect(collapsedPlain).toContain('subagent: sdd-verify');
    expect(collapsedPlain).not.toContain('usage:');
    expect(collapsedPlain).not.toContain('11 turns');
    expect(collapsedPlain).toContain('ctrl+o to expand');
    expect(collapsedPlain).not.toContain(rawResponse);
    expect(collapsedPlain).not.toContain('Subagent response');
    expect(collapsedPlain).not.toContain('click to view execution');
    expect(collapsedPlain).not.toContain('id: subtask_');
    expect(plainCollapsed.every((line: string) => [...line].length <= 60)).toBe(
      true,
    );

    const unwrappedLines = runTool
      .renderResult(dummyResult, { isPartial: false }, theme)
      .render(120);
    const unwrappedPlain = env.stripAnsi(unwrappedLines.join('\n'));
    expect(unwrappedLines).toHaveLength(4);
    expect(unwrappedPlain).toContain(
      'subagent: sdd-verify · model: openai-codex/gpt-5.4 · effort: medium · status: completed · $0.46',
    );
    expect(unwrappedPlain).not.toContain('usage:');
    expect(unwrappedPlain).toContain('ctrl+o to expand');

    // 2. Expanded on demand (expanded: true)
    const expandedLines = runTool
      .renderResult(dummyResult, { expanded: true, isPartial: false }, theme)
      .render(60);
    const plainExpanded = expandedLines.map(env.stripAnsi);
    const expandedPlain = plainExpanded.join('\n');

    expect(expandedLines[0]).toContain('subagent result · sdd-verify · verify');
    expect(expandedPlain).toContain('subagent: sdd-verify');
    expect(expandedPlain).toContain('model: openai-codex/gpt-5.4');
    expect(expandedPlain).toContain('usage: 11 turns');
    expect(expandedPlain).toContain('click to view execution');
    expect(expandedPlain).toContain('Subagent response');
    expect(expandedPlain).toContain('functions.memory_get');
    expect(expandedPlain).not.toContain('ctrl+o to expand');
    expect(plainExpanded.every((line: string) => [...line].length <= 60)).toBe(
      true,
    );

    const wideExpanded = env.stripAnsi(
      runTool
        .renderResult(dummyResult, { expanded: true, isPartial: false }, theme)
        .render(500)
        .join('\n'),
    );
    expect(wideExpanded).toContain(rawResponse);
  });

  it('renders failed subagent_run results collapsed with essential error line visible', () => {
    const manager = env.createManager(env.mockRunner());
    let runTool: any;
    const theme = {
      fg: (_name: string, text: string) => text,
      bold: (text: string) => text,
    };
    registerSubagentTools(
      {
        registerTool: (tool: any) => {
          if (tool.name === 'subagent_run') runTool = tool;
        },
      },
      manager,
    );

    const failedResult = {
      isError: true,
      details: {
        task: {
          id: 'subtask_fail_123',
          agent: 'thoth-worker',
          status: 'failed',
          task: 'implement unit tests',
          error:
            'Execution failed: process exited with code 1\nStack trace line 1\nStack trace line 2',
          model: 'mock/model',
          effort: 'high',
        },
      },
    };

    // Collapsed failed result: exactly 5 rows (top border with title, ONE metadata line, error line, hint, bottom border)
    const collapsedLines = runTool
      .renderResult(failedResult, { expanded: false, isPartial: false }, theme)
      .render(80);
    const collapsedPlain = collapsedLines.map(env.stripAnsi).join('\n');

    expect(collapsedLines).toHaveLength(5);
    expect(collapsedLines[0]).toContain('✗');
    expect(collapsedLines[0]).toContain(
      '[subagent] thoth-worker · implement unit tests · failed',
    );
    expect(collapsedPlain).toContain(
      'subagent: thoth-worker · model: mock/model · effort: high · status: failed',
    );
    expect(collapsedPlain).toContain(
      'Execution failed: process exited with code 1',
    );
    expect(collapsedPlain).not.toContain('Stack trace line 1');
    expect(collapsedPlain).not.toContain('usage:');
    expect(collapsedPlain).toContain('ctrl+o to expand');
  });

  it('renders tool calls, progress, and results with boxed frames and zero background fills', async () => {
    env.writeAgent('analyst');
    const manager = env.createManager(async () => ({
      result: 'completed response',
      model: 'mock/model',
      effort: 'high',
      fallback_used: false,
    }));
    let runTool: any;
    registerSubagentTools(
      {
        registerTool: (tool: any) => {
          if (tool.name === 'subagent_run') runTool = tool;
        },
      },
      manager,
    );

    // Call rendering (empty, zero lines, zero background fills to avoid duplicate stacked cards or text outside frame)
    const callLines = runTool
      .renderCall(
        { agent: 'analyst', mode: 'task' },
        {
          fg: (_name: string, text: string) => text,
          bold: (text: string) => text,
        },
      )
      .render(80);
    expect(callLines).toHaveLength(0);
    expect(callLines.join('\n')).not.toContain('\x1b[4');

    // Result rendering (single framed box with integrated title)
    const result = await runTool.execute(
      '1',
      { agent: 'analyst', task: 'render cleanly', mode: 'task' },
      undefined,
      undefined,
      { cwd: env.tmp },
    );
    const resultLines = runTool
      .renderResult(
        result,
        { isPartial: false },
        {
          fg: (_name: string, text: string) => text,
          bold: (text: string) => text,
        },
      )
      .render(80);
    expect(resultLines[0]).toContain('╭─');
    expect(resultLines[0]).toContain('╮');
    expect(resultLines[0]).toContain('✓');
    expect(resultLines.some((l: string) => l.includes('│'))).toBe(true);
    expect(resultLines.at(-1)).toContain('╰');
    expect(resultLines.at(-1)).toContain('╯');
    expect(resultLines.join('\n')).not.toContain('\x1b[4');

    // Direct renderSubagentResult (single framed box with integrated title)
    const { renderSubagentResult } = await import(
      '../../src/render/tools/subagent-result.js'
    );
    const directLines = renderSubagentResult(
      result,
      { expanded: false },
      { fg: (_name: string, text: string) => text },
    ).render(80);
    expect(directLines[0]).toContain('╭─');
    expect(directLines[0]).toContain('╮');
    expect(directLines[0]).toContain('✓');
    expect(directLines.some((l: string) => l.includes('│'))).toBe(true);
    expect(directLines.at(-1)).toContain('╰');
    expect(directLines.at(-1)).toContain('╯');
    expect(directLines.join('\n')).not.toContain('\x1b[4');
  });

  it.each([
    true,
    false,
  ])('shows foreground generation speed and live elapsed time (partial: %s)', (isPartial) => {
    let runTool: any;
    registerSubagentTools(
      {
        registerTool: (tool: any) => {
          if (tool.name === 'subagent_run') runTool = tool;
        },
      },
      env.createManager(env.mockRunner()),
    );
    const now = vi
      .spyOn(Date, 'now')
      .mockReturnValue(Date.parse('2026-01-01T00:02:11.200Z'));
    try {
      const task = {
        agent: 'worker',
        status: 'running',
        mode: 'task',
        model: 'openai-codex-2/gpt-6.1-sol-fast',
        started_at: '2026-01-01T00:00:00.000Z',
        usage: {
          turns: 9,
          input: 19000,
          output: 803,
          cacheRead: 61000,
          cacheWrite: 0,
          cost: 0.1051,
          contextTokens: 19000,
        },
        runtime_metrics: { generationOutputTokens: 204, generationMs: 4000 },
      };
      const render = () =>
        runTool
          .renderResult(
            { details: { tasks: [task] } },
            { isPartial },
            { fg: (_name: string, text: string) => text },
          )
          .render(240)
          .join('\n');
      const first = render();
      expect(first).toContain(
        `usage: 9 turns ↑19k ↓803 R61k $0.1051 ctx:19k · 51 tok/s${isPartial ? '' : ' · ⧗ elapsed 2m 11s'}`,
      );
      if (isPartial) {
        expect(first.split('\n')[0]).toContain(
          'subagent · worker · running · 2m 11s',
        );
        expect(first).not.toContain('⧗ elapsed');
      }
      now.mockReturnValue(Date.parse('2026-01-01T00:02:12.200Z'));
      task.runtime_metrics.generationMs = 8000;
      const second = render();
      expect(second).toContain(
        `ctx:19k · 26 tok/s${isPartial ? '' : ' · ⧗ elapsed 2m 12s'}`,
      );
      if (isPartial) {
        expect(second.split('\n')[0]).toContain(
          'subagent · worker · running · 2m 12s',
        );
        expect(second).not.toContain('⧗ elapsed');
      }
    } finally {
      now.mockRestore();
    }
  });

  it.each([
    { status: 'running', isPartial: true },
    { status: 'running', isPartial: false },
    { status: 'queued', isPartial: true },
    { status: 'queued', isPartial: false },
    { status: 'stopping', isPartial: true },
    { status: 'stopping', isPartial: false },
  ])('floors live foreground elapsed to seconds for $status (partial: $isPartial)', ({
    status,
    isPartial,
  }) => {
    let runTool: any;
    registerSubagentTools(
      {
        registerTool: (tool: any) => {
          if (tool.name === 'subagent_run') runTool = tool;
        },
      },
      env.createManager(env.mockRunner()),
    );
    const now = vi
      .spyOn(Date, 'now')
      .mockReturnValue(Date.parse('2026-01-01T00:00:12.345Z'));
    try {
      const rendered = runTool
        .renderResult(
          {
            details: {
              task: {
                agent: 'worker',
                mode: 'task',
                status,
                started_at: '2026-01-01T00:00:00.000Z',
              },
            },
          },
          { isPartial, expanded: true },
          { fg: (_name: string, text: string) => text },
        )
        .render(200)
        .join('\n');
      expect(rendered).toContain(
        isPartial ? 'subagent · worker · running · 12s' : '⧗ elapsed 12s',
      );
      expect(rendered).not.toContain('12.3s');
    } finally {
      now.mockRestore();
    }
  });

  it.each([
    ['completed', '2026-01-01T00:00:12.345Z', '⧗ elapsed 12.3s'],
    ['completed', '2026-01-01T00:02:11.200Z', '⧗ elapsed 2m 11s'],
    ['failed', '2026-01-01T00:02:11.200Z', '⧗ elapsed 2m 11s'],
    ['cancelled', '2026-01-01T00:02:11.200Z', '⧗ elapsed 2m 11s'],
    ['interrupted', '2026-01-01T00:02:11.200Z', '⧗ elapsed 2m 11s'],
    ['completed', '2026-01-01T02:03:59.999Z', '⧗ elapsed 2h 03m'],
    ['completed', undefined, undefined],
    ['failed', 'invalid', undefined],
  ])('uses a valid ended_at for foreground %s elapsed time (%s)', (status, ended_at, expected) => {
    let runTool: any;
    registerSubagentTools(
      {
        registerTool: (tool: any) => {
          if (tool.name === 'subagent_run') runTool = tool;
        },
      },
      env.createManager(env.mockRunner()),
    );
    const now = vi
      .spyOn(Date, 'now')
      .mockReturnValue(Date.parse('2026-01-01T00:05:00.000Z'));
    try {
      const render = () =>
        runTool
          .renderResult(
            {
              details: {
                task: {
                  agent: 'worker',
                  mode: 'task',
                  status,
                  started_at: '2026-01-01T00:00:00.000Z',
                  ended_at,
                },
              },
            },
            { expanded: true },
            { fg: (_name: string, text: string) => text },
          )
          .render(200)
          .join('\n');
      const first = render();
      if (expected) expect(first).toContain(expected);
      else expect(first).not.toContain('elapsed');
      now.mockReturnValue(Date.parse('2026-01-01T00:10:00.000Z'));
      expect(render()).toBe(first);
    } finally {
      now.mockRestore();
    }
  });

  it.each([
    true,
    false,
  ])('omits unavailable foreground speed and elapsed independently (partial: %s)', (isPartial) => {
    let runTool: any;
    registerSubagentTools(
      {
        registerTool: (tool: any) => {
          if (tool.name === 'subagent_run') runTool = tool;
        },
      },
      env.createManager(env.mockRunner()),
    );
    const task: SubagentTask = {
      id: 'running',
      agent: 'worker',
      mode: 'task',
      status: 'running',
      task: 'work',
      created_at: '2026-01-01T00:00:00.000Z',
    };
    const render = () =>
      runTool
        .renderResult(
          { details: { task } },
          { isPartial },
          { fg: (_name: string, text: string) => text },
        )
        .render(200)
        .join('\n');
    for (const metrics of [
      undefined,
      {},
      { generationOutputTokens: 100 },
      { generationOutputTokens: 0, generationMs: 0 },
      { generationOutputTokens: NaN, generationMs: 1000 },
      { generationOutputTokens: -1, generationMs: 1000 },
      { generationOutputTokens: 100, generationMs: -1 },
      { generationOutputTokens: 100, generationMs: Infinity },
      { generationOutputTokens: Number.MAX_VALUE, generationMs: 1 },
    ]) {
      task.runtime_metrics = metrics;
      const text = render();
      expect(text).not.toContain('tok/s');
      expect(text).not.toContain('elapsed');
      expect(text.split('\n')[0]).not.toContain('running ·');
      expect(text).not.toContain('?');
    }
    task.runtime_metrics = { generationOutputTokens: 0, generationMs: 1000 };
    task.started_at = 'invalid';
    const invalidStart = render();
    expect(invalidStart).toContain('0 tok/s');
    expect(invalidStart).not.toContain('elapsed');
    expect(invalidStart.split('\n')[0]).not.toContain('running ·');
    const now = vi
      .spyOn(Date, 'now')
      .mockReturnValue(Date.parse('2026-01-01T00:00:00.900Z'));
    try {
      task.runtime_metrics = undefined;
      task.started_at = '2026-01-01T00:00:00.000Z';
      const elapsedOnly = render();
      expect(elapsedOnly).toContain(
        isPartial ? 'subagent · worker · running · 0s' : '⧗ elapsed 0s',
      );
      expect(elapsedOnly).not.toContain('tok/s');
      if (isPartial) {
        expect(elapsedOnly).not.toContain('↳ usage:');
        expect(elapsedOnly).not.toContain('⧗ elapsed');
      }
      task.started_at = '2026-01-01T00:00:01.000Z';
      expect(render()).toContain(
        isPartial ? 'subagent · worker · running · 0s' : '⧗ elapsed 0s',
      );
    } finally {
      now.mockRestore();
    }
  });

  it('refreshes foreground runtime metrics from execution partial updates', async () => {
    env.writeAgent('worker');
    const manager = env.createManager(async ({ onActivity }) => {
      onActivity?.({
        message: 'first generation measured',
        diagnostic: true,
        runtime_metrics: { generationOutputTokens: 204, generationMs: 4000 },
      });
      onActivity?.({
        message: 'second generation measured',
        diagnostic: true,
        runtime_metrics: { generationOutputTokens: 408, generationMs: 12000 },
      });
      return { result: 'done' };
    });
    let runTool: any;
    registerSubagentTools(
      {
        registerTool: (tool: any) => {
          if (tool.name === 'subagent_run') runTool = tool;
        },
      },
      manager,
    );
    const runningLines: string[] = [];
    await runTool.execute(
      '1',
      { agent: 'worker', task: 'work', mode: 'task' },
      undefined,
      (partial: any) => {
        if (partial.details.tasks[0]?.status !== 'running') return;
        runningLines.push(
          runTool
            .renderResult(
              partial,
              { isPartial: true },
              { fg: (_name: string, text: string) => text },
            )
            .render(200)
            .join('\n'),
        );
      },
      { cwd: env.tmp },
    );
    expect(runningLines.some((line) => line.includes('51 tok/s'))).toBe(true);
    expect(runningLines.some((line) => line.includes('34 tok/s'))).toBe(true);
    for (const rendered of runningLines) {
      expect(rendered.split('\n')[0]).toMatch(
        /subagent · worker · running · \d+s/,
      );
      expect(rendered).not.toContain('⧗ elapsed');
    }
  });

  it.each([
    { frame: 0, glyph: '⠋' },
    { frame: 1, glyph: '⠙' },
  ])('renders foreground running state as a single framed box with spinner frame $frame', ({
    frame,
    glyph,
  }) => {
    let runTool: any;
    registerSubagentTools(
      {
        registerTool: (tool: any) => {
          if (tool.name === 'subagent_run') runTool = tool;
        },
      },
      env.createManager(env.mockRunner()),
    );

    const activePartial = {
      details: {
        frame,
        tasks: [
          {
            agent: 'sdd-verify',
            status: 'running',
            mode: 'task',
            attempt: 1,
            effort: 'medium',
            model: 'mock/model',
            task: 'verify the implementation',
          },
        ],
      },
    };

    const lines = runTool
      .renderResult(
        activePartial,
        { isPartial: true },
        {
          fg: (_name: string, text: string) => text,
          bold: (text: string) => text,
        },
      )
      .render(80);
    expect(lines[0]).toMatch(/^╭─+ .+subagent · sdd-verify · running ─+╮$/);
    expect(lines[0]).toContain(glyph);
    expect(lines[0]).not.toContain('⤓');
    expect(lines.some((l: string) => l.includes('│'))).toBe(true);
    expect(lines.at(-1)).toMatch(/^╰─+╯$/);
    expect(lines.join('\n')).not.toContain('\x1b[4');
  });

  it.each([
    { status: 'completed', glyph: '✓' },
    { status: 'failed', glyph: '✗' },
    { status: 'cancelled', glyph: '■' },
  ])('keeps the $status glyph in background subagent_run headers', ({
    status,
    glyph,
  }) => {
    let runTool: any;
    registerSubagentTools(
      {
        registerTool: (tool: any) => {
          if (tool.name === 'subagent_run') runTool = tool;
        },
      },
      env.createManager(env.mockRunner()),
    );

    const lines = runTool
      .renderResult(
        {
          details: {
            task: {
              id: 'subtask_123',
              agent: 'sdd-verify',
              mode: 'background',
              status,
              task: 'verify',
            },
          },
        },
        { expanded: false, isPartial: false },
        {
          fg: (_name: string, text: string) => text,
          bold: (text: string) => text,
        },
      )
      .render(80);
    expect(lines[0]).toContain(glyph);
    expect(lines[0]).not.toContain('⤓');
  });

  it.each([
    'running',
    'queued',
  ])('renders background %s execution state as a single framed box with (background) integrated in top-border title', async (status) => {
    env.writeAgent('sdd-verify');
    const manager = env.createManager(env.mockRunner());
    let runTool: any;
    registerSubagentTools(
      {
        registerTool: (tool: any) => {
          if (tool.name === 'subagent_run') runTool = tool;
        },
      },
      manager,
    );

    const bgResult = {
      details: {
        mode: 'background',
        task_ids: ['subtask_123'],
        task: {
          id: 'subtask_123',
          agent: 'sdd-verify',
          status,
          mode: 'background',
          model: 'mock/model',
          effort: 'medium',
          task: 'verify task',
        },
      },
    };

    // Call rendering produces 0 lines (no text outside the frame)
    const callLines = runTool
      .renderCall(
        { agent: 'sdd-verify', mode: 'background' },
        {
          fg: (_name: string, text: string) => text,
          bold: (text: string) => text,
        },
      )
      .render(80);
    expect(callLines).toHaveLength(0);
    expect(callLines.join('\n')).toBe('');

    const lines = runTool
      .renderResult(
        bgResult,
        { expanded: false, isPartial: false },
        {
          fg: (_name: string, text: string) => text,
          bold: (text: string) => text,
        },
      )
      .render(80);
    expect(lines[0]).toMatch(/^╭─+ .+ ─+╮$/);
    expect(lines[0]).toContain(
      `subagent · sdd-verify · ${status} (background)`,
    );
    expect(lines[0]).toContain('⤓');
    expect(lines[0]).not.toContain('⠋');
    expect(lines[1]).toContain('subagent: sdd-verify');
    expect(lines[1]).toContain(`status: ${status}`);
    expect(lines.join('\n')).toContain('click to view execution');
    expect(lines.at(-1)).toMatch(/^╰─+╯$/);
    expect(lines.join('\n')).not.toContain('\x1b[4');
  });

  it('produces one transparent single frame for background running execution with all info inside and zero project-owned background escapes', async () => {
    env.writeAgent('sdd-verify');
    const manager = env.createManager(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return {
        result: 'verified',
        model: 'cliproxyapi/j0k3r/gemini-3.8-flash-high',
        effort: 'medium',
        fallback_used: false,
      };
    });
    let runTool: any;
    registerSubagentTools(
      {
        registerTool: (tool: any) => {
          if (tool.name === 'subagent_run') runTool = tool;
        },
      },
      manager,
    );

    const result = await runTool.execute(
      '1',
      {
        agent: 'sdd-verify',
        task: 'verify the implementation',
        mode: 'background',
      },
      undefined,
      undefined,
      { cwd: env.tmp },
    );

    // 1. Tool call produces zero lines outside the frame
    const callLines = runTool
      .renderCall(
        { agent: 'sdd-verify', mode: 'background' },
        {
          fg: (_name: string, text: string) => text,
          bold: (text: string) => text,
        },
      )
      .render(120);
    expect(callLines).toHaveLength(0);
    expect(callLines.join('\n')).toBe('');

    // 2. Result is one single framed card with integrated title
    const resultLines = runTool
      .renderResult(
        result,
        { expanded: false, isPartial: false },
        {
          fg: (_name: string, text: string) => text,
          bold: (text: string) => text,
        },
      )
      .render(120);
    expect(resultLines[0]).toContain('╭─');
    expect(resultLines[0]).toContain('╮');
    expect(resultLines[0]).toContain('⤓');
    expect(resultLines[0]).not.toContain('⠋');
    expect(resultLines[0]).toContain(
      'subagent · sdd-verify · running (background)',
    );

    // Interior lines:
    expect(resultLines[1]).toContain('subagent: sdd-verify');
    expect(resultLines[1]).toContain('status: running');
    expect(resultLines.join('\n')).toContain('click to view execution');
    expect(resultLines.at(-1)).toContain('╰');
    expect(resultLines.at(-1)).toContain('╯');

    // 3. No project-owned background fills or ANSI background color escapes
    const renderedFull = resultLines.join('\n');
    expect(renderedFull).not.toContain('\x1b[4');

    // 4. Raw task IDs remain hidden in visible UI and preserved in structured details
    const rawTaskId = result.details.task_ids[0];
    expect(rawTaskId).toMatch(/^subtask_sdd-verify_/);
    expect(env.stripAnsi(renderedFull)).not.toContain(rawTaskId);
    expect(env.stripAnsi(renderedFull)).not.toContain('id: subtask_');
  });

  it('renders friendly display_name in titles and hides raw task IDs from visible output', async () => {
    env.writeAgent('analyst');
    const manager = env.createManager(async () => ({
      result: 'audited codebase',
      model: 'mock/model',
      fallback_used: false,
    }));
    let runTool: any;
    registerSubagentTools(
      {
        registerTool: (tool: any) => {
          if (tool.name === 'subagent_run') runTool = tool;
        },
      },
      manager,
    );

    // 1. With display_name
    const withNameResult = await runTool.execute(
      '1',
      {
        agent: 'analyst',
        task: 'audit security',
        display_name: 'Security Audit Pass',
        mode: 'task',
      },
      undefined,
      undefined,
      { cwd: env.tmp },
    );
    const renderedWithName = env.stripAnsi(
      runTool
        .renderResult(
          withNameResult,
          { expanded: false },
          { fg: (_name: string, text: string) => text },
        )
        .render(120)
        .join('\n'),
    );
    expect(renderedWithName).toContain('Security Audit Pass');
    expect(renderedWithName).toContain('subagent: analyst');
    expect(renderedWithName).toContain('ctrl+o to expand');
    expect(renderedWithName).not.toContain('id: subtask_');
    expect(renderedWithName).not.toContain('subtask_analyst_');

    // 2. Without display_name (deterministic fallback)
    const withoutNameResult = await runTool.execute(
      '2',
      {
        agent: 'analyst',
        task: 'inspect dependencies',
        mode: 'task',
      },
      undefined,
      undefined,
      { cwd: env.tmp },
    );
    const renderedWithoutName = env.stripAnsi(
      runTool
        .renderResult(
          withoutNameResult,
          { expanded: false },
          { fg: (_name: string, text: string) => text },
        )
        .render(120)
        .join('\n'),
    );
    expect(renderedWithoutName).toContain('analyst · inspect dependencies');
    expect(renderedWithoutName).toContain('subagent: analyst');
    expect(renderedWithoutName).toContain('ctrl+o to expand');
    expect(renderedWithoutName).not.toContain('id: subtask_');
    expect(renderedWithoutName).not.toContain('subtask_analyst_');
  });

  it('renders result and response sections only when actual non-whitespace response text exists', async () => {
    const { renderSubagentResult } = await import(
      '../../src/render/tools/subagent-result.js'
    );
    const theme = { fg: (_name: string, text: string) => text };

    // Case 1: Empty string result
    const emptyResult = {
      details: {
        task: {
          id: 'subtask_empty_res',
          agent: 'analyst',
          status: 'completed',
          result: '',
          output_preview: 'some activity preview',
        },
      },
    };
    const renderedEmpty = env.stripAnsi(
      renderSubagentResult(emptyResult, { expanded: true }, theme)
        .render(100)
        .join('\n'),
    );
    expect(renderedEmpty).not.toContain('Subagent response');
    expect(renderedEmpty).not.toContain('Subagent result ·');
    expect(renderedEmpty).toContain('Subagent ·');

    // Case 2: Whitespace-only result
    const whitespaceResult = {
      details: {
        task: {
          id: 'subtask_ws_res',
          agent: 'analyst',
          status: 'completed',
          result: '   \n  \t  ',
        },
      },
    };
    const renderedWs = env.stripAnsi(
      renderSubagentResult(whitespaceResult, { expanded: true }, theme)
        .render(100)
        .join('\n'),
    );
    expect(renderedWs).not.toContain('Subagent response');
    expect(renderedWs).not.toContain('Subagent result ·');
    expect(renderedWs).toContain('Subagent ·');

    // Case 3: Undefined result (e.g. running or failed without response)
    const runningTask = {
      details: {
        task: {
          id: 'subtask_running_res',
          agent: 'analyst',
          status: 'running',
          output_preview: 'in progress',
        },
      },
    };
    const renderedRunning = env.stripAnsi(
      renderSubagentResult(runningTask, { expanded: false }, theme)
        .render(100)
        .join('\n'),
    );
    expect(renderedRunning).not.toContain('Subagent result ·');
    expect(renderedRunning).not.toContain('response:');
    expect(renderedRunning).toContain('Subagent ·');

    // Case 4: Error-only task
    const failedTask = {
      details: {
        task: {
          id: 'subtask_failed_no_res',
          agent: 'analyst',
          status: 'failed',
          error: 'fatal crash occurred',
        },
      },
    };
    const renderedFailed = env.stripAnsi(
      renderSubagentResult(failedTask, { expanded: true }, theme)
        .render(100)
        .join('\n'),
    );
    expect(renderedFailed).not.toContain('Subagent response');
    expect(renderedFailed).toContain('Subagent error');
    expect(renderedFailed).toContain('fatal crash occurred');

    // Case 5: Valid non-whitespace response
    const validTask = {
      details: {
        task: {
          id: 'subtask_valid_res',
          agent: 'analyst',
          status: 'completed',
          result: 'All unit tests passed with 100% coverage.',
        },
      },
    };
    const renderedValid = env.stripAnsi(
      renderSubagentResult(validTask, { expanded: true }, theme)
        .render(100)
        .join('\n'),
    );
    expect(renderedValid).toContain('Subagent result ·');
    expect(renderedValid).toContain('Subagent response');
    expect(renderedValid).toContain(
      'All unit tests passed with 100% coverage.',
    );
  });

  it('registers all 8 public subagent tools with boxed single-frame contracts (renderShell: self, empty call)', () => {
    fs.writeFileSync(
      path.join(env.tmp, '.pi', 'subagents.json'),
      JSON.stringify({ enable_continue: true }),
    );
    const registered: Record<string, any> = {};
    const manager = env.createManager(env.mockRunner());
    registerSubagentTools(
      {
        registerTool: (tool: any) => {
          registered[tool.name] = tool;
        },
      },
      manager,
      env.tmp,
    );

    const expectedTools = [
      'subagent_list_agents',
      'subagent_run',
      'subagent_continue',
      'subagent_status',
      'subagent_result',
      'subagent_list_tasks',
      'subagent_cancel',
      'subagent_send_message',
    ];

    expect(Object.keys(registered).sort()).toEqual(expectedTools.sort());

    for (const name of expectedTools) {
      const tool = registered[name];
      expect(tool.renderShell, `${name} should have renderShell: self`).toBe(
        'self',
      );
      expect(typeof tool.renderResult, `${name} should have renderResult`).toBe(
        'function',
      );
      if (tool.renderCall) {
        const callLines = tool
          .renderCall(
            {},
            { fg: (_n: string, t: string) => t, bold: (t: string) => t },
          )
          .render(80);
        expect(
          callLines,
          `${name} renderCall should be empty to prevent duplicate rows`,
        ).toHaveLength(0);
      }
    }
  });

  it('renders all 8 public subagent tools with boxed layout, ARCH_ICON header, and width safety in both collapsed and expanded states', () => {
    fs.writeFileSync(
      path.join(env.tmp, '.pi', 'subagents.json'),
      JSON.stringify({ enable_continue: true }),
    );
    const registered: Record<string, any> = {};
    const manager = env.createManager(env.mockRunner());
    registerSubagentTools(
      {
        registerTool: (tool: any) => {
          registered[tool.name] = tool;
        },
      },
      manager,
      env.tmp,
    );
    const theme = { fg: (_n: string, t: string) => t, bold: (t: string) => t };

    const sampleTask = {
      id: 'subtask_test_123',
      agent: 'analyst',
      status: 'completed',
      attempt: 1,
      model: 'mock/model',
      effort: 'high',
      result: 'task response text',
    };

    const toolResults: Record<string, any> = {
      subagent_list_agents: {
        details: { agents: [{ name: 'analyst', tools: ['read'] }] },
      },
      subagent_run: { details: { task: sampleTask } },
      subagent_continue: { details: { task: sampleTask } },
      subagent_status: { details: { task: sampleTask } },
      subagent_result: {
        details: { task: sampleTask, full_result: 'task response text' },
      },
      subagent_list_tasks: { details: { tasks: [sampleTask] } },
      subagent_cancel: { details: { task: sampleTask } },
      subagent_send_message: {
        details: {
          status: 'queued',
          task_id: 'subtask_test_123',
          message: 'steer this',
        },
      },
    };

    for (const [name, result] of Object.entries(toolResults)) {
      const tool = registered[name];

      // Collapsed
      const collapsedLines = tool
        .renderResult(result, { expanded: false, isPartial: false }, theme)
        .render(80);
      expect(collapsedLines[0], `${name} collapsed top border`).toContain('╭─');
      expect(collapsedLines[0], `${name} collapsed top border`).toContain('╮');
      expect(
        collapsedLines[0],
        `${name} collapsed status/brand icon`,
      ).toContain(
        [
          'subagent_run',
          'subagent_continue',
          'subagent_status',
          'subagent_result',
        ].includes(name)
          ? '✓'
          : '󰣇',
      );
      expect(
        collapsedLines.some((l: string) => l.includes('│')),
        `${name} collapsed vertical border`,
      ).toBe(true);
      expect(
        collapsedLines.at(-1),
        `${name} collapsed bottom border`,
      ).toContain('╰');
      expect(
        collapsedLines.at(-1),
        `${name} collapsed bottom border`,
      ).toContain('╯');

      // Expanded
      const expandedLines = tool
        .renderResult(result, { expanded: true, isPartial: false }, theme)
        .render(80);
      expect(expandedLines[0], `${name} expanded top border`).toContain('╭─');
      expect(expandedLines[0], `${name} expanded top border`).toContain('╮');
      expect(expandedLines[0], `${name} expanded status/brand icon`).toContain(
        [
          'subagent_run',
          'subagent_continue',
          'subagent_status',
          'subagent_result',
        ].includes(name)
          ? '✓'
          : '󰣇',
      );
      expect(
        expandedLines.some((l: string) => l.includes('│')),
        `${name} expanded vertical border`,
      ).toBe(true);
      expect(expandedLines.at(-1), `${name} expanded bottom border`).toContain(
        '╰',
      );
      expect(expandedLines.at(-1), `${name} expanded bottom border`).toContain(
        '╯',
      );

      // Narrow width safety
      const narrowLines = tool
        .renderResult(result, { expanded: false, isPartial: false }, theme)
        .render(35);
      expect(
        narrowLines.every((l: string) => [...env.stripAnsi(l)].length <= 35),
        `${name} width safe at 35`,
      ).toBe(true);
    }
  });

  it('dynamically adapts expansion hints when app.tools.expand keybinding changes and falls back to ctrl+o', () => {
    fs.writeFileSync(
      path.join(env.tmp, '.pi', 'subagents.json'),
      JSON.stringify({ enable_continue: true }),
    );
    const registered: Record<string, any> = {};
    const manager = env.createManager(env.mockRunner());
    registerSubagentTools(
      {
        registerTool: (tool: any) => {
          registered[tool.name] = tool;
        },
      },
      manager,
      env.tmp,
    );
    const theme = { fg: (_n: string, t: string) => t, bold: (t: string) => t };

    const sampleTask = {
      id: 'subtask_kb_123',
      agent: 'analyst',
      status: 'completed',
      attempt: 1,
      model: 'mock/model',
      effort: 'high',
      result: 'kb response',
    };

    const toolResults: Record<string, any> = {
      subagent_list_agents: {
        details: { agents: [{ name: 'analyst', tools: ['read'] }] },
      },
      subagent_run: { details: { task: sampleTask } },
      subagent_status: { details: { task: sampleTask } },
      subagent_result: { details: { task: sampleTask } },
      subagent_list_tasks: { details: { tasks: [sampleTask] } },
      subagent_cancel: { details: { task: sampleTask } },
      subagent_send_message: {
        details: {
          status: 'queued',
          task_id: 'subtask_kb_123',
          message: 'steer this',
        },
      },
    };

    try {
      // 1. Configure custom keybinding 'ctrl+e'
      setExpandKeybindingProviderForTests((kb) =>
        kb === 'app.tools.expand' ? 'ctrl+e' : undefined,
      );

      for (const [name, result] of Object.entries(toolResults)) {
        const tool = registered[name];
        const collapsedText = tool
          .renderResult(result, { expanded: false }, theme)
          .render(100)
          .join('\n');
        expect(
          collapsedText,
          `${name} should use custom keybinding ctrl+e`,
        ).toContain('ctrl+e to expand');
        expect(
          collapsedText,
          `${name} should NOT contain hardcoded ctrl+o`,
        ).not.toContain('ctrl+o to expand');
      }

      // 2. Reset provider -> should fall back to 'ctrl+o'
      resetExpandKeybindingProviderForTests();

      for (const [name, result] of Object.entries(toolResults)) {
        const tool = registered[name];
        const collapsedText = tool
          .renderResult(result, { expanded: false }, theme)
          .render(100)
          .join('\n');
        expect(collapsedText, `${name} should fall back to ctrl+o`).toContain(
          'ctrl+o to expand',
        );
      }
    } finally {
      resetExpandKeybindingProviderForTests();
    }
  });

  it('renders subagent_status and subagent_send_message error and rejected states with boxed frames', () => {
    fs.writeFileSync(
      path.join(env.tmp, '.pi', 'subagents.json'),
      JSON.stringify({ enable_continue: true }),
    );
    const registered: Record<string, any> = {};
    const manager = env.createManager(env.mockRunner());
    registerSubagentTools(
      {
        registerTool: (tool: any) => {
          registered[tool.name] = tool;
        },
      },
      manager,
      env.tmp,
    );
    const theme = { fg: (_n: string, t: string) => t, bold: (t: string) => t };

    // subagent_status: task not found (isError / no task)
    const statusErrorResult = {
      isError: true,
      content: [{ type: 'text', text: 'Subagent task not found' }],
    };
    const statusErrorLines = registered.subagent_status
      .renderResult(statusErrorResult, { expanded: false }, theme)
      .render(80);
    expect(statusErrorLines[0]).toContain('subagent status · failed');
    expect(statusErrorLines[1]).toContain('Subagent task not found');

    // subagent_status: background task running
    const bgTask = {
      id: 'bg_1',
      agent: 'analyst',
      status: 'running',
      mode: 'background',
      model: 'm',
      effort: 'low',
    };
    const statusBgLines = registered.subagent_status
      .renderResult({ details: { task: bgTask } }, { expanded: false }, theme)
      .render(80);
    expect(statusBgLines[0]).toContain(
      'subagent status · analyst · running (background)',
    );

    // subagent_send_message: rejected
    const rejectedResult = {
      details: {
        status: 'rejected',
        task_id: 't_1',
        reason: 'unsupported_runtime',
        message: 'Pi runtime too old',
      },
    };
    const sendRejectedLines = registered.subagent_send_message
      .renderResult(rejectedResult, { expanded: false }, theme)
      .render(80);
    expect(sendRejectedLines[0]).toContain('subagent send message · rejected');
    expect(sendRejectedLines[1]).toContain('status: rejected');
    expect(sendRejectedLines[1]).toContain('task_id: t_1');

    const sendRejectedExpanded = registered.subagent_send_message
      .renderResult(rejectedResult, { expanded: true }, theme)
      .render(80)
      .join('\n');
    expect(sendRejectedExpanded).toContain('reason: unsupported_runtime');
    expect(sendRejectedExpanded).toContain('Pi runtime too old');

    // subagent_send_message: queued
    const queuedResult = {
      details: {
        status: 'queued',
        task_id: 't_1',
        message: 'keep going',
        pending_message_count: 2,
      },
    };
    const sendQueuedExpanded = registered.subagent_send_message
      .renderResult(queuedResult, { expanded: true }, theme)
      .render(80)
      .join('\n');
    expect(sendQueuedExpanded).toContain('subagent send message · queued');
    expect(sendQueuedExpanded).toContain('pending messages: 2');
    expect(sendQueuedExpanded).toContain('keep going');
  });

  it('triggers registered panel opener when subagent run result component receives a mouse click', async () => {
    const {
      registerSubagentsPanelOpener,
      resetSubagentsPanelOpenerStateForTests,
    } = await import('../../src/ui/panel-overlay.js');
    const openedTasks: string[] = [];
    registerSubagentsPanelOpener((taskId?: string) => {
      if (taskId) openedTasks.push(taskId);
    });

    try {
      const manager = env.createManager(env.mockRunner());
      let runTool: any;
      registerSubagentTools(
        {
          registerTool: (tool: any) => {
            if (tool.name === 'subagent_run') runTool = tool;
          },
        },
        manager,
      );

      const taskResult = {
        details: {
          task: {
            id: 'subtask_click_test_123',
            agent: 'discovery',
            status: 'running',
            mode: 'background',
          },
        },
      };

      const component = runTool.renderResult(
        taskResult,
        { expanded: false, isPartial: false },
        { fg: (_n: string, t: string) => t },
      );
      expect(typeof component.handleMouse).toBe('function');

      const mouseResult = component.handleMouse({
        type: 'click',
        button: 'left',
      });
      expect(mouseResult).toEqual({ handled: true });
      expect(openedTasks).toEqual(['subtask_click_test_123']);

      // Partial component also responds to click
      resetSubagentsPanelOpenerStateForTests();
      const partialComponent = runTool.renderResult(
        taskResult,
        { expanded: false, isPartial: true },
        { fg: (_n: string, t: string) => t },
      );
      expect(typeof partialComponent.handleMouse).toBe('function');
      const partialMouseResult = partialComponent.handleMouse({
        type: 'click',
        button: 'left',
      });
      expect(partialMouseResult).toEqual({ handled: true });
      expect(openedTasks).toEqual([
        'subtask_click_test_123',
        'subtask_click_test_123',
      ]);
    } finally {
      registerSubagentsPanelOpener(undefined);
    }
  });
});
