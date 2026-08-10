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
    expect(contract.orchestrationPolicy.rules.join('\n')).toContain(
      'bounded direct work',
    );
    expect(contract.orchestrationPolicy.rules.join('\n')).toContain('net gain');
    expect(contract.orchestrationPolicy.rules.join('\n')).not.toContain(
      'delegate-first',
    );
    expect(getAgentRole('orchestrator').responsibility).toMatch(
      /coordination|specification|planning/i,
    );
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

  test('reserves selected plan review and every verification for oracle', () => {
    const role = getAgentRole('oracle');

    expect(role.scope).toMatch(/optional plan review/i);
    expect(role.responsibility).toMatch(/review plans.*user requests/i);
    expect(role.responsibility).toMatch(
      /every.*verification|verification.*every/i,
    );
    expect(role.toolGovernance.join('\n')).toMatch(
      /never.*implementer|independent/i,
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
