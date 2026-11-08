import type { Model, Plugin } from '@opencode/plugin';
import type { SessionRetry } from '@opencode/plugin/promise/session';
import { log } from '../../utils/logger';

// Canonical provider failures from core/session/to-session-error.ts (2.2.5).
const RETRYABLE = new Set([
  'provider.rate-limit',
  'provider.quota',
  'provider.free-limit',
  'provider.chatgpt-limit',
  'provider.go-limit',
  'provider.budget-limit',
  'provider.model-budget-limit',
  'provider.transport',
  'provider.timeout',
  'provider.internal',
  'provider.invalid-output',
]);

/** Retained public detection helper; v2 uses structured provider errors. */
export function isRateLimitError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const value = error as { type?: string };
  return value.type !== undefined && RETRYABLE.has(value.type);
}

function modelRef(value: string): Model.Ref | undefined {
  const slash = value.indexOf('/');
  if (slash <= 0 || slash === value.length - 1) return;
  const [id, variant] = value.slice(slash + 1).split('#');
  if (!id) return;
  return {
    providerID: value.slice(0, slash),
    id,
    ...(variant ? { variant } : {}),
  } as Model.Ref;
}

/** Retry state is isolated by session AND agent; no event replay or timers. */
export class ForegroundFallbackManager {
  private readonly tried = new Map<string, Map<string, Set<string>>>();
  private readonly switching = new Set<string>();

  constructor(
    private readonly session: Pick<Plugin.Context['session'], 'switchModel'>,
    private readonly chains: Record<string, string[]>,
    private readonly models: Record<
      string,
      { id: string; variant?: string }[]
    > = {},
  ) {}

  forget(sessionID: string): void {
    this.tried.delete(sessionID);
  }

  async retry(input: SessionRetry): Promise<void> {
    if (!Object.hasOwn(this.chains, input.agent)) return;
    const chain = this.chains[input.agent];
    const current = `${input.model.providerID}/${input.model.id}`;
    const inChain = chain.some((entry) => {
      const ref = modelRef(entry);
      return ref && `${ref.providerID}/${ref.id}` === current;
    });
    // An explicit operator model outside this agent's chain is never replaced.
    if (!inChain || !isRateLimitError(input.error)) return;
    const lock = JSON.stringify([input.sessionID, input.agent]);
    if (this.switching.has(lock)) return;
    this.switching.add(lock);
    try {
      let agents = this.tried.get(input.sessionID);
      if (!agents) {
        agents = new Map();
        this.tried.set(input.sessionID, agents);
      }
      let tried = agents.get(input.agent);
      if (!tried) {
        tried = new Set();
        agents.set(input.agent, tried);
      }
      tried.add(current);
      for (const entry of chain) {
        const ref = modelRef(entry);
        if (!ref) continue;
        const id = `${ref.providerID}/${ref.id}`;
        if (tried.has(id)) continue;
        // Reserve before awaiting: a failed switch cannot cause repeated attempts.
        tried.add(id);
        const variant = this.models[input.agent]?.find(
          (model) => model.id === entry,
        )?.variant;
        await this.session.switchModel({
          sessionID: input.sessionID,
          model: {
            ...ref,
            ...(variant ? { variant: variant as Model.Ref['variant'] } : {}),
          },
        });
        input.decision = { retry: true, delay: 0 };
        return;
      }
    } catch (error) {
      log('[foreground-fallback] model switch failed', {
        sessionID: input.sessionID,
        error: String(error),
      });
    } finally {
      this.switching.delete(lock);
    }
  }
}
