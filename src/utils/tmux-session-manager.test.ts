import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { TmuxSessionManager } from './tmux-session-manager';

// Define the mock outside so we can access it
const mockSpawnTmuxPane = mock(async () => ({
  success: true,
  paneId: '%mock-pane',
}));
const mockCloseTmuxPane = mock(async () => true);
const mockIsInsideTmux = mock(() => true);

// Mock the tmux utils module
mock.module('./tmux', () => ({
  spawnTmuxPane: mockSpawnTmuxPane,
  closeTmuxPane: mockCloseTmuxPane,
  isInsideTmux: mockIsInsideTmux,
}));

// Mock the plugin context
function createMockContext(overrides?: {
  sessionStatusResult?: { data?: Record<string, { type: string }> };
  serverUrl?: URL;
}) {
  const defaultPort = process.env.OPENCODE_PORT ?? '4096';
  return {
    client: {
      session: {
        status: mock(
          async () => overrides?.sessionStatusResult ?? { data: {} },
        ),
      },
    },
    directory: '/test/directory',
    worktree: '/test/worktree',
    worktreeDirectory: '/test/worktree',
    project: { name: 'phase-2-project' },
    $: {
      nothrow: mock(() => ({
        cwd: mock(() =>
          mock(() => ({
            quiet: mock(async () => ({ exitCode: 0, text: () => '' })),
          })),
        ),
      })),
    },
    serverUrl:
      overrides?.serverUrl ?? new URL(`http://localhost:${defaultPort}`),
  } as any;
}

const defaultTmuxConfig = {
  enabled: true,
  layout: 'main-vertical' as const,
  main_pane_size: 60,
};

describe('TmuxSessionManager', () => {
  beforeEach(() => {
    mockSpawnTmuxPane.mockClear();
    mockCloseTmuxPane.mockClear();
    mockIsInsideTmux.mockClear();
    mockIsInsideTmux.mockReturnValue(true);
  });

  describe('constructor', () => {
    test('initializes with config', () => {
      const ctx = createMockContext();
      const manager = new TmuxSessionManager(ctx, defaultTmuxConfig);
      expect(manager).toBeDefined();
    });
  });

  describe('onSessionCreated', () => {
    test('spawns pane for child sessions', async () => {
      const ctx = createMockContext({
        serverUrl: new URL('http://127.0.0.1:4317'),
      });
      const manager = new TmuxSessionManager(ctx, defaultTmuxConfig);

      await manager.onSessionCreated({
        type: 'session.created',
        properties: {
          info: {
            id: 'child-123',
            parentID: 'parent-456',
            title: 'Test Worker',
          },
        },
      });

      expect(mockSpawnTmuxPane).toHaveBeenCalledWith(
        'child-123',
        'Test Worker',
        defaultTmuxConfig,
        'http://127.0.0.1:4317/',
      );
    });

    test('ignores sessions without parentID', async () => {
      const ctx = createMockContext();
      const manager = new TmuxSessionManager(ctx, defaultTmuxConfig);

      await manager.onSessionCreated({
        type: 'session.created',
        properties: {
          info: {
            id: 'root-session',
            title: 'Main Chat',
          },
        },
      });

      expect(mockSpawnTmuxPane).not.toHaveBeenCalled();
    });

    test('ignores if disabled in config', async () => {
      const ctx = createMockContext();
      const manager = new TmuxSessionManager(ctx, {
        ...defaultTmuxConfig,
        enabled: false,
      });

      await manager.onSessionCreated({
        type: 'session.created',
        properties: {
          info: { id: 'child', parentID: 'parent' },
        },
      });

      expect(mockSpawnTmuxPane).not.toHaveBeenCalled();
    });
  });

  describe('polling and closure', () => {
    test('closes pane when session becomes idle', async () => {
      const ctx = createMockContext();
      mockSpawnTmuxPane.mockResolvedValue({ success: true, paneId: 'p-1' });

      const manager = new TmuxSessionManager(ctx, defaultTmuxConfig);

      // Register session
      await manager.onSessionCreated({
        type: 'session.created',
        properties: { info: { id: 'c1', parentID: 'p1' } },
      });

      // Mock status
      ctx.client.session.status.mockResolvedValue({
        data: { c1: { type: 'idle' } },
      });

      await (manager as any).pollSessions();

      expect(mockCloseTmuxPane).toHaveBeenCalledWith('p-1');
    });

    test('does not close on transient status absence', async () => {
      const ctx = createMockContext();
      const manager = new TmuxSessionManager(ctx, defaultTmuxConfig);

      await manager.onSessionCreated({
        type: 'session.created',
        properties: { info: { id: 'c1', parentID: 'p1' } },
      });

      ctx.client.session.status.mockResolvedValue({ data: {} });
      await (manager as any).pollSessions();

      expect(mockCloseTmuxPane).not.toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    test('closes all tracked panes concurrently', async () => {
      const ctx = createMockContext();
      mockSpawnTmuxPane.mockResolvedValueOnce({ success: true, paneId: 'p1' });
      mockSpawnTmuxPane.mockResolvedValueOnce({ success: true, paneId: 'p2' });

      const manager = new TmuxSessionManager(ctx, defaultTmuxConfig);

      await manager.onSessionCreated({
        type: 'session.created',
        properties: { info: { id: 's1', parentID: 'p1' } },
      });
      await manager.onSessionCreated({
        type: 'session.created',
        properties: { info: { id: 's2', parentID: 'p2' } },
      });

      await manager.cleanup();

      expect(mockCloseTmuxPane).toHaveBeenCalledTimes(2);
      expect(mockCloseTmuxPane).toHaveBeenCalledWith('p1');
      expect(mockCloseTmuxPane).toHaveBeenCalledWith('p2');
    });
  });
});
