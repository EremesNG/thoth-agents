import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import {
  canEnterSddPhase,
  classifySddChange,
  getSddFinalVerificationDecision,
  getSddPhase,
  getSddPhaseProtocol,
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
  test('keeps failed small work recordless and independent review mandatory under direct work', () => {
    const skill = readFileSync('skills/thoth-sdd/SKILL.md', 'utf8').replace(
      /\s+/g,
      ' ',
    );
    for (const rule of [
      'Plan review OKAY/REJECT judges the record; root repairs REJECT.',
      'Final verification PASS/FAIL judges the implementation.',
      'otherwise in the brief in-session small plan',
      'owning Worker or Designer repairs each affected surface',
      'unless the user explicitly instructs direct work',
      'never self-approve and report unavailable independent review',
      "Repeat independent verification as the change's verification level requires",
      'Material changes in intent, scope or risk reopen understanding and planning before further implementation',
    ])
      expect.soft(skill).toContain(rule);
    expect(getSddRequiredPhaseOrder({ classification: 'small' })).not.toContain(
      'converge',
    );
    expect(
      getSddFinalVerificationDecision({
        classification: 'small',
        risk: 'medium',
      }),
    ).toEqual({
      verificationRequired: true,
      independent: true,
      owner: 'oracle',
    });
  });

  test('keeps record authorship, optional review repair, and small-work planning with root', () => {
    const skill = readFileSync(
      new URL('../../../skills/thoth-sdd/SKILL.md', import.meta.url),
      'utf8',
    ).replace(/\s+/g, ' ');
    for (const rule of [
      'Root is the sole record author at every stage: it creates, edits, validates and corrects the record.',
      'During planning, specialists supply context within their full role scope; root never assigns them to create, modify or correct SDD files.',
      'Implementation writers start only after authorization and never write `.thoth/changes/`.',
      'Before delegating or implementing, root states a brief in-session plan (scope, owner, focused verification)',
      'On selected plan-review `REJECT`, root repairs the same record, reruns affected gates and sends it to a fresh Oracle until `OKAY` or a human-owned material blocker stops the round.',
      '`Review plan with Oracle (Recommended)` or `Proceed without review`',
      '`EXPLICIT_REVIEW`, `EXPLICIT_SKIP`, or `DEFAULT_REVIEW_AFTER_3`',
      '`Implement (Recommended)` / `Stop`',
    ])
      expect.soft(skill).toContain(rule);
  });

  test('keeps SDD understanding and implementation ownership subject to root delegation policy', () => {
    const skill = readFileSync(
      new URL('../../../skills/thoth-sdd/SKILL.md', import.meta.url),
      'utf8',
    );
    expect
      .soft(skill)
      .toMatch(
        /root orchestrator owns completing these steps.*discovery ownership follows the root delegation policy/is,
      );
    expect
      .soft(skill)
      .not.toContain('The root orchestrator performs these steps');
    expect
      .soft(skill)
      .toMatch(
        /specialist-default ownership and\s+bounded direct-work exceptions/i,
      );
    expect.soft(skill).not.toMatch(/no specialist\s+is mandatory/i);
    expect.soft(skill).not.toContain('net gain');
    expect
      .soft(getSddPhaseProtocol('implement').instructions.join(' '))
      .not.toContain('net gain');
  });

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
    const withoutExemptPhrases = (wording: string) =>
      wording.replace(/\b(?:direct work|direct-work|full role scope)\b/gi, '');
    const rejectedRoute = /\b(?:direct|accelerated|full)\b|--route/i;
    for (const [wording, rejected] of [
      ['Direct is the route for tiny changes', true],
      ['accelerated', true],
      ['"route":"full"', true],
      ['Full routes remain available', true],
      ['Full workflows remain available', true],
      ['direct workforce', true],
      ['full role scopes', true],
      ['direct work; Full routes remain available', true],
    ] as const) {
      expect
        .soft(rejectedRoute.test(withoutExemptPhrases(wording)), wording)
        .toBe(rejected);
    }
    for (const currentWording of [
      'Root coordinates and does not repair implementation unless the user explicitly instructs direct work.',
      'During planning, specialists supply only context within their full role scope; never assign them to create, modify or correct SDD files.',
      'Explicit direct-work or no-delegation instructions win.',
      'DIRECT WORK, DIRECT-WORK, FULL ROLE SCOPE.',
    ]) {
      expect(withoutExemptPhrases(currentWording)).not.toMatch(rejectedRoute);
    }
    expect(withoutExemptPhrases(serialized)).not.toMatch(rejectedRoute);
  });
});
