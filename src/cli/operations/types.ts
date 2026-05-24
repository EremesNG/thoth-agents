import type { HarnessId } from '../../harness/types';

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
  disclaimers?: OperationDisclaimer[];
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
