import { describe, expect, test } from 'vitest';
import {
  canEnterSddPhase,
  classifySddChange,
  getSddFinalVerificationDecision,
  getSddPhase,
  getSddRequiredPhaseOrder,
  getSddWorkflowContract,
  SDD_UNDERSTANDING_PHASES,
} from './sdd';

const settledUnderstanding = {
  completed: ['explore', 'specify', 'clarify'] as const,
  clarification: 'not-needed' as const,
};
const classify = (
  overrides: Partial<Parameters<typeof classifySddChange>[0]> = {},
) =>
  classifySddChange({
    scope: 'local',
    uncertainty: 'low',
    risk: 'low',
    understanding: settledUnderstanding,
    ...overrides,
  });

describe('proportional SDD classification', () => {
  test('requires explore, specify, and clarify in order before classification', () => {
    expect(() =>
      classify({
        understanding: { completed: [], clarification: 'not-needed' },
      }),
    ).toThrow(/explore.*specify.*clarify/i);
    expect(() =>
      classify({
        understanding: {
          completed: ['explore', 'clarify'],
          clarification: 'not-needed',
        },
      }),
    ).toThrow(/specify/i);
    expect(() =>
      classify({
        understanding: {
          completed: ['explore', 'specify', 'clarify'],
          clarification: 'unresolved',
        },
      }),
    ).toThrow(/material.*clarification/i);
  });

  test('keeps every understanding phase lightweight without forcing artifacts, agents, or interviews', () => {
    expect(SDD_UNDERSTANDING_PHASES.map(({ id }) => id)).toEqual([
      'explore',
      'specify',
      'clarify',
    ]);
    for (const phase of SDD_UNDERSTANDING_PHASES) {
      expect(phase).toMatchObject({
        requiredForClassification: true,
        artifactRequired: false,
        agentRequired: false,
        interviewRequired: false,
      });
    }
  });

  test('classifies clear low-risk localized mechanical work across multiple files as small', () => {
    const decision = classify({ scope: 'local' });
    expect(decision).toMatchObject({
      classification: 'small',
      scope: 'local',
      planningRequired: false,
      recordRequired: false,
      independentVerificationRequired: false,
    });
    expect(getSddRequiredPhaseOrder(decision)).toEqual([
      'explore',
      'specify',
      'clarify',
      'implement',
      'verify',
    ]);
    expect(getSddWorkflowContract().classificationRules.join('\n')).toMatch(
      /file count alone.*not.*scope|multiple files.*local/i,
    );
  });

  test.each([
    ['medium risk on a local patch', { risk: 'medium' as const }],
    ['high risk on a local patch', { risk: 'high' as const }],
    ['uncertainty on a local patch', { uncertainty: 'medium' as const }],
    ['coordinated multi-area scope', { scope: 'coordinated' as const }],
    ['cross-cutting scope', { scope: 'cross-cutting' as const }],
  ])('requires planning and one record for %s', (_label, overrides) => {
    const decision = classify(overrides);
    expect(decision).toMatchObject({
      classification: 'substantial',
      planningRequired: true,
      recordRequired: true,
      independentVerificationRequired: true,
    });
    expect(getSddRequiredPhaseOrder(decision)).toEqual([
      'explore',
      'specify',
      'clarify',
      'plan',
      'tasks',
      'implement',
      'verify',
      'archive',
    ]);
  });
});

describe('phase and verification contract', () => {
  test('uses one ID-named record only after classification establishes substantial work', () => {
    const contract = getSddWorkflowContract();
    expect(contract).toMatchObject({
      recordRoot: '.thoth/changes/<id>/',
      recordPath: '.thoth/changes/<id>/<id>.md',
    });
    expect(contract.artifactRules.join('\n')).toMatch(/one.*<id>\.md/i);
    expect(contract.artifactRules.join('\n')).toMatch(/small.*no record/i);
    expect(contract.artifactRules.join('\n')).toMatch(/substantial.*record/i);
  });

  test('gates plan on settled understanding but validates it before tasks exist', () => {
    const substantial = classify({ risk: 'high' });
    expect(
      canEnterSddPhase({
        classification: substantial,
        completed: ['explore', 'specify', 'clarify'],
        target: 'plan',
      }),
    ).toBe(true);
    expect(
      canEnterSddPhase({
        classification: substantial,
        completed: ['explore', 'specify', 'clarify'],
        target: 'tasks',
      }),
    ).toBe(false);
    expect(
      canEnterSddPhase({
        classification: substantial,
        completed: ['explore', 'specify', 'clarify', 'plan'],
        target: 'tasks',
      }),
    ).toBe(true);
    expect(getSddPhase('plan').prerequisites).toEqual([
      'explore',
      'specify',
      'clarify',
    ]);
  });

  test('keeps optional checklist and plan review out of the implementation prerequisite chain', () => {
    const substantial = classify({ scope: 'coordinated' });
    const completed = [
      'explore',
      'specify',
      'clarify',
      'plan',
      'tasks',
    ] as const;
    expect(
      canEnterSddPhase({
        classification: substantial,
        completed,
        target: 'implement',
      }),
    ).toBe(true);
    expect(
      canEnterSddPhase({
        classification: substantial,
        completed,
        target: 'checklist',
      }),
    ).toBe(true);
    expect(
      canEnterSddPhase({
        classification: substantial,
        completed: [...completed, 'implement', 'verify'],
        target: 'archive',
      }),
    ).toBe(true);
    expect(
      canEnterSddPhase({
        classification: classify(),
        completed: ['explore', 'specify', 'clarify', 'implement', 'verify'],
        target: 'archive',
      }),
    ).toBe(false);
  });

  test('keeps verification mandatory and independent for substantial or elevated-risk work', () => {
    expect(
      getSddFinalVerificationDecision({
        classification: 'small',
        risk: 'low',
      }),
    ).toEqual({
      verificationRequired: true,
      independent: false,
      owner: 'orchestrator',
    });
    expect(
      getSddFinalVerificationDecision({
        classification: 'substantial',
        risk: 'low',
      }),
    ).toEqual({
      verificationRequired: true,
      independent: true,
      owner: 'oracle',
    });
    expect(
      getSddFinalVerificationDecision({
        classification: 'small',
        risk: 'high',
      }).independent,
    ).toBe(true);
  });

  test('keeps orchestration proportional and route-independent', () => {
    const serialized = JSON.stringify(getSddWorkflowContract());
    expect(serialized).toMatch(/scope.*uncertainty.*risk/i);
    expect(serialized).toMatch(/human.*material/i);
    expect(serialized).not.toMatch(/\b(?:direct|accelerated|full)\b|--route/i);
  });
});
