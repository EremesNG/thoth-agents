/** SDK-independent question shape, matching the normalized ask_user_question input. */
export interface QuestionServiceQuestion {
  id: string;
  header: string;
  prompt: string;
  type: 'single' | 'multi' | 'text' | 'confirm';
  context?: string;
  required?: boolean;
  options?: {
    value: string;
    label: string;
    description?: string;
    preview?: string;
    recommended?: boolean;
  }[];
  /** Whether custom answers are offered; defaults to true. */
  allowCustom?: boolean;
}

export interface QuestionServiceRequest {
  title?: string;
  questions: QuestionServiceQuestion[];
}

export interface QuestionServiceAnswer {
  status: 'answered' | 'skipped' | 'unanswered';
  values: string[];
  labels?: string[];
  customText?: string;
  note?: string;
}

export interface QuestionServiceResult {
  /**
   * cancelled: user cancellation or AbortSignal, after the provider disposes its UI.
   * unavailable: the provider cannot present UI (e.g. unmountable editor slot or
   * RPC context), so the consumer can fall back to another interface.
   */
  status: 'answered' | 'cancelled' | 'unavailable';
  answers: Record<string, QuestionServiceAnswer>;
}

/** Providers return a result, never undefined, and do not throw for expected cases.
 * Consumers should still guard against unexpected provider failures.
 */
export interface QuestionServiceProvider {
  /** ctx is the caller's Pi extension context with UI; no SDK runtime dependency. */
  ask(
    ctx: unknown,
    request: QuestionServiceRequest,
    options: { signal?: AbortSignal },
  ): Promise<QuestionServiceResult>;
}

/** Owns one instance's registration, not other instances' providers. */
export interface QuestionServiceHandle {
  /** Withdraw only this registration; repeated withdrawal is a no-op. */
  withdraw(): void;
}

interface Publication {
  token: symbol;
  provider: QuestionServiceProvider;
}

interface Registry {
  entries: Publication[];
}

const registryKey = Symbol.for('thoth-agents.pi-core.question-service.v1');
const shared = globalThis as typeof globalThis & { [registryKey]?: unknown };

function registry(): Registry | undefined {
  try {
    if (shared[registryKey] === undefined)
      shared[registryKey] = { entries: [] };
    const state = shared[registryKey] as Registry | null;
    if (
      !state ||
      !Array.isArray(state.entries) ||
      !state.entries.every(
        (entry: Publication | null) =>
          typeof entry?.token === 'symbol' &&
          typeof entry.provider?.ask === 'function',
      )
    )
      return undefined;
    return state;
  } catch {
    // Incompatible foreign records, including throwing accessors, mean no service.
    return undefined;
  }
}

/** Register one provider; the most recent live registration wins. */
export function registerQuestionService(
  provider: QuestionServiceProvider,
): QuestionServiceHandle {
  const state = registry();
  if (!state) return { withdraw() {} };
  const token = Symbol('question-service-publication');
  state.entries.push({ token, provider });
  return {
    withdraw() {
      state.entries = state.entries.filter((entry) => entry.token !== token);
    },
  };
}

/** Resolve the latest live compatible provider without loading its extension. */
export function getQuestionService(): QuestionServiceProvider | undefined {
  return registry()?.entries.at(-1)?.provider;
}
