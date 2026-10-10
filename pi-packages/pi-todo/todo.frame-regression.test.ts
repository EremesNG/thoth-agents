import {
  initTheme,
  ToolExecutionComponent,
} from '@earendil-works/pi-coding-agent';
import {
  stripTerminalSequences,
  type TUI,
  visibleWidth,
} from '@earendil-works/pi-tui';
import { registerRenderKit, withdrawRenderKit } from '@thoth-agents/pi-core';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { createRenderKit } from '../pi-thoth-theme/src/render-kit/index.ts';
import { createMockCtx, createMockPi } from './test/helpers.js';
import { registerTodoTool, setActiveRenderSession } from './todo.js';

let token: ReturnType<typeof registerRenderKit> | undefined;
beforeAll(() => initTheme('dark', false));
afterEach(() => {
  if (token) withdrawRenderKit(token);
  token = undefined;
  vi.restoreAllMocks();
});

it.each([
  { populated: false, mode: 'nerd' as const, glyph: '\uf00c', separator: '·' },
  { populated: true, mode: 'nerd' as const, glyph: '\uf00c', separator: '·' },
  { populated: false, mode: 'ascii' as const, glyph: '+', separator: '|' },
  { populated: true, mode: 'ascii' as const, glyph: '+', separator: '|' },
])('keeps the list call and short result framed with the real KIT and SDK (populated=$populated, mode=$mode)', async ({
  populated,
  mode,
  glyph,
  separator,
}) => {
  vi.spyOn(Date, 'now').mockReturnValue(0);
  token = registerRenderKit(createRenderKit({}, undefined, mode), {});
  setActiveRenderSession('test-session');
  const { pi, captured } = createMockPi();
  registerTodoTool(pi);
  const tool = captured.tools.get('todo');
  if (!tool) throw new Error('missing todo tool');
  const ctx = createMockCtx();
  if (populated) {
    await tool.execute(
      'seed',
      { action: 'create', subject: 'write tests' },
      undefined,
      undefined,
      ctx,
    );
  }
  const args = populated
    ? { action: 'list', status: 'pending' }
    : { action: 'list' };
  const component = new ToolExecutionComponent(
    'todo',
    'list-call',
    args,
    {},
    tool,
    { requestRender() {} } as unknown as TUI,
    '.',
  );
  component.markExecutionStarted();
  component.setArgsComplete();
  component.render(40);
  const result = await tool.execute(
    'list-call',
    args,
    undefined,
    undefined,
    ctx,
  );
  component.updateResult({ ...result, isError: false });

  for (const expanded of [false, true]) {
    component.setExpanded(expanded);
    for (const width of [24, 40, 80]) {
      const rows = component.render(width).slice(1);
      const plain = rows.map(stripTerminalSequences);
      const bodyRows = populated ? 2 : 1;
      expect(plain).toHaveLength(bodyRows + 2);
      expect(plain[0]).toMatch(/^╭.*╮$/);
      expect(plain[1]).toMatch(/^│ list.*│$/);
      if (populated) {
        expect(plain[2]).toContain(expanded ? 'write tests' : 'more lines');
      } else {
        expect(plain[1]).toContain('no tasks');
      }
      expect(plain.at(-1)).toContain(`${glyph} ${separator} 0s`);
      expect(plain.at(-1)).toMatch(/^╰.*╯$/);
      expect(rows.map(visibleWidth)).toEqual(rows.map(() => width));
      // These fixture rows contain only one-cell text in the operator's
      // terminal. Catch SDK/terminal disagreement, not just SDK self-consistency.
      expect(plain.map((row) => row.length)).toEqual(rows.map(() => width));
    }
  }
});

it.each([
  { mode: 'nerd' as const, ok: '\uf00c' },
  { mode: 'ascii' as const, ok: '+' },
])('shows the failed footer and error tone for a missing id without the SDK error flag (mode=$mode)', async ({
  mode,
  ok,
}) => {
  vi.spyOn(Date, 'now').mockReturnValue(0);
  token = registerRenderKit(createRenderKit({}, undefined, mode), {});
  setActiveRenderSession('test-session');
  const { pi, captured } = createMockPi();
  registerTodoTool(pi);
  const tool = captured.tools.get('todo');
  if (!tool) throw new Error('missing todo tool');
  const ctx = createMockCtx();
  const mount = async (args: Record<string, unknown>, isError: boolean) => {
    const component = new ToolExecutionComponent(
      'todo',
      'missing-call',
      args,
      {},
      tool,
      { requestRender() {} } as unknown as TUI,
      '.',
    );
    component.markExecutionStarted();
    component.setArgsComplete();
    component.render(40);
    const result = await tool.execute(
      'missing-call',
      args,
      undefined,
      undefined,
      ctx,
    );
    expect(
      (result.details as { error?: string } | undefined)?.error,
    ).toBeTruthy();
    component.updateResult({ ...result, isError });
    return component.render(60);
  };
  for (const args of [
    { action: 'get', id: 99 },
    { action: 'update', id: 99, status: 'completed' },
    { action: 'delete', id: 99 },
  ]) {
    const flagged = await mount(args, true);
    const unflagged = await mount(args, false);
    const footer = stripTerminalSequences(unflagged.at(-2) ?? '');
    expect(footer).not.toContain(ok);
    // Identical to the SDK-flagged error, including border/background tone.
    expect(unflagged).toEqual(flagged);
  }
});
