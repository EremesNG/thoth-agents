import type {
  ArtifactComparisonMetadata,
  ArtifactSnapshot,
  ArtifactSnapshotSource,
} from './artifact-loader';
import {
  type ArtifactGovernanceFinding,
  type ArtifactGovernanceMode,
  type ArtifactGovernanceResult,
  createArtifactGovernanceResult,
} from './types';

const RECOGNIZED_PHASE_HEADER = /^## Phase \d+:\s+.+$/;
const TASK_LINE = /^- \[(.*?)\]\s+(.*)$/;
const TASK_NUMBERING = /^(\d+\.\d+)\s+.+$/;
const VERIFICATION_HEADER = /^\*\*Verification\*\*:\s*$/;
const VERIFICATION_RUN = /^- Run:\s+.+$/;
const VERIFICATION_EXPECTED = /^- Expected:\s+.+$/;
const ALLOWED_TASK_STATES = new Set([' ', 'x', '~', '-']);

export interface ValidateTasksArtifactRequest {
  mode: ArtifactGovernanceMode;
  content: string;
  path?: string;
  persistence?: ValidateTasksArtifactPersistence;
}

export interface ValidateTasksArtifactPersistence {
  comparison: ArtifactComparisonMetadata;
  sources: Readonly<{
    prompt: ArtifactSnapshot | null;
    thothMem: ArtifactSnapshot | null;
    openspec: ArtifactSnapshot | null;
  }>;
}

export function validateTasksArtifact(
  request: ValidateTasksArtifactRequest,
): ArtifactGovernanceResult {
  const lines = request.content.split(/\r?\n/);
  const findings: ArtifactGovernanceFinding[] = [];

  let recognizedPhaseCount = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index] ?? '';
    const trimmedLine = rawLine.trim();
    const lineNumber = index + 1;

    if (trimmedLine.startsWith('## ')) {
      if (RECOGNIZED_PHASE_HEADER.test(trimmedLine)) {
        recognizedPhaseCount += 1;
      } else {
        findings.push({
          code: 'tasks.unrecognized-phase-header',
          severity: 'error',
          message:
            'Phase headers must use the `## Phase N: Title` execution contract.',
          path: request.path,
          line: lineNumber,
        });
      }

      continue;
    }

    if (!isTopLevelTaskLine(rawLine)) {
      continue;
    }

    const taskMatch = TASK_LINE.exec(rawLine);

    if (taskMatch === null) {
      findings.push({
        code: 'tasks.missing-state',
        severity: 'error',
        message: 'Task checklist items must declare an allowed checkbox state.',
        path: request.path,
        line: lineNumber,
      });
      continue;
    }

    const [, state, taskBody] = taskMatch;

    if (state.length === 0) {
      findings.push({
        code: 'tasks.missing-state',
        severity: 'error',
        message: 'Task checklist items cannot omit their checkbox state.',
        path: request.path,
        line: lineNumber,
      });
    } else if (!ALLOWED_TASK_STATES.has(state)) {
      findings.push({
        code: 'tasks.invalid-state',
        severity: 'error',
        message:
          'Task checkbox state must be one of `[ ]`, `[x]`, `[~]`, or `[-]`.',
        path: request.path,
        line: lineNumber,
      });
    }

    const numberingMatch = TASK_NUMBERING.exec(taskBody);

    if (numberingMatch === null) {
      findings.push({
        code: 'tasks.malformed-numbering',
        severity: 'error',
        message:
          'Task checklist items must start with a numbered identifier like `2.1`.',
        path: request.path,
        line: lineNumber,
      });
    }

    const verificationLines = collectVerificationLines(lines, index + 1);
    const verificationState = inspectVerificationBlock(verificationLines);

    if (!verificationState.hasHeader) {
      findings.push({
        code: 'tasks.missing-verification-block',
        severity: 'error',
        message:
          'Each task checklist item must include a `Verification` block.',
        path: request.path,
        line: lineNumber,
      });
      continue;
    }

    if (!verificationState.hasRun) {
      findings.push({
        code: 'tasks.missing-verification-run',
        severity: 'error',
        message: 'Verification blocks must include a `Run` command.',
        path: request.path,
        line: lineNumber,
      });
    }

    if (!verificationState.hasExpected) {
      findings.push({
        code: 'tasks.missing-verification-expected',
        severity: 'error',
        message: 'Verification blocks must include an `Expected` outcome.',
        path: request.path,
        line: lineNumber,
      });
    }
  }

  if (recognizedPhaseCount === 0) {
    findings.push({
      code: 'tasks.missing-phase-headers',
      severity: 'error',
      message:
        'tasks.md must include at least one recognized `## Phase N: Title` header.',
      path: request.path,
      line: 1,
    });
  }

  collectPersistenceFindings(request, findings);

  return createArtifactGovernanceResult({
    validator: 'tasks-validator',
    artifact: 'tasks.md',
    mode: request.mode,
    findings,
  });
}

function collectPersistenceFindings(
  request: ValidateTasksArtifactRequest,
  findings: ArtifactGovernanceFinding[],
): void {
  const persistence = request.persistence;

  if (!persistence) {
    return;
  }

  const { comparison } = persistence;

  if (isUnrecoverableSourceGap(persistence)) {
    findings.push({
      code: 'tasks.persistence-source-gap',
      severity: 'error',
      message:
        'Persistence validation found an unrecoverable artifact source gap for tasks.md.',
      path: request.path,
      metadata: {
        sourceOfTruth: comparison.sourceOfTruth,
        missingSources: comparison.missingSources.join(','),
        recoverable: comparison.recoverable,
      },
    });

    return;
  }

  if (comparison.status === 'diverged' && comparison.recoverable) {
    findings.push({
      code: 'tasks.persistence-hybrid-divergence',
      severity: 'warning',
      message:
        'Hybrid persistence sources diverged, but recovery remains possible in report-only mode.',
      path: request.path,
      metadata: {
        sourceOfTruth: comparison.sourceOfTruth,
        recoverable: comparison.recoverable,
      },
    });
  }

  if (comparison.status === 'single-source' && comparison.recoverable) {
    findings.push({
      code: 'tasks.persistence-repairable-source-gap',
      severity: 'warning',
      message:
        'Persistence validation recovered from a single artifact source; repair the missing store when convenient.',
      path: request.path,
      metadata: {
        sourceOfTruth: comparison.sourceOfTruth,
        missingSources: comparison.missingSources.join(','),
      },
    });
  }

  const contractDriftFinding = createContractDriftFinding(request, persistence);

  if (contractDriftFinding) {
    findings.push(contractDriftFinding);
  }
}

function isUnrecoverableSourceGap(
  persistence: ValidateTasksArtifactPersistence,
): boolean {
  const authoritativeSource = getSnapshotBySource(
    persistence.sources,
    persistence.comparison.sourceOfTruth,
  );

  return (
    !persistence.comparison.recoverable &&
    (persistence.comparison.sourceOfTruth === null ||
      authoritativeSource === null)
  );
}

function createContractDriftFinding(
  request: ValidateTasksArtifactRequest,
  persistence: ValidateTasksArtifactPersistence,
): ArtifactGovernanceFinding | null {
  const promptSnapshot = persistence.sources.prompt;
  const authoritativeSnapshot = getSnapshotBySource(
    persistence.sources,
    persistence.comparison.sourceOfTruth,
  );

  if (
    promptSnapshot === null ||
    authoritativeSnapshot === null ||
    authoritativeSnapshot.source === 'prompt' ||
    promptSnapshot.content === authoritativeSnapshot.content
  ) {
    return null;
  }

  const validatingAuthoritativeContent =
    request.content === authoritativeSnapshot.content;

  return {
    code: 'tasks.persistence-contract-drift',
    severity: validatingAuthoritativeContent ? 'info' : 'warning',
    message: validatingAuthoritativeContent
      ? 'Prompt context drifted from the authoritative persistence snapshot, but the validator is using the canonical artifact content.'
      : 'The validator is inspecting tasks content that drifts from the authoritative persistence snapshot.',
    path: request.path,
    metadata: {
      sourceOfTruth: authoritativeSnapshot.source,
      validatedAuthoritativeContent: validatingAuthoritativeContent,
    },
  };
}

function getSnapshotBySource(
  sources: ValidateTasksArtifactPersistence['sources'],
  source: ArtifactSnapshotSource | null,
): ArtifactSnapshot | null {
  switch (source) {
    case 'prompt':
      return sources.prompt;
    case 'thoth-mem':
      return sources.thothMem;
    case 'openspec':
      return sources.openspec;
    case null:
      return null;
  }
}

function isTopLevelTaskLine(line: string): boolean {
  return /^- /.test(line);
}

function collectVerificationLines(
  lines: readonly string[],
  startIndex: number,
): string[] {
  const block: string[] = [];

  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index] ?? '';

    if (line.startsWith('## ') || isTopLevelTaskLine(line)) {
      break;
    }

    if (line.trim().length > 0) {
      block.push(line.trim());
    }
  }

  return block;
}

function inspectVerificationBlock(lines: readonly string[]): {
  hasHeader: boolean;
  hasRun: boolean;
  hasExpected: boolean;
} {
  let hasHeader = false;
  let hasRun = false;
  let hasExpected = false;

  for (const line of lines) {
    if (VERIFICATION_HEADER.test(line)) {
      hasHeader = true;
      continue;
    }

    if (VERIFICATION_RUN.test(line)) {
      hasRun = true;
      continue;
    }

    if (VERIFICATION_EXPECTED.test(line)) {
      hasExpected = true;
    }
  }

  return {
    hasHeader,
    hasRun,
    hasExpected,
  };
}
