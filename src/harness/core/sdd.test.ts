import { describe, expect, test } from 'vitest';
import {
  canEnterSddPhase,
  classifySddRoute,
  getRequiredSddPhaseOrder,
  getSddArtifactGraph,
  getSddPhaseOwner,
  getSddRouteExecutionPolicy,
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
      requiresUserInput: true,
    });
  });

  test.each([
    'documentation',
    'mechanical',
  ] as const)('keeps clear low-risk multi-file %s work direct', (intent) => {
    expect(
      classifySddRoute({
        intent,
        scope: 'multi-file',
        clarity: 'clear',
        contractRisk: 'low',
        failureCost: 'low',
      }),
    ).toMatchObject({
      route: 'direct',
      requiresUserInput: true,
    });
  });

  test('uses accelerated SDD for clear multi-file behavior work', () => {
    expect(
      classifySddRoute({
        intent: 'behavior',
        scope: 'multi-file',
        clarity: 'clear',
        contractRisk: 'low',
        failureCost: 'low',
      }),
    ).toMatchObject({
      route: 'accelerated',
      requiresUserInput: true,
    });
  });

  test('treats a generic SDD request as accelerated unless risk requires full', () => {
    expect(
      classifySddRoute({
        intent: 'documentation',
        scope: 'local',
        clarity: 'clear',
        contractRisk: 'low',
        failureCost: 'low',
        sddRequested: true,
      }),
    ).toMatchObject({
      route: 'accelerated',
      requiresUserInput: true,
    });
  });

  test.each([
    'direct',
    'accelerated',
    'full',
  ] as const)('honors an explicit %s route selection', (requestedRoute) => {
    expect(
      classifySddRoute({
        intent: 'architecture',
        scope: 'cross-cutting',
        clarity: 'clear',
        contractRisk: 'high',
        failureCost: 'high',
        requestedRoute,
      }),
    ).toMatchObject({
      route: requestedRoute,
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
      requiresUserInput: true,
    });
  });

  test.each([
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

  test('requires user input when a recommended route has not been selected', () => {
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
  test('keeps Direct free of planning artifacts and scripted gates', () => {
    expect(getSddRouteExecutionPolicy('direct')).toMatchObject({
      planningMode: 'none',
      validationGates: [],
      optionalArtifactsByDefault: false,
      routineUserPauses: false,
    });
  });

  test('fast-forwards Accelerated planning with only two planning gates', () => {
    expect(getSddRouteExecutionPolicy('accelerated')).toMatchObject({
      planningMode: 'fast-forward',
      validationGates: ['specify', 'ready', 'closeout'],
      optionalArtifactsByDefault: false,
      routineUserPauses: true,
      artifactRevisionPolicy: 'revalidate-affected-downstream',
    });
  });

  test('keeps Full gated without phase-locking artifact corrections', () => {
    expect(getSddRouteExecutionPolicy('full')).toMatchObject({
      planningMode: 'gated',
      validationGates: ['specify', 'plan', 'tasks', 'ready', 'closeout'],
      routineUserPauses: true,
      artifactRevisionPolicy: 'revalidate-affected-downstream',
    });
  });

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
      'archive',
    ]);
  });

  test('adds discovery only for full while plan review stays optional', () => {
    expect(getRequiredSddPhaseOrder('full')).toEqual([
      'explore',
      'specify',
      'plan',
      'tasks',
      'implement',
      'verify',
      'archive',
    ]);
  });

  test('models clarify, checklist, plan review, and converge as conditional gates', () => {
    const conditional = getSddWorkflowContract()
      .phases.filter((phase) => phase.activation === 'conditional')
      .map((phase) => phase.id);

    expect(conditional).toEqual([
      'clarify',
      'checklist',
      'plan-review',
      'converge',
    ]);
  });

  test('keeps artifact-dependent conditional phases out of the direct route', () => {
    for (const target of [
      'clarify',
      'checklist',
      'plan-review',
      'converge',
    ] as const) {
      expect(
        canEnterSddPhase({
          route: 'direct',
          completed: ['implement', 'verify'],
          target,
        }),
      ).toBe(false);
    }
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

  test('keeps coordination in root and implementation ownership adaptive', () => {
    const phases = getSddWorkflowContract().phases;
    const ownerOf = (id: string) =>
      phases.find((phase) => phase.id === id)?.defaultAgentRole;

    expect(ownerOf('explore')).toBe('explorer');
    expect(ownerOf('specify')).toBe('orchestrator');
    expect(ownerOf('clarify')).toBe('orchestrator');
    expect(ownerOf('plan')).toBe('orchestrator');
    expect(ownerOf('checklist')).toBe('orchestrator');
    expect(ownerOf('tasks')).toBe('orchestrator');
    expect(ownerOf('plan-review')).toBe('oracle');
    expect(ownerOf('verify')).toBe('oracle');
    expect(ownerOf('implement')).toBe('adaptive-implementation');
    expect(ownerOf('converge')).toBe('orchestrator');
    expect(ownerOf('archive')).toBe('orchestrator');
  });

  test('assigns selected plan review and every verification to oracle', () => {
    expect(getSddPhaseOwner('direct', 'verify')).toBe('oracle');
    expect(getSddPhaseOwner('accelerated', 'verify')).toBe('oracle');
    expect(getSddPhaseOwner('full', 'verify')).toBe('oracle');
    expect(getSddPhaseOwner('accelerated', 'plan-review')).toBe('oracle');
    expect(getSddPhaseOwner('full', 'plan-review')).toBe('oracle');
  });

  test.each([
    'direct',
    'accelerated',
    'full',
  ] as const)('uses one adaptive implementation owner under %s', (route) => {
    expect(getSddPhaseOwner(route, 'implement')).toBe(
      'adaptive-implementation',
    );
  });

  test('allows review or skip after planning and still gates convergence and archive', () => {
    expect(
      canEnterSddPhase({
        route: 'full',
        completed: ['explore', 'specify', 'plan', 'tasks'],
        target: 'implement',
      }),
    ).toBe(true);
    expect(
      canEnterSddPhase({
        route: 'accelerated',
        completed: ['specify', 'plan'],
        target: 'plan-review',
      }),
    ).toBe(false);
    expect(
      canEnterSddPhase({
        route: 'accelerated',
        completed: ['specify', 'plan', 'tasks'],
        target: 'plan-review',
      }),
    ).toBe(true);
    expect(
      canEnterSddPhase({
        route: 'full',
        completed: ['explore', 'specify', 'plan', 'tasks'],
        target: 'plan-review',
      }),
    ).toBe(true);
    expect(
      canEnterSddPhase({
        route: 'accelerated',
        completed: ['specify', 'plan', 'tasks', 'implement'],
        target: 'converge',
      }),
    ).toBe(false);
    expect(
      canEnterSddPhase({
        route: 'accelerated',
        completed: ['specify', 'plan', 'tasks', 'implement', 'verify'],
        target: 'converge',
      }),
    ).toBe(true);
    expect(
      canEnterSddPhase({
        route: 'accelerated',
        completed: ['specify', 'plan', 'tasks', 'implement'],
        target: 'archive',
      }),
    ).toBe(false);
    expect(
      canEnterSddPhase({
        route: 'accelerated',
        completed: ['specify', 'plan', 'tasks', 'implement', 'verify'],
        target: 'archive',
      }),
    ).toBe(true);
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
      {
        id: 'plan-review',
        path: 'plan-review.md',
        producedBy: 'plan-review',
        consumes: ['spec', 'plan', 'tasks'],
        requiredFor: [],
      },
      {
        id: 'verify-report',
        path: 'verify-report.md',
        producedBy: 'verify',
        consumes: ['spec', 'plan', 'tasks'],
        requiredFor: ['accelerated', 'full'],
      },
      {
        id: 'archive-report',
        path: 'archive-report.md',
        producedBy: 'archive',
        consumes: ['spec', 'plan', 'tasks', 'verify-report'],
        requiredFor: ['accelerated', 'full'],
      },
    ]);
  });
});
