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

  test('gives analyze the Spec Kit read-only consistency gate', () => {
    const protocol = getSddPhaseProtocol('analyze');
    const serialized = JSON.stringify(protocol);

    expect(protocol.requiredInputs).toEqual(
      expect.arrayContaining(['spec.md', 'plan.md', 'tasks.md']),
    );
    expect(serialized).toMatch(/coverage/i);
    expect(serialized).toMatch(/CRITICAL/);
    expect(serialized).toMatch(/readiness/i);
    expect(serialized).toMatch(/completeness/i);
    expect(serialized).toMatch(/correctness/i);
    expect(serialized).toMatch(/coherence/i);
    expect(serialized).toMatch(/buildable/i);
    expect(serialized).toMatch(/outcome/i);
    expect(protocol.allowedWrites).toEqual([
      'None; analysis is read-only and returns its report in-session.',
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

  test('keeps implementation task state root-owned and evidence-driven', () => {
    const protocol = getSddPhaseProtocol('implement');
    const serialized = JSON.stringify(protocol);

    expect(serialized).toMatch(/root.*\[~\]/i);
    expect(serialized).toMatch(/root.*\[x\]/i);
    expect(serialized).toMatch(/child writers must not edit/i);
    expect(serialized).toMatch(/test-first|TDD/i);
    expect(serialized).toMatch(/assigned.*surface/i);
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

  test('keeps root coordination separate from independent oracle review', () => {
    expect(getSddPhaseProtocolsForRole('oracle').map(({ id }) => id)).toEqual([
      'analyze',
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
      phase: 'analyze',
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
    ]) {
      expect(envelope).toContain(`## ${heading}`);
    }
    expect(envelope).toContain('analyze');
    expect(envelope).toContain('full / phase-contracts');
    expect(envelope).toContain('spec.md');
    expect(envelope).toContain('Respect the project constitution.');
    expect(envelope).toContain('Do not modify the workspace.');
    expect(envelope).toContain('readiness verdict');
  });

  test('rejects a required phase that does not belong to the selected route', () => {
    expect(() =>
      renderSddPhaseDispatchEnvelope({
        phase: 'archive',
        route: 'direct',
        changeName: 'readme-fix',
      }),
    ).toThrow('archive is not available in the direct route');
  });

  test('rejects artifact-dependent convergence for direct work', () => {
    expect(() =>
      renderSddPhaseDispatchEnvelope({
        phase: 'converge',
        route: 'direct',
        changeName: 'readme-fix',
      }),
    ).toThrow('converge is not available in the direct route');
  });
});
