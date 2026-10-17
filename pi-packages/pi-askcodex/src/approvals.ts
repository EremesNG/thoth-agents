import type { ServerRequest, ServerRequestHandler } from './protocol.js';

export interface ApprovalPrompt {
  /** Native select title, retained for fallback compatibility. */
  title: string;
  prompt: string;
  options: string[];
  preview: string;
}

export interface ApprovalUi {
  ask(prompt: ApprovalPrompt, signal: AbortSignal): Promise<string | undefined>;
}

export interface ApprovalDecisionRecord {
  method: string;
  kind:
    | 'computer-use'
    | 'elicitation'
    | 'command'
    | 'file'
    | 'permissions'
    | 'unknown';
  subject: string;
  decision: 'accept-once' | 'accept-session' | 'decline';
  source: 'allowlist' | 'user' | 'no-ui' | 'unknown';
  timestamp: string;
}

export function createApprovalHandler(options: {
  allowedApps: string[];
  ui?: ApprovalUi;
  onDecision?: (decision: ApprovalDecisionRecord) => void;
}): ServerRequestHandler {
  return async (request, { signal }) => {
    const policy = decide(request, {
      allowedApps: options.allowedApps,
      hasUi: !!options.ui,
    });
    let decision: ApprovalDecisionRecord['decision'] =
      policy === 'accept-session' ? policy : 'decline';
    if (policy === 'ask' && options.ui && !signal.aborted) {
      const choices = choicesFor(request);
      const answer = await ask(options.ui, promptFor(request, choices), signal);
      if (answer && choices.includes(answer)) {
        if (answer === 'Allow once') decision = 'accept-once';
        if (answer === 'Allow for this session') decision = 'accept-session';
      }
    }
    if (signal.aborted) decision = 'decline';
    let source: ApprovalDecisionRecord['source'] = options.ui
      ? 'user'
      : 'no-ui';
    if (policy === 'accept-session') source = 'allowlist';
    if (request.method === 'unknown') source = 'unknown';
    options.onDecision?.({
      method:
        request.method === 'unknown' ? request.originalMethod : request.method,
      ...describe(request),
      decision,
      source,
      timestamp: new Date().toISOString(),
    });
    switch (request.method) {
      case 'mcpServer/elicitation/request':
        if (decision === 'accept-session')
          return {
            action: 'accept',
            content: { persist: 'session' },
            _meta: null,
          };
        if (decision === 'accept-once')
          return { action: 'accept', content: null, _meta: null };
        return { action: 'decline', _meta: null };
      case 'item/commandExecution/requestApproval':
      case 'item/fileChange/requestApproval':
        return {
          decision:
            decision === 'accept-session'
              ? 'acceptForSession'
              : decision === 'accept-once'
                ? 'accept'
                : 'decline',
        };
      case 'item/permissions/requestApproval': {
        const { network, fileSystem } = request.params.permissions;
        return {
          permissions:
            decision === 'decline'
              ? {}
              : {
                  ...(network ? { network } : {}),
                  ...(fileSystem ? { fileSystem } : {}),
                },
          scope: decision === 'accept-session' ? 'session' : 'turn',
        };
      }
      case 'unknown':
        return {
          error: {
            code: -32601,
            message: `Unsupported server request: ${request.originalMethod}`,
          },
        };
    }
  };
}

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function computerApp(request: ServerRequest): string | undefined {
  if (request.method !== 'mcpServer/elicitation/request') return undefined;
  const meta = object(request.params._meta);
  const app = object(meta?.tool_params)?.app;
  return meta?.connector_id === 'computer-use' &&
    typeof app === 'string' &&
    app.trim()
    ? app
    : undefined;
}

export function decide(
  request: ServerRequest,
  { allowedApps, hasUi }: { allowedApps: string[]; hasUi: boolean },
): 'accept-session' | 'ask' | 'decline' {
  if (request.method === 'unknown') return 'decline';
  const app = computerApp(request)?.trim().toLowerCase();
  if (app && allowedApps.some((entry) => matchesApp(entry, app))) {
    return 'accept-session';
  }
  return hasUi ? 'ask' : 'decline';
}

function matchesApp(entry: string, app: string): boolean {
  const pattern = entry.trim().toLowerCase();
  if (!pattern) return false;
  const expression = pattern
    .replace(/[\\^$+.[\]{}()|]/g, '\\$&')
    .replace(/\*/g, '[\\s\\S]*')
    .replace(/\?/g, '[\\s\\S]');
  return new RegExp(`^${expression}$`, 'u').test(app);
}

function describe(
  request: ServerRequest,
): Pick<ApprovalDecisionRecord, 'kind' | 'subject'> {
  switch (request.method) {
    case 'mcpServer/elicitation/request': {
      const app = computerApp(request);
      const params = request.params;
      const message =
        params.mode === 'openai/userVerification'
          ? `${params.title}: ${params.description}`
          : params.message;
      const url = params.mode === 'url' ? ` (${params.url})` : '';
      return {
        kind: app ? 'computer-use' : 'elicitation',
        subject: app ?? `${params.serverName}: ${message}${url}`,
      };
    }
    case 'item/commandExecution/requestApproval': {
      const params = request.params;
      const permissions = params.additionalPermissions
        ? `; permissions: ${JSON.stringify(params.additionalPermissions)}`
        : '';
      return {
        kind: 'command',
        subject: `${params.command ?? params.kind} (cwd: ${params.cwd ?? 'unspecified'})${permissions}`,
      };
    }
    case 'item/fileChange/requestApproval':
      return {
        kind: 'file',
        subject: `${request.params.grantRoot ?? request.params.itemId}${request.params.reason ? `: ${request.params.reason}` : ''}`,
      };
    case 'item/permissions/requestApproval':
      return {
        kind: 'permissions',
        subject: `${JSON.stringify(request.params.permissions)} (cwd: ${request.params.cwd})`,
      };
    case 'unknown':
      return { kind: 'unknown', subject: request.originalMethod };
  }
}

function choicesFor(request: ServerRequest): string[] {
  if (computerApp(request)) return ['Allow for this session', 'Decline'];
  if (request.method === 'mcpServer/elicitation/request')
    return ['Allow once', 'Decline'];
  if (
    request.method === 'item/commandExecution/requestApproval' &&
    request.params.availableDecisions
  ) {
    return [
      ...(request.params.availableDecisions.includes('accept')
        ? ['Allow once']
        : []),
      ...(request.params.availableDecisions.includes('acceptForSession')
        ? ['Allow for this session']
        : []),
      'Decline',
    ];
  }
  return ['Allow once', 'Allow for this session', 'Decline'];
}

function titleFor(request: ServerRequest): string {
  const app = computerApp(request);
  if (app && request.method === 'mcpServer/elicitation/request') {
    const displays = object(request.params._meta)?.tool_params_display;
    const display = Array.isArray(displays)
      ? displays.map(object).find((item) => item?.name === 'app')?.value
      : undefined;
    return `Allow Codex to use ${typeof display === 'string' && display.trim() ? display : app}? (this session)`;
  }
  const { kind, subject } = describe(request);
  return `Codex requests ${kind}: ${subject}`;
}

function promptFor(request: ServerRequest, options: string[]): ApprovalPrompt {
  const title = titleFor(request);
  const app = computerApp(request);
  if (app) {
    const prompt = title.replace(/ \(this session\)$/, '');
    return {
      title,
      prompt,
      options,
      preview: `## App\n\n${prompt}\n\nIdentifier: ${app}`,
    };
  }
  let prompt: string;
  let preview: string;
  switch (request.method) {
    case 'item/commandExecution/requestApproval': {
      const { command, cwd, reason, additionalPermissions } = request.params;
      // A longer fence keeps commands containing backticks intact.
      const fence = '`'.repeat(
        (command?.match(/`+/g) ?? []).reduce(
          (length, run) => Math.max(length, run.length + 1),
          3,
        ),
      );
      prompt = 'Codex wants to run a command outside the sandbox';
      preview = `${fence}\n${command ?? request.params.kind}\n${fence}\n\nWorking directory: ${cwd ?? 'unspecified'}`;
      if (reason) preview += `\n\nReason: ${reason}`;
      if (additionalPermissions)
        preview += `\n\nPermissions: ${JSON.stringify(additionalPermissions)}`;
      break;
    }
    case 'item/fileChange/requestApproval':
      prompt = 'Codex wants to change files outside the sandbox';
      preview = `Grant root: ${request.params.grantRoot ?? 'unspecified'}\n\nItem: ${request.params.itemId}`;
      if (request.params.reason)
        preview += `\n\nReason: ${request.params.reason}`;
      break;
    case 'item/permissions/requestApproval':
      prompt = 'Codex requests additional permissions';
      preview = `Requested permissions: ${JSON.stringify(request.params.permissions, null, 2)}\n\nWorking directory: ${request.params.cwd}`;
      if (request.params.reason)
        preview += `\n\nReason: ${request.params.reason}`;
      break;
    default:
      prompt = 'Codex requests approval';
      preview = describe(request).subject;
  }
  return { title, prompt, options, preview };
}

/** Resolve promptly even if a UI adapter ignores cancellation or rejects. */
function ask(
  ui: ApprovalUi,
  prompt: ApprovalPrompt,
  signal: AbortSignal,
): Promise<string | undefined> {
  return new Promise((resolve) => {
    const finish = (answer?: string) => {
      signal.removeEventListener('abort', onAbort);
      resolve(answer);
    };
    const onAbort = () => finish();
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) {
      finish();
      return;
    }
    Promise.resolve()
      .then(() => (signal.aborted ? undefined : ui.ask(prompt, signal)))
      .then(finish, () => finish());
  });
}
