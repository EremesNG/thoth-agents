import { describe, expect, test } from 'vitest';
import { getAgentRole } from './agent-pack';
import {
  getExecutionCoordinationPolicy,
  getWorkPhase,
  getWorkPhasesForRole,
  getWorkWorkflowContract,
  renderWorkUnitDispatchEnvelope,
} from './workflow';

describe('AI-first work workflow', () => {
  test('keeps trivial bounded work direct and persists recoverable work in one contract', () => {
    const contract = getWorkWorkflowContract();

    expect(contract.phases.map(({ id }) => id)).toEqual([
      'plan',
      'execute',
      'resume',
      'verify',
      'close',
    ]);
    expect(contract.directPath).toBe('implement -> verify');
    expect(contract.persistedWorkPath).toBe('.thoth/changes/<id>/work.yaml');
    expect(contract.checkpointPath).toBe(
      '.thoth/changes/<id>/evidence/<unit-id>/checkpoint.json',
    );
    expect(contract.rules.join('\n')).toMatch(/nontrivial|recoverable/i);
    expect(JSON.stringify(contract)).not.toMatch(
      /Accelerated|Full SDD|route-selection|openspec/i,
    );
  });

  test('classifies requests without making delegation a persistence trigger', () => {
    const rules = getWorkWorkflowContract().rules.join('\n');

    expect(rules).toMatch(/classify.*questions.*research.*changes/i);
    expect(rules).toMatch(/scope.*uncertainty.*risk.*coordination.*recovery/i);
    expect(rules).toMatch(
      /direct work.*delegate.*without.*planning artifacts/i,
    );
    expect(rules).toMatch(/delegation.*unit count.*do not.*persistence/i);
    expect(rules).toMatch(/reclassify.*material.*uncertainty.*risk/i);
  });

  test('requires discovery and clarification before planning and persistence', () => {
    const rules = getWorkPhase('plan').rules.join('\n');

    expect(rules).toMatch(
      /explore.*current behavior.*contracts.*tests.*constraints/i,
    );
    expect(rules).toMatch(/specify.*desired behavior.*scope.*acceptance/i);
    expect(rules).toMatch(
      /clarify.*facts.*assumptions.*human-owned decisions/i,
    );
    expect(rules).toMatch(/investigate.*repository facts.*rather than.*user/i);
    expect(rules).toMatch(/architectural-grilling.*only.*explicit.*material/i);
    expect(rules).toMatch(/material uncertainty.*blocks.*ready/i);
    expect(rules).toMatch(
      /remaining technical uncertainty.*resolution strategy/i,
    );
    expect(rules).toMatch(/only then.*plan.*persist/i);
    expect(rules).toMatch(/no separate.*discovery.*specification.*documents/i);
  });

  test('treats prior human agreement as durable authorization', () => {
    const rules = getWorkWorkflowContract().authorizationRules.join('\n');

    expect(rules).toMatch(/existing authorization persists/i);
    expect(rules).toMatch(/only.*material human-owned.*new decision/i);
    expect(rules).toMatch(/technical replanning.*does not require/i);
    expect(rules).toMatch(/three total native attempts/i);
    expect(rules).toContain('Implement (Recommended)');
  });

  test('resumes both explicit and fallback planning decisions without resetting attempts', () => {
    const rules = getWorkWorkflowContract().authorizationRules.join('\n');
    expect(rules).toContain('evidence/planning.json');
    expect(rules).toMatch(
      /native references.*unanswered counts.*plan identity/,
    );
    expect(rules).toMatch(
      /explicit or fallback choices.*Stop.*remaining attempts/,
    );
    expect(rules).toMatch(
      /Materially changed.*fresh review.*implementation choice/,
    );
    expect(rules).toMatch(/expected implementation edits.*do not reopen/);
  });

  test('defines dependency-ready continuous dispatch without a global wave barrier', () => {
    const policy = getExecutionCoordinationPolicy();
    const serialized = JSON.stringify(policy);

    expect(policy.steps).toEqual([
      'bound-units',
      'map-output-dependencies',
      'admit-ready-units',
      'dispatch-to-native-capacity',
      'wait-for-native-terminal-event',
      'accept-results',
      'refill-capacity',
    ]);
    expect(serialized).toMatch(/concrete upstream output/i);
    expect(serialized).toMatch(
      /compatible reads, writes, interfaces, and resources/i,
    );
    expect(serialized).toMatch(/dispatch every admitted.*before waiting/i);
    expect(serialized).toMatch(/refill.*before.*wait/i);
    expect(serialized).toMatch(/accepted.*fresh/i);
    expect(serialized).toMatch(/no global wave barrier/i);
  });

  test('keeps native lifecycle authoritative and checkpoints informational', () => {
    const policy = JSON.stringify(getExecutionCoordinationPolicy());

    expect(policy).toMatch(/native.*sole authority/i);
    expect(policy).toMatch(/timeout.*silence.*checkpoint.*nonterminal/i);
    expect(policy).toMatch(/unknown native liveness.*conflicting surface/i);
    expect(policy).not.toMatch(/jobBoard|queue|scheduler|portable wait/i);
  });

  test('resumes from bounded evidence without discarding partial or preexisting work', () => {
    const phase = getWorkPhase('resume');
    const serialized = JSON.stringify(phase);

    expect(serialized).toMatch(/work\.yaml/i);
    expect(serialized).toMatch(/pending checkpoint/i);
    expect(serialized).toMatch(/relevant diff|dirty files/i);
    expect(serialized).toMatch(/dependency fingerprints/i);
    expect(serialized).toMatch(/external effects.*before replay/i);
    expect(serialized).toMatch(/partial.*preexisting/i);
    expect(serialized).not.toMatch(/full codebase/i);
  });

  test('keeps verification independent for persisted work', () => {
    expect(getWorkPhasesForRole('oracle').map(({ id }) => id)).toEqual([
      'verify',
    ]);
    expect(getWorkPhase('verify').rules.join('\n')).toMatch(
      /fresh oracle.*writer.*self-approve/i,
    );
    expect(getWorkPhase('execute').eligibleAgentRoles).toEqual([
      'orchestrator',
      'designer',
      'worker',
    ]);
  });

  test('renders one bounded unit packet and provider-neutral memory context', () => {
    const envelope = renderWorkUnitDispatchEnvelope({
      phase: 'execute',
      changeId: 'native-workflow',
      unitId: 'unit-prompts',
      objective: 'Render native lifecycle rules.',
      inputs: ['.thoth/changes/native-workflow/work.yaml#units.unit-prompts'],
      requirements: ['Preserve existing authorization.'],
      boundaries: ['Own src/agents/** only.'],
      verification: ['Run prompt rendering tests.'],
      memory: {
        provider: 'thoth-mem',
        project: 'thoth-agents',
        authorization: 'none',
      },
    });

    for (const heading of [
      'PHASE / WORK',
      'UNIT',
      'OBJECTIVE',
      'INPUTS',
      'REQUIREMENTS',
      'BOUNDARIES',
      'VERIFICATION',
      'EXPECTED OUTPUT',
      'HANDOFF',
      'MEMORY',
    ]) {
      expect(envelope).toContain(`## ${heading}`);
    }
    expect(envelope).toContain('execute / native-workflow');
    expect(envelope).toContain('unit-prompts');
    expect(envelope).toContain('root_session_id=unavailable');
    expect(envelope).toContain('authorization=none');
  });

  test('returns defensive copies from public workflow APIs', () => {
    const first = getWorkWorkflowContract();
    first.rules.push('mutation');
    first.phases[0]?.rules.push('mutation');

    const second = getWorkWorkflowContract();
    expect(second.rules).not.toContain('mutation');
    expect(second.phases[0]?.rules).not.toContain('mutation');
    expect(() => getWorkPhase('unknown' as 'plan')).toThrow(
      'Unknown work phase: unknown',
    );
    expect(getAgentRole('worker').dispatch).toBe('task');
  });
});
