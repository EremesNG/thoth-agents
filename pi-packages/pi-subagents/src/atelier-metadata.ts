import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const ATELIER_METADATA_ENTRY = 'pi-atelier:subagent-metadata';

export type AtelierSessionOwner = {
  sessionId: string;
  sessionFile?: string;
};

export type AtelierAssistantMessage = {
  id?: string;
  role: string;
  timestamp?: number | string;
  usage?: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    totalTokens?: number;
    cost?: { total?: number };
  };
};

export type AtelierMetadataWriterOptions = {
  appendEntry?: (
    customType: string,
    data: { runIds: string[]; paths: string[]; asyncDirs: string[] },
  ) => void;
  getCurrentOwner?: () => AtelierSessionOwner | undefined;
  artifactRoot?: string;
};

export type AtelierRunOptions = {
  taskId: string;
  owner?: AtelierSessionOwner;
  cwd: string;
};

export type AtelierAttemptStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'interrupted';

type StepRecord = {
  agent: string;
  status: AtelierAttemptStatus;
  startedAt: number;
};

type StepUsage = {
  totals: Record<'input' | 'output' | 'cacheRead' | 'cacheWrite', number>;
  complete: Record<'input' | 'output' | 'cacheRead' | 'cacheWrite', boolean>;
  cost: number;
  costComplete: boolean;
  messages: number;
  seen: Set<string>;
  model?: string;
  exitCode?: number;
};

function safeString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value
    : undefined;
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function numericTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function normalizeSessionFile(value: unknown): string | undefined {
  const file = safeString(value);
  return file ? path.resolve(file) : undefined;
}

export function captureAtelierSessionOwner(
  ctx: any,
): AtelierSessionOwner | undefined {
  let sessionId: string | undefined;
  let sessionFile: string | undefined;
  try {
    sessionId =
      safeString(ctx?.sessionManager?.getSessionId?.()) ??
      safeString(ctx?.sessionId);
  } catch {
    sessionId = safeString(ctx?.sessionId);
  }
  try {
    sessionFile = normalizeSessionFile(ctx?.sessionManager?.getSessionFile?.());
  } catch {
    sessionFile = undefined;
  }
  const ownerId = sessionId ?? sessionFile;
  return ownerId
    ? { sessionId: ownerId, ...(sessionFile ? { sessionFile } : {}) }
    : undefined;
}

function artifactRootFor(owner: AtelierSessionOwner, cwd: string): string {
  return owner.sessionFile
    ? path.join(path.dirname(owner.sessionFile), 'subagent-artifacts')
    : path.join(path.resolve(cwd), '.pi', 'subagents', 'artifacts');
}

function runIdFor(taskId: string, owner: AtelierSessionOwner): string {
  const hash = createHash('sha256')
    .update(`${owner.sessionId}\0${taskId}`)
    .digest('hex')
    .slice(0, 32);
  return `subagent_${hash}`;
}

function sanitizedMessage(
  message: AtelierAssistantMessage,
): Record<string, unknown> {
  const usage = message.usage;
  const safeUsage: Record<string, unknown> = {};
  for (const key of [
    'input',
    'output',
    'cacheRead',
    'cacheWrite',
    'totalTokens',
  ] as const) {
    if (finiteNonNegative(usage?.[key])) safeUsage[key] = usage[key];
  }
  if (finiteNonNegative(usage?.cost?.total))
    safeUsage.cost = { total: usage.cost.total };
  return {
    role: 'assistant',
    ...(typeof message.timestamp === 'number' ||
    typeof message.timestamp === 'string'
      ? { timestamp: message.timestamp }
      : {}),
    usage: safeUsage,
  };
}

function messageIdentity(
  message: AtelierAssistantMessage,
  safeMessage: Record<string, unknown>,
): string | undefined {
  if (message.id) return `id:${message.id}`;
  if (message.timestamp !== undefined)
    return `timestamp:${JSON.stringify([message.timestamp, safeMessage.usage])}`;
  return undefined;
}

export class AtelierMetadataWriter {
  constructor(private readonly options: AtelierMetadataWriterOptions = {}) {}

  createRun(input: AtelierRunOptions): AtelierMetadataRun | undefined {
    if (!input.owner?.sessionId) return undefined;
    const root =
      this.options.artifactRoot ?? artifactRootFor(input.owner, input.cwd);
    return new AtelierMetadataRun({
      taskId: input.taskId,
      owner: input.owner,
      artifactRoot: root,
      appendEntry: this.options.appendEntry,
      getCurrentOwner: this.options.getCurrentOwner,
    });
  }
}

export class AtelierMetadataRun {
  readonly runId: string;
  readonly asyncDir: string;
  readonly statusPath: string;
  readonly eventsPath: string;
  readonly owner: AtelierSessionOwner;
  private readonly steps: StepRecord[] = [];
  private readonly stepUsage = new Map<number, StepUsage>();
  private readonly availableMetadataPaths = new Set<string>();
  private readonly appendEntry?: AtelierMetadataWriterOptions['appendEntry'];
  private readonly getCurrentOwner?: AtelierMetadataWriterOptions['getCurrentOwner'];
  private state: AtelierAttemptStatus = 'queued';
  private startedAt = Date.now();
  private referenceDirty = true;
  private statusAvailable = false;

  constructor(input: {
    taskId: string;
    owner: AtelierSessionOwner;
    artifactRoot: string;
    appendEntry?: AtelierMetadataWriterOptions['appendEntry'];
    getCurrentOwner?: AtelierMetadataWriterOptions['getCurrentOwner'];
  }) {
    this.owner = input.owner;
    this.runId = runIdFor(input.taskId, input.owner);
    this.asyncDir = path.join(input.artifactRoot, this.runId);
    this.statusPath = path.join(this.asyncDir, 'status.json');
    this.eventsPath = path.join(this.asyncDir, 'events.jsonl');
    this.appendEntry = input.appendEntry;
    this.getCurrentOwner = input.getCurrentOwner;
    this.loadStatus();
    this.writeStatus();
  }

  beginStep(input: { agent: string; model?: string; startedAt?: number }): {
    index: number;
    metadataPath: string;
  } {
    const index = this.steps.length;
    const startedAt = numericTimestamp(input.startedAt)
      ? input.startedAt
      : Date.now();
    this.steps.push({ agent: input.agent, status: 'running', startedAt });
    this.stepUsage.set(index, {
      totals: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      complete: {
        input: true,
        output: true,
        cacheRead: true,
        cacheWrite: true,
      },
      cost: 0,
      costComplete: true,
      messages: 0,
      seen: new Set(),
      model: safeString(input.model),
    });
    if (index === 0) this.startedAt = startedAt;
    const metadataPath = this.metadataPath(input.agent, index);
    this.referenceDirty = true;
    this.writeStatus();
    return { index, metadataPath };
  }

  recordAssistantMessage(
    stepIndex: number,
    agent: string,
    message: AtelierAssistantMessage,
    observedAt = Date.now(),
  ): void {
    const step = this.steps[stepIndex];
    const usage = this.stepUsage.get(stepIndex);
    if (!step || !usage || step.agent !== agent || message.role !== 'assistant')
      return;

    const safeMessage = sanitizedMessage(message);
    const identity = messageIdentity(message, safeMessage);
    if (identity && usage.seen.has(identity)) return;
    if (identity) usage.seen.add(identity);
    usage.messages += 1;

    for (const key of ['input', 'output', 'cacheRead', 'cacheWrite'] as const) {
      const value = message.usage?.[key];
      if (finiteNonNegative(value)) usage.totals[key] += value;
      else usage.complete[key] = false;
    }

    const cost = message.usage?.cost?.total;
    if (finiteNonNegative(cost)) usage.cost += cost;
    else usage.costComplete = false;

    try {
      fs.mkdirSync(this.asyncDir, { recursive: true });
      fs.appendFileSync(
        this.eventsPath,
        `${JSON.stringify({
          type: 'message_end',
          subagentSource: 'child',
          subagentRunId: this.runId,
          subagentStepIndex: stepIndex,
          subagentAgent: agent,
          observedAt: numericTimestamp(observedAt) ? observedAt : Date.now(),
          message: safeMessage,
        })}\n`,
        'utf8',
      );
    } catch {
      // Optional telemetry must never fail the subagent operation.
    }

    this.writeMetadata(stepIndex, agent, this.metadataPath(agent, stepIndex));
  }

  finishStep(
    stepIndex: number,
    status: AtelierAttemptStatus,
    input: { model?: string; exitCode?: number } = {},
  ): void {
    const step = this.steps[stepIndex];
    const usage = this.stepUsage.get(stepIndex);
    if (!step) return;
    step.status = status;
    if (usage) {
      usage.model = safeString(input.model) ?? usage.model;
      if (Number.isFinite(input.exitCode)) usage.exitCode = input.exitCode;
      this.writeMetadata(
        stepIndex,
        step.agent,
        this.metadataPath(step.agent, stepIndex),
      );
    }
    this.writeStatus();
  }

  setState(status: AtelierAttemptStatus): void {
    this.state = status;
    this.writeStatus();
  }

  private loadStatus(): void {
    try {
      const raw = JSON.parse(
        fs.readFileSync(this.statusPath, 'utf8'),
      ) as Record<string, unknown>;
      if (
        raw.runId !== this.runId ||
        raw.sessionId !== this.owner.sessionId ||
        !Array.isArray(raw.steps)
      )
        return;
      const recoveredSteps = raw.steps.flatMap((value): StepRecord[] => {
        if (!value || typeof value !== 'object') return [];
        const step = value as Record<string, unknown>;
        if (
          !safeString(step.agent) ||
          !safeString(step.status) ||
          !numericTimestamp(step.startedAt)
        )
          return [];
        return [
          {
            agent: step.agent as string,
            status: step.status as AtelierAttemptStatus,
            startedAt: step.startedAt,
          },
        ];
      });
      this.steps.push(...recoveredSteps);
      if (safeString(raw.state)) this.state = raw.state as AtelierAttemptStatus;
      if (numericTimestamp(raw.startedAt)) this.startedAt = raw.startedAt;
    } catch {
      // A missing or malformed optional artifact starts a fresh metadata view.
    }
  }

  private metadataPath(agent: string, stepIndex: number): string {
    const safeAgent = agent.replace(/[^\w.-]/g, '_') || 'agent';
    return path.join(
      this.asyncDir,
      `${this.runId}_${safeAgent}_${stepIndex}_meta.json`,
    );
  }

  private writeMetadata(
    stepIndex: number,
    agent: string,
    metadataPath: string,
  ): void {
    const usage = this.stepUsage.get(stepIndex);
    if (!usage || usage.messages === 0) return;
    const artifactUsage: Record<string, number> = {};
    for (const key of ['input', 'output', 'cacheRead', 'cacheWrite'] as const) {
      if (usage.complete[key]) artifactUsage[key] = usage.totals[key];
    }
    if (usage.costComplete) artifactUsage.cost = usage.cost;
    const metadata = {
      runId: this.runId,
      agent,
      usage: artifactUsage,
      timestamp: Date.now(),
      ...(usage.model ? { model: usage.model } : {}),
      ...(usage.exitCode !== undefined ? { exitCode: usage.exitCode } : {}),
    };
    try {
      fs.mkdirSync(this.asyncDir, { recursive: true });
      fs.writeFileSync(
        metadataPath,
        `${JSON.stringify(metadata, null, 2)}\n`,
        'utf8',
      );
      this.availableMetadataPaths.add(metadataPath);
      this.referenceDirty = true;
      this.syncReference();
    } catch {
      // Artifact storage is best-effort and isolated from the runner lifecycle.
    }
  }

  private writeStatus(): void {
    const status = {
      runId: this.runId,
      mode: 'single',
      state: this.state,
      sessionId: this.owner.sessionId,
      startedAt: this.startedAt,
      steps: this.steps.map(({ agent, status: stepStatus, startedAt }) => ({
        agent,
        status: stepStatus,
        startedAt,
      })),
    };
    try {
      fs.mkdirSync(this.asyncDir, { recursive: true });
      fs.writeFileSync(
        this.statusPath,
        `${JSON.stringify(status, null, 2)}\n`,
        'utf8',
      );
      this.statusAvailable = true;
      this.syncReference();
    } catch {
      this.statusAvailable = false;
      // Artifact storage is best-effort and isolated from the runner lifecycle.
    }
  }

  private syncReference(): void {
    if (!this.statusAvailable || !this.referenceDirty || !this.appendEntry)
      return;
    let current: AtelierSessionOwner | undefined;
    try {
      current = this.getCurrentOwner?.();
    } catch {
      return;
    }
    if (!current || current.sessionId !== this.owner.sessionId) return;
    try {
      this.appendEntry(ATELIER_METADATA_ENTRY, {
        runIds: [this.runId],
        paths: [...this.availableMetadataPaths],
        asyncDirs: [this.asyncDir],
      });
      this.referenceDirty = false;
    } catch {
      // A stale extension context or session write failure must not fail the child.
    }
  }
}
