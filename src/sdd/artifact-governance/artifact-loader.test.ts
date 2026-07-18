import { describe, expect, test } from 'vitest';
import {
  type ArtifactLoaderDependencies,
  type ArtifactLoaderRequest,
  type ArtifactSnapshotInput,
  createPlanReviewArtifact,
  evaluatePlanReviewRecovery,
  getArtifactOpenSpecPath,
  getArtifactTopicKey,
  loadArtifactSnapshot,
  parsePlanReviewArtifact,
} from './index';

function createDependencies(
  overrides: Partial<ArtifactLoaderDependencies> = {},
) {
  const calls = {
    thoth: 0,
    openspec: 0,
  };

  const defaultSnapshot = (content: string): ArtifactSnapshotInput => ({
    content,
  });

  const dependencies: ArtifactLoaderDependencies = {
    readThothArtifact: async () => {
      calls.thoth += 1;
      return defaultSnapshot('thoth snapshot');
    },
    readOpenspecArtifact: async () => {
      calls.openspec += 1;
      return defaultSnapshot('openspec snapshot');
    },
    ...overrides,
  };

  return { dependencies, calls };
}

function createRequest(
  overrides: Partial<ArtifactLoaderRequest> = {},
): ArtifactLoaderRequest {
  return {
    mode: 'hybrid',
    changeName: '2026-05-13-artifact-governance-layer',
    artifact: 'tasks',
    promptSnapshot: {
      content: '# inline tasks',
    },
    ...overrides,
  };
}

describe('loadArtifactSnapshot', () => {
  test('exports normalized artifact descriptors for later governance reuse', () => {
    expect(
      getArtifactTopicKey('2026-05-13-artifact-governance-layer', 'tasks.md'),
    ).toBe('sdd/2026-05-13-artifact-governance-layer/tasks');
    expect(
      getArtifactOpenSpecPath(
        '2026-05-13-artifact-governance-layer',
        'proposal',
      ),
    ).toBe('openspec/changes/2026-05-13-artifact-governance-layer/proposal.md');
  });

  test('uses prompt context as the only source of truth in none mode', async () => {
    const { dependencies, calls } = createDependencies();

    const result = await loadArtifactSnapshot(
      createRequest({ mode: 'none' }),
      dependencies,
    );

    expect(result.valid).toBe(true);
    expect(result.snapshot?.source).toBe('prompt');
    expect(result.snapshot?.content).toBe('# inline tasks');
    expect(calls.thoth).toBe(0);
    expect(calls.openspec).toBe(0);
  });

  test('uses thoth-mem as the source of truth in thoth-mem mode', async () => {
    const { dependencies, calls } = createDependencies();

    const result = await loadArtifactSnapshot(
      createRequest({ mode: 'thoth-mem', promptSnapshot: undefined }),
      dependencies,
    );

    expect(result.valid).toBe(true);
    expect(result.snapshot?.source).toBe('thoth-mem');
    expect(result.snapshot?.content).toBe('thoth snapshot');
    expect(calls.thoth).toBe(1);
    expect(calls.openspec).toBe(0);
  });

  test('uses openspec as the source of truth in openspec mode', async () => {
    const { dependencies, calls } = createDependencies();

    const result = await loadArtifactSnapshot(
      createRequest({ mode: 'openspec', promptSnapshot: undefined }),
      dependencies,
    );

    expect(result.valid).toBe(true);
    expect(result.snapshot?.source).toBe('openspec');
    expect(result.snapshot?.content).toBe('openspec snapshot');
    expect(calls.thoth).toBe(0);
    expect(calls.openspec).toBe(1);
  });

  test('reports a matching hybrid as complete without granting provider authority', async () => {
    const { dependencies } = createDependencies({
      readOpenspecArtifact: async () => ({ content: 'thoth snapshot' }),
    });

    const result = await loadArtifactSnapshot(
      createRequest({ mode: 'hybrid', promptSnapshot: undefined }),
      dependencies,
    );

    expect(result.valid).toBe(true);
    expect(result.mode).toBe('hybrid');
    expect(result.snapshot?.source).toBe('openspec');
    expect(result.comparison).toEqual({
      outcome: 'complete',
      inspectableSource: 'openspec',
      providerState: 'supported',
      missingSources: [],
      metadata: {
        comparedSources: ['thoth-mem', 'openspec'],
      },
    });
    expect(result.findings).toHaveLength(0);
  });

  test('reports an OpenSpec-only hybrid as partial without fallback or fabricated completeness', async () => {
    const { dependencies } = createDependencies({
      readThothArtifact: async () => null,
      readOpenspecArtifact: async () => ({ content: 'openspec snapshot' }),
    });

    const result = await loadArtifactSnapshot(
      createRequest({ mode: 'hybrid', promptSnapshot: undefined }),
      dependencies,
    );

    expect(result.mode).toBe('hybrid');
    expect(result.snapshot?.source).toBe('openspec');
    expect(result.comparison).toEqual({
      outcome: 'partial',
      inspectableSource: 'openspec',
      providerState: 'unsupported',
      missingSources: ['thoth-mem'],
      metadata: { comparedSources: ['openspec'] },
    });
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: 'persistence.hybrid-partial',
      }),
    );
    expect(result.comparison).not.toHaveProperty('recoverable');
    expect(result.findings.map((finding) => finding.code)).not.toContain(
      'artifact-loader.hybrid-fallback',
    );
  });

  test('reports a provider-only hybrid as partial without switching the declared mode', async () => {
    const { dependencies } = createDependencies({
      readThothArtifact: async () => ({ content: 'provider snapshot' }),
      readOpenspecArtifact: async () => null,
    });

    const result = await loadArtifactSnapshot(
      createRequest({ mode: 'hybrid', promptSnapshot: undefined }),
      dependencies,
    );

    expect(result.mode).toBe('hybrid');
    expect(result.snapshot?.source).toBe('thoth-mem');
    expect(result.comparison).toEqual({
      outcome: 'partial',
      inspectableSource: 'thoth-mem',
      providerState: 'supported',
      missingSources: ['openspec'],
      metadata: { comparedSources: ['thoth-mem'] },
    });
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: 'persistence.hybrid-partial',
      }),
    );
    expect(result.comparison).not.toHaveProperty('recoverable');
  });

  test('reports an unavailable hybrid without fabricating a source or recovery', async () => {
    const { dependencies } = createDependencies({
      readThothArtifact: async () => null,
      readOpenspecArtifact: async () => null,
    });

    const result = await loadArtifactSnapshot(
      createRequest({ mode: 'hybrid', promptSnapshot: undefined }),
      dependencies,
    );

    expect(result.valid).toBe(false);
    expect(result.mode).toBe('hybrid');
    expect(result.snapshot).toBeNull();
    expect(result.comparison).toEqual({
      outcome: 'unavailable',
      inspectableSource: null,
      providerState: 'unsupported',
      missingSources: ['thoth-mem', 'openspec'],
      metadata: { comparedSources: [] },
    });
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: 'persistence.source-unavailable',
        severity: 'error',
      }),
    );
    expect(result.comparison).not.toHaveProperty('recoverable');
  });

  test('reports divergent hybrid legs without choosing an authority or repair path', async () => {
    const { dependencies } = createDependencies();

    const result = await loadArtifactSnapshot(
      createRequest({ mode: 'hybrid', promptSnapshot: undefined }),
      dependencies,
    );

    expect(result.mode).toBe('hybrid');
    expect(result.snapshot).toBeNull();
    expect(result.comparison).toEqual({
      outcome: 'diverged',
      inspectableSource: null,
      providerState: 'supported',
      missingSources: [],
      metadata: { comparedSources: ['thoth-mem', 'openspec'] },
    });
    expect(result.findings).toContainEqual(
      expect.objectContaining({ code: 'persistence.hybrid-diverged' }),
    );
    expect(result.comparison).not.toHaveProperty('sourceOfTruth');
    expect(result.comparison).not.toHaveProperty('recoverable');
  });
});

describe('plan-review artifact recovery', () => {
  test('exports the canonical plan-review descriptor path and topic key', () => {
    expect(
      getArtifactTopicKey('persist-oracle-plan-review', 'plan-review.md'),
    ).toBe('sdd/persist-oracle-plan-review/plan-review');
    expect(
      getArtifactOpenSpecPath('persist-oracle-plan-review', 'plan-review'),
    ).toBe('openspec/changes/persist-oracle-plan-review/plan-review.md');
  });

  test('materializes a markdown plan-review artifact with SHA-256 reviewed artifact digests', () => {
    const artifact = createPlanReviewArtifact({
      changeName: 'persist-oracle-plan-review',
      status: '[OKAY]',
      reviewedAt: '2026-07-04T16:00:00.000Z',
      pipeline: 'full',
      persistenceMode: 'openspec',
      comments: ['Plan is executable.'],
      nonBlockingNotes: ['Keep implementation confirmation separate.'],
      blockers: [],
      reviewedArtifacts: [
        {
          role: 'proposal',
          path: 'openspec/changes/persist-oracle-plan-review/proposal.md',
          required: true,
          content: 'hello',
        },
      ],
    });

    expect(artifact.descriptor).toMatchObject({
      artifact: 'plan-review',
      topicKey: 'sdd/persist-oracle-plan-review/plan-review',
      openspecPath:
        'openspec/changes/persist-oracle-plan-review/plan-review.md',
    });
    expect(artifact.content).toContain(
      'schema: thoth-agents/sdd-plan-review/v1',
    );
    expect(artifact.content).toContain('status: "[OKAY]"');
    expect(artifact.content).toContain(
      'sha256:2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    );
    expect(artifact.content).toContain('override:');
    expect(artifact.content).toContain('occurred: false');
    expect(artifact.content).toContain('at: null');
    expect(artifact.content).toContain('## Recovery Decision');
  });

  test('materializes explicit override metadata and parses it back', () => {
    const artifact = createPlanReviewArtifact({
      changeName: 'persist-oracle-plan-review',
      status: '[REJECT]',
      reviewedAt: '2026-07-04T16:00:00.000Z',
      pipeline: 'full',
      persistenceMode: 'openspec',
      override: {
        occurred: true,
        at: '2026-07-04T16:30:00.000Z',
        surface: 'blocking-input',
        context: 'Stakeholder accepted risk after re-review.',
      },
      comments: ['Blocked due to legacy risk.'],
      blockers: ['Manual override required.'],
      reviewedArtifacts: [
        {
          role: 'tasks',
          path: 'openspec/changes/persist-oracle-plan-review/tasks.md',
          required: true,
          content: 'hello',
        },
      ],
    });

    expect(artifact.content).toContain('override:');
    expect(artifact.content).toContain('occurred: true');
    expect(artifact.content).toContain('at: 2026-07-04T16:30:00.000Z');
    expect(artifact.content).toContain('surface: blocking-input');
    expect(artifact.content).toContain(
      'context: Stakeholder accepted risk after re-review.',
    );

    const parsed = parsePlanReviewArtifact(artifact.content);
    expect(parsed.ok).toBe(true);
    expect(parsed.artifact?.override).toMatchObject({
      occurred: true,
      at: '2026-07-04T16:30:00.000Z',
      surface: 'blocking-input',
      context: 'Stakeholder accepted risk after re-review.',
    });
  });

  test('parses a fresh approval and treats it as satisfying only the plan-review gate', () => {
    const artifact = createPlanReviewArtifact({
      changeName: 'persist-oracle-plan-review',
      status: '[OKAY]',
      reviewedAt: '2026-07-04T16:00:00.000Z',
      pipeline: 'full',
      persistenceMode: 'openspec',
      reviewedArtifacts: [
        {
          role: 'tasks',
          path: 'openspec/changes/persist-oracle-plan-review/tasks.md',
          required: true,
          content: 'hello',
        },
      ],
    });

    const parsed = parsePlanReviewArtifact(artifact.content);
    const recovery = evaluatePlanReviewRecovery({
      content: artifact.content,
      currentArtifacts: {
        'openspec/changes/persist-oracle-plan-review/tasks.md': 'hello',
      },
    });

    expect(parsed.ok).toBe(true);
    expect(parsed.artifact?.status).toBe('[OKAY]');
    expect(parsed.artifact?.reviewedArtifacts).toEqual([
      expect.objectContaining({
        role: 'tasks',
        path: 'openspec/changes/persist-oracle-plan-review/tasks.md',
        required: true,
        sha256:
          'sha256:2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
      }),
    ]);
    expect(parsed.artifact?.override).toMatchObject({
      occurred: false,
      at: null,
      surface: null,
      context: null,
    });
    expect(recovery).toMatchObject({
      gateSatisfied: true,
      implementationConfirmed: false,
      decision: 'fresh-approval',
    });
  });

  test('fails closed when the saved approval is stale, missing, rejected, or unparsable', () => {
    const approved = createPlanReviewArtifact({
      changeName: 'persist-oracle-plan-review',
      status: '[OKAY]',
      reviewedAt: '2026-07-04T16:00:00.000Z',
      pipeline: 'full',
      persistenceMode: 'openspec',
      reviewedArtifacts: [
        {
          role: 'tasks',
          path: 'openspec/changes/persist-oracle-plan-review/tasks.md',
          required: true,
          content: 'hello',
        },
      ],
    });
    const rejected = createPlanReviewArtifact({
      changeName: 'persist-oracle-plan-review',
      status: '[REJECT]',
      reviewedAt: '2026-07-04T16:00:00.000Z',
      pipeline: 'full',
      persistenceMode: 'openspec',
      blockers: ['Task 2.1 is not executable.'],
      reviewedArtifacts: [
        {
          role: 'tasks',
          path: 'openspec/changes/persist-oracle-plan-review/tasks.md',
          required: true,
          content: 'hello',
        },
      ],
    });

    expect(
      evaluatePlanReviewRecovery({
        content: approved.content,
        currentArtifacts: {
          'openspec/changes/persist-oracle-plan-review/tasks.md': 'changed',
        },
      }),
    ).toMatchObject({ gateSatisfied: false, decision: 'stale' });
    expect(
      evaluatePlanReviewRecovery({ content: null, currentArtifacts: {} }),
    ).toMatchObject({ gateSatisfied: false, decision: 'missing' });
    expect(
      evaluatePlanReviewRecovery({
        content: rejected.content,
        currentArtifacts: {
          'openspec/changes/persist-oracle-plan-review/tasks.md': 'hello',
        },
      }),
    ).toMatchObject({ gateSatisfied: false, decision: 'non-approval-status' });
    expect(
      evaluatePlanReviewRecovery({
        content: '# no front matter',
        currentArtifacts: {},
      }),
    ).toMatchObject({ gateSatisfied: false, decision: 'unparsable' });
  });
});
