import type { HarnessPromptDialect } from '../../agents/prompt-dialects';
import type { HarnessCapabilityStatus, HarnessDiagnostic } from '../types';
import type { AgentRoleContract, AgentRoleName } from './agent-pack';

export interface RoleMemoryGovernance {
  role: AgentRoleName;
  requiresParentContext: boolean;
  mayReadProjectMemory: boolean;
  mayWriteDurableObservations: boolean;
  protectsSddNamespace: boolean;
  rules: string[];
}

export interface MemoryOrchestrationContract {
  providerOwnership: 'external';
  protectedTopicNamespaces: ['sdd/*'];
  canonicalTopicKey: 'sdd/{change}/{artifact}';
  requiresParentAuthorization: true;
  handoffOutcome: 'authorized-context-available';
  completionOutcome: 'resumable-summary-or-checkpoint';
  prohibitsFalseSuccess: true;
  prohibitsConsumerFallback: true;
  roles: RoleMemoryGovernance[];
}

export type MemoryGovernanceContract = MemoryOrchestrationContract;

export interface MemoryGovernanceDiagnosticInput {
  harness: string;
  permissionControls: HarnessCapabilityStatus;
  parentContextInjection: HarnessCapabilityStatus;
  memoryWriteControls: HarnessCapabilityStatus;
}

function roleRules(role: AgentRoleContract): string[] {
  const sharedRules = [
    'Provider-dependent use requires parent-scoped authorization with the parent session and project supplied by dispatch.',
    'Only authorized context may be used, and the delegate must report missing, stale, contradictory, or insufficient context instead of guessing.',
    'A handoff must keep accepted scope, decisions, permissions, and artifacts available to the authorized delegate.',
    'Completion continuity is a resumable summary or checkpoint outcome; it does not permanently close or finalize work.',
    'The installed provider guidance is authoritative for provider operations; consumer guidance does not prescribe the mechanism.',
    'Missing capability evidence is reported as degraded or unsupported and never as successful persistence or recovery.',
    'Protect the sdd/* namespace and use only the canonical sdd/{change}/{artifact} identity for governed SDD artifacts in provider-backed modes.',
    'Do not invent a consumer fallback or silently change the selected persistence mode.',
  ];

  if (role.name === 'orchestrator') {
    return [
      ...sharedRules,
      'The root coordinator owns authorization and the outcome-level continuity responsibility.',
      'Dispatch task and authorization context without embedding secrets, raw transcripts, or irrelevant context.',
    ];
  }

  if (role.mode === 'read-only') {
    return [
      ...sharedRules,
      'Read-only role permissions remain intact: provider use cannot authorize durable writes.',
    ];
  }

  return [
    ...sharedRules,
    'Write-capable role permissions remain intact: durable observations or assigned SDD artifacts still require explicit authorization and parent scope.',
  ];
}

export function getRoleMemoryGovernance(
  role: AgentRoleContract,
): RoleMemoryGovernance {
  return {
    role: role.name,
    requiresParentContext: role.name !== 'orchestrator',
    mayReadProjectMemory: true,
    mayWriteDurableObservations: role.mode === 'write-capable',
    protectsSddNamespace: true,
    rules: roleRules(role),
  };
}

export function getMemoryGovernanceContract(
  roles: readonly AgentRoleContract[],
): MemoryGovernanceContract {
  return {
    providerOwnership: 'external',
    protectedTopicNamespaces: ['sdd/*'],
    canonicalTopicKey: 'sdd/{change}/{artifact}',
    requiresParentAuthorization: true,
    handoffOutcome: 'authorized-context-available',
    completionOutcome: 'resumable-summary-or-checkpoint',
    prohibitsFalseSuccess: true,
    prohibitsConsumerFallback: true,
    roles: roles.map(getRoleMemoryGovernance),
  };
}

export function renderMemoryGovernanceInstructions(
  role: AgentRoleContract,
  dialect?: HarnessPromptDialect,
): string {
  const governance = getRoleMemoryGovernance(role);
  const harnessRules = dialect
    ? [
        `- Harness wording: use ${dialect.renderRoleInvocation('orchestrator')} as the memory owner and \`${dialect.tools.userQuestionTool}\` for blocking memory-context questions.`,
        `- Progress ownership remains with the coordinator; report memory-governance verification for tracking in ${dialect.tools.progressTool}.`,
      ]
    : [];

  return [
    'External provider memory governance:',
    ...governance.rules.map((rule) => `- ${rule}`),
    ...harnessRules,
    `- Runtime enforcement: ${role.name === 'orchestrator' ? 'root-owned outcomes' : 'instruction-level unless the target harness validates per-agent memory controls'}.`,
  ].join('\n');
}

export function memoryGovernanceDiagnostics(
  input: MemoryGovernanceDiagnosticInput,
): HarnessDiagnostic[] {
  const diagnostics: HarnessDiagnostic[] = [];

  if (input.permissionControls !== 'supported') {
    diagnostics.push({
      severity: 'warning',
      code: `${input.harness}.permission.memory.enforcement_gap`,
      message:
        'Runtime controls for provider authorization are unavailable; instruction-level guidance must report capability as degraded or unsupported rather than treating instruction text as runtime support.',
      harness: input.harness,
      capability: 'rolePermissions',
      fallback: 'instruction-only',
    });
  }

  if (input.parentContextInjection !== 'supported') {
    diagnostics.push({
      severity:
        input.parentContextInjection === 'unknown' ? 'error' : 'warning',
      code: `${input.harness}.context.parent_injection.unvalidated`,
      message:
        'Parent-scoped authorization is not runtime-enforced; provider-backed continuity is degraded or unsupported without evidenced authorized context.',
      harness: input.harness,
      capability: 'parentContextInjection',
      fallback: 'instruction-only',
    });
  }

  if (input.memoryWriteControls !== 'supported') {
    diagnostics.push({
      severity: 'warning',
      code: `${input.harness}.permission.memory_write.enforcement_gap`,
      message:
        'Runtime controls for delegated provider writes are unavailable; report the outcome as degraded or unsupported unless caller-supplied evidence proves success.',
      harness: input.harness,
      capability: 'memoryGovernanceEnforcement',
      fallback: 'instruction-only',
    });
  }

  return diagnostics;
}
