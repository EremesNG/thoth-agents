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
      'sdd-specify',
      'sdd-plan',
      'sdd-tasks',
      'designer',
      'quick',
      'deep',
    ]);
    expect(AGENT_ROLE_NAMES).toHaveLength(10);
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
    expect(contract.orchestrationPolicy.rules.join('\n')).toContain(
      'bounded direct work',
    );
    expect(contract.orchestrationPolicy.rules.join('\n')).toContain('net gain');
    expect(contract.orchestrationPolicy.rules.join('\n')).not.toContain(
      'delegate-first',
    );
  });

  test('keeps discovery and judgment read-only', () => {
    for (const name of ['explorer', 'librarian', 'oracle'] as const) {
      expect(getAgentRole(name)).toMatchObject({
        mode: 'read-only',
        canMutateWorkspace: false,
      });
    }
  });

  test('limits SDD phase agents to coordination artifacts', () => {
    for (const name of ['sdd-specify', 'sdd-plan', 'sdd-tasks'] as const) {
      expect(getAgentRole(name)).toMatchObject({
        mode: 'coordination-write',
        dispatch: 'synchronous-task-only',
        canMutateWorkspace: true,
        writeScope: ['openspec/'],
      });
    }
  });

  test('assigns append-only convergence to sdd-tasks', () => {
    const role = getAgentRole('sdd-tasks');

    expect(role.responsibility).toMatch(/convergence/i);
    expect(role.toolGovernance.join('\n')).toMatch(/append-only/i);
    expect(role.toolGovernance.join('\n')).toMatch(/does not implement/i);
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

  test('allows quick to perform mechanical verified archive closeout', () => {
    const role = getAgentRole('quick');

    expect(role.scope).toMatch(/archive/i);
    expect(role.responsibility).toMatch(/archive/i);
    expect(role.toolGovernance.join('\n')).toMatch(/verify-report\.md/);
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
