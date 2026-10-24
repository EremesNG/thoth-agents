import type { SubagentMode } from './types.js';

export function resolveContinuationEffectiveMode(input: {
  explicitMode?: SubagentMode;
}): SubagentMode {
  return input.explicitMode ?? 'background';
}
