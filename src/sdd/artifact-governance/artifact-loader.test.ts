import { describe, expect, test } from 'bun:test';
import {
  type ArtifactLoaderDependencies,
  type ArtifactLoaderRequest,
  type ArtifactSnapshotInput,
  getArtifactOpenSpecPath,
  getArtifactTopicKey,
  loadArtifactSnapshot,
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
    expect(result.comparison.status).toBe('not-applicable');
    expect(result.comparison.sourceOfTruth).toBe('prompt');
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
    expect(result.comparison.status).toBe('not-applicable');
    expect(result.comparison.sourceOfTruth).toBe('thoth-mem');
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
    expect(result.comparison.status).toBe('not-applicable');
    expect(result.comparison.sourceOfTruth).toBe('openspec');
    expect(calls.thoth).toBe(0);
    expect(calls.openspec).toBe(1);
  });

  test('compares hybrid sources and keeps thoth-mem as the primary source when both match', async () => {
    const { dependencies } = createDependencies({
      readOpenspecArtifact: async () => ({ content: 'thoth snapshot' }),
    });

    const result = await loadArtifactSnapshot(
      createRequest({ mode: 'hybrid', promptSnapshot: undefined }),
      dependencies,
    );

    expect(result.valid).toBe(true);
    expect(result.snapshot?.source).toBe('thoth-mem');
    expect(result.comparison.status).toBe('match');
    expect(result.comparison.sourceOfTruth).toBe('thoth-mem');
    expect(result.comparison.metadata).toEqual({
      comparedSources: ['thoth-mem', 'openspec'],
      matched: true,
      openspecLength: 14,
      thothLength: 14,
    });
    expect(result.findings).toHaveLength(0);
  });

  test('reports recoverable divergence as a warning first in hybrid mode', async () => {
    const { dependencies } = createDependencies();

    const result = await loadArtifactSnapshot(
      createRequest({ mode: 'hybrid', promptSnapshot: undefined }),
      dependencies,
    );

    expect(result.valid).toBe(true);
    expect(result.snapshot?.source).toBe('thoth-mem');
    expect(result.summary.warningCount).toBe(1);
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: 'artifact-loader.hybrid-divergence',
        severity: 'warning',
      }),
    );
    expect(result.comparison.status).toBe('diverged');
    expect(result.comparison.recoverable).toBe(true);
    expect(result.comparison.metadata).toEqual({
      comparedSources: ['thoth-mem', 'openspec'],
      matched: false,
      openspecLength: 17,
      thothLength: 14,
    });
  });

  test('falls back to openspec with a warning when hybrid mode cannot load thoth-mem', async () => {
    const { dependencies } = createDependencies({
      readThothArtifact: async () => null,
      readOpenspecArtifact: async () => ({ content: 'openspec backup' }),
    });

    const result = await loadArtifactSnapshot(
      createRequest({ mode: 'hybrid', promptSnapshot: undefined }),
      dependencies,
    );

    expect(result.valid).toBe(true);
    expect(result.snapshot?.source).toBe('openspec');
    expect(result.snapshot?.content).toBe('openspec backup');
    expect(result.summary.warningCount).toBe(1);
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: 'artifact-loader.hybrid-fallback',
        severity: 'warning',
      }),
    );
    expect(result.comparison.status).toBe('single-source');
    expect(result.comparison.sourceOfTruth).toBe('openspec');
    expect(result.comparison.recoverable).toBe(true);
    expect(result.comparison.missingSources).toEqual(['thoth-mem']);
  });

  test('reports an unrecoverable error when hybrid mode cannot load either persisted source', async () => {
    const { dependencies } = createDependencies({
      readThothArtifact: async () => null,
      readOpenspecArtifact: async () => null,
    });

    const result = await loadArtifactSnapshot(
      createRequest({ mode: 'hybrid', promptSnapshot: undefined }),
      dependencies,
    );

    expect(result.valid).toBe(false);
    expect(result.snapshot).toBeNull();
    expect(result.comparison.status).toBe('single-source');
    expect(result.comparison.sourceOfTruth).toBeNull();
    expect(result.comparison.recoverable).toBe(false);
    expect(result.comparison.missingSources).toEqual(['thoth-mem', 'openspec']);
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: 'artifact-loader.hybrid-unavailable',
        severity: 'error',
      }),
    );
  });
});
