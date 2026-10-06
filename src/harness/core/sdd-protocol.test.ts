import { describe, expect, test } from 'vitest';
import {
  getSddPhase,
  getSddPhaseProtocol,
  getSddWorkflowContract,
  SDD_UNDERSTANDING_PHASES,
} from './sdd';

const text = (phase: Parameters<typeof getSddPhaseProtocol>[0]) =>
  JSON.stringify(getSddPhaseProtocol(phase));

describe('proportional SDD phase protocols', () => {
  test('provides a complete protocol for every phase', () => {
    for (const phase of getSddWorkflowContract().phases) {
      const protocol = getSddPhaseProtocol(phase.id);
      expect(protocol.id).toBe(phase.id);
      expect(protocol.requiredInputs.length).toBeGreaterThan(0);
      expect(protocol.instructions.length).toBeGreaterThan(0);
      expect(protocol.doneWhen.length).toBeGreaterThan(0);
      expect(protocol.blockingConditions.length).toBeGreaterThan(0);
    }
  });

  test('requires proportional explore, specify, and clarify without forced records or agents', () => {
    expect(SDD_UNDERSTANDING_PHASES.map(({ id }) => id)).toEqual([
      'explore',
      'specify',
      'clarify',
    ]);
    expect(text('explore')).toMatch(/repository evidence.*proportion/i);
    expect(text('specify')).toMatch(/intent.*acceptance/i);
    expect(text('clarify')).toMatch(/material.*unresolved/i);
    for (const phase of SDD_UNDERSTANDING_PHASES) {
      expect(phase.artifactRequired).toBe(false);
      expect(phase.agentRequired).toBe(false);
      expect(phase.interviewRequired).toBe(false);
      expect(text(phase.id)).toMatch(
        /no document, agent, or interview is forced in this phase/i,
      );
    }
  });

  test('plans only after understanding and stores one substantial record at its ID path', () => {
    const workflow = getSddWorkflowContract();
    expect(workflow.recordPath).toBe('.thoth/changes/<id>/<id>.md');
    expect(getSddPhase('plan').prerequisites).toEqual([
      'explore',
      'specify',
      'clarify',
    ]);
    expect(getSddPhase('plan').producesArtifact).toBe(true);
    expect(getSddPhase('tasks').prerequisites).toEqual(['plan']);
    expect(text('plan')).toMatch(/substantial.*only.*\.thoth\/changes\//i);
    expect(text('plan')).toMatch(/tasks.*checked later/i);
    expect(text('plan')).not.toMatch(/tasks.*required before plan/i);
    expect(text('tasks')).toMatch(/cover every accepted outcome/i);
  });

  test('shapes phase work around accepted outcomes, concrete dependencies, and bounded returns', () => {
    const explore = text('explore');
    expect(explore).toMatch(
      /root owns.*understanding.*acceptance.*specific discovery ownership.*who gathers evidence/i,
    );
    expect(explore).toMatch(/independent.*questions.*parallel/i);
    expect(explore).toMatch(/dependent.*wait.*accepted/i);
    expect(explore).toMatch(/do not duplicate discovery/i);

    const plan = text('plan');
    expect(plan).toMatch(/concrete inputs.*outputs.*dependencies/i);
    expect(plan).toMatch(/owned writes.*interface boundaries/i);
    expect(plan).toMatch(/focused checks.*pass evidence/i);
    expect(plan).toMatch(/return milestone.*stop condition/i);

    const tasks = text('tasks');
    expect(tasks).toMatch(/one independently acceptable outcome/i);
    expect(tasks).toMatch(/concrete inputs.*outputs.*dependencies/i);
    expect(tasks).toMatch(/owned writes.*interface boundaries/i);
    expect(tasks).toMatch(/focused checks.*pass evidence/i);
    expect(tasks).toMatch(/meaningful return milestone.*stop condition/i);
    expect(tasks).toMatch(/split.*separately acceptable outcomes/i);
    expect(tasks).toMatch(/tiny cohesive mechanical work.*together/i);
    expect(tasks).toMatch(/root accepts.*producer.*consumer/i);

    const implement = text('implement');
    expect(implement).toMatch(/new independent outcome.*bounded progress/i);
    expect(implement).toMatch(/missing interface.*ownership conflict/i);
    expect(implement).toMatch(/root reassessment before expansion/i);
  });

  test('keeps optional review separate from authorization and final verification', () => {
    const review = text('plan-review');
    expect(getSddPhase('plan-review').activation).toBe('conditional');
    expect(review).toMatch(/optional.*after.*plan/i);
    expect(review).toMatch(
      /at ready.*always offer.*Review plan with Oracle \(Recommended\).*Implement directly without review/i,
    );
    expect(review).toMatch(
      /at ready, first show the user .*plan summary.*then always offer/i,
    );
    expect(review).toMatch(
      /first and second confirmed empty native returns.*repeat the same question.*no dependent work/i,
    );
    expect(review).toMatch(
      /third confirmed empty native return.*choose the recommendation/i,
    );
    expect(review).toMatch(
      /unavailable, failed, interrupted or host-prohibited questions do not count/i,
    );
    expect(review).toMatch(
      /host or tool rules prevent.*report the limitation/i,
    );
    expect(review).toMatch(
      /EXPLICIT_REVIEW.*EXPLICIT_SKIP.*DEFAULT_REVIEW_AFTER_3.*separate from implementation authorization/i,
    );
    expect(review).toMatch(/implementation.*separate/i);
    expect(review).toMatch(/fresh.*final verification/i);
    expect(text('implement')).toMatch(/test-first|TDD|red before green/i);
    expect(text('implement')).toMatch(/one writer/i);
    expect(text('verify')).toMatch(/independent.*substantial/i);
    expect(text('verify')).toMatch(/actual.*diff.*checks.*risks/i);
    expect(text('archive')).toMatch(/fail-closed/i);
    expect(text('archive')).toMatch(/transactionally/i);
  });

  test('keeps material clarification blockers explicit before classification', () => {
    expect(text('clarify')).toMatch(
      /unresolved material.*blocks classification/i,
    );
    expect(text('clarify')).toMatch(/safe.*assumption/i);
    expect(text('clarify')).not.toMatch(/mandatory interview/i);
  });

  test('uses stable archive naming and prevents duplicate record artifacts', () => {
    const workflow = getSddWorkflowContract();
    expect(workflow.artifactRules.join('\n')).toMatch(
      /archive\/YYYY-MM-DD-<id>\/.*<id>\.md/i,
    );
    expect(workflow.artifactRules.join('\n')).toMatch(/filename.*stable/i);
    expect(workflow.artifactRules.join('\n')).toMatch(/no alias|no extra/i);
  });

  test('contains no rejected route vocabulary or machine-facing route contract', () => {
    const serialized = JSON.stringify(getSddWorkflowContract());
    expect(serialized).not.toMatch(/\b(?:direct|accelerated|full)\b|--route/i);
    expect(serialized).not.toContain('requestedRoute');
  });
});
