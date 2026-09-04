import type { HarnessId } from '../../harness/types';
import { claudeCodeOperationAdapter } from './claude-code';
import { codexOperationAdapter } from './codex';
import { opencodeOperationAdapter } from './opencode';
import { piOperationAdapter } from './pi';
import type {
  HarnessOperationAdapter,
  OperationHarnessMetadata,
} from './types';

const OPERATION_HARNESSES = {
  opencode: opencodeOperationAdapter,
  codex: codexOperationAdapter,
  claude: claudeCodeOperationAdapter,
  pi: piOperationAdapter,
} as const satisfies Record<HarnessId, HarnessOperationAdapter>;

export const SUPPORTED_OPERATION_HARNESSES = Object.keys(
  OPERATION_HARNESSES,
) as HarnessId[];

export function isSupportedOperationHarness(value: string): value is HarnessId {
  return value in OPERATION_HARNESSES;
}

export function listOperationHarnesses(): HarnessOperationAdapter[] {
  return SUPPORTED_OPERATION_HARNESSES.map(
    (harness) => OPERATION_HARNESSES[harness],
  );
}

export function getOperationHarness(
  harness: HarnessId,
): HarnessOperationAdapter {
  return OPERATION_HARNESSES[harness];
}

export function resolveOperationHarness(
  harness: string,
): OperationHarnessMetadata {
  if (isSupportedOperationHarness(harness)) {
    return getOperationHarness(harness);
  }

  return {
    id: harness,
    displayName: harness,
    available: false,
    description: 'Unsupported harness.',
    actions: [],
    reason: `Unsupported harness "${harness}". Supported harnesses: ${SUPPORTED_OPERATION_HARNESSES.join(', ')}.`,
  };
}

export type {
  BackupExpectation,
  BackupStrategy,
  HarnessAction,
  HarnessOperationAdapter,
  HarnessStatusReport,
  ManagedState,
  ManagedSurface,
  ManagedTarget,
  ManagedTargetKind,
  ModelConfigInput,
  ModelRoleInput,
  OperationApplyResult,
  OperationContext,
  OperationDisclaimer,
  OperationHarnessMetadata,
  OperationPath,
  OperationPlan,
  OperationPlanItem,
  OperationWarning,
  WarningSeverity,
} from './types';
