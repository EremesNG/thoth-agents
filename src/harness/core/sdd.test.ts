import { describe, expect, test } from 'vitest';
import {
  canEnterSddPhase,
  FULL_SDD_PHASE_ORDER,
  getRequiredSddPhaseOrder,
  getSddPhase,
  getSddWorkflowContract,
  SDD_VERIFY_MAX_ROUNDS,
} from './sdd';

describe('SDD workflow contract', () => {
  test('models the full SDD phase order through archive', () => {
    expect(getRequiredSddPhaseOrder('full')).toEqual([...FULL_SDD_PHASE_ORDER]);
    expect(getRequiredSddPhaseOrder('full')).toContain('explore');

    for (const order of [
      [...FULL_SDD_PHASE_ORDER],
      getRequiredSddPhaseOrder('full'),
    ]) {
      expect(order).toContain('clarify');
      expect(order.indexOf('clarify')).toBe(order.indexOf('spec') + 1);
      expect(order.indexOf('clarify')).toBe(order.indexOf('design') - 1);
    }
  });

  test('models the clarify phase contract between spec and design', () => {
    expect(getSddPhase('clarify')).toMatchObject({
      requiredFor: ['full'],
      prerequisites: ['spec'],
      producesArtifact: false,
      owner: 'write-capable-agent',
      artifactSkill: 'sdd-clarify',
      defaultAgentRole: 'deep',
    });

    const hints = getSddPhase('clarify').handoffHints;
    expect(Array.isArray(hints)).toBe(true);
    expect((hints as string[]).length).toBeGreaterThan(0);
  });

  test('requires clarify before design and renumbers design prerequisites', () => {
    expect(getSddPhase('design').prerequisites).toEqual([
      'proposal',
      'clarify',
    ]);

    expect(
      canEnterSddPhase({
        pipeline: 'full',
        target: 'design',
        completed: ['requirements-interview', 'explore', 'proposal', 'spec'],
      }),
    ).toBe(false);

    expect(
      canEnterSddPhase({
        pipeline: 'full',
        target: 'design',
        completed: [
          'requirements-interview',
          'explore',
          'proposal',
          'spec',
          'clarify',
        ],
      }),
    ).toBe(true);
  });

  test('omits clarify from the accelerated pipeline order', () => {
    expect(getRequiredSddPhaseOrder('accelerated')).not.toContain('clarify');
  });

  test('requires explore, spec, and design before full-pipeline tasks', () => {
    expect(
      canEnterSddPhase({
        pipeline: 'full',
        target: 'proposal',
        completed: ['requirements-interview'],
      }),
    ).toBe(false);

    expect(
      canEnterSddPhase({
        pipeline: 'full',
        target: 'tasks',
        completed: ['requirements-interview', 'explore', 'proposal'],
      }),
    ).toBe(false);

    expect(
      canEnterSddPhase({
        pipeline: 'full',
        target: 'tasks',
        completed: [
          'requirements-interview',
          'explore',
          'proposal',
          'spec',
          'design',
        ],
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
    expect(getSddPhase('verify')).toMatchObject({
      gate: 'iterative-verify',
      maxRounds: 3,
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

  test('pins the verify-loop round bound to a single canonical source', () => {
    expect(SDD_VERIFY_MAX_ROUNDS).toBe(3);
    expect(getSddPhase('verify').maxRounds).toBe(SDD_VERIFY_MAX_ROUNDS);
  });

  test('routes SDD phases through the role-specialized delegation matrix', () => {
    expect(getSddPhase('init')).toMatchObject({
      owner: 'write-capable-agent',
      artifactSkill: 'sdd-init',
      defaultAgentRole: 'quick',
      supportingAgentRoles: ['explorer'],
      condition:
        'Only when OpenSpec persistence is selected and openspec/ is missing or stale (partial structure or missing mechanism sections).',
    });

    // Init-phase condition must trigger on BOTH missing and stale/partial openspec.
    const initCondition = getSddPhase('init').condition ?? '';
    expect(initCondition).toContain('openspec/ is missing');
    expect(initCondition).toContain('stale');
    expect(initCondition).toContain('mechanism sections');

    expect(getSddPhase('explore')).toMatchObject({
      owner: 'read-only-agent',
      defaultAgentRole: 'explorer',
      supportingAgentRoles: ['librarian'],
    });

    for (const phase of ['proposal', 'spec', 'design'] as const) {
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

    expect(getSddPhase('tasks')).toMatchObject({
      artifactSkill: 'sdd-tasks',
      defaultAgentRole: 'quick',
      alternateAgentRoles: ['deep'],
    });

    expect(getSddPhase('verify')).toMatchObject({
      artifactSkill: 'sdd-verify',
      defaultAgentRole: 'oracle',
      persistenceAgentRole: 'quick',
    });

    expect(getSddPhase('archive')).toMatchObject({
      artifactSkill: 'sdd-archive',
      defaultAgentRole: 'quick',
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
      'sdd-tasks defaults to quick with deep as fallback',
    );
    expect(contract.artifactRules.join('\n')).toContain(
      'sdd-verify defaults to oracle for independent review',
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

  test('treats handoffHints as optional on phase contracts', () => {
    // A phase that declares no hint is still returned without error.
    const archive = getSddPhase('archive');
    expect(archive.handoffHints).toBeUndefined();
    expect(archive.id).toBe('archive');

    // The optional field does not disturb existing gate/role assertions.
    expect(getSddPhase('plan-review').gate).toBe('oracle-review');
  });

  test('exposes handoffHints on the proposal, spec, and design phases', () => {
    for (const id of ['proposal', 'spec', 'design'] as const) {
      const hints = getSddPhase(id).handoffHints;
      expect(Array.isArray(hints)).toBe(true);
      expect((hints as string[]).length).toBeGreaterThan(0);
      for (const hint of hints as string[]) {
        expect(typeof hint).toBe('string');
      }
    }
  });

  test('deep-clones handoffHints so mutating the clone does not mutate the source', () => {
    const clone = getSddWorkflowContract();
    const specClone = clone.phases.find((phase) => phase.id === 'spec');
    expect(specClone?.handoffHints).toBeDefined();

    const originalLength = (getSddPhase('spec').handoffHints as string[])
      .length;
    (specClone?.handoffHints as string[]).push('mutated clone entry');

    // Source is unaffected by mutating the clone's array.
    expect((getSddPhase('spec').handoffHints as string[]).length).toBe(
      originalLength,
    );

    // A second clone is also pristine.
    const fresh = getSddWorkflowContract();
    const specFresh = fresh.phases.find((phase) => phase.id === 'spec');
    expect((specFresh?.handoffHints as string[]).length).toBe(originalLength);
  });
});
