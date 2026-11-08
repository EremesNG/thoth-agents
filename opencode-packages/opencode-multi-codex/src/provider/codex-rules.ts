/** Mirrored from anomalyco/opencode@v2.2.6:
 * packages/core/src/plugin/provider/openai.ts (Codex rules, L241-334),
 * packages/core/src/plugin/provider/openai-context-caps.ts and
 * packages/core/src/session/affinity.ts. Review these together on host upgrades.
 * Credentials/account headers deliberately belong to the request layer, not here.
 */
import type { Plugin } from '@opencode/plugin';

type ModelEditor = Parameters<
  Parameters<Plugin.Context['model']['transform']>[0]
>[0];
type ModelDraft = Parameters<Parameters<ModelEditor['update']>[2]>[0];

export const CODEX = {
  baseURL: 'https://chatgpt.com/backend-api/codex',
  apiOrigin: 'https://api.openai.com',
  transport: 'websocket',
  encoding: 'zstd',
  headers: {
    originator: 'opencode',
    'x-codex-beta-features': 'remote_compaction_v2',
  },
  disallowedModels: new Set(['gpt-5.6']),
  imageModels: new Set(['gpt-image-2']),
  legacyInput: 272_000,
  currentInput: 500_000,
} as const;

export function applyCodexModel(draft: ModelDraft) {
  const apiID = draft.modelID ?? draft.id;
  const reasoning = draft.body?.reasoning;
  if (
    reasoning &&
    typeof reasoning === 'object' &&
    'mode' in reasoning &&
    reasoning.mode === 'pro'
  ) {
    draft.enabled = false;
  } else if (draft.type === 'image') {
    if (CODEX.imageModels.has(apiID)) draft.cost = [];
    else draft.enabled = false;
  } else {
    const match = apiID.match(/^gpt-(\d+)(?:\.(\d+))?/);
    const major = Number(match?.[1]);
    const minor = Number(match?.[2] ?? 0);
    if (
      CODEX.disallowedModels.has(apiID) ||
      !match ||
      !(major > 5 || (major === 5 && minor > 5))
    )
      draft.enabled = false;
    else draft.cost = [];
  }
  const match = apiID.match(/^gpt-(\d+)(?:\.(\d+))?/);
  const major = Number(match?.[1]);
  const minor = Number(match?.[2] ?? 0);
  const input =
    !match || major > 6 || (major === 6 && minor >= 1)
      ? CODEX.currentInput
      : CODEX.legacyInput;
  if ((draft.limit.input || draft.limit.context) > input) {
    draft.limit = {
      ...draft.limit,
      input,
      context: input + draft.limit.output,
    };
  }
}
