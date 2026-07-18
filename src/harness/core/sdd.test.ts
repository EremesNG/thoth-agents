import { describe, expect, test } from 'vitest';
import {
  classifySddRoute,
  getRequiredSddPhaseOrder,
  getSddArtifactGraph,
  getSddPhaseOwner,
  getSddWorkflowContract,
} from './sdd';

describe('adaptive SDD routing', () => {
  test('routes a clear local README update directly', () => {
    expect(
      classifySddRoute({
        intent: 'documentation',
        scope: 'local',
        clarity: 'clear',
        contractRisk: 'low',
        failureCost: 'low',
      }),
    ).toMatchObject({
      route: 'direct',
      requiresUserInput: false,
    });
  });

  test('routes moderate bounded work to accelerated SDD', () => {
    expect(
      classifySddRoute({
        intent: 'behavior',
        scope: 'multi-file',
        clarity: 'clear',
        contractRisk: 'medium',
        failureCost: 'medium',
      }),
    ).toMatchObject({
      route: 'accelerated',
      requiresUserInput: false,
    });
  });

  test.each([
    ['explicit request', { explicitSdd: true }],
    ['uncertain scope', { clarity: 'uncertain' as const }],
    ['public contract risk', { contractRisk: 'high' as const }],
    ['high failure cost', { failureCost: 'high' as const }],
    ['cross-cutting scope', { scope: 'cross-cutting' as const }],
  ])('routes %s to full SDD', (_label, override) => {
    expect(
      classifySddRoute({
        intent: 'behavior',
        scope: 'local',
        clarity: 'clear',
        contractRisk: 'low',
        failureCost: 'low',
        ...override,
      }).route,
    ).toBe('full');
  });

  test('asks only when a material decision remains unresolved', () => {
    expect(
      classifySddRoute({
        intent: 'architecture',
        scope: 'cross-cutting',
        clarity: 'uncertain',
        contractRisk: 'high',
        failureCost: 'high',
      }),
    ).toMatchObject({
      route: 'full',
      requiresUserInput: true,
    });
  });
});

describe('Spec Kit workflow contract', () => {
  test('keeps direct work ceremony-free', () => {
    expect(getRequiredSddPhaseOrder('direct')).toEqual(['implement', 'verify']);
  });

  test('uses the minimal Spec Kit graph for accelerated SDD', () => {
    expect(getRequiredSddPhaseOrder('accelerated')).toEqual([
      'specify',
      'plan',
      'tasks',
      'implement',
      'verify',
    ]);
  });

  test('adds discovery and independent analysis only for full SDD', () => {
    expect(getRequiredSddPhaseOrder('full')).toEqual([
      'explore',
      'specify',
      'plan',
      'tasks',
      'analyze',
      'implement',
      'verify',
    ]);
  });

  test('models clarify, checklist, and converge as conditional gates', () => {
    const conditional = getSddWorkflowContract()
      .phases.filter((phase) => phase.activation === 'conditional')
      .map((phase) => phase.id);

    expect(conditional).toEqual(['clarify', 'checklist', 'converge']);
  });

  test('keeps architectural grilling as a conditional pre-specification gate, not an SDD phase', () => {
    const workflow = getSddWorkflowContract();
    const routingRules = workflow.routingRules.join('\n');

    expect(routingRules).toContain('architectural-grilling');
    expect(routingRules).toContain('explicitly requests');
    expect(routingRules).toContain(
      'material product or architecture decisions',
    );
    expect(routingRules).toContain('before specification');
    expect(workflow.phases.map(({ id }) => id)).not.toContain(
      'architectural-grilling',
    );
  });

  test('routes phases through the minimal hybrid agent roster', () => {
    const phases = getSddWorkflowContract().phases;
    const ownerOf = (id: string) =>
      phases.find((phase) => phase.id === id)?.defaultAgentRole;

    expect(ownerOf('explore')).toBe('explorer');
    expect(ownerOf('specify')).toBe('sdd-specify');
    expect(ownerOf('plan')).toBe('sdd-plan');
    expect(ownerOf('tasks')).toBe('sdd-tasks');
    expect(ownerOf('analyze')).toBe('oracle');
    expect(ownerOf('verify')).toBe('oracle');
    expect(ownerOf('implement')).toBe('orchestrator');
  });

  test('keeps bounded verification in the adaptive root and reserves independent review for full SDD', () => {
    expect(getSddPhaseOwner('direct', 'verify')).toBe('orchestrator');
    expect(getSddPhaseOwner('accelerated', 'verify')).toBe('orchestrator');
    expect(getSddPhaseOwner('full', 'verify')).toBe('oracle');
  });

  test('does not reference phase skills or a mandatory interview', () => {
    const serialized = JSON.stringify(getSddWorkflowContract());

    expect(serialized).not.toContain('artifactSkill');
    expect(serialized).not.toContain('requirements-interview');
    expect(serialized).not.toContain('sdd-propose');
  });

  test('uses Spec Kit artifacts inside the governed openspec store', () => {
    expect(getSddArtifactGraph()).toEqual([
      {
        id: 'spec',
        path: 'spec.md',
        producedBy: 'specify',
        consumes: [],
        requiredFor: ['accelerated', 'full'],
      },
      {
        id: 'plan',
        path: 'plan.md',
        producedBy: 'plan',
        consumes: ['spec'],
        requiredFor: ['accelerated', 'full'],
      },
      {
        id: 'tasks',
        path: 'tasks.md',
        producedBy: 'tasks',
        consumes: ['spec', 'plan'],
        requiredFor: ['accelerated', 'full'],
      },
      {
        id: 'requirements-checklist',
        path: 'checklists/requirements.md',
        producedBy: 'checklist',
        consumes: ['spec'],
        requiredFor: [],
      },
      {
        id: 'research',
        path: 'research.md',
        producedBy: 'plan',
        consumes: ['spec'],
        requiredFor: [],
      },
      {
        id: 'data-model',
        path: 'data-model.md',
        producedBy: 'plan',
        consumes: ['spec'],
        requiredFor: [],
      },
      {
        id: 'contracts',
        path: 'contracts/',
        producedBy: 'plan',
        consumes: ['spec'],
        requiredFor: [],
      },
      {
        id: 'quickstart',
        path: 'quickstart.md',
        producedBy: 'plan',
        consumes: ['spec', 'plan'],
        requiredFor: [],
      },
    ]);
  });
});
