import { createHash } from 'node:crypto';
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

export type PlanReviewRecoveryDecision =
  | 'fresh-approval'
  | 'missing'
  | 'unparsable'
  | 'non-approval-status'
  | 'stale';

export interface PlanReviewReviewedArtifactInput {
  role: string;
  path: string;
  required?: boolean;
  content: string;
}

export interface PlanReviewReviewedArtifactDigest {
  role: string;
  path: string;
  required: boolean;
  sha256: string;
}

export interface PlanReviewOverride {
  occurred: boolean;
  at: string | null;
  surface: string | null;
  context: string | null;
}

export interface CreatePlanReviewArtifactInput {
  changeName: string;
  status: string;
  reviewedAt: string;
  pipeline: 'accelerated' | 'full';
  persistenceMode: ArtifactGovernanceMode;
  reviewerRole?: string;
  comments?: readonly string[];
  nonBlockingNotes?: readonly string[];
  blockers?: readonly string[];
  override?: PlanReviewOverride;
  userOverrideContext?: string | null;
  reviewedArtifacts: readonly PlanReviewReviewedArtifactInput[];
}

export interface PlanReviewArtifact {
  schema: 'thoth-agents/sdd-plan-review/v1';
  artifact: 'plan-review';
  change: string;
  gate: 'oracle-review';
  status: string;
  reviewerRole: string;
  reviewedAt: string;
  pipeline: 'accelerated' | 'full';
  persistenceMode: ArtifactGovernanceMode;
  memoryTopicKey: string;
  reviewedArtifacts: readonly PlanReviewReviewedArtifactDigest[];
  override: PlanReviewOverride;
}

export interface MaterializedPlanReviewArtifact {
  descriptor: ArtifactLoaderDescriptor;
  artifact: PlanReviewArtifact;
  content: string;
}

export type ParsePlanReviewArtifactResult =
  | { ok: true; artifact: PlanReviewArtifact }
  | { ok: false; reason: 'unparsable'; message: string };

export interface EvaluatePlanReviewRecoveryInput {
  content: string | null | undefined;
  currentArtifacts: Readonly<Record<string, string>>;
}

export interface PlanReviewRecoveryResult {
  gateSatisfied: boolean;
  implementationConfirmed: false;
  decision: PlanReviewRecoveryDecision;
  status: string | null;
  staleArtifacts: readonly string[];
  message: string;
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

export function createPlanReviewArtifact(
  input: CreatePlanReviewArtifactInput,
): MaterializedPlanReviewArtifact {
  const descriptor = createArtifactDescriptor(input.changeName, 'plan-review');
  const reviewedArtifacts = [...input.reviewedArtifacts]
    .map((artifact) => ({
      role: artifact.role,
      path: artifact.path,
      required: artifact.required ?? true,
      sha256: hashUtf8(artifact.content),
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
  const override =
    input.override ??
    (input.userOverrideContext
      ? {
          occurred: true,
          at: input.reviewedAt,
          surface: 'user',
          context: input.userOverrideContext,
        }
      : {
          occurred: false,
          at: null,
          surface: null,
          context: null,
        });
  const artifact: PlanReviewArtifact = {
    schema: 'thoth-agents/sdd-plan-review/v1',
    artifact: 'plan-review',
    change: input.changeName,
    gate: 'oracle-review',
    status: input.status,
    reviewerRole: input.reviewerRole ?? 'oracle',
    reviewedAt: input.reviewedAt,
    pipeline: input.pipeline,
    persistenceMode: input.persistenceMode,
    memoryTopicKey: descriptor.topicKey,
    reviewedArtifacts,
    override,
  };

  return {
    descriptor,
    artifact,
    content: renderPlanReviewMarkdown({
      artifact,
      comments: input.comments ?? [],
      nonBlockingNotes: input.nonBlockingNotes ?? [],
      blockers: input.blockers ?? [],
      userOverrideContext: input.userOverrideContext ?? null,
    }),
  };
}

export function parsePlanReviewArtifact(
  content: string,
): ParsePlanReviewArtifactResult {
  const frontMatter = extractFrontMatter(content);

  if (!frontMatter) {
    return {
      ok: false,
      reason: 'unparsable',
      message: 'Plan-review artifact is missing YAML front matter.',
    };
  }

  try {
    const artifact = parsePlanReviewFrontMatter(frontMatter);

    if (
      artifact.schema !== 'thoth-agents/sdd-plan-review/v1' ||
      artifact.artifact !== 'plan-review' ||
      artifact.gate !== 'oracle-review' ||
      artifact.reviewedArtifacts.length === 0
    ) {
      return {
        ok: false,
        reason: 'unparsable',
        message: 'Plan-review artifact front matter does not match schema v1.',
      };
    }

    return { ok: true, artifact };
  } catch (error) {
    return {
      ok: false,
      reason: 'unparsable',
      message: error instanceof Error ? error.message : 'Unknown parse error.',
    };
  }
}

export function evaluatePlanReviewRecovery(
  input: EvaluatePlanReviewRecoveryInput,
): PlanReviewRecoveryResult {
  if (!input.content) {
    return createPlanReviewRecoveryResult(
      'missing',
      false,
      null,
      [],
      'No durable plan-review artifact exists; Oracle review must run.',
    );
  }

  const parsed = parsePlanReviewArtifact(input.content);

  if (!parsed.ok) {
    return createPlanReviewRecoveryResult(
      'unparsable',
      false,
      null,
      [],
      parsed.message,
    );
  }

  if (parsed.artifact.status !== '[OKAY]') {
    return createPlanReviewRecoveryResult(
      'non-approval-status',
      false,
      parsed.artifact.status,
      [],
      'Saved plan-review status is not an approval.',
    );
  }

  const staleArtifacts = parsed.artifact.reviewedArtifacts
    .filter((artifact) => {
      const current = input.currentArtifacts[artifact.path];
      return current === undefined || hashUtf8(current) !== artifact.sha256;
    })
    .map((artifact) => artifact.path);

  if (staleArtifacts.length > 0) {
    return createPlanReviewRecoveryResult(
      'stale',
      false,
      parsed.artifact.status,
      staleArtifacts,
      'Saved plan-review approval is stale because reviewed artifacts changed.',
    );
  }

  return createPlanReviewRecoveryResult(
    'fresh-approval',
    true,
    parsed.artifact.status,
    [],
    'Saved plan-review approval is fresh; implementation confirmation is still required.',
  );
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

function createArtifactDescriptor(
  changeName: string,
  artifact: string,
): ArtifactLoaderDescriptor {
  return {
    changeName,
    artifact: stripMarkdownExtension(artifact),
    topicKey: getArtifactTopicKey(changeName, artifact),
    openspecPath: getArtifactOpenSpecPath(changeName, artifact),
  };
}

function renderPlanReviewMarkdown({
  artifact,
  comments,
  nonBlockingNotes,
  blockers,
  userOverrideContext,
}: {
  artifact: PlanReviewArtifact;
  comments: readonly string[];
  nonBlockingNotes: readonly string[];
  blockers: readonly string[];
  userOverrideContext: string | null;
}): string {
  const lines = [
    '---',
    'schema: thoth-agents/sdd-plan-review/v1',
    'artifact: plan-review',
    `change: ${artifact.change}`,
    'gate: oracle-review',
    `status: ${quoteYamlScalar(artifact.status)}`,
    `reviewer_role: ${artifact.reviewerRole}`,
    `reviewed_at: ${artifact.reviewedAt}`,
    `pipeline: ${artifact.pipeline}`,
    `persistence_mode: ${artifact.persistenceMode}`,
    `memory_topic_key: ${artifact.memoryTopicKey}`,
    'override:',
    `  occurred: ${artifact.override.occurred}`,
    `  at: ${artifact.override.at ?? 'null'}`,
    `  surface: ${artifact.override.surface ?? 'null'}`,
    `  context: ${artifact.override.context ?? 'null'}`,
    'reviewed_artifacts:',
    ...artifact.reviewedArtifacts.flatMap((reviewed) => [
      `  - role: ${reviewed.role}`,
      `    path: ${reviewed.path}`,
      `    required: ${reviewed.required}`,
      `    sha256: ${reviewed.sha256}`,
    ]),
    '---',
    '',
    `# Plan Review: ${artifact.change}`,
    '',
    '## Oracle Result',
    '',
    artifact.status,
    '',
    '## Comments',
    '',
    renderMarkdownList(comments),
    '',
    '## Non-Blocking Notes',
    '',
    renderMarkdownList(nonBlockingNotes),
    '',
    '## Blockers',
    '',
    renderMarkdownList(blockers),
    '',
    '## User Override Context',
    '',
    userOverrideContext ?? 'None recorded.',
    '',
    '## Freshness Manifest',
    '',
    renderMarkdownList(
      artifact.reviewedArtifacts.map(
        (reviewed) =>
          `${reviewed.path} (${reviewed.role}) sha256=${reviewed.sha256}`,
      ),
    ),
    '',
    '## Recovery Decision',
    '',
    artifact.status === '[OKAY]'
      ? 'Fresh approval satisfies only the plan-review gate; implementation confirmation remains separate.'
      : 'This status does not satisfy the plan-review gate without a separate explicit override.',
    '',
  ];

  return `${lines.join('\n')}`;
}

function renderMarkdownList(items: readonly string[]): string {
  return items.length > 0
    ? items.map((item) => `- ${item}`).join('\n')
    : '- None.';
}

function extractFrontMatter(content: string): string | null {
  const match = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(content);
  return match?.[1] ?? null;
}

function parsePlanReviewFrontMatter(frontMatter: string): PlanReviewArtifact {
  const scalars = new Map<string, string>();
  const reviewedArtifacts: PlanReviewReviewedArtifactDigest[] = [];
  const lines = frontMatter.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const scalar = /^(\w[\w_]*):\s*(.*)$/.exec(line);

    if (scalar) {
      if (scalar[1] === 'override') {
        const values: { [key: string]: string | null } = {};

        while (index + 1 < lines.length && /^\s{2}\w/.test(lines[index + 1])) {
          index += 1;
          const property = /^\s{2}(\w+):\s*(.+)$/.exec(lines[index]);
          if (!property) {
            continue;
          }

          values[property[1]] = unquoteYamlScalar(property[2]);
        }

        scalars.set('override_occurred', values.occurred ?? 'false');
        scalars.set('override_at', values.at ?? 'null');
        scalars.set('override_surface', values.surface ?? 'null');
        scalars.set('override_context', values.context ?? 'null');
        continue;
      }

      scalars.set(scalar[1], unquoteYamlScalar(scalar[2]));
      continue;
    }

    const item = /^\s*-\s+role:\s*(.+)$/.exec(line);

    if (!item) {
      continue;
    }

    const reviewed: Partial<PlanReviewReviewedArtifactDigest> = {
      role: unquoteYamlScalar(item[1]),
    };

    while (index + 1 < lines.length && /^\s{4}\w/.test(lines[index + 1])) {
      index += 1;
      const property = /^\s{4}(\w+):\s*(.+)$/.exec(lines[index]);
      if (!property) {
        continue;
      }

      const value = unquoteYamlScalar(property[2]);
      if (property[1] === 'path') {
        reviewed.path = value;
      } else if (property[1] === 'required') {
        reviewed.required = value === 'true';
      } else if (property[1] === 'sha256') {
        reviewed.sha256 = value;
      }
    }

    if (!reviewed.role || !reviewed.path || !reviewed.sha256) {
      throw new Error('Reviewed artifact entry is incomplete.');
    }

    reviewedArtifacts.push({
      role: reviewed.role,
      path: reviewed.path,
      required: reviewed.required ?? true,
      sha256: reviewed.sha256,
    });
  }

  return {
    schema: requireScalar(scalars, 'schema') as PlanReviewArtifact['schema'],
    artifact: requireScalar(
      scalars,
      'artifact',
    ) as PlanReviewArtifact['artifact'],
    change: requireScalar(scalars, 'change'),
    gate: requireScalar(scalars, 'gate') as PlanReviewArtifact['gate'],
    status: requireScalar(scalars, 'status'),
    reviewerRole: requireScalar(scalars, 'reviewer_role'),
    reviewedAt: requireScalar(scalars, 'reviewed_at'),
    pipeline: requireScalar(
      scalars,
      'pipeline',
    ) as PlanReviewArtifact['pipeline'],
    persistenceMode: requireScalar(
      scalars,
      'persistence_mode',
    ) as ArtifactGovernanceMode,
    memoryTopicKey: requireScalar(scalars, 'memory_topic_key'),
    override: {
      occurred: requireScalar(scalars, 'override_occurred') === 'true',
      at: getNullableScalar(scalars, 'override_at'),
      surface: getNullableScalar(scalars, 'override_surface'),
      context: getNullableScalar(scalars, 'override_context'),
    },
    reviewedArtifacts,
  };
}

function requireScalar(scalars: Map<string, string>, key: string): string {
  const value = scalars.get(key);
  if (!value) {
    throw new Error(`Missing plan-review front matter field: ${key}`);
  }
  return value;
}

function getNullableScalar(
  scalars: Map<string, string>,
  key: string,
): string | null {
  const value = scalars.get(key);
  if (value === undefined) {
    throw new Error(`Missing plan-review front matter field: ${key}`);
  }
  return value === 'null' ? null : value;
}

function createPlanReviewRecoveryResult(
  decision: PlanReviewRecoveryDecision,
  gateSatisfied: boolean,
  status: string | null,
  staleArtifacts: readonly string[],
  message: string,
): PlanReviewRecoveryResult {
  return {
    gateSatisfied,
    implementationConfirmed: false,
    decision,
    status,
    staleArtifacts,
    message,
  };
}

function hashUtf8(content: string): string {
  return `sha256:${createHash('sha256').update(content, 'utf8').digest('hex')}`;
}

function quoteYamlScalar(value: string): string {
  return `"${value.replaceAll('\\\\', '\\\\\\\\').replaceAll('"', '\\"')}"`;
}

function unquoteYamlScalar(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replaceAll('\\"', '"').replaceAll('\\\\', '\\');
  }
  return trimmed;
}
