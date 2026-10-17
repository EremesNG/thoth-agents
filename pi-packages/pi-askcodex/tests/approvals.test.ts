import { describe, expect, it, vi } from 'vitest';
import {
  type ApprovalDecisionRecord,
  type ApprovalUi,
  createApprovalHandler,
  decide,
} from '../src/approvals.js';
import type { JsonValue, ServerRequest } from '../src/protocol.js';

function elicitation(
  app: string,
  meta: JsonValue = {
    connector_id: 'computer-use',
    persist: ['session', 'always'],
    tool_params: { app },
  },
): ServerRequest {
  return {
    id: 1,
    method: 'mcpServer/elicitation/request',
    params: {
      threadId: 'thread',
      turnId: 'turn',
      serverName: 'node_repl',
      mode: 'form',
      _meta: meta,
      message: 'Allow Codex to use app?',
      requestedSchema: {},
    },
  };
}

const signal = () => new AbortController().signal;
const command: ServerRequest = {
  id: 2,
  method: 'item/commandExecution/requestApproval',
  params: {
    kind: 'command',
    threadId: 'thread',
    turnId: 'turn',
    itemId: 'command',
    startedAtMs: 0,
    environmentId: null,
    command: 'git status',
    cwd: '/project',
    proposedExecpolicyAmendment: ['git'],
  },
};
const file: ServerRequest = {
  id: 3,
  method: 'item/fileChange/requestApproval',
  params: {
    threadId: 'thread',
    turnId: 'turn',
    itemId: 'file',
    startedAtMs: 0,
    grantRoot: '/project/src',
    reason: 'Edit files',
  },
};
const permissions: ServerRequest = {
  id: 4,
  method: 'item/permissions/requestApproval',
  params: {
    threadId: 'thread',
    turnId: 'turn',
    itemId: 'permissions',
    startedAtMs: 0,
    environmentId: null,
    cwd: '/project',
    reason: 'Need access',
    permissions: {
      network: { enabled: true },
      fileSystem: { read: ['/data'], write: ['/out'] },
    },
  },
};
const unknown: ServerRequest = {
  id: 5,
  method: 'unknown',
  originalMethod: 'future/approval',
  params: {},
};
const generic = elicitation('', {
  connector_id: 'other',
  tool_params: { app: 'notepad.exe' },
});

describe('createApprovalHandler', () => {
  it.each([
    [
      elicitation('other.exe'),
      { action: 'decline', _meta: null },
      'computer-use',
      'no-ui',
    ],
    [generic, { action: 'decline', _meta: null }, 'elicitation', 'no-ui'],
    [command, { decision: 'decline' }, 'command', 'no-ui'],
    [file, { decision: 'decline' }, 'file', 'no-ui'],
    [permissions, { permissions: {}, scope: 'turn' }, 'permissions', 'no-ui'],
    [
      unknown,
      {
        error: {
          code: -32601,
          message: 'Unsupported server request: future/approval',
        },
      },
      'unknown',
      'unknown',
    ],
  ] as const)('declines %j without UI', async (request, response, kind, source) => {
    const records: ApprovalDecisionRecord[] = [];
    expect(
      decide(request, { allowedApps: ['notepad.exe'], hasUi: false }),
    ).toBe('decline');
    expect(
      await createApprovalHandler({
        allowedApps: ['notepad.exe'],
        onDecision: (d) => records.push(d),
      })(request, { signal: signal() }),
    ).toEqual(response);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      kind,
      source,
      decision: 'decline',
      method: request.method === 'unknown' ? 'future/approval' : request.method,
    });
  });
  it.each([
    [
      elicitation('other.exe'),
      'Allow for this session',
      { action: 'accept', content: { persist: 'session' }, _meta: null },
      'accept-session',
    ],
    [command, 'Allow once', { decision: 'accept' }, 'accept-once'],
    [
      command,
      'Allow for this session',
      { decision: 'acceptForSession' },
      'accept-session',
    ],
    [file, 'Allow once', { decision: 'accept' }, 'accept-once'],
    [
      file,
      'Allow for this session',
      { decision: 'acceptForSession' },
      'accept-session',
    ],
    [
      permissions,
      'Allow once',
      {
        permissions: {
          network: { enabled: true },
          fileSystem: { read: ['/data'], write: ['/out'] },
        },
        scope: 'turn',
      },
      'accept-once',
    ],
    [
      permissions,
      'Allow for this session',
      {
        permissions: {
          network: { enabled: true },
          fileSystem: { read: ['/data'], write: ['/out'] },
        },
        scope: 'session',
      },
      'accept-session',
    ],
    [
      generic,
      'Allow once',
      { action: 'accept', content: null, _meta: null },
      'accept-once',
    ],
    [
      generic,
      'Allow for this session',
      { action: 'decline', _meta: null },
      'decline',
    ],
    [
      elicitation('other.exe'),
      'always',
      { action: 'decline', _meta: null },
      'decline',
    ],
    [command, undefined, { decision: 'decline' }, 'decline'],
    [file, 'Decline', { decision: 'decline' }, 'decline'],
  ] as const)('maps user answer %s / %s to restrictive response', async (request, answer, expected, decision) => {
    const records: ApprovalDecisionRecord[] = [];
    const handler = createApprovalHandler({
      allowedApps: [],
      ui: { select: async () => answer },
      onDecision: (d) => records.push(d),
    });
    expect(decide(request, { allowedApps: [], hasUi: true })).toBe('ask');
    expect(await handler(request, { signal: signal() })).toEqual(expected);
    expect(records[0]).toMatchObject({ decision, source: 'user' });
  });

  it('cancels a pending UI even when the adapter ignores the signal and later accepts', async () => {
    const controller = new AbortController();
    const records: ApprovalDecisionRecord[] = [];
    let resolveAnswer: (answer: string) => void = () => {};
    let opened: () => void = () => {};
    const ready = new Promise<void>((resolve) => {
      opened = resolve;
    });
    const handler = createApprovalHandler({
      allowedApps: [],
      ui: {
        select: async (_title, _options, received) => {
          expect(received).toBe(controller.signal);
          opened();
          return new Promise<string>((resolve) => {
            resolveAnswer = resolve;
          });
        },
      },
      onDecision: (d) => records.push(d),
    });
    const pending = handler(command, { signal: controller.signal });
    await ready;
    controller.abort();
    expect(await pending).toEqual({ decision: 'decline' });
    resolveAnswer('Allow for this session');
    await Promise.resolve();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ decision: 'decline', source: 'user' });
  });

  it('does not ask or auto-accept when already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const select = vi.fn<ApprovalUi['select']>(async () => 'Allow once');
    const handler = createApprovalHandler({
      allowedApps: ['notepad.exe'],
      ui: { select },
    });
    expect(
      await handler(elicitation('notepad.exe'), { signal: controller.signal }),
    ).toEqual({ action: 'decline', _meta: null });
    expect(await handler(command, { signal: controller.signal })).toEqual({
      decision: 'decline',
    });
    expect(select).not.toHaveBeenCalled();
  });

  it('declines when UI fails', async () => {
    const handler = createApprovalHandler({
      allowedApps: [],
      ui: {
        select: async () => {
          throw new Error('UI closed');
        },
      },
    });
    expect(await handler(permissions, { signal: signal() })).toEqual({
      permissions: {},
      scope: 'turn',
    });
  });

  it.each([
    'Allow once',
    'Allow for this session',
    'acceptWithExecpolicyAmendment',
    'always',
  ])('does not offer or grant unavailable command decisions: %s', async (answer) => {
    if (command.method !== 'item/commandExecution/requestApproval')
      throw new Error('fixture');
    const restricted: ServerRequest = {
      ...command,
      params: {
        ...command.params,
        availableDecisions: [
          { acceptWithExecpolicyAmendment: { execpolicy_amendment: ['git'] } },
          'decline',
        ],
      },
    };
    const select = vi.fn(async () => answer);
    const handler = createApprovalHandler({ allowedApps: [], ui: { select } });
    expect(await handler(restricted, { signal: signal() })).toEqual({
      decision: 'decline',
    });
    expect(select).toHaveBeenCalledWith(
      expect.stringContaining('git status'),
      ['Decline'],
      expect.any(AbortSignal),
    );
  });

  it('uses the app display label in a session-only prompt without offering permanent acceptance', async () => {
    const request = elicitation('packaged!App', {
      connector_id: 'computer-use',
      tool_params: { app: 'packaged!App' },
      persist: ['always'],
      tool_params_display: [{ name: 'app', value: 'Bloc de notas' }],
    });
    const select = vi.fn(async () => 'Allow for this session');
    const handler = createApprovalHandler({ allowedApps: [], ui: { select } });
    expect(await handler(request, { signal: signal() })).toEqual({
      action: 'accept',
      content: { persist: 'session' },
      _meta: null,
    });
    expect(select).toHaveBeenCalledWith(
      'Allow Codex to use Bloc de notas? (this session)',
      ['Allow for this session', 'Decline'],
      expect.any(AbortSignal),
    );
  });

  it('never asks the UI for unknown methods', async () => {
    const select = vi.fn<ApprovalUi['select']>(async () => 'Allow once');
    const handler = createApprovalHandler({ allowedApps: [], ui: { select } });
    expect(decide(unknown, { allowedApps: [], hasUi: true })).toBe('decline');
    expect(await handler(unknown, { signal: signal() })).toMatchObject({
      error: { code: -32601 },
    });
    expect(select).not.toHaveBeenCalled();
  });

  it('shows requested additional permissions alongside the command and cwd', async () => {
    if (
      command.method !== 'item/commandExecution/requestApproval' ||
      permissions.method !== 'item/permissions/requestApproval'
    )
      throw new Error('fixture');
    const request: ServerRequest = {
      ...command,
      params: {
        ...command.params,
        additionalPermissions: permissions.params.permissions,
      },
    };
    const select = vi.fn<ApprovalUi['select']>(async () => 'Decline');
    await createApprovalHandler({ allowedApps: [], ui: { select } })(request, {
      signal: signal(),
    });
    expect(select.mock.calls[0][0]).toContain('git status');
    expect(select.mock.calls[0][0]).toContain('/project');
    expect(select.mock.calls[0][0]).toContain('/out');
    expect(select.mock.calls[0][0]).toContain('network');
  });

  it('includes the URL and server in an external elicitation prompt', async () => {
    const request: ServerRequest = {
      id: 6,
      method: 'mcpServer/elicitation/request',
      params: {
        threadId: 'thread',
        turnId: null,
        serverName: 'remote',
        mode: 'url',
        _meta: null,
        message: 'Sign in',
        url: 'https://example.test/auth',
        elicitationId: 'auth',
      },
    };
    const select = vi.fn<ApprovalUi['select']>(async () => 'Allow once');
    expect(
      await createApprovalHandler({ allowedApps: [], ui: { select } })(
        request,
        { signal: signal() },
      ),
    ).toEqual({ action: 'accept', content: null, _meta: null });
    expect(select.mock.calls[0][0]).toContain('https://example.test/auth');
    expect(select.mock.calls[0][0]).toContain('remote');
  });

  it('omits null permission categories from accepted profiles', async () => {
    if (permissions.method !== 'item/permissions/requestApproval')
      throw new Error('fixture');
    const request: ServerRequest = {
      ...permissions,
      params: {
        ...permissions.params,
        permissions: { network: null, fileSystem: null },
      },
    };
    expect(
      await createApprovalHandler({
        allowedApps: [],
        ui: { select: async () => 'Allow once' },
      })(request, { signal: signal() }),
    ).toEqual({ permissions: {}, scope: 'turn' });
  });

  it.each([
    false,
    true,
  ])('accepts wildcard-allowlisted Computer Use with session persistence and reports the source (UI: %s)', async (hasUi) => {
    const records: ApprovalDecisionRecord[] = [];
    const select = vi.fn<ApprovalUi['select']>(async () => 'Decline');
    const handler = createApprovalHandler({
      allowedApps: ['*'],
      ...(hasUi ? { ui: { select } } : {}),
      onDecision: (d) => records.push(d),
    });
    expect(
      await handler(elicitation('Microsoft.WindowsNotepad_8wekyb3d8bbwe!App'), {
        signal: signal(),
      }),
    ).toEqual({
      action: 'accept',
      content: { persist: 'session' },
      _meta: null,
    });
    expect(records[0]).toMatchObject({
      kind: 'computer-use',
      decision: 'accept-session',
      source: 'allowlist',
    });
    expect(select).not.toHaveBeenCalled();
  });

  it('accepts allowlisted Computer Use with session persistence and reports the decision', async () => {
    const records: ApprovalDecisionRecord[] = [];
    const handler = createApprovalHandler({
      allowedApps: ['NOTEPAD.EXE'],
      onDecision: (d) => records.push(d),
    });
    expect(
      await handler(elicitation('notepad.exe'), { signal: signal() }),
    ).toEqual({
      action: 'accept',
      content: { persist: 'session' },
      _meta: null,
    });
    expect(records).toEqual([
      {
        method: 'mcpServer/elicitation/request',
        kind: 'computer-use',
        subject: 'notepad.exe',
        decision: 'accept-session',
        source: 'allowlist',
        timestamp: expect.any(String),
      },
    ]);
    expect(Number.isNaN(Date.parse(records[0].timestamp))).toBe(false);
  });
});

describe('decide', () => {
  it.each([
    generic,
    command,
    file,
    permissions,
    unknown,
    elicitation(''),
  ])('does not let a universal wildcard bypass other approval policies: %j', (request) => {
    expect(decide(request, { allowedApps: ['*'], hasUi: false })).toBe(
      'decline',
    );
    expect(decide(request, { allowedApps: ['*'], hasUi: true })).toBe(
      request.method === 'unknown' ? 'decline' : 'ask',
    );
  });
  it.each([
    null,
    [],
    'computer-use',
    {},
    { connector_id: 'computer-use', tool_params: { app: 42 } },
    { connector_id: 'computer-use', tool_params: { app: ' ' } },
    { connector_id: 'other', tool_params: { app: 'notepad.exe' } },
    { tool_params: { app: 'notepad.exe' } },
  ])('does not auto-approve malformed or unrelated metadata %j', (meta) => {
    expect(
      decide(elicitation('notepad.exe', meta), {
        allowedApps: ['notepad.exe'],
        hasUi: false,
      }),
    ).toBe('decline');
    expect(
      decide(elicitation('notepad.exe', meta), {
        allowedApps: ['notepad.exe'],
        hasUi: true,
      }),
    ).toBe('ask');
  });
  it.each([
    ['notepad.exe', ['notepad.exe'], false, 'accept-session'],
    [' NOTEPAD.EXE ', [' notepad.exe '], true, 'accept-session'],
    [
      'Microsoft.WindowsNotepad_8wekyb3d8bbwe!App',
      ['microsoft.windowsnotepad_8wekyb3d8bbwe!app'],
      false,
      'accept-session',
    ],
    ['notepad.exe.evil', ['notepad.exe'], false, 'decline'],
    ['notepad.exe', ['notepad'], true, 'ask'],
    ['notepad.exe', ['*.exe'], false, 'accept-session'],
    ['msedge.exe', [' MSEDGE* '], false, 'accept-session'],
    ['msedge', ['msedge*'], false, 'accept-session'],
    ['xmsedge.exe', ['msedge*'], false, 'decline'],
    ['xmsedge.exe', ['msedge*'], true, 'ask'],
    ['msedge.exe', ['msedge_*'], false, 'decline'],
    ['notepad.exe.bak', ['notepad.exe'], false, 'decline'],
    [
      'Microsoft.WindowsNotepad_8wekyb3d8bbwe!App',
      ['Microsoft.WindowsNotepad_*'],
      false,
      'accept-session',
    ],
    ['notepad.exe', ['?otepad.exe'], false, 'accept-session'],
    ['📝.exe', ['?.exe'], false, 'accept-session'],
    ['otepad.exe', ['?otepad.exe'], false, 'decline'],
    ['nnotepad.exe', ['?otepad.exe'], false, 'decline'],
    ['a+b.exe', ['a+b.exe'], false, 'accept-session'],
    ['aaab.exe', ['a+b.exe'], false, 'decline'],
    ['(x)', ['(x)'], false, 'accept-session'],
    ['x', ['(x)'], false, 'decline'],
    ['a[b]{2}^$|\\\\.exe', ['a[b]{2}^$|\\\\.exe'], false, 'accept-session'],
    ['ab.exe', ['a[b].exe'], false, 'decline'],
    ['notepadXexe', ['notepad.exe'], false, 'decline'],
    ['a+b.exe.bak', ['a+b.exe*'], false, 'accept-session'],
    ['aaab.exe.bak', ['a+b.exe*'], false, 'decline'],
    ['notepad.exe', ['', '   '], false, 'decline'],
    ['notepad.exe', ['', '  ', 'notepad*'], false, 'accept-session'],
    ['notepad.exe', [], true, 'ask'],
    ['', [''], false, 'decline'],
  ] as const)('matches %s against %j with UI %s: %s', (app, allowedApps, hasUi, expected) => {
    expect(
      decide(elicitation(app), { allowedApps: [...allowedApps], hasUi }),
    ).toBe(expected);
  });
});
