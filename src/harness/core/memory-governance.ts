import type { HarnessPromptDialect } from '../../agents/prompt-dialects';
import type { HarnessCapabilityStatus, HarnessDiagnostic } from '../types';
import type { AgentRoleContract, AgentRoleName } from './agent-pack';

export type MemoryAuthorization = 'none' | 'recall' | 'observe';

export interface MemoryDispatchContract {
  provider: 'thoth-mem';
  project: string;
  rootSessionId?: string;
  authorization: MemoryAuthorization;
  context?: string[];
}

export interface RoleMemoryGovernance {
  role: AgentRoleName;
  workspaceMode: AgentRoleContract['mode'];
  requiresParentContext: boolean;
  availableAuthorizations: MemoryAuthorization[];
  ownsRootLifecycle: boolean;
  rules: string[];
}

export interface MemoryOrchestrationContract {
  provider: 'thoth-mem';
  providerOwnership: 'external';
  installedGuidance: 'thoth-mem skill';
  canonicalSddStore: 'openspec/';
  prohibitsSddArtifactMirroring: true;
  requiresParentAuthorization: true;
  rootLifecycleOwner: 'orchestrator';
  handoffOutcome: 'bounded-memory-contract';
  completionOutcome: 'provider-confirmed-semantic-summary';
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
    'thoth-mem remains an external provider; its installed provider guidance is authoritative for memory operations and thoth-agents does not prescribe the mechanism.',
    'Provider-dependent use requires parent-scoped authorization with the stable root session identity or explicit unavailable state and project supplied by dispatch.',
    'The MEMORY authorization is none, recall, or observe: none forbids provider work, recall permits bounded reads, and observe additionally permits one bounded durable observation under the delegated scope.',
    'Only authorized context may be used, and the delegate must report missing, stale, contradictory, or insufficient context instead of guessing.',
    'Memory authorization never changes workspace permissions or grants control of root lifecycle and real-user-intent ownership.',
    'A handoff must keep accepted scope, decisions, permissions, and artifacts plus bounded memory context available to the authorized delegate.',
    'Completion continuity is a provider-confirmed semantic summary outcome owned by the root.',
    'Missing capability evidence is reported as degraded or unsupported and never as successful persistence or recovery.',
    'openspec/ is the canonical SDD store; do not mirror spec.md, plan.md, tasks.md, verification reports, or archive reports into provider memory.',
    'Do not invent a consumer fallback or silently change the selected persistence mode.',
  ];

  if (role.name === 'orchestrator') {
    return [
      ...sharedRules,
      'The root coordinator owns authorization, root lifecycle, real-user-intent handling, and semantic completion outcomes.',
      'Dispatch task and authorization context without embedding secrets, raw transcripts, or irrelevant context.',
    ];
  }

  if (role.mode === 'read-only') {
    return [
      ...sharedRules,
      'For a read-only workspace role, observe may authorize a durable provider observation but does not authorize workspace mutation.',
      'Root lifecycle ownership never transfers to this delegate.',
    ];
  }

  return [
    ...sharedRules,
    'For a write-capable workspace role, provider observations still require observe authorization and the delegated parent scope.',
    'Root lifecycle ownership never transfers to this delegate.',
  ];
}

export function getRoleMemoryGovernance(
  role: AgentRoleContract,
): RoleMemoryGovernance {
  return {
    role: role.name,
    workspaceMode: role.mode,
    requiresParentContext: role.name !== 'orchestrator',
    availableAuthorizations: ['none', 'recall', 'observe'],
    ownsRootLifecycle: role.name === 'orchestrator',
    rules: roleRules(role),
  };
}

export function getMemoryGovernanceContract(
  roles: readonly AgentRoleContract[],
): MemoryGovernanceContract {
  return {
    provider: 'thoth-mem',
    providerOwnership: 'external',
    installedGuidance: 'thoth-mem skill',
    canonicalSddStore: 'openspec/',
    prohibitsSddArtifactMirroring: true,
    requiresParentAuthorization: true,
    rootLifecycleOwner: 'orchestrator',
    handoffOutcome: 'bounded-memory-contract',
    completionOutcome: 'provider-confirmed-semantic-summary',
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
        `- Progress ownership remains with the coordinator; report memory-governance verification for tracking in ${dialect.tools.progressTool ?? 'written progress notes'}.`,
      ]
    : [];

  return [
    'External thoth-mem provider memory governance:',
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
