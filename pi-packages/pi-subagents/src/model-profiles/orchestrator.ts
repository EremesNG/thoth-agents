import type {
  ExtensionAPI,
  ExtensionContext,
} from '@earendil-works/pi-coding-agent';
import type { NamedModelProfile } from './store.js';

export type OrchestratorApplyOutcome = {
  status: 'applied' | 'clamped' | 'untouched' | 'unavailable';
  message: string;
};

export type OrchestratorApi = Pick<
  ExtensionAPI,
  'setModel' | 'setThinkingLevel' | 'getThinkingLevel'
>;
export type OrchestratorContext = {
  modelRegistry: Pick<ExtensionContext['modelRegistry'], 'find'>;
};

/** Session-only changes: never updates the configured defaults. */
export async function applyProfileOrchestrator(
  pi: OrchestratorApi,
  ctx: OrchestratorContext,
  profile: NamedModelProfile,
): Promise<OrchestratorApplyOutcome> {
  const orchestrator = profile.orchestrator;
  if (!orchestrator)
    return { status: 'untouched', message: 'Session model left untouched.' };
  if (orchestrator.model) {
    const { provider, id } = orchestrator.model;
    const unavailable = (): OrchestratorApplyOutcome => ({
      status: 'unavailable',
      message: `Orchestrator ${provider}/${id} unavailable; session model and effort left unchanged.`,
    });
    try {
      const model = ctx.modelRegistry.find(provider, id);
      if (!model || !(await pi.setModel(model))) return unavailable();
    } catch {
      return unavailable();
    }
  }
  if (orchestrator.effort) {
    pi.setThinkingLevel(orchestrator.effort);
    const actual = pi.getThinkingLevel();
    if (actual !== orchestrator.effort)
      return {
        status: 'clamped',
        message: `Orchestrator effort ${orchestrator.effort} clamped to ${actual}.`,
      };
  }
  return { status: 'applied', message: 'Profile orchestrator applied.' };
}
