import type {
  HarnessId,
  ProviderCapabilityEvidence,
  ProviderEvidenceInput,
} from '../../harness/types';
import type { EffortSelection } from '../model-effort';

export type ManagedState =
  | 'installed'
  | 'missing'
  | 'drift'
  | 'outdated'
  | 'unknown';

export type OperationActionKind =
  | 'status'
  | 'list'
  | 'install'
  | 'update'
  | 'sync'
  | 'repair'
  | 'model-config';

export type ManagedTargetKind =
  | 'file'
  | 'directory'
  | 'config'
  | 'skill'
  | 'hook'
  | 'memory-state'
  | 'generated-artifact'
  | 'package'
  | 'surface'
  | 'unknown';

export type WarningSeverity = 'minor' | 'important' | 'critical';

export interface OperationPath {
  path: string;
  label?: string;
}

export interface OperationWarning {
  severity: WarningSeverity;
  message: string;
  code?: string;
}

export interface OperationDisclaimer {
  message: string;
  code?: string;
}

export interface ManagedTarget {
  kind: ManagedTargetKind;
  path?: string;
  label?: string;
  state?: ManagedState;
  expected?: string;
  observed?: string;
  description?: string;
}

export interface ManagedSurface {
  id: string;
  label: string;
  state?: ManagedState;
  path?: string;
  description?: string;
}

export interface HarnessAction {
  id: string;
  kind: OperationActionKind;
  label: string;
  description: string;
  dryRun: boolean;
  requiresConfirmation: boolean;
  supported?: boolean;
  disabledReason?: string;
  warnings?: OperationWarning[];
  disclaimers?: OperationDisclaimer[];
}

export interface HarnessStatusReport {
  harness: HarnessId;
  displayName?: string;
  state: ManagedState;
  summary: string;
  targets: ManagedTarget[];
  diagnostics: OperationWarning[];
  actions: HarnessAction[];
  /** Ephemeral provider evidence, kept separate from consumer-managed state. */
  providerCapability?: ProviderCapabilityEvidence;
  disclaimers?: OperationDisclaimer[];
}

const UNSUPPORTED_PROVIDER_CAPABILITY: ProviderCapabilityEvidence = {
  state: 'unsupported',
  source: 'none',
  basis: [],
};

/**
 * Classifies only evidence explicitly supplied by the caller. This function is
 * intentionally pure: it performs no discovery, probing, persistence, setup,
 * health checking, acquisition, migration, or fallback.
 */
export function classifyProviderCapabilityEvidence(
  input: ProviderEvidenceInput = {},
): ProviderCapabilityEvidence {
  const evidence = input.providerEvidence;
  if (!evidence) {
    return { ...UNSUPPORTED_PROVIDER_CAPABILITY, basis: [] };
  }

  const basis = evidence.basis.filter((item) => item.trim().length > 0);
  const hasDocumentedSource =
    evidence.source === 'provider' || evidence.source === 'harness';

  if (!hasDocumentedSource || basis.length === 0) {
    return { ...UNSUPPORTED_PROVIDER_CAPABILITY, basis: [] };
  }

  return { ...evidence, basis };
}

export type BackupStrategy =
  | 'none'
  | 'managed-backup-file'
  | 'existing-helper'
  | 'external';

export interface BackupExpectation {
  required: boolean;
  strategy: BackupStrategy;
  destinations?: OperationPath[];
  description?: string;
}

export interface OperationPlanItem {
  title: string;
  target: ManagedTarget;
  state?: ManagedState;
  preview?: string;
  backup?: BackupExpectation;
  warnings?: OperationWarning[];
  disclaimers?: OperationDisclaimer[];
}

export interface OperationPlan {
  id: string;
  harness: HarnessId;
  action: OperationActionKind;
  title: string;
  summary: string;
  dryRun: boolean;
  canApply: boolean;
  targets: ManagedTarget[];
  blockerTargets?: ManagedTarget[];
  surfaces: ManagedSurface[];
  backup: BackupExpectation;
  items: OperationPlanItem[];
  warnings: OperationWarning[];
  disclaimers: OperationDisclaimer[];
}

export interface ModelRoleInput {
  role: string;
  model: string;
  provider?: string;
  effort?: EffortSelection;
  catalogId?: string;
  availableEfforts?: readonly string[];
}

export interface ModelConfigInput {
  harness: HarnessId;
  roles: ModelRoleInput[];
  dryRun: boolean;
  target?: ManagedTarget;
  warnings?: OperationWarning[];
  disclaimers?: OperationDisclaimer[];
}

export interface OperationApplyResult {
  harness: HarnessId;
  action: OperationActionKind;
  applied: boolean;
  summary: string;
  changedTargets: ManagedTarget[];
  diagnosticTargets?: ManagedTarget[];
  backups: OperationPath[];
  warnings: OperationWarning[];
  disclaimers: OperationDisclaimer[];
}

export interface OperationContext {
  cwd: string;
  env?: Readonly<Record<string, string | undefined>>;
}

export interface OperationHarnessMetadata {
  id: HarnessId | string;
  displayName: string;
  available: boolean;
  description: string;
  actions: HarnessAction[];
  reason?: string;
}

export interface HarnessOperationAdapter extends OperationHarnessMetadata {
  id: HarnessId;
  available: true;
}
