import { stripVTControlCharacters } from 'node:util';
import { initTheme } from '@earendil-works/pi-coding-agent';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { MarkdownCache } from '../../pi-questions-user/src/ui/markdown-cache.js';
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

function nativeAdapter(
  select: (
    title: string,
    options: string[],
    signal: AbortSignal,
  ) => Promise<string | undefined>,
): ApprovalUi {
  return {
    ask: (prompt, signal) => select(prompt.title, prompt.options, signal),
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

beforeAll(() => initTheme('dark'));

function renderPreview(preview: string): string {
  return new MarkdownCache()
    .render(preview, 2000)
    .map((line) => stripVTControlCharacters(line).trimEnd())
    .join('\n');
}

describe('createApprovalHandler', () => {
  it.each([
    String.raw`C:\_tools\paint.exe`,
    '*paint*_editor.exe',
    '`paint`_editor.exe',
    '``paint```_editor.exe`',
    ' leading space',
    'first line\n*second*_line with ```ticks```',
  ])('renders app metadata literally: %j', async (app) => {
    const display = '*Paint*_display with `ticks`';
    const ask = vi.fn<ApprovalUi['ask']>(async () => 'Decline');
    await createApprovalHandler({ allowedApps: [], ui: { ask } })(
      elicitation(app, {
        connector_id: 'computer-use',
        tool_params: { app },
        tool_params_display: [{ name: 'app', value: display }],
      }),
      { signal: signal() },
    );
    const rendered = renderPreview(ask.mock.calls[0][0].preview);
    for (const line of app.split('\n')) expect(rendered).toContain(line);
    expect(rendered).toContain(display);
  });

  it.each([
    command,
    file,
    permissions,
  ])('renders approval metadata literally for $method', async (request) => {
    const cwd = String.raw`C:\_work\repo`;
    const reason = '*Need access* to _private_ files with `ticks`';
    const root = String.raw`C:\_grant\*files*`;
    const itemId = '*item*_with_`ticks`';
    const permissionEntries = {
      network: null,
      fileSystem: { read: ['/data/*private*_`files`'], write: [root] },
    };
    const ask = vi.fn<ApprovalUi['ask']>(async () => 'Decline');
    const changed: ServerRequest =
      request.method === 'item/commandExecution/requestApproval'
        ? {
            ...request,
            params: {
              ...request.params,
              cwd,
              reason,
              additionalPermissions: permissionEntries,
            },
          }
        : request.method === 'item/fileChange/requestApproval'
          ? {
              ...request,
              params: { ...request.params, grantRoot: root, itemId, reason },
            }
          : {
              ...permissions,
              params: {
                ...permissions.params,
                cwd,
                reason,
                permissions: permissionEntries,
              },
            };
    await createApprovalHandler({ allowedApps: [], ui: { ask } })(changed, {
      signal: signal(),
    });
    const rendered = renderPreview(ask.mock.calls[0][0].preview);
    expect(rendered).toContain(reason);
    if (request.method === 'item/fileChange/requestApproval') {
      expect(rendered).toContain(root);
      expect(rendered).toContain(itemId);
    } else {
      expect(rendered).toContain(cwd);
      const summary = JSON.stringify(
        permissionEntries,
        null,
        request.method === 'item/permissions/requestApproval' ? 2 : undefined,
      );
      for (const line of summary.split('\n')) expect(rendered).toContain(line);
    }
  });
  // Captured approval params.command (Desktop 896a0166b774037a, 2026-10-17).
  // Expected script/path also match commandActions/proposedExecpolicyAmendment.
  // The screenshot transcription is lossy; never repair malformed input.
  it.each([
    [
      'captured approval wire payload',
      '"C:\\\\Program Files\\\\PowerShell\\\\7\\\\pwsh.exe" -Command "[System.IO.File]::WriteAllText(\'C:\\\\Users\\\\EremesNG\\\\askcodex-wire-test.txt\', \\"prueba "\'`"wire`"`n")\'',
      '"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command\n[System.IO.File]::WriteAllText(\'C:\\Users\\EremesNG\\askcodex-wire-test.txt\', "prueba `"wire`"`n")',
    ],
    [
      'corrected shell-joined transcription with leading whitespace',
      '  "C:\\\\Program Files\\\\PowerShell\\\\7\\\\pwsh.exe" -Command "[System.IO.File]::WriteAllText(\'C:\\\\Users\\\\EremesNG\\\\askcodex-approval-test3.txt\', \\"prueba de vista previa."\'`n", [System.Text.UTF8Encoding]::new($false))\'',
      '"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command\n[System.IO.File]::WriteAllText(\'C:\\Users\\EremesNG\\askcodex-approval-test3.txt\', "prueba de vista previa.`n", [System.Text.UTF8Encoding]::new($false))',
    ],
    [
      'malformed screenshot transcription',
      '"C:\\\\Program Files\\\\PowerShell\\\\7\\\\pwsh.exe" -Command "[System.IO.File]::WriteAllText(\'C:\\\\Users\\\\EremesNG\\\\askcodex-approval-test3.txt\', \\"prueba de vista previa.\\"\'`n", [System.Text.UTF8Encoding]::new($false))\'',
      '"C:\\\\Program Files\\\\PowerShell\\\\7\\\\pwsh.exe" -Command "[System.IO.File]::WriteAllText(\'C:\\\\Users\\\\EremesNG\\\\askcodex-approval-test3.txt\', \\"prueba de vista previa.\\"\'`n", [System.Text.UTF8Encoding]::new($false))\'',
    ],
    [
      'previous single-quoted script',
      '"C:\\\\Program Files\\\\PowerShell\\\\7\\\\pwsh.exe" -Command \'Get-Content -LiteralPath README.md -Raw; Test-Path -LiteralPath hello.txt\'',
      '"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command\nGet-Content -LiteralPath README.md -Raw; Test-Path -LiteralPath hello.txt',
    ],
    [
      'previous non-shell-joined backtick script stays raw',
      '"C:\\\\Program Files\\\\PowerShell\\\\7\\\\pwsh.exe" -Command "[System.IO.File]::WriteAllText(\'C:\\\\Users\\\\EremesNG\\\\askcodex-approval-test2.txt\', \\"prueba de permisos con estilo.\\"`n\\", [System.Text.Encoding]::UTF8)"',
      '"C:\\\\Program Files\\\\PowerShell\\\\7\\\\pwsh.exe" -Command "[System.IO.File]::WriteAllText(\'C:\\\\Users\\\\EremesNG\\\\askcodex-approval-test2.txt\', \\"prueba de permisos con estilo.\\"`n\\", [System.Text.Encoding]::UTF8)"',
    ],
    ['plain argv', 'echo "C:\\\\temp"', 'echo "C:\\\\temp"'],
    [
      'literal backslashes in double quotes',
      '"C:\\Tools\\pwsh.exe" -Command "C:\\temp"',
      'C:\\Tools\\pwsh.exe -Command\nC:\\temp',
    ],
    [
      'non-shell argv',
      '"C:\\\\Tools\\\\other.exe" -Command "C:\\\\temp"',
      '"C:\\\\Tools\\\\other.exe" -Command "C:\\\\temp"',
    ],
    [
      'unknown double-quote escape',
      '"C:\\\\Tools\\\\pwsh.exe" -Command "unknown\\q"',
      'C:\\Tools\\pwsh.exe -Command\nunknown\\q',
    ],
    [
      'single-quoted literals',
      '"C:\\\\Tools\\\\pwsh.exe" -Command \'echo "C:\\\\temp"\'',
      'C:\\Tools\\pwsh.exe -Command\necho "C:\\\\temp"',
    ],
    [
      'adjacent segments and escaped whitespace',
      "echo pre\"middle \"'suffix' one\\ two ''",
      "echo pre\"middle \"'suffix' one\\ two ''",
    ],
    [
      'double-quoted special escapes',
      'echo "\\\\ \\" \\$ \\` \\q"',
      'echo "\\\\ \\" \\$ \\` \\q"',
    ],
    ['double-quoted continuation', 'sh -c "echo a\\\nb"', 'sh -c\necho ab'],
    ['unquoted continuation', 'echo a\\\nb', 'echo a\\\nb'],
    ['unterminated double quote', '  echo "unfinished', '  echo "unfinished'],
    ['unterminated single quote', "echo 'unfinished", "echo 'unfinished"],
    ['trailing escape', 'echo tail\\', 'echo tail\\'],
    [
      'shell syntax is not an argv join',
      'echo hi; rm file',
      'echo hi; rm file',
    ],
    ['expansion is not an argv join', 'echo "$HOME"', 'echo "$HOME"'],
    ['backtick expansion is not an argv join', 'echo `date`', 'echo `date`'],
    ['empty command', '  ', '  '],
    [
      'multiline script and fence',
      "bash -c 'echo first\necho ```'",
      'bash -c\necho first\necho ```',
    ],
    [
      'cmd wrapper',
      '"C:\\\\Windows\\\\System32\\\\cmd.exe" /c "echo hello"',
      'C:\\Windows\\System32\\cmd.exe /c\necho hello',
    ],
    [
      'powershell alias',
      'powershell -c \'echo "hi"\'',
      'powershell -c\necho "hi"',
    ],
    [
      'extra shell arguments are not hidden',
      "bash -c 'echo hi' name",
      "bash -c 'echo hi' name",
    ],
    ...[
      ['bare LF', 'echo safe\nrm important.txt'],
      ['bare CRLF', 'echo safe\r\nrm important.txt'],
      ['semicolon', 'echo safe; rm important.txt'],
      ['conditional', 'echo safe && rm important.txt'],
      ['pipeline', 'echo safe | rm important.txt'],
      ['space argument', "touch 'a b'"],
      ['literal quote arguments', `touch '"a' 'b"'`],
      ['literal double quotes', `printf '%s' '""'`],
      ['empty argument', "printf %s ''"],
      ['quoted executable', `'/tmp/a"b/sh' -c 'echo hi'`],
      ['multiline executable', "'/tmp/a\nb/sh' -c 'echo hi'"],
      ...[
        'pwsh -Command',
        'powershell -c',
        'cmd /c',
        'cmd.exe /c',
        'sh -c',
      ].map((wrapper) => [
        'extra wrapper arguments',
        `${wrapper} 'echo hi' extra`,
      ]),
      ['cmd alias', 'cmd /c "echo hi"', 'cmd /c\necho hi'],
      ...[
        '\n',
        '\r\n',
        '\r',
        '\v',
        '\f',
        '\u0085',
        '\u00a0',
        '\u2028',
        '\u0000',
      ].map((separator) => [
        'unsupported wrapper separator',
        `sh${separator}-c 'echo hi'`,
      ]),
      ...[';', '&', '&&', '|', '<', '>', '(', ')', '`', '$'].map((operator) => [
        'wrapper operator',
        `sh -c echo${operator}hi`,
      ]),
      ['unquoted wrapper continuation', "sh\\\n -c 'echo hi'"],
      ['space/tab wrapper separator', "sh\t-c 'echo hi'", 'sh -c\necho hi'],
    ].map(([name, raw, expected]) => [name, raw, expected ?? raw]),
  ])('renders command argv safely: %s', async (_name, raw, expected) => {
    if (command.method !== 'item/commandExecution/requestApproval')
      throw new Error('fixture');
    const ask = vi.fn<ApprovalUi['ask']>(async () => 'Decline');
    const records: ApprovalDecisionRecord[] = [];
    await createApprovalHandler({
      allowedApps: [],
      ui: { ask },
      onDecision: (record) => records.push(record),
    })(
      { ...command, params: { ...command.params, command: raw } },
      { signal: signal() },
    );
    const fence = expected.includes('```') ? '````' : '```';
    expect(ask.mock.calls[0][0].preview).toBe(
      [fence, expected, fence, '', 'Working directory: ```/project```'].join(
        '\n',
      ),
    );
    expect(records[0].subject).toBe(`${raw} (cwd: /project)`);
  });

  it.each([
    [
      file,
      'Codex wants to change files outside the sandbox',
      'Grant root: ```/project/src```\n\nItem: ```file```\n\nReason: ```Edit files```',
    ],
    [
      permissions,
      'Codex requests additional permissions',
      'Requested permissions: \n\n```\n{\n  "network": {\n    "enabled": true\n  },\n  "fileSystem": {\n    "read": [\n      "/data"\n    ],\n    "write": [\n      "/out"\n    ]\n  }\n}\n```\n\nWorking directory: ```/project```\n\nReason: ```Need access```',
    ],
  ] as const)('provides a concise prompt and detailed preview for %j', async (request, prompt, preview) => {
    const ask = vi.fn<ApprovalUi['ask']>(async () => 'Decline');
    const receivedSignal = signal();
    await createApprovalHandler({ allowedApps: [], ui: { ask } })(request, {
      signal: receivedSignal,
    });
    expect(ask).toHaveBeenCalledWith(
      {
        title: expect.any(String),
        prompt,
        preview,
        options: ['Allow once', 'Allow for this session', 'Decline'],
      },
      receivedSignal,
    );
  });
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
      ui: { ask: async () => answer },
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
        ask: async (_prompt, received) => {
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
    const select = vi.fn<
      (
        title: string,
        options: string[],
        signal: AbortSignal,
      ) => Promise<string | undefined>
    >(async () => 'Allow once');
    const handler = createApprovalHandler({
      allowedApps: ['notepad.exe'],
      ui: nativeAdapter(select),
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
        ask: async () => {
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
    const handler = createApprovalHandler({
      allowedApps: [],
      ui: nativeAdapter(select),
    });
    expect(await handler(restricted, { signal: signal() })).toEqual({
      decision: 'decline',
    });
    expect(select).toHaveBeenCalledWith(
      expect.stringContaining('git status'),
      ['Decline'],
      expect.any(AbortSignal),
    );
  });

  it.each([
    'Paint',
    ' ',
    undefined,
  ])('shows app and identifier without repeating the prompt (display: %s)', async (display) => {
    const app = 'Microsoft.Paint_8wekyb3d8bbwe!App';
    const ask = vi.fn<ApprovalUi['ask']>(async () => 'Decline');
    await createApprovalHandler({ allowedApps: [], ui: { ask } })(
      elicitation(app, {
        connector_id: 'computer-use',
        tool_params: { app },
        tool_params_display:
          display === undefined ? [] : [{ name: 'app', value: display }],
      }),
      { signal: signal() },
    );
    expect(ask.mock.calls[0][0]).toMatchObject({
      prompt: `Allow Codex to use ${display?.trim() ? display : app}?`,
      preview: `App: \`\`\`${display?.trim() ? display : app}\`\`\`\n\nIdentifier: \`\`\`${app}\`\`\``,
    });
    expect(ask.mock.calls[0][0].preview).not.toContain('Allow Codex');
  });

  it('uses the app display label in a session-only prompt without offering permanent acceptance', async () => {
    const request = elicitation('packaged!App', {
      connector_id: 'computer-use',
      tool_params: { app: 'packaged!App' },
      persist: ['always'],
      tool_params_display: [{ name: 'app', value: 'Bloc de notas' }],
    });
    const select = vi.fn(async () => 'Allow for this session');
    const handler = createApprovalHandler({
      allowedApps: [],
      ui: nativeAdapter(select),
    });
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
    const select = vi.fn<
      (
        title: string,
        options: string[],
        signal: AbortSignal,
      ) => Promise<string | undefined>
    >(async () => 'Allow once');
    const handler = createApprovalHandler({
      allowedApps: [],
      ui: nativeAdapter(select),
    });
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
    const select = vi.fn<
      (
        title: string,
        options: string[],
        signal: AbortSignal,
      ) => Promise<string | undefined>
    >(async () => 'Decline');
    await createApprovalHandler({ allowedApps: [], ui: nativeAdapter(select) })(
      request,
      {
        signal: signal(),
      },
    );
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
    const select = vi.fn<
      (
        title: string,
        options: string[],
        signal: AbortSignal,
      ) => Promise<string | undefined>
    >(async () => 'Allow once');
    expect(
      await createApprovalHandler({
        allowedApps: [],
        ui: nativeAdapter(select),
      })(request, { signal: signal() }),
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
        ui: { ask: async () => 'Allow once' },
      })(request, { signal: signal() }),
    ).toEqual({ permissions: {}, scope: 'turn' });
  });

  it.each([
    false,
    true,
  ])('accepts wildcard-allowlisted Computer Use with session persistence and reports the source (UI: %s)', async (hasUi) => {
    const records: ApprovalDecisionRecord[] = [];
    const select = vi.fn<
      (
        title: string,
        options: string[],
        signal: AbortSignal,
      ) => Promise<string | undefined>
    >(async () => 'Decline');
    const handler = createApprovalHandler({
      allowedApps: ['*'],
      ...(hasUi ? { ui: nativeAdapter(select) } : {}),
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
