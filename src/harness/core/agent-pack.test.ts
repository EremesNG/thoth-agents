import { describe, expect, test } from 'vitest';
import {
  AGENT_ROLE_NAMES,
  getAgentPackContract,
  getAgentRole,
} from './agent-pack';

describe('agent-pack contract', () => {
  test('exposes the minimal hybrid roster', () => {
    const contract = getAgentPackContract();

    expect(contract.roles.map((role) => role.name)).toEqual([
      'orchestrator',
      'explorer',
      'librarian',
      'oracle',
      'designer',
      'quick',
      'deep',
    ]);
    expect(AGENT_ROLE_NAMES).toHaveLength(7);
  });

  test('makes the root adaptive instead of delegation-only', () => {
    expect(getAgentRole('orchestrator')).toMatchObject({
      mode: 'adaptive-root',
      dispatch: 'root-coordinator',
      canMutateWorkspace: true,
    });

    const contract = getAgentPackContract();
    expect(contract.orchestrationPolicy).toMatchObject({
      maxDelegationDepth: 1,
      singleWriter: true,
    });
    expect(contract.orchestrationPolicy.implementationOwnership).toMatchObject({
      routeIndependent: true,
    });
    expect(contract.orchestrationPolicy.rules.join('\n')).toContain('net gain');
    expect(contract.orchestrationPolicy.rules.join('\n')).not.toContain(
      'delegate-first',
    );
    expect(getAgentRole('orchestrator').responsibility).toMatch(
      /coordination|specification|planning/i,
    );
  });

  test('chooses implementation ownership from task-shaped net gain instead of route', () => {
    const contract = getAgentPackContract();
    const ownership = contract.orchestrationPolicy.implementationOwnership;

    expect(ownership).toEqual({
      eligibleOwners: ['orchestrator', 'designer', 'quick', 'deep'],
      routeIndependent: true,
      delegationBenefits: [
        'specialization',
        'context isolation',
        'independent bounded work',
        'safe parallelism',
        'quality, latency, or total-cost gain',
      ],
      rootContinuityBenefits: [
        'short work',
        'one ordered reasoning chain',
        'frequent shared-state writes',
        'already-loaded context',
        'rediscovery and coordination cost',
      ],
      userDirection: 'explicit safe user direction is an ownership input',
      insufficientSignals: [
        'SDD route name',
        'file count alone',
        'cheaper model price without end-to-end evidence',
      ],
    });

    const root = getAgentRole('orchestrator');
    const rootContract = [
      root.responsibility,
      ...root.useWhen,
      ...root.doNotUseWhen,
      ...root.escalateWhen,
    ].join('\n');
    const rules = contract.orchestrationPolicy.rules.join('\n');

    expect(rootContract).toContain('every route');
    expect(rootContract).toContain('demonstrated net gain');
    expect(rules).toContain(
      'Direct, Accelerated, Full, and no-artifact execution govern artifacts and gates, not implementation ownership.',
    );
    expect(rules).toContain(
      'After deciding to delegate implementation, select designer for UI/UX, quick for known narrow low-risk work, and deep for coupled or high-risk work.',
    );
    expect(rules).not.toMatch(/Direct micro-action|Artifact-backed.*selects/i);
  });

  test('defines fresh delegation and bounded continuation as canonical policy', () => {
    const rules = getAgentPackContract().orchestrationPolicy.rules.join('\n');

    expect(rules).toContain(
      'fresh subagent instance is the default when the objective, SDD phase, mutable surface, or independent judgment changes',
    );
    expect(rules).toContain(
      'only to steer, complete, or clarify the same bounded assignment',
    );
    expect(rules).toContain('completed agents are not a reusable role pool');
    expect(rules).toContain(
      'Every Oracle plan review, verification round, and approval or PASS judgment uses a fresh Oracle instance',
    );
    expect(rules).toContain(
      'Wait and status operations collect only the active nonterminal assignment and do not authorize later reuse',
    );
  });

  test('shapes substantive work into dependency-aware native waves before fan-in', () => {
    const policy = getAgentPackContract().orchestrationPolicy.taskShaping;

    expect(policy.steps).toEqual([
      'bound-work',
      'map-dependencies',
      'assign-ownership',
      'select-specialists',
      'mark-ready-and-blocked',
      'dispatch-ready-wave',
      'wait-for-terminal-evidence',
      'reconcile-and-verify',
    ]);
    expect(policy.decisions).toMatchObject({
      dependency: 'block a lane until every concrete upstream output exists',
      ownershipConflict:
        'serialize overlapping mutable surfaces or assign one writer',
      readyWave:
        'dispatch all independent conflict-free ready lanes before waiting',
      terminalEvidence:
        'silence, timeout, and malformed status remain nonterminal',
      degradation:
        'report an unavailable native primitive and use a truthful sequential fallback',
    });
    expect(policy.nativeAuthority).toBe(true);
    expect(policy.boundedWidth).toBe(true);
  });

  test('considers every specialist through equally structured semantic decisions', () => {
    const directory =
      getAgentPackContract().orchestrationPolicy.specialistDirectory;

    expect(directory.map(({ role }) => role)).toEqual([
      'explorer',
      'librarian',
      'oracle',
      'designer',
      'quick',
      'deep',
    ]);
    for (const decision of directory) {
      expect(decision.selectWhen.length, decision.role).toBeGreaterThan(20);
      expect(decision.rejectWhen.length, decision.role).toBeGreaterThan(20);
    }
  });

  test('defines orchestration as immutable policy without runtime lifecycle state', () => {
    const serialized = JSON.stringify(
      getAgentPackContract().orchestrationPolicy,
    );

    for (const forbidden of [
      'executor',
      'jobBoard',
      'projection',
      'telemetry',
      'observer',
      'wakeLoop',
      'assignmentStatus',
      'terminalResults',
      'runtimeState',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  test('keeps discovery and judgment read-only', () => {
    for (const name of ['explorer', 'librarian', 'oracle'] as const) {
      expect(getAgentRole(name)).toMatchObject({
        mode: 'read-only',
        canMutateWorkspace: false,
      });
    }
  });

  test('keeps sequential SDD coordination in the adaptive root', () => {
    const role = getAgentRole('orchestrator');

    expect(role.toolGovernance.join('\n')).toMatch(/openspec/i);
    expect(role.toolGovernance.join('\n')).toMatch(/append-only/i);
    expect(role.toolGovernance.join('\n')).toMatch(
      /load.*contract|contract.*demand/i,
    );
  });

  test('keeps implementation ownership with the three writer roles', () => {
    for (const name of ['designer', 'quick', 'deep'] as const) {
      expect(getAgentRole(name)).toMatchObject({
        mode: 'write-capable',
        dispatch: 'synchronous-task-only',
        canMutateWorkspace: true,
      });
    }
  });

  test('reserves selected plan review and proportionate independent verification for oracle', () => {
    const role = getAgentRole('oracle');

    expect(role.scope).toMatch(/optional plan review/i);
    expect(role.responsibility).toMatch(/review plans.*user requests/i);
    expect(role.responsibility).toMatch(/independent judgment/i);
    expect(role.toolGovernance.join('\n')).toMatch(
      /never.*implementer|independent/i,
    );
    expect(getAgentRole('orchestrator').verification.join('\n')).toContain(
      'trivial deterministic Direct',
    );
    expect(getAgentRole('orchestrator').verification.join('\n')).toContain(
      'Accelerated, Full, and material-risk Direct',
    );
  });

  test('defines one compact return contract for every child agent', () => {
    expect(getAgentPackContract().returnContract).toEqual([
      'conclusion',
      'evidence',
      'verification',
      'risks',
      'openQuestions',
      'nextAction',
    ]);
  });
});
