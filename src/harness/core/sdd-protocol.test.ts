import { describe, expect, test } from 'vitest';
import {
  getSddPhaseProtocol,
  getSddPhaseProtocolsForRole,
  getSddWorkflowContract,
  renderSddPhaseDispatchEnvelope,
} from './sdd';

describe('SDD phase protocols', () => {
  test('defines a complete protocol for every phase', () => {
    for (const phase of getSddWorkflowContract().phases) {
      const protocol = getSddPhaseProtocol(phase.id);

      expect(protocol.id).toBe(phase.id);
      expect(protocol.objective).not.toBe('');
      expect(protocol.requiredInputs.length).toBeGreaterThan(0);
      expect(protocol.instructions.length).toBeGreaterThan(0);
      expect(protocol.allowedWrites.length).toBeGreaterThan(0);
      expect(protocol.outputSchema.length).toBeGreaterThan(0);
      expect(protocol.doneWhen.length).toBeGreaterThan(0);
      expect(protocol.blockingConditions.length).toBeGreaterThan(0);
      expect(protocol.handoff.length).toBeGreaterThan(0);
    }
  });

  test('gives selected plan review the blocker-only read-only gate', () => {
    const protocol = getSddPhaseProtocol('plan-review');
    const serialized = JSON.stringify(protocol);

    expect(protocol.requiredInputs).toEqual(
      expect.arrayContaining(['spec.md', 'plan.md', 'tasks.md']),
    );
    expect(serialized).toMatch(/coverage/i);
    expect(serialized).toMatch(/\[OKAY\]/);
    expect(serialized).toMatch(/\[REJECT\]/);
    expect(serialized).toMatch(/at most three|no more than three/i);
    expect(serialized).toMatch(/SHA-256/i);
    expect(serialized).toMatch(/completeness/i);
    expect(serialized).toMatch(/correctness/i);
    expect(serialized).toMatch(/coherence/i);
    expect(serialized).toMatch(/buildable/i);
    expect(serialized).toMatch(/outcome/i);
    expect(serialized).toMatch(/parallel group/i);
    expect(serialized).toMatch(/semantic independence/i);
    expect(serialized).toMatch(/lane.*owner/i);
    expect(serialized).toMatch(/prerequisite.*barrier/i);
    expect(serialized).toMatch(/native capacity/i);
    expect(serialized).toMatch(/dispatch-before-wait/i);
    expect(serialized).toMatch(/sequential fallback/i);
    expect(serialized).toMatch(/final.*verify|verify.*final/i);
    expect(protocol.allowedWrites).toEqual([
      'None; Oracle is read-only. Root persists plan-review.md when review runs.',
    ]);
  });

  test('makes specification deltas, story coverage, and SC type explicit', () => {
    const serialized = JSON.stringify(getSddPhaseProtocol('specify'));

    expect(serialized).toMatch(/why/i);
    expect(serialized).toMatch(/impact/i);
    expect(serialized).toMatch(/affected capabilities/i);
    expect(serialized).toMatch(/FR-###/);
    expect(serialized).toMatch(/ADDED/);
    expect(serialized).toMatch(/RENAMED/);
    expect(serialized).toMatch(/buildable/);
    expect(serialized).toMatch(/outcome/);
  });

  test('keeps task parallelism and domain checklists evidence-driven', () => {
    const tasks = JSON.stringify(getSddPhaseProtocol('tasks'));
    const checklist = JSON.stringify(getSddPhaseProtocol('checklist'));

    expect(tasks).toMatch(/buildable/i);
    expect(tasks).toMatch(/outcome/i);
    expect(tasks).toMatch(/no safe parallel/i);
    expect(checklist).toMatch(/activation reason/i);
    expect(checklist).toMatch(/domain lens/i);
    expect(checklist).toMatch(/revalidation/i);
  });

  test('keeps implementation ownership adaptive and task state root-owned', () => {
    const protocol = getSddPhaseProtocol('implement');
    const serialized = JSON.stringify(protocol);

    expect(serialized).toMatch(/root.*\[~\]/i);
    expect(serialized).toMatch(/root.*\[x\]/i);
    expect(serialized).toMatch(/child writers must not edit/i);
    expect(serialized).toMatch(/test-first|TDD/i);
    expect(serialized).toMatch(/assigned.*surface/i);
    expect(serialized).toMatch(/owner decision/i);
    expect(serialized).toMatch(/root owns implementation.*no child dispatch/i);
    expect(serialized).toMatch(
      /specialist owns implementation.*bounded dispatch/i,
    );
    expect(serialized).toMatch(/route.*not.*implementation ownership/i);
    expect(serialized).toMatch(/Direct.*no-artifact.*no task state/i);
    expect(serialized).toMatch(/route-.*risk-aware final-verification/i);
    expect(serialized).not.toMatch(/fresh Oracle for independent verify/i);
    expect(serialized).toMatch(/designer.*UI\/UX/i);
    expect(serialized).toMatch(/quick.*narrow.*low-risk/i);
    expect(serialized).toMatch(/deep.*coupled.*multi-file/i);
    expect(serialized).toMatch(/requirement anchors/i);
    expect(serialized).toMatch(/non-overlapping/i);
    expect(serialized).toMatch(/escalate/i);
    expect(serialized).not.toMatch(/Direct root work is limited/i);
  });

  test('allows same-intent artifact refinement without restarting the SDD', () => {
    const serialized = JSON.stringify(getSddPhaseProtocol('implement'));

    expect(serialized).toMatch(/same intent/i);
    expect(serialized).toMatch(/affected downstream/i);
    expect(serialized).toMatch(/new change.*intent changes/i);
  });

  test('restores a durable verification verdict for artifact-backed routes', () => {
    const protocol = getSddPhaseProtocol('verify');
    const serialized = JSON.stringify(protocol);

    expect(serialized).toMatch(/verify-report\.md/);
    expect(serialized).toMatch(/compliance matrix/i);
    expect(serialized).toMatch(/pass.*fail/i);
    expect(serialized).toMatch(/executed checks/i);
    expect(serialized).toMatch(/fail.*converge/i);
    expect(serialized).toMatch(/pass.*archive/i);
    expect(serialized).toMatch(/completeness/i);
    expect(serialized).toMatch(/correctness/i);
    expect(serialized).toMatch(/coherence/i);
  });

  test('describes archive as declared transactional synchronization, not implicit merge', () => {
    const contract = getSddWorkflowContract();
    const rules = contract.artifactRules.join(' ');

    expect(rules).toMatch(/declared durable/i);
    expect(rules).toMatch(/transactionally/i);
    expect(rules).toMatch(/active process/i);
    expect(rules).toMatch(/INTERNAL/i);
    expect(rules).not.toMatch(/never implicitly merges/i);
  });

  test('uses Spec Kit append-only convergence without editing product code', () => {
    const protocol = getSddPhaseProtocol('converge');
    const serialized = JSON.stringify(protocol);

    expect(serialized).toMatch(/append-only/i);
    expect(serialized).toMatch(/tasks\.md/);
    expect(serialized).toMatch(/must not edit product code/i);
    expect(serialized).toMatch(/tasks-appended/);
    expect(serialized).toMatch(/implement/);
    expect(serialized).toMatch(/missing/);
    expect(serialized).toMatch(/partial/);
    expect(serialized).toMatch(/contradicts/);
    expect(serialized).toMatch(/unrequested/);
    expect(serialized).toMatch(/byte-for-byte unchanged/i);
  });

  test('archives only verified work and syncs declared durable deltas', () => {
    const protocol = getSddPhaseProtocol('archive');
    const serialized = JSON.stringify(protocol);

    expect(serialized).toMatch(/all tasks.*complete/i);
    expect(serialized).toMatch(/verify-report\.md.*pass/i);
    expect(serialized).toMatch(/no unresolved critical/i);
    expect(serialized).toMatch(/archive-report\.md/);
    expect(serialized).toMatch(
      /openspec\/changes\/archive\/YYYY-MM-DD-<feature>\//,
    );
    expect(serialized).toMatch(/explicitly declared.*delta/i);
    expect(serialized).toMatch(/after.*pass/i);
    expect(serialized).toMatch(/transactionally/i);
    expect(serialized).toMatch(/active process/i);
    expect(serialized).toMatch(/openspec\/specs/i);
  });

  test('keeps verification eligibility route- and risk-aware', () => {
    expect(getSddPhaseProtocolsForRole('oracle').map(({ id }) => id)).toEqual([
      'plan-review',
      'verify',
    ]);
    expect(
      getSddPhaseProtocolsForRole('orchestrator').map(({ id }) => id),
    ).toEqual([
      'specify',
      'clarify',
      'plan',
      'checklist',
      'tasks',
      'implement',
      'verify',
      'converge',
      'archive',
    ]);
    expect(getSddPhaseProtocolsForRole('quick').map(({ id }) => id)).toEqual([
      'implement',
    ]);
  });
});

describe('SDD phase dispatch envelope', () => {
  test('combines the canonical phase protocol with run-specific context', () => {
    const envelope = renderSddPhaseDispatchEnvelope({
      phase: 'plan-review',
      route: 'full',
      changeName: 'phase-contracts',
      inputArtifacts: [
        'openspec/changes/phase-contracts/spec.md',
        'openspec/changes/phase-contracts/plan.md',
        'openspec/changes/phase-contracts/tasks.md',
      ],
      requirements: ['Respect the project constitution.'],
      boundaries: ['Do not modify the workspace.'],
      verification: ['Report requirement coverage as a percentage.'],
      memory: {
        provider: 'thoth-mem',
        project: 'thoth-agents',
        rootSessionId: 'root-session-123',
        authorization: 'observe',
        context: ['Prior decision: OpenSpec artifacts remain canonical.'],
      },
    });

    for (const heading of [
      'PHASE',
      'ROUTE / CHANGE',
      'OBJECTIVE',
      'INPUT ARTIFACTS',
      'REQUIREMENTS',
      'BOUNDARIES',
      'VERIFICATION',
      'EXPECTED OUTPUT',
      'HANDOFF',
      'MEMORY',
    ]) {
      expect(envelope).toContain(`## ${heading}`);
    }
    expect(envelope).toContain('plan-review');
    expect(envelope).toContain('full / phase-contracts');
    expect(envelope).toContain('spec.md');
    expect(envelope).toContain('Respect the project constitution.');
    expect(envelope).toContain('Do not modify the workspace.');
    expect(envelope).toContain('[OKAY] or [REJECT]');
    expect(envelope).toContain('provider=thoth-mem');
    expect(envelope).toContain('project=thoth-agents');
    expect(envelope).toContain('root_session_id=root-session-123');
    expect(envelope).toContain('authorization=observe');
    expect(envelope).toContain(
      'Prior decision: OpenSpec artifacts remain canonical.',
    );
  });

  test('renders unavailable stable identity explicitly instead of inventing one', () => {
    const envelope = renderSddPhaseDispatchEnvelope({
      phase: 'verify',
      route: 'direct',
      changeName: 'readme-fix',
      memory: {
        provider: 'thoth-mem',
        project: 'thoth-agents',
        authorization: 'none',
      },
    });

    expect(envelope).toContain('root_session_id=unavailable');
    expect(envelope).toContain('authorization=none');
    expect(envelope).toContain('- none');
  });

  test('rejects a required phase that does not belong to the selected route', () => {
    expect(() =>
      renderSddPhaseDispatchEnvelope({
        phase: 'archive',
        route: 'direct',
        changeName: 'readme-fix',
        memory: {
          provider: 'thoth-mem',
          project: 'thoth-agents',
          authorization: 'none',
        },
      }),
    ).toThrow('archive is not available in the direct route');
  });

  test('rejects artifact-dependent convergence for direct work', () => {
    expect(() =>
      renderSddPhaseDispatchEnvelope({
        phase: 'converge',
        route: 'direct',
        changeName: 'readme-fix',
        memory: {
          provider: 'thoth-mem',
          project: 'thoth-agents',
          authorization: 'none',
        },
      }),
    ).toThrow('converge is not available in the direct route');
  });
});
