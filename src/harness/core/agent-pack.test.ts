import { describe, expect, test } from 'vitest';
import {
  AGENT_ROLE_NAMES,
  getAgentPackContract,
  getAgentRole,
} from './agent-pack';

describe('agent-pack contract', () => {
  test('exposes the seven-role adaptive roster', () => {
    expect(getAgentPackContract().roles.map(({ name }) => name)).toEqual([
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

  test('models every specialist dispatch as a native task', () => {
    for (const role of AGENT_ROLE_NAMES.filter(
      (name) => name !== 'orchestrator',
    )) {
      expect(getAgentRole(role).dispatch).toBe('task');
    }
    expect(getAgentRole('orchestrator')).toMatchObject({
      mode: 'adaptive-root',
      dispatch: 'root-coordinator',
      canMutateWorkspace: true,
    });
    expect(JSON.stringify(getAgentPackContract())).not.toContain(
      'synchronous-task-only',
    );
  });

  test('defines specialist-default ownership and its bounded root exception', () => {
    const ownership =
      getAgentPackContract().orchestrationPolicy.implementationOwnership;
    expect(ownership).toMatchObject({
      eligibleOwners: ['orchestrator', 'designer', 'quick', 'deep'],
      workflowIndependent: true,
      defaultImplementationOwner: 'specialist',
    });
    expect(ownership.rootResponsibilities.join(' ')).toMatch(
      /goal.*constraints.*decisions.*coordination.*acceptance.*synthesis/i,
    );
    expect(ownership.directException.join(' ')).toMatch(
      /source.*scope.*verification.*known.*no discovery.*independent judgment/i,
    );
    expect(ownership.directException.join(' ')).toMatch(
      /another search or dependency.*ends/i,
    );
    expect(ownership.insufficientSignals.join(' ')).toMatch(
      /file count.*accumulated context.*coordination overhead/i,
    );
  });

  test('routes unknown discovery before root search without imposing an Explorer relay on known work', () => {
    const ownership =
      getAgentPackContract().orchestrationPolicy.implementationOwnership;
    expect(ownership.discovery.join(' ')).toMatch(
      /unknown.*source.*flow.*responsibility.*Explorer.*before root.*search/i,
    );
    expect(ownership.discovery.join(' ')).toMatch(/unknown location/i);
    expect(ownership.writerRouting.join(' ')).toMatch(
      /known.*bounded.*directly.*designer.*quick.*deep.*without.*Explorer/i,
    );
  });

  test('requires targeted support without duplicate discovery or unrestricted fallback', () => {
    const ownership =
      getAgentPackContract().orchestrationPolicy.implementationOwnership;
    expect(ownership.evidenceHandling.join(' ')).toMatch(
      /conclusions.*localized evidence.*uncertainty.*next action/i,
    );
    expect(ownership.evidenceHandling.join(' ')).toMatch(
      /must not repeat delegated discovery/i,
    );
    expect(ownership.evidenceHandling.join(' ')).toMatch(
      /missing support.*targeted/i,
    );
    expect(ownership.delegationFailure.join(' ')).toMatch(
      /truthful.*not.*unrestricted root/i,
    );
  });

  test('defines continuous dependency-ready native dispatch', () => {
    const policy = getAgentPackContract().orchestrationPolicy.taskShaping;
    expect(policy.steps).toEqual([
      'bound-units',
      'map-output-dependencies',
      'assign-ownership',
      'select-specialists',
      'admit-ready-units',
      'dispatch-to-native-capacity',
      'wait-for-native-terminal-event',
      'accept-results',
      'refill-capacity',
    ]);
    expect(policy.decisions.dependency).toMatch(/root-accepted.*fresh/i);
    expect(policy.decisions.readyDispatch).toMatch(/before waiting/i);
    expect(policy.decisions.refill).toMatch(/before another wait/i);
    expect(policy.decisions.terminalEvidence).toMatch(/timeout.*nonterminal/i);
    expect(policy.nativeAuthority).toBe(true);
  });

  test('keeps one writer and read-only judgment boundaries', () => {
    expect(getAgentPackContract().orchestrationPolicy.singleWriter).toBe(true);
    for (const name of ['explorer', 'librarian', 'oracle'] as const) {
      expect(getAgentRole(name)).toMatchObject({
        mode: 'read-only',
        canMutateWorkspace: false,
      });
    }
    for (const name of ['designer', 'quick', 'deep'] as const) {
      expect(getAgentRole(name)).toMatchObject({
        mode: 'write-capable',
        canMutateWorkspace: true,
      });
    }
  });

  test('preserves fresh specialist and fresh Oracle lifecycle policy', () => {
    const rules = getAgentPackContract().orchestrationPolicy.rules.join('\n');
    expect(rules).toMatch(/fresh subagent.*work unit/i);
    expect(rules).toMatch(/same bounded assignment/i);
    expect(rules).toMatch(/fresh Oracle/i);
    expect(rules).toMatch(/completed agents are not a reusable role pool/i);
  });

  test('keeps runtime state out of declarative policy', () => {
    const serialized = JSON.stringify(
      getAgentPackContract().orchestrationPolicy,
    );
    for (const forbidden of [
      'jobBoard',
      'projection',
      'telemetry',
      'wakeLoop',
      'assignmentStatus',
      'terminalResults',
      'runtimeState',
    ])
      expect(serialized).not.toContain(forbidden);
  });

  test('defines one compact return contract', () => {
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
