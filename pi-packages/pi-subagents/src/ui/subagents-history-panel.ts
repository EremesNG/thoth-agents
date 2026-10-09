import { getRenderKit, resolveIcon } from '@thoth-agents/pi-core';
import {
  HistoryPanel,
  type HistoryPanelAdapter,
  type HistoryPanelContext,
  type HistoryPanelHeader,
  type HistoryPanelLine,
  type HistoryPanelMouseEvent,
} from '@thoth-agents/pi-core/history-panel';
import { truncateToWidth as terminalTruncateToWidth } from '../render/text-width.js';
import { formatDuration, formatTaskLabel } from '../render/tools/formatting.js';
import {
  isValidThreadSnapshot,
  renderThreadBodyItems,
} from '../thread-view.js';
import type {
  SubagentTask,
  SubagentThreadRenderContext,
  SubagentThreadSnapshot,
  UsageStats,
} from '../types.js';
import type { SubagentProviderLimitCache } from './provider-limit-cache.js';
import {
  agentIcon,
  BOX_CHARS,
  cyberSeparator,
  themeAccent,
  themeDim,
  themeFg,
  themeStatus,
} from './theme.js';

function clip(text: string | undefined, limit: number): string {
  if (!text) return '';
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (getRenderKit()?.icon)
    return terminalTruncateToWidth(
      normalized,
      limit,
      resolveIcon('ellipsis', '…'),
    );
  return normalized.length > limit
    ? `${normalized.slice(0, Math.max(0, limit - 1))}…`
    : normalized;
}

function formatTaskDuration(task: SubagentTask): string {
  const start = task.started_at
    ? Date.parse(task.started_at)
    : Date.parse(task.created_at);
  const end = task.ended_at ? Date.parse(task.ended_at) : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return '';
  return formatDuration(Math.round((end - start) / 1000) * 1000);
}

function formatTokens(count: number): string {
  if (count < 1000) return count.toString();
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
  if (count < 1000000) return `${Math.round(count / 1000)}k`;
  return `${(count / 1000000).toFixed(1)}M`;
}

function formatTimeout(milliseconds: number | undefined): string | undefined {
  if (
    !Number.isFinite(milliseconds) ||
    milliseconds === undefined ||
    milliseconds <= 0
  )
    return undefined;
  let seconds = Math.max(1, Math.round(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  seconds %= 3600;
  const minutes = Math.floor(seconds / 60);
  seconds %= 60;
  return [
    hours ? `${hours}h` : '',
    minutes ? `${minutes}m` : '',
    seconds ? `${seconds}s` : '',
  ]
    .filter(Boolean)
    .join('');
}

function formatUsage(usage?: UsageStats, contextWindow?: number): string {
  if (!usage) return '';
  const parts: string[] = [];
  if (usage.turns)
    parts.push(`${usage.turns} turn${usage.turns > 1 ? 's' : ''}`);
  if (usage.input)
    parts.push(`${resolveIcon('tokensIn', '↑')}${formatTokens(usage.input)}`);
  if (usage.output)
    parts.push(`${resolveIcon('tokensOut', '↓')}${formatTokens(usage.output)}`);
  if (usage.cacheRead) parts.push(`R${formatTokens(usage.cacheRead)}`);
  if (usage.cacheWrite) parts.push(`W${formatTokens(usage.cacheWrite)}`);
  if (usage.cost) parts.push(`$${usage.cost.toFixed(4)}`);
  if (usage.contextTokens) {
    let context = `ctx:${formatTokens(usage.contextTokens)}`;
    if (
      Number.isFinite(contextWindow) &&
      contextWindow !== undefined &&
      contextWindow > 0
    ) {
      const percentage = (usage.contextTokens / contextWindow) * 100;
      const formatted = Number.isInteger(percentage)
        ? percentage.toFixed(0)
        : percentage.toFixed(1);
      context += ` (${formatted}%)`;
    }
    parts.push(context);
  }
  return parts.join(' ');
}

type SubagentsHistoryPanelDisplayOptions = {
  providerLimits?: Pick<SubagentProviderLimitCache, 'warningText'>;
  timeoutMs?: number;
  stallTimeoutMs?: number;
  contextWindowForTask?: (task: SubagentTask) => number | undefined;
};

function normalizeTerminalErrorText(text: string | undefined): string {
  return text?.replace(/\s+/g, ' ').trim().toLowerCase() ?? '';
}

function hasEquivalentSnapshotError(
  snapshot: SubagentThreadSnapshot,
  errorText: string,
): boolean {
  const normalized = normalizeTerminalErrorText(errorText);
  if (!normalized) return false;
  return snapshot.items.some((item) => {
    if (item.type === 'error')
      return normalizeTerminalErrorText(item.text) === normalized;
    if (item.type === 'assistant')
      return (
        normalizeTerminalErrorText(item.message.errorMessage) === normalized
      );
    return false;
  });
}

function snapshotHasActiveTools(
  snapshot: SubagentThreadSnapshot | undefined,
): boolean {
  if (!snapshot?.items?.length) return false;
  return snapshot.items.some(
    (item) =>
      (item.type === 'tool' &&
        ['pending', 'running', 'partial'].includes(item.status)) ||
      (item.type === 'bash' &&
        (item.status === undefined || item.status === 'running')),
  );
}

export class SubagentsHistoryPanel {
  private readonly panel: HistoryPanel<SubagentTask>;
  private toolOutputExpanded = false;
  private hideThinkingBlock = false;
  private hydratedTasks = new Map<
    string,
    { signature: string; task: SubagentTask }
  >();
  private bodyCache = new Map<
    string,
    Array<{ text: string; taskId?: string }>
  >();

  constructor(
    private tasksProvider: SubagentTask[] | (() => SubagentTask[]),
    private theme: any,
    done: () => void,
    matchesKey: (data: string, key: string) => boolean,
    private visibleWidth: (text: string) => number,
    private nativeTruncateToWidth: (text: string, width: number) => string,
    private renderContext: Partial<SubagentThreadRenderContext> = {},
    maxLinesProvider: number | (() => number) = 42,
    private taskResolver?: (id: string) => SubagentTask | undefined,
    initialSelectedTaskId?: string,
    cancelSelectedTask?: (id: string) => void,
    private detailCancelShortcut = 'x',
    private displayOptions: SubagentsHistoryPanelDisplayOptions = {},
  ) {
    const adapter: HistoryPanelAdapter<SubagentTask> = {
      items: () => this.tasks(),
      id: (task) => task.id,
      renderItemLabel: (task, context) => this.itemLabel(task, context),
      renderHeader: (task, context) => this.headerFor(task, context),
      renderContent: (task, width) => this.contentFor(task, width),
      handleInput: (data) => {
        if (matchesKey(data, 'ctrl+o') || data === '\u000f') {
          this.toolOutputExpanded = !this.toolOutputExpanded;
          return true;
        }
        if (matchesKey(data, 'ctrl+t') || data === '\u0014') {
          this.hideThinkingBlock = !this.hideThinkingBlock;
          return true;
        }
        return false;
      },
      canClose: (task) => task.status === 'queued' || task.status === 'running',
      close: (task) => cancelSelectedTask?.(task.id),
      invalidate: () => {
        this.bodyCache.clear();
        this.hydratedTasks.clear();
      },
    };
    this.panel = new HistoryPanel(adapter, {
      title: 'subagents',
      listLabel: 'executions',
      emptyText: 'No subagent tasks recorded in this session yet.',
      theme: {
        fg: (role, text) => theme?.fg?.(role, text) ?? text,
        bold: (text) => theme?.bold?.(text) ?? text,
      },
      onClose: done,
      disposeOnClose: false,
      maxLines: maxLinesProvider,
      initialSelectedId: initialSelectedTaskId,
      matchesKey,
      visibleWidth,
      truncateToWidth: this.truncateToWidth,
      closeKey: 'detailCancel',
      confirmClose: false,
      // The overlay host owns its refresh timer and render requests.
      refreshMs: 0,
      titleIcon: agentIcon,
      footerActions: () =>
        `ctrl+o expand ${resolveIcon('separator', '·')} ctrl+t thinking`,
    });
  }

  private truncateToWidth = (text: string, width: number): string =>
    getRenderKit()?.icon
      ? terminalTruncateToWidth(text, width, resolveIcon('ellipsis', '…'))
      : this.nativeTruncateToWidth(text, width);

  invalidate(): void {
    this.panel.invalidate();
  }
  dispose(): void {
    this.panel.dispose();
  }
  handleMouse(event: HistoryPanelMouseEvent) {
    return this.panel.handleMouse(event);
  }
  handleInput(data: string): void {
    this.panel.handleInput(data);
  }
  render(width: number): string[] {
    return this.panel.render(width);
  }
  cancelSelectedActiveTask(): void {
    this.panel.closeSelectedItem();
  }

  getRenderDebugState() {
    const state = this.panel.getRenderDebugState();
    const task = this.panel.selectedItem();
    return {
      taskCount: state.itemCount,
      selectedIndex: state.selectedIndex,
      selectedStatus: task?.status,
      scrollOffset: state.scrollOffset,
      followTail: state.followTail,
      hasUsage: Boolean(task?.usage),
      configuredMaxLines: state.configuredMaxLines,
      renderWidth: state.renderWidth,
      renderedLineCount: state.renderedLineCount,
      bodyHeight: state.bodyHeight,
      maxVisibleWidth: state.maxVisibleWidth,
      widthViolationCount: state.widthViolationCount,
      clickableRowCount: state.clickableRowCount,
    };
  }

  private itemLabel(task: SubagentTask, context: HistoryPanelContext): string {
    const icon = context.selected
      ? resolveIcon('selectionSelected', '●')
      : resolveIcon('selectionUnselected', '○');
    const name = task.display_name?.trim() || task.agent;
    if (context.layout === 'wide') {
      const effort = task.effort ? ` effort:${task.effort}` : '';
      return `${icon} ${name}:${task.status}${effort}`;
    }
    const duration = formatTaskDuration(task);
    return `${icon} ${context.index + 1}. ${name} ${resolveIcon('separator', '·')} ${task.status}${duration ? ` ${resolveIcon('separator', '·')} ${duration}` : ''}`;
  }

  private headerFor(
    task: SubagentTask,
    context: HistoryPanelContext,
  ): HistoryPanelHeader {
    const currentTask = this.resolveTaskForBody(task);
    const th = this.theme;
    const accent = (text: string) => themeAccent(th, text);
    const dim = (text: string) => themeDim(th, text);
    const status = themeStatus(th, currentTask.status);
    let contextWindow: number | undefined;
    try {
      contextWindow = this.displayOptions.contextWindowForTask?.(currentTask);
    } catch {}
    const limitWarning = this.displayOptions.providerLimits?.warningText(
      currentTask.id,
    );
    const limitField = limitWarning
      ? `limit: ${themeFg(th, 'warning', limitWarning)}`
      : undefined;
    const usage = formatUsage(currentTask.usage, contextWindow);
    const duration = formatTaskDuration(currentTask);
    const timeout = formatTimeout(this.displayOptions.timeoutMs);
    const timeoutHint = timeout ? ` (timeout ${timeout})` : '';
    const stall = formatTimeout(this.displayOptions.stallTimeoutMs);
    const stallHint = stall ? ` (stall ${stall})` : '';
    const canCancel =
      currentTask.status === 'queued' || currentTask.status === 'running';
    const cancelDetailHint =
      canCancel && this.detailCancelShortcut
        ? `(${this.detailCancelShortcut} cancel)`
        : '';
    const cancelActiveHint =
      canCancel && this.detailCancelShortcut
        ? `${this.detailCancelShortcut} cancel active`
        : '';
    const lastActivity = currentTask.last_activity
      ? `${currentTask.last_activity}${stallHint}`
      : undefined;
    const separator = ` ${themeFg(th, 'accent', cyberSeparator())} `;
    const displayName = currentTask.display_name?.trim();
    let taskText = (currentTask.task || '').trim().replace(/\s+/g, ' ');
    if (
      displayName &&
      taskText.toLowerCase().startsWith(displayName.toLowerCase())
    ) {
      taskText = taskText
        .slice(displayName.length)
        .replace(/^[:\s\-–—]+/, '')
        .trim();
    }
    const titlePart = displayName
      ? `task: ${accent(displayName)}${taskText ? ` ${resolveIcon('separator', '·')} ${dim(taskText)}` : ''}`
      : taskText
        ? `task: ${accent(taskText)}`
        : undefined;
    const narrowDetails = [
      limitField,
      titlePart,
      currentTask.model ? `model: ${dim(currentTask.model)}` : undefined,
    ]
      .filter(Boolean)
      .join(separator);
    return {
      badge: `${accent(currentTask.agent)} ${resolveIcon('separator', '·')} ${status}${duration ? ` ${resolveIcon('separator', '·')} ${dim(duration)}` : ''}`,
      shortcuts: dim(
        `${cancelActiveHint ? `${cancelActiveHint} ${resolveIcon('separator', '·')} ` : ''}ctrl+o expand ${resolveIcon('separator', '·')} ctrl+t thinking ${resolveIcon('separator', '·')} `,
      ),
      wideRows: [
        [
          `agent: ${accent(currentTask.agent)}`,
          `status: ${status}`,
          currentTask.effort
            ? `effort: ${accent(currentTask.effort)}${cancelDetailHint ? ` ${dim(cancelDetailHint)}` : ''}`
            : undefined,
          currentTask.model ? `model: ${currentTask.model}` : undefined,
          duration ? `duration: ${duration}${timeoutHint}` : undefined,
          usage ? `usage: ${usage}` : undefined,
        ]
          .filter(Boolean)
          .join(separator),
        [
          limitField,
          usage ? `usage: ${usage}` : undefined,
          lastActivity ? `last: ${lastActivity}` : undefined,
          displayName ? `name: ${accent(displayName)}` : undefined,
          currentTask.task
            ? `task: ${clip(currentTask.task, Math.max(20, context.width - 30))}`
            : undefined,
        ]
          .filter(Boolean)
          .join(separator),
      ],
      narrowRows: [
        [
          accent(`${context.index + 1}/${context.count}`),
          `agent: ${accent(currentTask.agent)}`,
          `status: ${status}`,
          duration ? `duration: ${duration}` : undefined,
          currentTask.effort
            ? `effort: ${accent(currentTask.effort)}`
            : undefined,
        ]
          .filter(Boolean)
          .join(separator),
        ...(narrowDetails ? [narrowDetails] : []),
      ],
    };
  }

  private contentFor(task: SubagentTask, width: number): HistoryPanelLine[] {
    const currentTask = this.resolveTaskForBody(task);
    const structured = isValidThreadSnapshot(currentTask.thread_snapshot);
    const body = this.bodyEntriesFor(currentTask, width);
    const entries = structured ? body : this.wrapWithTaskIds(body, width);
    return entries.map(({ text, taskId }) => ({
      text: structured ? text : this.renderFlowLine(text, width),
      itemId: taskId,
    }));
  }

  private tasks(): SubagentTask[] {
    return typeof this.tasksProvider === 'function'
      ? this.tasksProvider()
      : this.tasksProvider;
  }

  private renderFlowLine(raw: string, width: number): string {
    const th = this.theme;
    if (raw.startsWith('Preparing for response') || /^\*\*.+\*\*$/.test(raw)) {
      const clipped = this.truncateToWidth(raw, width);
      const text = th?.bold?.(clipped) ?? clipped;
      return th?.fg?.('dim', text) ?? text;
    }
    if (this.isToolLikeLine(raw)) {
      const border = (t: string) => themeFg(th, 'accent', t);
      const prefix = border(`${BOX_CHARS.vertical} `);
      const maxTextWidth = Math.max(0, width - 2);
      const clipped = this.truncateToWidth(raw, maxTextWidth);
      const text = th?.fg?.('toolTitle', clipped) ?? clipped;
      return `${prefix}${text}`;
    }
    if (raw.startsWith('done') || raw.startsWith('completed')) {
      const clipped = this.truncateToWidth(raw, width);
      return th?.fg?.('success', clipped) ?? clipped;
    }
    if (raw.startsWith('failed') || raw.startsWith('error')) {
      const clipped = this.truncateToWidth(raw, width);
      return th?.fg?.('error', clipped) ?? clipped;
    }
    if (
      raw.startsWith('# ') ||
      raw.startsWith('## ') ||
      raw.startsWith('### ')
    ) {
      const border = (t: string) => themeFg(th, 'accent', t);
      const titleText = raw.replace(/^#+\s*/, '');
      const maxTitle = Math.max(4, width - 8);
      const clippedTitle = this.truncateToWidth(titleText, maxTitle);
      const heading =
        th?.bold?.(th?.fg?.('mdHeading', clippedTitle) ?? clippedTitle) ??
        clippedTitle;
      const leftFrame = `${border(BOX_CHARS.topLeft + BOX_CHARS.horizontal + ' ')}${heading} `;
      const leftVisWidth = this.visibleWidth(leftFrame);
      const rightCorner = border(BOX_CHARS.topRight);
      const rightVisWidth = this.visibleWidth(rightCorner);
      const filler = Math.max(0, width - leftVisWidth - rightVisWidth);
      const framed = `${leftFrame}${border(BOX_CHARS.horizontal.repeat(filler))}${rightCorner}`;
      return framed;
    }
    if (raw.startsWith('  ')) {
      const clipped = this.truncateToWidth(raw, width);
      return th?.fg?.('dim', clipped) ?? clipped;
    }
    return this.truncateToWidth(raw, width);
  }

  private taskSignature(task: SubagentTask): string {
    const snapshot = task.thread_snapshot;
    return [
      task.id,
      task.status,
      task.last_activity_at ?? '',
      task.ended_at ?? '',
      snapshot?.updated_at ?? '',
      snapshot?.items?.length ?? 0,
    ].join('|');
  }

  private resolveTaskForBody(task: SubagentTask): SubagentTask {
    if (task.thread_snapshot || !this.taskResolver) return task;
    const signature = this.taskSignature(task);
    const cached = this.hydratedTasks.get(task.id);
    if (cached?.signature === signature) return cached.task;
    const hydrated = this.taskResolver(task.id) ?? task;
    this.hydratedTasks.set(task.id, { signature, task: hydrated });
    return hydrated;
  }

  private bodyCacheKey(task: SubagentTask, width: number): string {
    return [
      this.taskSignature(task),
      width,
      this.toolOutputExpanded ? 'expanded' : 'collapsed',
      this.hideThinkingBlock ? 'thinking-hidden' : 'thinking-visible',
    ].join('|');
  }

  private resolveTaskIdFromSnapshotItem(
    item: any,
    tasks: SubagentTask[],
  ): string | undefined {
    if (!item) return undefined;
    const directId =
      item.taskId ?? item.task_id ?? item.subagentTaskId ?? item.subtaskId;
    if (typeof directId === 'string' && directId.trim()) return directId.trim();

    const details = item.result?.details;
    if (details) {
      if (typeof details.task?.id === 'string' && details.task.id.trim())
        return details.task.id.trim();
      if (typeof details.task_id === 'string' && details.task_id.trim())
        return details.task_id.trim();
      if (typeof details.taskId === 'string' && details.taskId.trim())
        return details.taskId.trim();
      if (Array.isArray(details.tasks) && details.tasks[0]?.id)
        return String(details.tasks[0].id).trim();
      if (Array.isArray(details.task_ids) && details.task_ids[0])
        return String(details.task_ids[0]).trim();
    }

    const resultTaskId =
      item.result?.task_id ?? item.result?.taskId ?? item.result?.task?.id;
    if (typeof resultTaskId === 'string' && resultTaskId.trim())
      return resultTaskId.trim();

    const argsTaskId =
      item.arguments?.task_id ??
      item.arguments?.taskId ??
      item.arguments?.task?.id;
    if (typeof argsTaskId === 'string' && argsTaskId.trim())
      return argsTaskId.trim();

    const toolName = typeof item.name === 'string' ? item.name : '';
    const isSubagentTool =
      toolName === 'subagent_run' ||
      toolName === 'subagent_continue' ||
      toolName === 'subagent' ||
      toolName.startsWith('subagent');

    if (isSubagentTool || item.type === 'subagent') {
      const agentCandidate = item.arguments?.agent ?? item.arguments?.name;
      if (typeof agentCandidate === 'string' && agentCandidate.trim()) {
        const found = tasks.find(
          (t) =>
            t.id === agentCandidate ||
            t.agent === agentCandidate ||
            t.display_name === agentCandidate,
        );
        if (found) return found.id;
      }
      const taskCandidate = item.arguments?.task;
      if (typeof taskCandidate === 'string' && taskCandidate.trim()) {
        const found = tasks.find(
          (t) => t.task === taskCandidate || t.display_name === taskCandidate,
        );
        if (found) return found.id;
      }
    }

    return undefined;
  }

  private resolveTaskIdFromFlowLine(
    line: string,
    tasks: SubagentTask[],
  ): { cleanLine: string; taskId?: string } {
    const trimmed = line.trim();
    if (!trimmed) return { cleanLine: line };

    if (
      trimmed.startsWith('subagent:') ||
      trimmed.startsWith('model:') ||
      trimmed.startsWith('usage:') ||
      trimmed.startsWith('#') ||
      trimmed.startsWith('Preparing for response') ||
      trimmed.startsWith('done') ||
      trimmed.startsWith('completed') ||
      trimmed.startsWith('failed') ||
      trimmed.startsWith('error')
    ) {
      return { cleanLine: line };
    }

    let cleanLine = line;
    let taskId: string | undefined;

    const rawIdMatch = line.match(/\b(subtask_[a-zA-Z0-9_-]+)\b/);
    if (rawIdMatch) {
      taskId = rawIdMatch[1];
      cleanLine = cleanLine
        .replace(/\s*[([]?subtask_[a-zA-Z0-9_-]+[)\]]?/g, '')
        .replace(/\s{2,}/g, ' ')
        .trimEnd();
    }

    if (!taskId) {
      if (trimmed === 'main') {
        const found = tasks.find((t) => t.id === 'main' || t.agent === 'main');
        if (found) taskId = found.id;
      }

      const subagentMatch = trimmed.match(/^subagent\s+([^\s:]+)/);
      if (subagentMatch) {
        const agentName = subagentMatch[1]!;
        const found = tasks.find(
          (t) =>
            t.id === agentName ||
            t.agent === agentName ||
            t.display_name === agentName,
        );
        if (found) taskId = found.id;
      }

      const bulletMatch = trimmed.match(/^(?:󰣇|●|○)\s+([^\s:]+)/);
      if (bulletMatch) {
        const agentName = bulletMatch[1]!;
        const found = tasks.find(
          (t) =>
            t.id === agentName ||
            t.agent === agentName ||
            t.display_name === agentName,
        );
        if (found) taskId = found.id;
      }

      if (!taskId) {
        for (const t of tasks) {
          if (
            t.agent &&
            (trimmed.startsWith(`${t.agent} `) ||
              trimmed.startsWith(`${t.agent}:`) ||
              trimmed === t.agent)
          ) {
            taskId = t.id;
            break;
          }
          if (
            t.display_name &&
            (trimmed.startsWith(`${t.display_name} `) ||
              trimmed.startsWith(`${t.display_name}:`) ||
              trimmed === t.display_name)
          ) {
            taskId = t.id;
            break;
          }
        }
      }
    }

    return { cleanLine, taskId };
  }

  private wrapWithTaskIds(
    entries: Array<{ text: string; taskId?: string }>,
    width: number,
  ): Array<{ text: string; taskId?: string }> {
    const out: Array<{ text: string; taskId?: string }> = [];
    for (const entry of entries) {
      const wrappedTexts = this.wrap(entry.text, width);
      for (const text of wrappedTexts) {
        out.push({ text, taskId: entry.taskId });
      }
    }
    return out;
  }

  private executionFlowEntriesFor(
    task: SubagentTask,
  ): Array<{ text: string; taskId?: string }> {
    const rawFlow = this.executionFlowFor(task);
    const rawLines = rawFlow.split('\n');
    const tasks = this.tasks();
    return rawLines.map((line) => {
      const { cleanLine, taskId } = this.resolveTaskIdFromFlowLine(line, tasks);
      return { text: cleanLine, taskId };
    });
  }

  private bodyEntriesFor(
    task: SubagentTask,
    width: number,
  ): Array<{ text: string; taskId?: string }> {
    const activeSnapshot = isValidThreadSnapshot(task.thread_snapshot)
      ? task.thread_snapshot
      : undefined;
    const allowCache = !snapshotHasActiveTools(activeSnapshot);
    const cacheKey = this.bodyCacheKey(task, width);
    if (allowCache) {
      const cached = this.bodyCache.get(cacheKey);
      if (cached) return cached;
    }
    let entries: Array<{ text: string; taskId?: string }>;
    if (activeSnapshot) {
      const snapshotItems = [...activeSnapshot.items];
      const delegatedPromptIndex = snapshotItems.findIndex((item) => {
        if (item.type !== 'user') return false;
        const label = item.label;
        return item.id === 'delegated-prompt' || label === 'delegated_task';
      });
      if (delegatedPromptIndex >= 0) {
        const item = snapshotItems[delegatedPromptIndex];
        if (item?.type === 'user') {
          snapshotItems[delegatedPromptIndex] = {
            ...item,
            label: 'delegated_task',
            text: task.task,
          };
        }
      } else {
        let insertionIndex = snapshotItems[0]?.type === 'attempt' ? 1 : 0;
        while (true) {
          const item = snapshotItems[insertionIndex];
          if (item?.type !== 'user' || item.label !== 'context') break;
          insertionIndex++;
        }
        snapshotItems.splice(insertionIndex, 0, {
          type: 'user',
          id: 'delegated-prompt',
          label: 'delegated_task',
          text: task.task,
        });
      }
      const snapshotToRender = {
        ...activeSnapshot,
        items: snapshotItems,
      };

      const context = {
        ...this.renderContext,
        theme: this.renderContext.theme ?? this.theme,
        cwd: this.renderContext.cwd ?? process.cwd(),
        taskId: task.id,
        visibleWidth: this.renderContext.visibleWidth ?? this.visibleWidth,
        truncateToWidth: getRenderKit()?.icon
          ? this.truncateToWidth
          : (this.renderContext.truncateToWidth ?? this.truncateToWidth),
        renderWidth: width,
        toolOutputExpanded: this.toolOutputExpanded,
        hideThinkingBlock: this.hideThinkingBlock,
        includeFullDelegatedTask: true,
      };
      const renderedItems = renderThreadBodyItems(snapshotToRender, context);
      const renderedLines = renderedItems.flatMap((item) => item.lines);
      const rawLines = renderedLines.length ? renderedLines : [''];
      const knownTasks = this.tasks();

      if (renderedItems.length <= 1) {
        const taskId = renderedItems[0]
          ? this.resolveTaskIdFromSnapshotItem(
              renderedItems[0].item,
              knownTasks,
            )
          : undefined;
        entries = rawLines.map((text) => {
          const resolved = taskId
            ? { cleanLine: text, taskId }
            : this.resolveTaskIdFromFlowLine(text, knownTasks);
          return { text: resolved.cleanLine, taskId: resolved.taskId };
        });
      } else {
        const itemSlices = renderedItems.map(({ item, lines }) => ({
          lines,
          taskId: this.resolveTaskIdFromSnapshotItem(item, knownTasks),
        }));
        const flatLines = itemSlices.flatMap((slice) => slice.lines);
        if (
          flatLines.length === rawLines.length &&
          flatLines.join('\n') === rawLines.join('\n')
        ) {
          entries = itemSlices.flatMap((slice) =>
            slice.lines.map((text) => {
              const resolved = slice.taskId
                ? { cleanLine: text, taskId: slice.taskId }
                : this.resolveTaskIdFromFlowLine(text, knownTasks);
              return { text: resolved.cleanLine, taskId: resolved.taskId };
            }),
          );
        } else {
          entries = rawLines.map((lineText) => {
            const resolved = this.resolveTaskIdFromFlowLine(
              lineText,
              knownTasks,
            );
            return { text: resolved.cleanLine, taskId: resolved.taskId };
          });
        }
      }

      if (
        (task.status === 'failed' || task.status === 'cancelled') &&
        task.error &&
        !hasEquivalentSnapshotError(activeSnapshot, task.error)
      ) {
        entries.push({ text: '' }, { text: '# error' }, { text: task.error });
      }
      // Cache physical rows so both layouts use the same scroll offsets.
      entries = entries.flatMap((entry) =>
        entry.text.split(/\r?\n|\r/).map((text) => ({
          ...entry,
          text: terminalTruncateToWidth(text.replace(/\t/g, '  '), width),
        })),
      );
    } else {
      entries = this.executionFlowEntriesFor(task);
    }
    if (!allowCache) return entries;
    this.bodyCache.set(cacheKey, entries);
    if (this.bodyCache.size > 50) {
      const oldest = this.bodyCache.keys().next().value;
      if (oldest !== undefined) this.bodyCache.delete(oldest);
    }
    return entries;
  }

  private executionFlowFor(task: SubagentTask): string {
    const usage = formatUsage(task.usage);
    const hasResp =
      typeof task.result === 'string' && task.result.trim().length > 0;
    const parts = [
      `subagent: ${task.agent} ${resolveIcon('separator', '·')} status: ${task.status} ${resolveIcon('separator', '·')} attempt: ${task.attempt ?? 1} ${resolveIcon('separator', '·')} effort: ${task.effort ?? 'default/current'}`,
      `model: ${task.model ?? 'default/current'}`,
      usage ? `usage: ${usage}` : undefined,
      '',
      hasResp ? 'Preparing for response' : undefined,
      hasResp ? '' : undefined,
      ['# delegated task', task.task].join('\n'),
      task.context ? ['', '# context', task.context].join('\n') : undefined,
      task.continuation_prompt
        ? ['', '# continuation prompt', task.continuation_prompt].join('\n')
        : undefined,
      usage ? ['', '# usage', usage].join('\n') : undefined,
      task.transcript
        ? ['', '# execution', this.cleanTranscript(task.transcript)].join('\n')
        : undefined,
      task.error ? ['', '# error', task.error].join('\n') : undefined,
      hasResp
        ? ['', '# response sent to orchestrator', task.result].join('\n')
        : undefined,
      !task.transcript && !hasResp && !task.error
        ? [
            '',
            '# activity',
            `${task.last_activity ?? 'queued'}${task.output_preview ? `\n${task.output_preview}` : ''}`,
          ].join('\n')
        : undefined,
    ].filter(Boolean);
    return parts.join('\n').trim();
  }

  private cleanTranscript(transcript: string): string {
    return transcript
      .replace(/^# orchestrator prompt[\s\S]*?## delegated task\n/m, '')
      .replace(/\n# final assistant text[\s\S]*$/m, '')
      .replace(/\n# response sent to orchestrator[\s\S]*$/m, '')
      .split('\n')
      .filter((line) => !this.isNoiseLine(line))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private isToolLikeLine(raw: string): boolean {
    return (
      raw.startsWith('subagent ') ||
      raw.startsWith('memory_') ||
      raw.startsWith('read ') ||
      raw.startsWith('bash ') ||
      raw.startsWith('edit ') ||
      raw.startsWith('write ') ||
      raw.startsWith('tool ')
    );
  }

  private isNoiseLine(raw: string): boolean {
    const line = raw.trim();
    if (!line) return false;
    if (
      [
        'agent_start',
        'message_start',
        'message_update',
        'message_end',
        'turn_start',
        'turn_end',
      ].includes(line)
    )
      return true;
    if (/^\{.*\}$/.test(line)) return true;
    return false;
  }

  private wrap(text: string, width: number): string[] {
    const out: string[] = [];
    for (const raw of text.replace(/\t/g, '  ').split('\n')) {
      if (!raw) {
        out.push('');
        continue;
      }
      const indent = raw.match(/^\s*/)?.[0] ?? '';
      const words = raw.trimEnd().split(/\s+/);
      let line =
        indent && words.length ? indent + words.shift() : (words.shift() ?? '');
      for (const word of words) {
        const next = line ? `${line} ${word}` : word;
        if (this.visibleWidth(next) <= width) {
          line = next;
          continue;
        }
        if (line) out.push(line);
        if (this.visibleWidth(word) > width) {
          let rest = word;
          while (this.visibleWidth(rest) > width) {
            let cut = Math.max(1, width);
            while (cut > 1 && this.visibleWidth(rest.slice(0, cut)) > width)
              cut--;
            out.push(rest.slice(0, cut));
            rest = rest.slice(cut);
          }
          line = rest;
        } else {
          line = indent + word;
        }
      }
      if (line) out.push(line);
    }
    return out;
  }
}
