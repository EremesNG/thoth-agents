import { describe, expect, test } from 'bun:test';
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

    expect(contract.artifactRules.join('\n')).toContain(
      'Full-pipeline tasks require proposal, spec, and design',
    );
    expect(contract.verificationRules.join('\n')).toContain(
      'Apply is followed by verify and archive',
    );
  });
});
