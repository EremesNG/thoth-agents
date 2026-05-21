import { describe, expect, test } from 'bun:test';
import {
  AGENT_ROLE_NAMES,
  getAgentPackContract,
  getAgentRole,
} from './agent-pack';

describe('agent-pack contract', () => {
  test('lists the stable seven-role roster', () => {
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

  test('preserves read-only and write-capable specialist split', () => {
    expect(getAgentRole('orchestrator')).toMatchObject({
      mode: 'primary-non-mutating',
      dispatch: 'root-coordinator',
      canMutateWorkspace: false,
    });

    for (const name of ['explorer', 'librarian', 'oracle'] as const) {
      expect(getAgentRole(name)).toMatchObject({
        mode: 'read-only',
        canMutateWorkspace: false,
      });
    }

    for (const name of ['designer', 'quick', 'deep'] as const) {
      expect(getAgentRole(name)).toMatchObject({
        mode: 'write-capable',
        dispatch: 'synchronous-task-only',
        canMutateWorkspace: true,
      });
    }
  });

  test('carries delegate-first governance and verification metadata', () => {
    const contract = getAgentPackContract();
    const deep = getAgentRole('deep');

    expect(contract.delegateFirstRules.join('\n')).toContain(
      'orchestrator coordinates',
    );
    expect(deep.toolGovernance.join('\n')).toContain(
      'validates shared behavior',
    );
    expect(contract.verificationProtocol.join('\n')).toContain('changed files');
  });
});
