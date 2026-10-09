import { resolveIcon } from '@thoth-agents/pi-core';
import { truncatePanelText } from '@thoth-agents/pi-core/panel';
import type { SubagentModelProfile } from '../types.js';
import { globalSubagentsConfigPath } from './data.js';

export function truncateToVisibleWidth(text: string, width: number): string {
  const clipped = truncatePanelText(text, width);
  // Keep plain-text callers plain while preserving the cell-aware truncation.
  const styled =
    text.includes('\u001b') || resolveIcon('ellipsis', '…').includes('\u001b');
  return styled ? clipped : clipped.replace(/\u001b\[0m/g, '');
}

export function buildNoChangesModelProfilesMessage(agentDir?: string): string {
  return `No subagent model profile changes to save. Nothing written to ${globalSubagentsConfigPath(agentDir)}.`;
}

export function profileLabel(
  profile: SubagentModelProfile | undefined,
  field: 'model' | 'effort',
): string | undefined {
  if (!profile) return undefined;
  if (field === 'model')
    return profile.model
      ? `${profile.model.provider}/${profile.model.id}`
      : undefined;
  return profile.effort;
}
