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

type RoutingCase = {
  id: string;
  expectedOwner: AgentRoleName;
  forbiddenOwners: AgentRoleName[];
  ownerTrigger: RegExp;
  workflow?: 'direct' | 'persisted';
  phase?: 'execute' | 'verify';
};

const ROUTING_CASES: RoutingCase[] = [
  {
    id: 'writer-designer-ui',
    expectedOwner: 'designer',
    forbiddenOwners: ['orchestrator', 'worker'],
    ownerTrigger: /user-facing UI\/UX|visual quality/i,
    workflow: 'direct',
    phase: 'execute',
  },
  {
    id: 'writer-worker-correctness',
    expectedOwner: 'worker',
    forbiddenOwners: ['orchestrator', 'designer'],
    ownerTrigger:
      /multi-file, edge-case-heavy, migration, concurrency, shared-contract, or high-risk/i,
    workflow: 'direct',
    phase: 'execute',
  },
  {
    id: 'root-accelerated-continuity',
    expectedOwner: 'orchestrator',
    forbiddenOwners: ['designer', 'worker'],
    ownerTrigger:
      /accumulated context and continuity outweigh delegation overhead/i,
    workflow: 'persisted',
    phase: 'execute',
  },
  {
    id: 'root-full-continuity',
    expectedOwner: 'orchestrator',
    forbiddenOwners: ['designer', 'worker'],
    ownerTrigger:
      /accumulated context and continuity outweigh delegation overhead/i,
    workflow: 'persisted',
    phase: 'execute',
  },
  {
    id: 'read-explorer-discovery',
    expectedOwner: 'explorer',
    forbiddenOwners: ['orchestrator', 'designer', 'worker'],
    ownerTrigger: /repository ownership or behavior is broad or uncertain/i,
    workflow: 'persisted',
  },
  {
    id: 'read-librarian-external',
    expectedOwner: 'librarian',
    forbiddenOwners: ['orchestrator', 'worker'],
    ownerTrigger: /current authoritative external evidence is required/i,
  },
  {
    id: 'read-oracle-verification',
    expectedOwner: 'oracle',
    forbiddenOwners: ['orchestrator', 'designer'],
    ownerTrigger:
      /selected focused plan review, persistent diagnosis, material architecture or security risk/i,
    workflow: 'persisted',
    phase: 'verify',
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
    workflow?: 'direct' | 'persisted';
    phase?: 'execute' | 'verify';
    expected_owner?: AgentRoleName;
    forbidden_owners?: AgentRoleName[];
    delegation_net_gain?: boolean;
    ownership_rationale?: string;
    decision?: {
      kind: 'role-selection' | 'direct-retention' | 'task-shaping';
      expected: string;
      ready?: string[];
      blocked?: string[];
    };
    notes?: string;
  }>;
};

const ACTIVE_OWNERSHIP_POLICY_PATHS = [
  'AGENTS.md',
  'skills/thoth-work/SKILL.md',
  'docs/agent/agents-and-delegation.md',
  'docs/workflow.md',
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
  )('$id selects one exact owner from semantic decisions rather than route or name presence', (routingCase) => {
    const documentedCase = ROUTING_FIXTURE.cases.find(
      ({ id }) => id === routingCase.id,
    );
    const contract = getAgentPackContract();
    const candidates = contract.roles.filter((role) =>
      routingCase.ownerTrigger.test(role.useWhen.join(' ')),
    );
    const specialistDecision =
      contract.orchestrationPolicy.specialistDirectory.find(
        ({ role }) => role === routingCase.expectedOwner,
      );

    expect(documentedCase).toMatchObject({
      ...(routingCase.workflow ? { workflow: routingCase.workflow } : {}),
      ...(routingCase.phase ? { phase: routingCase.phase } : {}),
      expected_owner: routingCase.expectedOwner,
      forbidden_owners: routingCase.forbiddenOwners,
      decision: {
        kind:
          routingCase.expectedOwner === 'orchestrator'
            ? 'direct-retention'
            : 'role-selection',
        expected: routingCase.expectedOwner,
      },
    });
    expect(candidates.map(({ name }) => name)).toEqual([
      routingCase.expectedOwner,
    ]);
    for (const forbidden of routingCase.forbiddenOwners) {
      expect(candidates.map(({ name }) => name)).not.toContain(forbidden);
      expect(getAgentRole(forbidden).doNotUseWhen.length).toBeGreaterThan(0);
    }

    if (routingCase.expectedOwner !== 'orchestrator') {
      expect(specialistDecision).toEqual({
        role: routingCase.expectedOwner,
        selectWhen: getAgentRole(routingCase.expectedOwner).useWhen.join(' '),
        rejectWhen: getAgentRole(routingCase.expectedOwner).doNotUseWhen.join(
          ' ',
        ),
      });
    }
    expect(documentedCase?.task.length).toBeGreaterThan(30);

    for (const surface of renderRoutingSurfaces()) {
      expect(
        surface.root,
        `${routingCase.id}:${surface.harness}:root`,
      ).toContain('<implementation-ownership>');
      expect(
        surface.root,
        `${routingCase.id}:${surface.harness}:workflow-owner`,
      ).toContain(
        'Persistence and planning choices do not determine implementation ownership.',
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
        ).toMatch(/no implementation writer may approve its own work/i);
      }

      expect(surface.root).toContain('select-specialists');
      expect(surface.root).toContain('admit-ready-units');
    }
  });

  test('provides at least fifteen structured behavioral decisions with underused-role depth', () => {
    const behavioral = ROUTING_FIXTURE.cases.filter(({ decision }) => decision);
    const ownerCount = (owner: AgentRoleName) =>
      behavioral.filter(({ expected_owner }) => expected_owner === owner)
        .length;

    expect(behavioral.length).toBeGreaterThanOrEqual(15);
    expect(ownerCount('librarian')).toBeGreaterThanOrEqual(2);
    expect(ownerCount('designer')).toBeGreaterThanOrEqual(2);
    expect(
      behavioral
        .filter(({ decision }) => decision?.kind === 'task-shaping')
        .map(({ decision }) => decision?.expected),
    ).toEqual(
      expect.arrayContaining([
        'continuous-ready-dispatch',
        'blocked-dependency',
        'single-writer',
        'native-capacity',
        'remain-nonterminal',
        'sequential-fallback',
      ]),
    );
    for (const fixture of behavioral.filter(
      ({ decision }) => decision?.kind === 'task-shaping',
    )) {
      expect(fixture.decision?.ready).toBeDefined();
      expect(fixture.decision?.blocked).toBeDefined();
    }
  });

  test('consumes documented workflow-owner cross-product evidence', () => {
    const documentedIds = ROUTING_FIXTURE.cases
      .filter(({ expected_owner }) => expected_owner)
      .map(({ id }) => id);

    expect(documentedIds).toEqual(
      expect.arrayContaining(ROUTING_CASES.map(({ id }) => id)),
    );
    expect(ROUTING_CASES).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          workflow: 'direct',
          expectedOwner: 'designer',
        }),
        expect.objectContaining({
          workflow: 'direct',
          expectedOwner: 'worker',
        }),
        expect.objectContaining({
          workflow: 'persisted',
          expectedOwner: 'orchestrator',
        }),
        expect.objectContaining({
          workflow: 'persisted',
          expectedOwner: 'orchestrator',
        }),
      ]),
    );
    const notes = ROUTING_FIXTURE.cases
      .map(({ notes }) => notes ?? '')
      .join('\n');
    expect(notes).not.toMatch(/fresh Oracle still verifies/i);
    expect(notes).not.toMatch(/Every final verification uses/i);
  });

  test.each([
    ['designer', /user-facing|UI\/UX|visual/i, /backend-only|non-visual/i],
    [
      'worker',
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

  test('keeps root and specialist implementation eligibility workflow-independent', () => {
    const root = getAgentRole('orchestrator');
    expect(root.useWhen.join(' ')).toMatch(
      /accepted mutable surface.*accumulated context.*continuity/i,
    );
    const policy = getAgentPackContract().orchestrationPolicy;
    expect(policy.implementationOwnership.eligibleOwners).toEqual([
      'orchestrator',
      'designer',
      'worker',
    ]);
    expect(policy.implementationOwnership.workflowIndependent).toBe(true);
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

  test('keeps active instructions workflow-neutral and specialist selection conditional', () => {
    const activePolicies = ACTIVE_OWNERSHIP_POLICY_PATHS.map((path) => ({
      path,
      content: readFileSync(
        new URL(`../../../${path}`, import.meta.url),
        'utf8',
      ),
    }));

    for (const { path, content } of activePolicies) {
      expect(content, path).toMatch(/workflow|work contract|governance/i);
      expect(content, path).not.toMatch(/Direct alone permits/i);
      expect(content, path).not.toMatch(
        /artifact-backed implementation always selects/i,
      );
      expect(content, path).not.toMatch(/all visual or UX work goes through/i);
    }
    expect(activePolicies.map(({ content }) => content).join('\n')).toMatch(
      /net\s+gain/i,
    );

    const rootInstructions = activePolicies.find(
      ({ path }) => path === 'AGENTS.md',
    )?.content;
    expect(rootInstructions).toMatch(
      /before retaining or delegating.*ready work.*before waiting/is,
    );
    expect(rootInstructions).toMatch(
      /librarian.*external facts.*designer.*UI\/UX.*worker.*(?:implementation|high-risk)/is,
    );
  });
});
