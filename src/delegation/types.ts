export const DELEGATION_STATUSES = [
  'running',
  'complete',
  'error',
  'timeout',
  'cancelled',
] as const;

export type DelegationStatus = (typeof DELEGATION_STATUSES)[number];

export interface DelegationRecord {
  id: string;
  agent: string;
  status: DelegationStatus;
  title: string;
  summary: string;
  startedAt: string;
  completedAt: string | null;
  content: string;
}

export type DelegationHeader = {
  id: string;
  title: string;
  summary: string;
  agent: string;
  status: DelegationStatus;
  projectId: string;
  rootSessionId: string;
  startedAt: string;
  completedAt: string | null;
  persistedAt: string;
};

export interface PersistedDelegationRecord {
  path: string;
  header: DelegationHeader;
  record: DelegationRecord;
}

export interface DelegationListEntry {
  path: string;
  id: string;
  agent: string;
  status: DelegationStatus;
  title: string;
  summary: string;
  startedAt: string;
  completedAt: string | null;
}
