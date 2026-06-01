import { describe, expect, test } from 'vitest';
import {
  canEnterSddPhase,
  FULL_SDD_PHASE_ORDER,
  getRequiredSddPhaseOrder,
  getSddPhase,
  getSddWorkflowContract,
} from './sdd';

describe('SDD workflow contract', () => {
  test('models the full SDD phase order through archive', () => {
    expect(getRequiredSddPhaseOrder('full')).toEqual([...FULL_SDD_PHASE_ORDER]);
  });

  test('requires spec and design before full-pipeline tasks', () => {
    expect(
      canEnterSddPhase({
        pipeline: 'full',
        target: 'tasks',
        completed: ['requirements-interview', 'proposal'],
      }),
    ).toBe(false);

    expect(
      canEnterSddPhase({
        pipeline: 'full',
        target: 'tasks',
        completed: ['requirements-interview', 'proposal', 'spec', 'design'],
      }),
    ).toBe(true);
  });

  test('preserves plan-review and user-confirmation gates before apply', () => {
    expect(getSddPhase('plan-review')).toMatchObject({
      gate: 'oracle-review',
      owner: 'oracle',
    });
    expect(getSddPhase('implementation-confirmation')).toMatchObject({
      gate: 'user-confirmation',
      owner: 'user',
    });

    expect(
      canEnterSddPhase({
        pipeline: 'full',
        target: 'apply',
        completed: [
          'requirements-interview',
          'proposal',
          'spec',
          'design',
          'tasks',
          'plan-review',
        ],
      }),
    ).toBe(false);
  });

  test('routes SDD artifact phases explicitly to technical write-capable roles', () => {
    for (const phase of [
      'proposal',
      'spec',
      'design',
      'tasks',
      'verify',
      'archive',
    ] as const) {
      expect(getSddPhase(phase)).toMatchObject({
        owner: 'write-capable-agent',
        defaultAgentRole: 'deep',
      });
    }

    expect(getSddPhase('design')).toMatchObject({
      artifactSkill: 'sdd-design',
      artifactMeaning: 'technical-solution-design',
      defaultAgentRole: 'deep',
    });
    expect(getSddPhase('design')).not.toMatchObject({
      defaultAgentRole: 'designer',
    });

    expect(getSddPhase('apply')).toMatchObject({
      owner: 'write-capable-agent',
      defaultAgentRole: 'deep',
      alternateAgentRoles: ['quick', 'designer'],
    });
  });

  test('allows apply only after review approval and implementation confirmation', () => {
    expect(
      canEnterSddPhase({
        pipeline: 'full',
        target: 'apply',
        completed: [
          'requirements-interview',
          'proposal',
          'spec',
          'design',
          'tasks',
          'plan-review',
          'implementation-confirmation',
        ],
      }),
    ).toBe(true);
  });

  test('captures artifact and verification rules', () => {
    const contract = getSddWorkflowContract();
    expect(contract.routingRules.join('\n')).toContain(
      'Scope-faithful invariant: accepted user intent/scope is preserved',
    );

    expect(contract.artifactRules.join('\n')).toContain(
      'sdd-design itself never routes to designer',
    );
    expect(contract.artifactRules.join('\n')).toContain(
      'Designer participates during apply only for user-facing UI, visual work, screenshots, or visual QA.',
    );
    expect(contract.artifactRules.join('\n')).toContain(
      'Full-pipeline tasks require proposal, spec, and design',
    );
    expect(contract.verificationRules.join('\n')).toContain(
      'Apply is followed by verify and archive',
    );
  });
});
