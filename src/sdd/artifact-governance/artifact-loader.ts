import { readFile } from 'node:fs/promises';
import { join, posix } from 'node:path';
import {
  type ArtifactGovernanceFinding,
  type ArtifactGovernanceMode,
  type ArtifactGovernanceResult,
  createArtifactGovernanceResult,
} from './types';

type MaybePromise<T> = T | Promise<T>;

export type ArtifactSnapshotSource = 'prompt' | 'thoth-mem' | 'openspec';

export interface ArtifactSnapshotInput {
  content: string;
  location?: string;
  updatedAt?: string;
  observationId?: number;
}

export interface ArtifactSnapshot extends ArtifactSnapshotInput {
  source: ArtifactSnapshotSource;
}

export interface ArtifactLoaderRequest {
  mode: ArtifactGovernanceMode;
  changeName: string;
  artifact: string;
  promptSnapshot?: ArtifactSnapshotInput;
  workspaceRoot?: string;
}

export interface ArtifactLoaderDescriptor {
  changeName: string;
  artifact: string;
  topicKey: string;
  openspecPath: string;
}

export interface ArtifactLoaderDependencies {
  readThothArtifact?: (
    descriptor: ArtifactLoaderDescriptor,
  ) => MaybePromise<ArtifactSnapshotInput | null>;
  readOpenspecArtifact?: (
    descriptor: ArtifactLoaderDescriptor,
  ) => MaybePromise<ArtifactSnapshotInput | null>;
}

export interface ArtifactComparisonMetadata {
  status: 'not-applicable' | 'single-source' | 'match' | 'diverged';
  sourceOfTruth: ArtifactSnapshotSource | null;
  recoverable: boolean;
  missingSources: readonly ArtifactSnapshotSource[];
  metadata: Readonly<{
    comparedSources: readonly ArtifactSnapshotSource[];
    matched?: boolean;
    thothLength?: number;
    openspecLength?: number;
  }>;
}

export interface ArtifactLoaderResult extends ArtifactGovernanceResult {
  snapshot: ArtifactSnapshot | null;
  descriptor: ArtifactLoaderDescriptor;
  comparison: ArtifactComparisonMetadata;
  sources: Readonly<{
    prompt: ArtifactSnapshot | null;
    thothMem: ArtifactSnapshot | null;
    openspec: ArtifactSnapshot | null;
  }>;
}

const DEFAULT_OPENSPEC_ROOT = 'openspec';

export function getArtifactTopicKey(
  changeName: string,
  artifact: string,
): string {
  return `sdd/${changeName}/${stripMarkdownExtension(artifact)}`;
}

export function getArtifactOpenSpecPath(
  changeName: string,
  artifact: string,
): string {
  return posix.join(
    DEFAULT_OPENSPEC_ROOT,
    'changes',
    changeName,
    ensureMarkdownExtension(artifact),
  );
}

export async function loadArtifactSnapshot(
  request: ArtifactLoaderRequest,
  dependencies: ArtifactLoaderDependencies = {},
): Promise<ArtifactLoaderResult> {
  const descriptor = {
    changeName: request.changeName,
    artifact: stripMarkdownExtension(request.artifact),
    topicKey: getArtifactTopicKey(request.changeName, request.artifact),
    openspecPath: getArtifactOpenSpecPath(request.changeName, request.artifact),
  } satisfies ArtifactLoaderDescriptor;

  const prompt = toSnapshot('prompt', request.promptSnapshot);
  const thothMem = shouldReadThoth(request.mode)
    ? toSnapshot(
        'thoth-mem',
        await (dependencies.readThothArtifact?.(descriptor) ?? null),
      )
    : null;
  const openspec = shouldReadOpenspec(request.mode)
    ? toSnapshot(
        'openspec',
        await readOpenspecSnapshot(descriptor, request, dependencies),
      )
    : null;

  const sources = {
    prompt,
    thothMem,
    openspec,
  } as const;

  const findings: ArtifactGovernanceFinding[] = [];
  const { snapshot, comparison } = resolveSnapshot(
    request.mode,
    sources,
    findings,
  );

  return {
    ...createArtifactGovernanceResult({
      validator: 'artifact-loader',
      artifact: ensureMarkdownExtension(request.artifact),
      mode: request.mode,
      findings,
    }),
    snapshot,
    descriptor,
    comparison,
    sources,
  };
}

function resolveSnapshot(
  mode: ArtifactGovernanceMode,
  sources: {
    prompt: ArtifactSnapshot | null;
    thothMem: ArtifactSnapshot | null;
    openspec: ArtifactSnapshot | null;
  },
  findings: ArtifactGovernanceFinding[],
): {
  snapshot: ArtifactSnapshot | null;
  comparison: ArtifactComparisonMetadata;
} {
  switch (mode) {
    case 'none':
      return resolveSingleSource(
        'prompt',
        sources.prompt,
        findings,
        'Artifact prompt context is required in none mode.',
      );
    case 'thoth-mem':
      return resolveSingleSource(
        'thoth-mem',
        sources.thothMem,
        findings,
        'Thoth-mem is the only source of truth in thoth-mem mode.',
      );
    case 'openspec':
      return resolveSingleSource(
        'openspec',
        sources.openspec,
        findings,
        'OpenSpec is the only source of truth in openspec mode.',
      );
    case 'hybrid':
      return resolveHybridSources(sources, findings);
  }
}

function resolveSingleSource(
  sourceOfTruth: ArtifactSnapshotSource,
  snapshot: ArtifactSnapshot | null,
  findings: ArtifactGovernanceFinding[],
  missingMessage: string,
): {
  snapshot: ArtifactSnapshot | null;
  comparison: ArtifactComparisonMetadata;
} {
  if (snapshot === null) {
    findings.push({
      code: 'artifact-loader.source-missing',
      severity: 'error',
      message: missingMessage,
      source: sourceOfTruth,
    });
  }

  return {
    snapshot,
    comparison: {
      status: 'not-applicable',
      sourceOfTruth: sourceOfTruth,
      recoverable: false,
      missingSources: snapshot === null ? [sourceOfTruth] : [],
      metadata: {
        comparedSources: [],
      },
    },
  };
}

function resolveHybridSources(
  sources: {
    thothMem: ArtifactSnapshot | null;
    openspec: ArtifactSnapshot | null;
  },
  findings: ArtifactGovernanceFinding[],
): {
  snapshot: ArtifactSnapshot | null;
  comparison: ArtifactComparisonMetadata;
} {
  const { thothMem, openspec } = sources;

  if (thothMem && openspec) {
    const matched = thothMem.content === openspec.content;

    if (!matched) {
      findings.push({
        code: 'artifact-loader.hybrid-divergence',
        severity: 'warning',
        message:
          'Hybrid mode found divergent artifact snapshots; keeping thoth-mem as the primary source because recovery remains possible.',
        metadata: {
          openspecLength: openspec.content.length,
          thothLength: thothMem.content.length,
        },
      });
    }

    return {
      snapshot: thothMem,
      comparison: {
        status: matched ? 'match' : 'diverged',
        sourceOfTruth: 'thoth-mem',
        recoverable: !matched,
        missingSources: [],
        metadata: {
          comparedSources: ['thoth-mem', 'openspec'],
          matched,
          thothLength: thothMem.content.length,
          openspecLength: openspec.content.length,
        },
      },
    };
  }

  if (thothMem || openspec) {
    const snapshot = thothMem ?? openspec;
    const missingSources: ArtifactSnapshotSource[] = [];

    if (!thothMem) {
      missingSources.push('thoth-mem');
    }

    if (!openspec) {
      missingSources.push('openspec');
    }

    findings.push({
      code: 'artifact-loader.hybrid-fallback',
      severity: 'warning',
      message:
        'Hybrid mode recovered from a single available artifact source; the missing store can be repaired later without blocking read-only governance.',
      metadata: {
        sourceOfTruth: snapshot?.source ?? null,
      },
    });

    return {
      snapshot,
      comparison: {
        status: 'single-source',
        sourceOfTruth: snapshot?.source ?? null,
        recoverable: true,
        missingSources,
        metadata: {
          comparedSources: snapshot ? [snapshot.source] : [],
        },
      },
    };
  }

  findings.push({
    code: 'artifact-loader.hybrid-unavailable',
    severity: 'error',
    message:
      'Hybrid mode could not load the artifact from thoth-mem or OpenSpec.',
  });

  return {
    snapshot: null,
    comparison: {
      status: 'single-source',
      sourceOfTruth: null,
      recoverable: false,
      missingSources: ['thoth-mem', 'openspec'],
      metadata: {
        comparedSources: [],
      },
    },
  };
}

async function readOpenspecSnapshot(
  descriptor: ArtifactLoaderDescriptor,
  request: ArtifactLoaderRequest,
  dependencies: ArtifactLoaderDependencies,
): Promise<ArtifactSnapshotInput | null> {
  if (dependencies.readOpenspecArtifact) {
    return dependencies.readOpenspecArtifact(descriptor);
  }

  if (!request.workspaceRoot) {
    return null;
  }

  const filePath = join(request.workspaceRoot, descriptor.openspecPath);

  try {
    const content = await readFile(filePath, 'utf8');

    return {
      content,
      location: descriptor.openspecPath,
    };
  } catch {
    return null;
  }
}

function toSnapshot(
  source: ArtifactSnapshotSource,
  input: ArtifactSnapshotInput | null | undefined,
): ArtifactSnapshot | null {
  if (!input) {
    return null;
  }

  return {
    source,
    content: input.content,
    location: input.location,
    updatedAt: input.updatedAt,
    observationId: input.observationId,
  };
}

function shouldReadThoth(mode: ArtifactGovernanceMode): boolean {
  return mode === 'thoth-mem' || mode === 'hybrid';
}

function shouldReadOpenspec(mode: ArtifactGovernanceMode): boolean {
  return mode === 'openspec' || mode === 'hybrid';
}

function stripMarkdownExtension(artifact: string): string {
  return artifact.endsWith('.md') ? artifact.slice(0, -3) : artifact;
}

function ensureMarkdownExtension(artifact: string): string {
  return artifact.endsWith('.md') ? artifact : `${artifact}.md`;
}
