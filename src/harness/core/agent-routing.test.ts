import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import {
  claudeCodeAdapter,
  renderClaudeCodeRootInstructions,
} from '../adapters/claude-code';
import { codexAdapter, renderCodexRootInstructions } from '../adapters/codex';
import { renderOpenCodeAgentConfigs } from '../adapters/opencode';
import type { HarnessId } from '../types';
import {
  AGENT_RETURN_CONTRACT,
  type AgentRoleName,
  getAgentPackContract,
  getAgentRole,
  renderAgentRoutingDescription,
} from './agent-pack';
import { getSddPhaseOwner } from './sdd';

type RoutingCase = {
  id: string;
  expectedOwner: AgentRoleName;
  forbiddenOwners: AgentRoleName[];
  ownerTrigger: RegExp;
  route?: 'direct' | 'accelerated' | 'full';
  phase?: 'explore' | 'implement' | 'verify';
  phaseOwner?: AgentRoleName | 'adaptive-implementation';
};

const ROUTING_CASES: RoutingCase[] = [
  {
    id: 'writer-designer-ui',
    expectedOwner: 'designer',
    forbiddenOwners: ['orchestrator', 'quick', 'deep'],
    ownerTrigger: /user-facing UI\/UX|visual quality/i,
    route: 'direct',
    phase: 'implement',
    phaseOwner: 'adaptive-implementation',
  },
  {
    id: 'writer-deep-correctness',
    expectedOwner: 'deep',
    forbiddenOwners: ['orchestrator', 'designer', 'quick'],
    ownerTrigger:
      /multi-file, edge-case-heavy, migration, concurrency, shared-contract, or high-risk/i,
    route: 'direct',
    phase: 'implement',
    phaseOwner: 'adaptive-implementation',
  },
  {
    id: 'writer-quick-known',
    expectedOwner: 'quick',
    forbiddenOwners: ['orchestrator', 'designer', 'deep'],
    ownerTrigger: /known narrow mechanical low-risk/i,
    route: 'accelerated',
    phase: 'implement',
    phaseOwner: 'adaptive-implementation',
  },
  {
    id: 'root-accelerated-continuity',
    expectedOwner: 'orchestrator',
    forbiddenOwners: ['designer', 'quick', 'deep'],
    ownerTrigger:
      /accumulated context and continuity outweigh delegation overhead/i,
    route: 'accelerated',
    phase: 'implement',
    phaseOwner: 'adaptive-implementation',
  },
  {
    id: 'root-full-continuity',
    expectedOwner: 'orchestrator',
    forbiddenOwners: ['designer', 'quick', 'deep'],
    ownerTrigger:
      /accumulated context and continuity outweigh delegation overhead/i,
    route: 'full',
    phase: 'implement',
    phaseOwner: 'adaptive-implementation',
  },
  {
    id: 'read-explorer-discovery',
    expectedOwner: 'explorer',
    forbiddenOwners: ['orchestrator', 'designer', 'deep'],
    ownerTrigger: /repository ownership or behavior is broad or uncertain/i,
    route: 'full',
    phase: 'explore',
    phaseOwner: 'explorer',
  },
  {
    id: 'read-librarian-external',
    expectedOwner: 'librarian',
    forbiddenOwners: ['orchestrator', 'quick', 'deep'],
    ownerTrigger: /current authoritative external evidence is required/i,
  },
  {
    id: 'read-oracle-verification',
    expectedOwner: 'oracle',
    forbiddenOwners: ['orchestrator', 'designer', 'quick'],
    ownerTrigger: /selected plan review, diagnosis, or final verification/i,
    route: 'full',
    phase: 'verify',
    phaseOwner: 'oracle',
  },
];

const ROUTING_FIXTURE = JSON.parse(
  readFileSync(
    new URL('../../../docs/agent/routing-cases.json', import.meta.url),
    'utf8',
  ),
) as {
  cases: Array<{
    id: string;
    task: string;
    route?: 'direct' | 'accelerated' | 'full';
    phase?: 'explore' | 'implement' | 'verify';
    expected_owner?: AgentRoleName;
    forbidden_owners?: AgentRoleName[];
    delegation_net_gain?: boolean;
    ownership_rationale?: string;
  }>;
};

const ACTIVE_OWNERSHIP_POLICY_PATHS = [
  'AGENTS.md',
  'skills/thoth-sdd/SKILL.md',
  'skills/thoth-sdd/references/phases/implement.md',
  'docs/agent/agents-and-delegation.md',
  'docs/sdd-pipeline.md',
] as const;

type RenderedSurface = {
  harness: HarnessId;
  root: string;
  role: (role: AgentRoleName) => string;
};

function renderRoutingSurfaces(): RenderedSurface[] {
  const openCode = renderOpenCodeAgentConfigs();
  const codex = codexAdapter.render({ projectRoot: process.cwd() });
  const claude = claudeCodeAdapter.render({ projectRoot: process.cwd() });

  return [
    {
      harness: 'opencode',
      root: String(openCode.orchestrator?.prompt ?? ''),
      role: (role) => JSON.stringify(openCode[role] ?? {}),
    },
    {
      harness: 'codex',
      root: renderCodexRootInstructions(),
      role: (role) =>
        codex.artifacts
          .filter((artifact) => artifact.path.includes(`-${role}.toml`))
          .map((artifact) => String(artifact.content))
          .join('\n'),
    },
    {
      harness: 'claude',
      root: renderClaudeCodeRootInstructions(),
      role: (role) =>
        claude.artifacts
          .filter((artifact) => artifact.path.endsWith(`${role}.md`))
          .map((artifact) => String(artifact.content))
          .join('\n'),
    },
  ];
}

describe('canonical agent routing', () => {
  test.each(
    ROUTING_CASES,
  )('$id selects one exact owner and rejects forbidden alternatives across shared and generated surfaces', (routingCase) => {
    const documentedCase = ROUTING_FIXTURE.cases.find(
      ({ id }) => id === routingCase.id,
    );
    const contract = getAgentPackContract();
    const candidates = contract.roles.filter((role) =>
      routingCase.ownerTrigger.test(role.useWhen.join(' ')),
    );

    expect(documentedCase).toMatchObject({
      ...(routingCase.route ? { route: routingCase.route } : {}),
      ...(routingCase.phase ? { phase: routingCase.phase } : {}),
      expected_owner: routingCase.expectedOwner,
      forbidden_owners: routingCase.forbiddenOwners,
    });
    expect(candidates.map(({ name }) => name)).toEqual([
      routingCase.expectedOwner,
    ]);
    for (const forbidden of routingCase.forbiddenOwners) {
      expect(candidates.map(({ name }) => name)).not.toContain(forbidden);
      expect(getAgentRole(forbidden).doNotUseWhen.length).toBeGreaterThan(0);
    }

    if (routingCase.route && routingCase.phase && routingCase.phaseOwner) {
      expect(getSddPhaseOwner(routingCase.route, routingCase.phase)).toBe(
        routingCase.phaseOwner,
      );
    }

    const expectedDescription = renderAgentRoutingDescription(
      getAgentRole(routingCase.expectedOwner),
    );
    expect(expectedDescription).toContain('Use when:');
    expect(expectedDescription).toContain('Do not use when:');
    expect(documentedCase?.task.length).toBeGreaterThan(30);

    for (const surface of renderRoutingSurfaces()) {
      const ownerArtifact = surface.role(routingCase.expectedOwner);
      if (routingCase.expectedOwner === 'orchestrator') {
        expect(surface.root, `${routingCase.id}:${surface.harness}`).toContain(
          'Handle bounded implementation directly in any route when continuity outweighs delegation overhead; never self-verify.',
        );
      } else {
        expect(ownerArtifact, `${routingCase.id}:${surface.harness}`).toContain(
          'Use when:',
        );
        expect(ownerArtifact, `${routingCase.id}:${surface.harness}`).toContain(
          routingCase.expectedOwner,
        );
        expect(ownerArtifact, `${routingCase.id}:${surface.harness}`).toContain(
          `Use when: ${getAgentRole(routingCase.expectedOwner).useWhen.join(' ')}`,
        );
      }
      expect(
        surface.root,
        `${routingCase.id}:${surface.harness}:root`,
      ).toContain('<implementation-ownership>');
      expect(
        surface.root,
        `${routingCase.id}:${surface.harness}:route-owner`,
      ).toContain(
        'SDD routes govern artifacts and gates, not implementation ownership.',
      );
      expect(surface.root).not.toMatch(/Direct micro-action/i);
      expect(surface.root).not.toMatch(/Artifact-backed implement follows/i);
      if (routingCase.expectedOwner === 'oracle') {
        expect(
          surface.root,
          `${routingCase.id}:${surface.harness}:root`,
        ).toContain('fresh Oracle instance');
        expect(
          surface.root,
          `${routingCase.id}:${surface.harness}:root`,
        ).toContain('implementation writer must never review itself');
      }

      for (const forbidden of routingCase.forbiddenOwners) {
        const forbiddenArtifact = surface.role(forbidden);
        if (forbidden === 'orchestrator') {
          expect(
            surface.root,
            `${routingCase.id}:${surface.harness}:${forbidden}`,
          ).toContain('Only after deciding delegation creates net gain');
        } else {
          expect(
            forbiddenArtifact,
            `${routingCase.id}:${surface.harness}:${forbidden}`,
          ).toContain('Do not use when:');
          expect(
            forbiddenArtifact,
            `${routingCase.id}:${surface.harness}:${forbidden}`,
          ).toContain(forbidden);
          expect(
            forbiddenArtifact,
            `${routingCase.id}:${surface.harness}:${forbidden}`,
          ).toContain(
            `Do not use when: ${getAgentRole(forbidden).doNotUseWhen.join(' ')}`,
          );
        }
      }
    }
  });

  test('consumes documented route-owner cross-product evidence', () => {
    const documentedIds = ROUTING_FIXTURE.cases
      .filter(({ expected_owner }) => expected_owner)
      .map(({ id }) => id);

    expect(documentedIds).toEqual(
      expect.arrayContaining(ROUTING_CASES.map(({ id }) => id)),
    );
    expect(ROUTING_CASES).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ route: 'direct', expectedOwner: 'designer' }),
        expect.objectContaining({ route: 'direct', expectedOwner: 'deep' }),
        expect.objectContaining({
          route: 'accelerated',
          expectedOwner: 'orchestrator',
        }),
        expect.objectContaining({
          route: 'full',
          expectedOwner: 'orchestrator',
        }),
        expect.objectContaining({ expectedOwner: 'quick' }),
      ]),
    );
  });

  test.each([
    ['designer', /user-facing|UI\/UX|visual/i, /backend-only|non-visual/i],
    ['quick', /narrow|mechanical|low-risk/i, /coupled|migration|high-risk/i],
    [
      'deep',
      /multi-file|edge-case|high-risk/i,
      /visual.*only|narrow.*low-risk/i,
    ],
  ] as const)('%s exposes deterministic positive and negative writer routing', (name, use, nonUse) => {
    const role = getAgentRole(name);
    expect(role.useWhen.join(' ')).toMatch(use);
    expect(role.doNotUseWhen.join(' ')).toMatch(nonUse);
    expect(role.escalateWhen.length).toBeGreaterThan(0);
    expect(renderAgentRoutingDescription(role)).toMatch(/Use when:/);
    expect(renderAgentRoutingDescription(role)).toMatch(/Do not use when:/);
  });

  test('keeps root and specialist implementation eligibility route-independent', () => {
    const root = getAgentRole('orchestrator');
    expect(root.useWhen.join(' ')).toMatch(
      /any route.*accumulated context.*continuity/i,
    );
    const policy = getAgentPackContract().orchestrationPolicy;
    expect(policy.implementationOwnership.eligibleOwners).toEqual([
      'orchestrator',
      'designer',
      'quick',
      'deep',
    ]);
    expect(policy.implementationOwnership.routeIndependent).toBe(true);
    for (const route of ['direct', 'accelerated', 'full'] as const) {
      expect(getSddPhaseOwner(route, 'implement')).toBe(
        'adaptive-implementation',
      );
    }
  });

  test.each([
    'explorer',
    'librarian',
    'oracle',
  ] as const)('%s rejects mutation and names escalation', (name) => {
    const role = getAgentRole(name);
    expect(role.doNotUseWhen.join(' ')).toMatch(/implement|mutat|edit/i);
    expect(role.escalateWhen.length).toBeGreaterThan(0);
    expect(role.canMutateWorkspace).toBe(false);
  });

  test('preserves one-writer ownership and compact child results', () => {
    expect(getAgentPackContract().orchestrationPolicy.singleWriter).toBe(true);
    expect(AGENT_RETURN_CONTRACT).toEqual([
      'conclusion',
      'evidence',
      'verification',
      'risks',
      'openQuestions',
      'nextAction',
    ]);
  });

  test('keeps active instructions route-neutral and specialist selection conditional', () => {
    const activePolicies = ACTIVE_OWNERSHIP_POLICY_PATHS.map((path) => ({
      path,
      content: readFileSync(
        new URL(`../../../${path}`, import.meta.url),
        'utf8',
      ),
    }));

    for (const { path, content } of activePolicies) {
      expect(content, path).toMatch(/route.*artifacts.*gates|governance/i);
      expect(content, path).toMatch(/net\s+gain/i);
      expect(content, path).not.toMatch(/Direct alone permits/i);
      expect(content, path).not.toMatch(
        /artifact-backed implementation always selects/i,
      );
      expect(content, path).not.toMatch(/all visual or UX work goes through/i);
    }

    const rootInstructions = activePolicies.find(
      ({ path }) => path === 'AGENTS.md',
    )?.content;
    expect(rootInstructions).toMatch(
      /after.*decid.*delegat.*net gain.*designer.*UI\/UX/is,
    );
  });
});
