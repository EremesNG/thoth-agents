import { describe, expect, test } from 'vitest';
import {
  AGENT_ROLE_NAMES,
  getAgentPackContract,
  getAgentRole,
} from './agent-pack';

describe('agent-pack contract', () => {
  test('exposes the six-role adaptive roster', () => {
    expect(getAgentPackContract().roles.map(({ name }) => name)).toEqual([
      'orchestrator',
      'explorer',
      'librarian',
      'oracle',
      'designer',
      'worker',
    ]);
    expect(AGENT_ROLE_NAMES).toHaveLength(6);
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
      eligibleOwners: ['orchestrator', 'designer', 'worker'],
      workflowIndependent: true,
      defaultImplementationOwner: 'specialist',
    });
    expect(ownership.rootResponsibilities.join(' ')).toMatch(
      /goal.*constraints.*decisions.*coordination.*acceptance.*synthesis/i,
    );
    expect(ownership.directException.join(' ')).toMatch(
      /minimal authorized low-risk edit.*scope.*verification.*known.*no discovery.*independent judgment/i,
    );
    expect(ownership.directConsultation.join(' ')).toMatch(
      /known source.*bounded question/i,
    );
    expect(ownership.directException.join(' ')).toMatch(
      /bounded direct-work exception.*root retains known low-risk mechanical work.*reviewed commits/i,
    );
    expect(ownership.directException.join(' ')).not.toMatch(
      /another search or dependency.*ends/i,
    );
    expect(ownership.userDirection).toMatch(
      /no-delegation instruction wins.*preserve operator-selected model and effort/i,
    );
    expect(ownership.insufficientSignals.join(' ')).toMatch(
      /file count.*targeted search/i,
    );
  });

  test('limits direct root consultation and stops chained discovery', () => {
    const consultation =
      getAgentPackContract().orchestrationPolicy.implementationOwnership.directConsultation.join(
        ' ',
      );

    expect(consultation).toMatch(/one known source.*one bounded question/i);
    expect(consultation).toMatch(
      /new path.*unlocated dependency.*stop and delegate.*acquired context/i,
    );
    expect(consultation).toMatch(
      /experimental cumulative.*two source fragments.*approximately 200 code lines.*per user request/i,
    );
    expect(consultation).toMatch(/across tools, files, and subtasks/i);
    expect(consultation).toMatch(
      /required operating instructions.*coordination artifacts.*excluded.*source or log dumps/i,
    );
    expect(consultation).toMatch(/not runtime enforcement/i);
    expect(consultation).toMatch(/never waives independent verification/i);
    const anotherConsultation =
      getAgentPackContract().orchestrationPolicy.implementationOwnership
        .directConsultation;
    expect(consultation).toBe(anotherConsultation.join(' '));
    expect(
      getAgentPackContract().orchestrationPolicy.implementationOwnership
        .directConsultation,
    ).not.toBe(anotherConsultation);
  });

  test('routes unlocated discovery before root tools without imposing an Explorer relay on known work', () => {
    const ownership =
      getAgentPackContract().orchestrationPolicy.implementationOwnership;
    expect(ownership.discovery.join(' ')).toMatch(
      /unlocated.*source.*flow.*responsibility.*Explorer.*before any root.*search.*file read.*shell\/git inspection.*CodeGraph query/i,
    );
    expect(ownership.discovery.join(' ')).toMatch(/unknown location/i);
    expect(ownership.writerRouting.join(' ')).toMatch(
      /known.*bounded.*directly.*designer.*worker.*without.*Explorer/i,
    );
  });

  test('requires targeted support without duplicate discovery or unrestricted fallback', () => {
    const ownership =
      getAgentPackContract().orchestrationPolicy.implementationOwnership;
    expect(ownership.evidenceHandling.join(' ')).toMatch(
      /conclusions.*localized evidence.*uncertainty/i,
    );
    expect(ownership.evidenceHandling.join(' ')).toMatch(
      /next action only from Oracle, Worker and Designer/i,
    );
    expect(ownership.evidenceHandling.join(' ')).not.toMatch(
      /uncertainty, and next action instead/i,
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

  test('shapes independently acceptable outcomes across every work stage', () => {
    const decisions =
      getAgentPackContract().orchestrationPolicy.taskShaping.decisions;

    expect(decisions.unitOutcome).toMatch(
      /exploration.*research.*planning.*implementation.*verification/i,
    );
    expect(decisions.unitEnvelope).toMatch(
      /accepted upstream inputs.*result produced.*owned writes.*interfaces.*shared resources.*focused checks.*pass evidence.*native return milestone.*stop condition/i,
    );
    expect(decisions.phaseSplitting).toMatch(
      /split.*separately acceptable outcomes.*before dispatch.*cohesive tiny edits together/i,
    );
    expect(decisions.independentDiscovery).toMatch(
      /precise independent Explorer questions.*parallel.*native capacity.*duplicate reads.*dependent questions.*root-accepted.*fresh/i,
    );
    expect(decisions.scopeGrowth).toMatch(
      /missing context.*interfaces.*ownership conflicts.*material scope growth.*bounded progress.*root reassessment.*before expansion/i,
    );
  });

  test('routes bounded nonvisual implementation to Worker regardless of complexity', () => {
    const worker = getAgentRole('worker');
    const contract = JSON.stringify(worker);
    expect(contract).toContain('regardless of complexity');
    expect(contract).toContain('Known bounded nonvisual implementation');
    expect(contract).not.toContain('narrow known low-risk edits');
    expect(contract).not.toContain('bulk mechanical changes');
    expect(getAgentRole('designer').scope).toContain('UI/UX');
  });

  test('keeps one writer and read-only judgment boundaries', () => {
    expect(getAgentPackContract().orchestrationPolicy.singleWriter).toBe(true);
    for (const name of ['explorer', 'librarian', 'oracle'] as const) {
      expect(getAgentRole(name)).toMatchObject({
        mode: 'read-only',
        canMutateWorkspace: false,
      });
    }
    for (const name of ['designer', 'worker'] as const) {
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

  test('defines evidence-only discovery returns and preserves judgment and writer handoffs', () => {
    const contract = getAgentPackContract().returnContract;
    for (const role of ['explorer', 'librarian'] as const) {
      expect(contract[role]).toEqual([
        'conclusion',
        'evidence',
        'verification',
        'risks',
        'openQuestions',
      ]);
    }
    for (const role of ['oracle', 'designer', 'worker'] as const) {
      expect(contract[role]).toEqual([
        'conclusion',
        'evidence',
        'verification',
        'risks',
        'openQuestions',
        'nextAction',
      ]);
    }
    const anotherContract = getAgentPackContract().returnContract;
    for (const role of AGENT_ROLE_NAMES) {
      expect(contract[role]).not.toBe(anotherContract[role]);
    }
  });
});
