import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildSessionContext,
  type ExtensionAPI,
  type ExtensionToolContext,
} from '@earendil-works/pi-coding-agent';
import {
  formatDuration,
  getQuestionService,
  getRenderKit,
  renderToolFooter,
} from '@thoth-agents/pi-core';
import { Type } from 'typebox';
import {
  AppServerClient,
  type AppServerClientOptions,
} from './app-server-client.js';
import {
  type ApprovalDecisionRecord,
  type ApprovalPrompt,
  createApprovalHandler,
} from './approvals.js';
import {
  type DesktopStatus,
  isCodexDesktopRunning,
  type ResolvedCodexBinary,
  resolveCodexBinary,
} from './binary.js';
import {
  type AskCodexConfig,
  type AskCodexMode,
  loadConfig,
} from './config.js';
import { buildDeveloperInstructions } from './instructions.js';
import type { ThreadTokenUsage, TurnStatus } from './protocol.js';
import { renderToolCard } from './render-tool-card.js';

const EFFORTS = ['minimal', 'low', 'medium', 'high', 'xhigh'] as const;
const effortSchema = () => Type.Union(EFFORTS.map((v) => Type.Literal(v)));
export interface AskCodexDependencies {
  resolveBinary: typeof resolveCodexBinary;
  desktopRunning: typeof isCodexDesktopRunning;
  createClient: (options: AppServerClientOptions) => AppServerClient;
}
export interface AskCodexDetails {
  conversationId?: string;
  turnId?: string;
  status: TurnStatus;
  binary?: Pick<ResolvedCodexBinary, 'path' | 'source'>;
  desktop?: { running: DesktopStatus };
  warnings: string[];
  approvals: ApprovalDecisionRecord[];
  usage?: ThreadTokenUsage;
  model?: string;
  effort?: string;
  mode: AskCodexMode;
  elapsedMs: number;
  aborted: boolean;
  timedOut: boolean;
  stderrTail?: string;
  plan?: unknown;
  diff?: string;
  errors: string[];
}
const DESCRIPTION =
  "Delegate to the local OpenAI Codex harness with sandbox, web search, the user's Codex MCP/skills/plugins, and Computer Use over the user's real browser and native Windows apps when Codex Desktop is running. Codex runs its own tool loop.";
const preview = (text: string) =>
  text.slice(0, 1000).split('\n').slice(0, 6).join('\n');

export function registerAskCodexTool(
  pi: Pick<ExtensionAPI, 'registerTool'>,
  config: AskCodexConfig = loadConfig(),
  deps: AskCodexDependencies = {
    resolveBinary: resolveCodexBinary,
    desktopRunning: isCodexDesktopRunning,
    createClient: (o) => new AppServerClient(o),
  },
): void {
  if (!config.enabled) return;
  pi.registerTool({
    name: 'AskCodex',
    exposure: 'model-only',
    label: 'Ask Codex',
    renderShell: 'self',
    description: DESCRIPTION,
    promptGuidelines: [
      'Plan uses a read-only shell sandbox; MCP and Computer Use actions are not made read-only.',
    ],
    parameters: Type.Object({
      prompt: Type.String({
        description: 'Self-contained task and all necessary context for Codex.',
      }),
      mode: Type.Optional(
        Type.Union([Type.Literal('plan'), Type.Literal('accept-edits')], {
          default: config.defaultMode,
        }),
      ),
      conversationId: Type.Optional(
        Type.String({ description: 'Returned thread id for continuation.' }),
      ),
      model: Type.Optional(Type.String()),
      thinking: Type.Optional(effortSchema()),
      cwd: Type.Optional(
        Type.String({
          description: 'Workspace directory; defaults to the current Pi cwd.',
        }),
      ),
      digest: Type.Optional(
        Type.Boolean({
          description:
            'Compact digest; default true in plan mode, otherwise false.',
        }),
      ),
      includeContext: Type.Optional(
        Type.Boolean({
          default: false,
          description:
            'Export the resolved Pi conversation to a private temporary file only when explicitly requested.',
        }),
      ),
      webSearch: Type.Optional(
        Type.Union([
          Type.Literal('live'),
          Type.Literal('cached'),
          Type.Literal('disabled'),
        ]),
      ),
      timeoutMinutes: Type.Optional(
        Type.Number({
          exclusiveMinimum: 0,
          default: config.defaultTimeoutMinutes,
        }),
      ),
    }),
    renderCall(args, theme, context) {
      const text = () =>
        theme.fg('mdLink', theme.bold('AskCodex ')) +
        theme.fg(
          'accent',
          `[${args.mode ?? config.defaultMode}, ${args.model ?? config.defaultModel ?? 'Codex default'}] `,
        ) +
        theme.fg('muted', preview(String(args.prompt ?? '')));
      return renderToolCard(
        theme,
        text,
        () => ({ title: 'AskCodex', body: text().split('\n') }),
        'start',
        context,
      );
    },
    renderResult(result, { expanded, isPartial }, theme, context) {
      const d = result.details as AskCodexDetails | undefined;
      const status = isPartial
        ? 'running'
        : d?.status === 'completed'
          ? 'completed'
          : 'failed';
      const body = result.content
        .filter((c) => c.type === 'text')
        .map((c) => c.text)
        .join('\n');
      const text = () => {
        const glyph =
          getRenderKit()?.indicator(theme, context, {
            status,
            frame: Math.floor(Date.now() / 80),
          }).glyph ?? (isPartial ? '◉' : status === 'completed' ? '✓' : '✗');
        return (
          theme.fg(
            status === 'failed' ? 'error' : 'mdLink',
            `${glyph} AskCodex`,
          ) +
          ` ${formatDuration(d?.elapsedMs ?? 0)}\n` +
          theme.fg('toolOutput', expanded ? body : preview(body))
        );
      };
      return renderToolCard(
        theme,
        text,
        (kit) => ({
          title: 'AskCodex',
          body: text().split('\n'),
          status,
          context,
          isError: status === 'failed',
          footer: renderToolFooter(kit, theme, {
            status,
            context,
            elapsedMs: d?.elapsedMs,
          }),
        }),
        'end',
        context,
        { isPartial, isError: status === 'failed' },
      );
    },
    async execute(_id, params, signal, onUpdate, ctx) {
      const started = Date.now();
      const mode = params.mode ?? config.defaultMode;
      const effort = params.thinking ?? config.defaultEffort;
      const model = params.model?.trim() || config.defaultModel;
      const details: AskCodexDetails = {
        status: 'failed',
        mode,
        model,
        effort,
        warnings: [],
        approvals: [],
        errors: [],
        elapsedMs: 0,
        aborted: false,
        timedOut: false,
      };
      let client: AppServerClient | undefined;
      let scratch: string | undefined;
      let tick: ReturnType<typeof setInterval> | undefined;
      let deadline: ReturnType<typeof setTimeout> | undefined;
      let interruptDeadline: ReturnType<typeof setTimeout> | undefined;
      let answer = '';
      let current = 'initializing';
      let tail = '';
      let cancelled = false;
      let stop!: () => void;
      const stopped = new Promise<'stopped'>((resolve) => {
        stop = () => {
          cancelled = true;
          resolve('stopped');
        };
      });
      const abort = () => {
        details.aborted = true;
        stop();
      };
      const checkpoint = () => {
        if (cancelled) throw new Error('Delegation interrupted');
      };
      try {
        if (!params.prompt.trim()) throw new Error('prompt must not be empty');
        if (
          effort !== undefined &&
          !EFFORTS.includes(effort as (typeof EFFORTS)[number])
        )
          throw new Error(
            `Unsupported effort: ${effort}. Use ${EFFORTS.join('|')}`,
          );
        if (mode !== 'plan' && mode !== 'accept-edits')
          throw new Error('mode must be plan or accept-edits');
        const timeout = params.timeoutMinutes ?? config.defaultTimeoutMinutes;
        if (
          !Number.isFinite(timeout) ||
          timeout <= 0 ||
          timeout * 60000 > 2147483647
        )
          throw new Error(
            'timeoutMinutes must be positive and within the supported timer range',
          );
        const cwd = path.resolve(params.cwd || ctx.cwd);
        if (!fs.statSync(cwd).isDirectory())
          throw new Error(`cwd is not a directory: ${cwd}`);
        if (
          params.conversationId !== undefined &&
          !params.conversationId.trim()
        )
          throw new Error('conversationId must not be empty');
        const webSearch = params.webSearch ?? config.webSearch;
        if (!['live', 'cached', 'disabled'].includes(webSearch))
          throw new Error('webSearch must be live, cached or disabled');
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) abort();
        checkpoint();
        deadline = setTimeout(() => {
          details.timedOut = true;
          stop();
        }, timeout * 60000);
        const binary = deps.resolveBinary({ config });
        details.binary = { path: binary.path, source: binary.source };
        details.warnings.push(...binary.warnings);
        client = deps.createClient({
          binaryPath: binary.path,
          log: (message, data) => {
            if (message === 'termination-warning')
              details.warnings.push(
                `${message}: ${(data as { reason: string }).reason}`,
              );
          },
          cwd,
          extraArgs: config.extraArgs,
          serverRequestHandler: createApprovalHandler({
            allowedApps: config.allowedApps,
            ui: ctx.hasUI
              ? {
                  ask: (prompt, approvalSignal) =>
                    askApproval(ctx, prompt, approvalSignal),
                }
              : undefined,
            onDecision: (d) => details.approvals.push(d),
          }),
        });
        const active = client;
        active.onNotification('turn/started', (n) => {
          details.turnId = n.turn.id;
          details.conversationId = n.threadId;
        });
        active.onNotification('item/started', ({ item }) => {
          current = `${item.type}${typeof item.command === 'string' ? `: ${item.command.slice(0, 120)}` : ''}`;
        });
        active.onNotification('item/agentMessage/delta', (n) => {
          tail = (tail + n.delta).slice(-160);
        });
        active.onNotification('item/completed', ({ item }) => {
          if (item.type === 'agentMessage' && typeof item.text === 'string')
            answer = item.text;
        });
        active.onNotification('thread/tokenUsage/updated', (n) => {
          details.usage = n.tokenUsage;
        });
        active.onNotification('turn/plan/updated', (n) => {
          details.plan = n.plan;
        });
        active.onNotification('turn/diff/updated', (n) => {
          details.diff = n.diff.slice(-16000);
        });
        active.onNotification('error', (n) => {
          details.errors.push(n.error.message);
        });
        tick = setInterval(() => {
          details.elapsedMs = Date.now() - started;
          onUpdate?.({
            content: [
              {
                type: 'text',
                text: `${formatDuration(details.elapsedMs)} · ${current}${tail ? ` · ${tail}` : ''}`,
              },
            ],
            details: { ...details, status: 'inProgress' },
          });
        }, 1000);
        const work = async () => {
          details.desktop = { running: await deps.desktopRunning() };
          if (details.desktop.running === false)
            details.warnings.push(
              'Native-app Computer Use requires Codex Desktop running.',
            );
          checkpoint();
          let prompt = params.prompt;
          if (params.digest ?? mode === 'plan')
            prompt = `Return a compact digest: findings, decisions, changed paths and verification; avoid full file dumps.\n\n${prompt}`;
          if (params.includeContext) {
            const { messages } = buildSessionContext(
              ctx.sessionManager.getBranch(),
            );
            // Inside the sandbox's readable workspace; exclusive creation and private permissions.
            scratch = path.join(cwd, `.askcodex-context-${randomUUID()}.md`);
            fs.writeFileSync(scratch, renderContext(messages), {
              mode: 0o600,
              flag: 'wx',
            });
            prompt += `\n\nRead the resolved Pi conversation before working. Pi context file: ${scratch}`;
          }
          await active.initialize();
          checkpoint();
          const threadParams = {
            cwd,
            sandbox:
              mode === 'plan'
                ? ('read-only' as const)
                : ('workspace-write' as const),
            approvalPolicy: 'on-request' as const,
            approvalsReviewer: 'user' as const,
            model,
            developerInstructions: buildDeveloperInstructions(),
            config: { web_search: webSearch },
          };
          const { thread } = params.conversationId
            ? await active.threadResume({
                ...threadParams,
                threadId: params.conversationId,
              })
            : await active.threadStart({ ...threadParams, ephemeral: false });
          details.conversationId = thread.id;
          checkpoint();
          const { turn } = await active.turnStart({
            threadId: thread.id,
            input: [{ type: 'text', text: prompt, text_elements: [] }],
            model,
            effort,
          });
          details.turnId = turn.id;
          checkpoint();
          const completed = await active.waitForTurnCompleted(turn.id);
          details.status = completed.turn.status;
          if (completed.turn.error)
            details.errors.push(completed.turn.error.message);
          if (!answer)
            for (const item of completed.turn.items)
              if (item.type === 'agentMessage' && item.text) answer = item.text;
        };
        const outcome = await Promise.race([work(), stopped]);
        if (outcome === 'stopped') {
          details.status = 'interrupted';
          const threadId = details.conversationId;
          const turnId = details.turnId;
          if (threadId && turnId) {
            await Promise.race([
              (async () => {
                await active.turnInterrupt({
                  threadId,
                  turnId,
                });
                await active.waitForTurnCompleted(turnId);
              })().catch(() => {}),
              new Promise<void>((resolve) => {
                interruptDeadline = setTimeout(resolve, 1500);
              }),
            ]);
          }
        }
        if (details.status === 'completed' && !answer.trim()) {
          details.status = 'failed';
          details.errors.push('Codex completed without an agent message.');
        }
      } catch (error) {
        details.status = cancelled ? 'interrupted' : 'failed';
        if (!cancelled)
          details.errors.push(
            error instanceof Error ? error.message : String(error),
          );
      } finally {
        clearTimeout(deadline);
        clearTimeout(interruptDeadline);
        clearInterval(tick);
        signal?.removeEventListener('abort', abort);
        try {
          if (client) {
            if (details.status !== 'completed')
              details.stderrTail = client.stderrTail;
            await client.close();
          }
        } catch (error) {
          details.warnings.push(`App-server cleanup failed: ${String(error)}`);
        } finally {
          try {
            if (scratch) fs.rmSync(scratch, { force: true });
          } catch (error) {
            details.warnings.push(`Context cleanup failed: ${String(error)}`);
          }
          details.elapsedMs = Date.now() - started;
        }
      }
      const failure =
        details.status === 'interrupted'
          ? `Codex interrupted (${details.timedOut ? 'timeout' : 'aborted'}).`
          : `Error: ${details.errors.join('; ') || 'Codex turn failed.'}`;
      const text =
        (details.status === 'completed'
          ? answer
          : `${failure}${answer ? `\n\n${answer}` : ''}`) +
        (details.conversationId
          ? `\n\nconversationId: ${details.conversationId} (pass this to AskCodex to continue)`
          : '') +
        (details.warnings.length
          ? `\n\nNotes: ${details.warnings.join('\n')}`
          : '');
      return { content: [{ type: 'text', text }], details };
    },
  });
}

/** Use the shared questionnaire when available; only unavailable permits fallback. */
async function askApproval(
  ctx: ExtensionToolContext,
  prompt: ApprovalPrompt,
  approvalSignal: AbortSignal,
): Promise<string | undefined> {
  const provider = getQuestionService();
  if (provider) {
    const result = await provider.ask(
      ctx,
      {
        questions: [
          {
            id: 'approval',
            header: 'Codex approval',
            prompt: prompt.prompt,
            type: 'single',
            allowCustom: false,
            options: prompt.options.map((label) => ({
              value: label,
              label,
              preview: prompt.preview,
            })),
          },
        ],
      },
      { signal: approvalSignal },
    );
    if (approvalSignal.aborted) return undefined;
    if (result?.status !== 'unavailable') {
      const answer = result?.answers?.approval;
      return result?.status === 'answered' &&
        answer?.status === 'answered' &&
        answer.customText === undefined &&
        Array.isArray(answer.values) &&
        answer.values.length === 1 &&
        prompt.options.includes(answer.values[0])
        ? answer.values[0]
        : undefined;
    }
  }
  if (approvalSignal.aborted) return undefined;
  return ctx.ui.select(prompt.title, prompt.options, {
    signal: approvalSignal,
  });
}

/** The resolved branch only: preserve prose, bound tool payloads, omit non-text media. */
function renderContext(messages: readonly unknown[]): string {
  return (
    '# Pi conversation context\n\n' +
    messages
      .map((raw) => {
        const m = raw as { role?: string; content?: unknown };
        const blocks = contextText(m.content);
        return `## ${m.role ?? 'message'}\n\n${m.role === 'toolResult' ? blocks.slice(0, 2000) : blocks}`;
      })
      .join('\n\n')
  );
}

function contextText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map(
      (block: {
        type?: string;
        text?: string;
        name?: string;
        arguments?: unknown;
      }) => {
        if (block.type === 'text') return block.text ?? '';
        if (block.type === 'toolCall')
          return `Tool call ${block.name}: ${JSON.stringify(block.arguments ?? null).slice(0, 2000)}`;
        return '';
      },
    )
    .filter(Boolean)
    .join('\n');
}
