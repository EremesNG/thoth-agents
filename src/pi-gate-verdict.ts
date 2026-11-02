import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  formatGateVerdict,
  summarizeGateResult,
} from '../skills/thoth-sdd/scripts/validate-result.mjs';

const VERDICT_PREFIX = 'thoth-gate-verdict ';
const FROZEN_VERDICT_ENTRY = 'thoth-pi-gate-verdict';
const SESSION_CACHE_KEY = Symbol.for(
  'thoth-agents.pi-gate-verdict.sessions.v1',
);
const shared = globalThis as typeof globalThis & {
  [SESSION_CACHE_KEY]?: WeakMap<object, Map<string, string>>;
};

function sessionVerdicts(owner?: object): Map<string, string> | undefined {
  if (!owner) return undefined;
  shared[SESSION_CACHE_KEY] ??= new WeakMap();
  const sessions = shared[SESSION_CACHE_KEY];
  let verdicts = sessions.get(owner);
  if (!verdicts) {
    verdicts = new Map();
    sessions.set(owner, verdicts);
  }
  return verdicts;
}

export class PiContextGateVerdicts {
  private readonly verdicts = new Map<string, string>();
  private sessionCache?: Map<string, string>;

  constructor(
    private readonly appendEntry?: (customType: string, data: unknown) => void,
  ) {}

  useSession(owner?: object): void {
    // Native in-memory forks reuse the manager, but recreate extension instances.
    // Weak ownership releases closed sessions without evicting live completions.
    this.sessionCache = sessionVerdicts(owner);
  }

  restore(entries: Iterable<unknown>, sourceSessionFile?: string): void {
    const retainedEntries = [...entries];
    const sourceVerdicts = new Map(this.sessionCache);
    for (const [key, verdict] of this.verdicts)
      sourceVerdicts.set(key, verdict);
    this.verdicts.clear();
    this.readEntries(retainedEntries, this.verdicts);
    const retainedKeys: string[] = [];
    for (const value of retainedEntries) {
      const completion = persistedOracleCompletion(value);
      if (!completion) continue;
      const key = completionVerdictKey(
        completion.fingerprint,
        completion.entryId,
      );
      retainedKeys.push(key);
    }
    const missingKeys = retainedKeys.filter((key) => !this.verdicts.has(key));
    if (
      sourceSessionFile &&
      missingKeys.some((key) => !sourceVerdicts.has(key))
    ) {
      try {
        const sourceEntries = readFileSync(sourceSessionFile, 'utf8')
          .split('\n')
          .flatMap((line) => {
            try {
              return [JSON.parse(line) as unknown];
            } catch {
              // Like Pi's session reader, ignore incomplete or malformed lines.
              return [];
            }
          });
        this.readEntries(sourceEntries, sourceVerdicts);
      } catch {
        // Source-file recovery is optional; unavailable files cannot block startup.
      }
    }
    // Native forks can retain a completion but truncate its later verdict entry.
    // Copy only verdicts for surviving completions into the fork's own session.
    for (const key of missingKeys) {
      this.getOrCreate(key, () => sourceVerdicts.get(key));
    }
    // A fork truncates history: retain at most one small snapshot per surviving
    // native completion, not every gate ever seen by this manager.
    this.sessionCache?.clear();
    for (const key of retainedKeys) {
      const verdict = this.verdicts.get(key);
      if (verdict !== undefined) this.sessionCache?.set(key, verdict);
    }
  }

  private readEntries(
    entries: Iterable<unknown>,
    verdicts: Map<string, string>,
  ): void {
    for (const value of entries) {
      const entry = asRecord(value);
      if (entry?.type !== 'custom' || entry.customType !== FROZEN_VERDICT_ENTRY)
        continue;
      const data = asRecord(entry.data);
      if (
        data?.version !== 1 ||
        typeof data.key !== 'string' ||
        !/^[a-f0-9]{64}$/.test(data.key) ||
        typeof data.verdict !== 'string' ||
        !data.verdict.startsWith(VERDICT_PREFIX) ||
        data.verdict.includes('\n') ||
        verdicts.has(data.key)
      )
        continue;
      verdicts.set(data.key, data.verdict);
    }
  }

  getOrCreate(
    key: string,
    create: () => string | undefined,
  ): string | undefined {
    const frozen = this.verdicts.get(key);
    if (frozen !== undefined) {
      this.sessionCache?.set(key, frozen);
      return frozen;
    }
    const verdict = this.sessionCache?.get(key) ?? create();
    if (verdict === undefined) return undefined;
    // Persist before delivery so reload/resume can reproduce the exact bytes.
    this.appendEntry?.(FROZEN_VERDICT_ENTRY, { version: 1, key, verdict });
    this.verdicts.set(key, verdict);
    this.sessionCache?.set(key, verdict);
    return verdict;
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function hasAppendedVerdict(
  content: unknown,
  verdict: string,
  blockSeparator = '',
): boolean {
  if (typeof content === 'string') return content.endsWith(`\n\n${verdict}`);
  if (!Array.isArray(content)) return false;
  // Delivery adds standalone blocks at the tail, never lines inside child text.
  for (let index = content.length - 1; index >= 0; index--) {
    const block = asRecord(content[index]);
    if (
      block?.type !== 'text' ||
      typeof block.text !== 'string' ||
      !block.text.startsWith(`${blockSeparator}${VERDICT_PREFIX}`) ||
      block.text.slice(blockSeparator.length).includes('\n')
    )
      break;
    if (block.text === `${blockSeparator}${verdict}`) return true;
  }
  return false;
}

function oracleGateVerdict(
  taskValue: unknown,
  result: unknown,
  cwd: string,
): string | undefined {
  const task = asRecord(taskValue);
  if (
    task?.agent !== 'thoth-oracle' ||
    typeof result !== 'string' ||
    !result.includes('```thoth-result')
  )
    return undefined;
  const taskId = typeof task.id === 'string' ? task.id : null;
  const summary = {
    ...summarizeGateResult(result, { cwd }),
    agent: 'thoth-oracle',
    taskId,
  };
  return formatGateVerdict(summary);
}

function oracleCompletion(message: Record<string, unknown>) {
  const details = asRecord(message.details);
  const task = asRecord(details?.task);
  const result = details?.full_result ?? task?.result;
  if (
    task?.agent !== 'thoth-oracle' ||
    typeof result !== 'string' ||
    !result.includes('```thoth-result')
  )
    return undefined;
  return {
    task,
    result,
    fingerprint: JSON.stringify([task.id ?? null, result]),
  };
}

function persistedOracleCompletion(value: unknown) {
  const entry = asRecord(value);
  if (
    entry?.type !== 'custom_message' ||
    entry.customType !== 'subagent-completion' ||
    typeof entry.id !== 'string'
  )
    return undefined;
  const completion = oracleCompletion(entry);
  return completion ? { ...completion, entryId: entry.id } : undefined;
}

function completionVerdictKey(fingerprint: string, identity: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify([fingerprint, identity]))
    .digest('hex');
}

export function withPiContextGateVerdicts(
  event: Record<string, unknown>,
  cwd: string,
  frozenVerdicts: PiContextGateVerdicts,
  entries: Iterable<unknown> = [],
): { messages: unknown[] } | undefined {
  if (!Array.isArray(event.messages)) return undefined;
  const completionIds = new Map<string, string[]>();
  for (const value of entries) {
    const completion = persistedOracleCompletion(value);
    if (!completion) continue;
    const ids = completionIds.get(completion.fingerprint) ?? [];
    ids.push(completion.entryId);
    completionIds.set(completion.fingerprint, ids);
  }
  let changed = false;
  const messages = [...event.messages];
  // Match from the tail: compaction may have omitted earlier identical results.
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = asRecord(messages[index]);
    if (
      message?.role !== 'custom' ||
      message.customType !== 'subagent-completion' ||
      (typeof message.content !== 'string' && !Array.isArray(message.content))
    )
      continue;
    const completion = oracleCompletion(message);
    if (!completion) continue;
    // Entry ids survive replay/fork; live queued timestamps can differ from the
    // persisted timestamp. Legacy/non-native messages fall back to their payload.
    const entryId = completionIds.get(completion.fingerprint)?.pop();
    const key = completionVerdictKey(
      completion.fingerprint,
      entryId ?? message.timestamp ?? null,
    );
    const verdict = frozenVerdicts.getOrCreate(key, () =>
      oracleGateVerdict(completion.task, completion.result, cwd),
    );
    if (!verdict || hasAppendedVerdict(message.content, verdict)) continue;
    changed = true;
    messages[index] = {
      ...message,
      content:
        typeof message.content === 'string'
          ? `${message.content}\n\n${verdict}`
          : [...message.content, { type: 'text', text: verdict }],
    };
  }
  return changed ? { messages } : undefined;
}

export function withPiToolGateVerdicts(
  event: Record<string, unknown>,
  cwd: string,
): Record<string, unknown> | undefined {
  if (!Array.isArray(event.content)) return undefined;
  const details = asRecord(event.details);
  const task = asRecord(details?.task);
  let verdicts: (string | undefined)[];
  if (event.toolName === 'subagent_result') {
    verdicts = [
      oracleGateVerdict(task, details?.full_result ?? task?.result, cwd),
    ];
  } else if (
    event.toolName === 'subagent_run' &&
    details?.mode === 'task' &&
    Array.isArray(details.results)
  ) {
    verdicts = details.results.map((result) =>
      oracleGateVerdict(result, asRecord(result)?.result, cwd),
    );
  } else {
    return undefined;
  }
  const blocks = verdicts
    .filter(
      (verdict): verdict is string =>
        verdict !== undefined &&
        !hasAppendedVerdict(event.content, verdict, '\n\n'),
    )
    .map((verdict) => ({ type: 'text', text: `\n\n${verdict}` }));
  if (blocks.length === 0) return undefined;
  return {
    content: [...event.content, ...blocks],
    details: event.details,
    // Pi drops structuredContent when content is replaced unless it is returned too.
    structuredContent: event.structuredContent,
  };
}
