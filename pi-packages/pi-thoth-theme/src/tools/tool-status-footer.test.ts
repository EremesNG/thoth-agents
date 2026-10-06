import type {
  ExtensionAPI,
  ToolRendererResolver,
} from '@earendil-works/pi-coding-agent';
import {
  initTheme,
  ToolExecutionComponent,
} from '@earendil-works/pi-coding-agent';
import { stripTerminalSequences, type TUI } from '@earendil-works/pi-tui';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { ThemeConfig } from '../shared/config.ts';
import { registerTools } from './index.ts';

const config: ThemeConfig = {
  icons: 'ascii',
  statusLine: { enabled: false, subscriptionProviders: [] },
  tools: { enabled: true },
  welcome: { enabled: false },
};
const args = {
  command: 'echo ok',
  path: 'file.ts',
  pattern: 'ok',
  content: 'one\ntwo',
};
let resolver: ToolRendererResolver;
let dispose: () => void;

beforeAll(() => initTheme('dark', false));
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  dispose = registerTools(
    {
      registerToolRenderer(registered: ToolRendererResolver) {
        resolver = registered;
      },
      on(
        event: string,
        handler: (event: unknown, ctx: { hasUI: boolean }) => void,
      ) {
        if (event === 'session_start') handler({}, { hasUI: true });
        return () => {};
      },
    } as unknown as ExtensionAPI,
    config,
  );
});
afterEach(() => {
  dispose();
  expect(vi.getTimerCount()).toBe(0);
  vi.useRealTimers();
});

function createHost(name: string) {
  const requestRender = vi.fn();
  const component = new ToolExecutionComponent(
    name,
    `footer-${name}`,
    args,
    { showImages: false },
    resolver(name, () => undefined),
    { requestRender } as unknown as TUI,
    process.cwd(),
  );
  component.markExecutionStarted();
  return { component, requestRender };
}

function footer(component: ToolExecutionComponent) {
  return stripTerminalSequences(component.render(120).at(-1) ?? '');
}

const tools = [
  { name: 'bash', summary: 'Exit 0 · 1 line · ~1 words' },
  { name: 'powershell', summary: 'Exit 0 · 1 line · ~1 words' },
  { name: 'custom_tool', summary: '1 line' },
  { name: 'read', summary: '' },
  { name: 'edit', summary: '+1 -1 · 1 file' },
  { name: 'write', summary: '+2 lines · 1 file' },
  { name: 'grep', summary: '' },
  { name: 'find', summary: '' },
  { name: 'ls', summary: '' },
];

describe.each(tools)('$name standard tool status footer', ({
  name,
  summary,
}) => {
  it.each([
    false,
    true,
  ])('animates calls and partial output, then freezes the terminal footer (isError=%s) and stops the ticker', (isError) => {
    const { component, requestRender } = createHost(name);
    expect(footer(component)).toContain('╰── △ · 0s ');
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(1000);
    expect(requestRender).toHaveBeenCalled();
    expect(footer(component)).toContain('╰── ◭ · 1s ');
    component.updateResult(
      {
        content: [{ type: 'text', text: 'ok' }],
        details: { diff: '+new\n-old' },
        isError,
      },
      true,
    );
    expect(footer(component)).toContain('╰── ◭ · 1s ');
    expect(footer(component)).not.toMatch(/Exit|Done|Error|1 line|1 file/);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(4000);
    expect(footer(component)).toContain('╰── ◭ · 5s ');
    component.updateResult(
      {
        content: [
          { type: 'text', text: isError ? 'Command exited with code 7' : 'ok' },
        ],
        details: { diff: '+new\n-old' },
        isError,
      },
      false,
    );
    const terminal = footer(component);
    expect(terminal).toContain(`╰── ${isError ? '✗' : '✓'} · 5s`);
    if (!isError && summary) expect(terminal).toContain(` · ${summary} `);
    if (isError && ['bash', 'powershell'].includes(name)) {
      expect(terminal).toContain(' · Exit 7 · ');
    }
    expect(terminal).not.toMatch(/Done|Error/);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(10000);
    component.setExpanded(true);
    component.invalidate();
    expect(footer(component)).toBe(terminal);
  });

  it('stops an active timer when the theme is disposed', () => {
    const { component } = createHost(name);
    footer(component);
    expect(vi.getTimerCount()).toBe(1);
    dispose();
    component.invalidate();
    footer(component);
    expect(vi.getTimerCount()).toBe(0);
  });
});
