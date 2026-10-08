import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionToolContext,
  ExtensionUIContext,
  Theme,
  ToolDefinition,
} from '@earendil-works/pi-coding-agent';
import type { EventBus } from '@thoth-agents/pi-core';
import { vi } from 'vitest';

export function createEventBus(): EventBus {
  const handlers = new Map<string, Set<(value: unknown) => void>>();
  return {
    emit(channel, value) {
      for (const handler of handlers.get(channel) ?? []) handler(value);
    },
    on(channel, handler) {
      const listeners = handlers.get(channel) ?? new Set();
      listeners.add(handler);
      handlers.set(channel, listeners);
      return () => {
        listeners.delete(handler);
      };
    },
  };
}

export function makeTheme(overrides: Partial<Theme> = {}): Theme {
  return {
    fg: (_color: string, text: string) => text,
    bg: (_color: string, text: string) => text,
    bold: (text: string) => text,
    strikethrough: (text: string) => text,
    ...overrides,
  } as unknown as Theme;
}

export function createMockUI(
  overrides: Partial<Omit<ExtensionUIContext, 'theme'>> & {
    theme?: unknown;
  } = {},
) {
  return {
    theme: makeTheme(),
    setWidget: vi.fn(),
    setEditorComponent: vi.fn(),
    setFooter: vi.fn(),
    notify: vi.fn(),
    ...overrides,
  };
}

export function createMockCtx(
  options: {
    sessionId?: string;
    hasUI?: boolean;
    mode?: string;
    branch?: unknown[];
    ui?: ReturnType<typeof createMockUI>;
  } = {},
) {
  return {
    hasUI: options.hasUI ?? true,
    mode: options.mode,
    isIdle: () => true,
    ui: options.ui ?? createMockUI(),
    sessionManager: {
      getSessionId: vi.fn(() => options.sessionId ?? 'test-session'),
      getBranch: vi.fn(() => options.branch ?? []),
    },
  } as unknown as ExtensionCommandContext & ExtensionToolContext;
}

type Handler = (event: never, ctx: never) => unknown;

export function createMockPi() {
  const captured = {
    tools: new Map<string, ToolDefinition>(),
    commands: new Map<string, Parameters<ExtensionAPI['registerCommand']>[1]>(),
    shortcuts: new Map<
      string,
      Parameters<ExtensionAPI['registerShortcut']>[1]
    >(),
    events: new Map<string, Handler[]>(),
  };
  const events = createEventBus();
  const pi = {
    events,
    registerTool: (tool: ToolDefinition) => captured.tools.set(tool.name, tool),
    registerCommand: (
      name: string,
      command: Parameters<ExtensionAPI['registerCommand']>[1],
    ) => captured.commands.set(name, command),
    registerShortcut: (
      key: string,
      shortcut: Parameters<ExtensionAPI['registerShortcut']>[1],
    ) => captured.shortcuts.set(key, shortcut),
    on(name: string, handler: Handler) {
      const handlers = captured.events.get(name) ?? [];
      handlers.push(handler);
      captured.events.set(name, handlers);
      return () => {
        handlers.splice(handlers.indexOf(handler), 1);
      };
    },
  } as unknown as ExtensionAPI;
  return { pi, captured };
}

export function makeTodoToolResult(details: unknown) {
  return { role: 'toolResult', toolName: 'todo', details };
}

export function makeUserMessage(text: string) {
  return { role: 'user', content: text };
}

export function buildSessionEntries(messages: unknown[]) {
  return messages.map((message) => ({ type: 'message', message }));
}
